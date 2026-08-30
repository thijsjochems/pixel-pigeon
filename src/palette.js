// 16-kleuren palet. Alles in de game kiest hieruit — dat is wat de stijl samenhang geeft.
// Koele blauwgrijze basis (stad, beton, schemer) met warme accenten (baksteen, licht, snavel).

export const PALETTE = [
  '#0a0b14', // 0  ink      — outlines, diepste schaduw
  '#1b1f33', // 1  night    — schaduwvlakken
  '#303a5c', // 2  slate    — asfalt, donker beton
  '#4d5b85', // 3  steel    — duivenlijf, gevelblok
  '#7f8cb5', // 4  mist     — stoep, lichte gevel
  '#b9c2dd', // 5  haze     — highlights
  '#f2f4ff', // 6  bone     — wit, poep, wegmarkering
  '#5a2f28', // 7  oxblood  — dak, diepe baksteen
  '#9c4a35', // 8  brick    — baksteen
  '#d97b4a', // 9  clay     — snavel, dakpan, oranje
  '#f2c45a', // 10 gold     — verlicht raam, kruimel, score
  '#2f6b4f', // 11 moss     — boomschaduw
  '#4fae6b', // 12 leaf     — blad, gras
  '#37a9c9', // 13 cyan     — glas, iriserende nek
  '#c2405a', // 14 crimson  — rode auto, gevaar
  '#8b5fbf', // 15 violet   — iriserende nek, neon
];

// Benoemde aliassen. Code leest hiermee als ontwerp, niet als indexgegoochel.
export const C = {
  ink: PALETTE[0],
  night: PALETTE[1],
  slate: PALETTE[2],
  steel: PALETTE[3],
  mist: PALETTE[4],
  haze: PALETTE[5],
  bone: PALETTE[6],
  oxblood: PALETTE[7],
  brick: PALETTE[8],
  clay: PALETTE[9],
  gold: PALETTE[10],
  moss: PALETTE[11],
  leaf: PALETTE[12],
  cyan: PALETTE[13],
  crimson: PALETTE[14],
  violet: PALETTE[15],
};

// Semantische namen — als de stijl verschuift, verschuift hij hier op één plek.
export const SKY = C.mist;
export const FOG = C.haze;
export const ROAD = C.slate;
export const SIDEWALK = C.mist;
export const POOP = C.bone;

export const CAR_COLORS = [C.crimson, C.cyan, C.gold, C.bone, C.moss, C.violet, C.clay];
export const SHIRT_COLORS = [C.crimson, C.cyan, C.gold, C.leaf, C.violet, C.clay, C.bone];
