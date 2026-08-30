// Game-feel. Dit bestand doet niets voor de regels van het spel en alles voor
// de vraag of het leuk is: splats die blijven liggen, veertjes, zwevende punten,
// schermschudden en een korte bevriezing bij een treffer.

import * as THREE from 'three';
import { C } from './palette.js';

const DECAL_POOL = 80;
const FEATHER_POOL = 60;
const TEXT_POOL = 16;
const DOT_COUNT = 5;   // stippen tussen doel en spookpositie

/** Splats blijven liggen. Bewijs dat je er bent geweest. */
class Decals {
  constructor(texture) {
    this.group = new THREE.Group();
    this.items = [];
    this.next = 0;

    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < DECAL_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,       // anders vecht de decal met het wegdek
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.group.add(m);
      this.items.push(m);
    }
  }

  add(pos, scale = 1) {
    // Ringbuffer: de oudste splat verdwijnt zodra de pool rond is.
    const m = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    m.position.copy(pos);
    m.rotation.z = Math.random() * Math.PI * 2;
    const s = (1.4 + Math.random() * 0.8) * scale;
    m.scale.set(s, s, 1);
    m.material.opacity = 0.95;
    m.visible = true;
  }

  clear() {
    for (const m of this.items) m.visible = false;
    this.next = 0;
  }
}

/** Veertjes bij elke vleugelslag en bij elke treffer. */
class Feathers {
  constructor() {
    this.group = new THREE.Group();
    this.items = [];

    const geo = new THREE.PlaneGeometry(0.22, 0.34);
    for (let i = 0; i < FEATHER_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: C.haze,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.items.push({ mesh, vel: new THREE.Vector3(), life: 0, spin: 0, active: false });
    }
  }

  burst(pos, count = 2, spread = 2, color = C.haze) {
    for (let i = 0; i < count; i++) {
      const f = this.items.find((x) => !x.active);
      if (!f) return;
      f.mesh.position.copy(pos);
      f.mesh.position.x += (Math.random() - 0.5) * 0.6;
      f.mesh.position.z += (Math.random() - 0.5) * 0.6;
      f.mesh.material.color.set(color);
      f.vel.set(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.5,
        (Math.random() - 0.5) * spread
      );
      f.spin = (Math.random() - 0.5) * 6;
      f.life = 1.2 + Math.random() * 0.8;
      f.active = true;
      f.mesh.visible = true;
      f.mesh.material.opacity = 1;
    }
  }

  update(dt) {
    for (const f of this.items) {
      if (!f.active) continue;
      // Zacht vallend, met luchtweerstand — een veertje valt niet als een steen.
      f.vel.y -= 2.4 * dt;
      f.vel.multiplyScalar(1 - Math.min(1, dt * 1.6));
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.z += f.spin * dt;
      f.mesh.rotation.x += f.spin * 0.6 * dt;
      f.life -= dt;
      f.mesh.material.opacity = Math.min(1, f.life * 1.6);
      if (f.life <= 0 || f.mesh.position.y < -1) {
        f.active = false;
        f.mesh.visible = false;
      }
    }
  }

  clear() {
    for (const f of this.items) {
      f.active = false;
      f.mesh.visible = false;
    }
  }
}

/** Punten die uit het doel omhoog drijven. DOM, want dat is scherp en goedkoop. */
class FloatingText {
  constructor(container) {
    this.items = [];
    for (let i = 0; i < TEXT_POOL; i++) {
      const el = document.createElement('div');
      el.className = 'popup';
      el.style.display = 'none';
      container.appendChild(el);
      this.items.push({ el, world: new THREE.Vector3(), life: 0, active: false });
    }
    this._v = new THREE.Vector3();
  }

  add(pos, text, color = C.gold) {
    const t = this.items.find((x) => !x.active);
    if (!t) return;
    t.world.copy(pos);
    t.el.textContent = text;
    t.el.style.color = color;
    t.el.style.display = 'block';
    t.life = 1.1;
    t.active = true;
  }

  update(dt, camera, width, height) {
    for (const t of this.items) {
      if (!t.active) continue;
      t.life -= dt;
      t.world.y += dt * 2.2;

      this._v.copy(t.world).project(camera);
      const behind = this._v.z > 1;
      if (behind || t.life <= 0) {
        t.active = false;
        t.el.style.display = 'none';
        continue;
      }
      const x = (this._v.x * 0.5 + 0.5) * width;
      const y = (-this._v.y * 0.5 + 0.5) * height;
      t.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
      t.el.style.opacity = String(Math.min(1, t.life * 1.6));
    }
  }

  clear() {
    for (const t of this.items) {
      t.active = false;
      t.el.style.display = 'none';
    }
  }
}

/**
 * De richtring: waar komt je poep neer.
 *
 * Zonder dit poep je blind en is elke treffer toeval. Mét dit wordt de aanvliegroute
 * een keuze, en dat is het verschil tussen een zandbak en een spel.
 */
class Reticle {
  constructor() {
    this.group = new THREE.Group();

    // Weinig segmenten: een grove twaalfhoek past bij de rest van het beeld
    // en leest op deze resolutie beter dan een gladde cirkel.
    const ringMat = new THREE.MeshBasicMaterial({
      color: C.gold,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      depthTest: false,        // altijd zichtbaar, ook achter een dakrand
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.25, 12), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 10;
    this.group.add(this.ring);

    const dotMat = ringMat.clone();
    this.dot = new THREE.Mesh(new THREE.RingGeometry(0, 0.22, 8), dotMat);
    this.dot.rotation.x = -Math.PI / 2;
    this.dot.renderOrder = 10;
    this.group.add(this.dot);

    this.pulse = 0;
  }

  update(dt, pos, locked) {
    this.group.position.copy(pos);
    this.pulse += dt * (locked ? 9 : 3.5);

    // Rood en groter zodra er een doel onder zit: dat is het moment om te lossen.
    const color = locked ? C.crimson : C.gold;
    const scale = (locked ? 1.35 : 1) * (1 + Math.sin(this.pulse) * 0.06);
    this.ring.material.color.set(color);
    this.dot.material.color.set(color);
    this.ring.material.opacity = locked ? 1 : 0.75;
    this.dot.material.opacity = locked ? 1 : 0.55;
    this.group.scale.setScalar(scale);
  }

  set visible(v) {
    this.group.visible = v;
  }
}

/**
 * Het spookdoel: waar staat je doelwit op het moment dat je poep neerkomt.
 *
 * Dit is het antwoord op "mikken is te moeilijk". De gouden ring vertelt je waar je
 * poep landt, maar niet waar de voetganger dan is, en dat verschil is bij een val van
 * bijna een seconde al gauw drie meter. Die rekensom moest de speler in zijn hoofd
 * doen. Nu staat hij op de grond: leg de ring op het spook en je raakt.
 */
class LeadMarker {
  constructor() {
    this.group = new THREE.Group();

    // Zelfde vormtaal als de richtring: een platte ring op de grond, alleen dunner
    // en doorzichtiger. Hier stonden eerst een paal en een vlaggetje, en dat werkte
    // wel maar stond lelijk in een verder rustig beeld.
    const mat = new THREE.MeshBasicMaterial({
      color: C.gold,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.15, 12), mat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 9;
    this.group.add(this.ring);

    // Stippellijn van waar het doel nu staat naar waar het straks staat. Dat maakt
    // de voorsprong afleesbaar zonder dat er iets uit de grond omhoog hoeft te steken.
    this.dots = [];
    const dotGeo = new THREE.PlaneGeometry(0.26, 0.26);
    for (let i = 0; i < DOT_COUNT; i++) {
      const dot = new THREE.Mesh(dotGeo, mat.clone());
      dot.rotation.x = -Math.PI / 2;
      dot.renderOrder = 9;
      this.group.add(dot);
      this.dots.push(dot);
    }

    this.pulse = 0;
  }

  /** `from` is waar het doel nu staat, `to` waar je poep het aantreft. */
  update(dt, from, to, locked) {
    this.pulse += dt * 4;
    const kleur = locked ? C.crimson : C.gold;
    const alpha = locked ? 0.95 : 0.5 + Math.sin(this.pulse) * 0.12;

    this.ring.position.copy(to);
    this.ring.material.color.set(kleur);
    this.ring.material.opacity = alpha;
    this.ring.scale.setScalar(locked ? 1.15 : 1);

    // De stippen lopen van het doel naar de ring toe en verflauwen onderweg.
    for (let i = 0; i < this.dots.length; i++) {
      const t = (i + 1) / (this.dots.length + 1);
      const dot = this.dots[i];
      dot.position.lerpVectors(from, to, t);
      dot.position.y = to.y;
      dot.material.color.set(kleur);
      dot.material.opacity = alpha * (0.25 + t * 0.6);
      dot.visible = from.distanceToSquared(to) > 0.6;
    }
  }

  set visible(v) {
    this.group.visible = v;
  }
}

export class FX {
  constructor(splatTexture, overlayEl) {
    this.decals = new Decals(splatTexture);
    this.feathers = new Feathers();
    this.text = new FloatingText(overlayEl);

    this.reticle = new Reticle();
    this.lead = new LeadMarker();

    this.group = new THREE.Group();
    this.group.add(this.decals.group);
    this.group.add(this.feathers.group);
    this.group.add(this.reticle.group);
    this.group.add(this.lead.group);

    this.shake = 0;      // huidige amplitude
    this.hitstop = 0;    // seconden waarin de simulatie bevriest
    this.flash = 0;      // schermflits bij een grote treffer
  }

  /** Korte bevriezing plus een schok. Dit is wat een treffer laat 'landen'. */
  impact({ shake = 0.35, stop = 0.05, flash = 0 } = {}) {
    this.shake = Math.max(this.shake, shake);
    this.hitstop = Math.max(this.hitstop, stop);
    this.flash = Math.max(this.flash, flash);
  }

  update(dt) {
    this.feathers.update(dt);
    this.shake *= 1 - Math.min(1, dt * 6);
    if (this.shake < 0.001) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 4);
  }

  /** Verschuiving die de camera erbovenop legt. */
  shakeOffset(out) {
    if (this.shake === 0) return out.set(0, 0, 0);
    return out.set(
      (Math.random() - 0.5) * this.shake,
      (Math.random() - 0.5) * this.shake,
      (Math.random() - 0.5) * this.shake
    );
  }

  clear() {
    this.decals.clear();
    this.feathers.clear();
    this.text.clear();
    this.shake = 0;
    this.hitstop = 0;
    this.flash = 0;
  }
}
