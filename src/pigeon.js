// Het vliegmodel. Dit is waar de hele game op staat of valt, dus de getallen
// hieronder zijn de belangrijkste regels in het project.
//
// De kernlus: snelheid geeft draagkracht, draagkracht houdt je in de lucht, maar
// nooit genoeg om te klimmen. Klimmen kan alleen door te klapwieken, en klapwieken
// kost uithoudingsvermogen. Zo wordt hoogtebeheer de vaardigheid, niet een knop.

import * as THREE from 'three';
import { C } from './palette.js';

export const FLIGHT = {
  STALL_SPEED: 3.5,
  CRUISE_SPEED: 9,
  MAX_SPEED: 17,
  DIVE_SPEED: 26,

  THRUST: 9,       // versnelling bij gas geven
  BRAKE: 14,
  DIVE_ACCEL: 16,
  DRAG: 1.6,       // hoe hard je terugvalt naar kruissnelheid

  TURN_RATE: 3.4,        // rad/s bij kruissnelheid (~195 graden/s)
  TURN_AT_SPEED: 0.25,   // stuurverlies op topsnelheid. Stond op 0,55, waardoor je
                         // vol gas nog maar 64 graden/s haalde: 5,6 seconde voor een
                         // rondje. En vol gas is precies hoe je de hele tijd vliegt.

  GRAVITY: -14,
  LIFT_PER_SPEED: 1.5,   // draagkracht is evenredig met snelheid...
  LIFT_CAP: 12.6,        // ...maar haalt het nooit helemaal bij de zwaartekracht,
                         //    dus je zakt altijd een beetje. Dat is de klok die tikt.

  // Luchtweerstand op de verticale snelheid. Dit is de belangrijkste toevoeging:
  // zonder dit is zweven vrije val zonder eindsnelheid. Mét dit krijgt elke
  // vliegsnelheid vanzelf zijn eigen daalsnelheid — kruisen zakt 4 m/s, te langzaam
  // vliegen zakt 25 m/s. Het model straft je dus precies zoveel als je verdient.
  VERTICAL_DRAG: 0.35,
  VY_MIN: -30,

  FLAP_IMPULSE: 7.0,
  FLAP_VY_MAX: 8.5,      // een klap boven op een klap stapelt niet door
  FLAP_COST: 13,
  FLAP_COOLDOWN: 0.22,   // ingedrukt houden geeft ritme, geen oneindig zweven.
                         // Komt neer op ~4,5 slagen/s; een echte duif haalt er 5,5.
  FLAP_COOLDOWN_BOOST: 0.10,
  FLAP_ANIM: 0.30,

  STAMINA_MAX: 100,
  STAMINA_REGEN: 24,
  STAMINA_REGEN_GROUNDED: 55, // even landen is de manier om bij te tanken
  STAMINA_GRACE: 0.15,

  GROUND_Y: 0.5,
  CEILING_Y: 70,         // rotsduiven blijven in de praktijk onder de 70 meter

  TAKEOFF_IMPULSE: 11,   // wegspringen van een randje is explosiever dan een klap
  CLAP_ANIM: 0.34,

  RADIUS: 0.45,
  BUMP_COOLDOWN: 0.5,    // minimale tijd tussen twee botsingsreacties

  // Effect van een boterham.
  FED_IMPULSE_FACTOR: 1.35,
  FED_COST_FACTOR: 0.35,
  FED_REGEN_FACTOR: 2.2,
};

// Je begint hoog en op snelheid. De eerste tien seconden moeten vliegen zijn,
// niet een val tussen twee gevels.
export const START = { y: 26, speed: 12 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class Pigeon {
  constructor() {
    this.pos = new THREE.Vector3(0, START.y, 0);
    this.yaw = 0;
    this.speed = START.speed;
    this.vy = 0;
    this.stamina = FLIGHT.STAMINA_MAX;

    this.flapCooldown = 0;
    this.flapAnim = 0;      // 1 naar 0 over FLAP_ANIM, stuurt de vleugelslag aan
    this.sinceFlap = 99;
    this.grounded = false;
    this.diving = false;

    this.bank = 0;   // rol, puur visueel maar essentieel voor het gevoel
    this.pitch = 0;

    // Duiven zitten liever dan dat ze vliegen. Je begint op een randje.
    this.perched = false;
    this.perchPos = new THREE.Vector3();
    this.clapAnim = 0;
    this.boost = 0;        // seconden 'cheeky pigeon time' die nog resteren
    this.fed = 0;          // seconden na een boterham: hardere slag, goedkopere slag
    this.bumpCooldown = 0;
    this.atEdge = false;
    this.homeTarget = null;   // gezet als hij zelf naar huis vliegt

    this.justFlapped = false;  // fx leest dit uit voor veertjes
    this.justLanded = false;
    this.justClapped = false;  // opstijgen met een vleugelklap
    this.bumped = false;

    this.mesh = buildPigeonMesh();
    this.wingL = this.mesh.getObjectByName('wingL');
    this.wingR = this.mesh.getObjectByName('wingR');
    this.box = new THREE.Box3();
    this.syncMesh();
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Vanaf nu vliegt hij zelf terug naar `pos` en gaat daar zitten. */
  flyHome(pos) {
    if (this.perched) return;
    this.homeTarget = pos.clone();
  }

  /** Zet de duif op een randje. Hij blijft daar tot je klapwiekt. */
  perchOn(pos) {
    this.perched = true;
    this.perchPos.copy(pos);
    this.pos.copy(pos);
    this.vy = 0;
    this.speed = 0;
    this.bank = 0;
    this.pitch = 0;
    this.stamina = FLIGHT.STAMINA_MAX;
    this.syncMesh();
  }

  /** Eén simulatiestap met vaste dt. */
  update(dt, input, city) {
    this.justFlapped = false;
    this.justLanded = false;
    this.justClapped = false;
    this.bumped = false;

    const F = FLIGHT;
    this.boost = Math.max(0, this.boost - dt);
    this.fed = Math.max(0, this.fed - dt);
    this.clapAnim = Math.max(0, this.clapAnim - dt / F.CLAP_ANIM);

    if (this.perched) {
      this._perchedUpdate(dt, input);
      return;
    }

    // Op de terugweg neemt hij het stuur over.
    if (this.homeTarget) input = this._autopilot(dt);

    const wasDiving = this.diving;
    this.diving = input.held('dive') && !this.grounded;

    // --- draaien ---------------------------------------------------------
    const over = (this.speed - F.CRUISE_SPEED) / (F.MAX_SPEED - F.CRUISE_SPEED);
    const speedFactor = 1 - F.TURN_AT_SPEED * clamp01(over);
    const turnInput = input.turn;
    this.yaw -= turnInput * F.TURN_RATE * speedFactor * dt;

    // Rol volgt de bocht, met wat traagheid zodat het niet schokt.
    // Let op het teken: het model kijkt naar +Z, dus zijn rechterkant ligt op lokaal -X.
    // Een positieve rotatie om lokaal Z laat -X zakken, en dat is precies de vleugel
    // die in een rechterbocht omlaag moet. Dit stond omgekeerd.
    const bankTarget = turnInput * 0.62 * speedFactor;
    this.bank += (bankTarget - this.bank) * Math.min(1, dt * 7);

    // --- snelheid --------------------------------------------------------
    const throttle = input.throttle;
    if (this.diving) {
      this.speed += F.DIVE_ACCEL * dt;
    } else if (throttle > 0) {
      this.speed += F.THRUST * dt;
    } else if (throttle < 0) {
      this.speed -= F.BRAKE * dt;
    } else {
      // zonder input zak je terug naar kruissnelheid, van beide kanten
      this.speed += (F.CRUISE_SPEED - this.speed) * F.DRAG * dt;
    }
    const ceiling = this.diving ? F.DIVE_SPEED : F.MAX_SPEED;
    this.speed = clamp(this.speed, this.grounded ? 0 : F.STALL_SPEED * 0.6, ceiling);

    // --- verticaal -------------------------------------------------------
    // Optrekken uit een duik zet overtollige snelheid om in hoogte. Dat maakt
    // duikbombarderen belonend in plaats van bestraffend.
    if (wasDiving && !this.diving) {
      const excess = Math.max(0, this.speed - F.CRUISE_SPEED);
      // De duik wordt actief afgevangen: eerst de val eruit, dan de snelheid
      // omzetten in hoogte. Zonder die eerste stap eet de zwaartekracht de winst op
      // en voelt optrekken als niets.
      this.vy = Math.max(this.vy, -4) + excess * 0.55;
      this.speed -= excess * 0.45;
    }

    const gravity = F.GRAVITY * (this.diving ? 1.7 : 1);
    const lift = Math.min(this.speed * F.LIFT_PER_SPEED, F.LIFT_CAP) * (this.diving ? 0.3 : 1);
    this.vy += (gravity + lift) * dt;
    this.vy *= 1 - Math.min(1, F.VERTICAL_DRAG * dt);
    this.vy = Math.max(this.vy, F.VY_MIN);

    // --- klapwieken ------------------------------------------------------
    this.flapCooldown = Math.max(0, this.flapCooldown - dt);
    this.sinceFlap += dt;
    const boosted = this.boost > 0;
    const fed = this.fed > 0;
    // Een volle krop geeft merkbaar meer vliegkracht: hardere slag, hogere top,
    // en hij kost je bijna niets.
    const cost = boosted ? 0 : F.FLAP_COST * (fed ? F.FED_COST_FACTOR : 1);
    const impulse = F.FLAP_IMPULSE * (fed ? F.FED_IMPULSE_FACTOR : 1);
    const vyCap = F.FLAP_VY_MAX * (fed ? F.FED_IMPULSE_FACTOR : 1);
    if (input.held('flap') && this.flapCooldown === 0 && this.stamina >= cost) {
      // Afgetopt: doorklappen houdt je stijgend, maar maakt geen raket van je.
      this.vy = Math.min(Math.max(this.vy, -2.5) + impulse, vyCap);
      this.stamina -= cost;
      this.flapCooldown = boosted ? F.FLAP_COOLDOWN_BOOST : F.FLAP_COOLDOWN;
      this.flapAnim = 1;
      this.sinceFlap = 0;
      this.grounded = false;
      this.justFlapped = true;
      this.speed = Math.max(this.speed, F.STALL_SPEED * 1.4); // een klap geeft ook wat vaart
    }

    if (boosted) this.stamina = F.STAMINA_MAX;
    const regen = (this.grounded ? F.STAMINA_REGEN_GROUNDED : F.STAMINA_REGEN)
      * (fed ? F.FED_REGEN_FACTOR : 1);
    if (this.sinceFlap > F.STAMINA_GRACE) {
      this.stamina = Math.min(F.STAMINA_MAX, this.stamina + regen * dt);
    }
    this.flapAnim = Math.max(0, this.flapAnim - dt / F.FLAP_ANIM);

    // --- verplaatsen -----------------------------------------------------
    const fwd = this.forward;
    const prevY = this.pos.y;
    this.pos.addScaledVector(fwd, this.speed * dt);
    this.pos.y += this.vy * dt;

    // Gebouwen. Eerder werd je hier elk frame opnieuw naar buiten geduwd terwijl je
    // ertegenaan bleef vliegen: dat gaf per frame een schok, een geluid en een wolk
    // veertjes, en dat was de storing. Nu glijd je langs de gevel weg en telt de
    // botsing maar één keer.
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    if (city && city.resolveCollision(this.pos, F.RADIUS, BUMP_NORMAL)) {
      if (BUMP_NORMAL.y === 0) {
        // Zijdelingse treffer: draai mee met de muur in plaats van erop te blijven
        // drukken, zodat je er langs schuift.
        const fwdNow = this.forward;
        const into = fwdNow.x * BUMP_NORMAL.x + fwdNow.z * BUMP_NORMAL.z;
        if (into < 0) {
          // Component loodrecht op de gevel eruit halen: wat overblijft is de
          // richting langs de muur.
          const slideX = fwdNow.x - BUMP_NORMAL.x * into;
          const slideZ = fwdNow.z - BUMP_NORMAL.z * into;
          if (Math.abs(slideX) + Math.abs(slideZ) > 0.05) {
            this.yaw = Math.atan2(slideX, slideZ);
          }
          this.speed *= 0.7;
        }
        if (this.bumpCooldown === 0) {
          this.bumped = true;
          this.bumpCooldown = F.BUMP_COOLDOWN;
        }
      }
    }

    // Grond, stoep of dak. Een duif strijkt net zo goed neer op een dakrand als op
    // straat, en hoog zitten is bovendien de betere uitvalsbasis om te bombarderen.
    const floorY = city
      ? Math.max(F.GROUND_Y, city.groundHeightAt(this.pos.x, this.pos.z) + F.GROUND_Y)
      : F.GROUND_Y;
    if (this.pos.y <= floorY) {
      this.pos.y = floorY;
      if (!this.grounded && prevY > floorY) this.justLanded = true;
      this.vy = 0;
      this.grounded = true;
      this.speed *= 1 - Math.min(1, dt * 3.5); // over straat scharrelen gaat traag
    } else if (this.pos.y > F.CEILING_Y) {
      this.pos.y = F.CEILING_Y;
      this.vy = Math.min(this.vy, 0);
      this.grounded = false;
    } else {
      this.grounded = false;
    }

    // Stadsgrens. Per as afgeknepen, niet op afstand tot het midden: die grens was
    // een cirkel terwijl de grond een vierkant is, dus richting een hoek stond je
    // al achtendertig meter voor de zichtbare rand tegen een onzichtbare muur.
    const limit = city ? city.bounds : 200;
    this.atEdge = false;
    if (Math.abs(this.pos.x) > limit) {
      this.pos.x = Math.sign(this.pos.x) * limit;
      this.speed *= 0.9;
      this.atEdge = true;
    }
    if (Math.abs(this.pos.z) > limit) {
      this.pos.z = Math.sign(this.pos.z) * limit;
      this.speed *= 0.9;
      this.atEdge = true;
    }

    // --- houding ---------------------------------------------------------
    // Neus omlaag als je zakt, omhoog als je stijgt. Puur visueel, maar zonder dit
    // ziet het eruit alsof er een doos door de lucht schuift.
    const pitchTarget = this.diving ? -0.75 : clamp(this.vy * 0.045, -0.5, 0.45);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 8);

    this.syncMesh();
  }

  /**
   * Stuurt zichzelf naar het monument en strijkt daar neer.
   *
   * Geeft een invoerobject terug met dezelfde vorm als de echte besturing, zodat de
   * rest van het vliegmodel niet hoeft te weten of er een speler of een autopiloot
   * aan de knoppen zit.
   */
  _autopilot(dt) {
    const t = this.homeTarget;
    const dx = t.x - this.pos.x;
    const dz = t.z - this.pos.z;
    const afstand = Math.hypot(dx, dz);

    if (afstand < 1.6 && Math.abs(t.y - this.pos.y) < 2.5) {
      this.homeTarget = null;
      this.perchOn(t);
      return AUTO_NONE;
    }

    // Naar de juiste koers draaien, langs de korte kant.
    const doelYaw = Math.atan2(dx, dz);
    let verschil = doelYaw - this.yaw;
    while (verschil > Math.PI) verschil -= Math.PI * 2;
    while (verschil < -Math.PI) verschil += Math.PI * 2;
    // De stuurinvoer is omgekeerd aan de gierrichting, vandaar het minteken.
    AUTO.turn = Math.max(-1, Math.min(1, -verschil * 2.2));

    // Vaart houden zolang hij er nog niet is, en afremmen op de laatste meters.
    AUTO.throttle = afstand > 12 ? 1 : -1;

    // Klapwieken zodra hij onder zijn doelhoogte zakt.
    const gewenstY = t.y + Math.min(10, afstand * 0.45);
    AUTO.flap = this.pos.y < gewenstY;
    return AUTO;
  }

  /**
   * Zitten op een randje. Geen physics, alleen wachten en rondkijken.
   * Klapwieken laat je opstijgen met een vleugelklap: bij echte duiven slaan de
   * vleugels bij het opvliegen boven de rug tegen elkaar, en dat geluid is het
   * signaal waarop de rest van de zwerm ook opvliegt.
   */
  _perchedUpdate(dt, input) {
    this.pos.copy(this.perchPos);
    this.stamina = FLIGHT.STAMINA_MAX;

    if (input.held('flap')) {
      this.perched = false;
      this.vy = FLIGHT.TAKEOFF_IMPULSE;
      this.speed = FLIGHT.CRUISE_SPEED;
      this.flapCooldown = FLIGHT.FLAP_COOLDOWN;
      this.clapAnim = 1;
      this.justClapped = true;
      this.justFlapped = true;
      this.grounded = false;
    }
    this.syncMesh();
  }

  syncMesh() {
    const m = this.mesh;
    m.position.copy(this.pos);
    m.rotation.order = 'YXZ'; // gieren om de wereld-as, dan stampen, dan rollen
    m.rotation.set(this.pitch, this.yaw, this.bank);

    // Vleugelslag: snelle neerslag, tragere opgaande beweging.
    let angle;
    if (this.clapAnim > 0) {
      // De klap zelf: de vleugels schieten omhoog tot ze elkaar boven de rug raken.
      angle = -2.0 + (1 - this.clapAnim) * 1.4;
    } else if (this.perched) {
      angle = 0.2;   // opgevouwen tegen het lijf
    } else if (this.flapAnim > 0) {
      const t = 1 - this.flapAnim;
      angle = Math.sin(t * Math.PI) * -1.5 + 0.35;
    } else if (this.diving) {
      angle = 0.9; // ingetrokken vleugels
    } else {
      angle = 0.12 + Math.sin(performance.now() * 0.002) * 0.05; // rustig zweven
    }
    this.wingL.rotation.z = angle;
    this.wingR.rotation.z = -angle;

    this.box.setFromCenterAndSize(this.pos, PIGEON_HITBOX);
  }

  reset() {
    this.pos.set(0, START.y, 0);
    this.yaw = 0;
    this.speed = START.speed;
    this.vy = 0;
    this.stamina = FLIGHT.STAMINA_MAX;
    this.flapCooldown = 0;
    this.flapAnim = 0;
    this.bank = 0;
    this.pitch = 0;
    this.grounded = false;
    this.fed = 0;
    this.homeTarget = null;
    this.syncMesh();
  }
}

const PIGEON_HITBOX = new THREE.Vector3(1.2, 0.8, 1.2);
const BUMP_NORMAL = new THREE.Vector3();

// Invoer zoals de autopiloot hem aanlevert. Dezelfde vorm als de echte besturing.
const AUTO = {
  turn: 0,
  throttle: 0,
  flap: false,
  held(a) { return a === 'flap' ? this.flap : false; },
  hit() { return false; },
};
const AUTO_NONE = {
  turn: 0,
  throttle: 0,
  held() { return false; },
  hit() { return false; },
};

function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
}

/**
 * De duif is opgebouwd uit blokken in palet-kleuren. Geen texturen:
 * op deze resolutie leest vorm beter dan detail. Het model kijkt naar +Z.
 */
function buildPigeonMesh() {
  const g = new THREE.Group();

  const body = box(0.55, 0.5, 0.95, C.steel);
  body.castShadow = true;
  g.add(body);

  const breast = box(0.5, 0.32, 0.3, C.mist);
  breast.position.set(0, -0.06, 0.42);
  g.add(breast);

  // Iriserende nek. Bij een rotsduif loopt die glans van geelachtig via groen naar
  // roodpaars, dus drie banden in plaats van een vlakke kleur.
  const neck = box(0.4, 0.16, 0.22, C.violet);
  neck.position.set(0, 0.22, 0.5);
  g.add(neck);
  const sheenGreen = box(0.42, 0.1, 0.21, C.leaf);
  sheenGreen.position.set(0, 0.12, 0.505);
  g.add(sheenGreen);
  const sheenGold = box(0.42, 0.08, 0.2, C.gold);
  sheenGold.position.set(0, 0.04, 0.51);
  g.add(sheenGold);

  const head = box(0.38, 0.36, 0.36, C.night);
  head.position.set(0, 0.32, 0.66);
  head.castShadow = true;
  g.add(head);

  const beak = box(0.12, 0.1, 0.24, C.clay);
  beak.position.set(0, 0.26, 0.88);
  g.add(beak);

  for (const side of [-1, 1]) {
    const eye = box(0.08, 0.09, 0.08, C.gold);
    eye.position.set(side * 0.17, 0.38, 0.76);
    g.add(eye);
    const pupil = box(0.05, 0.05, 0.04, C.ink);
    pupil.position.set(side * 0.19, 0.38, 0.79);
    g.add(pupil);
  }

  // Vleugels draaien om hun aanhechting, niet om hun midden. Vandaar een pivot-group.
  const wingSides = [['wingL', -1], ['wingR', 1]];
  for (const [name, side] of wingSides) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(side * 0.26, 0.14, 0.05);
    const wing = box(0.62, 0.09, 0.8, C.slate);
    wing.position.set(side * 0.32, 0, 0);
    wing.castShadow = true;
    pivot.add(wing);
    const tip = box(0.3, 0.07, 0.5, C.night);
    tip.position.set(side * 0.66, 0, -0.14);
    pivot.add(tip);
    g.add(pivot);
  }

  const tail = box(0.42, 0.09, 0.5, C.slate);
  tail.position.set(0, 0.06, -0.66);
  g.add(tail);
  const tailTip = box(0.44, 0.08, 0.16, C.night);
  tailTip.position.set(0, 0.06, -0.88);
  g.add(tailTip);

  for (const side of [-1, 1]) {
    const foot = box(0.09, 0.12, 0.22, C.clay);
    foot.position.set(side * 0.15, -0.28, 0.1);
    g.add(foot);
  }

  return g;
}
