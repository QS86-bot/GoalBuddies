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
 * De letter in een avatar, uit een weergavenaam.
 *
 * ⚠️ Stond eerst als `initiaal()` in `MemberRow.tsx` met `charAt(0)` erin, en
 *    dat gaf bij een naam die met een emoji begint een halve codepoint — een `�`
 *    naast de naam van een groepsgenoot. Hij staat hier omdat het een
 *    tekstbewerking is en niet een presentatiedetail: daar is hij te testen
 *    zonder React Native mee te trekken in een test die in Node draait.
 *
 * Geeft `?` als er niets bruikbaars staat, want een leeg vak leest als een fout.
 */
export function initiaalVan(naam: string): string {
  const eerste = eersteTeken(naam.trim());
  return eerste === '' ? '?' : eerste.toUpperCase();
}
