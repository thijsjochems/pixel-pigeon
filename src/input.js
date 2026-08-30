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

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set(); // alleen deze frame — voor acties die niet mogen herhalen

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
    this._onBlur = () => this.down.clear(); // anders blijft een toets "hangen" na alt-tab
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

    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
    target.addEventListener('mousedown', this._onMouseDown);
    target.addEventListener('mouseup', this._onMouseUp);
    target.addEventListener('contextmenu', this._onContextMenu);
    this._target = target;
  }

  /** Wordt de actie op dit moment ingedrukt gehouden? */
  held(action) {
    const keys = KEYMAP[action];
    if (action === 'poop' && this.down.has('Mouse0')) return true;
    return keys.some((k) => this.down.has(k));
  }

  /** Is de actie deze stap ingedrukt? Eén keer per fysieke druk, auto-repeat telt niet mee. */
  hit(action) {
    const keys = KEYMAP[action];
    if (action === 'poop' && this.pressed.has('Mouse0')) return true;
    return keys.some((k) => this.pressed.has(k));
  }

  /** Stuurwaarde: -1 links, +1 rechts. */
  get turn() {
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
  }

  /** Gas: +1 versnellen, -1 remmen. */
  get throttle() {
    return (this.held('thrust') ? 1 : 0) - (this.held('brake') ? 1 : 0);
  }

  /** Aan het eind van elke simulatiestap aanroepen. */
  endStep() {
    this.pressed.clear();
  }

  dispose() {
    const t = this._target;
    t.removeEventListener('keydown', this._onKeyDown);
    t.removeEventListener('keyup', this._onKeyUp);
    t.removeEventListener('blur', this._onBlur);
    t.removeEventListener('mousedown', this._onMouseDown);
    t.removeEventListener('mouseup', this._onMouseUp);
    t.removeEventListener('contextmenu', this._onContextMenu);
  }
}
