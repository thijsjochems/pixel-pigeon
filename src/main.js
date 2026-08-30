// Opstarten, de lus, en de pixel-look.
//
// De pixel-look komt hier vandaan: er wordt gerenderd op een kleine buffer
// (ongeveer 384x216) die door CSS met harde randen wordt opgeschaald. Dat is de
// hele truc — niet een pixeltextuur op een render in volledige resolutie.

// Het arcade-lettertype wordt meegebundeld in plaats van van een CDN gehaald,
// zodat het spel offline hetzelfde blijft.
import '@fontsource/press-start-2p';
import * as THREE from 'three';
import { Input } from './input.js';
import { Game } from './game.js';
import { predictImpact, predictPassThrough } from './poop.js';

const RENDER_HEIGHT = 224;   // interne resolutie; lager = groter pixels
const STEP = 1 / 60;         // vaste simulatiestap, op elke monitor gelijk
const MAX_STEPS = 5;         // bij een hapering liever traag dan een spiraal

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const hudEl = document.getElementById('hud');

const renderer = new THREE.WebGLRenderer({
  antialias: false,          // antialiasing zou de pixels juist wegpoetsen
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;  // bewust niet 'soft': blokkerig past
app.appendChild(renderer.domElement);

const input = new Input(window);
const game = new Game(input, overlay, hudEl);

// Browsers laten geen geluid toe voordat de speler iets heeft aangeraakt, en die
// toestemming moet in de gebeurtenis zelf worden opgehaald - niet in de renderlus.
const unlockAudio = () => game.audio.unlock();
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('mousedown', unlockAudio, { once: true });

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  const aspect = w / h;

  // Even aantal pixels, anders krijg je een halve pixel-rij bij het opschalen.
  const rh = RENDER_HEIGHT;
  const rw = Math.max(2, Math.round((rh * aspect) / 2) * 2);

  renderer.setSize(rw, rh, false);   // false: laat de CSS-grootte met rust
  game.resize(aspect);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);

  // Een tab die op de achtergrond stond levert een enorme dt op. Afkappen.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (game.fx.hitstop > 0) {
    // Bevriezing bij een treffer: de wereld staat stil, het beeld niet.
    game.fx.hitstop -= dt;
    acc = Math.min(acc, STEP);
  } else {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      game.step(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;   // achterstand niet meeslepen
  }

  game.updateCamera(dt);
  game.updateOverlay(dt, app.clientWidth, app.clientHeight);
  renderer.render(game.scene, game.camera);
}
requestAnimationFrame(frame);

// Handig tijdens het afstellen van het vliegmodel, en de haak waarmee de
// browsertests de baanberekening naast de echte inslag leggen.
window.game = game;
window.__predict = predictImpact;
window.__predictAt = predictPassThrough;
