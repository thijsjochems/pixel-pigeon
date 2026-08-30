# Pixel Pigeon 3D — Rebuild Briefing

_Opgesteld: 28 aug 2026. Status: ter goedkeuring._

---

## 1. Wat er nu staat (de eerlijke diagnose)

Het hele project is **140 regels** verdeeld over `index.html` (12), `style.css` (9) en `main.js` (119).
Het is geen game. Het is een tech-demo die halverwege is gestopt.

### Waarom het niet leuk is — dit zijn geen bugs, dit is het echte probleem

| # | Probleem | Gevolg |
|---|---|---|
| 1 | **Er is geen doel.** Geen score, geen timer, geen win, geen verlies, geen game over. | Je kunt niet winnen of verliezen, dus er is niets te spelen. |
| 2 | **Er is geen enkele collision-check in de codebase.** De poep valt, wordt op `visible=false` gezet bij y<0.3 en raakt nooit iets. | De kernactie van de game — poepen op iets — heeft letterlijk geen effect. |
| 3 | **De duif kan niet horizontaal bewegen.** Alleen Space (omhoog). Hij staat vast op x=0, z=0. | Je "vliegt" niet, je stuitert op één plek. |
| 4 | **De auto rijdt heen en weer, oneindig, en interacteert nergens mee.** | Decor dat doet alsof het gameplay is. |
| 5 | **Er is 1 knop met betekenis** (Space) en 1 zonder gevolg (Enter). | Geen skill-expressie, geen risico, geen keuze. |

Kortom: de speler heeft geen doel, geen agency en geen feedback. Dat is de reden dat het "een stom spel" is — niet de graphics.

### Technische staat

**Graphics / assets**
- `pigeon.png`, `building.png`, `asphalt.png`, `poop.png` zijn **128×128 vlakke grijze PNG's**. Er is geen enkele pixel-art in dit project. De "Pixel" in de titel bestaat niet.
- `car.png` en `building-brick.png` zijn 16×16 en **byte-identiek aan elkaar** (82 bytes, één effen kleur).
- Elke `BoxGeometry` krijgt één materiaal, dus **alle 6 vlakken van elke kubus dragen dezelfde textuur** → geen enkele vormdefinitie, alles smelt samen tot grijze soep.
- `MeshBasicMaterial` **negeert licht volledig**. De `AmbientLight` en `HemisphereLight` op regel 15–17 doen dus letterlijk niets. Alles is plat, geen diepte, geen schaduw.
- `road.png` is **970 KB / 1024×1024 en wordt nergens geladen**. Samen met `building-brick.png` dood gewicht.

**Code**
- **Framerate-afhankelijke physics.** `gravity` en `lift` zijn per-frame constanten zonder delta-time. Op een 144Hz-scherm valt de duif 2,4× sneller dan op 60Hz. De game speelt anders per monitor.
- **Memory leak.** Poep-meshes worden op `visible=false` gezet maar nooit uit `poopGroup` verwijderd of ge-`dispose()`d. Elke druk op Enter lekt een mesh + geometry + material, voor altijd.
- **Camera-bug.** `camera.position.y` volgt de duif maar x/z blijven vast op (10,10), dus de blik zwenkt scheef mee in plaats van te volgen.
- **Geen resize-handler.** Venster verslepen = uitgerekt/afgesneden beeld, permanent.
- **Space scrollt de pagina** (geen `preventDefault`), en keydown-repeat betekent dat Space ingedrukt houden = oneindig zweven. Geen uitdaging.
- **Geen touch/mobiel, geen pauze, geen restart, geen startscherm, geen geluid.**

**Dependencies & repo**
- `three@0.148.0` via `three.min.js` van unpkg. Die **global-script build bestaat niet meer** in moderne three-versies; dit pad is een doodlopende weg en er is geen fallback → geen internet = geen game.
- **Git is stuk.** De enige commit ("🚀 Eerste upload van werkende game") bevat **0 bytes voor alle drie de bestanden**. Alle echte code staat uncommitted in de working tree. Geen `.gitignore`, geen README.

---

## 2. Wat het moet worden

### De kernfantasie is goed. Die is alleen nooit gebouwd.

"Jij bent een duif in de stad en je poept op mensen" is grappig, direct te begrijpen en heeft een ingebouwde scorehaak. Het huidige spel heeft die fantasie als *decor*. In de rebuild wordt het de *hele game*.

### Voorstel: **arcade score-attack, 90 seconden per ronde**

Eén stadsblok. Jij vliegt vrij. De klok loopt. Scoor zoveel mogelijk voor de tijd op is.

**Besturing**
- WASD / pijltjes — horizontaal vliegen
- Space — klapwieken (hoogte winnen, kost stamina)
- Muis of Shift — duiken (snelheid, precisie, risico)
- Klik / Ctrl — poepen

**Doelen, oplopend in waarde en moeilijkheid**

| Doel | Punten | Twist |
|---|---|---|
| Geparkeerde auto | 10 | gratis geld, warming-up |
| Rijdende auto | 25 | moet voorspellen |
| Voetganger | 50 | beweegt onvoorspelbaar |
| Voetganger mét paraplu | 0 | ketst af — wacht tot hij 'm dichtklapt |
| Terrasje / patatje / ijsje | 100 | + "GROSS!" bonus |
| Was aan de lijn | 150 | smal doelwit, hoog risico |
| Politieauto | 250 | maar verhoogt je heat-meter |

**De risk/reward-lus die het spel draaiend houdt**
Je hebt **max 3 poep**. Bijladen doe je door broodkruimels van de grond te pikken — dus laag vliegen. Laag vliegen is precies waar de schoenen, ramenwassers en autoruiten zijn. Munitie kost je veiligheid. Dat is de spanning.

**Escalatie**
Elke 30 seconden: meer verkeer, meer mensen, sneller. Bij hoge heat komt er een valk achter je aan.

**Combo's**
Twee treffers binnen 2 seconden = multiplier. Vijf op rij = SPLAT STREAK, scherm kleurt, muziek gaat een laag omhoog.

**Einde**
3 levens op óf klok op nul → scorescherm, lokale highscore (localStorage), één knop: nog een keer.

### Game-feel checklist (dit is wat "leuk" letterlijk betekent)

Elk van deze punten wordt expliciet gebouwd, niet gehoopt:
- **hit-stop** — 2 frames bevriezen bij een treffer
- **screen shake** — kort, gericht, schaalt met puntwaarde
- **splat-decals** die op straat blijven liggen, de hele ronde
- **veertjes** die wegspatten bij elke klapwiek
- **floating score numbers** die omhoog drijven en vervagen
- **camera-punch** bij combo's
- **chiptune SFX**, volledig gesynthetiseerd via WebAudio (geen audiobestanden)

### Technische aanpak

- **Low-res render target**: renderen op 384×216 en met `NearestFilter` opschalen naar volledig scherm. Dít is de truc die "pixel-3D" er echt uit laat zien — en het is bovendien razendsnel. De huidige aanpak (pixel-textuur op een gewone render) geeft dat effect nooit.
- **Fixed timestep** (60Hz accumulator) voor alle physics. Identiek speelgevoel op elke monitor.
- **16-kleuren palet**, alle texturen **procedureel gegenereerd op canvas** bij het opstarten. Geen losse PNG's die uit de pas lopen, geen laadtijd, gegarandeerd consistente stijl. De huidige texture-map gaat volledig weg.
- **Per-vlak materialen** op de kubussen zodat vormen leesbaar zijn (dak ≠ gevel).
- **Echte belichting**: directional light + schaduw, of bewust plat met vertex-colors — maar dan een keuze, geen ongeluk.
- **Modulaire opzet**: `main.js` (bootstrap) · `game.js` (state machine) · `pigeon.js` · `city.js` · `targets.js` · `poop.js` · `audio.js` · `hud.js` · `palette.js` · `textures.js`
- **Object pooling** voor poep, decals en partikels — geen leaks.
- **Mobiel**: virtuele stick + poepknop. Ik neem aan dat dit erin moet; zeg het als dat niet hoeft.
- **Git opschonen**: echte commits, `.gitignore`, README.

---

## 3. Besloten (28 aug 2026)

| Vraag | Besluit |
|---|---|
| Game type | **Mix van arcade score-attack en free-roam** — zie hieronder |
| Tech | **Vite + three als npm-package**, ES-modules, offline speelbaar |
| Look | **Echte pixel-3D** — low-res render target, 16-kleuren palet, procedurele texturen |
| Oplevering | **Eerst de speelbare kern**, daarna uitbreiden |

### De mix, concreet

**Een vrije stad waarin elke missie een score-attack is.**

Je vliegt vrij rond in een stad zonder klok. Verspreid door de wijken staan opdrachtmarkers.
Vlieg er een binnen en de klok gaat lopen — dan speel je exact de arcade-loop uit optie 1:

- _Verpest de bruiloft_ — 60 sec, raak zoveel mogelijk gasten
- _Terrasje pesten_ — raak 8 patatjes voor de tijd om is
- _Auto-alarm-symfonie_ — 5 auto's binnen 30 sec, elke treffer zet een alarm aan
- _Wasdag_ — smalle doelen, hoog risico, hoge punten

Elke missie geeft **1 tot 3 sterren** op basis van je score. Sterren ontgrendelen nieuwe wijken en
upgrades: grotere poepcapaciteit, snellere klapwiek, turbo-duik, camo-veren die je heat verlagen.

Buiten de missies om is de stad gewoon van jou: kruimels pikken, willekeurige voorbijgangers voor
kleine punten, en een **heat-meter** die bij te veel schade ramenwassers, een dierenvanger en
uiteindelijk een valk achter je aan stuurt.

Zo zit de herspeelbare arcade-kern in de missies, en de wereld en progressie eromheen.

### Fasering

**Fase 1 — speelbare kern (nu)**
Eén stadsblok. Vrij vliegen met een echt vliegmodel, poepen, collisions die kloppen, splats,
score, en de munitie-lus. Geen missies, geen progressie. Enige vraag die deze fase beantwoordt:
_voelt het vliegen en mikken lekker?_ Zo niet, dan sturen we bij vóórdat er iets bovenop staat.

**Fase 2 — de game eromheen**
Doelenvariëteit, gevaren, heat-meter, alle game-feel (hit-stop, shake, decals, veertjes,
floating numbers), chiptune-audio, HUD, start- en scorescherm.

**Fase 3 — wereld en progressie**
Stad uitbreiden naar wijken, missiemarkers, sterrensysteem, upgrades, opslag van voortgang.

### Aannames die ik zelf neem (corrigeer me als het anders moet)

- **Perspectief-camera, geen orthografische.** De pixel-look komt van het low-res render target,
  niet van de projectie. Voor vrij vliegen is een meevliegende perspectiefcamera veel prettiger.
- Mobiele besturing (virtuele stick + poepknop) komt erin, in fase 2.
- Alle huidige PNG-texturen gaan weg; ze worden procedureel vervangen.
- Ik ruim de git-historie op met echte commits, een `.gitignore` en een README.

### Het vliegmodel — waar fase 1 op staat of valt

Dit is de belangrijkste beslissing in de hele game, dus expliciet:

- **Klapwiek met cooldown.** Space geeft een directe opwaartse impuls, maar pas na ~0,2 sec weer.
  Ingedrukt houden geeft dus géén oneindig zweven, maar een ritmische deining. Dat is wat een vogel
  van een springend blokje onderscheidt.
- **Stamina.** Elke klap kost uithoudingsvermogen, zweven is gratis, het laadt op terwijl je glijdt.
  Hoogtebeheer wordt daarmee de kernvaardigheid.
- **Glijden geeft lift** evenredig aan je horizontale snelheid — vaart houden betekent hoogte houden.
- **Duiken** ruilt hoogte voor snelheid en precisie, en optrekken zet die snelheid deels terug om in
  hoogte. Dat maakt de duik-bombardement-lus bevredigend in plaats van bestraffend.
- **Poep erft je snelheid.** Je moet dus voorliggen op je doel. Daar zit de skill.

---

## 4. Status fase 1 — af (28 aug 2026)

De speelbare kern staat: vliegen, sturen, klapwieken, duiken, poepen, raken, scoren,
combo's, munitie via kruimels, splats, veertjes, schermschudden, hit-stop en HUD.
Draait op Vite + three 0.180, gerenderd op ~384x224 en opgeschaald met harde pixels.

### Gemeten, niet gehoopt

Het vliegmodel is deterministisch doorgemeten in de browser (vaste stap, geen
renderlus) omdat "voelt het goed" anders een kwestie van mening blijft. Eerste meting
liet drie echte fouten zien, die alle drie zijn verholpen:

| Probleem | Voor | Na |
|---|---|---|
| Zweven was vrije val zonder eindsnelheid | vy liep door naar -14,6 m/s en bleef versnellen | zakt netjes naar ~-4 m/s |
| Klapwieken stapelde tot een raket | vy 12 → 24 → 36 m/s | constante klim van 7,5 m/s |
| Optrekken uit een duik leverde niets op | vy -19,7 → -17,9 | vangt af van -16,8 naar -0,9 |

De oplossing voor het eerste punt is luchtweerstand op de verticale snelheid. Daardoor
krijgt elke vliegsnelheid vanzelf zijn eigen daalsnelheid: kruisen zakt 4 m/s, te
langzaam vliegen zakt 25 m/s. Het model straft je precies zoveel als je verdient.

Verder gevonden en opgelost: de bonus voor rijdende auto's was dode code (het alarm
ging aan vóórdat de score werd berekend), het wegdek werd twee keer met dezelfde
paletkleur vermenigvuldigd en was daardoor vrijwel zwart, de mistkleur week af van de
luchtkleur waardoor de horizon een harde rand had, en de dakrand-box dekte de
daktextuur volledig af.

**Geheugenlek-test:** 400 poepjes, 400 veerbursts en 400 splats afgevuurd. Het aantal
objecten in de scene bleef exact 1105. De pools werken. Dat was precies wat er in de
oude versie misging.

### Wat ik nog zie liggen

- 1105 scene-objecten en 56 eigen gevelmaterialen. Draait prima, maar als fase 3 de
  stad uitbreidt moet dit samengevoegd worden tot instanced meshes.
- De duif is donkergrijs op donkere daken en dan slecht te zien. Vraagt om een
  contrastrand of een duidelijker slagschaduw.
- De lucht is één vlakke kleur. Een verloop of een paar wolken scheelt veel.
- Gas geven doet niets voor je hoogte zodra je boven 8,4 m/s zit. Verdedigbaar
  (hoogte win je met klappen en met optrekken), maar dit is bij uitstek iets waar
  een speeltest over moet beslissen.


---

## 5. Ronde twee — speeltest verwerkt (29 aug 2026)

Drie klachten uit de eerste speeltest, alle drie terecht en alle drie een echte fout.

### Draaien was te traag

Gemeten: 143 graden/s op kruissnelheid, maar **64 graden/s op topsnelheid** — 5,6
seconde voor één rondje. En vol gas is precies hoe je de hele tijd vliegt, dus dat was
de enige snelheid die telde. `TURN_AT_SPEED` stond op 0,55; dat is nu 0,25 en de
basissnelheid ging van 2,5 naar 3,4 rad/s. Resultaat: **149 graden/s vol gas, 2,4
seconde per rondje.**

### De duif leunde de verkeerde kant op

Bevestigd in beeldruimte: bij rechts sturen ging de duif wél naar rechts, maar zakte de
vleugel aan zijn linkerkant. Oorzaak is een tekenfout. Het model kijkt naar +Z, en wie
naar +Z kijkt heeft zijn rechterkant op lokaal −X — niet op +X. De rol stond daardoor
gespiegeld, en de camerarol erbovenop versterkte het. Nu meet de test dat bij rechts
sturen de vleugel zakt die ook rechts in beeld staat, en omgekeerd.

### De poep zweefde in plaats van te vallen

Zwaartekracht van −22 naar −46, overname van de vliegsnelheid van 0,8 naar 0,5, en een
directe zet van 5 m/s naar beneden bij het loslaten. Het tollen is gehalveerd, want dat
was de dwarreling. Van 25 m hoogte valt hij nu in 0,93 s; stilhangend landt hij 0,2 m
voor je, op volle vaart 8,1 m (was ongeveer 18 m).

### En de eigenlijke opdracht: het moet vragen om nog een keer

Er zat geen einde aan het spel, en zonder einde bestaat "nog een keer" niet. Toegevoegd:

- **Een ronde van 60 seconden waarin elke treffer tijd bijzet** (auto 2,0 s, voetganger
  2,5 s, snipe +1,0 s, tot maximaal 90 s). Daarmee speel je niet tegen een klok maar
  tegen je eigen tempo: stoppen met raken is stoppen met spelen.
- **Oplopende drukte.** Het verkeer trekt aan naarmate de ronde vordert.
- **Start- en eindscherm** met treffers, beste reeks, punten per treffer en een
  highscore in localStorage. `R` start meteen een nieuwe ronde, zonder menu ertussen.
- **Volledig gesynthetiseerd geluid** (`audio.js`, WebAudio, geen bestanden): klapwiek,
  loslaten, splat, treffer waarvan de toonhoogte met de combo meestijgt, auto-alarm,
  kruimel, botsing, aftelklok en een fanfare bij een record.
- **Een richtring op de grond** die laat zien waar je poep neerkomt, en die rood wordt
  zodra er een doel onder ligt.

### De richtring dwong een camerawijziging af

De ring bleek eerst onzichtbaar. Niet door een renderfout: hij projecteerde op y = −1,52
in beeldruimte, dus net onder de onderrand. Omdat de poep nu vrijwel recht naar beneden
valt ligt het inslagpunt pal onder de duif, en daar keek de achtervolgcamera niet
naartoe. Je kon dus niet zien waar je bombardeerde — een kernfout in een spel dat over
precies dat gaat.

De camera kijkt nu tussen de duif en het inslagpunt in, en hangt hoger. Gemeten over
hoogtes van 6 tot 50 m staan duif én ring altijd in beeld, met de ring in de onderste
derde. De baanvoorspelling wijkt maximaal 0,21 m af van waar de poep echt landt.

### Meetresultaten

| Wat | Uitkomst |
|---|---|
| Draaien vol gas | 149 graden/s, 2,4 s per rondje |
| Rol bij rechts sturen | vleugel rechts in beeld zakt |
| Poep van 25 m | 0,93 s valtijd, 0,2 m vooruit stilhangend |
| Voorspelling versus inslag | maximaal 0,21 m afwijking over 5 scenario's |
| Ring in beeld | op 6, 12, 22, 35 en 50 m hoogte |
| Camera in een gevel | 13 van 1500 frames (0,9%) tijdens een lange vlucht |
| Geheugen | 1108 objecten voor en na 300 poepjes plus 5 herstarts |

### Wat er nog ligt

- Die 0,9% camera-in-gevel. Vraagt om een raycast tussen duif en camera in plaats van
  alleen wegduwen.
- Doelenvariëteit is nog dun: alleen auto's en voetgangers. Paraplu's, was aan de lijn
  en terrasjes staan nog open, net als de gevaren en de heat-meter.
- Geen mobiele besturing.
- De lucht is nog één vlakke kleur.


---

## 6. Ronde drie — speeltest (29 aug 2026)

### Te weinig munitie

Drie poep met alleen kruimels als aanvulling betekende dat je halverwege een
aanvliegroute droog stond en alleen nog kon toekijken. Precies daar gaat het tempo
stuk, en tempo is wat dit spel moet hebben.

Nu zes, met een aangroei van ongeveer een per twee seconden zodat je nooit volledig
stilvalt. Kruimels geven er meteen twee: die blijven daarmee de snelle bijtank-optie,
en de reden om laag en dus gevaarlijk te vliegen blijft overeind.

### Auto's reden de stad uit

Twee fouten tegelijk, en beide echt.

De filter op de rijstroken luidde `Math.abs(p) > 85`, en 85 is niet groter dan 85. De
twee buitenste straten — die precies op de rand van het grondvlak liggen, met aan de
buitenkant niets — kregen dus gewoon verkeer. Daarnaast wrapten auto's op plus/min 85
terwijl de bebouwing tot 80 loopt: elke auto reed vijf meter voorbij het laatste
gebouw over kaal terrein voordat hij teleporteerde.

Opgelost door verkeer te beperken tot de binnenstraten, en door auto's op elke kruising
50% kans te geven om af te slaan. Daardoor circuleren ze binnen het raster in plaats van
rechtdoor de stad uit te rijden. De rijstrook ligt na een bocht weer rechts van de
nieuwe rijrichting, zodat tegenliggers elkaar netjes passeren.

Ook opgeruimd: elke auto had een verwijzing naar hetzelfde gedeelde rijstrook-object
uit `city.js`. Zodra er een afsloeg zou dat alle auto's op die strook meesleuren. Elke
auto houdt nu zijn eigen as, strook en richting bij.

### Meetresultaten

Twee minuten verkeer gesimuleerd met dertien auto's:

| Wat | Uitkomst |
|---|---|
| Grootste afstand tot het centrum | 80,0 — exact de rand van de bebouwing |
| Metingen buiten de bebouwing | 0 |
| Auto's die van rijrichting wisselden | 8 van de 13 |
| Auto's nog exact op een geldige rijstrook | 13 van de 13 |
| Munitie bij de start | 6 |
| Aangroei vanaf leeg | ongeveer 1 per 2 seconden |

---

## 7. Ronde vier — bad-ass duif en speeltest (29 aug 2026)

### Echte duivenkenmerken als mechaniek

Opgezocht en verwerkt, zodat het niet verzonnen aanvoelt:

- **De vleugelklap.** Rotsduiven slaan bij het opvliegen hun vleugels boven de rug
  tegen elkaar, en datzelfde gebaar is bij mannetjes ook een baltsvertoning. Dat is nu
  de rode draad: opstijgen van een randje doet een klap, en de cheeky duif klapt terug
  zodra je binnen twintig meter komt. Opstijgen en flirten zijn letterlijk dezelfde
  beweging, en dat is geen grap maar gedrag.
- **Duiven vliegen onder de 70 meter.** Het plafond ging van 55 naar 70.
- **Ongeveer 5,5 vleugelslagen per seconde.** De klapwiek-cooldown ging naar 0,22 s,
  wat neerkomt op zo'n 4,5 per seconde. Dichtbij genoeg om goed te voelen.
- **Iriserende nek van geel via groen naar roodpaars.** Was één vlakke paarse band,
  is nu drie banden.
- **Duiven zitten op randjes.** Je begint niet meer vallend uit de lucht maar zittend
  op een monument op het middenplein. De stad heeft 96 zitplaatsen: het monument,
  alle lantaarnpalen en een dakrand per pand. Neerstrijken op een dak vult je
  uithoudingsvermogen bij, en hoog zitten is de betere uitvalsbasis om te bombarderen.
- **Cher Ami** is de hoogste rang op het eindscherm. Die postduif bezorgde in 1918
  zwaargewond het bericht dat het Lost Battalion redde.

### Cheeky pigeon time

Ergens in de stad zit een tweede duif met een hartje en een lichtbundel. Vlieg haar aan
en je krijgt tien seconden met gratis munitie, oneindig uithoudingsvermogen, dubbele
punten en een poep-mitrailleur op ongeveer elf schoten per seconde. Daarna duikt ze
acht seconden later ergens anders op.

### Gevonden en opgelost

**De richtring loog.** Hij keek naar waar een doel *nu* staat, terwijl de poep een
seconde onderweg is. Bij een rijdende auto klopte rood dus principieel niet. Nu kijkt
hij naar de toekomstige positie op trefhoogte, met een marge gelijk aan de straal van
de poep zelf in plaats van 1,4 meter. En hij weigert rood te worden als het doel
binnen de valtijd een kruising haalt of gaat afremmen, want dat is niet te voorspellen.
Betrouwbaarheid ging van **38% naar 87%**, en goud betekent nu vrijwel altijd mis (1,3%).

**Voetgangers liepen door gevels.** Panden konden tot over de stoeprand groeien, precies
waar het looprondje ligt. Bebouwing wordt nu geklemd binnen een kern, met een vrije
stoepring eromheen. 0 van 10.200 metingen nog binnen een gebouw.

**Auto's reden door elkaar.** Ze remmen nu voor alles wat binnen acht meter vóór hen
ligt, ook dwars op kruisingen. 1 overlap op 46.800 gemeten paren.

**Tegen een gevel vliegen gaf een storing.** Je werd elk frame opnieuw naar buiten
geduwd terwijl je ertegenaan bleef vliegen: per frame een schok, een geluid en een wolk
veertjes. Nu glijd je langs de gevel weg, verlies je vaart, en telt de botsing hooguit
één keer per halve seconde. Van 240 frames tegen een muur: 4 reacties, 0 frames in de
muur.

**De cheeky duif was onbereikbaar.** Ze zit vaak op een lantaarnpaal die ongeveer
anderhalve meter van een gevel staat, terwijl de aanraakstraal 2,6 meter was — de
gevelbotsing duwde je weg voordat je erbij kon. Het is nu een ruime cilinder: vier en
een halve meter breed en tien meter hoog, dus er een paar meter overheen vliegen is
genoeg. Alle 96 zitplaatsen getest: 200 van 200 bereikbaar.

### Taal

Alle tekst in het spel staat nu in het Engels: HUD, start- en eindscherm, rangen,
zwevende punten en de besturingshulp. De code-commentaren en deze briefing zijn nog
Nederlands.

---

## 8. Ronde vijf — de cheeky duif was niet te vinden (29 aug 2026)

De vraag was simpel: vanaf wanneer is ze zichtbaar? Het antwoord bleek het probleem.

### Gemeten voordat er iets veranderde

Drieduizend situaties bekeken, met de camera steeds haar kant op gedraaid:

| Afstand | Vrij zicht op de bundel |
|---|---|
| 0–40 m | 32 van 194 |
| 40–80 m | 278 van 857 |
| 80–120 m | 272 van 934 |
| 120–200 m | 338 van 998 |

Zo'n derde van de gevallen dus. Drie oorzaken, en ze stapelden op:

1. **De lichtbundel werd door gebouwen geblokkeerd.** `depthTest` stond aan, dus in een
   stad met 56 panden zie je een baken op straatniveau vrijwel nooit.
2. **De mist begint op 80 meter** en de bundel had een dekking van 0,2, dus verder weg
   loste hij simpelweg op in de lucht.
3. **De camera kijkt omlaag** naar de richtring. Een bundel die de lucht in steekt valt
   daardoor vaak boven het beeld uit — precies het deel dat je zou moeten zien.

Daar bovenop koos `relocate` de verste van drie kandidaten ten opzichte van haar
vórige plek, dus ze kon zomaar aan de andere kant van de stad opduiken. Binnen zestig
seconden is dat niet te doen.

### Opgelost

- **Het baken is nu een baken.** `depthTest` uit en `fog` uit, dus zichtbaar dwars door
  gebouwen heen en op elke afstand. Hoger (70 m), breder en met een dekking die tussen
  0,3 en 0,52 pulseert. Het hartje zelf is ook door gevels heen te zien.
- **Een wijzer in de HUD.** Een hartje met de afstand erbij dat aan de schermrand plakt
  zolang ze buiten beeld is, met een pijl in haar richting. Dit is de echte oplossing:
  een baken in de wereld helpt niet als ze achter je zit of boven het beeld uitvalt.
  De wijzer blijft uit de bovenbalk, waar score, klok en topscore al staan.
- **Ze duikt op een werkbare afstand op.** Acht kandidaten trekken en die pakken die het
  dichtst bij 55 meter ligt, met een ondergrens van 25 meter zodat het geen gratis
  power-up wordt.

### Meetresultaten

| Wat | Uitkomst |
|---|---|
| Afstand bij aanvang van een ronde | 41 tot 71 m, mediaan 54 |
| Binnen 80 m | 400 van 400 |
| Wijzer geeft haar aan | 600 van 600 situaties, ook met haar in de rug |
| Baken door gebouwen heen | ja |
| Baken negeert mist | ja |

Op kruissnelheid is 54 meter ongeveer vijf seconden vliegen. Dat past ruim binnen een
ronde, zeker omdat treffers onderweg de klok weer bijvullen.

---

## 9. Ronde zes — de bundel telt, en er ligt brood (29 aug 2026)

### Door de lichtbundel vliegen telde niet

Terecht opgemerkt. De aanraakzone was een cilinder van 4,5 meter rond de duif met
hooguit tien meter erboven, terwijl de bundel zeventig meter de lucht in steekt. Je
vloog dus dwars door het ding dat je van ver aanwees, en er gebeurde niets. De bundel
is nu zelf de trigger over zijn hele hoogte.

Gemeten vanaf haar zitplaats: op 2, 10, 25, 45 en 60 meter erboven telt het; op 75
meter niet meer (de bundel is 68 hoog); en acht meter naast de bundel telt het niet,
want dan zit je er ook niet in.

### De boterham

Elke zevende voerplek is nu een boterham in plaats van een kruimel: twaalf stuks tegen
vierenzeventig kruimels. Eén oppikken vult je munitie en je adem, levert 25 punten, en
geeft negen seconden waarin je harder klapwiekt, bijna geen uithoudingsvermogen kwijt
bent en veel sneller nieuwe munitie aanmaakt.

| Gemeten over anderhalve seconde doorklapwieken | Zonder | Met |
|---|---|---|
| Hoogtewinst | 11,7 m | 14,4 m |
| Uithoudingsvermogen over | 19 | 92 |
| Munitie aangemaakt in 3 s | 2 | 6 |

Het verschil met cheeky pigeon time is bewust: die maakt van je poep een mitrailleur en
verdubbelt je punten, de boterham maakt je een betere vlieger. De eerste is een uitbarsting,
de tweede is bewegingsvrijheid.

### Duivengedrag dat nog op de plank ligt

Opgezocht, met de mechaniek die eraan vastzit:

- **Koppen knikken.** Duiven kunnen hun ogen niet in de kas bewegen en knikken daarom
  met hun kop om hun blik te stabiliseren terwijl ze lopen. Gratis charme: laat de kop
  knikken tijdens zitten en scharrelen.
- **Drinken door te zuigen.** Vrijwel uniek onder vogels: ze zuigen water op in plaats
  van hun kop achterover te gooien. De fontein op het plein kan daarmee een drinkplek
  worden die je adem in één keer bijvult.
- **Zwermen en het opvliegsignaal.** Duiven leven in zwermen, en het klappen van
  vleugels bij het opvliegen zet de rest van de zwerm ook in beweging. Een groepje
  duiven op straat dat in een kettingreactie opvliegt als je erin landt.
- **Terugkeren naar de vaste slaapplaats.** Duiven hebben een sterke binding met hun
  roostplek en navigeren op zon, magneetveld en geur. Het monument als thuisbasis:
  terugkeren bevestigt je combo of levert tijd op.

---

## 10. Ronde zeven — zwermen, en drie bugs die elkaar maskeerden (30 aug 2026)

### De zwerm

Zes zwermen van zeven duiven staan op de stoep te scharrelen, met knikkende koppen.
Kom je binnen acht meter, dan schrikken ze op in een kettingreactie: één vogel klapt
met zijn vleugels, en pas daarna volgt de rest met negen honderdste seconde ertussen.
Dat is niet verzonnen — bij echte duiven is juist dat klapgeluid het signaal waarop de
zwerm opvliegt. Daarna stuiven ze weg, jagen ze mee met de dichtstbijzijnde drukte en
lozen ze onderweg. Wat zij raken telt voor jouw score, want jij hebt ze opgejaagd.

### Drie bugs die elkaar maskeerden

Dit koste vier meetrondes, omdat elke fout de volgende verborg.

**1. Alle hitboxen stonden op de oorsprong.** `Target` roept `updateBox()` aan in zijn
constructor, maar `Car` en `Pedestrian` zetten hun mesh pas daarná op zijn plek met
`place()`. Tot de eerste `update()` stond de hitbox van elk doel dus op (0,0,0). In het
spel viel dat niet op omdat de eerste frame alles rechtzet, maar het maakte elke
gerichte test onbruikbaar: poep pal boven een auto lossen gaf nul.

**2. De poepregen was een donut.** De vogels cirkelden rond het punt waar ze stonden,
dus er zat een gat in het midden van de regen — precies op het trottoir waar de
voetgangers lopen. Gemeten: het dichtstbijzijnde doel bij een landing was 10,4 meter.

**3. En de doorslaggevende: de vogels laadden nooit bij.** `b.drops` telde af en werd
alleen in `reset()` weer gevuld. Elke zwerm loosde dus alleen bij zijn allereerste
vlucht en was daarna voorgoed leeg. Zes zwermen maal ongeveer vierentwintig lozingen is
honderdvierenveertig — en precies 148 lozingen waren er over honderdvijftig flushes
gemeten. Alle afstellingen die ik daarvoor deed, maten dus vrijwel niets.

Wat me op het spoor zette was niet het treffercijfer maar het aantal lozingen: dat hoort
mee te schalen met het aantal flushes, en dat deed het niet.

### Verder deze ronde

- **Door de lichtbundel vliegen telt nu**, over de hele hoogte van 68 meter.
- **De cheeky duif zit alleen nog op zitplaatsen met vrije lucht erboven.** Ze kwam
  anders op een laag dak naast een toren terecht, en dan liep haar koker dwars door dat
  pand: onbereikbaar. Van de zesennegentig zitplaatsen blijven er negentig over, en
  geen daarvan heeft nog een gebouw boven zich.
- **Als de tijd op is vliegt de duif zelf terug naar het monument** en gaat daar weer
  zitten, terwijl jij naar je score kijkt. Gemeten vanaf negenennegentig meter: 6,3
  seconden onderweg, aangekomen op vier centimeter van de zitplaats.


---

## 11. Ronde acht — de onzichtbare muur (30 aug 2026)

### Er stond echt een muur

De stadsgrens werd getoetst op de afstand tot het midden: een cirkel met straal
eenennegentig. Maar het grondvlak is een vierkant van eenennegentig bij eenennegentig,
en de afstand tot een hoek daarvan is honderdachtentwintig. Vloog je schuin naar een
hoek, dan stond je dus **achtendertig meter voor de zichtbare rand** stil, midden boven
zichtbare straat, zonder dat er iets te zien was.

De grens knijpt nu per as af, precies gelijk aan de grond, en je krijgt bovendien een
melding in beeld in plaats van een raadselachtige stop. Alle vier de hoeken zijn nu tot
op de rand bereikbaar.

### Meer volk

Twee tot vier wandelaars per blok in plaats van één tot twee: van vierendertig naar
tweeënzeventig. Dat geeft meer om op te mikken en het geeft een opgejaagde zwerm
eindelijk iets om op neer te komen — precies het bezwaar uit de vorige ronde.

Een op de vier duwt een **kinderwagen**: honderdtwintig punten in plaats van vijftig,
drieënhalve seconde tijd in plaats van tweeënhalve, breder doel, en langzamer op de been.

### Arcade-letters

Het lettertype is nu Press Start 2P, meegebundeld via npm zodat het spel offline
hetzelfde blijft. Alle groottes zijn teruggebracht, want dezelfde puntgrootte neemt in
dit lettertype bijna twee keer zoveel breedte in. De wijzer naar de cheeky duif is naar
boven verplaatst, want die botste onderin met de munitiebalk.

### Stand

Tweeënzeventig wandelaars, tweeëntwintig kinderwagens, dertien auto's, zes zwermen van
zeven duiven, twaalf boterhammen, vierenzeventig kruimels, zesenvijftig panden.
2197 objecten in de scene, geen fouten, geen lek.


---

## 12. Ronde negen — mikken (30 aug 2026)

"Het blijft echt lastig om iemand te raken." Gemeten in plaats van gegokt, en de klacht
bleek nog harder te onderbouwen dan verwacht.

### Hoe lastig het was

Per frame uitgerekend of lossen op dat moment raak zou zijn, op een rechte overvlucht:

| | tijdsvenster om te lossen |
|---|---|
| Gemiddeld over achttien situaties | **79 ms** |
| Kortste | 17 ms |
| Situaties waarin je nooit raakte | **11 van de 18** |

Tachtig milliseconde is korter dan een mens kan reageren. Mikken was daarmee geen
vaardigheid maar een loterij. En die elf nooit-raak-situaties kwamen ergens anders
vandaan: het doel loopt tijdens de val zijwaarts van je lijn af, dus recht op iemand
afvliegen is per definitie mis.

### Wat eraan gedaan is

**Een spat heeft een straal.** Alles binnen 1,7 meter van het inslagpunt krijgt het over
zich heen. De poep hoefde eerst de hitbox van een doel middenin zijn val exact te
doorkruisen, en dat is bij een doel van één bij één meter een speldenprik. De richtring
gebruikt precies dezelfde straal, dus rood blijft betekenen wat het zegt.

**Het spookdoel.** Een cyaan ruit met een paal en vaantje op de plek waar je doelwit
staat op het moment dat je poep daar aankomt. Dat was de rekensom die de speler in zijn
hoofd moest doen; nu staat hij op de grond. Leg de gouden ring op de cyaan ruit.

**Een tikje bij het op scherp komen**, zodat je niet naar de kleur van een ring hoeft te
turen terwijl je vliegt.

De camera kadert nu ring en spook samen in, want het spook kan voor of achter de inslag
liggen afhankelijk van welke kant je doelwit op loopt, en viel anders onder de onderrand
weg. En het spook is cyaan geworden: wit verdween volledig in het lichte plaveisel.

### Wat het nu is

Getest met een AI die het spookdoel gebruikt, met een menselijke handicap erin gebouwd:
200 milliseconde reactietijd, een onvaste stuurhand en de helft van de tijd helemaal
niet corrigeren.

| Doel | Raak | Lock-venster |
|---|---|---|
| Voetganger | 37 van 40 (93%) | 643 ms |
| Kinderwagen | 39 van 40 (98%) | 635 ms |
| Auto | 29 van 40 (73%) | 642 ms |

Van tachtig milliseconde naar ruim zeshonderd. En belangrijker: de ring wordt nu in
vrijwel elke aanvliegpoging rood, waar dat eerder het echte struikelblok was.

Eén constante om aan te draaien als het te makkelijk blijkt: `SPLASH` in `poop.js`.

### Een fout in mijn eigen meetgereedschap

Twee eerdere metingen die nul teruggaven — de mikproef hierboven en de volledige ronde
uit ronde zeven — waren niet het spel maar mijn testopstelling. `input.hit()` leest
`pressed`, dat alleen door echte toetsaanslagen wordt gevuld, en mijn AI zette alleen
`down`. Er werd dus nooit gepoept. Wat me op het spoor zette: de richtring stond
volgens de meting 2,6 seconde onafgebroken op rood terwijl er nul treffers uitkwamen.
Twee getallen die niet naast elkaar kunnen bestaan zijn een betrouwbaarder alarm dan
één getal dat tegenvalt.


---

## 13. Ronde tien — ruimer raken, en de laatste springende auto's (30 aug 2026)

### Grotere raakgebieden en een troostprijs

De spatstraal was één getal voor alles. Dat klopt niet: een voetganger is één bij één
meter en een auto ruim vier meter lang, dus dezelfde marge betekent voor de een een
speldenprik en voor de ander gemak. Nu staat de straal per soort doel: 2,2 meter rond
een voetganger, 2,4 rond een kinderwagen, 1,4 rond een auto.

Daarbuiten ligt een **schampzone** van anderhalve meter. Een poepje net naast levert een
kwart van de punten op en een halve seconde tijd, met een eigen melding in beeld. De
combo blijft er buiten: het is een aanmoediging, geen manier om een reeks in stand te
houden.

Gemeten op een voetganger: tot 2,5 meter ernaast een voltreffer, op 3,5 meter een
schampschot, vanaf 4,5 meter mis.

De toets is rechthoekig en niet op afstand tot het middelpunt, want anders zou de neus
van een auto buiten bereik vallen. De richtring gebruikt exact dezelfde toets, dus rood
blijft betekenen wat het zegt.

### De vlag is weg

Terecht: een paal met een vaantje stond lelijk in een verder rustig beeld. De functie is
gebleven maar zit nu in de vormtaal van de rest: een dunne ring op de grond, in hetzelfde
goud als de richtring, met een stippellijn ernaartoe vanaf de plek waar het doel nu
staat. Dikke ring op de dunne leggen, en je raakt.

### De laatste springende auto's

Auto's verdwenen nog steeds aan de rand. Het kostte drie stappen om er echt vanaf te
komen, want elke oplossing legde een volgend gat bloot:

1. Op de laatste kruising vóór de rand altijd afslaan. Van 221 sprongen per vijf minuten
   naar 127. Maar na die gedwongen bocht kon hij op de nieuwe weg alsnog naar buiten
   wijzen, en dan lag er geen kruising meer.
2. Die gedwongen bocht de stad in laten draaien. Hielp, maar een *willekeurige* bocht op
   een binnenkruising kon een auto net zo goed voorbij de buitenste ring naar buiten
   laten wijzen.
3. Er als algemene regel van maken: **na elke bocht, en bij het plaatsen, moet er een
   kruising vóór hem liggen.** Zo niet, dan draait hij om.

Resultaat: **nul sprongen** over vijf minuten verkeer, en geen auto komt nog verder dan
drieënvijftig meter van het centrum. Het verkeer circuleert nu volledig binnen het
kruisingenraster.


---

## 14. Ronde elf — de klok liep uit de hand (30 aug 2026)

"Ik ben nu al vijf minuten aan het spelen." Klopt, en het was een rekenfout die pas
zichtbaar werd toen het mikken eenmaal werkte.

### Wat er misging

Break-even lag op één treffer per 2,5 seconde. Zolang mikken een loterij was haalde
niemand dat. Sinds de vorige ronde is raken betrouwbaar geworden, en dus haalde je het
met gemak — waarmee de klok netto opliep en de ronde per definitie nooit eindigde.

Dat is niet met een lagere bonus alleen op te lossen: bij elke vaste bonus bestaat er
een tempo waarbij je oneindig doorspeelt, en een goede speler vindt dat tempo.

### Wat het nu is

De tijdbonussen zijn ongeveer gehalveerd (auto 1,4 s, voetganger 1,8 s, kinderwagen
2,6 s) en het spaarplafond ging van negentig naar vijftig seconden.

Belangrijker: **de klok loopt steeds sneller leeg.** Na zeventig seconden gaat hij twee
keer zo snel, na honderdveertig drie keer. Daarmee bestaat er geen tempo meer dat je
oneindig volhoudt, en wordt vaardigheid beloond met een langere ronde in plaats van met
geen einde. De factor staat onder de klok, in rood, zodra hij boven 1,15 komt — anders
voelt het willekeurig dat je tijd sneller wegloopt.

### Gemeten, los van mikvaardigheid

Met een vaste trefcadans doorgespeeld, zodat het puur de tijdshuishouding meet:

| Trefcadans | Ronde | Score |
|---|---|---|
| 1 per 1,0 s | 139 s | 53.800 |
| 1 per 1,3 s | 109 s | 31.800 |
| 1 per 1,6 s | 91 s | 21.000 |
| 1 per 2,0 s | 76 s | 13.400 |
| 1 per 2,5 s | 66 s | 1.300 |
| 1 per 3,5 s | 57 s | 800 |

Zelfs elke seconde raken komt niet verder dan honderdnegenendertig seconden. En de
score loopt van achthonderd naar bijna vierenvijftigduizend, dus het verschil tussen
matig en goed spelen is groter geworden, niet kleiner.

Die sprong in score tussen 2,5 en 1,6 seconde is geen toeval: het combovenster is twee
seconden, dus wie trager raakt dan dat bouwt nooit een vermenigvuldiger op.
