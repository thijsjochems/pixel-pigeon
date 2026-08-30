// HUD als DOM-overlay boven het canvas. Bewust niet in 3D: op 384x224 is
// leesbare tekst onmogelijk, en de speler moet klok, score en munitie in één
// oogopslag kunnen zien.

import { AMMO_MAX, FED_TIME } from './targets.js';
import { FLIGHT } from './pigeon.js';
import { CHEEKY_TIME } from './mate.js';

/**
 * Rangen, oplopend. De hoogste is vernoemd naar Cher Ami, de postduif die in 1918
 * zwaargewond het bericht bezorgde dat het Lost Battalion redde en daarvoor de
 * Croix de Guerre kreeg. Als je een duif bad-ass wilt maken: dat is de lat.
 */
const RANKS = [
  [0, 'Gutter Scrounger'],
  [1500, 'Plaza Regular'],
  [4000, 'Rooftop Veteran'],
  [8000, 'City Menace'],
  [14000, 'Airborne Havoc'],
  [22000, 'CHER AMI'],
];

function rankFor(score) {
  let name = RANKS[0][1];
  for (const [min, label] of RANKS) if (score >= min) name = label;
  return name;
}

export class HUD {
  constructor(root) {
    root.innerHTML = `
      <div class="hud-top">
        <div class="score-wrap">
          <div class="score" id="score">0</div>
          <div class="combo" id="combo"></div>
        </div>
        <div class="clock-wrap">
          <div class="clock" id="clock">60</div>
          <div class="clock-label" id="clock-label">seconds</div>
        </div>
        <div class="best-wrap">
          <div class="best-label">best</div>
          <div class="best" id="best">0</div>
        </div>
      </div>

      <div class="hud-bottom">
        <div class="ammo" id="ammo"></div>
        <div class="meter" title="stamina">
          <div class="meter-fill" id="stamina"></div>
        </div>
        <div class="buff" id="buff">
          <span class="buff-label">SANDWICH</span>
          <span class="buff-bar"><span class="buff-fill" id="buff-fill"></span></span>
        </div>
        <div class="readout" id="readout"></div>
      </div>

      <div class="hint" id="hint">
        <b>W</b> throttle &nbsp; <b>A/D</b> steer &nbsp; <b>Space</b> flap &nbsp;
        <b>Shift</b> dive &nbsp; <b>E / click</b> drop &nbsp; <b>R</b> restart &nbsp; <b>M</b> sound
        <div class="hint-sub">Speed is altitude. Perch on a roof to get your breath back.</div>
      </div>

      <div class="mate-marker" id="mate-marker">
        <div class="mate-arrow" id="mate-arrow"></div>
        <div class="mate-heart">&#9829;</div>
        <div class="mate-dist" id="mate-dist"></div>
      </div>

      <div class="flash" id="flash"></div>
      <div class="cheeky-vignette" id="cheeky-vignette"></div>
      <div class="cheeky" id="cheeky">
        <div class="cheeky-title">CHEEKY PIGEON TIME</div>
        <div class="cheeky-sub">free ammo &middot; double points &middot; hold to fire</div>
        <div class="cheeky-bar"><div class="cheeky-bar-fill" id="cheeky-bar"></div></div>
      </div>

      <div class="screen" id="screen">
        <div class="screen-inner">
          <div class="screen-title" id="screen-title"></div>
          <div class="screen-body" id="screen-body"></div>
          <div class="screen-cta" id="screen-cta"></div>
        </div>
      </div>
    `;

    this.el = {
      score: root.querySelector('#score'),
      combo: root.querySelector('#combo'),
      clock: root.querySelector('#clock'),
      clockLabel: root.querySelector('#clock-label'),
      best: root.querySelector('#best'),
      ammo: root.querySelector('#ammo'),
      stamina: root.querySelector('#stamina'),
      readout: root.querySelector('#readout'),
      buff: root.querySelector('#buff'),
      buffFill: root.querySelector('#buff-fill'),
      hint: root.querySelector('#hint'),
      flash: root.querySelector('#flash'),
      mate: root.querySelector('#mate-marker'),
      mateArrow: root.querySelector('#mate-arrow'),
      mateDist: root.querySelector('#mate-dist'),
      cheeky: root.querySelector('#cheeky'),
      cheekyBar: root.querySelector('#cheeky-bar'),
      cheekyVignette: root.querySelector('#cheeky-vignette'),
      screen: root.querySelector('#screen'),
      screenTitle: root.querySelector('#screen-title'),
      screenBody: root.querySelector('#screen-body'),
      screenCta: root.querySelector('#screen-cta'),
    };

    this.pips = [];
    for (let i = 0; i < AMMO_MAX; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip';
      this.el.ammo.appendChild(pip);
      this.pips.push(pip);
    }

    this._score = -1;
    this._ammo = -1;
    this._combo = -1;
    this._clock = -1;
    this._best = -1;
    this._phase = null;
    this._hintGone = false;
    this._mateDist = -1;
  }

  update(state, pigeon) {
    this._updatePhase(state);

    if (state.score !== this._score) {
      this.el.score.textContent = String(state.score);
      // Even opblazen bij elke scorewijziging — de teller mag niet stil aanvoelen.
      this.el.score.classList.remove('bump');
      void this.el.score.offsetWidth; // reflow forceren zodat de animatie herstart
      this.el.score.classList.add('bump');
      this._score = state.score;
    }

    if (state.best !== this._best) {
      this.el.best.textContent = String(state.best);
      this._best = state.best;
    }

    // De klok is het belangrijkste getal in beeld, dus die krijgt de meeste nadruk.
    const whole = Math.ceil(state.timeLeft);
    if (whole !== this._clock) {
      this.el.clock.textContent = String(whole);
      this._clock = whole;
    }
    this.el.clock.classList.toggle('urgent', state.timeLeft <= 10 && state.phase === 'playing');
    // Laat zien dat de klok sneller gaat lopen, anders lijkt het willekeurig.
    const snel = state.drain > 1.15 && state.phase === 'playing';
    if (snel !== this._snel) {
      this.el.clockLabel.classList.toggle('fast', snel);
      this._snel = snel;
    }
    if (snel) this.el.clockLabel.textContent = `seconds  x${state.drain.toFixed(1)}`;
    else if (this.el.clockLabel.textContent !== 'seconds') this.el.clockLabel.textContent = 'seconds';
    this.el.clock.classList.toggle('gain', state.timeGain > 0);

    if (state.multiplier !== this._combo) {
      this.el.combo.textContent = state.multiplier > 1 ? `x${state.multiplier}` : '';
      this.el.combo.classList.toggle('hot', state.multiplier >= 4);
      this._combo = state.multiplier;
    }
    // De comboklok loopt zichtbaar leeg, zodat je voelt dat je haast hebt.
    this.el.combo.style.opacity = state.multiplier > 1
      ? String(0.35 + 0.65 * Math.min(1, state.comboTimer / 2))
      : '0';

    if (state.ammo !== this._ammo) {
      this.pips.forEach((p, i) => p.classList.toggle('empty', i >= state.ammo));
      this._ammo = state.ammo;
    }

    const stam = pigeon.stamina / FLIGHT.STAMINA_MAX;
    this.el.stamina.style.width = `${(stam * 100).toFixed(1)}%`;
    this.el.stamina.classList.toggle('low', stam < 0.3);
    // Gouden balk zolang je vol zit: je ziet aan je eigen meter dat je sterker bent.
    this.el.stamina.classList.toggle('fed', state.fed > 0);

    const fed = state.fed > 0;
    this.el.buff.classList.toggle('on', fed);
    if (fed) this.el.buffFill.style.width = `${(state.fed / FED_TIME) * 100}%`;

    // Een zittende duif vliegt niet te langzaam, die zit gewoon.
    const stalling = pigeon.speed < FLIGHT.STALL_SPEED * 1.15
      && !pigeon.grounded && !pigeon.perched;
    this.el.readout.textContent =
      `${(pigeon.speed * 3.6).toFixed(0)} km/h  ·  ${pigeon.pos.y.toFixed(0)} m` +
      (stalling ? '  ·  TOO SLOW' : '') +
      (state.muted ? '  ·  SOUND OFF' : '');
    this.el.readout.classList.toggle('warn', stalling);

    if (state.phase === 'playing' && state.elapsed > 14 && !this._hintGone) {
      this.el.hint.classList.add('gone');
      this._hintGone = true;
    }

    const cheeky = state.cheeky > 0;
    this.el.cheeky.classList.toggle('on', cheeky);
    this.el.cheekyVignette.classList.toggle('on', cheeky);
    if (cheeky) {
      this.el.cheekyBar.style.width = `${(state.cheeky / CHEEKY_TIME) * 100}%`;
    }

    if (state.flash > 0) {
      this.el.flash.style.opacity = String(Math.min(0.5, state.flash * 0.5));
    } else if (this.el.flash.style.opacity !== '0') {
      this.el.flash.style.opacity = '0';
    }
  }

  /**
   * Wijzer naar de cheeky duif.
   *
   * Een baken in de wereld is niet genoeg: de camera kijkt omlaag naar de richtring,
   * dus alles wat hoog in de lucht hangt valt vaak boven het beeld. En achter je zie
   * je sowieso niets. Deze wijzer plakt aan de schermrand zolang ze buiten beeld is,
   * met de afstand erbij, zodat je binnen zestig seconden een besluit kunt nemen.
   */
  updateMate(mate, camera, pigeonPos, width, height, vec) {
    if (!mate.active) {
      this.el.mate.classList.remove('on');
      return;
    }
    vec.copy(mate.pos);
    vec.y += 1.5;
    vec.project(camera);

    let x = vec.x;
    let y = vec.y;
    const achter = vec.z > 1;
    if (achter) { x = -x; y = -y; }

    // Grenzen van het gebied waarbinnen de wijzer mag staan. Bovenin minder ruimte,
    // want daar staan score, klok en topscore al.
    const EDGE_X = 0.90;
    const EDGE_TOP = 0.58;
    const EDGE_BOTTOM = 0.60;   // blijft boven munitie en conditiebalk
    const limitY = y > 0 ? EDGE_TOP : EDGE_BOTTOM;
    const buitenBeeld = achter || Math.abs(x) > EDGE_X || Math.abs(y) > limitY;
    if (buitenBeeld) {
      // Op de rand plakken, maar wel in de goede richting.
      const schaal = Math.min(
        Math.abs(x) > 1e-4 ? EDGE_X / Math.abs(x) : Infinity,
        Math.abs(y) > 1e-4 ? limitY / Math.abs(y) : Infinity
      );
      if (Number.isFinite(schaal)) { x *= schaal; y *= schaal; }
      else { x = 0; y = -EDGE_BOTTOM; }
    }

    const sx = (x * 0.5 + 0.5) * width;
    const sy = (-y * 0.5 + 0.5) * height;
    this.el.mate.style.transform = `translate(-50%,-50%) translate(${sx}px,${sy}px)`;
    this.el.mate.classList.add('on');
    this.el.mate.classList.toggle('far', buitenBeeld);

    // Pijl wijst naar buiten toe, richting haar. Schermruimte heeft y omlaag.
    const hoek = Math.atan2(-y, x);
    this.el.mateArrow.style.transform = `rotate(${hoek}rad)`;

    const d = Math.round(pigeonPos.distanceTo(mate.pos));
    if (d !== this._mateDist) {
      this.el.mateDist.textContent = `${d}m`;
      this._mateDist = d;
    }
  }

  /** Start- en eindscherm. Alleen bij een faseovergang aanraken. */
  _updatePhase(state) {
    if (state.phase === this._phase) return;
    this._phase = state.phase;
    const el = this.el;

    if (state.phase === 'ready') {
      el.screenTitle.innerHTML = 'PIXEL<br>PIGEON';
      el.screenBody.innerHTML = `
        <p>You are a pigeon on a monument. The city is not yours, but they don't know that yet.</p>
        <p><b>Every hit puts time back on the clock.</b> Stop hitting things and you stop playing.</p>
        <p>Somewhere out there sits a pigeon with a <b style="color:var(--crimson)">heart</b>
        above her. Go say hello.</p>
      `;
      el.screenCta.innerHTML = 'Press <b>Space</b> to take off';
      el.screen.classList.remove('hidden', 'over');
      return;
    }

    if (state.phase === 'playing') {
      el.screen.classList.add('hidden');
      return;
    }

    // over
    const acc = state.hits > 0 ? Math.round(state.score / state.hits) : 0;
    el.screenTitle.textContent = state.newRecord ? 'NEW RECORD!' : "TIME'S UP";
    el.screenBody.innerHTML = `
      <div class="stat-big">${state.score}</div>
      <div class="rank">${rankFor(state.score)}</div>
      <div class="stats">
        <span>${state.hits} hits</span>
        <span>best chain x${Math.max(1, state.bestChain)}</span>
        <span>${acc} per hit</span>
        <span>${state.cheekyCount}x cheeky</span>
        <span>${state.flushes} flocks flushed</span>
        <span>${state.flockHits} flock hits</span>
        <span>${state.grazes} near misses</span>
      </div>
      <div class="stat-best">${state.newRecord ? 'new personal best' : `best ever: ${state.best}`}</div>
    `;
    el.screenCta.innerHTML = 'Press <b>R</b> to go again';
    el.screen.classList.remove('hidden');
    el.screen.classList.add('over');
  }

  reset() {
    this._score = -1;
    this._ammo = -1;
    this._combo = -1;
    this._clock = -1;
    this._best = -1;
    this._hintGone = false;
    this.el.hint.classList.remove('gone');
  }
}
