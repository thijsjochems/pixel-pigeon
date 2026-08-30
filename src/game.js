// Bindt alles samen: wereld, duif, projectielen, effecten, score en de ronde.
// De simulatie draait op een vaste stap; main.js bepaalt wanneer die stap valt.
//
// De ronde is wat hiervan een spel maakt in plaats van een zandbak. Er staat een klok,
// en elke treffer zet er tijd bij. Je speelt dus niet tegen een timer maar tegen je
// eigen tempo: stoppen met raken is stoppen met spelen. Dat is de hele haak.

import * as THREE from 'three';
import { SKY, C } from './palette.js';
import { buildTextures } from './textures.js';
import { City } from './city.js';
import { TargetManager, AMMO_MAX, Car, FED_TIME, GRAZE_SCORE } from './targets.js';
import { Pigeon, FLIGHT } from './pigeon.js';
import { PoopSystem, predictImpact, predictPassThrough } from './poop.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { Mate, CHEEKY_TIME } from './mate.js';
import { FlockManager } from './flock.js';

export const ROUND_TIME = 60;      // startkapitaal in seconden
const TIME_CAP = 50;               // je kunt niet oneindig sparen
const SNIPE_TIME = 0.6;            // extra tijd voor een treffer van grote hoogte

// De klok loopt steeds sneller leeg. Zonder dit eindigt een ronde nooit: raken werd
// zo betrouwbaar dat een treffer per twee seconden al genoeg was om de klok stil te
// zetten, en dan speel je een uur door. Met een oplopende afloop ligt er altijd een
// eind aan de ronde, en wordt vaardigheid beloond met een langere ronde in plaats van
// met een oneindige.
const DRAIN_RAMP = 70;             // na zoveel seconden loopt de klok twee keer zo snel
const COMBO_WINDOW = 2.0;
const MAX_MULTIPLIER = 8;
const SNIPE_HEIGHT = 16;           // valhoogte waarboven een treffer dubbel telt
const CRUMB_PICKUP_R = 1.4;
const AMMO_REGEN = 2.0;      // seconden per poep die vanzelf aangroeit
const CRUMB_AMMO = 2;        // een kruimel levert er meteen twee op
const RAPID_FIRE = 0.09;     // seconden tussen twee poepen tijdens cheeky pigeon time
const CHEEKY_SCORE = 2;      // puntenvermenigvuldiger tijdens de power-up
const HIT_HEIGHT = 1.1;      // hoogte waarop je een auto of voetganger raakt
const LEAD_RANGE = 22;       // tot zover zoekt de HUD naar het doel waar je op mikt
const GROUND_REF = new THREE.Vector3();
const FED_AMMO_REGEN = 0.55; // met een volle krop maak je veel sneller nieuwe munitie
const FLUSH_POINTS = 60;     // wat het opjagen van een zwerm zelf al waard is
const FLUSH_TIME = 1.0;

export class Game {
  constructor(input, overlayEl, hudEl) {
    this.input = input;
    this.audio = new Audio();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    // Mist verstopt de rand van de stad en geeft diepte aan een verder platte skyline.
    // De mistkleur moet gelijk zijn aan de lucht, anders vervaagt de verte naar een
    // andere kleur dan de horizon en krijg je een harde rand.
    this.scene.fog = new THREE.Fog(SKY, 80, 320);

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 500);
    this.camera.position.set(0, 18, -14);

    this._setupLights();

    this.textures = buildTextures();
    this.city = new City(this.textures);
    this.scene.add(this.city.group);

    this.targets = new TargetManager(this.city);
    this.scene.add(this.targets.group);
    this.scene.add(this.targets.crumbGroup);

    this.pigeon = new Pigeon();
    this.scene.add(this.pigeon.mesh);

    this.mate = new Mate(this.city);
    this.scene.add(this.mate.group);

    this.flocks = new FlockManager(this.city);
    this.scene.add(this.flocks.group);

    this.poop = new PoopSystem(this.city, this.targets);
    this.scene.add(this.poop.group);

    this.fx = new FX(this.textures.splat, overlayEl);
    this.scene.add(this.fx.group);

    this.hud = new HUD(hudEl);

    this.state = {
      phase: 'ready',        // ready -> playing -> over
      score: 0,
      ammo: AMMO_MAX,
      ammoTimer: AMMO_REGEN,
      multiplier: 1,
      chain: 0,
      bestChain: 0,
      hits: 0,
      comboTimer: 0,
      timeLeft: ROUND_TIME,
      drain: 1,
      elapsed: 0,
      intensity: 0,          // 0 aan het begin, 1 zodra de startklok op zou zijn
      flash: 0,
      timeGain: 0,           // knippert kort als je tijd verdient
      best: Number(localStorage.getItem('pp3d.best') || 0),
      newRecord: false,
      muted: false,
      fed: 0,              // resterende seconden na een boterham
      cheeky: 0,           // resterende seconden CHEEKY PIGEON TIME
      cheekyCount: 0,
      flushes: 0,
      flockHits: 0,
      grazes: 0,
    };
    this._lastTick = -1;
    this._rapidTimer = 0;

    this.poop.onTargetHit = (t, at, info) => this._onTargetHit(t, at, info);
    this.poop.onGraze = (t, at, info) => this._onGraze(t, at, info);
    this.poop.onSplat = (at) => this._onSplat(at);

    this._camLook = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._shake = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._aimHit = new THREE.Vector3();
    this._lead = new THREE.Vector3();
    this._leadFrom = new THREE.Vector3();
    this._wasLocked = false;
    this._camReady = false;

    this.pigeon.perchOn(this.city.startPerch);
  }

  _setupLights() {
    // Zacht basislicht zodat schaduwvlakken niet dichtslaan...
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    // ...en een hemellicht dat de bovenkanten warm en de onderkanten koel houdt.
    this.scene.add(new THREE.HemisphereLight(0xf2f4ff, 0x303a5c, 0.7));

    const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    // Krappe schaduwcamera die met de duif meereist. Een frustum over de hele stad
    // zou per texel meters beslaan en dus geen schaduw meer opleveren.
    const R = 42;
    sun.shadow.camera.left = -R;
    sun.shadow.camera.right = R;
    sun.shadow.camera.top = R;
    sun.shadow.camera.bottom = -R;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.06;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    this.sunOffset = new THREE.Vector3(48, 90, 34);
  }

  /** Eén simulatiestap. dt is altijd hetzelfde getal. */
  step(dt) {
    const s = this.state;
    s.elapsed += dt;

    if (this.input.hit('mute')) s.muted = this.audio.toggleMute();
    if (this.input.hit('restart')) this.reset();

    // Op het titelscherm vliegt de duif gewoon door; de eerste actie start de ronde.
    if (s.phase === 'ready' && this._wantsStart()) this._startRound();

    if (s.phase === 'playing') {
      s.drain = 1 + s.elapsed / DRAIN_RAMP;
      s.timeLeft -= dt * s.drain;
      s.intensity = Math.min(1, s.elapsed / ROUND_TIME);
      this._countdownAudio(s);
      if (s.timeLeft <= 0) {
        s.timeLeft = 0;
        this._endRound();
      }
    }
    s.timeGain = Math.max(0, s.timeGain - dt * 2);

    this.pigeon.update(dt, this.input, this.city);
    this.targets.update(dt, s.intensity);

    // De cheeky duif zit ergens op een randje te wachten. Raak je haar aan, dan
    // gaat de power-up aan en verhuist ze naar een andere plek in de stad.
    if (this.mate.update(dt, this.pigeon.pos) && s.phase === 'playing') {
      this._startCheeky();
    }

    // Zwermen opjagen. Wat zij vervolgens raken telt voor jou.
    const opgeschrikt = this.flocks.update(dt, this.pigeon.pos, this.poop, this.targets);
    if (opgeschrikt) this._onFlush(opgeschrikt);
    if (s.cheeky > 0) {
      s.cheeky = Math.max(0, s.cheeky - dt);
      if (s.cheeky === 0) this.audio.cheekyEnd();
    }
    s.fed = Math.max(0, s.fed - dt);

    this.poop.update(dt);
    this.fx.update(dt);

    if (s.phase === 'playing') this._playerActions(dt, s);

    // Richtring bijwerken. Staat ook op het titelscherm aan, zodat je meteen ziet
    // wat de knop gaat doen voordat je 'm indrukt.
    // Niet richten terwijl je zit: je mikt dan recht op je eigen zitplaats, en op
    // het titelscherm trekt de meekijkende camera de duif achter de titel weg.
    const aiming = s.phase !== 'over' && !this.pigeon.grounded && !this.pigeon.perched;
    this.fx.reticle.visible = aiming;
    this._aimValid = aiming;
    if (aiming) {
      // De valtijd gaat mee naar de treffercheck: de ring moet rood worden als het
      // doel er straks staat, niet als het er nu staat.
      predictImpact(this.pigeon, this.city, this._aim);
      // De ring staat op de grond, maar een auto of voetganger raak je hoger.
      // Voor de vraag of je raakt kijken we dus naar waar de baan ROOF_HEIGHT
      // passeert, en naar waar het doel op dat moment staat.
      const tHit = predictPassThrough(this.pigeon, this._aim.y + HIT_HEIGHT, this._aimHit);
      const locked = !!this.targets.aimingAt(this._aimHit.x, this._aimHit.z, tHit);
      this.fx.reticle.update(dt, this._aim, locked);

      // Spookdoel: waar staat het dichtstbijzijnde doel als je poep aankomt.
      const doel = this.targets.nearestTo(this._aimHit.x, this._aimHit.z, LEAD_RANGE);
      if (doel) {
        doel.futurePosition(tHit, this._lead);
        this._lead.y = this.city.groundHeightAt(this._lead.x, this._lead.z) + 0.07;
        this._leadFrom.copy(doel.mesh.position).setY(this._lead.y);
        this.fx.lead.visible = true;
        this._leadValid = true;
        this.fx.lead.update(dt, this._leadFrom, this._lead, locked);
      } else {
        this.fx.lead.visible = false;
        this._leadValid = false;
      }

      // Kort seintje op het moment dat je op scherp komt, zodat je niet naar de
      // kleur van een ring hoeft te turen terwijl je vliegt.
      if (locked && !this._wasLocked) this.audio.lockOn();
      this._wasLocked = locked;
    } else {
      this.fx.lead.visible = false;
      this._leadValid = false;
      this._wasLocked = false;
    }

    if (this.pigeon.justClapped) {
      // Opstijgen van een randje: vleugelklap boven de rug, en een wolk veertjes.
      this.fx.feathers.burst(this.pigeon.pos, 8, 3.2);
      this.audio.wingClap();
    } else if (this.pigeon.justFlapped) {
      this.fx.feathers.burst(this.pigeon.pos, 1, 1.6);
      this.audio.flap();
    }
    // Aan de rand van de stad krijg je een duidelijk signaal in plaats van een
    // onverklaarbare stop.
    if (this.pigeon.atEdge && s.phase === 'playing') {
      this._edgeHint = (this._edgeHint || 0) - dt;
      if (this._edgeHint <= 0) {
        this._edgeHint = 2.5;
        this.fx.text.add(this.pigeon.pos, 'EDGE OF TOWN', C.crimson);
        this.fx.impact({ shake: 0.35 });
      }
    }

    if (this.pigeon.bumped) {
      this.fx.impact({ shake: 0.5, stop: 0.03 });
      this.fx.feathers.burst(this.pigeon.pos, 4, 3);
      this.audio.bump();
    }

    // combo loopt af
    if (s.comboTimer > 0) {
      s.comboTimer -= dt;
      if (s.comboTimer <= 0) {
        s.chain = 0;
        s.multiplier = 1;
      }
    }
    s.flash = this.fx.flash;

    this.input.endStep();
  }

  _wantsStart() {
    const i = this.input;
    return i.hit('poop') || i.hit('flap') || i.hit('thrust') || i.hit('left') || i.hit('right');
  }

  _startRound() {
    const s = this.state;
    s.phase = 'playing';
    s.timeLeft = ROUND_TIME;
    s.elapsed = 0;
    s.drain = 1;
    s.intensity = 0;
    this._lastTick = -1;
    this._rapidTimer = 0;
    this.audio.start();
  }

  _endRound() {
    const s = this.state;
    s.phase = 'over';
    // Naar huis. De duif vliegt zelf terug naar het monument waar hij begon en gaat
    // daar weer zitten, terwijl jij naar je score kijkt.
    this.pigeon.flyHome(this.city.startPerch);
    s.newRecord = s.score > s.best && s.score > 0;
    if (s.newRecord) {
      s.best = s.score;
      localStorage.setItem('pp3d.best', String(s.best));
      this.audio.record();
    } else {
      this.audio.gameover();
    }
  }

  _playerActions(dt, s) {
    // Munitie groeit vanzelf aan. Zonder dit stond je halverwege een aanvliegroute
    // droog en kon je alleen maar toekijken, en dat is precies waar het tempo stukgaat.
    // Kruimels blijven de snelle manier om bij te tanken.
    const regenTijd = s.fed > 0 ? FED_AMMO_REGEN : AMMO_REGEN;
    if (s.ammo < AMMO_MAX) {
      s.ammoTimer -= dt;
      if (s.ammoTimer <= 0) {
        s.ammo++;
        s.ammoTimer = regenTijd;
      }
    } else {
      s.ammoTimer = regenTijd;
    }

    // Tijdens cheeky pigeon time verandert de knop van 'los er een' in een
    // mitrailleur: vasthouden blijft vuren en munitie is gratis.
    if (s.cheeky > 0) {
      this._rapidTimer -= dt;
      if (this.input.held('poop') && this._rapidTimer <= 0) {
        if (this.poop.fire(this.pigeon)) {
          this._rapidTimer = RAPID_FIRE;
          this.fx.feathers.burst(this.pigeon.pos, 1, 1.4, C.crimson);
          this.audio.drop();
        }
      }
      s.ammo = AMMO_MAX;
    } else if (this.input.hit('poop') && s.ammo > 0) {
      this._rapidTimer = 0;
      if (this.poop.fire(this.pigeon)) {
        s.ammo--;
        this.fx.feathers.burst(this.pigeon.pos, 1, 1.2, C.mist);
        this.audio.drop();
      }
    }

    // Boterham eten. Zeldzamer dan een kruimel en veel meer waard: volle munitie,
    // volle adem, en negen seconden waarin je harder klapwiekt en sneller bijlaadt.
    const bread = this.targets.sandwichAt(this.pigeon.pos);
    if (bread) {
      bread.take();
      s.fed = FED_TIME;
      this.pigeon.fed = FED_TIME;
      this.pigeon.stamina = FLIGHT.STAMINA_MAX;
      s.ammo = AMMO_MAX;
      s.score += 25;
      this.fx.text.add(bread.position, 'SANDWICH!', C.gold);
      this.fx.feathers.burst(bread.position, 8, 3, C.gold);
      this.fx.impact({ shake: 0.5, stop: 0.04, flash: 0.3 });
      this.audio.bonus();
      this.audio.coo();
    }

    // kruimel oppikken — de reden om laag en dus gevaarlijk te vliegen
    const crumb = this.targets.crumbAt(this.pigeon.pos, CRUMB_PICKUP_R);
    if (crumb && s.ammo < AMMO_MAX) {
      crumb.take();
      s.ammo = Math.min(AMMO_MAX, s.ammo + CRUMB_AMMO);
      s.score += 5;
      this.fx.text.add(crumb.mesh.position, 'crumb', C.gold);
      this.fx.feathers.burst(crumb.mesh.position, 3, 2, C.gold);
      this.audio.pickup();
    }
  }

  /**
   * Een zwerm vliegt op.
   *
   * Het opjagen levert zelf punten en tijd op, en niet alleen wat hun poep toevallig
   * raakt. De stad is dun bevolkt, dus een regen van vierentwintig lozingen raakt
   * gemiddeld minder dan één doel: als dat de enige beloning was, zou je een zwerm
   * even vaak links laten liggen als opjagen. Wat ze raken komt er bovenop.
   */
  _onFlush(flock) {
    const s = this.state;
    if (s.phase !== 'playing') return;
    s.flushes++;
    s.score += FLUSH_POINTS;
    s.timeLeft = Math.min(TIME_CAP, s.timeLeft + FLUSH_TIME);
    s.timeGain = 1;
    this.fx.text.add(flock.center, `FLUSHED! +${FLUSH_POINTS}`, C.haze);
    this.fx.feathers.burst(flock.center, 16, 5, C.haze);
    this.fx.impact({ shake: 0.7, stop: 0.04 });
    // Kettingreactie van vleugelklappen, net als bij echte duiven.
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.audio.wingClap(), i * 90);
    }
  }

  _startCheeky() {
    const s = this.state;
    s.cheeky = CHEEKY_TIME;
    s.cheekyCount++;
    s.ammo = AMMO_MAX;
    this.pigeon.boost = CHEEKY_TIME;
    this._rapidTimer = 0;
    this.fx.impact({ shake: 1.1, stop: 0.1, flash: 0.9 });
    this.fx.feathers.burst(this.pigeon.pos, 14, 4.5, C.crimson);
    this.fx.text.add(this.pigeon.pos, 'CHEEKY!', C.crimson);
    this.audio.coo();
    this.audio.cheeky();
  }

  /** Aftellen hoorbaar maken vanaf tien seconden. */
  _countdownAudio(s) {
    if (s.timeLeft > 10) {
      this._lastTick = -1;
      return;
    }
    const whole = Math.ceil(s.timeLeft);
    if (whole !== this._lastTick) {
      this._lastTick = whole;
      this.audio.tick(whole <= 3);
    }
  }

  _onTargetHit(target, at, info) {
    const s = this.state;
    if (s.phase !== 'playing') return;

    s.chain = s.comboTimer > 0 ? s.chain + 1 : 1;
    s.multiplier = Math.min(MAX_MULTIPLIER, s.chain);
    s.bestChain = Math.max(s.bestChain, s.chain);
    s.comboTimer = COMBO_WINDOW;
    s.hits++;

    const snipe = info && info.dropHeight > SNIPE_HEIGHT;
    let points = target.points * s.multiplier * (snipe ? 2 : 1);
    // Een rijdende auto raken is lastiger dan een stilstaande, dus dat mag lonen.
    if (target instanceof Car && target.wasMoving) points = Math.round(points * 1.2);
    if (s.cheeky > 0) points *= CHEEKY_SCORE;
    s.score += points;

    // Tijd erbij. Dit is de motor van het spel: raken verlengt je ronde, dus je
    // blijft doorjagen in plaats van veilig rond te vliegen tot de klok op is.
    const gained = target.timeBonus + (snipe ? SNIPE_TIME : 0);
    s.timeLeft = Math.min(TIME_CAP, s.timeLeft + gained);
    s.timeGain = 1;

    const vanZwerm = info && info.fromFlock;
    if (vanZwerm) s.flockHits++;
    const label = vanZwerm ? `FLOCK +${points}` : (snipe ? `SNIPE +${points}` : `+${points}`);
    this.fx.text.add(at, label, vanZwerm ? C.haze : (snipe ? C.crimson : C.gold));
    this.fx.text.add(this._tmp.copy(at).setY(at.y + 1.8), `+${gained.toFixed(1)}s`, C.leaf);
    this.fx.decals.add(
      new THREE.Vector3(at.x, this.city.groundHeightAt(at.x, at.z) + 0.03, at.z),
      0.8
    );
    this.fx.feathers.burst(at, 5, 3.4, C.bone);

    this.audio.hit(s.multiplier, snipe);
    if (target instanceof Car) this.audio.alarm();

    // Grotere buit schudt harder en bevriest langer. Zo voelt een treffer zwaar.
    const weight = Math.min(1, points / 400);
    this.fx.impact({
      shake: 0.3 + weight * 0.9,
      stop: 0.04 + weight * 0.07,
      flash: snipe ? 0.8 : weight * 0.4,
    });
  }

  /**
   * Net naast. Levert een kwart van de punten op en een halve seconde.
   *
   * Een voetganger is een klein doel, en zonder deze troostprijs voelt elke mislukte
   * aanvlucht als volledig weggegooid. De combo blijft er wel buiten: dit is een
   * aanmoediging, geen manier om een reeks in stand te houden.
   */
  _onGraze(target, at, info) {
    const s = this.state;
    if (s.phase !== 'playing') return;
    s.grazes++;
    const points = Math.max(5, Math.round(target.points * GRAZE_SCORE));
    s.score += points;
    s.timeLeft = Math.min(TIME_CAP, s.timeLeft + 0.25);
    s.timeGain = 1;
    this.fx.text.add(at, `CLOSE +${points}`, C.mist);
    this.fx.feathers.burst(at, 2, 2, C.haze);
    this.fx.impact({ shake: 0.2 });
    this.audio.bonus();
  }

  _onSplat(at) {
    this.fx.decals.add(at, 1);
    this.fx.feathers.burst(at, 2, 1.6, C.bone);
    this.audio.splat();
  }

  /** Camera en zon volgen de duif. Los van de vaste stap: dit mag per frame. */
  updateCamera(dt) {
    const p = this.pigeon;
    const fwd = p.forward;

    // Sneller vliegen betekent verder naar achteren, dat leest als snelheid.
    // De camera hangt bewust hoog: dit is een spel over wat er onder je gebeurt.
    const over = Math.max(0, p.speed - FLIGHT.CRUISE_SPEED);
    const dist = 10 + over * 0.3;
    const height = (p.grounded ? 2.8 : 7) + over * 0.06;

    this._camPos
      .copy(p.pos)
      .addScaledVector(fwd, -dist)
      .add(this._tmp.set(0, height, 0));

    // De grond mag de camera nooit doorsnijden.
    const floor = this.city.groundHeightAt(this._camPos.x, this._camPos.z) + 1.6;
    if (this._camPos.y < floor) this._camPos.y = floor;

    // En een gevel ook niet. Hergebruikt de botsingscode van de duif, met een ruimere
    // straal zodat de camera niet vlak tegen het metselwerk komt te plakken.
    this.city.resolveCollision(this._camPos, 2.2);

    const lerp = 1 - Math.pow(0.00002, dt);  // framerate-onafhankelijke demping
    if (!this._camReady) {
      this.camera.position.copy(this._camPos);
      this._camLook.copy(p.pos);
      this._camReady = true;
    } else {
      this.camera.position.lerp(this._camPos, lerp);
    }

    // De camera kijkt tussen de duif en het inslagpunt in. Daarmee staat de richtring
    // gegarandeerd in beeld: zonder deze koppeling viel hij onder de onderrand,
    // want de poep komt vrijwel recht onder je neer.
    const lookTarget = this._tmp.copy(p.pos).addScaledVector(fwd, 6).setY(p.pos.y + 0.4);
    if (this._aimValid) {
      // Kijk naar het midden van ring en spookdoel, zodat ze allebei in beeld staan.
      // Het spook kan voor of achter de inslag liggen, afhankelijk van welke kant je
      // doelwit op loopt, en viel anders onder de onderrand weg.
      GROUND_REF.copy(this._aim);
      if (this._leadValid) GROUND_REF.lerp(this._lead, 0.5);
      lookTarget.lerp(GROUND_REF, 0.37);
      // Op grote hoogte zou volledig meekijken de camera loodrecht naar beneden
      // kantelen. Daar zit een grens op.
      const maxDrop = 16;
      if (p.pos.y - lookTarget.y > maxDrop) lookTarget.y = p.pos.y - maxDrop;
    }
    this._camLook.lerp(lookTarget, 1 - Math.pow(0.000002, dt));

    this.fx.shakeOffset(this._shake);
    this.camera.position.add(this._shake);
    this.camera.lookAt(this._camLook);
    // Rol van de duif deels doorvertalen naar de camera: bochten voelen daardoor scherper.
    // Tegengesteld teken omdat de camera langs zijn lokale -Z kijkt en de duif langs +Z.
    this.camera.rotateZ(-p.bank * 0.22);

    this.sun.position.copy(p.pos).add(this.sunOffset);
    this.sun.target.position.copy(p.pos);
    this.sun.target.updateMatrixWorld();
  }

  /** DOM-effecten die de projectie nodig hebben. */
  updateOverlay(dt, width, height) {
    this.fx.text.update(dt, this.camera, width, height);
    this.hud.update(this.state, this.pigeon, dt);
    this.hud.updateMate(this.mate, this.camera, this.pigeon.pos, width, height, this._tmp);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Nieuwe ronde. Begint meteen te lopen: na 'R' wil je spelen, geen menu. */
  reset() {
    const s = this.state;
    s.score = 0;
    s.ammo = AMMO_MAX;
    s.ammoTimer = AMMO_REGEN;
    s.multiplier = 1;
    s.chain = 0;
    s.bestChain = 0;
    s.hits = 0;
    s.comboTimer = 0;
    s.timeGain = 0;
    s.newRecord = false;
    s.cheeky = 0;
    s.cheekyCount = 0;
    s.flushes = 0;
    s.flockHits = 0;
    s.grazes = 0;
    s.fed = 0;
    this._rapidTimer = 0;
    this.pigeon.reset();
    this.pigeon.boost = 0;
    this.pigeon.perchOn(this.city.startPerch);
    this.mate.reset(this.pigeon.pos);
    this.flocks.reset();
    this.poop.reset();
    this.fx.clear();
    this.hud.reset();
    this.targets.reset();
    this._camReady = false;
    this._startRound();
  }
}
