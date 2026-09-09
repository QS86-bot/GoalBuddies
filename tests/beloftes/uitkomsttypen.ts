/**
 * De zeef achter `uitkomst-niet-weggooien.test.ts`, apart zodat hij te voeden is.
 *
 * ⚠️ **Waarom dit hier staat en niet in de test** — CLAUDE.md, regel 18: *"Een
 *    controle die je niet kunt voeden, kun je niet ijken."* De grendel hiernaast
 *    leest de échte bron; deze functies krijgen daarnaast in
 *    `uitkomsttypen.test.ts` elke vorm los aangeboden — de vormen die ze moeten
 *    vinden én de vormen die ze met rust moeten laten.
 *
 * ⚠️ **De lijst met uitkomsttypen wordt áfgeleid en niet opgeschreven** (QS8-340).
 *    De vorige versie zocht letterlijk naar `Promise<Uitkomst`, en toen de
 *    codebase op de gedeelde alias `Resultaat` overging, zag de grendel nog
 *    12 van de 74 functies — zonder ergens rood van te worden. Een tweede naam
 *    erbij schrijven verplaatst die vervaldatum alleen maar. Wat een uitkomsttype
 *    onderscheidt is zijn vórm: een unie met een `ok: true`- en een
 *    `ok: false`-tak. Die is uit de definitie te lezen, en dan volgt de grendel
 *    vanzelf mee met de volgende hernoeming.
 *
 * 📏 Gemeten op 08-09-2026: vijf types (`Aanzetresultaat`, `ProfielUitkomst`,
 *    `Resultaat`, `Uitkomst`, `Uitzetresultaat`), samen 78 van de 144
 *    geëxporteerde async-functies in `src/modules/`.
 */

/**
 * Commentaar eruit, regelnummers erin. Blokcommentaar wordt per regel geleegd
 * zodat de telling verderop nog naar de goede regel wijst.
 *
 * ⚠️ **Dit wegknippen is meteen misgegaan toen het er niet was.** De eerste
 *    versie las de kale bron en meldde prompt een treffer: het commentaar dat de
 *    oude bug cíteert. Een controle die zijn eigen uitleg als bevinding meldt,
 *    leer je uitzetten.
 */
export function zonderCommentaar(bron: string): string {
  const uit: string[] = [];
  let inBlok = false;

  for (const regel of bron.split('\n')) {
    let schoon = regel;
    if (inBlok) {
      const eind = schoon.indexOf('*/');
      if (eind === -1) {
        uit.push('');
        continue;
      }
      schoon = schoon.slice(eind + 2);
      inBlok = false;
    }
    schoon = schoon.replace(/\/\*.*?\*\//g, ' ');
    const start = schoon.indexOf('/*');
    if (start !== -1) {
      schoon = schoon.slice(0, start);
      inBlok = true;
    }
    uit.push(schoon.replace(/(^|[^:])\/\/.*$/, '$1'));
  }
  return uit.join('\n');
}

/**
 * Het lichaam van een type-alias: vanaf `vanaf` tot de `;` op diepte nul.
 *
 * ⚠️ **Een `[^;]*` volstaat hier niet, en dat is bij het bouwen meteen gebleken.**
 *    `{ ok: true; waarde: T } | { ok: false; melding: string }` draagt zijn eigen
 *    puntkomma's binnen de accolades, dus zo'n greep stopt na `ok: true` en ziet
 *    de `ok: false`-tak nooit. De meting wees toen drie types aan waar er vijf
 *    zijn — `Resultaat` viel er precies uit, het type dat dit issue veroorzaakte.
 */
export function lichaamVanaf(bron: string, vanaf: number): string {
  let diepte = 0;

  for (let i = vanaf; i < bron.length; i += 1) {
    const teken = bron[i];
    if (teken === '{' || teken === '(' || teken === '[') diepte += 1;
    else if (teken === '}' || teken === ')' || teken === ']') diepte -= 1;
    else if (teken === ';' && diepte === 0) return bron.slice(vanaf, i);
  }
  return bron.slice(vanaf);
}

/** Elk geëxporteerd type in `bron` dat een `ok: true`- én een `ok: false`-tak heeft. */
export function uitkomsttypenIn(bron: string): string[] {
  const namen = new Set<string>();

  for (const m of bron.matchAll(/export\s+type\s+(\w+)\s*(?:<[^>]*>)?\s*=/g)) {
    const lichaam = lichaamVanaf(bron, (m.index ?? 0) + m[0].length);
    if (/\bok\s*:\s*true\b/.test(lichaam) && /\bok\s*:\s*false\b/.test(lichaam)) {
      namen.add(m[1] as string);
    }
  }
  return [...namen].sort();
}

/**
 * De plek ná de parameterlijst die op `vanaf` opent — de bijpassende `)`.
 *
 * ⚠️ **Een `[^)]*` volstaat hier niet, en dat is bij de security-review op
 *    QS8-340 aangewezen.** Een parameter mag zelf haakjes dragen:
 *    `zetMeldingenUit(verwijderRij: () => Promise<void>): Promise<Uitzetresultaat>`
 *    stopt zo'n greep al bij de `()` van het pijltype, en dan staat er achter de
 *    "parameterlijst" geen `: Promise<` meer. 📏 Zes van de 150 geëxporteerde
 *    async-functies in `src/modules/` vielen er zo uit, waaronder die ene — die
 *    wél een uitkomsttype belooft. Dezelfde klasse als het issue zelf, één laag
 *    dieper: de zeef zag minder dan ze beloofde.
 */
export function parameterEinde(bron: string, vanaf: number): number {
  let diepte = 0;

  for (let i = vanaf; i < bron.length; i += 1) {
    if (bron[i] === '(') diepte += 1;
    else if (bron[i] === ')') {
      diepte -= 1;
      if (diepte === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Elke geëxporteerde async-functie in `bron`, met het type dat ze belooft.
 *
 * `soort` is `null` als de belofte geen benoemd type is — `Promise<{ ... }>`
 * bijvoorbeeld. Dat is een geldige uitkomst en geen leesfout.
 *
 * ⚠️ **`gelezen` is het verschil tussen die twee, en dat verschil is de grendel.**
 *    Raakt de lezer halverwege een handtekening de draad kwijt, dan valt de
 *    functie stil buiten élke controle hierboven — en zolang teller en noemer
 *    dezelfde lezer deelden, bewóóg de fractie daar niet van. Na de parameterlijst
 *    hoort een `:` (een returnannotatie) of een `{` (het lichaam) te staan; staat
 *    er iets anders, dan is de lezer de draad kwijt en niet de code raar.
 */
export function asyncBeloftesIn(
  bron: string,
): { naam: string; soort: string | null; gelezen: boolean }[] {
  const uit: { naam: string; soort: string | null; gelezen: boolean }[] = [];

  // De `<...>` is de typeparameterlijst van een generieke functie — zonder dit
  //    valt `metGetekendeAvatars<T, K extends keyof T>(...)` buiten de lezer.
  for (const m of bron.matchAll(/export\s+async\s+function\s+(\w+)\s*(?:<[^(]*>)?\s*(?=\()/g)) {
    const eind = parameterEinde(bron, (m.index ?? 0) + m[0].length);
    const staart = eind === -1 ? '' : bron.slice(eind, eind + 200);
    const belofte = /^\s*:\s*Promise<\s*(\w+)/.exec(staart);
    uit.push({
      naam: m[1] as string,
      soort: belofte === null ? null : (belofte[1] as string),
      gelezen: eind !== -1 && /^\s*[:{]/.test(staart),
    });
  }
  return uit;
}

/** Elke geëxporteerde async-functie in `bron` die een van `soorten` teruggeeft. */
export function beloftefunctiesIn(bron: string, soorten: ReadonlySet<string>): string[] {
  return asyncBeloftesIn(bron)
    .filter((f) => f.soort !== null && soorten.has(f.soort))
    .map((f) => f.naam);
}

/**
 * Elke `export async function` in `bron`, kaal geteld — de noemer van de fractie.
 *
 * ⚠️ **Met opzet een ándere greep dan `asyncBeloftesIn()`.** Deelden teller en
 *    noemer hun parser, dan zou een functie die de parser níét leest uit allebei
 *    wegvallen en bewoog de fractie niet — precies het gat dat de security-review
 *    op QS8-340 aanwees. Een grendel die zijn eigen blinde vlek meet, meet niets.
 */
export function alleAsyncExportsIn(bron: string): string[] {
  return [...bron.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1] as string);
}

/**
 * Elke regel in `bron` die een van `namen` rechtstreeks in een `void` gooit.
 *
 * ⚠️ **`void` op een lokale handler is juist góed en wordt met rust gelaten.**
 *    `onPress={() => void bewaar()}` waarbij `bewaar()` de uitkomst zelf
 *    afhandelt, is het patroon dat overal in dit project staat — een controle die
 *    dát meldt, leer je uitzetten. De grens loopt bij een dátalaagfunctie die
 *    rechtstreeks in een `void` belandt, en die grens is alleen te trekken zolang
 *    geen lokale functie een modulenaam hergebruikt. Vandaar `lokaleFunctiesIn()`.
 */
export function voidTreffersIn(bron: string, namen: readonly string[]): string[] {
  const uit: string[] = [];

  zonderCommentaar(bron)
    .split('\n')
    .forEach((regel, i) => {
      const geraakt = namen.filter((naam) => new RegExp(`void\\s+${naam}\\s*\\(`).test(regel));
      for (const naam of geraakt) uit.push(`${i + 1} — void ${naam}()`);
    });
  return uit;
}

/** Elke functie die `bron` zélf declareert — als naam, zonder de plek. */
export function lokaleFunctiesIn(bron: string): string[] {
  const schoon = zonderCommentaar(bron);
  const namen = new Set<string>();

  for (const m of schoon.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    namen.add(m[1] as string);
  }
  // ⚠️ **Drie rechterkanten en niet één** — aangewezen in de security-review op
  //    QS8-340. `const x = async () => {}` was gedekt, maar
  //    `const x = useCallback(async () => {})` en `const x = async function () {}`
  //    niet, en 📏 van de eerste vorm staan er negen in `app/`. Een schaduw in die
  //    vorm zou de zeef hiernaast een válse melding laten geven op de lokale
  //    aanroep, in plaats van een schaduwmelding op de declaratie.
  const rechts = /(?:^|\n)\s*(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|function\b|use[A-Z]\w*\s*\()/g;
  for (const m of schoon.matchAll(rechts)) {
    namen.add(m[1] as string);
  }
  return [...namen].sort();
}

/**
 * Elke regel in `bron` die een van `namen` als **los `await`-statement** aanroept.
 *
 * ⚠️ **`void` is niet de enige manier om een uitkomst weg te gooien** — QS8-350.
 *    `await zetArchief(...)` op een eigen regel gooit hem net zo hard weg als
 *    `void zetArchief(...)`, en de vorige versie van deze zeef kende alleen de
 *    tweede vorm. 📏 Op 08-09-2026 stonden er acht kale `await`-statements in
 *    `app/`, waarvan twee een uitkomst weggooiden die de gebruiker had moeten
 *    zien.
 *
 * ⚠️ **De grens loopt bij het téken vóór de `await`, en niet bij de regel.** Een
 *    `await` is alleen weggegooid als hij een statement begint, en dat is precies
 *    dan zo als het laatste teken ervoor `;`, `{` of `}` is (of er niets staat).
 *    `const x = await f()`, `return await f()`, `if (await f())` en een `await`
 *    die na een regeleinde achter een `=` staat, eindigen alle vier op een ánder
 *    teken en zijn geen weggooiers. Een controle die die meldt, leer je uitzetten
 *    — en dat is bij deze grendel de duurste faalvorm.
 */
export function awaitTreffersIn(bron: string, namen: readonly string[]): string[] {
  const schoon = zonderCommentaar(bron);
  const uit: string[] = [];

  for (const m of schoon.matchAll(/await\s+(\w+)\s*\(/g)) {
    const naam = m[1] as string;
    if (!namen.includes(naam)) continue;

    const voor = schoon.slice(0, m.index);
    const laatste = voor.trimEnd().at(-1) ?? '';
    if (laatste !== '' && laatste !== ';' && laatste !== '{' && laatste !== '}') continue;

    // ⚠️ Het regelnummer komt uit de **ongetrimde** prefix. `trimEnd()` haalt bij
    //    een ingesprongen regel ook het regeleinde ervóór weg, en dan wijst de
    //    melding een regel te hoog — precies de vorm die iemand naar het
    //    verkeerde stuk code stuurt.
    uit.push(`${voor.split('\n').length} — await ${naam}()`);
  }
  return uit;
}

/** Een functie die zijn uitkomst mag weggooien, met de reden die dat draagt. */
export interface OptioneleUitkomst {
  /** De naam van de functie eronder, of `''` als de markering er geen aanwijst. */
  readonly naam: string;
  /** Alles wat er in het documentatieblok achter de markering staat. */
  readonly reden: string;
}

/**
 * Elke functie in `bron` die met `@uitkomst-optioneel` van de grendel vrijgesteld is.
 *
 * ⚠️ **Waarom de vrijstelling op de declaratie staat en niet op de aanroep** —
 *    QS8-350. `werkJobAf()` mag zijn uitkomst verliezen omdat `kijk()` de stand
 *    uit de job zelf leest; dat is een eigenschap van de functie en niet van de
 *    vier plekken waar hij staat. Een uitzondering per aanroep zou vier keer
 *    dezelfde reden zijn, en de vijfde zou hem overschrijven zonder dat iemand
 *    het las.
 *
 * ⚠️ **Een markering zónder reden telt niet als reden.** Daarom komt de tekst
 *    achter de tag hier mee terug: de grendel hiernaast wijst een lege af. En de
 *    lijst zelf staat als literal in die test, zodat er geen vrijstelling bij
 *    kan komen zonder dat er een test rood wordt — dat is het verschil met een
 *    allowlist die stilletjes groeit.
 *
 * ⚠️ Leest met opzet de **rúwe** bron: de markering staat in commentaar, en dat
 *    is precies wat `zonderCommentaar()` weghaalt.
 */
export function optioneleUitkomstenIn(bron: string): OptioneleUitkomst[] {
  const TAG = '@uitkomst-optioneel';
  const uit: OptioneleUitkomst[] = [];

  for (const m of bron.matchAll(/@uitkomst-optioneel/g)) {
    const na = bron.slice((m.index ?? 0) + TAG.length);
    const eind = na.indexOf('*/');
    if (eind === -1) continue;

    const reden = na
      .slice(0, eind)
      .split('\n')
      .map((regel) => regel.replace(/^\s*\*?/, '').trim())
      .join(' ')
      .trim();

    const eronder = /^\s*export\s+async\s+function\s+(\w+)/.exec(na.slice(eind + 2));
    uit.push({ naam: eronder?.[1] ?? '', reden });
  }
  return uit;
}
