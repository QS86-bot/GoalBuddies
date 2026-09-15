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
 * De bidi-stuurtekens die de **volgorde** van de tekens eromheen omkeren.
 *
 * ⚠️⚠️ **Dit is een tweede lijst en niet een uitbreiding van de eerste, en dat
 *    verschil is de hele reden dat QS8-450 een eigen issue was.**
 *    `ONZICHTBARE_BEREIKEN` beantwoordt *"rendert dit als niets aan de rand"* en
 *    wordt daarom alleen aan de randen toegepast. Deze lijst beantwoordt
 *    *"rendert dit de rest van de naam anders"*, en dat antwoord moet **overal
 *    in de string** gelden.
 *
 *    De twee mogen nooit één lijst worden: `ONZICHTBARE_BEREIKEN` bevat
 *    `U+200D`, en die ís de lijm in `👨‍👩‍👧‍👦`. Overal weghalen houdt vier
 *    losse mensen over in plaats van één gezin.
 *
 * 📏 Het gemeten geval (13-09-2026, security-review op QS8-448): `display_name`
 *    = `gxp‮eterces` rendert als `secrete.pxg`, en `display_name` is
 *    groepszichtbaar.
 *
 * ⚠️ **`U+200E` (LRM), `U+200F` (RLM) en `U+061C` (ALM) staan er met opzet niet
 *    in.** Dat zijn *markeringen*, geen overrides: ze zetten de richting van de
 *    **neutrale** tekens ernaast en kunnen een run met sterke tekens niet
 *    omkeren, en ze hebben legitiem gebruik in een naam die schriften mengt. Aan
 *    de rand worden ze al gestreken. De voorwaarde waaronder dat besluit
 *    vervalt, staat in `docs/ENGINEER-REVIEW.md`.
 *
 * ⚠️ **Dezelfde lijst staat in SQL als `zonder_bidi()` (migratie 0269), en dat
 *    is een naad.** `tests/rls/naamnormalisatie.test.ts` loopt het hele
 *    codepuntbereik af mét een teken in het **midden** en legt beide oordelen
 *    naast elkaar. Haal je hier één teken weg, dan wordt die toets rood; dat is
 *    met de hand nagemeten, per richting.
 */
export const BIDI_BEREIKEN: readonly (readonly [number, number])[] = [
  [0x202a, 0x202e], // LRE, RLE, PDF, LRO, RLO
  [0x2066, 0x2069], // LRI, RLI, FSI, PDI
];

/** Of dit codepunt de volgorde van de tekens eromheen kan omkeren. */
export function isBidiStuurteken(codepunt: number): boolean {
  return BIDI_BEREIKEN.some(([van, tot]) => codepunt >= van && codepunt <= tot);
}

/**
 * Dezelfde tekst zonder bidi-overrides en -isolaten, overal.
 *
 * ⚠️ **Overal en niet alleen aan de rand** — dat is het verschil met
 *    `schoneNaam()`, en de reden staat bij `BIDI_BEREIKEN`.
 */
export function zonderBidi(ruw: string): string {
  return Array.from(ruw)
    .filter((teken) => !isBidiStuurteken((teken.codePointAt(0) ?? 0)))
    .join('');
}

/**
 * De onzichtbare tekens die óók **midden in** een naam niets mogen zijn.
 *
 * ⚠️⚠️ **Deze lijst is afgeleid en niet bedacht, en dat is de reparatie van een
 *    eerdere versie die dat wél was.** 📏 Gemeten in de security-review op
 *    QS8-495: een handgeschreven opsomming dekte **146** van de **4174**
 *    codepunten die Unicode zelf `Default_Ignorable_Code_Point` noemt. De
 *    overige **4028** overleefden midden in een naam, en negen van de tien
 *    geteste gevallen landden als een naam die als `Jan` rendert — `U+034F`,
 *    `U+FE00`, `U+2065`, `U+FFF0`, `U+1D173`, `U+180E`, `U+E0100` en `U+200E`.
 *
 *    De regel is nu: **`Default_Ignorable_Code_Point`, plus de C0/C1-stuurtekens
 *    en de interlinear annotation, min acht benoemde uitzonderingen.**
 *    `tests/shared/…` — zie `src/shared/tekst/index.test.ts` — rekent dat elke
 *    run opnieuw uit en legt het naast deze lijst.
 *
 * ⚠️ **En hij faalt de goede kant op.** Een nieuwe Unicode-versie voegt
 *    codepunten aan de property toe; die vallen dan **dicht** en de toets wordt
 *    rood zodat iemand ernaar kijkt. Een eigen opsomming laat ze stil open.
 *
 * ⚠️⚠️ **Dit is een derde lijst, en dat is dezelfde reden als waarom
 *    `BIDI_BEREIKEN` een tweede is.** Elke lijst beantwoordt één vraag:
 *
 *    | lijst | vraag | waar toegepast |
 *    |---|---|---|
 *    | `ONZICHTBARE_BEREIKEN` | rendert dit als niets **aan de rand**? | alleen de randen |
 *    | `BIDI_BEREIKEN` | keert dit de tekens eromheen óm? | overal |
 *    | `MIDDENIN_BEREIKEN` | rendert dit als **nul pixels**? | overal |
 *
 *    Ze mogen nooit één lijst worden. `ONZICHTBARE_BEREIKEN` bevat de spatie,
 *    en die overal weghalen maakt van `Jan de Vries` `JandeVries`.
 *
 *    ⚠️ **Deze lijst en `BIDI_BEREIKEN` overlappen wél**, en dat is hier geen
 *       bezwaar: een bidi-override rendert óók als nul pixels, dus hij hoort in
 *       allebei de antwoorden thuis. Twee keer strippen is hetzelfde als één
 *       keer. Wat de doctrine verbiedt is een handgeschreven duplicaat dat uit
 *       de pas kan lopen — deze is afgeleid en kan dat niet.
 *
 * ⚠️⚠️ **De scheidslijn is "nul pixels" tegenover "witruimte".** Een spatie is
 *    onzichtbaar en tóch betekenisvol: hij scheidt. 📏 En dat is precies waarom
 *    de property de goede bron is: `U+0020`, `U+00A0` en `U+2800` (de lege
 *    braillecel, die breedte heeft) zijn géén `Default_Ignorable`, dus ze vallen
 *    er vanzelf buiten in plaats van dat iemand eraan moet denken.
 *
 * ⚠️ **De acht uitzonderingen staan in `index.test.ts` en dragen daar elk hun
 *    reden.** Kort: de emoji-lijm `U+200D`, de orthografisch verplichte
 *    `U+200C`, de combining grapheme joiner, de richtingsmarkeringen
 *    `U+061C`/`U+200E`/`U+200F`, de Mongoolse variatieselectors, de
 *    variatieselectors `U+FE00`–`U+FE0F` (waaronder VS16), de tags
 *    `U+E0020`–`U+E007F` — die de subdivisievlaggen 🏴 dragen — en de
 *    ideographic variation selectors voor Japanse namen.
 *
 *    ⚠️⚠️ **Die tags stonden in de eerste versie wél in de lijst, en dat brak
 *       de Schotse, Welshe en Engelse vlag.** 📏 Gemeten: 🏴 van zeven
 *       codepunten werd er één. Dat is woordelijk dezelfde schade als het
 *       uiteenvallen van `👨‍👩‍👧‍👦`, aan een emoji die in de eerste
 *       redenering niet voorkwam.
 *
 * ⚠️ **Wat hiermee níet gesloten is:** `U+200C`, `U+200D` en `U+034F` renderen
 *    ook als nul pixels, dus `Ja<ZWNJ>n` blijft als `Jan` renderen. Dat vraagt
 *    een **contextregel** in plaats van een lijst — QS8-499. En een tag áán de
 *    rand van een naam wordt nog steeds door `ONZICHTBARE_BEREIKEN` weggestreken;
 *    dat is ouder dan QS8-495 en hoort bij hetzelfde vervolg.
 *
 * ⚠️ **Dezelfde bereiken staan in SQL als `zonder_onzichtbaar_middenin()`
 *    (migratie 0271), en dat is een naad.** `tests/rls/naamnormalisatie.test.ts`
 *    loopt het hele codepuntbereik af mét een teken in het midden en legt beide
 *    oordelen naast elkaar. Haal je hier één teken weg, dan wordt die toets
 *    rood; dat is met de hand nagemeten, per richting.
 */
export const MIDDENIN_BEREIKEN: readonly (readonly [number, number])[] = [
  [0x0001, 0x001f], // C0-stuurtekens, zonder de spatie op U+0020
  [0x007f, 0x009f], // DEL en de C1-stuurtekens, zonder de no-break space op U+00A0
  [0x00ad, 0x00ad], // soft hyphen
  [0x115f, 0x1160], // hangul choseong/jungseong filler
  [0x17b4, 0x17b5], // khmer inherent vowels (afgeschaft, en `Default_Ignorable`)
  [0x200b, 0x200b], // zero-width space
  [0x202a, 0x202e], // de bidi-overrides — zie de noot hieronder over de overlap
  [0x2060, 0x206f], // word joiner, de onzichtbare operatoren, de isolaten en de afgeschafte opmaaktekens
  [0x3164, 0x3164], // hangul filler
  [0xfeff, 0xfeff], // byte order mark / zero-width no-break space
  [0xffa0, 0xffa0], // halfwidth hangul filler
  [0xfff0, 0xfffb], // niet-toegewezen `Default_Ignorable` en de interlinear annotation
  [0x1bca0, 0x1bca3], // shorthand format controls
  [0x1d173, 0x1d17a], // muzieknotatie-opmaak
  [0xe0000, 0xe001f], // tags vóór het bruikbare bereik
  [0xe0080, 0xe00ff], // niet-toegewezen tags
  [0xe01f0, 0xe0fff], // niet-toegewezen variatieselectors
];
/** Of dit codepunt óók midden in een naam als niets rendert. */
export function isOnzichtbaarMiddenin(codepunt: number): boolean {
  return MIDDENIN_BEREIKEN.some(([van, tot]) => codepunt >= van && codepunt <= tot);
}

/**
 * Dezelfde tekst zonder de tekens die overal als niets renderen.
 *
 * ⚠️ **Overal en niet alleen aan de rand** — net als `zonderBidi()`, en om een
 *    verwante maar eigen reden: die lijst gaat over volgorde, deze over nul
 *    pixels.
 */
export function zonderOnzichtbaarMiddenin(ruw: string): string {
  return Array.from(ruw)
    .filter((teken) => !isOnzichtbaarMiddenin(teken.codePointAt(0) ?? 0))
    .join('');
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
 *
 * ⚠️ **Strijkt sinds QS8-450 óók de bidi-stuurtekens, en die overal.** Zie
 *    `BIDI_BEREIKEN` voor waarom dat een tweede lijst is en niet een regel erbij
 *    in de eerste.
 */
export function schoneNaam(ruw: string): string {
  // ⚠️ Eerst de bidi-stuurtekens overal weg, dán de tekens die overal als niets
  //    renderen (QS8-495), dán de randen. Zo wordt ` \u202E Ja\u200Bn ` gewoon
  //    `Jan`. De volgorde geeft hetzelfde resultaat als je hem omdraait, maar
  //    zo leest hij als drie stappen met elk een eigen reden in plaats van als
  //    toeval.
  const tekens = Array.from(zonderOnzichtbaarMiddenin(zonderBidi(ruw)));

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
