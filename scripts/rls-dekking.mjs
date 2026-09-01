#!/usr/bin/env node
/**
 * Welke RLS-policy wordt door géén enkele test bewaakt? — QS8-185
 *
 * ⚠️ **Het issue zei dat dit niet te meten valt, en dat is precies de reden dat
 *    dit script bestaat.** De dossierrij van 15-08 vroeg welke tabellen nog
 *    ongedekt zijn, en het oordeel van 25-08 was: *"een oordeel over dekking en
 *    geen meetbare stand"*. Dat klopt voor de vraag "noemt een test deze tabel" —
 *    dat is een grep en die bewijst niets. Het klopt niet voor de vraag die
 *    ertoe doet:
 *
 *      **als ik deze policy wagenwijd openzet, wordt er dan iets rood?**
 *
 *    Dat is geen oordeel maar een meting, en het is dezelfde meting waarmee dit
 *    project elke andere grendel ijkt: mutatie per grendel. Een policy die je
 *    kunt slopen zonder dat één test het merkt, bewaakt niets — hoe vaak zijn
 *    tabel ook in de suite voorkomt.
 *
 * ⚠️ **Waarom `using (true)` en niet `drop policy`.** Droppen toetst of een test
 *    de tóégang mist; openzetten toetst of een test de wéigering mist. Dat
 *    tweede is de kant waar dit project op stukgaat — de vier routes naar een
 *    weggepoetste week, het lek in `weekly_goals_select`, de omweg van QS8-186.
 *    Een gedropte policy valt bovendien meteen op omdat de app niets meer kan;
 *    een te ruime policy valt nooit op.
 *
 * ⚠️ **Dit is een rapport en geen poortstap, en dat is met opzet.** Het draait
 *    tachtig keer een deel van de RLS-suite en kost minuten. Zet hem niet in
 *    `npm run poort`; draai hem als je wilt weten waar de suite gaten heeft, en
 *    maak van elke bevinding een test of een aantekening.
 *
 * ⚠️ **Hij weigert te draaien tegen iets anders dan de lokale stack.** Zie
 *    `magHierDraaien()`: lokale host, `RLS_DOEL=lokaal`, en de database moet
 *    `goalbuddies_rls` heten. De kop hieronder waarschuwde daar eerst alleen
 *    voor, en een waarschuwing is geen slot.
 *
 * ⚠️ **Hij verandert de database en zet hem daarna terug — en dat is bij de
 *    eerste echte run misgegaan.** Een `finally` helpt niet als het proces
 *    gedóód wordt: bij een afbreking op tien minuten bleef
 *    `group_members_insert_founder` op `with check (true)` staan, en de meting
 *    daarná draaide dus tegen een database met een gat erin. Die uitslag was
 *    onbruikbaar zonder dat er iets aan te zien was.
 *
 *    **Erger nog was hoe ik het bijna niet zag:** mijn controlevraag keek alleen
 *    naar `using`, niet naar `with check`, en meldde vrolijk "alles teruggezet".
 *    Een controle die de helft van zijn onderwerp niet kent, is geruststellender
 *    dan geen controle.
 *
 *    Daarom schrijft dit script vóór élke mutatie de oorspronkelijke definitie
 *    naar `.rls-dekking-herstel.json` en ruimt dat bestand pas op als alles
 *    terugstaat. Ligt het er bij de start nog, dan is een vorige run afgebroken
 *    en herstelt hij eerst — vóór hij iets meet.
 *
 * Gebruik:
 *   npm run rls:dekking              alle policies
 *   npm run rls:dekking -- goals     alleen tabellen waarvan de naam dit bevat
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTMAP = join(WORTEL, 'tests', 'rls');

/**
 * ⚠️ **JSON en geen `-At` met een scheidingsteken.** Een policy-uitdrukking is
 *    opgemaakte SQL: hij bevat nieuwe regels én pijpjes (`a OR b`, een `EXISTS`
 *    over drie regels). Een regelgebaseerde parser knipt daar middenin, en de
 *    eerste versie van dit script deed dat ook — met als eerste slachtoffer
 *    `approval_withdrawals_select`. Postgres kan het zelf serialiseren, dus laat
 *    hem dat doen.
 */
const VRAAG = `
select coalesce(json_agg(json_build_object(
         'tabel',  c.relname,
         'naam',   p.polname,
         'cmd',    p.polcmd,
         'qual',   coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
         'wcheck', coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
         'recht',  has_table_privilege('authenticated', c.oid,
                     case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                                   when 'w' then 'UPDATE' when 'd' then 'DELETE'
                                   else 'INSERT' end)
       ) order by c.relname, p.polname), '[]')
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public';
`;

/** Zet de JSON van `VRAAG` om in policies, en werpt op alles wat er niet op lijkt. */
export function ontleedPolicies(uitvoer) {
  const ruw = JSON.parse(uitvoer);
  if (!Array.isArray(ruw)) throw new Error('de policyquery gaf geen lijst terug');

  for (const p of ruw) {
    if (typeof p?.recht !== 'boolean') throw new Error(`policy zonder \`recht\`: ${JSON.stringify(p)}`);
    for (const veld of ['tabel', 'naam', 'cmd', 'qual', 'wcheck']) {
      if (typeof p?.[veld] !== 'string') {
        throw new Error(`policy zonder \`${veld}\`: ${JSON.stringify(p)}`);
      }
    }
  }

  return ruw;
}

/** De ALTER die deze policy wagenwijd openzet, of `null` als er niets te openen valt. */
export function verzwakSql(policy, helft) {
  const stukken = [];
  if (policy.qual !== '' && helft !== 'check') stukken.push('using (true)');
  if (policy.wcheck !== '' && helft !== 'using') stukken.push('with check (true)');
  if (stukken.length === 0) return null;

  return `alter policy ${kwoot(policy.naam)} on public.${kwoot(policy.tabel)} ${stukken.join(' ')};`;
}

/**
 * De helften die deze policy los te meten heeft.
 *
 * ⚠️ **Twee clausules zijn twee grendels, en die verdienen twee metingen.** De
 *    eerste versie opende `using` en `with check` tegelijk, en bij een
 *    `ALL`-policy waren dat vier opdrachten in één keer. "Bewaakt" betekende daar
 *    dus: mínstens één van de twee — `milestones_write` kon op INSERT gedekt zijn
 *    en op DELETE niet, en de uitslag zei "bewaakt". Dat is de geruststellende
 *    richting, en het kost één extra ronde per policy om het goed te doen.
 */
export function helftenVan(policy) {
  const uit = [];
  if (policy.qual !== '') uit.push('using');
  if (policy.wcheck !== '') uit.push('check');
  return uit;
}

/** De ALTER die hem terugzet zoals hij was. */
export function herstelSql(policy) {
  const stukken = [];
  if (policy.qual !== '') stukken.push(`using (${policy.qual})`);
  if (policy.wcheck !== '') stukken.push(`with check (${policy.wcheck})`);
  if (stukken.length === 0) return null;

  return `alter policy ${kwoot(policy.naam)} on public.${kwoot(policy.tabel)} ${stukken.join(' ')};`;
}

const kwoot = (naam) => `"${naam.replace(/"/g, '""')}"`;

/**
 * De testbestanden die deze tabel überhaupt noemen.
 *
 * ⚠️ **Een grep is hier wél goed genoeg, en dat is een ander gebruik dan de grep
 *    die dit script vervangt.** Hij bepaalt niet óf iets gedekt is — dat doet de
 *    mutatie. Hij beperkt alleen welke bestanden hoeven te draaien, en een
 *    bestand dat de tabelnaam nergens noemt kan er onmogelijk iets over
 *    beweren. Zit je ernaast, dan is de uitkomst "niemand merkt het" terwijl een
 *    ánder bestand het wél merkt — dus bij twijfel draait alles.
 */
export function bestandenVoor(tabel, bestanden) {
  const geraakt = bestanden.filter((b) => b.inhoud.includes(tabel));
  return geraakt.length > 0 ? geraakt.map((b) => b.naam) : bestanden.map((b) => b.naam);
}

/** Wat een meting betekent. */
export function oordeel(policy, uitkomst) {
  if (uitkomst === 'onverzwakbaar') {
    return { ...policy, status: 'geen-uitdrukking', melding: 'geen `using` en geen `with check`' };
  }
  // ⚠️ **Een policy waar `authenticated` het récht niet voor heeft, is niet
  //    onbewaakt maar onbewáákbaar langs deze weg.** Gemeten: met
  //    `chain_links_delete` op `using (true)` geeft een DELETE nog steeds
  //    `42501 permission denied for table` — de grendel is de grant, niet de
  //    policy. En díe grendel is wél getest, in `schrijfrechten.test.ts`.
  //
  //    Wie hier tóch een test bij schrijft, schrijft een test die niet kán falen
  //    (regel 18 vraag 3). Het instrument moet daar dus niet naartoe duwen.
  if (uitkomst === 'geen-recht') {
    return {
      ...policy,
      status: 'geen-recht',
      melding: '`authenticated` heeft dit recht niet — de grant is de grendel, niet de policy',
    };
  }

  // ⚠️ Geen oordeel is iets anders dan een gunstig oordeel — zie `leesUitkomst()`.
  if (uitkomst === 'onbruikbaar') {
    return { ...policy, status: 'ongemeten', melding: 'de testrun leverde geen bruikbare uitslag' };
  }
  if (uitkomst === 'rood') return { ...policy, status: 'bewaakt' };

  return {
    ...policy,
    status: 'onbewaakt',
    melding: 'wagenwijd opengezet en geen enkele test werd rood',
  };
}

const HERSTELBESTAND = join(WORTEL, '.rls-dekking-herstel.json');

/**
 * Weigert te draaien tegen iets anders dan de lokale stack.
 *
 * ⚠️ **Dit script zet policies wagenwijd open.** Op de lokale stack is dat een
 *    meting; op het echte project is het een gat in de beveiliging dat blijft
 *    staan zolang de run duurt — en langer als hij afbreekt. De kop waarschuwde
 *    daarvoor, en een waarschuwing is geen slot: `PGHOST` naar het echte project
 *    wijzen en `npm run rls:dekking` typen was genoeg.
 *
 * ⚠️ **De toets is bewust een allowlist en geen blocklist.** "Is dit niet
 *    productie" is niet te beantwoorden; "is dit onmiskenbaar mijn eigen
 *    machine" wel. Alles wat daar niet onder valt, gaat er niet doorheen —
 *    inclusief een hostnaam die je niet had verwacht.
 */
export function magHierDraaien({ host, poort, db, doel }) {
  if (doel !== 'lokaal') return { ok: false, reden: 'RLS_DOEL staat niet op `lokaal`' };

  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    return { ok: false, reden: `de host is \`${host}\` en dat is geen loopback-adres` };
  }
  if (poort !== '5433') {
    return { ok: false, reden: `de poort is \`${poort}\` en de lokale stack draait op 5433` };
  }

  // ⚠️ De naam van de échte database staat nergens in dit script, en dat hoort
  //    zo: hij hoeft alleen te weten welke naam hij wél mag muteren.
  if (db !== 'goalbuddies_rls') {
    return { ok: false, reden: `de database heet \`${db}\` en niet \`goalbuddies_rls\`` };
  }

  return { ok: true };
}

/**
 * Legt de uitkomst van `select …` naast wat we dáchten te verbinden.
 *
 * ⚠️ **Dit is wat van de allowlist een meting maakt.** `magHierDraaien()` toetst
 *    wat we van plan zijn; deze toetst waar we daadwerkelijk uitkwamen. Zonder
 *    deze tweede helft is de eerste een vrome wens: libpq kiest zijn bestemming
 *    óók uit `PGHOSTADDR`, `PGSERVICE` en `PGSERVICEFILE`, en die staan alle drie
 *    buiten elke lijst die je van tevoren kunt opschrijven.
 *
 *    Gemeten: `env -u PGHOST PGHOSTADDR=127.0.0.1 psql …` maakt een
 *    TCP-verbinding terwijl `PGHOST` niet bestaat. De eerste versie van dit slot
 *    zei daar `ok` op, en de ijking keurde die tak met zoveel woorden goed — dus
 *    de mutatie op de hosttoets werd rood terwijl de grendel die hij beweerde te
 *    bewaken er niet was.
 */
export function kloptDeBestemming({ adres, poort, database }) {
  if (!['127.0.0.1', '::1'].includes(adres)) {
    return { ok: false, reden: `de verbinding kwam uit op \`${adres}\` en dat is geen loopback` };
  }
  if (String(poort) !== '5433') {
    return { ok: false, reden: `de verbinding kwam uit op poort \`${poort}\`` };
  }
  if (database !== 'goalbuddies_rls') {
    return { ok: false, reden: `de verbinding kwam uit in \`${database}\`` };
  }

  return { ok: true };
}


/**
 * Zet terug wat een afgebroken run heeft laten liggen.
 *
 * ⚠️ **Dit gebeurt vóór de eerste meting en niet erna**, want een meting tegen
 *    een database met een openstaande policy is geen meting. Dat is precies wat
 *    er de eerste keer gebeurde, en het viel niet op omdat het resultaat er
 *    normaal uitzag.
 */
function herstelWatOpenstond() {
  if (!existsSync(HERSTELBESTAND)) return;

  const policy = JSON.parse(readFileSync(HERSTELBESTAND, 'utf8'));
  const sql = herstelSql(policy);
  console.log(
    `⚠ een vorige run is afgebroken bij ${policy.tabel}.${policy.naam} — eerst terugzetten.\n`,
  );
  if (sql !== null) psql(sql);
  rmSync(HERSTELBESTAND);
}

/**
 * De policies die wagenwijd openstaan, uit de lijst die de lus gaat gebruiken.
 *
 * ⚠️ **Dit werkt op de ingelezen lijst en niet op een verse query, en dat is de
 *    reparatie van een echte fout.** De eerste versie las de policies in, herstelde
 *    daarna pas wat een afgebroken run had laten liggen, en vroeg de database
 *    vervolgens of er nog iets openstond. Dat antwoord was dan "nee" — terwijl de
 *    lijst in het geheugen die ene policy nog steeds als `true` droeg. Aan het eind
 *    van zijn beurt zette de lus hem "terug" naar `true`, zonder spoor en zonder
 *    melding, en draaide de rest van de run tegen een database met een gat.
 *
 *    Precies het faalbeeld dat dit script beschrijft, in geruststellende richting,
 *    met een guard die er per constructie naast keek. Door de vraag op de
 *    ínlezing te stellen kan die twee nooit meer uit elkaar lopen.
 */
export function verdachtePolicies(policies) {
  return policies
    .filter((p) => p.qual === 'true' || p.wcheck === 'true')
    .map((p) => `${p.tabel}.${p.naam}`);
}

/**
 * Elke policy die wagenwijd openstaat, gevraagd aan de database.
 *
 * ⚠️ **Béide helften, en dat is de reparatie van de eerste versie.** Een
 *    INSERT-policy heeft alléén een `with check`; keek je daar niet naar, dan
 *    meldde deze controle "alles dicht" over precies het gat dat er lag.
 *
 * ⚠️ **Dit draait aan het éínd en niet aan het begin.** Vooraf is
 *    `verdachtePolicies()` de juiste vraag, want die kijkt naar de lijst die de
 *    lus gebruikt. Achteraf is déze de juiste: heeft deze run de database
 *    achtergelaten zoals hij hem vond? Dat is wat er de eerste keer misging, en
 *    het bleef onopgemerkt omdat niemand het vroeg.
 */
function watOpenstaat() {
  return psql(`
    select c.relname || '.' || p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (pg_get_expr(p.polqual, p.polrelid) = 'true'
        or pg_get_expr(p.polwithcheck, p.polrelid) = 'true');
  `)
    .split('\n')
    .filter((r) => r.trim().length > 0);
}

/**
 * ⚠️ **Alles expliciet, en de omgeving geschoond.** Laat je één van host, poort,
 *    gebruiker of database aan libpq over, dan kan die hem uit `PGHOSTADDR`,
 *    `PGSERVICE`, `PGSERVICEFILE` of `~/.pg_service.conf` halen — allemaal buiten
 *    het zicht van `magHierDraaien()`. `PGOPTIONS` gaat er ook uit, want dat kan
 *    de `search_path` verzetten en daarmee wat `pg_get_expr()` teruggeeft.
 */
const BESTEMMING = {
  host: process.env.PGHOST || 'localhost',
  poort: process.env.PGPORT ?? '5433',
  gebruiker: process.env.PGUSER ?? 'postgres',
  db: process.env.DB ?? 'goalbuddies_rls',
};

function psql(sql) {
  const schoon = { ...process.env };
  for (const naam of [
    'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER',
    'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS',
  ]) {
    delete schoon[naam];
  }

  return execFileSync(
    'psql',
    [
      '--quiet', '--no-psqlrc', '-At',
      '-h', BESTEMMING.host,
      '-p', BESTEMMING.poort,
      '-U', BESTEMMING.gebruiker,
      '-d', BESTEMMING.db,
      '-v', 'ON_ERROR_STOP=1',
      '-c', sql,
    ],
    { encoding: 'utf8', env: schoon, timeout: 60_000 },
  );
}

/**
 * Leest uit de JSON van vitest wat er écht gebeurd is.
 *
 * ⚠️ **De exitcode is hier niet genoeg, en dat gaat de geruststellende kant op.**
 *    De eerste versie las élke niet-nul afloop als "bewaakt". Maar vitest geeft
 *    ook niet-nul bij een startup-error, een dichte PostgREST, een `npx` die
 *    hapert, of geheugen op — en dan telt een policy als beschermd zonder dat er
 *    één assertie gedraaid heeft. Over een run van meer dan een uur is dat geen
 *    randgeval, en elke keer dat het gebeurt schuift een policy van "onbewaakt"
 *    naar "bewaakt".
 *
 *    Daarom is "bewaakt" nu: **er zijn tests gedraaid én er is er minstens één
 *    gefaald.** Draaide er niets, dan is de uitkomst `onbruikbaar` en dat is geen
 *    oordeel maar een reden om te stoppen.
 */
export function leesUitkomst(json) {
  let uit;
  try {
    uit = JSON.parse(json);
  } catch {
    return { uitkomst: 'onbruikbaar', reden: 'vitest gaf geen leesbare JSON' };
  }

  const gedraaid = (uit.numTotalTests ?? 0) - (uit.numPendingTests ?? 0);
  if (gedraaid <= 0) return { uitkomst: 'onbruikbaar', reden: 'er is geen enkele test gedraaid' };

  return { uitkomst: (uit.numFailedTests ?? 0) > 0 ? 'rood' : 'groen', gedraaid };
}

function draai(bestanden) {
  const uit = spawnSync(
    'npx',
    ['vitest', 'run', '--reporter=json', ...bestanden.map((b) => `tests/rls/${b}`)],
    {
      cwd: WORTEL,
      encoding: 'utf8',
      env: { ...process.env, RLS_DOEL: process.env.RLS_DOEL ?? 'lokaal' },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60_000,
    },
  );

  // ⚠️ vitest zet zijn JSON tussen andere uitvoer; pak het buitenste object.
  const begin = (uit.stdout ?? '').indexOf('{');
  const eind = (uit.stdout ?? '').lastIndexOf('}');
  if (begin === -1 || eind <= begin) {
    return { uitkomst: 'onbruikbaar', reden: 'vitest gaf geen JSON terug' };
  }

  return leesUitkomst(uit.stdout.slice(begin, eind + 1));
}

function hoofd() {
  const filter = process.argv[2] ?? '';
  const mag = magHierDraaien({
    host: BESTEMMING.host,
    poort: BESTEMMING.poort,
    db: BESTEMMING.db,
    doel: process.env.RLS_DOEL,
  });
  if (!mag.ok) {
    console.error(
      `✗ rls-dekking weigert te draaien: ${mag.reden}.\n\n` +
        'Dit script zet elke policy om beurten wagenwijd open. Op de lokale stack is\n' +
        'dat een meting; ergens anders is het een gat dat blijft staan zolang de run\n' +
        'duurt — en langer als hij afbreekt.\n\n' +
        'Start de stack met `npm run rls:stack` en draai met RLS_DOEL=lokaal.',
    );
    return 1;
  }

  // ⚠️ **De `try` dekt alléén de aanroep en niet het ontleden.** De eerste versie
  //    deed dat wel, en meldde een échte parseerfout als "geen database" — dan
  //    lijkt een defect een overslag. Zelfde val als in `kolomrechten-controle`.
  // ⚠️ **Eerst herstellen, dán inlezen.** Andersom leest hij het gat in en zet
  //    het aan het eind van die beurt weer terug — zie `verdachtePolicies()`.
  // ⚠️ **Nameten waar we uitkwamen, en niet aannemen dat het gelukt is.**
  //    Zie `kloptDeBestemming()`.
  try {
    const [adres, poort, database] = psql(
      "select coalesce(host(inet_server_addr()), 'unix-socket'), inet_server_port(), current_database();",
    )
      .trim()
      .split('|');
    const echt = kloptDeBestemming({ adres, poort, database });
    if (!echt.ok) {
      console.error(`✗ rls-dekking weigert te draaien: ${echt.reden}.`);
      return 1;
    }
  } catch (fout) {
    console.error(
      '⚠ rls-dekking: OVERGESLAGEN — geen database om mee te verbinden.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  let ruw;
  try {
    herstelWatOpenstond();
    ruw = psql(VRAAG);
  } catch (fout) {
    console.error(
      '⚠ rls-dekking: OVERGESLAGEN — geen database om de policies uit te lezen.\n\n' +
        'Dit script muteert de database en hoort alleen tegen de lokale stack te draaien.\n' +
        'Start hem met `npm run rls:stack`.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  const alle = ontleedPolicies(ruw);
  const policies = alle.filter((p) => p.tabel.includes(filter));

  // ⚠️ **Nooit meten tegen een database die al openstaat.** Blijft hier iets
  //    over, dan is het niet van deze run en weet dit script niet wat de
  //    oorspronkelijke uitdrukking was — dan is opnieuw opbouwen het antwoord.
  //
  //    ⚠️ Over `alle` en niet over `policies`: een filter op tabelnaam mag niet
  //       bepalen of een gat elders in het schema meetelt. Dat gat beïnvloedt de
  //       tests van déze tabel net zo goed.
  const alOpen = verdachtePolicies(alle);
  if (alOpen.length > 0) {
    console.error(
      `✗ ${alOpen.length} policy/policies staan al wagenwijd open:\n\n` +
        alOpen.map((r) => `    ${r}`).join('\n') +
        '\n\nMeten tegen zo\'n database geeft een uitslag die er normaal uitziet en\n' +
        'niets waard is. Bouw de stack opnieuw op met `npm run rls:stack`.',
    );
    return 1;
  }

  const bestanden = readdirSync(TESTMAP)
    .filter((n) => n.endsWith('.test.ts'))
    .map((naam) => ({ naam, inhoud: readFileSync(join(TESTMAP, naam), 'utf8') }));

  console.log(`rls-dekking: ${policies.length} policies, elk apart opengezet.\n`);
  const bevindingen = [];

  for (const [i, policy] of policies.entries()) {
    const kop = `[${i + 1}/${policies.length}] ${policy.tabel}.${policy.naam}`;

    if (!policy.recht) {
      const b = oordeel(policy, 'geen-recht');
      bevindingen.push(b);
      console.log(`  ·  ${kop} — ${b.melding}`);
      continue;
    }

    const helften = helftenVan(policy);
    if (helften.length === 0) {
      bevindingen.push(oordeel(policy, 'onverzwakbaar'));
      console.log(`  ·  ${kop} — geen uitdrukking om open te zetten`);
      continue;
    }

    // ⚠️ **Per helft, en niet allebei tegelijk** — zie `helftenVan()`. Een policy
    //    heet pas bewaakt als élke helft afzonderlijk gemist wordt.
    for (const helft of helften) {
      const open = verzwakSql(policy, helft);
      const terug = herstelSql(policy);
      const label = helften.length > 1 ? `${kop} (${helft})` : kop;

      writeFileSync(HERSTELBESTAND, JSON.stringify(policy), 'utf8');
      psql(open);

      let uitslag;
      try {
        uitslag = draai(bestandenVoor(policy.tabel, bestanden));
      } finally {
        psql(terug);
        rmSync(HERSTELBESTAND, { force: true });
      }

      const b = { ...oordeel(policy, uitslag.uitkomst), helft };
      bevindingen.push(b);
      const teken = uitslag.uitkomst === 'rood' ? '✓' : uitslag.uitkomst === 'groen' ? '✗' : '·';
      console.log(`  ${teken}  ${label}${b.melding ? ` — ${b.melding}` : ''}`);
    }
  }

  // ⚠️ **Een run met ongemeten policies levert geen getal op.** Dat is de hele
  //    les van de besmette meting: een uitslag die er normaal uitziet en het niet
  //    is, is erger dan geen uitslag.
  const ongemeten = bevindingen.filter((b) => b.status === 'ongemeten');
  if (ongemeten.length > 0) {
    console.error(
      `\n✗ ${ongemeten.length} policy/policies leverden geen bruikbare uitslag:\n\n` +
        ongemeten.map((b) => `    ${b.tabel}.${b.naam}`).join('\n') +
        '\n\nEr is dan geen getal te noemen. Draai opnieuw.',
    );
    return 1;
  }

  // ⚠️ **De laatste vraag: is de database achtergelaten zoals hij gevonden is?**
  //    Bij de eerste echte run was het antwoord nee, en niemand vroeg het.
  const nogOpen = watOpenstaat();
  if (nogOpen.length > 0) {
    console.error(
      `\n✗ deze run heeft ${nogOpen.length} policy/policies laten openstaan:\n\n` +
        nogOpen.map((r) => `    ${r}`).join('\n') +
        '\n\nDat hoort niet te kunnen. Bouw de stack opnieuw op met `npm run rls:stack`\n' +
        'en vertrouw de uitslag hierboven niet.',
    );
    return 1;
  }

  const onbewaakt = bevindingen.filter((b) => b.status === 'onbewaakt');
  const gemeten = bevindingen.filter((b) => b.status === 'bewaakt' || b.status === 'onbewaakt');
  const zonderRecht = bevindingen.filter((b) => b.status === 'geen-recht');

  console.log(
    `\n${gemeten.filter((b) => b.status === 'bewaakt').length} van de ${gemeten.length} ` +
      'meetbare policy-helften worden door minstens één test bewaakt.',
  );
  if (zonderRecht.length > 0) {
    console.log(
      `${zonderRecht.length} policy/policies zijn langs deze weg niet te meten: ` +
        '`authenticated` heeft het recht niet, dus de grant is de grendel.',
    );
  }

  if (onbewaakt.length > 0) {
    console.log(`\n✗ ${onbewaakt.length} policy/policies die niemand mist:\n`);
    for (const b of onbewaakt) {
      console.log(`    ${b.tabel}.${b.naam} (${b.cmd}${b.helft ? `, ${b.helft}` : ''})`);
    }
    console.log(
      '\nEen policy die je wagenwijd kunt openzetten zonder dat een test het merkt,\n' +
        'bewaakt niets. Schrijf er een test bij, of leg vast waarom hij niet te\n' +
        'toetsen is — zie QS8-185.',
    );
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
