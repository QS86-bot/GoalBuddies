import { t } from '../i18n';
import type { Pictogramkleuren } from '../theme/pictogramkleuren';

/**
 * De tekeningen van de meerkleurige pictogrammen, als gegevens — QS8-730.
 *
 * ⚠️ **Gegevens en geen componenten, met opzet.** Een tekening is een lijst
 *    paden met kleursleutels; `Pictogram.tsx` zet er alleen `react-native-svg`
 *    omheen. Daardoor kan elke belofte hieronder met een gewone test worden
 *    gemeten zonder react-native te laden, en blijft elke tekenfunctie kort
 *    (regel 15): er is geen tekenfunctie, er is een tabel.
 *
 * ⚠️ **Een tekening noemt een kleur nooit zelf.** Elke vulling en elke rand is
 *    een sleutel uit `Pictogramkleuren` (`shared/theme`); een hexwaarde hier is
 *    een fout die `geen-kleurliteralen-in-schermen.test.ts` rood maakt.
 *
 * ⚠️ **Eigen werk.** De zes uit `docs/research/mockup-fase-1-uiterlijk.html` zijn
 *    eigen tekeningen; doel, kroon, bliksem, hart en duim ook. Geen vorm komt
 *    van de mascotte of de pictogrammen van Habit Huddle (hun voorwaarden §7
 *    verbieden hun trade dress), en het zijn geen emoji: SVG-paden, geen
 *    tekens, dus `npm run emoji:controle` ziet ze niet.
 *
 * ⚠️ **Kroon of bliksem, hart of duim: beide staan er, Quinten kiest.** De
 *    afwijzende kant wordt pas verwijderd als hij gekozen heeft (QS8-730, vijfde
 *    ronde). Tot die tijd hangt er geen scherm aan: `PICTOGRAM_BETEKENISSEN`
 *    zegt waar ze straks mogen komen.
 */

export const PICTOGRAMMEN = [
  'vlam',
  'ster',
  'schild',
  'medaille',
  'trofee',
  'ketting',
  'doel',
  'kroon',
  'bliksem',
  'hart',
  'duim',
] as const;

export type PictogramNaam = (typeof PICTOGRAMMEN)[number];
export type KleurSleutel = keyof Pictogramkleuren;
export type VerloopSleutel = 'vlam' | 'goud' | 'groen' | 'roze' | 'blauw';

/** Van boven naar beneden; de laatste stop is de sterkste. */
export const VERLOPEN: Readonly<Record<VerloopSleutel, readonly KleurSleutel[]>> = {
  vlam: ['vlamBoven', 'vlamMidden', 'vlamOnder'],
  goud: ['goud', 'goudDiep'],
  groen: ['groen', 'groenRand'],
  roze: ['roze', 'rozeRand'],
  blauw: ['blauw', 'blauwRand'],
};

export interface Deel {
  /** Een pad in een vak van 32 bij 32. */
  readonly d: string;
  readonly vul?: KleurSleutel;
  readonly verloop?: VerloopSleutel;
  readonly rand?: KleurSleutel;
  readonly randBreedte?: number;
  readonly dekking?: number;
}

export interface Tekening {
  readonly delen: readonly Deel[];
  /** De kleuren die de vorm dragen; die halen 3:1 op elk vlak (toets). */
  readonly drager: readonly KleurSleutel[];
}

function cirkel(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
}

function afgerond(x: number, y: number, b: number, h: number, r: number): string {
  const rechts = x + b;
  const onder = y + h;
  return (
    `M${x + r} ${y}H${rechts - r}A${r} ${r} 0 0 1 ${rechts} ${y + r}V${onder - r}` +
    `A${r} ${r} 0 0 1 ${rechts - r} ${onder}H${x + r}A${r} ${r} 0 0 1 ${x} ${onder - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}z`
  );
}

const RAND = 1.3;

export const TEKENINGEN: Readonly<Record<PictogramNaam, Tekening>> = {
  vlam: {
    delen: [
      { d: 'M16 2c1 6 8 8 8 16a8 8 0 0 1-16 0c0-3 1.5-5 3-6 0 3 1 4 2 4 0-5 1-9 3-14z', verloop: 'vlam', rand: 'vlamRand', randBreedte: RAND },
      { d: 'M16 15c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 .5 1.5 1 1.5 0-2 .5-3.5 1-5.5z', vul: 'licht', dekking: 0.4 },
    ],
    drager: ['vlamRand'],
  },
  ster: {
    delen: [
      { d: 'M16 2.5l4 8.6 9.4 1.1-7 6.4 1.9 9.3L16 23.2 7.7 27.9l1.9-9.3-7-6.4 9.4-1.1z', verloop: 'goud', rand: 'goudRand', randBreedte: RAND },
    ],
    drager: ['goudRand'],
  },
  schild: {
    delen: [
      { d: 'M16 2l11 4v9c0 7-5 12-11 15C10 27 5 22 5 15V6z', verloop: 'groen', rand: 'groenRand', randBreedte: RAND },
      { d: 'M11 16l4 4 7-8', rand: 'licht', randBreedte: 2.6 },
    ],
    drager: ['groenRand'],
  },
  medaille: {
    delen: [
      { d: 'M9 2h5l3 9h-5zM23 2h-5l-3 9h5z', vul: 'blauw', rand: 'blauwRand', randBreedte: 1 },
      { d: cirkel(16, 20, 9), verloop: 'goud', rand: 'goudRand', randBreedte: 1.4 },
      { d: 'M16 14.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z', vul: 'licht', dekking: 0.55 },
    ],
    drager: ['goudRand', 'blauwRand'],
  },
  trofee: {
    delen: [
      { d: 'M9 6H4c0 5 2 8 5 8M23 6h5c0 5-2 8-5 8', rand: 'goudRand', randBreedte: 2 },
      { d: 'M9 4h14v7a7 7 0 0 1-14 0z', verloop: 'goud', rand: 'goudRand', randBreedte: 1.4 },
      { d: 'M13 19h6v4h-6zM10 27h12v-3H10z', vul: 'goudDiep', rand: 'goudRand', randBreedte: RAND },
    ],
    drager: ['goudRand'],
  },
  ketting: {
    delen: [
      { d: afgerond(3, 11, 14, 10, 5), rand: 'cyaan', randBreedte: 3 },
      { d: afgerond(15, 11, 14, 10, 5), rand: 'groenRand', randBreedte: 3 },
    ],
    drager: ['cyaan', 'groenRand'],
  },
  doel: {
    delen: [
      { d: cirkel(16, 16, 13), rand: 'blauwRand', randBreedte: 2.4 },
      { d: cirkel(16, 16, 8), rand: 'blauwRand', randBreedte: 2.4 },
      { d: cirkel(16, 16, 3.2), vul: 'oranje' },
    ],
    drager: ['blauwRand', 'oranje'],
  },
  kroon: {
    delen: [
      { d: 'M4 25L3 10l7.5 6L16 5l5.5 11L29 10l-1 15z', verloop: 'goud', rand: 'goudRand', randBreedte: RAND },
      { d: afgerond(4, 25, 24, 4, 1), vul: 'goudDiep', rand: 'goudRand', randBreedte: RAND },
    ],
    drager: ['goudRand'],
  },
  bliksem: {
    delen: [{ d: 'M19 2L7 18h7l-2 12 13-18h-7z', verloop: 'goud', rand: 'goudRand', randBreedte: RAND }],
    drager: ['goudRand'],
  },
  hart: {
    delen: [
      { d: 'M16 28C6 20 3 14.5 3 10.5A6.5 6.5 0 0 1 16 8a6.5 6.5 0 0 1 13 2.5C29 14.5 26 20 16 28z', verloop: 'roze', rand: 'rozeRand', randBreedte: RAND },
      { d: 'M8 10.5a3.5 3.5 0 0 1 3.5-3.5', rand: 'licht', randBreedte: 1.8 },
    ],
    drager: ['rozeRand'],
  },
  duim: {
    delen: [
      { d: afgerond(3, 14, 6, 14, 1.5), vul: 'blauwRand', rand: 'blauwRand', randBreedte: RAND },
      { d: 'M11 14l4-9c2 0 3.5 1.4 3.5 3.3V13h7.2c1.6 0 2.8 1.5 2.5 3l-1.8 9c-.3 1.3-1.4 2.2-2.7 2.2H11z', verloop: 'blauw', rand: 'blauwRand', randBreedte: RAND },
    ],
    drager: ['blauwRand'],
  },
};

/**
 * Wat een pictogram mag betekenen — domeinregel 7 als type.
 *
 * ⚠️ **Er staat geen enkele negatieve toestand in deze lijst, en dat is de
 *    maatregel.** Een gemiste week, lege dag, verbroken reeks of achterstand heeft
 *    hier geen waarde, dus er is geen pictogram dat ze kan aanduiden en het type
 *    laat ze niet toe. `pictogrammen.test.ts` toetst bovendien elk gebruik in
 *    `app/` en `src/`.
 */
export const BETEKENISSEN = [
  'doel',
  'voltooiing',
  'mijlpaal',
  'reeks',
  'weekpas',
  'ketting',
  'viering',
  'prestatie',
  'zeldzame_prestatie',
  'aanmoediging',
] as const;

export type Betekenis = (typeof BETEKENISSEN)[number];

/**
 * Per pictogram waar het mag staan.
 *
 * ⚠️ Hart en duim alleen voor aanmoediging (QS8-730, criterium 1) en kroon en
 *    bliksem alleen voor `zeldzame_prestatie` (criterium 2: zeldzaam en hoger).
 */
export const PICTOGRAM_BETEKENISSEN: Readonly<Record<PictogramNaam, readonly Betekenis[]>> = {
  vlam: ['reeks', 'prestatie'],
  ster: ['mijlpaal', 'voltooiing', 'prestatie'],
  schild: ['weekpas', 'prestatie'],
  medaille: ['voltooiing', 'mijlpaal', 'prestatie'],
  trofee: ['viering', 'prestatie'],
  ketting: ['ketting', 'prestatie'],
  doel: ['doel', 'mijlpaal'],
  kroon: ['zeldzame_prestatie'],
  bliksem: ['zeldzame_prestatie'],
  hart: ['aanmoediging'],
  duim: ['aanmoediging'],
};

export function pictogramToegestaan(naam: PictogramNaam, betekenis: Betekenis): boolean {
  return PICTOGRAM_BETEKENISSEN[naam].includes(betekenis);
}

/** Het label uit de catalogus; een vergrendelde prestatie zegt dat ook in tekst. */
export function pictogramLabel(naam: PictogramNaam, vergrendeld: boolean): string {
  const label = t(`pictogram.${naam}`);
  return vergrendeld ? t('pictogram.vergrendeld', { naam: label }) : label;
}

/**
 * De vergrendelde variant gebruikt dezelfde vorm in drie grijzen en geen verloop.
 * Highlights worden `slotLicht`, randen `slotRand`, al het andere `slot`.
 */
function slotKleur(sleutel: KleurSleutel): KleurSleutel {
  if (sleutel === 'licht') return 'slotLicht';
  return sleutel.endsWith('Rand') || sleutel === 'cyaan' ? 'slotRand' : 'slot';
}

export interface Getekend {
  readonly d: string;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity: number;
}

/**
 * De tekening met echte kleuren. `verloopId` is het voorvoegsel van de
 * gradiënt-ids van deze instantie; die zijn op web wereldwijd in het document.
 */
export function teken(
  naam: PictogramNaam,
  kleuren: Pictogramkleuren,
  vergrendeld: boolean,
  verloopId: string,
): readonly Getekend[] {
  const kleur = (s: KleurSleutel) => kleuren[vergrendeld ? slotKleur(s) : s];
  return TEKENINGEN[naam].delen.map((deel) => {
    let fill = 'none';
    if (deel.verloop !== undefined) fill = vergrendeld ? kleur('slot') : `url(#${verloopId}-${deel.verloop})`;
    else if (deel.vul !== undefined) fill = kleur(deel.vul);
    return {
      d: deel.d,
      fill,
      stroke: deel.rand === undefined ? 'none' : kleur(deel.rand),
      strokeWidth: deel.randBreedte ?? 0,
      opacity: deel.dekking ?? 1,
    };
  });
}

/** De verlopen die deze tekening gebruikt, zonder dubbelen. */
export function verlopenVan(naam: PictogramNaam): readonly VerloopSleutel[] {
  const sleutels = TEKENINGEN[naam].delen.flatMap((d) => (d.verloop === undefined ? [] : [d.verloop]));
  return [...new Set(sleutels)];
}
