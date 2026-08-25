import { t, type Sleutel } from '../i18n';

/**
 * De weektip — besluit A48, variant 3 (QS8-110).
 *
 * ⚠️ **Waarom er iets moet staan tussen week één en week zes.** Vandaag krijg je
 *    een weekpas na je eerste voltooide week en daarna één per zes. Daartussen
 *    vijf keer niets — en dat zijn precies de weken waarin iemand afhaakt. Het
 *    spelregels-document beloofde "cadeaus" in het meervoud; de app deed er één.
 *
 * ⚠️ **Een vaste set en geen AI-call, en dat is de gefaseerde helft van het
 *    besluit.** Een tip per gebruiker per week is bij 100k gebruikers 100k calls
 *    per week (onwrikbare regel 6). De Doelcoach-tip per mijlpaal (variant 2)
 *    komt hierbovenop zodra er mijlpalen zijn; deze set blijft dan de terugval
 *    voor wie er nog geen heeft — elke nieuwe gebruiker in zijn eerste week.
 *
 * ⚠️ **Geen wijze quote van een dood iemand.** Dat was het oorspronkelijke idee
 *    en het is bewust afgevallen: willekeurige wijsheid wordt binnen drie weken
 *    herkend als opvulling, en de kans dat een stoïcijnse spreuk past bij "ik heb
 *    mijn offerte de deur uit gekregen" is klein. Slecht getimede wijsheid voelt
 *    als een preek. Deze regels gaan over de wéék die je net gehaald hebt.
 *
 * ⚠️ **Nooit een tegenvaller noemen.** Geen "je bent achter op schema", geen
 *    "volgende keer beter". Domeinregel 7 geldt ook voor tekst die alleen jij
 *    ziet — daar niet als lek, wel als toon. Er staat een test op.
 *
 * Puur, zonder renderer — zelfde reden als `vieringen.ts` en `metrics.ts`: wát er
 * gezegd wordt is een productbeslissing, en die hoort testbaar te zijn zonder een
 * scherm te bouwen.
 */

/**
 * De categorieën waar een eigen set voor bestaat.
 *
 * ⚠️ **Een kopie van `CATEGORIEEN` uit `modules/goals`, en met opzet geen import.**
 *    `shared` mag niet van een module afhangen; dat is de richting waarin de
 *    architectuur juist niet leunt. De prijs is een naad, en die staat onder
 *    test: `tips.test.ts` legt beide lijsten naast elkaar en wordt rood zodra er
 *    een categorie bijkomt waar geen regels voor zijn.
 */
export const TIP_CATEGORIEEN = ['business', 'study', 'other'] as const;
export type TipCategorie = (typeof TIP_CATEGORIEEN)[number];

/**
 * Hoort deze categorie bij een set regels?
 *
 * ⚠️ Bestaat omdat `Doel.category` een `string` is en niet een `Categorie`: de
 *    database kan er iets in hebben staan wat deze build niet kent. Zonder deze
 *    zeef zou `weektip()` dan `t('weektip.onbekend.3')` aanroepen, en `t()` geeft
 *    bij een ontbrekende sleutel de sleutel zelf terug — dan staat er letterlijk
 *    "weektip.onbekend.3" op het dashboard. Diezelfde terugval heeft dit project
 *    deze maand al twee keer een zichtbare bug gekost.
 */
export function isTipCategorie(waarde: string): waarde is TipCategorie {
  return (TIP_CATEGORIEEN as readonly string[]).includes(waarde);
}

/**
 * Hoeveel regels er per categorie zijn.
 *
 * ⚠️ Vijf, en dat is een ondergrens en geen bovengrens. Bij minder dan vier
 *    herkent iemand de herhaling binnen een maand — precies het bezwaar dat
 *    tegen de quotes gold. Komen er regels bij, hoog dit getal dan mee op: er
 *    staat een test op die eist dat elke sleutel bestaat in beide talen.
 */
export const TIPS_PER_CATEGORIE = 5;

/**
 * Een korte regel bij een gehaalde week.
 *
 * ⚠️ **Deterministisch op de cyclus, niet willekeurig.** `Math.random()` zou bij
 *    elke render een andere regel geven — dan flikkert de tekst tijdens een
 *    animatie, en twee schermen die hetzelfde moment tonen spreken elkaar tegen.
 *    De cyclusdatum is de sleutel: dezelfde week geeft altijd dezelfde regel, en
 *    de week erna een andere.
 *
 * ⚠️ **De datum wordt hier niet uitgerekend, alleen gelezen.** Correctheidsregel
 *    7: `cycleStart` komt uit `shared/time` via de aanroeper. Deze functie telt
 *    tekens en doet verder niets met tijd.
 *
 * @param categorie de categorie van het doel; onbekende waarden vallen terug op
 *   `other` — die set is met opzet de algemene en past overal
 * @param cycleStart de startdatum van de cyclus, als `YYYY-MM-DD`
 */
export function weektip(categorie: string, cycleStart: string): string {
  const set: TipCategorie = isTipCategorie(categorie) ? categorie : 'other';

  // Een stabiele som over de datum. Geen hash-bibliotheek: het hoeft niet
  // onvoorspelbaar te zijn, alleen gelijkmatig en herhaalbaar.
  let som = 0;
  for (const teken of cycleStart) som += teken.codePointAt(0) ?? 0;

  const nummer = (som % TIPS_PER_CATEGORIE) + 1;
  return t(`weektip.${set}.${nummer}` as Sleutel);
}
