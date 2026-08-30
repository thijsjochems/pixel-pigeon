// Alles waar je op kunt mikken, plus de kruimels waarmee je bijlaadt.
// Elk doel houdt zijn eigen hitbox bij; poop.js vraagt die op.

import * as THREE from 'three';
import { C, CAR_COLORS, SHIRT_COLORS } from './palette.js';
import { rng } from './textures.js';
import { CURB_H, LANE_OFFSET, TRAFFIC_ROADS, CITY_EDGE } from './city.js';


export const AMMO_MAX = 6;

// Hoe ruim een spat telt, per soort doel. Een voetganger is één bij één meter: zonder
// een royale straal is dat geen mikken meer. Een auto is uit zichzelf al groot.
export const SPLASH = { pedestrian: 2.2, pram: 2.4, car: 1.4 };

// En daarbuiten nog een schampzone. Een poepje net naast levert een kwart van de
// punten op: je hebt tenslotte wel iemand laten schrikken.
export const GRAZE_EXTRA = 1.6;
export const GRAZE_SCORE = 0.25;

// Een boterham is de grote broer van de kruimel: zeldzamer, ligt op straat, en levert
// een korte periode op waarin je harder klapwiekt, minder uithoudingsvermogen kwijt
// bent en sneller nieuwe munitie aanmaakt.
export const FED_TIME = 9;
const SANDWICH_RESPAWN = 20;
const SANDWICH_PICKUP_R = 2.2;

// Kans dat een auto op een kruising afslaat. Hierdoor blijft het verkeer binnen het
// raster circuleren in plaats van rechtdoor de stad uit te rijden.
const TURN_CHANCE = 0.5;

// Afstand waarop een auto afremt voor iets dat voor hem uit staat. Geldt ook op
// kruisingen, zodat twee auto's niet meer dwars door elkaar heen rijden.
const LOOKAHEAD = 8;
const LOOKAHEAD_SQ = LOOKAHEAD * LOOKAHEAD;

class Target {
  constructor(mesh, points, size, timeBonus, splash) {
    this.mesh = mesh;
    this.points = points;
    this.size = size;
    this.timeBonus = timeBonus;   // seconden die een treffer aan de klok toevoegt
    this.splash = splash;         // hoe ver naast het doel een spat nog telt
    this.box = new THREE.Box3();
    this.hits = 0;
    this.cooldown = 0;   // kort onkwetsbaar na een treffer, anders scoort één poep dubbel
    this.reaction = 0;   // loopt af, stuurt de schrikanimatie aan
    // Huidige snelheid in de wereld. De richtring gebruikt dit om te bepalen waar
    // dit doel straks staat, want daar komt de poep aan - niet waar het nu staat.
    this.vel = new THREE.Vector3();
    this.updateBox();
  }

  updateBox() {
    this.box.setFromCenterAndSize(this.mesh.position, this.size);
  }

  get hittable() {
    return this.cooldown <= 0;
  }

  /** Waar staat dit doel over `t` seconden? */
  futurePosition(t, out) {
    return out.copy(this.mesh.position).addScaledVector(this.vel, t);
  }

  /**
   * Is de baan van dit doel de komende `t` seconden te voorspellen?
   *
   * Zo niet, dan mag de richtring niet rood worden. Een belofte die het spel niet
   * kan waarmaken is erger dan geen belofte.
   */
  predictable() {
    return true;
  }

  onHit() {
    this.hits++;
    this.cooldown = 0.6;
    this.reaction = 1;
  }
}

export class Car extends Target {
  constructor(lane, r) {
    const color = CAR_COLORS[Math.floor(r() * CAR_COLORS.length)];
    const mesh = buildCar(color);
    super(mesh, 25, new THREE.Vector3(2.2, 1.6, 4.4), 1.4, SPLASH.car);

    // De auto krijgt een eigen kopie van de rijstrook. De lijst uit city.js wordt
    // door meerdere auto's gedeeld, en die mag dus nooit aangepast worden.
    this.axis = lane.axis;
    this.offset = lane.offset;
    this.dir = lane.dir;

    this.speed = 7 + r() * 6;
    // Binnen het kruisingenraster beginnen: wie verder weg start heeft geen kruising
    // meer voor zich en rijdt regelrecht de stadsrand op.
    const buitenste = TRAFFIC_ROADS[TRAFFIC_ROADS.length - 1];
    this.t = (r() * 2 - 1) * buitenste;
    if (!heeftKruisingVooruit(this.t, this.dir)) this.dir = -this.dir;
    this.alarm = 0;
    this.blocked = false;
    this.gapAhead = Infinity;
    this.closingSpeed = 0;
    this.wasMoving = true;
    this.baseColor = color;
    this.bodyMat = mesh.getObjectByName('body').material;
    this.place();
    // Zonder dit blijft de hitbox tot de eerste update op de oorsprong staan, want
    // Target roept updateBox() aan voordat deze constructor place() heeft gedaan.
    this.updateBox();
  }

  place() {
    if (this.axis === 'x') {
      this.mesh.position.set(this.t, 0.7, this.offset);
      this.mesh.rotation.y = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      this.mesh.position.set(this.offset, 0.7, this.t);
      this.mesh.rotation.y = this.dir > 0 ? 0 : Math.PI;
    }
  }

  /**
   * Slaat af op de kruising met de dwarsweg op `center`.
   *
   * De dwarspositie van nu wordt de positie langs de nieuwe weg, en de nieuwe
   * rijstrook ligt weer rechts van de nieuwe rijrichting. Zo komt de auto netjes
   * uit de bocht in plaats van door de tegenliggers heen.
   */
  _turn(center, naarBinnen = false) {
    const t = this.offset;
    let dir = naarBinnen ? (t > 0 ? -1 : 1) : (Math.random() < 0.5 ? 1 : -1);
    // Er moet altijd een kruising vóór hem liggen, anders rijdt hij de rest van de
    // straat uit tot aan de stadsrand en klapt hij daar om. Ligt er niets meer in
    // deze richting, dan draait hij de andere kant op.
    if (!heeftKruisingVooruit(t, dir)) dir = -dir;
    if (this.axis === 'x') {
      this.axis = 'z';
      this.offset = center + LANE_OFFSET * dir;
    } else {
      this.axis = 'x';
      this.offset = center - LANE_OFFSET * dir;
    }
    this.dir = dir;
    this.t = t;
  }

  update(dt, intensity = 0, others = null) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    // Na een treffer staat de auto stil te alarmeren. Dat is de beloning:
    // je ziet dat je iets hebt aangericht.
    if (this.alarm > 0) {
      this.alarm -= dt;
      this.mesh.position.y = 0.7 + Math.abs(Math.sin(this.alarm * 26)) * 0.09;
      this.bodyMat.color.set(Math.sin(this.alarm * 22) > 0 ? C.gold : this.baseColor);
      if (this.alarm <= 0) {
        this.mesh.position.y = 0.7;
        this.bodyMat.color.set(this.baseColor);
      }
      this.vel.set(0, 0, 0);
    } else {
      // Het verkeer trekt aan naarmate de ronde vordert. Zonder die opbouw
      // voelt minuut twee precies als minuut een.
      const prev = this.t;
      // Remmen voor wat er voor je uit staat. Dit hoeft geen echte verkeerssimulatie
      // te zijn; het moet alleen voorkomen dat auto's zichtbaar door elkaar rijden.
      const blocked = others ? this._blockedBy(others) : false;
      this.blocked = blocked;
      const v = this.speed * (1 + intensity * 0.9) * (blocked ? 0 : 1);
      this.t += v * this.dir * dt;

      // Kruising gepasseerd? Dan mag hij afslaan.
      for (const c of TRAFFIC_ROADS) {
        if ((prev < c && this.t >= c) || (prev > c && this.t <= c)) {
          // Op de laatste kruising vóór de stadsrand slaat hij altijd af. Anders
          // reed hij het lege stuk in en klapte hij aan de overkant weer tevoorschijn,
          // en dat zag je gebeuren.
          const laatste = this.dir > 0
            ? !TRAFFIC_ROADS.some((o) => o > c + 0.1)
            : !TRAFFIC_ROADS.some((o) => o < c - 0.1);
          if (laatste) this._turn(c, true);
          else if (Math.random() < TURN_CHANCE) this._turn(c);
          break;
        }
      }

      // Vangnet dat in de praktijk niet meer aan bod hoort te komen, nu er op de
      // laatste kruising altijd wordt afgeslagen.
      if (this.t > CITY_EDGE) this.t = -CITY_EDGE;
      else if (this.t < -CITY_EDGE) this.t = CITY_EDGE;

      this.place();
      if (this.axis === 'x') this.vel.set(v * this.dir, 0, 0);
      else this.vel.set(0, 0, v * this.dir);
    }
    this.updateBox();
  }

  predictable(t) {
    // Wie voor een ander staat te wachten kan elk moment weer optrekken.
    if (this.blocked) return false;
    // En wie het gat binnen de valtijd dichtrijdt, remt straks af.
    if (this.closingSpeed > 0 && this.gapAhead - this.closingSpeed * t < LOOKAHEAD) {
      return false;
    }
    // Op een kruising gooit hij een muntje op om af te slaan. Dat kan de
    // voorspelling per definitie niet weten, dus dan geen lock.
    const v = this.vel.x !== 0 ? Math.abs(this.vel.x) : Math.abs(this.vel.z);
    if (v < 0.01) return true;      // hij staat te alarmeren en blijft dus staan
    const end = this.t + v * this.dir * t;
    for (const c of TRAFFIC_ROADS) {
      if ((this.t < c && end >= c) || (this.t > c && end <= c)) return false;
    }
    return true;
  }

  /**
   * Staat er iets vlak voor me? Kijkt naar alle andere auto's, niet alleen naar
   * die op dezelfde rijstrook, want juist op kruisingen ging het mis.
   */
  _blockedBy(others) {
    const me = this.mesh.position;
    const fx = this.axis === 'x' ? this.dir : 0;
    const fz = this.axis === 'z' ? this.dir : 0;
    // Ook de afstand tot de eerstvolgende auto vóór me bijhouden. De richtring
    // gebruikt die om te zien of ik straks ga afremmen, en dat is precies het
    // soort verrassing waar een lock niet tegen kan.
    this.gapAhead = Infinity;
    this.closingSpeed = 0;
    let blocked = false;
    const myV = this.vel.x * fx + this.vel.z * fz;
    for (const o of others) {
      if (o === this || o.axis === undefined) continue;
      const dx = o.mesh.position.x - me.x;
      const dz = o.mesh.position.z - me.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < 0.0001) continue;
      // Alleen wat vóór me ligt telt; een auto achter me mag ik negeren.
      const vooruit = dx * fx + dz * fz;
      if (vooruit <= 0) continue;
      // En hij moet ongeveer in mijn pad liggen, niet een straat verderop.
      const zijwaarts = Math.abs(fx !== 0 ? dz : dx);
      if (zijwaarts >= 3) continue;
      if (vooruit < this.gapAhead) {
        this.gapAhead = vooruit;
        // Alleen het snelheidsverschil telt. De auto voor me rijdt meestal even
        // hard, en dan loopt het gat helemaal niet dicht.
        this.closingSpeed = myV - (o.vel.x * fx + o.vel.z * fz);
      }
      if (distSq <= LOOKAHEAD_SQ) blocked = true;
    }
    return blocked;
  }

  onHit() {
    // Vastleggen vóór het alarm aangaat: daarna is niet meer te zien of deze auto
    // reed of al stilstond, en dat bepaalt de bonus.
    this.wasMoving = this.alarm <= 0;
    super.onHit();
    this.alarm = 2.2;
  }
}

export class Pedestrian extends Target {
  constructor(block, r) {
    const shirt = SHIRT_COLORS[Math.floor(r() * SHIRT_COLORS.length)];
    // Een op de vier duwt een kinderwagen. Die loopt langzamer, is een breder doel
    // en telt flink zwaarder: het is de meest bevredigende treffer in het spel.
    const pram = r() < 0.25;
    const mesh = buildPedestrian(shirt, pram);
    super(
      mesh,
      pram ? 120 : 50,
      new THREE.Vector3(pram ? 1.4 : 1.0, 2.0, pram ? 2.2 : 1.0),
      pram ? 2.6 : 1.8,
      pram ? SPLASH.pram : SPLASH.pedestrian
    );
    this.pram = pram;
    this.block = block;
    this.speed = (2.2 + r() * 1.4) * (pram ? 0.7 : 1);
    this.baseSpeed = this.speed;
    this.leg = r() * 10;
    this.corner = Math.floor(r() * 4);
    this.progress = r();
    this.panic = 0;
    this.legL = mesh.getObjectByName('legL');
    this.legR = mesh.getObjectByName('legR');
    this.armL = mesh.getObjectByName('armL');
    this.armR = mesh.getObjectByName('armR');
    this.place();
    this.updateBox();   // idem: anders staat de hitbox nog op de oorsprong
  }

  /** Loopt het vierkant om zijn blok rond. */
  place() {
    const { center, half } = this.block;
    const p = this.progress;
    const c = this.corner;
    let x = 0;
    let z = 0;
    let facing = 0;
    if (c === 0) { x = -half + p * 2 * half; z = -half; facing = Math.PI / 2; }
    else if (c === 1) { x = half; z = -half + p * 2 * half; facing = 0; }
    else if (c === 2) { x = half - p * 2 * half; z = half; facing = -Math.PI / 2; }
    else { x = -half; z = half - p * 2 * half; facing = Math.PI; }
    this.mesh.position.set(center.x + x, CURB_H, center.z + z);
    this.mesh.rotation.y = facing;
  }

  update(dt, intensity = 0) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.reaction = Math.max(0, this.reaction - dt);
    const rush = 1 + intensity * 0.5;

    if (this.panic > 0) {
      this.panic -= dt;
      this.speed = this.baseSpeed * 3.2 * rush;
      // armen in de lucht — de reactie moet van boven af leesbaar zijn
      const wave = Math.sin(this.leg * 6) * 0.9;
      this.armL.rotation.x = -2.4 + wave;
      this.armR.rotation.x = -2.4 - wave;
    } else {
      this.speed = this.baseSpeed * rush;
      this.armL.rotation.x = Math.sin(this.leg) * 0.5;
      this.armR.rotation.x = -Math.sin(this.leg) * 0.5;
    }

    const { half } = this.block;
    this.progress += (this.speed * dt) / (2 * half);
    while (this.progress >= 1) {
      this.progress -= 1;
      this.corner = (this.corner + 1) % 4;
    }
    this.leg += dt * this.speed * 3;
    this.legL.rotation.x = Math.sin(this.leg) * 0.7;
    this.legR.rotation.x = -Math.sin(this.leg) * 0.7;

    const before = this.mesh.position.clone();
    this.place();
    this.vel.copy(this.mesh.position).sub(before).divideScalar(Math.max(dt, 1e-6));
    this.updateBox();
  }

  predictable(t) {
    // Om de hoek verandert zijn looprichting volledig.
    const { half } = this.block;
    return this.progress + (this.speed * t) / (2 * half) < 1;
  }

  onHit() {
    super.onHit();
    this.panic = 3.5;
  }
}

export class Crumb {
  constructor(pos) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.22, 0.3),
      new THREE.MeshBasicMaterial({ color: C.gold })
    );
    this.mesh.position.copy(pos).setY(pos.y + 0.35);
    this.baseY = this.mesh.position.y;
    this.phase = Math.random() * Math.PI * 2;
    this.taken = false;
    this.respawn = 0;
  }

  update(dt, t) {
    if (this.taken) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.taken = false;
        this.mesh.visible = true;
      }
      return;
    }
    // Dobberen en draaien zodat een kruimel opvalt tussen het straatvuil.
    this.mesh.position.y = this.baseY + Math.sin(t * 3 + this.phase) * 0.14;
    this.mesh.rotation.y = t * 1.8 + this.phase;
  }

  take() {
    this.taken = true;
    this.mesh.visible = false;
    this.respawn = 6;
  }
}

/** Een boterham op straat. Groter dan een kruimel, en veel meer waard. */
export class Sandwich {
  constructor(pos) {
    this.group = new THREE.Group();

    const onder = part(0.62, 0.09, 0.62, C.clay);
    onder.position.y = -0.06;
    this.group.add(onder);

    const beleg = part(0.58, 0.06, 0.58, C.leaf);
    this.group.add(beleg);

    const boven = part(0.62, 0.09, 0.62, C.gold);
    boven.position.y = 0.07;
    this.group.add(boven);

    // Korstje, zodat het van bovenaf als brood leest en niet als een blokje kaas.
    const korst = part(0.66, 0.04, 0.66, C.oxblood);
    korst.position.y = 0.13;
    this.group.add(korst);

    this.group.position.copy(pos).setY(pos.y + 0.45);
    this.baseY = this.group.position.y;
    this.phase = Math.random() * Math.PI * 2;
    this.taken = false;
    this.respawn = 0;
  }

  get position() {
    return this.group.position;
  }

  update(dt, t) {
    if (this.taken) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.taken = false;
        this.group.visible = true;
      }
      return;
    }
    this.group.position.y = this.baseY + Math.sin(t * 2.2 + this.phase) * 0.18;
    this.group.rotation.y = t * 0.9 + this.phase;
  }

  take() {
    this.taken = true;
    this.group.visible = false;
    this.respawn = SANDWICH_RESPAWN;
  }
}

export class TargetManager {
  constructor(city, seed = 99) {
    this.group = new THREE.Group();
    this.crumbGroup = new THREE.Group();
    this.targets = [];
    this.crumbs = [];
    this.sandwiches = [];
    this.time = 0;
    this._future = new THREE.Vector3();

    const r = rng(seed);

    // Rijdend verkeer: niet elke rijstrook vullen, anders is het een file
    // in plaats van een stad. De kans ligt hoger dan eerst omdat de randwegen
    // geen verkeer meer krijgen en er dus minder stroken over zijn.
    for (const lane of city.roads) {
      if (r() > 0.7) continue;
      const car = new Car(lane, r);
      this.targets.push(car);
      this.group.add(car.mesh);
    }

    // Voetgangers: één tot twee per blok, behalve op het startplein.
    for (const walk of city.walks) {
      if (walk.center.x === 0 && walk.center.z === 0) continue;
      // Meer volk op straat. Een lege stad geeft niets te mikken, en een opgejaagde
      // zwerm heeft ook iets nodig om op neer te komen.
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const ped = new Pedestrian(walk, r);
        this.targets.push(ped);
        this.group.add(ped.mesh);
      }
    }

    // Elke zevende plek wordt een boterham in plaats van een kruimel: zeldzaam
    // genoeg om iets te betekenen, vaak genoeg om er een te vinden.
    city.crumbSpots.forEach((spot, i) => {
      if (i % 7 === 3) {
        const sandwich = new Sandwich(spot);
        this.sandwiches.push(sandwich);
        this.crumbGroup.add(sandwich.group);
      } else {
        const crumb = new Crumb(spot);
        this.crumbs.push(crumb);
        this.crumbGroup.add(crumb.mesh);
      }
    });
  }

  update(dt, intensity = 0) {
    this.time += dt;
    for (const t of this.targets) t.update(dt, intensity, this.targets);
    for (const c of this.crumbs) c.update(dt, this.time);
    for (const b of this.sandwiches) b.update(dt, this.time);
  }

  /** Terug naar de begintoestand voor een nieuwe ronde. */
  reset() {
    for (const t of this.targets) {
      t.cooldown = 0;
      t.reaction = 0;
      t.hits = 0;
      if (t.alarm !== undefined) {
        t.alarm = 0;
        t.mesh.position.y = 0.7;
        t.bodyMat.color.set(t.baseColor);
      }
      if (t.panic !== undefined) t.panic = 0;
    }
    for (const c of this.crumbs) {
      c.taken = false;
      c.respawn = 0;
      c.mesh.visible = true;
    }
    for (const b of this.sandwiches) {
      b.taken = false;
      b.respawn = 0;
      b.group.visible = true;
    }
  }

  /** Eerste doel waarvan de hitbox het punt bevat. */
  hitTest(point, radius) {
    for (const t of this.targets) {
      if (!t.hittable) continue;
      if (
        point.x > t.box.min.x - radius && point.x < t.box.max.x + radius &&
        point.y > t.box.min.y - radius && point.y < t.box.max.y + radius &&
        point.z > t.box.min.z - radius && point.z < t.box.max.z + radius
      ) {
        return t;
      }
    }
    return null;
  }

  /**
   * Staat er over `flightTime` seconden een doel op dit punt? Kleurt de richtring.
   *
   * Kijken naar waar een doel nú staat is misleidend: de poep is een seconde
   * onderweg, dus een rijdende auto is dan allang doorgereden. De ring kleurde
   * daardoor rood terwijl je miste.
   *
   * De marge is gelijk aan de spatstraal, zodat rood precies betekent wat het zegt. Stond eerder op
   * 1,4 meter, ruim boven de werkelijke trefzone, en dan is rood een belofte die het
   * spel niet waarmaakt.
   */
  aimingAt(x, z, flightTime = 0) {
    for (const t of this.targets) {
      if (!t.hittable || !t.predictable(flightTime)) continue;
      t.futurePosition(flightTime, this._future);
      const hw = t.size.x / 2 + t.splash;
      const hd = t.size.z / 2 + t.splash;
      if (Math.abs(x - this._future.x) < hw && Math.abs(z - this._future.z) < hd) {
        return t;
      }
    }
    return null;
  }

  /**
   * Wat raakt een spat op dit punt: een voltreffer, een schampschot, of niets.
   *
   * Rechthoekig getoetst en niet op afstand tot het middelpunt, want een auto is vier
   * keer zo lang als breed en anders zou zijn neus buiten bereik vallen.
   */
  splashHit(x, z) {
    let best = null;
    let bestOver = Infinity;
    for (const t of this.targets) {
      if (!t.hittable) continue;
      const dx = Math.abs(t.mesh.position.x - x) - t.size.x / 2;
      const dz = Math.abs(t.mesh.position.z - z) - t.size.z / 2;
      const over = Math.max(0, Math.max(dx, dz));   // afstand tot de rand van het doel
      if (over < bestOver) { bestOver = over; best = t; }
    }
    if (!best) return null;
    if (bestOver <= best.splash) return { target: best, graze: false };
    if (bestOver <= best.splash + GRAZE_EXTRA) return { target: best, graze: true };
    return null;
  }

  /**
   * Het doel dat het dichtst bij een punt op de grond ligt, binnen `bereik`.
   * Hiermee weet de HUD op wie je aan het mikken bent.
   */
  nearestTo(x, z, bereik) {
    let best = null;
    let bestD = bereik;
    for (const t of this.targets) {
      if (!t.hittable) continue;
      const d = Math.hypot(t.mesh.position.x - x, t.mesh.position.z - z);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  /** Kruimel die de duif nu oppikt, of null. */
  crumbAt(point, radius) {
    for (const c of this.crumbs) {
      if (c.taken) continue;
      if (c.mesh.position.distanceToSquared(point) < radius * radius) return c;
    }
    return null;
  }

  /** Boterham die de duif nu opeet, of null. */
  sandwichAt(point) {
    for (const b of this.sandwiches) {
      if (b.taken) continue;
      if (b.position.distanceToSquared(point) < SANDWICH_PICKUP_R * SANDWICH_PICKUP_R) return b;
    }
    return null;
  }
}

/** Ligt er in deze richting nog een kruising voor hem? */
function heeftKruisingVooruit(t, dir) {
  return TRAFFIC_ROADS.some((o) => (dir > 0 ? o > t + 0.5 : o < t - 0.5));
}

function part(w, h, d, color, name) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  if (name) m.name = name;
  m.castShadow = true;
  return m;
}

/** Auto kijkt naar +Z. */
function buildCar(color) {
  const g = new THREE.Group();

  const body = part(2.0, 0.85, 4.2, color, 'body');
  body.position.y = 0;
  g.add(body);

  const cabin = part(1.8, 0.75, 2.0, color);
  cabin.position.set(0, 0.75, -0.2);
  g.add(cabin);

  // Ruiten als één donker blok dat net buiten de cabine steekt: leest van bovenaf
  // meteen als glas.
  const glass = part(1.84, 0.5, 1.7, C.night);
  glass.position.set(0, 0.8, -0.2);
  g.add(glass);

  const front = part(1.4, 0.2, 0.2, C.gold);
  front.position.set(0, 0.05, 2.1);
  g.add(front);
  const rear = part(1.4, 0.2, 0.2, C.crimson);
  rear.position.set(0, 0.05, -2.1);
  g.add(rear);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = part(0.35, 0.6, 0.6, C.ink);
      wheel.position.set(sx * 1.0, -0.45, sz * 1.4);
      g.add(wheel);
    }
  }
  return g;
}

/** Voetganger kijkt naar +Z. Voeten op y=0 van de group. */
function buildPedestrian(shirt, pram = false) {
  const g = new THREE.Group();

  if (pram) {
    // Kinderwagen: bak, kap, duwbeugel en wielen, vooruit geduwd.
    const bak = part(0.62, 0.42, 0.9, C.crimson);
    bak.position.set(0, 0.85, 0.95);
    g.add(bak);

    const kap = part(0.66, 0.34, 0.42, C.night);
    kap.position.set(0, 1.16, 0.72);
    g.add(kap);

    const beugel = part(0.58, 0.07, 0.07, C.slate);
    beugel.position.set(0, 1.18, 0.42);
    g.add(beugel);

    for (const sx of [-1, 1]) {
      for (const sz of [0.65, 1.28]) {
        const wiel = part(0.1, 0.28, 0.28, C.ink);
        wiel.position.set(sx * 0.3, 0.5, sz);
        g.add(wiel);
      }
    }
  }

  const torso = part(0.62, 0.8, 0.4, shirt);
  torso.position.y = 1.15;
  g.add(torso);

  const head = part(0.42, 0.42, 0.42, C.clay);
  head.position.y = 1.78;
  g.add(head);

  const hair = part(0.46, 0.14, 0.46, C.ink);
  hair.position.y = 2.0;
  g.add(hair);

  for (const [name, sx] of [['armL', -1], ['armR', 1]]) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(sx * 0.4, 1.45, 0);
    const arm = part(0.18, 0.7, 0.18, shirt);
    arm.position.y = -0.35;
    pivot.add(arm);
    g.add(pivot);
  }

  for (const [name, sx] of [['legL', -1], ['legR', 1]]) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(sx * 0.17, 0.75, 0);
    const leg = part(0.22, 0.75, 0.22, C.night);
    leg.position.y = -0.38;
    pivot.add(leg);
    g.add(pivot);
  }

  return g;
}
