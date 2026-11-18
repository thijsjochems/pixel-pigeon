// Besturing. Vliegtuigmodel: draaien + gas, in plaats van absoluut sturen.
// Reden: een meedraaiende camera plus camera-relatieve input geeft een
// terugkoppellus waarin de duif ongevraagd bochten maakt. Dit heeft dat probleem niet,
// en het voelt bovendien meer als vliegen dan als een zwevend blokje verplaatsen.

const KEYMAP = {
  thrust: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  flap: ['Space'],
  dive: ['ShiftLeft', 'ShiftRight'],
  poop: ['KeyE', 'ControlLeft', 'ControlRight'],
  restart: ['KeyR'],
  mute: ['KeyM'],
};

// Toetsen die de pagina zouden laten scrollen of iets anders zouden doen.
const SWALLOW = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

// Touch: een zwevende stick onder je vinger. Waar je duim neerkomt is het midden;
// slepen ten opzichte van dat punt stuurt. Alle afstanden in CSS-pixels.
export const TOUCH = {
  TAP_MOVE: 14,       // binnen deze afstand en...
  TAP_TIME: 0.28,     // ...binnen deze tijd (s) is loslaten een tik, geen sleep
  STEER_DEAD: 6,      // kleine trilling van je duim stuurt niet
  STEER_FULL: 70,     // zoveel opzij is volle uitslag
  FLAP_UP: 34,        // zoveel omhoog is klapwieken (ingedrukt houden, zelfde ritme als Space)
  DIVE_DOWN: 44,      // zoveel omlaag is duiken
};

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set(); // alleen deze frame — voor acties die niet mogen herhalen

    // Actieve vingers op identifier. De oudste vinger die nog ligt is de stick; een
    // tweede vinger kan dus tikken (poepen) terwijl de eerste blijft sturen.
    this.touches = new Map();
    this.touchUsed = false;   // ooit aangeraakt: dan tonen schermen 'tap' in plaats van toetsen
    this._tap = false;        // deze stap een tik gezien
    this._tapFlap = false;    // de game heeft de tik omgezet in een klap (opstijgen)
    this.stick = { active: false, x0: 0, y0: 0, x: 0, y: 0 };

    this._onKeyDown = (e) => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (e.repeat) return; // auto-repeat telt niet als nieuwe druk
      this.down.add(e.code);
      this.pressed.add(e.code);
    };
    this._onKeyUp = (e) => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      this.down.delete(e.code);
    };
    this._onBlur = () => {   // anders blijft een toets of vinger "hangen" na alt-tab
      this.down.clear();
      this.touches.clear();
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) {
        this.down.add('Mouse0');
        this.pressed.add('Mouse0');
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.down.delete('Mouse0');
    };
    this._onContextMenu = (e) => e.preventDefault();

    // preventDefault op touchstart en touchend: geen scrollen, geen knijpzoom, geen
    // vergrootglas of tekstselectie bij lang drukken, en vooral geen nagemaakte
    // mousedown na een tik. Die zou anders als tweede poep tellen.
    this._onTouchStart = (e) => {
      e.preventDefault();
      this.touchUsed = true;
      const now = performance.now() / 1000;
      for (const t of e.changedTouches) {
        this.touches.set(t.identifier, {
          x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY,
          t0: now, moved: false,
        });
      }
    };
    this._onTouchMove = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const f = this.touches.get(t.identifier);
        if (!f) continue;
        f.x = t.clientX;
        f.y = t.clientY;
        if (Math.hypot(f.x - f.x0, f.y - f.y0) > TOUCH.TAP_MOVE) f.moved = true;
      }
    };
    this._onTouchEnd = (e) => {
      e.preventDefault();
      const now = performance.now() / 1000;
      for (const t of e.changedTouches) {
        const f = this.touches.get(t.identifier);
        if (!f) continue;
        this.touches.delete(t.identifier);
        if (e.type === 'touchcancel') continue;
        if (!f.moved && now - f.t0 <= TOUCH.TAP_TIME) this._tap = true;
      }
    };

    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
    target.addEventListener('mousedown', this._onMouseDown);
    target.addEventListener('mouseup', this._onMouseUp);
    target.addEventListener('contextmenu', this._onContextMenu);
    const active = { passive: false };   // anders mag preventDefault niet
    target.addEventListener('touchstart', this._onTouchStart, active);
    target.addEventListener('touchmove', this._onTouchMove, active);
    target.addEventListener('touchend', this._onTouchEnd, active);
    target.addEventListener('touchcancel', this._onTouchEnd, active);
    this._target = target;
  }

  /** Wordt de actie op dit moment ingedrukt gehouden? */
  held(action) {
    const keys = KEYMAP[action];
    if (action === 'poop' && (this.down.has('Mouse0') || this._tapPoop)) return true;
    if (action === 'flap' && (this._tapFlap || this._stickY() <= -TOUCH.FLAP_UP)) return true;
    if (action === 'dive' && this._stickY() >= TOUCH.DIVE_DOWN) return true;
    return keys.some((k) => this.down.has(k));
  }

  /** Is de actie deze stap ingedrukt? Eén keer per fysieke druk, auto-repeat telt niet mee. */
  hit(action) {
    const keys = KEYMAP[action];
    if (action === 'poop' && (this.pressed.has('Mouse0') || this._tapPoop)) return true;
    if (action === 'flap' && this._tapFlap) return true;
    return keys.some((k) => this.pressed.has(k));
  }

  /** Ligt er een vinger die al als sleep telt? */
  get dragging() {
    const f = this._stickFinger();
    return !!f && f.moved;
  }

  /** Is er deze stap met een vinger getikt (en nog niet omgezet in een klap)? */
  get tapped() {
    return this._tap;
  }

  /**
   * Zet de tik van deze stap om in een klap in plaats van een poep. De game doet dit
   * als de duif zit: dan is een tik opstijgen, net als Space.
   */
  tapToFlap() {
    if (!this._tap) return;
    this._tapFlap = true;
  }

  get _tapPoop() {
    return this._tap && !this._tapFlap;
  }

  /** De vinger die stuurt: de oudste die nog op het scherm ligt. */
  _stickFinger() {
    for (const f of this.touches.values()) return f;   // Map houdt invoegvolgorde aan
    return null;
  }

  /** Verticale uitslag van de stick in px, omlaag is positief. */
  _stickY() {
    const f = this._stickFinger();
    return f ? f.y - f.y0 : 0;
  }

  /** Stuurwaarde: -1 links, +1 rechts. Met een vinger traploos daartussen. */
  get turn() {
    const keys = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    if (keys !== 0) return keys;
    const f = this._stickFinger();
    if (!f) return 0;
    const dx = f.x - f.x0;
    const mag = Math.abs(dx) - TOUCH.STEER_DEAD;
    if (mag <= 0) return 0;
    return Math.sign(dx) * Math.min(1, mag / (TOUCH.STEER_FULL - TOUCH.STEER_DEAD));
  }

  /** Stand van de stick voor de HUD; active is false als er geen vinger ligt. */
  stickState() {
    const f = this._stickFinger();
    const s = this.stick;
    s.active = !!f;
    if (f) {
      s.x0 = f.x0; s.y0 = f.y0; s.x = f.x; s.y = f.y;
    }
    return s;
  }

  /** Gas: +1 versnellen, -1 remmen. */
  get throttle() {
    const keys = (this.held('thrust') ? 1 : 0) - (this.held('brake') ? 1 : 0);
    if (keys !== 0) return keys;
    // Op de telefoon is er geen gasknop. Zolang je stuurvinger ligt geef je gas, zoals
    // een toetsenbordspeler W vasthoudt; laat je los, dan zakt de duif vanzelf terug
    // naar kruissnelheid. Dat is het moment om rustig te mikken en te tikken.
    return this.dragging ? 1 : 0;
  }

  /** Aan het eind van elke simulatiestap aanroepen. */
  endStep() {
    this.pressed.clear();
    this._tap = false;
    this._tapFlap = false;
  }

  dispose() {
    const t = this._target;
    t.removeEventListener('keydown', this._onKeyDown);
    t.removeEventListener('keyup', this._onKeyUp);
    t.removeEventListener('blur', this._onBlur);
    t.removeEventListener('mousedown', this._onMouseDown);
    t.removeEventListener('mouseup', this._onMouseUp);
    t.removeEventListener('contextmenu', this._onContextMenu);
    t.removeEventListener('touchstart', this._onTouchStart);
    t.removeEventListener('touchmove', this._onTouchMove);
    t.removeEventListener('touchend', this._onTouchEnd);
    t.removeEventListener('touchcancel', this._onTouchEnd);
  }
}
