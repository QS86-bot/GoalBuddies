import { execFile, execFileSync } from 'node:child_process';
import { cpus, networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/**
 * Eén psql-omgeving voor de RLS-tests die de database rechtstreeks lezen.
 *
 * ⚠️ **Waarom dit bestaat.** Vier testbestanden hadden ieder hun eigen kopie van
 *    dezelfde vijftien regels, en drie ervan stonden op poort **5432** terwijl
 *    `scripts/lokale-stack.sh` op `${PGPORT:-5433}` draait. Zonder `PGPORT` in de
 *    omgeving verbond geen van die drie ergens mee, sloegen ze zichzelf over, en
 *    gaf de suite **exitcode 0**: dertig tests weg, en de poort las groen.
 *    Gemeten: 863 geslaagd / 31 overgeslagen zonder `PGPORT`, tegen 893 / 1
 *    ermee. QS8-270.
 *
 * ⚠️ **Het poortnummer was de oorzaak, maar de skip is het defect.** `CLAUDE.md`
 *    zegt dat een controle zonder database niet groen is maar *ongemeten*, en de
 *    poort houdt die twee uit elkaar — voor de `*:controle`-scripts. Voor vitest
 *    doet niemand dat: een overgeslagen bestand verdwijnt in de telling. Daarom
 *    **werpt** `stackBeschikbaarOfFaal()` zodra `RLS_DOEL` gezet is. Wie zegt dat
 *    hij de RLS-suite draait, hoort niet stil dertig tests te kunnen overslaan.
 *
 * ⚠️ **Zelfde familie als QS8-268, andere helft.** Daar noemden zes scripts een
 *    verkeerde reden ("start de stack" terwijl die draaide); hier noemt niemand
 *    een reden. Vandaar dat de melding hieronder de twee gevallen uit elkaar
 *    houdt: geen verbinding tegenover een schema dat het gezochte object mist.
 */

/**
 * De omgeving waarin `psql` draait.
 *
 * ⚠️ **5433 en niet 5432.** `scripts/lokale-stack.sh` draait op `${PGPORT:-5433}`;
 *    een andere standaard hier betekent dat de tests naar een database wijzen die
 *    er niet is. Dit getal staat nog op precies één plek in de testboom, en dat
 *    is de reparatie: vier kopieën is hoe het misging.
 *
 * ⚠️ **`PGUSER` met een standaard**, om dezelfde reden als in `scripts/psql.mjs`
 *    (QS8-268): zonder valt psql terug op de OS-gebruiker, en die heet in een
 *    bouwomgeving `root`.
 */
export const PSQL_OMGEVING: NodeJS.ProcessEnv = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? '127.0.0.1',
  PGPORT: process.env.PGPORT ?? '5433',
  PGUSER: process.env.PGUSER ?? 'postgres',
  PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
  // ⚠️ **De beheerverbinding mag uit `storage.objects` wissen, de app niet** —
  //    QS8-692. De shim draagt sinds dat issue Supabase' grendel
  //    `storage.protect_delete()`, die een `delete` weigert tenzij deze
  //    instelling aan staat. Op productie zet de Storage-API hem; het dashboard
  //    en deze tests ruimen als beheerder op. Wat via PostgREST loopt (de app,
  //    `verwijder_mijn_account()`) krijgt hem níet, en daar hoort de fout van
  //    QS8-692 dus ook lokaal te vallen.
  PGOPTIONS: [process.env.PGOPTIONS, '-c storage.allow_delete_query=true'].filter(Boolean).join(' '),
};

/** De database die de lokale stack opbouwt. */
export const PSQL_DB = process.env.PGDATABASE ?? 'goalbuddies_rls';

/**
 * Voert SQL uit en geeft de kale uitvoer terug.
 *
 * `verbose` zet `VERBOSITY=verbose` aan, wat de foutmeldingen van Postgres
 * uitgebreider maakt. Standaard uit, want een test die op een foutregel let,
 * krijgt er anders ongevraagd andere tekst.
 */
/**
 * De argumentenlijst waarmee élke psql-aanroep in de testboom draait.
 *
 * ⚠️ **Geëxporteerd sinds QS8-414, en niet omdat het handig is.** Wie een
 *    lángdurende sessie nodig heeft — `spawn` met een open stdin, zoals de
 *    slottest van de adempauze — kan `psql()` of `psqlMetInvoer()` niet
 *    gebruiken, want die wachten op het einde. Zonder een gedeelde lijst typt
 *    hij hem dan opnieuw, en dat is precies de kopie die QS8-270 dertig tests
 *    kostte. `tests/scripts/psql-verbinding.test.ts` maakt van die regel een
 *    grendel: een bestand in `tests/` dat `psql` start zónder deze lijst is
 *    rood, tenzij het mét reden in het register staat.
 *
 * ⚠️ **`-h` en `-p` staan er bewust niet in**, anders dan in
 *    `scripts/psql.mjs`. Ze komen uit `PSQL_OMGEVING`, en dát is hier de ene
 *    plek: één omgeving voor de hele boom, met de standaarden op 5433 en
 *    `postgres`. De twee bomen mogen verschillende standaarden hebben zolang ze
 *    er elk maar één hebben.
 */
export function psqlBasisArgumenten(verbose = false): string[] {
  return basisArgumenten(verbose);
}

/**
 * Wijst deze psql-omgeving naar een lokale database? Zo niet, de melding.
 *
 * ⚠️⚠️ **Het psql-pad had geen productieslot** (QS8-703, security-review van
 *    PR #690). `PSQL_OMGEVING` neemt `PGHOST`, `PGUSER`, `PGPASSWORD` en
 *    `PGDATABASE` over uit de omgeving, en `src/lib/test-env.ts` laadt `.env`.
 *    Wees `PGHOST` naar de pooler van productie — wat voor een dump heel gewoon
 *    is — dan schreven de psql-tests daar als `postgres`, met meer rechten dan
 *    de service role, zonder dat iemand een doel koos.
 *
 *    **Een allowlist en geen blocklist**: loopback of een Unix-socket (een pad),
 *    en verder niets — zelfde vorm als `magHierDraaien()` in
 *    `scripts/rls-dekking.mjs`. Een blocklist op de projectref mist een eigen
 *    domein en een hostnaam in hoofdletters; dat was de les van `guardProductie()`.
 *    `PGHOSTADDR` overschrijft `PGHOST` in libpq en wordt dus ook getoetst,
 *    `PGSERVICE` verwijst naar een bestand dat hier niet te lezen is (geweigerd),
 *    en `PGDATABASE` moet een kale naam zijn: als `-d` leest psql er anders een
 *    hele verbindingsstring in.
 */
const LOOPBACK = ['localhost', '127.0.0.1', '::1'];

export function psqlDoelFout(omgeving: NodeJS.ProcessEnv): string | null {
  const host = (omgeving.PGHOST ?? '').trim();
  const adres = (omgeving.PGHOSTADDR ?? '').trim();
  // ⚠️ Een lijst met komma's probeert libpq op volgorde: elk deel moet lokaal
  //    zijn, anders valt hij door naar de volgende host als de eerste niet
  //    antwoordt (security-review QS8-703).
  const lokaal = (lijst: string) =>
    lijst.split(',').every((h) => {
      const deel = h.trim();
      return deel.startsWith('/') || LOOPBACK.includes(deel.toLowerCase());
    });
  const db = (omgeving.PGDATABASE ?? 'goalbuddies_rls').trim();
  const weiger = (wat: string) =>
    `De RLS-suite weigert psql naar ${wat}: alleen een lokale database (loopback of ` +
    'een Unix-socket) mag. Zet PGHOST niet in .env of in je sessie, of draai met ' +
    '`npm run rls:lokaal` tegen de lokale stack (QS8-703).';

  if ((omgeving.PGSERVICE ?? '').trim() !== '') return weiger(`de dienst "${omgeving.PGSERVICE}" (PGSERVICE)`);
  if (!lokaal(host)) return weiger(`de host "${host}"`);
  // ⚠️ `PGDATABASE` gaat als `-d` mee, en daar leest psql ook een
  //    verbindingsstring, een URI of `service=…` — met een eigen host die de
  //    toets hierboven nooit ziet. Alleen een kale naam mag.
  if (!/^[A-Za-z0-9_]+$/.test(db)) return weiger(`de database "${db}" (PGDATABASE is geen kale naam)`);
  // ⚠️ En alleen de naam die de lokale stack en CI opbouwen (QS8-715). Achter
  //    een tunnel naar een pooler op de servermachine meldt ook productie zich
  //    als loopback, en `PGDATABASE=postgres` is voor een dump heel gewoon;
  //    de naam is dan het enige wat het verschil maakt.
  if (db !== 'goalbuddies_rls') return weiger(`de database "${db}" (alleen goalbuddies_rls)`);
  if (adres !== '' && !lokaal(adres)) return weiger(`het adres "${adres}" (PGHOSTADDR)`);
  return null;
}

/** Werpt als het doel niet lokaal is — vóór het verbinden. */
function eisLokaalDoel(): void {
  const fout = psqlDoelFout(PSQL_OMGEVING);
  if (fout !== null) throw new Error(fout);
}

/**
 * Werpt vóór er een psql-proces start, als het doel niet lokaal is of de
 * bestemming niet gemeten kon worden.
 *
 * ⚠️ **Niet kunnen meten is stoppen** (security-review QS8-715). Hier stond
 *    eerst "geen verbinding: zwijgen", en dan liep de eigenlijke aanroep daarna
 *    ongemeten door — een tunnel die de meetverbinding één keer weigerde, kreeg
 *    de volgende `psqlMetInvoer` met DML gewoon binnen. Alleen
 *    `stackBeschikbaarOfFaal()` mag "geen verbinding" als uitkomst behandelen,
 *    en die draait dan zijn proef niet meer.
 */
function eisLokaleDatabase(): void {
  eisLokaalDoel();
  if (eisBestemming() === 'geen-verbinding') {
    throw new Error(
      `psql: geen verbinding met ${PSQL_OMGEVING.PGHOST}:${PSQL_OMGEVING.PGPORT}/${PSQL_DB} ` +
        '— de bestemming is niet gemeten en er wordt niets uitgevoerd (QS8-715).',
    );
  }
}

/**
 * Waar kwam psql werkelijk uit? — QS8-715.
 *
 * ⚠️ **`psqlDoelFout()` toetst wat we van plan zijn; dit toetst waar we
 *    uitkwamen.** Een tunnel of lokale proxy naar productie op `127.0.0.1` gaat
 *    door elke lijst die je van tevoren kunt opschrijven. Zelfde vorm als
 *    `kloptDeBestemming()` in `scripts/rls-dekking.mjs`, zonder de poort: CI
 *    draait op 5432 en de lokale stack op 5433.
 *
 * ⚠️⚠️ **Twee soorten bewijs dat de server hier staat, en geen vlag.** CI draait
 *    Postgres als servicecontainer: `inet_server_addr()` is daar het adres van
 *    de container op de dockerbrug (`172.18.0.2`), en de eerste versie weigerde
 *    dat als "geen loopback". Wat de server van zichzelf ziet bewijst niet dat
 *    hij op deze machine staat, dus een tweede getuige erbij — wat de server van
 *    *ons* ziet:
 *
 *    1. **loopback**: het serveradres is `127.0.0.1`, `::1` of een socket
 *       (`unix-socket`): de lokale stack en een native Postgres. Een clienttoets
 *       voegt hier niets toe; een tunnel op loopback vangt alleen de databasenaam.
 *    2. **de eigen brug**: het serveradres ligt in `172.16.0.0/12` (de
 *       dockerbruggen), het clientadres — wat `inet_client_addr()` ziet — is een
 *       adres van een dockerbrug van déze machine (`docker0`/`br-…`, de gateway,
 *       `172.18.0.1`), en beide liggen in hetzelfde /16-net. Een tunnel naar een
 *       server aan de overkant laat de server een ander adres als client zien
 *       (het NAT-adres, de tunneluitgang) dat hier op geen interface staat.
 *
 *    Er is geen omgevingsvariabele die dit opent: `CI=true` zet iedereen overal,
 *    en dan is de grendel een instelling. Wat meetbaar is, staat hier; wat niet,
 *    is een ER-rij (zie het beslisdocument).
 *
 * @param uitkomst de regel `adres|database|clientadres` van de vraag in `BESTEMMING`
 * @param database de database die we bedoelden (`PSQL_DB`)
 * @param eigenAdressen de adressen van de netwerkinterfaces van deze machine
 */
export function bestemmingFout(
  uitkomst: string,
  database: string,
  eigenAdressen: readonly string[] = eigenInterfaceAdressen(),
): string | null {
  const delen = uitkomst.trim().split('|');
  // ⚠️ Precies drie velden: een naam met een pipe mag de velden niet verschuiven.
  if (delen.length !== 3) {
    return `De RLS-suite weigert te meten: de bestemming had ${delen.length} velden in plaats van 3 (QS8-715).`;
  }
  const [adres = '', echt = '', client = ''] = delen;

  if (!isLoopback(adres) && !opEigenBrug(adres, client, eigenAdressen)) {
    return (
      `De RLS-suite weigert te meten: psql kwam uit op "${adres}", en dat is geen loopback ` +
      'en ook geen container op de eigen dockerbrug (QS8-715).'
    );
  }
  if (echt !== database) {
    return `De RLS-suite weigert te meten: psql kwam uit in database "${echt}" en niet in "${database}" (QS8-715).`;
  }
  return null;
}

function isLoopback(adres: string): boolean {
  return ['127.0.0.1', '::1', 'unix-socket'].includes(adres);
}

/** `172.16.0.0/12`: de ruimte waaruit Docker zijn bruggen uitdeelt. */
function indockerRuimte(adres: string): boolean {
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(adres);
  const tweede = m ? Number(m[1]) : -1;
  return tweede >= 16 && tweede <= 31;
}

function opEigenBrug(server: string, client: string, eigenAdressen: readonly string[]): boolean {
  // De serverkant volgt uit de clientkant plus hetzelfde /16-net.
  if (!indockerRuimte(client)) return false;
  if (!eigenAdressen.includes(client)) return false;
  const net = (a: string) => a.split('.').slice(0, 2).join('.');
  return net(server) === net(client);
}

/**
 * De adressen van de dockerbruggen van deze machine: alleen interfaces die
 * `docker0` of `br-<12 hex>` heten, en alleen IPv4.
 *
 * ⚠️ **Niet elke interface** (security-review QS8-715, M2). Op een netwerk zonder
 *    NAT — een AWS-VPC, een kantoor-LAN, een VPN — ziet een server aan de overkant
 *    ons eigen `eth0`-adres, dus "is een eigen interface" bewees alleen "zelfde
 *    privénet". Een bruggateway is wat een container-op-deze-machine oplevert.
 */
export function brugAdressen(interfaces: ReturnType<typeof networkInterfaces>): string[] {
  return Object.entries(interfaces)
    .filter(([naam]) => /^(docker0|br-[0-9a-f]{12})$/.test(naam))
    .flatMap(([, lijst]) => lijst ?? [])
    .filter((i) => i.family === 'IPv4')
    .map((i) => i.address);
}

export function eigenInterfaceAdressen(): string[] {
  return brugAdressen(networkInterfaces());
}

const BESTEMMING =
  "select coalesce(host(inet_server_addr()), 'unix-socket') || '|' || current_database() || '|' || coalesce(host(inet_client_addr()), '');";

/** Eén keer per proces, en pas als er een antwoord was. */
let bestemmingGemeten = false;

export type Meting = 'gemeten' | 'geen-verbinding';

/** psql eindigt met 2 als de verbinding niet tot stand kwam. */
function geenVerbinding(fout: unknown): boolean {
  return typeof fout === 'object' && fout !== null && (fout as { status?: unknown }).status === 2;
}

/**
 * Meet de bestemming één keer en werpt als hij niet lokaal is.
 *
 * ⚠️ **Alleen psql-exitcode 2 heet "geen verbinding"**, en dan zegt
 *    `eisLokaleDatabase()` of `stackBeschikbaarOfFaal()` wat er moet gebeuren.
 *    Elke andere fout — een vraag die de server niet kent, een time-out — is
 *    "niet vast te stellen", en dat werpt. Een proxy die `inet_server_addr()`
 *    niet beantwoordt is geen reden om ongemeten door te gaan.
 *
 * @param voerUit de psql-aanroep; de toets geeft een nep
 */
export function eisBestemming(voerUit: (sql: string) => string = bestemmingVragen): Meting {
  if (bestemmingGemeten) return 'gemeten';

  let uitkomst: string;
  try {
    uitkomst = voerUit(BESTEMMING);
  } catch (fout) {
    if (geenVerbinding(fout)) return 'geen-verbinding';
    const reden = fout instanceof Error ? (fout.message.split('\n')[0] ?? '') : String(fout);
    throw new Error(
      `De RLS-suite weigert te meten: de bestemming van psql was niet vast te stellen (${reden}) (QS8-715).`,
    );
  }

  const fout = bestemmingFout(uitkomst, PSQL_DB);
  if (fout !== null) throw new Error(fout);
  bestemmingGemeten = true;
  return 'gemeten';
}

/** Alleen voor de toets: vergeet dat de bestemming gemeten is. */
export function vergeetBestemming(): void {
  bestemmingGemeten = false;
}

/** De vraag zelf, buiten `basisArgumenten()` om — anders roept hij zichzelf aan. */
function bestemmingVragen(sql: string): string {
  return execFileSync('psql', [...kaleArgumenten(false), '-c', sql], {
    env: PSQL_OMGEVING,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // ⚠️ Een verbinding die aangenomen wordt en nooit antwoordt, hangt anders
    //    eeuwig (CLAUDE.md, regel 14). Een time-out is "niet vast te stellen".
    timeout: 10_000,
  }).trim();
}

function basisArgumenten(verbose: boolean): string[] {
  eisLokaleDatabase();
  return kaleArgumenten(verbose);
}

function kaleArgumenten(verbose: boolean): string[] {
  return [
    '-U',
    PSQL_OMGEVING.PGUSER as string,
    '-d',
    PSQL_DB,
    '-q',
    '-w',
    '-v',
    'ON_ERROR_STOP=1',
    ...(verbose ? ['-v', 'VERBOSITY=verbose'] : []),
    '-tA',
  ];
}

export function psql(sql: string, { verbose = false } = {}): string {
  return execFileSync('psql', [...basisArgumenten(verbose), '-c', sql], {
    env: PSQL_OMGEVING,
    encoding: 'utf8',
  }).trim();
}

/**
 * Zelfde aanroep, maar de SQL gaat via stdin in plaats van via `-c`.
 *
 * ⚠️ **Waarom dit hier staat en niet in het testbestand dat het nodig had.**
 *    `-c` voert zijn tekst uit als één impliciete transactie; een bestand dat
 *    zelf `begin;` … `rollback;` doet en er een `do $$ … $$`-blok in heeft, hoort
 *    via stdin te gaan. Dat is een reden om de *vlag* te variëren, geen reden om
 *    de hele argumentenlijst opnieuw te typen — en dat laatste is precies wat er
 *    in `goedkeuring-wijst-naar-de-eigenaar.test.ts` gebeurde: een zevende kopie,
 *    zónder `-h`/`-p`, die alleen werkte doordat `PSQL_OMGEVING` die twee in de
 *    omgeving zet. CLAUDE.md: *een controle die psql aanroept, bouwt zijn eigen
 *    aanroep niet.* Dat register keek tot QS8-414 alleen in `scripts/`; sinds
 *    dat issue dekt het ook de testboom, en is "de lijst staat op één plek"
 *    geen gewoonte meer maar een grendel.
 */
export function psqlMetInvoer(sql: string, { verbose = false } = {}): string {
  return execFileSync('psql', basisArgumenten(verbose), {
    env: PSQL_OMGEVING,
    encoding: 'utf8',
    input: sql,
  });
}

/**
 * Meerdere zware vragen **tegelijk**, elk in een eigen psql-proces — QS8-499.
 *
 * ⚠️⚠️ **Waarom dit bestaat, en waarom het geen luxe is.** `naamnormalisatie`
 *    veegt het hele codepuntbereik langs `schone_naam()`. 📏 Gemeten op de
 *    lokale stack: **74 s** voor één zo'n veeg. QS8-499 maakt de regel
 *    contextgevoelig, dus één veeg is niet langer genoeg — er zijn er vier
 *    nodig, en achter elkaar is dat vijf minuten voor één toets.
 *
 *    📏 Diezelfde vier tegelijk: **74 s** in totaal. De veeg is processorwerk in
 *    één backend en deze bak heeft vier kernen, dus ze staan elkaar niet in de
 *    weg. Dat verschil is wat een grendel scheidt van een grendel die iemand
 *    uitzet — en `CLAUDE.md` waarschuwt bij regel 18 precies daarvoor: een
 *    controle die je leert overslaan, bewaakt niets.
 *
 * ⚠️ **Via `-c` en niet via stdin**, anders dan `psqlMetInvoer()`: elke vraag
 *    hier is één statement en `execFile` schrijft niet naar stdin. Wie hier een
 *    `:'variabele'` nodig heeft, hoort bij `psqlMetInvoer()` — psql
 *    interpoleert die alleen in invoer die hij zélf inleest.
 *
 * ⚠️ **`maxBuffer` met zoveel woorden.** De standaard van Node is 1 MiB en een
 *    veeg over 1.114.111 codepunten haalt dat ruim. Node kapt dan af met
 *    `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` — een fout die leest als een kapotte
 *    verbinding en niet als een te kleine emmer.
 *
 * ⚠️ De uitkomsten komen terug in de volgorde waarin de vragen binnenkwamen, en
 *    niet in de volgorde waarin ze klaar waren. `Promise.all` garandeert dat;
 *    zou het anders zijn, dan legt de aanroeper twee metingen naast elkaar die
 *    niet bij elkaar horen.
 *
 * ⚠️ **Een `timeout`, want onwrikbare regel 14 zegt dat elke externe call er een
 *    heeft.** Zonder zou een psql die blijft hangen pas opvallen bij de timeout
 *    van de aanroepende `beforeAll` — en die zegt dan *"de opstelling duurde te
 *    lang"* in plaats van *"de database antwoordde niet"*.
 *
 * ⚠️⚠️ **Niet álles tegelijk, maar zoveel als er kernen zijn — en dát is met een
 *    rode CI afgedwongen.** 📏 De eerste versie startte elke vraag meteen en gaf
 *    ze 300 s. Lokaal kost een veeg over het hele codepuntbereik 74 s en kosten
 *    er vier tegelijk óók 74 s, want deze bak heeft vier kernen. Een
 *    GitHub-runner heeft er **twee**: daar verdringen zeven gelijktijdige vegen
 *    elkaar, duurt elke veeg een veelvoud, en liep de vlagbasis-veeg zijn
 *    timeout in — `tests/rls/naamnormalisatie.test.ts` viel om op bestandsniveau
 *    terwijl de andere 175 bestanden groen waren.
 *
 *    **De les is niet "de timeout was te kort" maar "het getal nam mijn eigen
 *    machine als maat".** Meer processen dan kernen maakt niets sneller; het
 *    maakt alleen elke afzonderlijke duur onvoorspelbaar. `cpus().length` leest
 *    de maat van de machine waar hij draait, en de timeout geldt dan per vraag
 *    die daadwerkelijk CPU krijgt.
 *
 * 📏 **Nagemeten met de zeven vegen van `naamnormalisatie`, op deze bak:**
 *
 *      gelijktijdig=2  ->  409 s in totaal, ~102 s per veeg
 *      gelijktijdig=4  ->  208 s in totaal
 *
 *    Twee is de maat van een GitHub-runner, en 102 s per veeg zit ruim binnen de
 *    timeout hieronder. Het totaal verdubbelt wel, en dat is de prijs: zeven
 *    vegen over het hele codepuntbereik kósten dat. Een grendel die te traag is
 *    wordt uitgezet — maar een grendel die omvalt omdat hij zichzelf verdringt,
 *    bewaakt al helemaal niets.
 */
export async function psqlParallel(
  vragen: readonly string[],
  {
    verbose = false,
    maxBuffer = 256 * 1024 * 1024,
    timeout = 900_000,
    gelijktijdig = Math.max(1, cpus().length),
  } = {},
): Promise<string[]> {
  const uitvoeren = promisify(execFile);
  const uit: string[] = new Array<string>(vragen.length);

  // ⚠️ Een gedeelde teller en geen `chunk`-indeling: een veeg die eerder klaar
  //    is pakt meteen de volgende, in plaats van te wachten op de traagste van
  //    zijn groepje.
  let volgende = 0;
  const werker = async (): Promise<void> => {
    for (let i = volgende; i < vragen.length; i = volgende) {
      volgende += 1;
      const { stdout } = await uitvoeren(
        'psql',
        [...basisArgumenten(verbose), '-c', vragen[i] as string],
        { env: PSQL_OMGEVING, encoding: 'utf8' as const, maxBuffer, timeout },
      );
      uit[i] = stdout;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(gelijktijdig, vragen.length) }, () => werker()),
  );

  return uit;
}

/** Wat er met deze suite moet gebeuren. */
export type Stackoordeel = 'meten' | 'overslaan' | 'geen-verbinding' | 'schema-loopt-achter';

/**
 * De hele regel van QS8-270, los van psql en los van de omgeving.
 *
 * ⚠️ **`overslaan` is de enige stand waarin zwijgen mag**, en die geldt alleen
 *    als niemand beweerde te meten — dus zonder `RLS_DOEL`, zoals bij een kale
 *    `npm test` op een machine zonder stack. Staat `RLS_DOEL` wél, dan is er
 *    geen stand waarin een bestand zichzelf stil mag overslaan.
 *
 * ⚠️ **Twee foutstanden en niet één.** Geen verbinding is iets anders dan een
 *    database die het gezochte object mist; dat tweede betekent meestal een
 *    schema dat achterloopt op de migraties. Eén melding voor allebei stuurt de
 *    helft van de lezers de verkeerde kant op — de fout van QS8-268.
 *
 * ⚠️ **Los van `process.env` en los van psql, zodat hij te toetsen is** zonder
 *    een database en zonder de omgeving te verbouwen. De schil eronder doet
 *    alleen het aanroepen en het formuleren.
 */
export function stackOordeel(uitkomst: string | null, rlsDoel: string | undefined): Stackoordeel {
  // QS8-702: een productierun meet het échte project via REST; de lokale
  // database zegt daar niets over, dus psql-delen slaan zich over.
  if (rlsDoel === 'productie') return 'overslaan';
  if (uitkomst === '1') return 'meten';
  if (rlsDoel === undefined) return 'overslaan';
  return uitkomst === null ? 'geen-verbinding' : 'schema-loopt-achter';
}

/**
 * Draait de stack, en kent hij het object waar dit bestand over gaat?
 *
 * `proef` is een query die precies `'1'` teruggeeft zodra het schema er is —
 * bijvoorbeeld het bestaan van één functie of één bucket.
 *
 * `bron` is `import.meta.url` van de aanroeper. Dat is met opzet geen
 * bestandsnaam als tekst: een pad dat je overtypt, verhuist niet mee.
 *
 * ⚠️ **Deze functie werpt, en dat is de hele bedoeling.** Hij geeft alleen
 *    `false` terug als niemand beweerde te meten. De regel zelf staat in
 *    `stackOordeel()` hierboven; hier staat alleen wat je er dan van merkt.
 */
export function stackBeschikbaarOfFaal(proef: string, bron: string): boolean {
  // ⚠️ Buiten de `try` hieronder, met opzet: die vangt elke fout en noemt hem
  //    "geen database". Een geweigerde host is iets anders, en een melding met
  //    de verkeerde oorzaak is de klasse van QS8-268 (QS8-703).
  //    En "geen verbinding" bij het meten is hier de enige plek waar dat een
  //    uitkomst is: dan draait de proef niet meer, en meldt het oordeel hieronder
  //    "geen database" of "overslaan" (QS8-715).
  eisLokaalDoel();
  const meting = eisBestemming();

  let uitkomst: string | null = null;
  let fout: unknown = new Error('psql: geen verbinding (exitcode 2 bij het meten van de bestemming)');
  if (meting === 'gemeten') {
    fout = null;
    try {
      uitkomst = psql(proef);
    } catch (opgevangen) {
      fout = opgevangen;
    }
  }

  const oordeel = stackOordeel(uitkomst, process.env.RLS_DOEL);
  if (oordeel === 'meten') return true;
  if (oordeel === 'overslaan') return false;

  const waar = `${PSQL_OMGEVING.PGHOST}:${PSQL_OMGEVING.PGPORT}/${PSQL_DB}`;
  const staart = 'Stil overslaan zou hier als groen tellen.';

  if (oordeel === 'geen-verbinding') {
    const eerste = fout instanceof Error ? (fout.message.split('\n')[0] ?? '') : String(fout);
    throw new Error(
      `${kortPad(bron)}: geen database op ${waar}, terwijl RLS_DOEL op ` +
        `"${process.env.RLS_DOEL}" staat. Start de stack met \`npm run rls:stack\`. ` +
        `${staart}\n\npsql zei: ${eerste}`,
    );
  }

  throw new Error(
    `${kortPad(bron)}: de database op ${waar} antwoordt wél, maar kent niet wat dit ` +
      'bestand toetst — het schema loopt waarschijnlijk achter op de migraties. ' +
      `Bouw hem opnieuw op met \`npm run rls:stack\`. ${staart}\n\n` +
      `De proef gaf "${uitkomst}" in plaats van "1": ${proef}`,
  );
}

/** `tests/rls/groepspin.test.ts` uit een `file://`-URL. */
function kortPad(bron: string): string {
  const pad = fileURLToPath(bron).replace(/\\/g, '/');
  const vanaf = pad.indexOf('/tests/');
  return vanaf === -1 ? pad : pad.slice(vanaf + 1);
}
