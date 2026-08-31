/**
 * De uitvoer van de Doelcoach lezen — QS8-38.
 *
 * ⚠️ Dit bestand importeert bewust niets uit `jobs.ts`. Zou het dat wel doen,
 *    dan trekt elke test die deze regels controleert de Supabase-client en
 *    AsyncStorage mee, en daarmee React Native in een test die in Node draait.
 *    Zelfde reden als `weekly-schemas.ts`, `mijlpaal-schemas.ts` en
 *    `notifications/regels.ts` — en het is de derde keer in deze codebase dat
 *    precies dit misging. **Pure logica die je wilt testen, hoort in een bestand
 *    dat de client niet importeert.**
 */

/**
 * Eén voorgestelde mijlpaal, zoals de Doelcoach hem teruggeeft.
 *
 * ⚠️ Alles gecontroleerd. Dit is modeluitvoer: hij is server-side al met Zod
 *    gevalideerd vóór opslag, maar een scherm dat erop vertrouwt dat er een
 *    `title` staat, toont `undefined` op de dag dat het formaat verschuift.
 */
export interface VoorstelMijlpaal {
  readonly title: string;
  readonly description: string | null;
  readonly target_date: string | null;
}

/**
 * Haalt de mijlpalen uit de uitvoer van een afgeronde job.
 *
 * ⚠️ Accepteert `milestones` én `mijlpalen` én een kale array. Dit is de laatste
 *    plek vóór het scherm, en een lege lijst is hier een beter antwoord dan een
 *    crash.
 */
export function mijlpalenUit(output: unknown): readonly VoorstelMijlpaal[] {
  const bron = Array.isArray(output)
    ? output
    : typeof output === 'object' && output !== null
      ? ((output as Record<string, unknown>).milestones ??
        (output as Record<string, unknown>).mijlpalen)
      : null;

  if (!Array.isArray(bron)) return [];

  return bron
    .filter((rij): rij is Record<string, unknown> => typeof rij === 'object' && rij !== null)
    .map((rij) => ({
      title: typeof rij.title === 'string' ? rij.title : String(rij.titel ?? ''),
      description:
        typeof rij.description === 'string'
          ? rij.description
          : typeof rij.omschrijving === 'string'
            ? rij.omschrijving
            : null,
      target_date:
        typeof rij.target_date === 'string'
          ? rij.target_date
          : typeof rij.streefdatum === 'string'
            ? rij.streefdatum
            : null,
    }))
    .filter((m) => m.title.trim() !== '');
}

/**
 * De tegenspraak van de coach — QS8-38, laatste acceptatiecriterium.
 *
 * Leeg betekent: de deadline past bij de opgegeven uren. Staat er tekst, dan
 * zegt de coach dát het niet past, waarom, en welke uitweg er is.
 *
 * ⚠️ Geeft `null` bij een leeg of ontbrekend veld, en niet een lege string. Het
 *    scherm moet "geen bezwaar" kunnen onderscheiden van "een bezwaar zonder
 *    tekst" — dat laatste is een modelfout en hoort niet als lege waarschuwing
 *    in beeld te komen.
 */
export function haalbaarheidUit(output: unknown): string | null {
  if (typeof output !== 'object' || output === null) return null;

  const waarde = (output as Record<string, unknown>).haalbaarheid;
  if (typeof waarde !== 'string') return null;

  const schoon = waarde.trim();
  return schoon === '' ? null : schoon;
}

/**
 * Eén voorgestelde weekstap onder een mijlpaal — QS8-41.
 *
 * ⚠️ **Let op het typeverschil met `VoorstelMijlpaal`:** daar zijn
 *    `description` en `target_date` nullable, hier zijn vloer en plafond
 *    **niet-nullable strings**. Het type dráágt het acceptatiecriterium ("elk
 *    voorgesteld weekdoel komt mét vloer en plafond"), zodat het scherm de
 *    "wat als de vloer leeg is"-tak niet eens kán schrijven.
 */
export interface VoorstelWeekdoel {
  readonly title: string;
  readonly floor_text: string;
  readonly ceiling_text: string;
}

/** De grens die `weekdoelSchema` verderop hanteert, in dezelfde eenheid. */
const VELD_MAX = 200;

/** De ondergrens op een weekdoeltitel uit `weekdoelSchema`. */
const TITEL_MIN = 3;

/**
 * Haalt de weekstappen uit de uitvoer van een afgeronde job — QS8-41.
 *
 * ⚠️ **Filtert per rij en nooit de hele lijst.** Eén voorstel zonder vloer maakt
 *    de andere vijf niet onbruikbaar; het maakt dát ene voorstel half werk, en
 *    dat is precies wat het acceptatiecriterium verbiedt. Blijven er nul rijen
 *    over, dan is dat een lege lijst en geen crash — het scherm toont dan de
 *    terugval naar handmatig, net als `coach.geen_mijlpalen` bij mijlpalen.
 *
 * ⚠️ **Een vloer die gelijk is aan het plafond valt af.** Dat is geen vangnet
 *    maar een tweede formulering van dezelfde stap, en domeinregel 8 zegt dat de
 *    vloer "de versie is die je op je slechtste week nog haalt". Dit is het
 *    meest waarschijnlijke faalgeval van het model, dus het staat expliciet in
 *    de prompt én hier in de zeef.
 *
 * ⚠️ **`.length` en niet `telTekens()`, en dat is hier de juiste keuze.**
 *    `weekdoelSchema` gebruikt Zod's `.max(200)` en dat telt UTF-16-eenheden;
 *    `telTekens()` telt codepunten. `.length >= telTekens()` altijd, dus
 *    `.length > 200` is de striktere van de twee en laat niets door dat Zod
 *    daarna alsnog weigert. Dit is de val uit QS8-118, maar dan aan de
 *    bovengrens — waar het verschil de veilige kant op valt in plaats van de
 *    onveilige.
 *
 * ⚠️ Accepteert `weekly_goals` én `weekdoelen` én een kale array, en Nederlandse
 *    veldnamen. Dit is de laatste plek vóór het scherm; hetzelfde argument als
 *    bij `mijlpalenUit()`.
 */
export function weekdoelenUit(output: unknown): readonly VoorstelWeekdoel[] {
  const bron = Array.isArray(output)
    ? output
    : typeof output === 'object' && output !== null
      ? ((output as Record<string, unknown>).weekly_goals ??
        (output as Record<string, unknown>).weekdoelen)
      : null;

  if (!Array.isArray(bron)) return [];

  return bron
    .filter((rij): rij is Record<string, unknown> => typeof rij === 'object' && rij !== null)
    .map((rij) => ({
      title: tekst(rij.title ?? rij.titel),
      floor_text: tekst(rij.floor_text ?? rij.vloer),
      ceiling_text: tekst(rij.ceiling_text ?? rij.plafond),
    }))
    .filter(
      (w) =>
        w.title.length >= TITEL_MIN &&
        w.floor_text !== '' &&
        w.ceiling_text !== '' &&
        w.floor_text.toLowerCase() !== w.ceiling_text.toLowerCase() &&
        w.title.length <= VELD_MAX &&
        w.floor_text.length <= VELD_MAX &&
        w.ceiling_text.length <= VELD_MAX,
    );
}

function tekst(waarde: unknown): string {
  return typeof waarde === 'string' ? waarde.trim() : '';
}

// ---------------------------------------------------------------------------
// Het plan uit één zin — QS8-201
// ---------------------------------------------------------------------------

/**
 * De categorieën die `goals.category` accepteert.
 *
 * ⚠️ **Bewust hier herhaald en niet geïmporteerd uit `goals/schemas.ts`.** Dit
 *    bestand importeert met opzet niets uit een module die de Supabase-client
 *    meetrekt — zie de kop. De prijs is een kopie; de grendel daarop is de test
 *    die deze lijst naast `CATEGORIEEN` legt, en die valt om zodra er één
 *    verschuift.
 *
 * ⚠️ QS8-224 wil deze lijst uitbreiden. Gebeurt dat, dan verandert hier de lijst,
 *    daar de CHECK op `goals`, en de opsomming in de prompt van de Doelcoach.
 *    Alle drie, of de AI kiest een categorie die de database weigert.
 */
const CATEGORIEEN_UIT_HET_SCHEMA = ['business', 'study', 'other'] as const;

/**
 * Een compleet plan zoals de Doelcoach het in één ronde teruggeeft — QS8-201.
 *
 * ⚠️ **`title` is niet-nullable en de rest wel, en dat is het hele contract.**
 *    Zonder titel is er geen doel te maken; dat is de enige echt fatale
 *    ontbrekende waarde. Alle andere velden hebben een terugval: geen categorie
 *    wordt `other`, geen identiteitszin wordt leeg, geen weekdoel betekent dat
 *    de gebruiker zijn eerste week zelf invult.
 */
export interface VoorstelPlan {
  readonly title: string;
  readonly category: (typeof CATEGORIEEN_UIT_HET_SCHEMA)[number];
  readonly identity_statement: string | null;
  readonly milestones: readonly VoorstelMijlpaal[];
  /** Het eerste weekdoel onder mijlpaal 1, of `null` als het model er geen bruikbaar gaf. */
  readonly first_weekly_goal: VoorstelWeekdoel | null;
  readonly haalbaarheid: string | null;
}

/** De grens die `doelSchema` op een doeltitel hanteert. */
const TITEL_MAX = 120;

/** De ondergrens op een doeltitel, gelijk aan `doelSchema`. */
const DOELTITEL_MIN = 3;

/**
 * Leest het plan uit de uitvoer van een afgeronde `plan`-job — QS8-201.
 *
 * Geeft `null` als er geen bruikbare titel in zit. Dat is de enige harde eis:
 * uit een plan zónder titel valt geen doel te maken, en dan is een lege
 * terugmelding eerlijker dan een scherm met een leeg invoerveld dat "voorstel"
 * heet.
 *
 * ⚠️ **Hergebruikt `mijlpalenUit()`, `weekdoelenUit()` en `haalbaarheidUit()`.**
 *    Die dragen elk hun eigen zeef — de vloer die niet gelijk mag zijn aan het
 *    plafond, de veldgrenzen, de lege titels. Dat hier overdoen zou betekenen dat
 *    één plan langs een ándere lat gaat dan hetzelfde voorstel via het bestaande
 *    pad, en dan verschilt wat de gebruiker krijgt per route.
 *
 * ⚠️ **Een onbekende categorie wordt `other` en geen fout.** `goals.category`
 *    heeft een CHECK; een model dat "health" verzint zou het aanmaken laten
 *    falen op een `23514` die de gebruiker niets zegt. De terugval is de
 *    conservatieve keuze en hij is zichtbaar: het scherm laat de categorie zien
 *    en je kunt hem bijstellen vóór je bevestigt.
 */
export function planUit(output: unknown): VoorstelPlan | null {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) return null;

  const rij = output as Record<string, unknown>;
  const titel = tekst(rij.title ?? rij.titel);

  if (titel.length < DOELTITEL_MIN || titel.length > TITEL_MAX) return null;

  // ⚠️ Het eerste bruikbare weekdoel, niet het eerste dat het model noemde.
  //    `weekdoelenUit()` gooit rijen zonder vloer of met vloer == plafond eruit;
  //    zou hier `[0]` van de rúwe lijst staan, dan glipt precies zo'n rij langs
  //    de zeef die daar met reden staat.
  //
  // ⚠️ **`alsLijst()` omdat het schema hier één object teruggeeft en geen array.**
  //    `weekdoelenUit()` accepteert een kale array of een object mét
  //    `weekly_goals`; een los weekdoelobject valt tussen die twee door en geeft
  //    stil een lege lijst. Dan zou elk plan zonder eerste week aankomen en
  //    niemand zou zien waarom.
  const weekdoelen = weekdoelenUit(
    alsLijst(rij.first_weekly_goal ?? rij.eerste_weekdoel ?? rij.weekly_goals ?? rij.weekdoelen),
  );

  return {
    title: titel,
    category: categorieUit(rij.category ?? rij.categorie),
    identity_statement: optioneel(rij.identity_statement ?? rij.identiteitszin),
    milestones: mijlpalenUit(rij),
    first_weekly_goal: weekdoelen[0] ?? null,
    haalbaarheid: haalbaarheidUit(rij),
  };
}

function categorieUit(waarde: unknown): (typeof CATEGORIEEN_UIT_HET_SCHEMA)[number] {
  const schoon = tekst(waarde).toLowerCase();
  return (CATEGORIEEN_UIT_HET_SCHEMA as readonly string[]).includes(schoon)
    ? (schoon as (typeof CATEGORIEEN_UIT_HET_SCHEMA)[number])
    : 'other';
}

function optioneel(waarde: unknown): string | null {
  const schoon = tekst(waarde);
  return schoon === '' ? null : schoon;
}

/**
 * Eén weekdoelobject wordt een lijst van één; een lijst blijft een lijst.
 *
 * ⚠️ Alles wat geen object of array is, wordt een lege lijst — dan valt het
 *    verderop stil weg in plaats van `weekdoelenUit()` iets te voeren waar hij
 *    niets mee kan.
 */
function alsLijst(waarde: unknown): unknown[] {
  if (Array.isArray(waarde)) return waarde;
  if (typeof waarde === 'object' && waarde !== null) return [waarde];
  return [];
}
