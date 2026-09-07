/**
 * Persoonsgegevens uit foutmeldingen halen, vóór ze het apparaat verlaten.
 *
 * ⚠️ Dit is niet alleen een AVG-kwestie. Domeinregel 7 zegt dat falen nooit
 *    publiek is, en een foutrapport is publiek genoeg: een crash bij het
 *    afsluiten van een gemiste week mag niet met de tekst van die week in een
 *    dashboard belanden waar iemand anders meekijkt.
 *
 * Daarom een **allowlist** en geen blocklist. Bij een blocklist is elk veld dat
 * later aan het datamodel wordt toegevoegd standaard lekbaar, en dat merk je
 * pas als het al gebeurd is.
 */

/**
 * Sleutels die veilig meegaan. Allemaal technisch: geen van deze velden bevat
 * iets dat een gebruiker zelf heeft ingetypt.
 */
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'where',
  'name',
  'status',
  'httpStatus',
  'table',
  'operation',
  'platform',
  'count',
  'durationMs',
  'retryCount',
  'cycleIndex',
]);

/** Sleutels die een id dragen. Een uuid zegt niets zonder toegang tot de database. */
const ID_KEY = /(?:^|_)id$|Id$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * De foutcode van een mislukte databaseaanroep: een SQLSTATE (`23514`, `42501`)
 * of een PostgREST-code (`PGRST202`). PostgREST zet allebei in hetzelfde veld.
 *
 * ⚠️ **Deze sleutel staat bewust niet in `ALLOWED_KEYS`, en dat is de hele
 *    reden dat hij bestaat.** Hij is er gekomen als vervanging voor de rúwe
 *    Postgres-melding die tot QS8-315 mee de deur uit ging: zonder iets van de
 *    fout is een gebeurtenis in Sentry niet te plaatsen, maar de melding zelf
 *    mag niet mee — die draagt bij een `%`-interpolatie de waarde die de fout
 *    veroorzaakte, en `scrubMessage()` haalt die vorm er níét uit (gemeten).
 *
 * ⚠️ **Een allowlist-sleutel is een kanaal, dus deze heeft een vórmtoets in
 *    plaats van een schoonmaakbeurt.** Alles wat niet als foutcode leest wordt
 *    `[weggelaten]`, ook een string die `scrubMessage()` ongemoeid zou laten.
 *    Zo kan een volgende aanroeper er geen gebruikerstekst doorheen duwen door
 *    hem simpelweg `sqlstate` te noemen — het verschil tussen een grens die
 *    afdwingt en een afspraak die je moet onthouden.
 */
const FOUTCODE = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/;

/**
 * De codevorm van de niet-Postgres-onderdelen van Supabase: `invalid_credentials`
 * bij auth, `NoSuchKey` bij storage. Eén woord, geen spaties, geen leestekens.
 *
 * ⚠️ **Een tweede vorm en geen verruiming van de eerste.** `FOUTCODE` bewaakt de
 *    `sqlstate`-sleutel, en die grens is smal met een reden; hier gaat het om
 *    een ánder veld met een andere catalogus. Twee smalle vormen naast elkaar
 *    zijn eerlijker dan één brede die allebei moet dekken.
 *
 * ⚠️ **Waarom dit veilig genoeg is en waar de grens ligt.** Een Postgres-melding
 *    (`Europe/Bogus is geen bekende tijdzone`) heeft spaties, een e-mailadres
 *    heeft `@` en een punt; allebei vallen ze af. Wat er wél doorheen komt is
 *    één enkel woord.
 *
 * ⚠️⚠️ **En dat is sinds QS8-330 een scherpere grens dan hier stond.** Er stond
 *    dat dit veld "niet door een aanroeper gevuld wordt" maar van het foutobject
 *    van de bibliotheek gelezen. Dat gold toen `SYMBOOLCODE` alleen
 *    `foutcodeVan()` bediende. Sinds deze vorm óók de `code`-sléútel bewaakt, is
 *    het onwaar: 📏 tien plekken in `supabase/functions/rollover` en
 *    `notificaties` schrijven met de hand `{ code: 'profielen_ophalen_mislukt' }`
 *    en dergelijke, via `_shared/melden.ts` naar dezelfde `scrubContext()`.
 *
 *    Vandaag zijn dat constanten en lekt er niets — nagemeten. Maar de rem is
 *    dan ook enkel deze vormtoets, en die laat elk enkel woord door:
 *    `{ code: groep.naam }` of `{ code: profiel.voornaam }` komt er onveranderd
 *    uit. Wie hier een variabele neerzet in plaats van een constante, zet een
 *    gebruikersnaam naast `waar: 'weekafsluiting.…'` in een foutrapport, en dat
 *    is domeinregel 7 via een omweg. `foutsleutel:controle` scant daarom sinds
 *    QS8-330 ook `supabase/functions/`, maar hij leest namen en geen waarden —
 *    hij ziet een constante niet van een variabele te onderscheiden.
 */
const SYMBOOLCODE = /^[A-Za-z][A-Za-z0-9_]{2,40}$/;

/**
 * Leest deze waarde als een foutcode — van welke van de twee catalogi dan ook?
 *
 * ⚠️ **Sinds QS8-330 draagt óók de `code`-sleutel deze toets.** Hij stond tot
 *    dan op `ALLOWED_KEYS` en ging dus ongetoetst de deur uit: 74 aanroepen
 *    geven `code: error.code` mee, en een allowlist-sleutel is een kanaal. Wie
 *    zijn eigen veld `code` noemde, duwde er alles doorheen wat `scrubMessage()`
 *    ongemoeid laat — precies het gat dat de kop van `FOUTCODE` hierboven
 *    beschrijft, één sleutel verderop en vier maanden onopgemerkt.
 *
 * ⚠️ **Twee vormen en niet één, want `code` draagt allebei de catalogi.**
 *    PostgREST zet er `42501` of `PGRST202` in, auth `invalid_credentials`,
 *    storage `NoSuchKey`. `sqlstate` houdt met opzet alleen de eerste: die
 *    sleutel is smaller omdat hij smaller mág zijn.
 */
function leestAlsFoutcode(waarde: string): boolean {
  return FOUTCODE.test(waarde) || SYMBOOLCODE.test(waarde);
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** JWT's en Supabase-keys beginnen allemaal met `eyJ`. */
const TOKEN = /eyJ[\w-]+\.[\w-]+(\.[\w-]+)?/g;
/** Waarden tussen enkele of dubbele aanhalingstekens in Postgres-meldingen. */
const QUOTED = /'[^']{0,500}'|"[^"]{0,500}"/g;

/**
 * De waarde uit de `DETAIL`-regel van een Postgres-constraintfout.
 *
 * ⚠️ **Deze regel bestaat omdat `QUOTED` hem níét ving, en de test die dat
 *    beweerde toetste iets anders.** Postgres schrijft de gebroken waarde
 *    tússen haakjes en zonder aanhalingstekens:
 *
 *      DETAIL:  Key (invite_code)=(DUP001) already exists.
 *
 *    Op 28-08-2026 gemeten tegen een échte Postgres 16, ook met een waarde met
 *    een spatie erin (`Key (invite_code)=(met spatie)`) — er komen nooit
 *    aanhalingstekens omheen. De fixture in `scrub.test.ts` schreef
 *    `=('zomer-2026')` mét quotes, en dáárop sloeg `QUOTED` wél aan. De test was
 *    groen terwijl elke uitnodigingscode ongeschoond naar Sentry ging.
 *
 * ⚠️ **De kolomnaam blijft staan, de waarde niet.** Een kolomnaam is
 *    schemametadata en juist wat je bij het opzoeken nodig hebt; de waarde is
 *    wat een gebruiker heeft ingetypt. Dat onderscheid is de hele reden dat dit
 *    een eigen patroon is en geen bredere bezem.
 *
 * ⚠️ `QUOTED` haalde ondertussen wél de constraintnáám weg
 *    (`"groups_invite_code_key"`). Dat is schemametadata en geen
 *    persoonsgegeven — hij beschermde dus de veilige helft en liet de
 *    gevaarlijke door. Bewust niet omgedraaid in deze wijziging: `QUOTED` vangt
 *    ook echte geciteerde waarden elders, en dat versmallen is een aparte
 *    afweging.
 */
const PG_DETAIL_WAARDE = /(Key \([^)]{0,200}\)=\()[^)]{0,500}(\))/g;

export const REDACTED = '[weggelaten]';

/** Een foutmelding zonder e-mailadressen, tokens of geciteerde waarden. */
export function scrubMessage(message: string): string {
  return (
    message
      .replace(EMAIL, '[e-mail]')
      .replace(TOKEN, '[token]')
      // ⚠️ Vóór `QUOTED`, want die zou de haakjesvorm niet raken maar wél de
      //    aanhalingstekens eromheen kunnen opeten als er ooit een variant komt
      //    waarin ze allebei voorkomen.
      .replace(PG_DETAIL_WAARDE, `$1${REDACTED}$2`)
      .replace(QUOTED, REDACTED)
      .slice(0, 500)
  );
}

/**
 * De frameregels van een stack: `    at fn (bestand.ts:12:3)`.
 *
 * ⚠️ De kop erboven is de melding, en die is precies wat `scrubMessage()`
 *    schoonmaakt. V8 zet `Naam: melding` als eerste regel van `error.stack`.
 */
const STACKFRAME = /^\s*at\s/;

/**
 * ⚠️ Ruim genoeg voor elke echte stack en klein genoeg om geen verrassing te
 *    zijn. Zonder grens kan één fout in een lus een rapport van megabytes
 *    opleveren.
 */
const STACK_MAX = 4000;

/**
 * Een stack zonder de melding die erboven staat.
 *
 * ⚠️ **Waarom dit bestaat, en het is een gerepareerd lek en geen voorzorg.**
 *    Tot 24-08-2026 haalde `reportError()` de melding door `scrubMessage()` en
 *    gaf hij `error.stack` ongewijzigd door. Maar de eerste regel van een stack
 *    ís die melding, letterlijk:
 *
 *      Error: Key (invite_code)=('zomer-2026') already exists, mail sanne@...
 *          at maakGroep (api.ts:41:11)
 *
 *    Elk e-mailadres, elke geciteerde Postgres-waarde en elke token die
 *    `scrubMessage()` eruit haalde, ging er via `stack` alsnog uit. Nagemeten,
 *    niet vermoed.
 *
 * ⚠️ De kop wordt daarom niet opnieuw geschoond maar **opnieuw opgebouwd** uit
 *    de naam en de al geschoonde melding. Twee keer hetzelfde schoonmaken is
 *    twee plekken die uit elkaar kunnen lopen; dit kán niet uit elkaar lopen.
 *
 * ⚠️ De frameregels gaan wél door de e-mail- en tokenfilter. Een bestandspad
 *    draagt op een ontwikkelmachine de gebruikersnaam, en een `at`-regel kan een
 *    query-string bevatten. De `QUOTED`-regel blijft eraf: die zou een
 *    aanhalingsteken in een pad opeten en de stack onleesbaar maken.
 */
export function scrubStack(
  stack: string | undefined,
  name: string,
  geschoondeMelding: string,
  ruweMelding?: string,
): string | undefined {
  if (stack === undefined) return undefined;

  // ⚠️ **De kop wordt exact afgeknipt als we hem kennen, en niet weggefilterd.**
  //    Een melding mag meerdere regels hebben, en `STACKFRAME` kijkt per regel:
  //    een tweede meldingsregel die met `at ` begint (`ik werk\nat home met …`)
  //    leest als frame en ging zo alsnog mee. Dat is het lek van 24-08 in een
  //    nieuwe jas — dezelfde vorm, één regel lager.
  const kop = ruweMelding === undefined ? undefined : `${name}: ${ruweMelding}`;
  const romp = kop !== undefined && stack.startsWith(kop) ? stack.slice(kop.length) : stack;

  const frames = romp
    .split('\n')
    .filter((regel) => STACKFRAME.test(regel))
    .map((regel) => regel.replace(EMAIL, '[e-mail]').replace(TOKEN, '[token]'));

  return [`${name}: ${geschoondeMelding}`, ...frames].join('\n').slice(0, STACK_MAX);
}

function scrubValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return scrubMessage(value);
  return REDACTED;
}

/**
 * Houdt alleen wat op de allowlist staat, plus `sqlstate` en `code` als ze als
 * foutcode lezen en id-velden die er als uuid uitzien. De rest wordt vervangen,
 * niet weggelaten — dat een veld bestond is zelf nuttige informatie bij het
 * uitzoeken.
 *
 * ⚠️ **`code` staat sinds QS8-330 niet meer op `ALLOWED_KEYS` maar in de
 *    getoetste tak.** Daar ging hij ongetoetst doorheen terwijl hij hetzelfde
 *    veld draagt als `sqlstate`. Een sleutel die een foutcode heet, heeft een
 *    foutcodevorm — anders is het een gat met een geruststellende naam.
 */
export function scrubContext(extra: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(extra)) {
    // ⚠️ **Twee takken en niet één, en dat is een gerepareerde verruiming.**
    //    Hier stond één tak met `FOUTCODE || SYMBOOLCODE` voor allebei, en die
    //    zette `sqlstate` open voor `pgrst202` — kleine letters, geen geldige
    //    PostgREST-code. `scrub.test.ts` werd er terecht rood van. `sqlstate` is
    //    smal met een reden (zie de kop van `FOUTCODE`); `code` draagt daarnaast
    //    de auth- en storagecatalogus. Ze delen een doel, geen vorm.
    if (key === 'sqlstate') {
      out[key] = typeof value === 'string' && FOUTCODE.test(value) ? value : REDACTED;
      continue;
    }
    if (key === 'code') {
      out[key] = typeof value === 'string' && leestAlsFoutcode(value) ? value : REDACTED;
      continue;
    }
    if (ALLOWED_KEYS.has(key)) {
      out[key] = scrubValue(value);
      continue;
    }
    if (ID_KEY.test(key) && typeof value === 'string' && UUID.test(value)) {
      out[key] = value;
      continue;
    }
    out[key] = REDACTED;
  }

  return out;
}

/**
 * ⚠️ **De vaste zin die in de plaats komt van een servermelding — QS8-319.**
 *
 * `scrubMessage()` haalt geciteerde waarden en de `Key (col)=(val)`-vorm uit een
 * melding, maar **niet** een `%`-interpolatie, en dát is de vorm waarin PL/pgSQL
 * interpoleert. 📏 Gemeten met de échte functie: `Europe/Bogus is geen bekende
 * tijdzone` en `Te veel avatars voor deze gebruiker (12).` komen er onveranderd
 * uit, terwijl de constraintnáám — schemametadata, en juist wat je bij het
 * opzoeken nodig hebt — wél geschoond wordt. De veilige helft beschermd, de
 * gevaarlijke doorgelaten.
 *
 * ⚠️ **Dat gat is niet met een bezem te dichten**, en dat is gemeten en geen
 *    indruk: zonder het formaatsjabloon is `Europe/Bogus` niet van de rest van
 *    de zin te onderscheiden. Wat wél kan is de melding wegnemen van de
 *    fóutsoort die hem interpoleert.
 */
export const SERVERMELDING_WEGGELATEN = 'Servermelding weggelaten';

/**
 * De markers die de Supabase-bibliotheken zelf op hun foutobjecten zetten.
 *
 * ⚠️ **Een marker weegt zwaarder dan een klassenaam, want subklassen hernoemen
 *    zich.** `AuthApiError`, `AuthWeakPasswordError` en `StorageApiError` zetten
 *    alle drie hun eigen `name`, maar dragen deze vlag onveranderd. Een lijst
 *    van klassenamen zou bij elke nieuwe subklasse stil open gaan staan.
 */
const SERVERMARKERS = ['__isAuthError', '__isStorageError'] as const;

/**
 * De klassenamen van Supabase-fouten, als vangnet naast de markers.
 *
 * ⚠️ Bewust een vórm en geen opsomming: `PostgrestError` en `FunctionsHttpError`
 *    dragen geen marker, en een volgende `FunctionsXError` hoort er meteen onder
 *    te vallen zonder dat iemand deze regel bijwerkt. Te ruim is hier de veilige
 *    kant — wat er onterecht onder valt, verliest leesbaarheid en lekt niets.
 */
const SERVERFOUTNAAM = /^(?:Postgrest|Auth|Storage|Functions|Realtime)\w*Error$/;

function leesString(bron: Readonly<Record<string, unknown>>, sleutel: string): string | undefined {
  const waarde = bron[sleutel];
  return typeof waarde === 'string' ? waarde : undefined;
}

/**
 * Is deze fout door een server samengesteld, en draagt zijn melding daarom een
 * waarde die wij niet geschreven hebben?
 *
 * ⚠️ **Dit kijkt naar de wáárde en niet naar het type, en dat is precies waarom
 *    deze richting gekozen is.** 📏 Van de 160 aanroepen in `src/` en `app/`
 *    typeert de compiler er 136 als een Supabase-fout; de overige 24 zijn
 *    `unknown`, `any` of een handgeschreven `Error`, en juist bij die eerste
 *    twee kán er alsnog een `PostgrestError` landen. Een grens op het statische
 *    type zou die elf niet dekken; deze wel.
 *
 * ⚠️ **Waar hij níét bij kan, en dat is eerlijk op te schrijven:** een melding
 *    die met de hand is overgeschreven in een eigen `Error`
 *    (``new Error(`x: ${fout.message}`)``) is aan het object niet meer te zien.
 *    `meldtekst:controle` vangt daarvan de vormen die **in het eerste argument
 *    van de aanroep zelf** staan; staat de interpolatie eerder — in een
 *    tussenvariabele, of in een `throw` die verderop gevangen wordt — dan ziet
 *    geen van beide grendels hem. Dat vraagt dataflow, en het staat als open rij
 *    van 07-09 in `docs/ENGINEER-REVIEW.md`. **De twee grendels dekken elkaars
 *    gat maar sluiten samen niet alles**, en dat hier "afgevangen" laten staan
 *    zou de volgende schrijver op een grendel laten vertrouwen die er niet is.
 */
export function isServerfout(fout: unknown): boolean {
  if (typeof fout !== 'object' || fout === null) return false;

  const bron = fout as Readonly<Record<string, unknown>>;
  if (SERVERMARKERS.some((marker) => bron[marker] === true)) return true;

  // ⚠️ **Op de aanwezigheid van de sleutels en niet op hun type, en dat is
  //    gemeten tegen een échte PostgREST.** Voor een kale `raise exception` —
  //    en 84 van de 87 in dit project zijn kaal, zonder `using detail` of
  //    `using hint` — stuurt PostgREST letterlijk:
  //
  //      {"code":"42501","details":null,"hint":null,"message":"permission denied…"}
  //
  //    Een toets die drie strings eist, slaat op de meest voorkomende vorm dus
  //    níet aan. Hier stond die toets, en de test die hem groen hield voedde een
  //    `PostgrestError` met alle vier de velden gevuld — een vorm die deze app
  //    nergens maakt. Zelfde fout als de fixture van 28-08 die `=('zomer-2026')`
  //    mét aanhalingstekens schreef: de test toetste mijn aanname over de vorm,
  //    niet de vorm.
  if ('code' in bron && 'details' in bron && 'hint' in bron) return true;

  const naam = leesString(bron, 'name');
  return naam !== undefined && SERVERFOUTNAAM.test(naam);
}

/**
 * De foutcode van een servermelding, als hij als code leest.
 *
 * ⚠️ **Dezelfde vormtoets als bij de `sqlstate`-sleutel, en om dezelfde reden:
 *    een veld dat als vervanging van een lek wordt ingevoerd, mag niet het
 *    volgende lek zijn.** Wat niet als code leest, komt er niet in — ook niet
 *    als `scrubMessage()` het ongemoeid zou laten.
 */
export function foutcodeVan(fout: unknown): string | undefined {
  if (typeof fout !== 'object' || fout === null) return undefined;

  const bron = fout as Readonly<Record<string, unknown>>;

  // ⚠️ **Eén veld, en een lege `code` telt als geen code.** Hier stond een
  //    terugval op `statusCode`, gebouwd op een verkeerde meting: ik riep
  //    `new StorageApiError(melding, 404, 'NoSuchKey')` aan en concludeerde
  //    daaruit dat storage zijn dienstcode in `statusCode` zet. De bibliotheek
  //    vult die velden anders — `statusCode` is de HTTP-code als string
  //    (`'404'`) en `code` de dienstcode (`NoSuchKey`) — dus die terugval had
  //    nooit iets kunnen opleveren: `'404'` valt op beide vormtoetsen af.
  //    **Een aanroep met de hand in elkaar zetten is geen meting van hoe hij
  //    gevuld wordt**, en een terugval waar geen geval bij hoort, is code die
  //    niets bewaakt.
  //
  //    ⚠️ De lege string heeft om dezelfde reden géén eigen regel: de
  //    netwerkfoutvorm van postgrest-js zet `code` op `''`, en die valt op
  //    beide vormtoetsen hieronder al af. Een extra `!== ''` leest als een
  //    grendel maar is er geen — een mutatie erop bleef groen.
  const code = leesString(bron, 'code');
  if (code === undefined) return undefined;

  return FOUTCODE.test(code) || SYMBOOLCODE.test(code) ? code : undefined;
}

/** Wat er van een fout overblijft nadat hij de deur uit mag. */
export interface Foutbeschrijving {
  readonly naam: string;
  readonly melding: string;
  readonly stack?: string | undefined;
}

function servermelding(fout: unknown): string {
  const code = foutcodeVan(fout);
  return code === undefined ? SERVERMELDING_WEGGELATEN : `${SERVERMELDING_WEGGELATEN} (${code})`;
}

/**
 * Zet een gevangen fout om in wat er verstuurd mag worden.
 *
 * ⚠️ **Dit staat hier en niet bij de twee aanroepers, en dat is de naad die dit
 *    issue eigenlijk repareert.** `describe()` in `index.ts` en `beschrijf()` in
 *    `edge-rapport.ts` deden hetzelfde werk in twee bestanden — de app en de
 *    jobs, met dezelfde belofte en twee plekken om hem te breken. Sinds QS8-319
 *    is er één, en gaat hij via `edge:sync` mee naar Deno.
 *
 * ⚠️ **De stack gaat door `scrubStack()` mét de al bepaalde melding.** De eerste
 *    regel van een stack ís de melding; die opnieuw opbouwen in plaats van
 *    opnieuw schonen is de reparatie van 24-08, en een servermelding zou er
 *    anders langs die weg alsnog uitgaan.
 */
export function beschrijfFout(fout: unknown): Foutbeschrijving {
  if (fout instanceof Error) {
    const melding = isServerfout(fout) ? servermelding(fout) : scrubMessage(fout.message);
    return {
      naam: fout.name,
      melding,
      stack: scrubStack(fout.stack, fout.name, melding, fout.message),
    };
  }

  // ⚠️ Een servervorm zonder `Error` eromheen — PostgREST geeft er een terug
  //    zodra hij een JSON-heenreis heeft gemaakt. `String(fout)` zou hier
  //    `[object Object]` geven en dus niets lekken, maar ook niets zeggen; de
  //    code is het enige stukje dat er veilig uit kan.
  if (isServerfout(fout)) return { naam: 'NonError', melding: servermelding(fout) };

  return { naam: 'NonError', melding: scrubMessage(String(fout)) };
}
