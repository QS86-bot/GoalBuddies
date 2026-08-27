import { t, type Sleutel } from '../i18n';
import { telTekens } from '../tekst';

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
/**
 * De woorden die een tip nooit mag bevatten.
 *
 * ⚠️ **Dit stond tot 27-08-2026 als losse reguliere expressie in `tips.test.ts`,
 *    en dat kon zolang de tips vast waren: een test kan vijftien bekende zinnen
 *    vooraf lezen.** Sinds QS8-137 genereert de Doelcoach een tip per mijlpaal,
 *    en die kan geen test vooraf lezen — dus moest de lijst een echte zeef
 *    worden, en wel in de dátabase, want de tip komt binnen via `service_role`
 *    vanuit een Edge Function en die omzeilt RLS volledig.
 *
 * ⚠️ **Deze lijst is dus een kopie van `tegenvaller_woorden()` (migratie 0101),
 *    en dat is precies de vorm waar 0032/0034 op stukliep.** Hij staat hier voor
 *    de vaste regels en dáár voor de gegenereerde; `tests/rls/mijlpaaltip.test.ts`
 *    legt de twee naast elkaar op **gelijkheid**. Twee insluitingen zijn geen
 *    gelijkheid — valkuil 11.
 *
 * ⚠️ Deelstrings en geen woordgrenzen, gelijk aan de SQL-kant. "achtergrond"
 *    valt daardoor ook af, en dat vals positief is hier goedkoop: een geweigerde
 *    tip valt terug op de vaste set, en dat is een volwaardig antwoord.
 */
export const TEGENVALLER_WOORDEN = [
  'achter',
  'gemist',
  'mislukt',
  'helaas',
  'jammer',
  'volgende keer beter',
  'niet gehaald',
  'behind',
  'missed',
  'failed',
  'unfortunately',
  'better luck',
] as const;

/**
 * Het ijkcorpus voor de zeef — één lijst, twee implementaties.
 *
 * ⚠️ **Beide helften staan erin, en dat is de helft die er meestal ontbreekt.**
 *    Een zeef die alles weigert is even stuk als een die niets weigert; de
 *    tweede groep hieronder bewaakt dat er nog tips dóórkomen. `tips.test.ts`
 *    voert hem door de TypeScript-kant, `tests/rls/mijlpaaltip.test.ts` door de
 *    SQL-kant, en beide moeten hetzelfde antwoord geven.
 *
 * ⚠️ Let op de laatste twee van de eerste groep: "achtergrond" en "achteraf"
 *    bevatten "achter" en worden dus geweigerd. Dat is een vals positief en het
 *    staat hier met opzet in — het is de prijs van deelstringvergelijking, en
 *    die is bewust gekozen boven woordgrenzen omdat `\m…\M` in Postgres en `\b`
 *    in JavaScript niet hetzelfde doen met niet-ASCII. Twee implementaties die
 *    aantoonbaar gelijk zijn, is hier meer waard dan twee die net iets slimmer
 *    zijn. Een geweigerde tip valt terug op de vaste set, en dat is een
 *    volwaardig antwoord.
 */
export const ZEEF_IJKING = {
  weigeren: [
    'Je bent wat achter op schema, maar dat haal je in.',
    'Je hebt vorige week gemist, dus deze telt dubbel.',
    'De vorige poging is mislukt, probeer het nu anders.',
    'Helaas is er weinig tijd over voor deze mijlpaal.',
    'Jammer van de verloren week; pak het nu groter aan.',
    'Volgende keer beter, dan lukt het wel.',
    'Je hebt de vloer niet gehaald deze keer.',
    'You are behind on this milestone.',
    'You missed a week, so start small.',
    'The last attempt failed; try a smaller step.',
    'Unfortunately there is little time left.',
    'Better luck with the next one.',
    'Werk aan de achtergrond van dit hoofdstuk.',
    'Achteraf bekeken was dit de juiste volgorde.',
  ],
  doorlaten: [
    'Begin met het stuk dat het meeste uitzoekwerk vraagt; de rest volgt sneller.',
    'Zet de bronnen eerst op een rij, dan schrijf je het hoofdstuk in één keer.',
    'Bel de leverancier die het langst nodig heeft om terug te komen.',
    'Split this into the part you can test and the part you have to research.',
    'Start with the interview questions; the write-up goes faster after that.',
    'Op dit punt in het traject is een kort overzicht meer waard dan een lange lijst.',
  ],
} as const;

/** Noemt deze tekst een tegenvaller? Zelfde semantiek als `tip_noemt_tegenvaller()` in SQL. */
export function noemtTegenvaller(tekst: string): boolean {
  const klein = tekst.toLowerCase();
  return TEGENVALLER_WOORDEN.some((woord) => klein.includes(woord));
}

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

/**
 * Welke tip er onder een gehaalde week komt te staan — QS8-137, besluit A48.
 *
 * ⚠️ **Dit is de enige plek waar de terugval woont, en dat is met opzet.** Vier
 *    routes leiden naar de vaste set en het scherm hoort ze geen van alle te
 *    kennen: geen mijlpaal, nog geen gegenereerde tip, een mislukte generatie,
 *    of een tip in een taal die de gebruiker niet meer gebruikt. Zou de kaart
 *    dat zelf uitzoeken, dan is de terugval vier `if`-takken op een scherm in
 *    plaats van één regel met een test eronder.
 *
 * ⚠️ **De zeef staat hier nóg een keer, terwijl de database hem al afdwingt.**
 *    Dat is geen wantrouwen maar een tijdsgat: een CHECK hervalideert bestaande
 *    rijen niet. Scherpt iemand `tegenvaller_woorden()` ooit aan, dan blijft een
 *    tip staan die onder de oude regel legaal was en onder de nieuwe niet. Deze
 *    tak vangt precies dat geval — en de prijs is een naad, die onder test staat
 *    (`tests/beloftes/mijlpaaltip.test.ts` voert één corpus door béide zeven).
 *
 * ⚠️ **Lengte in codepunten en niet in UTF-16-eenheden.** De CHECK in de database
 *    telt `char_length`, en dat zijn codepunten. `telTekens()` telt hetzelfde;
 *    `.length` zou hier de ruimere zijn en dus een tip doorlaten die de database
 *    geweigerd zou hebben. Zie QS8-118.
 */
export function tipVoorWeek(invoer: {
  readonly gegenereerd: { readonly body: string; readonly locale: string } | null;
  readonly taal: string;
  readonly categorie: string;
  readonly cycleStart: string;
}): string {
  const vast = weektip(invoer.categorie, invoer.cycleStart);
  const tip = invoer.gegenereerd;

  if (tip === null) return vast;
  if (tip.locale !== invoer.taal) return vast;

  const schoon = tip.body.trim();
  if (telTekens(schoon) < 10 || telTekens(schoon) > 300) return vast;
  if (noemtTegenvaller(schoon)) return vast;

  return schoon;
}
