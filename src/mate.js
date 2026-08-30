// De cheeky duif: een tweede duif die ergens in de stad op een randje zit met een
// hartje erboven. Vlieg je haar aan, dan begint CHEEKY PIGEON TIME.
//
// Dat het aanvliegen van een andere duif een vleugelklap oplevert is geen grap:
// bij rotsduiven is diezelfde klap boven de rug zowel het opstijgsignaal als een
// baltsvertoning. De power-up en het opstijgen zijn dus letterlijk dezelfde beweging.

import * as THREE from 'three';
import { C } from './palette.js';

export const CHEEKY_TIME = 10;        // seconden power-up
const RESPAWN_DELAY = 8;              // pauze voordat ze ergens anders opduikt
// Aanraakzone. Bewust een ruime cilinder in plaats van een bol: ze zit vaak op een
// lantaarnpaal of dakrand vlak langs een gevel, en de gevelbotsing duwt je daar weg
// voordat je binnen een krappe straal komt. Een paar meter eroverheen vliegen moet
// genoeg zijn, anders is de power-up onbereikbaar in de helft van de stad.
const TOUCH_RADIUS = 4.5;
const TOUCH_BELOW = 3.5;

// De hele lichtbundel telt als aanraking, niet alleen de duif onderaan. De bundel is
// wat je van ver ziet en waar je op af vliegt; als je er dan doorheen scheert en er
// gebeurt niets, is dat een gebroken belofte.
const BEAM_HEIGHT = 68;
const BEAM_RADIUS = 3.6;

// Waar ze opduikt ten opzichte van jou. Ver genoeg dat het een tochtje is, dichtbij
// genoeg dat het binnen een ronde van zestig seconden te doen is. Eerder werd simpelweg
// de verste van drie kandidaten gekozen, en dan stond ze zomaar aan de andere kant
// van de stad.
const IDEAL_DIST = 55;
const MIN_DIST = 25;

export class Mate {
  constructor(city) {
    // Alleen zitplaatsen die hoog genoeg liggen en waar de lucht erboven vrij is.
    // Zonder die tweede eis kwam ze op een laag dak naast een toren te zitten: haar
    // koker liep dan door dat pand heen en was niet in te vliegen.
    this.perches = city.perches.filter(
      (p) => p.y > 4 && city.hasClearSky(p.x, p.z, p.y)
    );
    if (!this.perches.length) this.perches = city.perches.filter((p) => p.y > 4);
    this.group = new THREE.Group();
    this.mesh = buildMate();
    this.group.add(this.mesh);

    this.heart = buildHeart();
    this.group.add(this.heart);

    this.beam = buildBeam();
    this.group.add(this.beam);

    this.t = 0;
    this.cooldown = 0;
    this.active = true;
    this.pos = new THREE.Vector3();
    this.clap = 0;
    this.wingL = this.mesh.getObjectByName('mateWingL');
    this.wingR = this.mesh.getObjectByName('mateWingR');
    this.relocate();
  }

  /**
   * Verhuist naar een zitplaats op een redelijke afstand van de speler.
   * `index` is er voor de tests, die elke zitplaats langs willen lopen.
   */
  relocate(pigeonPos = null, index = -1) {
    if (!this.perches.length) return;
    let pick = null;
    if (index >= 0) {
      pick = this.perches[index % this.perches.length];
    } else if (pigeonPos) {
      // Acht kandidaten trekken en die pakken die het dichtst bij de gewenste
      // afstand ligt. Te dichtbij is een gratis power-up, te ver is niet te halen.
      let bestErr = Infinity;
      for (let i = 0; i < 8; i++) {
        const c = this.perches[Math.floor(Math.random() * this.perches.length)];
        const d = c.distanceTo(pigeonPos);
        if (d < MIN_DIST) continue;
        const err = Math.abs(d - IDEAL_DIST);
        if (err < bestErr) { bestErr = err; pick = c; }
      }
    }
    if (!pick) pick = this.perches[Math.floor(Math.random() * this.perches.length)];
    this.pos.copy(pick);
    this.pos.y += 1.2;   // net los van de paal of dakrand waar ze op zit
    this.group.position.copy(this.pos);
    this.active = true;
    this.group.visible = true;
    this.cooldown = 0;
  }

  update(dt, pigeonPos) {
    this.t += dt;

    if (!this.active) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.relocate(pigeonPos);
      return false;
    }

    // Hartje dobbert en draait, en de lichtbundel pulseert. Dit moet van ver
    // opvallen tussen alle daken.
    this.heart.position.y = 1.5 + Math.sin(this.t * 2.6) * 0.18;
    this.heart.rotation.y = this.t * 1.4;
    const pulse = 0.75 + Math.sin(this.t * 3.2) * 0.25;
    this.beam.material.opacity = 0.3 + pulse * 0.22;
    this.beam.scale.set(pulse, 1, pulse);

    // Baltsvertoning zodra je in de buurt komt: ze klapt met haar vleugels.
    const near = this.pos.distanceToSquared(pigeonPos) < 400;   // binnen 20 meter
    if (near && this.clap <= 0) this.clap = 1;
    this.clap = Math.max(0, this.clap - dt * 1.6);
    const angle = this.clap > 0 ? -1.9 + (1 - this.clap) * 1.5 : 0.2;
    this.wingL.rotation.z = angle;
    this.wingR.rotation.z = -angle;

    const dx = pigeonPos.x - this.pos.x;
    const dz = pigeonPos.z - this.pos.z;
    const dy = pigeonPos.y - this.pos.y;
    const horizontaalSq = dx * dx + dz * dz;

    // Vlak bij haar mag het ruim; hogerop moet je door de bundel zelf.
    const bijHaar = horizontaalSq < TOUCH_RADIUS * TOUCH_RADIUS && dy < 10;
    const doorDeBundel = horizontaalSq < BEAM_RADIUS * BEAM_RADIUS && dy < BEAM_HEIGHT;
    if ((bijHaar || doorDeBundel) && dy > -TOUCH_BELOW) {
      this.active = false;
      this.group.visible = false;
      this.cooldown = RESPAWN_DELAY;
      return true;   // aangeraakt
    }
    return false;
  }

  reset(pigeonPos = null) {
    this.t = 0;
    this.clap = 0;
    this.relocate(pigeonPos);
  }
}

function box(w, h, d, color, name) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  if (name) m.name = name;
  return m;
}

/** Zelfde bouw als de speler, maar lichter en met een strik. Ze moet herkenbaar anders zijn. */
function buildMate() {
  const g = new THREE.Group();

  const body = box(0.5, 0.45, 0.85, C.haze);
  g.add(body);

  const neck = box(0.36, 0.14, 0.2, C.violet);
  neck.position.set(0, 0.2, 0.44);
  g.add(neck);
  const sheen = box(0.38, 0.1, 0.19, C.crimson);
  sheen.position.set(0, 0.1, 0.45);
  g.add(sheen);

  const head = box(0.34, 0.32, 0.32, C.mist);
  head.position.set(0, 0.3, 0.58);
  g.add(head);

  const beak = box(0.11, 0.09, 0.2, C.clay);
  beak.position.set(0, 0.24, 0.78);
  g.add(beak);

  for (const side of [-1, 1]) {
    const eye = box(0.07, 0.08, 0.07, C.ink);
    eye.position.set(side * 0.15, 0.36, 0.68);
    g.add(eye);
  }

  // Strikje, zodat je haar ook van bovenaf meteen van een gewone duif onderscheidt.
  for (const side of [-1, 1]) {
    const bow = box(0.16, 0.16, 0.08, C.crimson);
    bow.position.set(side * 0.14, 0.46, 0.5);
    g.add(bow);
  }

  for (const [name, side] of [['mateWingL', -1], ['mateWingR', 1]]) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(side * 0.24, 0.12, 0.04);
    const wing = box(0.55, 0.08, 0.7, C.mist);
    wing.position.set(side * 0.3, 0, 0);
    pivot.add(wing);
    g.add(pivot);
  }

  const tail = box(0.38, 0.08, 0.45, C.mist);
  tail.position.set(0, 0.05, -0.6);
  g.add(tail);

  return g;
}

/** Een hartje uit blokjes. Op deze resolutie leest dat prima. */
function buildHeart() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: C.crimson,
    depthTest: false,   // ook zichtbaar als ze achter een pand zit
    fog: false,
  });
  const cell = 0.18;
  // 1 = blokje. Klassiek 7x6 pixelhart.
  const rows = [
    '0110110',
    '1111111',
    '1111111',
    '0111110',
    '0011100',
    '0001000',
  ];
  const geo = new THREE.BoxGeometry(cell, cell, cell);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] !== '1') continue;
      const m = new THREE.Mesh(geo, mat);
      m.position.set((x - 3) * cell, (rows.length - 1 - y) * cell, 0);
      g.add(m);
    }
  }
  g.renderOrder = 21;
  g.position.y = 1.5;
  return g;
}

/**
 * Lichtbundel omhoog.
 *
 * Dit is een baken, geen decorstuk: `depthTest` uit zodat hij dwars door gebouwen
 * heen te zien is, en `fog` uit zodat de mist hem niet wegspoelt. Met de oude
 * instellingen was ze maar in ongeveer een derde van de situaties zichtbaar, en dat
 * is niet te doen binnen een ronde van zestig seconden.
 */
function buildBeam() {
  const mat = new THREE.MeshBasicMaterial({
    color: C.crimson,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    depthTest: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.6, 70, 8, 1, true), mat);
  m.position.y = 34;
  m.renderOrder = 20;
  return m;
}
