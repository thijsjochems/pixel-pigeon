# Pixel Pigeon 3D

Je bent een duif in een pixelstad. Je vliegt. Je poept op dingen. Er zijn punten.

Zie [BRIEFING.md](BRIEFING.md) voor het ontwerp, de fasering en waarom het spel er zo uitziet.

## Draaien

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # statische map in dist/
npm run preview  # de build lokaal bekijken
```

## Besturing

| Toets | Actie |
|---|---|
| `W` / `↑` | gas geven |
| `S` / `↓` | remmen |
| `A` `D` / `←` `→` | sturen |
| `Space` | klapwieken (kost uithoudingsvermogen) |
| `Shift` | duiken |
| `E` / linkermuisknop | poepen |
| `R` | opnieuw |
| `M` | geluid aan/uit |

## Het spel

Je hebt **60 seconden**. Elke treffer zet er tijd bij: een auto 2,0 s, een voetganger
2,5 s, iemand met een kinderwagen 3,5 s (en 120 punten in plaats van 50), en een
treffer van meer dan 16 m hoogte (`SNIPE`, dubbele punten) nog eens 1 s extra. Je speelt dus niet tegen een timer maar tegen je eigen tempo — stoppen met
raken is stoppen met spelen. Sparen kan tot maximaal 90 seconden.

Twee treffers binnen 2 seconden bouwen een combo op, tot x8. Het verkeer trekt
gaandeweg aan, dus minuut twee is drukker dan minuut een.

**Mikken.** Twee markeringen op de grond doen het werk:

- De **gouden ring** is waar je poep neerkomt.
- De **dunne ring aan het eind van een stippellijn** is waar je doelwit staat op het
  moment dat je poep daar aankomt. Bij een val van bijna een seconde loopt een
  voetganger zo drie meter door, en zonder die markering moest je dat in je hoofd
  uitrekenen.

Leg de dikke ring op de dunne. Beide worden rood en je hoort een tikje: lossen.

Een spat heeft een straal: 2,2 meter rond een voetganger, 2,4 rond een kinderwagen en
1,4 rond een auto, die uit zichzelf al groot is. Daarbuiten ligt nog een schampzone van
anderhalve meter, goed voor een kwart van de punten en een halve seconde. Net naast is
dus niet voor niets.

**Het idee achter de besturing.** Snelheid geeft draagkracht, maar net niet genoeg:
je zakt altijd een beetje. Klimmen kan alleen door te klapwieken en dat kost
uithoudingsvermogen. Te langzaam vliegen laat je vallen. Duiken ruilt hoogte voor
snelheid, en optrekken zet die snelheid weer om in hoogte — dus een duikbombardement
levert je je hoogte grotendeels terug als je 'm goed uitvoert.

Je hebt **zes poep**. Er groeit er vanzelf ongeveer een per twee seconden bij, dus je
komt nooit volledig stil te staan. Broodkruimels van de grond pikken levert er meteen
twee op, en dat betekent laag vliegen. Daar zit de bedoelde spanning.

Poep erft je snelheid, dus je moet voorliggen op een bewegend doel. Raken van grote
hoogte (>16 m valhoogte) telt dubbel: `SNIPE`.

## Opbouw

```
src/
  main.js      opstarten, vaste-stap lus, de pixel-look
  game.js      wereld, score, combo's, camera
  pigeon.js    het vliegmodel — de belangrijkste getallen van het project
  city.js      stadsraster, gebouwen, botsingen, rijstroken
  targets.js   auto's, voetgangers, kruimels
  poop.js      projectielen (vaste pool)
  fx.js        splats, veertjes, zwevende punten, schudden, hit-stop, richtring
  audio.js     alle geluid, gesynthetiseerd met WebAudio
  hud.js       DOM-overlay
  textures.js  alle texturen, procedureel op canvas getekend
  palette.js   het 16-kleuren palet
```

**Twee dingen die belangrijk zijn om te weten voordat je dit aanpast:**

1. **De pixel-look komt uit `main.js`, niet uit de texturen.** Er wordt gerenderd op
   een buffer van ongeveer 384×224 die door CSS met `image-rendering: pixelated`
   wordt opgeschaald. Zet `RENDER_HEIGHT` hoger of lager om de pixels kleiner of
   groter te maken.

2. **De simulatie draait op een vaste stap van 1/60 s.** Nooit `dt` uit de
   renderlus in physics stoppen — dan speelt het spel anders op een 144 Hz-scherm
   dan op 60 Hz. Dat was een van de fouten in de oude versie.

Alle texturen worden bij het opstarten getekend met een deterministische RNG, dus de
stad ziet er elke refresh hetzelfde uit. Er zijn geen afbeeldingsbestanden.

**Drie dingen die je niet los van elkaar moet aanpassen:** de valsnelheid van de poep
(`GRAVITY` in `poop.js`), de baanvoorspelling van de richtring (`predictImpact`, zelfde
bestand) en de camerakadrering (`updateCamera` in `game.js`). De ring gebruikt exact
dezelfde beginwaarden als `fire()`, en de camera kijkt tussen de duif en die ring in.
Verander je er één, dan mikt de speler mis of valt de ring van het scherm.

## Status

Fase 1 en het grootste deel van fase 2 zijn af: vliegen, mikken met richtring, raken,
scoren, combo's, munitie-lus, ronde met klok en tijdbonus, oplopende drukte,
start- en eindscherm met highscore, en volledig gesynthetiseerd geluid.
Nog open uit fase 2: doelenvariëteit (paraplu's, was aan de lijn, terrasjes),
gevaren en mobiele besturing. Fase 3 (missies, wijken, progressie) staat in de briefing.

De oude versie staat in [legacy/](legacy/) en wordt nergens meer gebruikt.
