// Alle texturen worden bij het opstarten op een canvas getekend. Geen PNG's.
// Voordeel: gegarandeerd consistent met het palet, nul laadtijd, en een gevel
// is een functie in plaats van een bestand dat niemand meer durft aan te raken.

import * as THREE from 'three';
import { C } from './palette.js';

// Deterministische RNG — dezelfde stad bij elke refresh, zodat een bug
// twee keer op dezelfde plek zit.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { cv, ctx };
}

function toTexture(cv, { repeat = [1, 1], transparent = false } = {}) {
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  if (transparent) tex.premultiplyAlpha = false;
  return tex;
}

function fill(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Asfalt: donkere basis met korrel, scheuren en een enkele put. */
export function roadTexture(seed = 7) {
  const S = 64;
  const { cv, ctx } = canvas(S, S);
  const r = rng(seed);
  fill(ctx, C.slate, 0, 0, S, S);

  // korrel
  for (let i = 0; i < 900; i++) {
    const x = (r() * S) | 0;
    const y = (r() * S) | 0;
    fill(ctx, r() < 0.5 ? C.night : C.steel, x, y, 1, 1);
  }
  // scheuren — losse wandelende lijnen
  for (let c = 0; c < 3; c++) {
    let x = (r() * S) | 0;
    let y = (r() * S) | 0;
    for (let i = 0; i < 26; i++) {
      fill(ctx, C.ink, x, y, 1, 1);
      x = (x + ((r() * 3) | 0) - 1 + S) % S;
      y = (y + 1) % S;
    }
  }
  // putdeksel
  if (r() < 0.6) {
    const cx = 12 + ((r() * 40) | 0);
    const cy = 12 + ((r() * 40) | 0);
    ctx.fillStyle = C.night;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(cv);
}

/** Stoep: tegels met voegen en wat vuil. */
export function sidewalkTexture(seed = 11) {
  const S = 64;
  const { cv, ctx } = canvas(S, S);
  const r = rng(seed);
  fill(ctx, C.mist, 0, 0, S, S);
  for (let i = 0; i < 500; i++) {
    fill(ctx, r() < 0.5 ? C.haze : C.steel, (r() * S) | 0, (r() * S) | 0, 1, 1);
  }
  // voegen: 16px tegels
  ctx.fillStyle = C.steel;
  for (let i = 0; i <= S; i += 16) {
    ctx.fillRect(i, 0, 1, S);
    ctx.fillRect(0, i, S, 1);
  }
  return toTexture(cv);
}

/**
 * Gevel: baksteen met ramen, waarvan een deel verlicht.
 * `lit` regelt hoeveel ramen branden — daarmee voelt de ene straat drukker dan de andere.
 */
export function facadeTexture(seed = 3, { lit = 0.35, base = C.brick } = {}) {
  const S = 64;
  const { cv, ctx } = canvas(S, S);
  const r = rng(seed);
  fill(ctx, base, 0, 0, S, S);

  // metselverband
  const bh = 4;
  const bw = 8;
  for (let y = 0; y < S; y += bh) {
    const offset = (y / bh) % 2 === 0 ? 0 : bw / 2;
    for (let x = -bw; x < S; x += bw) {
      const shade = r();
      if (shade < 0.22) fill(ctx, C.oxblood, x + offset, y, bw - 1, bh - 1);
      else if (shade > 0.88) fill(ctx, C.clay, x + offset, y, bw - 1, bh - 1);
    }
    fill(ctx, C.oxblood, 0, y, S, 1); // horizontale voeg
  }

  // ramen: raster van 2x2, 16px hart-op-hart
  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 2; gx++) {
      const x = 8 + gx * 32;
      const y = 8 + gy * 32;
      const w = 16;
      const h = 18;
      fill(ctx, C.ink, x - 1, y - 1, w + 2, h + 2); // kozijn
      const isLit = r() < lit;
      fill(ctx, isLit ? C.gold : C.night, x, y, w, h);
      if (isLit) {
        // silhouet in het raam — leeft
        if (r() < 0.4) fill(ctx, C.oxblood, x + 4 + ((r() * 6) | 0), y + 8, 4, 10);
        fill(ctx, C.bone, x, y, w, 2); // lichtstreep bovenin
      } else {
        fill(ctx, C.slate, x, y, w, 4); // reflectie in donker glas
      }
      // vensterbank
      fill(ctx, C.mist, x - 2, y + h + 1, w + 4, 2);
    }
  }
  return toTexture(cv);
}

/** Dak: grind, luchtbehandeling, dakrand. Je kijkt hier van bovenaf op neer, dus het telt. */
export function roofTexture(seed = 5) {
  const S = 64;
  const { cv, ctx } = canvas(S, S);
  const r = rng(seed);
  fill(ctx, C.oxblood, 0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    fill(ctx, r() < 0.5 ? C.ink : C.brick, (r() * S) | 0, (r() * S) | 0, 1, 1);
  }
  // dakrand
  ctx.fillStyle = C.slate;
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, S - 3, S, 3);
  ctx.fillRect(0, 0, 3, S);
  ctx.fillRect(S - 3, 0, 3, S);
  // installatiekast
  const bx = 14 + ((r() * 24) | 0);
  const by = 14 + ((r() * 24) | 0);
  fill(ctx, C.steel, bx, by, 16, 12);
  fill(ctx, C.mist, bx, by, 16, 2);
  fill(ctx, C.ink, bx, by + 12, 16, 1);
  return toTexture(cv);
}

/** Splat-decal met alfa. Wordt op straat geprojecteerd en blijft liggen. */
export function splatTexture(seed = 21) {
  const S = 32;
  const { cv, ctx } = canvas(S, S);
  const r = rng(seed);
  ctx.clearRect(0, 0, S, S);

  const blob = (cx, cy, rad, color) => {
    ctx.fillStyle = color;
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= rad - 0.5 + (r() - 0.5) * 1.6) ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  };

  blob(16, 16, 7, C.bone);
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const dist = 7 + r() * 6;
    blob(16 + Math.cos(a) * dist, 16 + Math.sin(a) * dist, 1 + r() * 2, C.bone);
  }
  blob(14, 14, 3, C.haze); // glans

  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Eén keer opbouwen, daarna hergebruiken. */
export function buildTextures() {
  return {
    road: roadTexture(7),
    sidewalk: sidewalkTexture(11),
    roof: roofTexture(5),
    facades: [
      facadeTexture(31, { lit: 0.30, base: C.brick }),
      facadeTexture(47, { lit: 0.45, base: C.oxblood }),
      facadeTexture(59, { lit: 0.22, base: C.steel }),
      facadeTexture(73, { lit: 0.55, base: C.slate }),
    ],
    splat: splatTexture(21),
  };
}
