// Eén stadsblok-raster: straten, stoepen, gebouwen, lantaarns, bomen en kruimels.
// De stad is ook de botsingswereld en levert de rijstroken waar targets.js auto's
// en voetgangers op zet.

import * as THREE from 'three';
import { C } from './palette.js';
import { rng } from './textures.js';

export const CELL = 34;          // hart-op-hart afstand tussen blokken
export const BLOCK = 24;         // bebouwbaar vierkant per blok
export const GRID = [-2, -1, 0, 1, 2];
export const CURB_H = 0.32;      // stoephoogte
export const WALK_RING = BLOCK / 2 - 1.2;   // waar voetgangers hun rondje lopen
const BUILD_LIMIT = WALK_RING - 1.4;        // en hoe ver bebouwing daar vandaan blijft
export const LANE_OFFSET = 2.2;  // afstand van de rijstrook tot het hart van de weg

/** Middellijnen van alle straten, inclusief de twee buitenste randwegen. */
export const ROAD_CENTERS = (() => {
  const out = [];
  for (let i = GRID[0] - 1; i <= GRID[GRID.length - 1]; i++) out.push((i + 0.5) * CELL);
  return out;
})();

/**
 * De straten waar verkeer op rijdt: alleen de binnenste.
 * De buitenste twee liggen op de rand van het grondvlak met aan één kant niets,
 * dus daar reden auto's zichtbaar de stad uit.
 */
export const TRAFFIC_ROADS = ROAD_CENTERS.filter(
  (p) => Math.abs(p) < (GRID.length / 2) * CELL
);

/** Tot hier staat er bebouwing. Verder dan dit hoort geen verkeer te komen. */
export const CITY_EDGE = Math.abs(GRID[0]) * CELL + BLOCK / 2;

export class City {
  constructor(textures, seed = 1337) {
    this.group = new THREE.Group();
    this.textures = textures;
    this.boxes = [];       // Box3 per gebouw, voor botsingen
    this.roads = [];       // rijlijnen voor auto's
    this.walks = [];       // looplijnen voor voetgangers
    this.crumbSpots = [];  // waar kruimels mogen liggen
    this.perches = [];     // randjes en lantaarns om op te zitten
    this.startPerch = null;
    this.bounds = (GRID.length / 2) * CELL + 6;

    const r = rng(seed);
    this._buildGround();
    this._buildBlocks(r);
    this._buildLanes();
  }

  _buildGround() {
    const span = this.bounds * 2;
    const tex = this.textures.road.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(span / 8, span / 8);

    // Geen kleur-tint op de textuur: die is al in de paletkleur getekend, en er
    // nog eens mee vermenigvuldigen maakte het wegdek vrijwel zwart.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Wegmarkering: onderbroken strepen op elke rijlijn. Puur oriëntatie,
    // maar zonder dit is een lege straat volstrekt richtingloos.
    const stripeMat = new THREE.MeshBasicMaterial({ color: C.haze, transparent: true, opacity: 0.35 });
    const stripes = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.4, 2.4),
      stripeMat,
      GRID.length * 2 * 2 * 40
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const qz = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
    const s = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (const i of roadLines()) {
      for (let t = -this.bounds; t < this.bounds; t += 5) {
        if (n + 2 > stripes.count) break;
        m.compose(new THREE.Vector3(i, 0.02, t), q, s);
        stripes.setMatrixAt(n++, m);
        m.compose(new THREE.Vector3(t, 0.02, i), qz, s);
        stripes.setMatrixAt(n++, m);
      }
    }
    stripes.count = n;
    stripes.instanceMatrix.needsUpdate = true;
    this.group.add(stripes);
  }

  _buildBlocks(r) {
    const sidewalkMat = new THREE.MeshLambertMaterial({ map: this.textures.sidewalk });
    const roofMat = new THREE.MeshLambertMaterial({ map: this.textures.roof });

    for (const gi of GRID) {
      for (const gj of GRID) {
        const cx = gi * CELL;
        const cz = gj * CELL;

        // stoep-plateau
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(BLOCK, CURB_H, BLOCK),
          sidewalkMat
        );
        slab.position.set(cx, CURB_H / 2, cz);
        slab.receiveShadow = true;
        this.group.add(slab);

        // Het middenblok blijft leeg: een plein om te starten, te landen en
        // om overzicht te hebben op je eerste seconden.
        if (gi === 0 && gj === 0) {
          this._plaza(cx, cz, r);
          continue;
        }

        this._buildingsOnBlock(cx, cz, r, roofMat);
        this._streetFurniture(cx, cz, r);
      }
    }
  }

  _buildingsOnBlock(cx, cz, r, roofMat) {
    // Eén tot vier panden per blok, in een 2x2-verdeling met wat speling.
    const count = 1 + Math.floor(r() * 4);
    const slots = shuffle([[-1, -1], [1, -1], [-1, 1], [1, 1]], r).slice(0, count);

    for (const [sx, sz] of slots) {
      const w = 7 + r() * 4;
      const d = 7 + r() * 4;
      const h = 7 + r() * 27;

      // Panden mogen niet tot over de stoeprand groeien: daar lopen de voetgangers,
      // en die liepen anders dwars door de gevels heen.
      const maxX = BUILD_LIMIT - w / 2;
      const maxZ = BUILD_LIMIT - d / 2;
      const x = cx + clamp(sx * (BLOCK / 4) + (r() - 0.5) * 2, -maxX, maxX);
      const z = cz + clamp(sz * (BLOCK / 4) + (r() - 0.5) * 2, -maxZ, maxZ);

      const facade = this.textures.facades[Math.floor(r() * this.textures.facades.length)].clone();
      facade.needsUpdate = true;
      facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
      facade.repeat.set(Math.max(1, Math.round(w / 5)), Math.max(1, Math.round(h / 5)));

      const facadeMat = new THREE.MeshLambertMaterial({ map: facade });
      // Volgorde van BoxGeometry-materialen: +X, -X, +Y, -Y, +Z, -Z.
      // Alleen het dak krijgt de daktextuur — dat is het vlak waar je op neerkijkt.
      // De dakrand zit al in die textuur getekend; een losse rand-box eroverheen
      // dekte hem juist volledig af.
      const mats = [facadeMat, facadeMat, roofMat, facadeMat, facadeMat, facadeMat];

      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      b.position.set(x, h / 2 + CURB_H, z);
      b.castShadow = true;
      b.receiveShadow = true;
      this.group.add(b);

      const box = new THREE.Box3().setFromCenterAndSize(
        b.position,
        new THREE.Vector3(w, h, d)
      );
      this.boxes.push(box);

      // Rotsduiven nestelen op kliframmen. In de stad is dat een dakrand.
      this.perches.push(new THREE.Vector3(
        x + (w / 2 - 0.8) * (r() < 0.5 ? -1 : 1),
        h + CURB_H + 0.4,
        z + (d / 2 - 0.8) * (r() < 0.5 ? -1 : 1)
      ));

    }
  }

  _plaza(cx, cz, r) {
    // Fontein in het midden: een herkenbaar startpunt en straks het thuisplein
    // waar de opdrachtmarkers omheen komen te staan.
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.4, 0.8, 8),
      new THREE.MeshLambertMaterial({ color: C.mist })
    );
    basin.position.set(cx, CURB_H + 0.4, cz);
    basin.castShadow = true;
    basin.receiveShadow = true;
    this.group.add(basin);

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 2.9, 0.1, 8),
      new THREE.MeshLambertMaterial({ color: C.cyan })
    );
    water.position.set(cx, CURB_H + 0.82, cz);
    this.group.add(water);

    // Het monument. Duiven zitten niet midden op een plein maar op het hoogste
    // randje dat ze kunnen vinden, dus dit is het startpunt: hoog genoeg voor
    // overzicht over de hele stad, en herkenbaar genoeg om naar terug te vinden.
    const column = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 9, 1.3),
      new THREE.MeshLambertMaterial({ color: C.haze })
    );
    column.position.set(cx, CURB_H + 4.9, cz);
    column.castShadow = true;
    this.group.add(column);

    const capital = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.7, 2.3),
      new THREE.MeshLambertMaterial({ color: C.bone })
    );
    capital.position.set(cx, CURB_H + 9.7, cz);
    capital.castShadow = true;
    this.group.add(capital);

    const PERCH_Y = CURB_H + 10.5;
    this.startPerch = new THREE.Vector3(cx, PERCH_Y, cz);
    this.perches.push(this.startPerch.clone());

    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = 5 + r() * 6;
      this.crumbSpots.push(new THREE.Vector3(cx + Math.cos(a) * d, CURB_H, cz + Math.sin(a) * d));
    }
  }

  _streetFurniture(cx, cz, r) {
    const edge = BLOCK / 2 - 1.2;
    for (let i = 0; i < 3; i++) {
      const along = (r() - 0.5) * BLOCK * 0.8;
      const side = r() < 0.5 ? -1 : 1;
      const onX = r() < 0.5;
      const x = cx + (onX ? along : side * edge);
      const z = cz + (onX ? side * edge : along);

      if (r() < 0.55) this._lamppost(x, z);
      else this._tree(x, z, r);

      this.crumbSpots.push(new THREE.Vector3(x + (r() - 0.5) * 4, CURB_H, z + (r() - 0.5) * 4));
    }
  }

  _lamppost(x, z) {
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 4.4, 0.22),
      new THREE.MeshLambertMaterial({ color: C.night })
    );
    pole.position.set(x, CURB_H + 2.2, z);
    pole.castShadow = true;
    this.group.add(pole);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.4, 0.7),
      new THREE.MeshBasicMaterial({ color: C.gold })
    );
    head.position.set(x, CURB_H + 4.5, z);
    this.group.add(head);

    this.perches.push(new THREE.Vector3(x, CURB_H + 5.2, z));
  }

  _tree(x, z, r) {
    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 2.2, 0.5),
      new THREE.MeshLambertMaterial({ color: C.oxblood })
    );
    trunk.position.set(x, CURB_H + 1.1, z);
    trunk.castShadow = true;
    this.group.add(trunk);

    // Bladerdek als twee versprongen blokken — leest als pixel-gebladerte,
    // en is een stuk goedkoper dan een bol.
    const c1 = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.6, 3),
      new THREE.MeshLambertMaterial({ color: C.leaf })
    );
    c1.position.set(x, CURB_H + 3, z);
    c1.castShadow = true;
    this.group.add(c1);

    const c2 = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.2, 2.1),
      new THREE.MeshLambertMaterial({ color: C.moss })
    );
    c2.position.set(x + (r() - 0.5), CURB_H + 4.1, z + (r() - 0.5));
    c2.castShadow = true;
    this.group.add(c2);
  }

  _buildLanes() {
    // Auto's rijden over de binnenste middellijnen, in beide richtingen.
    // De rijstrook ligt rechts van de rijrichting, zodat tegenliggers elkaar
    // netjes passeren in plaats van door elkaar heen te rijden.
    for (const p of TRAFFIC_ROADS) {
      for (const dir of [1, -1]) {
        this.roads.push({ axis: 'x', offset: p - LANE_OFFSET * dir, dir });
        this.roads.push({ axis: 'z', offset: p + LANE_OFFSET * dir, dir });
      }
    }

    // Voetgangers lopen langs de blokranden.
    for (const gi of GRID) {
      for (const gj of GRID) {
        const cx = gi * CELL;
        const cz = gj * CELL;
        const e = BLOCK / 2 - 1.5;
        this.walks.push({
          center: new THREE.Vector3(cx, CURB_H, cz),
          half: WALK_RING,
        });
      }
    }
  }

  /**
   * Duwt een bol uit elk gebouw waar hij in zit. Geeft true als er iets is gecorrigeerd.
   * Er wordt langs de as met de kleinste overlap geduwd, zodat je langs een gevel
   * afglijdt in plaats van erop te blijven plakken.
   */
  resolveCollision(pos, radius, outNormal = null) {
    let hit = false;
    if (outNormal) outNormal.set(0, 0, 0);
    for (const b of this.boxes) {
      if (
        pos.x < b.min.x - radius || pos.x > b.max.x + radius ||
        pos.y < b.min.y - radius || pos.y > b.max.y + radius ||
        pos.z < b.min.z - radius || pos.z > b.max.z + radius
      ) continue;

      const px = Math.min(b.max.x + radius - pos.x, pos.x - (b.min.x - radius));
      const py = Math.min(b.max.y + radius - pos.y, pos.y - (b.min.y - radius));
      const pz = Math.min(b.max.z + radius - pos.z, pos.z - (b.min.z - radius));

      if (px <= py && px <= pz) {
        const sign = pos.x > (b.min.x + b.max.x) / 2 ? 1 : -1;
        pos.x += px * sign;
        if (outNormal) outNormal.set(sign, 0, 0);
      } else if (py <= pz) {
        const sign = pos.y > (b.min.y + b.max.y) / 2 ? 1 : -1;
        pos.y += py * sign;
        if (outNormal) outNormal.set(0, sign, 0);
      } else {
        const sign = pos.z > (b.min.z + b.max.z) / 2 ? 1 : -1;
        pos.z += pz * sign;
        if (outNormal) outNormal.set(0, 0, sign);
      }
      hit = true;
    }
    return hit;
  }

  /**
   * Staat er boven dit punt nog een gebouw? De cheeky duif mag daar niet zitten:
   * haar lichtbundel loopt dan dwars door een pand, en het bereikbare stuk van die
   * koker is een sliver waar je niet in te vliegen bent.
   */
  hasClearSky(x, z, y) {
    for (const b of this.boxes) {
      if (x > b.min.x - 1 && x < b.max.x + 1 &&
          z > b.min.z - 1 && z < b.max.z + 1 &&
          b.max.y > y + 0.5) {
        return false;
      }
    }
    return true;
  }

  /** Hoogte van het eerste dak onder een punt, of de stoephoogte. */
  groundHeightAt(x, z) {
    let y = 0;
    for (const b of this.boxes) {
      if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) {
        y = Math.max(y, b.max.y);
      }
    }
    return y;
  }
}

/** Middellijnen van de straten tussen de blokken. */
function roadLines() {
  const lines = [];
  for (let i = GRID[0] - 1; i <= GRID[GRID.length - 1]; i++) {
    lines.push((i + 0.5) * CELL);
  }
  return lines;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function shuffle(arr, r) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
