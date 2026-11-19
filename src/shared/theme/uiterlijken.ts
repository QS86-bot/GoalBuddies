import {
  categoriekleurenNavy,
  categoriekleurenNavyLight,
  heldkleurenNavy,
  heldkleurenNavyLight,
  navy,
  navyLight,
  roles,
  shadow,
  type Categoriekleuren,
  type Heldpalet,
  type Palette,
} from './tokens';

/**
 * De uiterlijken — QS8-723 (1.1a), besluit QS8-722.
 *
 * ⚠️ **Een uiterlijk is een benoemde, volledige set paletten, één per modus.**
 *    Wie een uiterlijk toevoegt (QS8-724 en QS8-725: C met kleurvarianten) levert
 *    waarden aan en geen nieuwe code: `uiterlijken.test.ts` loopt over élk
 *    uiterlijk en élke modus en faalt op een ontbrekende sleutel, een te laag
 *    contrast of een categoriekleur die op een statuskleur valt.
 *
 * ⚠️ **Dit is de architectuur en niet de schakelaar.** Niets in de app kiest vandaag
 *    een uiterlijk: `ThemeProvider` bewaart nog `systeem | navy | navy-licht`, en
 *    `navy` is hier uiterlijk **B**. De voorkeur per account is QS8-729 (een
 *    migratie) en het scherm Uiterlijk is QS8-731. Tot dan verandert er in de app
 *    niets, en dat is met opzet.
 *
 * ⚠️ **A en B delen de statuskleuren, de categoriekleuren en het heldenpalet.**
 *    Alleen het merk (`accent`, `accentDim`, `gridLine`, de knop) verschilt. Dat is
 *    een keuze van dit issue en geen beslissing van de epic: C (QS8-724) mag méér
 *    laten verschillen, en dan is dit de plek waar dat blijkt.
 *
 * ⚠️ **Het accent van A is blauwgroen en niet emerald.** Emerald (`#10b981`) ligt
 *    op 3,2 van het statusgroen (`green`), dus "gehaald" en "merk" vallen samen
 *    (afstand gemeten in het issue, zie QS8-723). Het blauwgroen hieronder is een
 *    voorstel dat de toets moet halen; de waarde is niet heilig, de toets wel.
 */

export type UiterlijkId = 'A' | 'B' | 'C-baai' | 'C-avondgloed' | 'C-bosrand' | 'C-pruim' | 'C-koraal';
export type Modus = 'donker' | 'licht';

/**
 * Het verloop van uiterlijk C (QS8-724): een achtergrond van `bg` naar een tweede tint, en een accentverloop
 * voor de primaire knop en de voortgangsstreep. Alleen waarden uit dit palet; `Verloop` (`shared/ui`) tekent het.
 * A en B hebben er geen (`null`) en blijven vlak.
 */
export interface Verloop {
  readonly achtergrond: readonly [van: string, naar: string];
  readonly accent: readonly [van: string, naar: string];
}

export interface UiterlijkPalet {
  readonly colors: Palette;
  readonly verloop: Verloop | null;
  readonly families: Categoriekleuren;
  readonly helden: Heldpalet;
  readonly roles: ReturnType<typeof roles>;
}

export type Uiterlijk = Readonly<Record<Modus, UiterlijkPalet>>;

function palet(
  colors: Palette,
  families: Categoriekleuren,
  helden: Heldpalet,
  verloop: Verloop | null = null,
): UiterlijkPalet {
  return { colors, families, helden, verloop, roles: roles(colors) };
}

/**
 * C: een levendig verloop op een eigen ondergrond. De statuskleuren (`green`, `orange`, `red`) zijn die van
 * navy: één statusrood voor de hele app (QS8-743), vastgesteld in `tokens.ts` en getoetst in `statusrood.test.ts`.
 * Categoriekleuren en helden worden gedeeld met A en B.
 *
 * ⚠️ `accent` is de tweede tint van het verloop; de eerste staat in `verloop.accent`. De toets leest allebei.
 */
const cBasisDonker = {
  ...navy,
  border: 'rgba(255,255,255,0.14)',
  knopTekst: '#0a1230',
} as const;

const cBasisLicht = { ...navyLight, knopTekst: '#ffffff' } as const;

const baaiDonker: Palette = {
  ...cBasisDonker,
  bg: '#0a1230',
  panel: '#1b233e',
  panelDark: '#161e3a',
  accent: '#22d3ee',
  accentDim: '#0fa5c4',
  gridLine: 'rgba(34,211,238,0.028)',
  knop: '#22d3ee',
};

const baaiLicht: Palette = {
  ...cBasisLicht,
  bg: '#eef8fb',
  panelDark: '#e3f1f5',
  border: '#cfe3ea',
  accent: '#0a6e94',
  accentDim: '#085a7a',
  gridLine: 'rgba(10,110,148,0.035)',
  knop: '#085a7a',
};

const avondDonker: Palette = {
  ...cBasisDonker,
  bg: '#1a0b33',
  panel: '#2a1c41',
  panelDark: '#25173d',
  accent: '#e879f9',
  accentDim: '#c455d6',
  gridLine: 'rgba(232,121,249,0.028)',
  knop: '#e879f9',
  knopTekst: '#1a0b33',
};

const avondLicht: Palette = {
  ...cBasisLicht,
  bg: '#fbf3fa',
  panelDark: '#f6e9f4',
  border: '#ead3e6',
  accent: '#8e24aa',
  accentDim: '#701c85',
  gridLine: 'rgba(142,36,170,0.035)',
  knop: '#8e24aa',
};

/**
 * Bosrand, Pruim en Koraal (QS8-725). Zelfde vorm als Baai en Avondgloed: het accent is de tweede tint van het
 * verloop, en de achtergrond begint op `bg`. De waarden die van het voorstel afwijken, staan met hun meting in
 * `docs/decisions/2026-11-19-bosrand-pruim-en-koraal.md`.
 */
const bosDonker: Palette = {
  ...cBasisDonker,
  bg: '#06180f',
  panel: '#172820',
  panelDark: '#12241b',
  accent: '#a3e635',
  accentDim: '#86b82c',
  gridLine: 'rgba(163,230,53,0.028)',
  knop: '#a3e635',
  knopTekst: '#142400',
};

const bosLicht: Palette = {
  ...cBasisLicht,
  bg: '#f2fbe9',
  panelDark: '#e8f5dc',
  border: '#d3e5c3',
  accent: '#185818',
  accentDim: '#104410',
  gridLine: 'rgba(24,88,24,0.035)',
  knop: '#185818',
};

const pruimDonker: Palette = {
  ...cBasisDonker,
  bg: '#150b30',
  panel: '#261c3e',
  panelDark: '#21173a',
  accent: '#c084fc',
  accentDim: '#9d6ad0',
  gridLine: 'rgba(192,132,252,0.028)',
  knop: '#c084fc',
  knopTekst: '#1d0538',
};

const pruimLicht: Palette = {
  ...cBasisLicht,
  bg: '#f7f0ff',
  panelDark: '#f0e6fb',
  border: '#e0d0f2',
  accent: '#8020d0',
  accentDim: '#6a18ad',
  gridLine: 'rgba(128,32,208,0.035)',
  knop: '#8020d0',
};

const koraalDonker: Palette = {
  ...cBasisDonker,
  bg: '#2a0f1c',
  panel: '#331e29',
  panelDark: '#2e1a25',
  accent: '#fb7185',
  accentDim: '#cf5c6d',
  gridLine: 'rgba(251,113,133,0.028)',
  knop: '#fb7185',
  knopTekst: '#340a10',
};

const koraalLicht: Palette = {
  ...cBasisLicht,
  bg: '#fff3f3',
  panelDark: '#fbe8e8',
  border: '#f0d2d2',
  accent: '#981840',
  accentDim: '#7a1233',
  gridLine: 'rgba(152,24,64,0.035)',
  knop: '#981840',
};

/** A: blauwgroen op navy. Donker en licht. */
const aDonker: Palette = {
  ...navy,
  accent: '#22d3ee',
  accentDim: '#0fa5c4',
  gridLine: 'rgba(34,211,238,0.028)',
  knop: '#22d3ee',
  knopTekst: '#0e1730',
};

const aLicht: Palette = {
  ...navyLight,
  accent: '#0b6b8f',
  accentDim: '#085873',
  gridLine: 'rgba(11,107,143,0.035)',
  knop: '#085873',
  knopTekst: '#ffffff',
};

export const UITERLIJKEN: Readonly<Record<UiterlijkId, Uiterlijk>> = {
  A: {
    donker: palet(aDonker, categoriekleurenNavy, heldkleurenNavy),
    licht: palet(aLicht, categoriekleurenNavyLight, heldkleurenNavyLight),
  },
  'C-baai': {
    donker: palet(baaiDonker, categoriekleurenNavy, heldkleurenNavy, {
      achtergrond: ['#0a1230', '#0a4152'],
      accent: ['#60a5fa', '#22d3ee'],
    }),
    licht: palet(baaiLicht, categoriekleurenNavyLight, heldkleurenNavyLight, {
      achtergrond: ['#eef8fb', '#d5edf3'],
      accent: ['#2563eb', '#0a6e94'],
    }),
  },
  'C-avondgloed': {
    donker: palet(avondDonker, categoriekleurenNavy, heldkleurenNavy, {
      achtergrond: ['#1a0b33', '#3b1a4f'],
      accent: ['#f59e0b', '#e879f9'],
    }),
    licht: palet(avondLicht, categoriekleurenNavyLight, heldkleurenNavyLight, {
      achtergrond: ['#fbf3fa', '#f6dff2'],
      accent: ['#9a3412', '#8e24aa'],
    }),
  },
  'C-bosrand': {
    donker: palet(bosDonker, categoriekleurenNavy, heldkleurenNavy, {
      achtergrond: ['#06180f', '#0c4026'],
      accent: ['#00e8a8', '#a3e635'],
    }),
    licht: palet(bosLicht, categoriekleurenNavyLight, heldkleurenNavyLight, {
      achtergrond: ['#f2fbe9', '#d9f5e3'],
      accent: ['#006888', '#185818'],
    }),
  },
  'C-pruim': {
    donker: palet(pruimDonker, categoriekleurenNavy, heldkleurenNavy, {
      achtergrond: ['#150b30', '#3b1a6e'],
      accent: ['#f0abfc', '#c084fc'],
    }),
    licht: palet(pruimLicht, categoriekleurenNavyLight, heldkleurenNavyLight, {
      achtergrond: ['#f7f0ff', '#efe1ff'],
      accent: ['#b808c0', '#8020d0'],
    }),
  },
  'C-koraal': {
    donker: palet(koraalDonker, categoriekleurenNavy, heldkleurenNavy, {
      achtergrond: ['#2a0f1c', '#6b2230'],
      accent: ['#fdba74', '#fb7185'],
    }),
    licht: palet(koraalLicht, categoriekleurenNavyLight, heldkleurenNavyLight, {
      achtergrond: ['#fff3f3', '#ffe4dc'],
      accent: ['#681030', '#981840'],
    }),
  },
  // B is het huidige stelsel (goud met groen voor voortgang): ongewijzigd.
  B: {
    donker: palet(navy, categoriekleurenNavy, heldkleurenNavy),
    licht: palet(navyLight, categoriekleurenNavyLight, heldkleurenNavyLight),
  },
};

/**
 * De standaard voor een nieuwe gebruiker: uiterlijk B, donker (E8 en E9, QS8-721).
 *
 * De keuze van de gebruiker leeft in `modules/uiterlijk` (QS8-729) en komt via `ThemeProvider` binnen (QS8-731).
 * De brug van de oude voorkeur (`systeem | navy | navy-licht`) naar een weergave is `legacyWeergave()` daar.
 */
export const STANDAARD_UITERLIJK: UiterlijkId = 'B';
export const STANDAARD_MODUS: Modus = 'donker';

export const UITERLIJK_IDS = Object.keys(UITERLIJKEN) as readonly UiterlijkId[];
export const MODI: readonly Modus[] = ['donker', 'licht'];

/** Alle paletten als lijst `[naam, palet]`, voor toetsen die over elk palet lopen. */
export function allePaletten(): readonly (readonly [string, UiterlijkPalet])[] {
  return UITERLIJK_IDS.flatMap((id) =>
    MODI.map((modus) => [`${id} (${modus})`, UITERLIJKEN[id][modus]] as const),
  );
}

export function uiterlijk(id: UiterlijkId, modus: Modus): UiterlijkPalet {
  return UITERLIJKEN[id][modus];
}

/** Voor de schaduw: de kleur en sterkte horen bij de modus, niet bij het uiterlijk. */
export function schaduwVoor(modus: Modus) {
  return modus === 'donker' ? shadow.navy : shadow.navyLight;
}
