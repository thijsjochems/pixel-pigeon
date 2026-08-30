// Zwermen duiven op straat.
//
// Vlieg je er te dicht langs, dan schrikken ze op. Bij echte duiven klapt één vogel
// met zijn vleugels en is juist dat geluid het signaal waarop de rest ook opvliegt,
// dus het gaat hier als een kettingreactie: eerst één, dan de rest, met tellen ertussen.
//
// En ze poepen in de lucht. Wat zij raken telt voor jouw score, want jij hebt ze
// opgejaagd. Een zwerm boven een druk kruispunt loslaten is de grootste zet in het spel.

import * as THREE from 'three';
import { C } from './palette.js';
import { rng } from './textures.js';
import { CURB_H, WALK_RING } from './city.js';

const BIRDS = 7;
const STARTLE_RADIUS = 8;
const CLAP_STAGGER = 0.09;     // vertraging per vogel in de kettingreactie
const FLY_TIME = 6.5;
const SETTLE_TIME = 2.2;
const REARM_DELAY = 9;         // pas daarna schrikken ze opnieuw
const DROP_INTERVAL = 0.6;     // hoe vaak een opgejaagde duif lost
// Een opgejaagde zwerm blijft niet rondjes draaien boven de plek waar hij stond: hij
// stuift weg, de straat over. Dat is niet alleen natuurlijker, het is ook het enige
// wat de poepregen ergens laat landen. Cirkelen rond een vast punt gaf een donut met
// een gat precies op het trottoir waar de voetgangers lopen.
const DRIFT_DIST = 16;
const SEEK_RANGE = 42;         // hoe ver de zwerm kijkt naar iets om overheen te stuiven
const LEAD_RANGE = 14;         // binnen deze afstand mikt een vogel zijn lozing bij
// De bijsturing moet minstens de eigen spreiding van de zwerm kunnen overbruggen.
// Stond op 5, goed voor zo'n drie meter correctie, terwijl de vogels tot vijf meter
// uit elkaar vliegen: dan haalt een lozing het doel per definitie niet.
const LEAD_MAX_SPEED = 12;
const CHASE_SPEED = 7;         // hoe snel het hart van de zwerm meebeweegt
const MAX_STRAY = 34;          // en hoe ver het van de oorspronkelijke plek af mag

export class Flock {
  constructor(center, outward, seed) {
    this.group = new THREE.Group();
    this.center = center.clone();
    this.outward = outward.clone().normalize();
    this.baseOutward = this.outward.clone();
    this.driftDist = DRIFT_DIST;
    this.chase = null;
    this.flyCenter = center.clone();
    this.state = 'idle';       // idle -> startled -> flying -> settling
    this.timer = 0;
    this.rearm = 0;
    this.justStartled = false;

    const r = rng(seed);
    this.birds = [];
    for (let i = 0; i < BIRDS; i++) {
      const mesh = buildFlockBird(r);
      const a = r() * Math.PI * 2;
      const d = r() * 3.2;
      const home = new THREE.Vector3(
        center.x + Math.cos(a) * d,
        CURB_H,
        center.z + Math.sin(a) * d
      );
      mesh.position.copy(home);
      mesh.rotation.y = r() * Math.PI * 2;
      this.group.add(mesh);
      this.birds.push({
        mesh,
        home,
        wingL: mesh.getObjectByName('fwL'),
        wingR: mesh.getObjectByName('fwR'),
        head: mesh.getObjectByName('fHead'),
        clap: 0,
        delay: i * CLAP_STAGGER,
        angle: a,
        radius: 1.2 + r() * 3,
        rise: 5 + r() * 7,
        speed: 1.4 + r() * 1.1,
        bob: r() * Math.PI * 2,
        dropTimer: 0.3 + r() * DROP_INTERVAL,
        drops: 3 + Math.floor(r() * 2),
      });
    }
  }

  /**
   * Zoekt iets om achteraan te gaan.
   *
   * Niet simpelweg het dichtstbijzijnde: een auto van dertien meter per seconde haalt
   * een zwerm nooit in, en elke frame opnieuw kiezen liet ze tussen doelen heen en
   * weer schieten. Trage doelen krijgen daarom een flinke voorkeur.
   */
  _zoekProoi(targets, punt, bereik) {
    let best = null;
    let bestScore = Infinity;
    for (const t of targets.targets) {
      const dx = t.mesh.position.x - punt.x;
      const dz = t.mesh.position.z - punt.z;
      const d = Math.hypot(dx, dz);
      if (d > bereik) continue;
      const snelheid = Math.hypot(t.vel.x, t.vel.z);
      // Afstand plus een boete voor snelheid: wie hard rijdt is hem niet waard.
      const score = d + Math.max(0, snelheid - CHASE_SPEED * 0.5) * 4;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  /**
   * Kiest waar de zwerm heen stuift: naar het dichtstbijzijnde doel in de buurt.
   *
   * Blind naar buiten vliegen leverde niets op. De stad is dun bevolkt, dus een
   * willekeurige poepregen over een straat raakt statistisch niemand. Een
   * opgeschrikte zwerm die over de dichtstbijzijnde drukte scheert wel.
   */
  _kiesRichting(targets) {
    if (!targets) return;
    let best = null;
    let bestD = SEEK_RANGE;
    for (const t of targets.targets) {
      const dx = t.mesh.position.x - this.center.x;
      const dz = t.mesh.position.z - this.center.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && d > 3) { bestD = d; best = t; }
    }
    if (!best) return;
    this.outward
      .set(best.mesh.position.x - this.center.x, 0, best.mesh.position.z - this.center.z)
      .normalize();
    // Zo ver dat het hart van de zwerm halverwege de vlucht boven het doel zit.
    this.driftDist = Math.min(DRIFT_DIST * 1.6, bestD / 0.6);
  }

  /** Geeft true op het moment dat de zwerm opschrikt. */
  update(dt, pigeonPos, poop, targets) {
    this.justStartled = false;
    this.rearm = Math.max(0, this.rearm - dt);

    if (this.state === 'idle') {
      this._idle(dt);
      if (this.rearm === 0 && this.center.distanceTo(pigeonPos) < STARTLE_RADIUS) {
        this.state = 'startled';
        this.timer = 0;
        this.justStartled = true;
        this.driftDist = DRIFT_DIST;
        this.flyCenter.copy(this.center);
        this._kiesRichting(targets);
        for (const b of this.birds) b.clap = 0;
      }
      return this.justStartled;
    }

    this.timer += dt;

    if (this.state === 'startled') {
      this._takeOff(dt);
      if (this.timer > BIRDS * CLAP_STAGGER + 0.3) {
        this.state = 'flying';
        this.timer = 0;
      }
      return false;
    }

    if (this.state === 'flying') {
      this._fly(dt, poop, targets);
      if (this.timer > FLY_TIME) {
        this.state = 'settling';
        this.timer = 0;
        this._pickNewHomes();
      }
      return false;
    }

    // settling
    this._settle(dt);
    if (this.timer > SETTLE_TIME) {
      this.state = 'idle';
      this.rearm = REARM_DELAY;
    }
    return false;
  }

  _idle(dt) {
    // Koppen knikken. Duiven kunnen hun ogen niet in de kas bewegen en houden hun
    // blik stabiel door hun kop te laten achterblijven en dan bij te trekken.
    for (const b of this.birds) {
      b.bob += dt * 3.4;
      const k = Math.sin(b.bob);
      b.head.position.z = 0.5 + Math.max(0, k) * 0.13;
      b.head.position.y = 0.26 - Math.max(0, k) * 0.05;
      b.wingL.rotation.z = 0.2;
      b.wingR.rotation.z = -0.2;
      b.mesh.position.y = b.home.y;
    }
  }

  _takeOff(dt) {
    for (const b of this.birds) {
      if (this.timer < b.delay) continue;
      if (b.clap === 0) b.clap = 1;
      b.clap = Math.max(0, b.clap - dt / 0.3);
      // De klap: vleugels tot boven de rug tegen elkaar.
      const angle = -2.0 + (1 - b.clap) * 1.3;
      b.wingL.rotation.z = angle;
      b.wingR.rotation.z = -angle;
      b.mesh.position.y += 9 * dt;
    }
  }

  _fly(dt, poop, targets) {
    // Het hart van de zwerm jaagt mee met de dichtstbijzijnde drukte.
    //
    // Eén keer een richting kiezen bij het opschrikken werkte niet: tegen de tijd dat
    // de zwerm er is, is een auto zestig meter verder. Blijven meesturen wel.
    // Eenmaal gekozen blijft de prooi de prooi, tot hij buiten bereik raakt.
    if (targets) {
      const kwijt = !this.chase
        || Math.hypot(
             this.chase.mesh.position.x - this.flyCenter.x,
             this.chase.mesh.position.z - this.flyCenter.z
           ) > SEEK_RANGE * 1.4;
      if (kwijt) this.chase = this._zoekProoi(targets, this.flyCenter, SEEK_RANGE);
    }
    const doel = this.chase;
    if (doel) {
      const dx = doel.mesh.position.x - this.flyCenter.x;
      const dz = doel.mesh.position.z - this.flyCenter.z;
      const d = Math.hypot(dx, dz) || 1;
      const v = Math.min(CHASE_SPEED, d / Math.max(dt, 1e-6));
      this.flyCenter.x += (dx / d) * v * dt;
      this.flyCenter.z += (dz / d) * v * dt;
    } else {
      // Niets in de buurt: gewoon de straat op stuiven.
      this.flyCenter.addScaledVector(this.outward, CHASE_SPEED * 0.6 * dt);
    }

    // Niet de halve stad door achter één voetganger aan.
    const wegX = this.flyCenter.x - this.center.x;
    const wegZ = this.flyCenter.z - this.center.z;
    const weg = Math.hypot(wegX, wegZ);
    if (weg > MAX_STRAY) {
      this.flyCenter.x = this.center.x + (wegX / weg) * MAX_STRAY;
      this.flyCenter.z = this.center.z + (wegZ / weg) * MAX_STRAY;
    }

    for (const b of this.birds) {
      b.angle += b.speed * dt;
      const targetY = this.center.y + b.rise;
      const x = this.flyCenter.x + Math.cos(b.angle) * b.radius;
      const z = this.flyCenter.z + Math.sin(b.angle) * b.radius;
      b.mesh.position.x += (x - b.mesh.position.x) * Math.min(1, dt * 3);
      b.mesh.position.z += (z - b.mesh.position.z) * Math.min(1, dt * 3);
      b.mesh.position.y += (targetY - b.mesh.position.y) * Math.min(1, dt * 2);
      b.mesh.rotation.y = -b.angle + Math.PI / 2;

      b.bob += dt * 16;
      const flap = Math.sin(b.bob) * -0.9 + 0.1;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;

      // Lossen. Dit is waar de zwerm punten voor jou oplevert.
      if (b.drops > 0 && poop) {
        b.dropTimer -= dt;
        if (b.dropTimer <= 0) {
          b.dropTimer = DROP_INTERVAL;
          b.drops--;
          poop.fire(flockSource(b, targets), true);
        }
      }
    }
  }

  _pickNewHomes() {
    // Ze strijken een eindje verderop neer, zodat je ze niet meteen opnieuw
    // op dezelfde plek kunt opjagen.
    for (const b of this.birds) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 3.5;
      b.home.set(this.center.x + Math.cos(a) * d, CURB_H, this.center.z + Math.sin(a) * d);
      // En ze laden weer op. Zonder dit loosde elke zwerm alleen bij zijn allereerste
      // vlucht en was hij daarna voorgoed leeg.
      b.drops = 3 + Math.floor(Math.random() * 2);
      b.dropTimer = 0.3 + Math.random() * DROP_INTERVAL;
    }
    this.flyCenter.copy(this.center);
    this.chase = null;
  }

  _settle(dt) {
    for (const b of this.birds) {
      b.mesh.position.x += (b.home.x - b.mesh.position.x) * Math.min(1, dt * 3);
      b.mesh.position.z += (b.home.z - b.mesh.position.z) * Math.min(1, dt * 3);
      b.mesh.position.y += (b.home.y - b.mesh.position.y) * Math.min(1, dt * 3.5);
      b.bob += dt * 9;
      const flap = Math.sin(b.bob) * -0.6 + 0.15;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }
  }

  reset() {
    this.state = 'idle';
    this.timer = 0;
    this.rearm = 0;
    this.outward.copy(this.baseOutward);
    this.driftDist = DRIFT_DIST;
    this.chase = null;
    this.flyCenter.copy(this.center);
    for (const b of this.birds) {
      b.mesh.position.copy(b.home);
      b.clap = 0;
      b.drops = 3 + Math.floor(Math.random() * 2);
      b.dropTimer = 0.3 + Math.random() * DROP_INTERVAL;
    }
  }
}

/**
 * Een opgejaagde duif als poepbron: dezelfde vorm die PoopSystem van de speler kent.
 *
 * Ligt er een doel vlakbij, dan wordt de lozing die kant op meegegeven. Niet als
 * zoekkop maar als bijsturing met een strak plafond: zeven paniekerige duiven die
 * over een terras scheren raken nu eenmaal vaker iets dan de kansrekening zegt, en
 * zonder die duw levert een zwerm opjagen in een stad met dertien auto's nooit iets op.
 */
const SRC = { pos: new THREE.Vector3(), forward: new THREE.Vector3(), speed: 0, vy: 0 };
function flockSource(b, targets) {
  SRC.pos.copy(b.mesh.position);
  SRC.forward.set(Math.sin(b.mesh.rotation.y), 0, Math.cos(b.mesh.rotation.y));
  SRC.speed = 3;
  SRC.vy = 0;
  if (!targets) return SRC;

  let best = null;
  let bestD = LEAD_RANGE;
  for (const t of targets.targets) {
    const dx = t.mesh.position.x - SRC.pos.x;
    const dz = t.mesh.position.z - SRC.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) return SRC;

  // Grofweg de valtijd vanaf deze hoogte, en de horizontale snelheid die daarbij past.
  const val = Math.sqrt(Math.max(0.1, 2 * SRC.pos.y / 46));
  const nodig = Math.min(bestD / val, LEAD_MAX_SPEED);
  SRC.forward.set(best.mesh.position.x - SRC.pos.x, 0, best.mesh.position.z - SRC.pos.z).normalize();
  SRC.speed = nodig * 2;   // PoopSystem neemt de helft van deze snelheid over
  return SRC;
}

export class FlockManager {
  constructor(city, seed = 4242) {
    this.group = new THREE.Group();
    this.flocks = [];
    const r = rng(seed);

    // Aan de stoeprand, niet midden op een blok. Duiven scharrelen waar de mensen
    // lopen, en het is ook de enige plek waar hun poepregen iets kan raken: midden
    // op een blok staat niets en levert een opgejaagde zwerm dus nul punten op.
    const spots = [];
    const walks = city.walks.slice();
    for (let i = 0; i < 6 && walks.length; i++) {
      const w = walks.splice(Math.floor(r() * walks.length), 1)[0];
      const langs = (r() - 0.5) * WALK_RING * 1.2;
      const kant = r() < 0.5 ? -1 : 1;
      const opX = r() < 0.5;
      const pos = new THREE.Vector3(
        w.center.x + (opX ? langs : kant * WALK_RING),
        CURB_H,
        w.center.z + (opX ? kant * WALK_RING : langs)
      );
      // Naar buiten toe ligt de straat, en daar rijdt en loopt alles.
      const outward = new THREE.Vector3(opX ? 0 : kant, 0, opX ? kant : 0);
      spots.push({ pos, outward });
    }

    spots.forEach((sp, i) => {
      const f = new Flock(sp.pos, sp.outward, seed + i * 17);
      this.flocks.push(f);
      this.group.add(f.group);
    });
  }

  /** Geeft de zwerm terug die net opschrikt, of null. */
  update(dt, pigeonPos, poop, targets) {
    let startled = null;
    for (const f of this.flocks) {
      if (f.update(dt, pigeonPos, poop, targets) && !startled) startled = f;
    }
    return startled;
  }

  reset() {
    for (const f of this.flocks) f.reset();
  }
}

function part(w, h, d, color, name) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  if (name) m.name = name;
  return m;
}

/** Kleiner en soberder dan de speler: het moet duidelijk achtergrond blijven. */
function buildFlockBird(r) {
  const g = new THREE.Group();
  const tint = r() < 0.3 ? C.mist : C.steel;

  const body = part(0.4, 0.34, 0.62, tint);
  body.position.y = 0.16;
  body.castShadow = true;
  g.add(body);

  const head = part(0.26, 0.24, 0.24, C.night, 'fHead');
  head.position.set(0, 0.26, 0.5);
  g.add(head);

  const beak = part(0.08, 0.07, 0.15, C.clay);
  beak.position.set(0, 0.22, 0.66);
  g.add(beak);

  for (const [name, side] of [['fwL', -1], ['fwR', 1]]) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(side * 0.18, 0.2, 0.02);
    const wing = part(0.42, 0.06, 0.5, tint);
    wing.position.set(side * 0.22, 0, 0);
    pivot.add(wing);
    g.add(pivot);
  }

  const tail = part(0.28, 0.06, 0.34, C.slate);
  tail.position.set(0, 0.16, -0.44);
  g.add(tail);

  return g;
}
