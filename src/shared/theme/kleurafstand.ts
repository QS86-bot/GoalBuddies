import { parseColor } from './contrast';

/**
 * Hoe ver twee kleuren uit elkaar liggen — óók voor wie kleurenblind is.
 *
 * ⚠️ **Dit bestand bestaat omdat besluit A55 een meting is en geen smaak.** Er
 *    staat in dat er precies drie categoriekleuren op navy passen en dat elke
 *    vierde kandidaat omviel. Zonder deze code is dat een zin in een document;
 *    met deze code rekent `kleurafstand.test.ts` het bij elke run na.
 *
 *    Hetzelfde patroon als `contrast.ts`: een belofte uit het design system in
 *    een test in plaats van in een belofte.
 *
 * ⚠️ **Contrast en onderscheid zijn twee verschillende dingen, en alleen het
 *    eerste stond er al.** Twee kleuren kunnen allebei ruim boven de
 *    contrastdrempel liggen en tóch niet uit elkaar te houden zijn — dat is
 *    precies wat er gebeurt met magenta en olijf bij deuteranopie. Een
 *    categoriekleur die je niet van de buurman onderscheidt, codeert niets.
 */

/** Lineair licht uit een sRGB-kanaal (0–255). */
function lineair(waarde: number): number {
  const c = waarde / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function naarSrgb(waarde: number): string {
  const c = Math.max(0, Math.min(1, waarde));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255)
    .toString(16)
    .padStart(2, '0');
}

/**
 * sRGB naar OKLab.
 *
 * ⚠️ OKLab en niet CIELAB, en dat is de reden dat dit bestand er is en niet één
 *    regel met Euclidische afstand op RGB. OKLab is perceptueel uniform: een
 *    afstand van 10 betekent er ongeveer hetzelfde in blauw als in geel. Op RGB
 *    is diezelfde 10 in het ene gebied een duidelijk verschil en in het andere
 *    onzichtbaar, en dan meet je iets anders dan je bedoelt.
 */
export function oklab(kleur: string): readonly [number, number, number] {
  const { r, g, b } = parseColor(kleur);
  const rl = lineair(r);
  const gl = lineair(g);
  const bl = lineair(b);

  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * De perceptuele afstand tussen twee kleuren, op een schaal van 0 tot ongeveer
 * 100.
 *
 * ⚠️ Maal honderd, want OKLab levert waarden rond de 1 en dan lezen de drempels
 *    als 0.101. Dezelfde getallen, een leesbaardere schaal.
 */
export function kleurafstand(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

export const KLEURENBLINDHEID = ['deutan', 'protan', 'tritan'] as const;
export type Kleurenblindheid = (typeof KLEURENBLINDHEID)[number];

/**
 * Benaderende simulatiematrices, toegepast op lineair licht.
 *
 * ⚠️ **Een benadering, en dat is met opzet genoeg.** De nauwkeurige methode
 *    (Brettel) projecteert op twee halfvlakken en vraagt een kleurruimte-
 *    bibliotheek. Wat deze controle moet beantwoorden is niet "hoe ziet dit er
 *    exact uit" maar "vallen twee van onze kleuren op elkaar" — en daarvoor is
 *    de richting van de verschuiving genoeg. Een drempel met marge doet de rest.
 */
const MATRIX: Readonly<Record<Kleurenblindheid, readonly (readonly number[])[]>> = {
  deutan: [
    [0.367, 0.861, -0.228],
    [0.28, 0.673, 0.047],
    [-0.012, 0.043, 0.969],
  ],
  protan: [
    [0.152, 1.053, -0.205],
    [0.115, 0.786, 0.099],
    [-0.004, -0.048, 1.052],
  ],
  tritan: [
    [1.256, -0.077, -0.179],
    [-0.078, 0.931, 0.148],
    [0.005, 0.691, 0.304],
  ],
};

/** Hoe deze kleur er ongeveer uitziet voor iemand met deze vorm van kleurenblindheid. */
export function simuleer(kleur: string, soort: Kleurenblindheid): string {
  const { r, g, b } = parseColor(kleur);
  const bron = [lineair(r), lineair(g), lineair(b)];
  const rijen = MATRIX[soort];

  const uit = rijen.map((rij) => (rij[0] ?? 0) * (bron[0] ?? 0) + (rij[1] ?? 0) * (bron[1] ?? 0) + (rij[2] ?? 0) * (bron[2] ?? 0));

  return `#${uit.map(naarSrgb).join('')}`;
}

/**
 * De kleinste afstand tussen twee kleuren uit deze verzameling, gemeten bij
 * gewoon kleurenzicht én bij alle drie de vormen van kleurenblindheid.
 *
 * Dit is het getal waar besluit A55 op rust: zakt het onder de drempel, dan is
 * er een paar dat niemand meer uit elkaar houdt.
 */
/**
 * De kleinste afstand binnen één lijst, zonder de simulatie erbij.
 *
 * ⚠️ Apart, en niet omdat het mooier leest: met de dubbele lus ín
 *    `kleinsteAfstand()` staat er vier niveaus diep een `if`, en dat is precies
 *    wat `max-depth` sinds QS8-190 tegenhoudt. De reden achter die regel geldt
 *    hier ook — twee geneste lussen mét een vroege uitgang zijn niet in één
 *    oogopslag te lezen.
 */
function kleinstePaar(gezien: readonly (string | undefined)[]): number {
  let kleinste = Number.POSITIVE_INFINITY;

  for (let i = 0; i < gezien.length; i += 1) {
    for (let j = i + 1; j < gezien.length; j += 1) {
      const a = gezien[i];
      const b = gezien[j];
      if (a !== undefined && b !== undefined) kleinste = Math.min(kleinste, kleurafstand(a, b));
    }
  }

  return kleinste;
}

export function kleinsteAfstand(kleuren: readonly string[]): number {
  let kleinste = Number.POSITIVE_INFINITY;

  for (const zicht of [null, ...KLEURENBLINDHEID]) {
    const gezien = kleuren.map((k) => (zicht === null ? k : simuleer(k, zicht)));
    kleinste = Math.min(kleinste, kleinstePaar(gezien));
  }

  return kleinste;
}

/**
 * De drempel waaronder twee categoriekleuren niet meer uit elkaar te houden zijn.
 *
 * ⚠️ **Tien, en dat getal komt uit de meting en niet uit een norm.** De vier
 *    afgewezen kandidaten van A55 zaten op 3.9, 5.7, 10.9 en 12.5 — maar die
 *    laatste twee vielen om bij gewóón kleurenzicht, waar het oog gevoeliger is
 *    dan bij een simulatie. De drie die het haalden komen in het donkere thema
 *    niet onder de 10.1 en in het lichte niet onder de 12.6.
 *
 *    Tien ligt dus net onder de slechtste van de drie die we houden en ruim
 *    boven de twee die op kleurenblindheid afvielen. Wie een vierde kleur wil,
 *    krijgt hier een rode test en niet een discussie.
 */
export const MIN_AFSTAND = 10;
