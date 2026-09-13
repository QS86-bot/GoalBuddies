/**
 * Tekst tellen en afkappen zonder er tekens door te snijden — QS8-118.
 *
 * ⚠️ **Waarom dit bestaat.** JavaScript telt en snijdt in UTF-16-eenheden.
 *    Alles buiten het basisbereik kost er twee — elke pictografische emoji, maar
 *    ook veel schriften — en 👨‍👩‍👧‍👦 kost er elf. Snijd je op zo'n grens, dan
 *    hou je een halve codepoint over en de renderer maakt er `�` van. Dat is
 *    twee keer eerder gebeurd in deze codebase (`charAt(0)` in `MemberRow`, en
 *    `slice()` in de weekafsluiting), en QS8-111 legt vast dat de gebruiker
 *    overal emoji mág typen. Gebruik deze helpers, nooit de kale
 *    string-methodes.
 *
 * ⚠️ **Er zijn drie tellingen en ze zijn niet uitwisselbaar:**
 *
 *    | teken          | `.length` | codepunten | grafemen |
 *    |----------------|-----------|------------|----------|
 *    | `😀`           | 2         | 1          | 1        |
 *    | `👨‍👩‍👧‍👦` | 11        | 7          | 1        |
 *
 *    **De database telt codepunten** — elke lengte-CHECK gebruikt `char_length`.
 *    Daarom telt `telTekens()` codepunten en niet grafemen: een teller die iets
 *    anders telt dan de grens die hem afdwingt, is een nieuwe fout en geen
 *    reparatie. Bij een ondergrens gaat dat de gevaarlijke kant op — `.length`
 *    is altijd ≥ `char_length`, dus een client die in UTF-16 telt zegt "lang
 *    genoeg" terwijl Postgres het verzoek weigert.
 *
 *    `telGrafemen()` bestaat voor het geval waarin je echt zichtbare tekens
 *    bedoelt, zoals een cursor of een tekstpreview.
 */

/**
 * `Intl.Segmenter` als de omgeving hem heeft.
 *
 * ⚠️ Node en elke moderne browser hebben hem; Hermes op React Native niet
 *    gegarandeerd. De terugval telt codepunten, en die lost het geval op dat
 *    hier de schade doet — een surrogaatpaar dat doormidden gaat. Wat je zonder
 *    Segmenter verliest is dat 👨‍👩‍👧‍👦 als vier tekens wordt geteld in plaats
 *    van één. Dat is een nette degradatie: nog steeds nooit een `�`.
 */
function segmenter(): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  return new Intl.Segmenter('nl', { granularity: 'grapheme' });
}

/** De zichtbare tekens, in volgorde. */
export function grafemen(tekst: string): string[] {
  const seg = segmenter();
  if (seg === null) return Array.from(tekst);
  return Array.from(seg.segment(tekst), (deel) => deel.segment);
}

/**
 * Het eerste zichtbare teken, of een lege string.
 *
 * ⚠️ Vervangt `tekst.charAt(0)` en `tekst[0]`. Die geven bij een naam die met
 *    een emoji begint de helft van een surrogaatpaar terug, en dat rendert als
 *    `�` naast de naam van een groepsgenoot.
 */
export function eersteTeken(tekst: string): string {
  return grafemen(tekst)[0] ?? '';
}

/**
 * Het aantal tekens zoals de **database** ze telt: codepunten, gelijk aan
 * `char_length` in Postgres.
 *
 * Gebruik dit overal waar je tegen een lengtegrens uit een CHECK aan toetst.
 */
export function telTekens(tekst: string): number {
  return Array.from(tekst).length;
}

/** Het aantal zichtbare tekens. Voor weergave, niet voor een grens. */
export function telGrafemen(tekst: string): number {
  return grafemen(tekst).length;
}

/**
 * Kapt af op ten hoogste `maxTekens` codepunten, en altijd op een zichtbare
 * tekengrens.
 *
 * ⚠️ Vervangt `tekst.slice(0, n)`. Twee dingen tegelijk: de uitkomst past
 *    gegarandeerd binnen de CHECK van de database (codepunten), en er wordt
 *    nooit door een teken heen gesneden (grafeemgrens). Bij een teken dat langer
 *    is dan de resterende ruimte gaat het teken er in zijn geheel af — korter
 *    afkappen is altijd veilig, een half teken nooit.
 */
export function kapAf(tekst: string, maxTekens: number): string {
  if (maxTekens <= 0) return '';
  if (telTekens(tekst) <= maxTekens) return tekst;

  let uit = '';
  let geteld = 0;

  for (const teken of grafemen(tekst)) {
    const kosten = telTekens(teken);
    if (geteld + kosten > maxTekens) break;
    uit += teken;
    geteld += kosten;
  }

  return uit;
}

/**
 * De codepuntbereiken die aan de rand van een naam niets zichtbaars opleveren —
 * QS8-448.
 *
 * ⚠️⚠️ **Alleen aan de rand, en nooit in het midden.** 📏 `👨‍👩‍👧‍👦` is
 *    `U+1F468 U+200D U+1F469 U+200D U+1F467 U+200D U+1F466` — de zero-width
 *    joiner ís de lijm. Wie U+200D overal wegknipt, houdt vier losse mensen
 *    over in plaats van één gezin. Aan de rand kan dat niet: elke
 *    emoji-sequentie eindigt op een basisemoji of op U+FE0F, en U+FE00–U+FE0F
 *    staat met opzet **niet** in deze lijst — een naam die op `❤️` eindigt zou
 *    anders als tekstletter gaan renderen.
 *
 * ⚠️ **Bereiken en geen losse tekens, en dat is een correctie.** 📏 De eerste
 *    versie somde 29 codepunten op en dekte daarmee de JS-WhiteSpace-klasse plus
 *    de zero-width-familie. Gemeten in dezelfde ronde: **twaalf** andere tekens
 *    die óók als niets renderen kwamen er langs beide poorten door — hangul
 *    filler (U+3164), braille blank (U+2800), soft hyphen (U+00AD), de C0- en
 *    C1-stuurtekens, de tags (U+E0000–U+E007F) en meer. Een opsomming dekt de
 *    gevallen die je bedacht hebt; een bereik dekt de klasse.
 *
 * ⚠️ U+0000 ontbreekt met reden: Postgres' `text` kan geen NUL bevatten, dus
 *    daar bestaat het geval niet en een bereik dat bij 0 begint zou de naadtest
 *    op een onmogelijke invoer laten vallen.
 *
 * ⚠️ **Dezelfde bereiken staan in SQL, en dat is een naad.** `schone_naam()` in
 *    migratie 0256 doet hetzelfde met een `regexp_replace` over dezelfde
 *    bereiken. `tests/rls/naamnormalisatie.test.ts` **loopt het hele
 *    codepuntbereik af** en legt beide oordelen naast elkaar — niet een
 *    steekproef van invoeren. Haal je hier één teken weg, dan wordt die toets
 *    rood; dat is met de hand nagemeten, per richting.
 */
export const ONZICHTBARE_BEREIKEN: readonly (readonly [number, number])[] = [
  [0x0001, 0x0020], // C0-stuurtekens, tab, LF, CR en de spatie
  [0x007f, 0x00a0], // DEL, de C1-stuurtekens (incl. U+0085 NEL) en no-break space
  [0x00ad, 0x00ad], // soft hyphen
  [0x034f, 0x034f], // combining grapheme joiner
  [0x061c, 0x061c], // arabic letter mark
  [0x115f, 0x1160], // hangul choseong/jungseong filler
  [0x1680, 0x1680], // ogham space mark
  [0x17b4, 0x17b5], // khmer inherent vowels
  [0x180b, 0x180e], // mongolian variation selectors en vowel separator
  [0x2000, 0x200f], // en/em-spaties, zero-width familie, LRM/RLM
  [0x2028, 0x202f], // line/paragraph separator, bidi-sturing, narrow no-break space
  [0x205f, 0x2064], // medium mathematical space, word joiner, invisible operators
  [0x2066, 0x206f], // bidi-isolatie en de afgeschafte opmaaktekens
  [0x2800, 0x2800], // braille pattern blank
  [0x3000, 0x3000], // ideographic space
  [0x3164, 0x3164], // hangul filler
  [0xfeff, 0xfeff], // byte order mark / zero-width no-break space
  [0xffa0, 0xffa0], // halfwidth hangul filler
  [0xfff9, 0xfffb], // interlinear annotation
  [0xe0000, 0xe007f], // tags, inclusief de language tag
];

/** Of dit codepunt aan de rand van een naam niets zichtbaars oplevert. */
export function isOnzichtbaar(codepunt: number): boolean {
  return ONZICHTBARE_BEREIKEN.some(([van, tot]) => codepunt >= van && codepunt <= tot);
}

/**
 * Een naam zonder onzichtbare randen.
 *
 * ⚠️ **Randen knippen en niet alles**, zie `ONZICHTBARE_BEREIKEN`. Wat er tussen
 *    de zichtbare tekens staat, blijft staan — een gebruiker mag een spatie in
 *    zijn naam hebben, en een emoji mag zijn lijm houden.
 *
 * ⚠️ Geeft een lege string terug als er niets zichtbaars overblijft. Dát is het
 *    signaal waar de trigger, de CHECK op `profiles` en `profielSchema` alle
 *    drie op besluiten; ze mogen het niet elk apart uitrekenen.
 */
export function schoneNaam(ruw: string): string {
  const tekens = Array.from(ruw);

  let begin = 0;
  let eind = tekens.length;

  const onzichtbaar = (index: number): boolean =>
    isOnzichtbaar((tekens[index] as string).codePointAt(0) ?? 0);

  while (begin < eind && onzichtbaar(begin)) begin += 1;
  while (eind > begin && onzichtbaar(eind - 1)) eind -= 1;

  return tekens.slice(begin, eind).join('');
}

/**
 * De letter in een avatar, uit een weergavenaam.
 *
 * ⚠️ Stond eerst als `initiaal()` in `MemberRow.tsx` met `charAt(0)` erin, en
 *    dat gaf bij een naam die met een emoji begint een halve codepoint — een `�`
 *    naast de naam van een groepsgenoot. Hij staat hier omdat het een
 *    tekstbewerking is en niet een presentatiedetail: daar is hij te testen
 *    zonder React Native mee te trekken in een test die in Node draait.
 *
 * Geeft `?` als er niets bruikbaars staat, want een leeg vak leest als een fout.
 *
 * ⚠️ **`schoneNaam()` en niet `.trim()`** — QS8-448. Met `.trim()` stond hier een
 *    derde opvatting van witruimte, tien regels onder de functie die er juist
 *    één van moest maken: een naam met een onzichtbare voorrand gaf dat
 *    onzichtbare teken als avatarletter, dus een leeg vak naast de naam van een
 *    groepsgenoot. De database weigert zo'n naam nu, maar `initiaalVan()` krijgt
 *    ook namen van vóór die CHECK te zien.
 */
export function initiaalVan(naam: string): string {
  const eerste = eersteTeken(schoneNaam(naam));
  return eerste === '' ? '?' : eerste.toUpperCase();
}
