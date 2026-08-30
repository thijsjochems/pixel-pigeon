// De projectielen. Vaste pool, niets wordt aangemaakt of weggegooid tijdens het spelen.
//
// Belangrijkste ontwerpkeuze: de poep erft de snelheid van de duif. Je moet dus
// voorliggen op je doel. Daar zit de hele vaardigheid van het mikken in.

import * as THREE from 'three';
import { POOP } from './palette.js';

const POOL_SIZE = 48;
// Zoveel plekken blijven altijd vrij voor de speler. Een opgejaagde zwerm mag de
// pool nooit zo leegtrekken dat jij zelf niet meer kunt lossen.
const PLAYER_RESERVE = 16;
// Zwaar. De poep moet zichtbaar vallen in plaats van in een flauwe boog vooruit te
// zweven: dat maakt mikken leesbaar, want je ziet 'm neerkomen waar je 'm loslaat.
const GRAVITY = -46;
// Trefstraal van een poep. Stond op 0,18: samen met een doel van één bij één meter
// gaf dat een tijdsvenster van soms maar zeventien milliseconde om te lossen, en dat
// is geen mikken meer maar loten.
export const RADIUS = 0.45;

// Hoe ruim een spat telt staat per soort doel in targets.js, want een voetganger van
// een bij een meter heeft een royalere marge nodig dan een auto van ruim vier meter.
// Zwermpoep is een regen van zeven vogels tegelijk, geen gericht schot. Een ruimere
// trefstraal hoort daarbij en maakt het opjagen van een zwerm de moeite waard.
const FLOCK_RADIUS = 0.6;
const MAX_LIFE = 6;

// Beginwaarden van een verse poep. Zowel fire() als de baanvoorspelling gebruiken
// deze, zodat de richtring per definitie niet kan afwijken van de werkelijkheid.
const SPAWN_FWD = 0.2;
const SPAWN_DOWN = 0.35;
const INHERIT_H = 0.5;   // hoeveel van je vliegsnelheid meegaat
const INHERIT_V = 0.5;
const DOWN_KICK = 5;     // directe zet naar beneden

function launchState(pigeon) {
  const fwd = pigeon.forward;
  return {
    x0: pigeon.pos.x + fwd.x * SPAWN_FWD,
    z0: pigeon.pos.z + fwd.z * SPAWN_FWD,
    y0: pigeon.pos.y - SPAWN_DOWN,
    vx: fwd.x * pigeon.speed * INHERIT_H,
    vz: fwd.z * pigeon.speed * INHERIT_H,
    vy0: pigeon.vy * INHERIT_V - DOWN_KICK,
  };
}

export class PoopSystem {
  constructor(city, targets) {
    this.city = city;
    this.targets = targets;
    this.group = new THREE.Group();
    this.pool = [];

    const geo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
    const mat = new THREE.MeshLambertMaterial({ color: POOP });
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.castShadow = true;
      this.group.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        active: false,
        spin: new THREE.Vector3(),
        spawnY: 0,
        fromFlock: false,
        radius: RADIUS,
      });
    }

    // Wordt door game.js gevuld.
    this.onTargetHit = null;
    this.onGraze = null;
    this.onSplat = null;
  }

  /**
   * Geeft false als de pool vol zit — dan is er niets te droppen.
   * `fromFlock` markeert poep van een opgejaagde zwerm: die telt wel voor je score,
   * maar mag de laatste plekken in de pool niet opsouperen.
   */
  fire(pigeon, fromFlock = false) {
    if (fromFlock) {
      const vrij = this.pool.reduce((n, x) => n + (x.active ? 0 : 1), 0);
      if (vrij <= PLAYER_RESERVE) return false;
    }
    const p = this.pool.find((x) => !x.active);
    if (!p) return false;
    p.fromFlock = fromFlock;
    p.radius = fromFlock ? FLOCK_RADIUS : RADIUS;

    const L = launchState(pigeon);
    p.mesh.position.set(L.x0, L.y0, L.z0);
    p.mesh.visible = true;
    p.vel.set(L.vx, L.vy0, L.vz);
    // Rustiger tollen. De oude waarde liet 'm dwarrelen als een blaadje.
    p.spin.set(Math.random() * 3 - 1.5, Math.random() * 4 - 2, Math.random() * 3 - 1.5);
    p.life = MAX_LIFE;
    p.spawnY = p.mesh.position.y;
    p.active = true;
    return true;
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;

      p.vel.y += GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      p.life -= dt;

      const pos = p.mesh.position;

      const target = this.targets.hitTest(pos, p.radius);
      if (target) {
        target.onHit();
        // Valhoogte gaat mee: van grote hoogte raken is moeilijker en levert meer op.
        if (this.onTargetHit) {
          this.onTargetHit(target, pos.clone(), {
            dropHeight: p.spawnY - pos.y,
            fromFlock: p.fromFlock,
          });
        }
        this._retire(p);
        continue;
      }

      // Grond, stoep of dak — welke van de drie hier ook het hoogst is.
      const floor = this.city.groundHeightAt(pos.x, pos.z);
      if (pos.y <= floor + p.radius) {
        const at = new THREE.Vector3(pos.x, floor + 0.03, pos.z);

        // De spat zelf telt ook: wie binnen de straal staat krijgt het over zich heen,
        // en wie er net buiten staat schrikt zich een hoedje.
        const raak = this.targets.splashHit(at.x, at.z);
        if (raak && !raak.graze) {
          raak.target.onHit();
          if (this.onTargetHit) {
            this.onTargetHit(raak.target, at.clone(), {
              dropHeight: p.spawnY - at.y,
              fromFlock: p.fromFlock,
              splash: true,
            });
          }
        } else if (raak && this.onGraze) {
          this.onGraze(raak.target, at.clone(), { fromFlock: p.fromFlock });
        }
        if (this.onSplat) this.onSplat(at);
        this._retire(p);
        continue;
      }

      if (p.life <= 0) this._retire(p);
    }
  }

  _retire(p) {
    p.active = false;
    p.mesh.visible = false;
  }

  reset() {
    for (const p of this.pool) this._retire(p);
  }
}

/**
 * Waar zou een poep die je NU loslaat neerkomen, en hoe lang duurt dat?
 *
 * Dezelfde beginwaarden als fire(), dus de ring op de grond liegt niet. Twee
 * iteraties omdat de grond onder het voorspelde punt hoger kan liggen dan de grond
 * onder je (een dak), en dat verschuift de inslag weer.
 */
export function predictImpact(pigeon, city, out) {
  const { x0, z0, y0, vx, vz, vy0 } = launchState(pigeon);

  let groundY = city.groundHeightAt(x0, z0);
  let t = timeToFall(y0, vy0, groundY);
  for (let i = 0; i < 2; i++) {
    const g2 = city.groundHeightAt(x0 + vx * t, z0 + vz * t);
    if (Math.abs(g2 - groundY) < 0.01) break;
    groundY = g2;
    t = timeToFall(y0, vy0, groundY);
  }
  out.set(x0 + vx * t, groundY + 0.06, z0 + vz * t);
  return t;   // de valtijd, want een bewegend doel staat straks ergens anders
}

/**
 * Waar passeert de poep een bepaalde hoogte?
 *
 * Nodig omdat je een auto niet op straatniveau raakt maar op zijn dak. Het
 * verschil is klein maar niet nul, en juist bij de vraag "raak ik hem" telt het.
 */
export function predictPassThrough(pigeon, targetY, out) {
  const { x0, z0, y0, vx, vz, vy0 } = launchState(pigeon);
  const t = timeToFall(y0, vy0, targetY);
  out.set(x0 + vx * t, targetY, z0 + vz * t);
  return t;
}

/** Positieve wortel van y0 + vy0*t + 0.5*g*t^2 = groundY. */
function timeToFall(y0, vy0, groundY) {
  const a = 0.5 * GRAVITY;
  const c = y0 - groundY;
  const disc = vy0 * vy0 - 4 * a * c;
  if (disc <= 0) return 0;
  return Math.max(0, (-vy0 - Math.sqrt(disc)) / (2 * a));
}
