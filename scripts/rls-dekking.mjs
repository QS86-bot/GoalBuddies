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
 * ⚠️ **Hij verandert de database en zet hem daarna terug.** Draai hem uitsluitend
 *    tegen de lokale stack. Breekt hij halverwege af, dan staat er één policy nog
 *    open — de melding zegt welke, en opnieuw opbouwen met `npm run rls:stack`
 *    is altijd goed.
 *
 * Gebruik:
 *   npm run rls:dekking              alle policies
 *   npm run rls:dekking -- goals     alleen tabellen waarvan de naam dit bevat
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
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
         'wcheck', coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
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
    for (const veld of ['tabel', 'naam', 'cmd', 'qual', 'wcheck']) {
      if (typeof p?.[veld] !== 'string') {
        throw new Error(`policy zonder \`${veld}\`: ${JSON.stringify(p)}`);
      }
    }
  }

  return ruw;
}

/** De ALTER die deze policy wagenwijd openzet, of `null` als er niets te openen valt. */
export function verzwakSql(policy) {
  const stukken = [];
  if (policy.qual !== '') stukken.push('using (true)');
  if (policy.wcheck !== '') stukken.push('with check (true)');
  if (stukken.length === 0) return null;

  return `alter policy ${kwoot(policy.naam)} on public.${kwoot(policy.tabel)} ${stukken.join(' ')};`;
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
  if (uitkomst === 'rood') return { ...policy, status: 'bewaakt' };

  return {
    ...policy,
    status: 'onbewaakt',
    melding: 'wagenwijd opengezet en geen enkele test werd rood',
  };
}

function psql(sql) {
  const args = ['--quiet', '--no-psqlrc', '-At', '-d', process.env.DB ?? 'goalbuddies_rls', '-c', sql];
  if (process.env.PGHOST) args.unshift('-h', process.env.PGHOST);
  return execFileSync('psql', args, { encoding: 'utf8' });
}

function draai(bestanden) {
  const uit = spawnSync('npx', ['vitest', 'run', ...bestanden.map((b) => `tests/rls/${b}`)], {
    cwd: WORTEL,
    encoding: 'utf8',
    env: { ...process.env, RLS_DOEL: process.env.RLS_DOEL ?? 'lokaal' },
  });
  return uit.status === 0 ? 'groen' : 'rood';
}

function hoofd() {
  const filter = process.argv[2] ?? '';

  // ⚠️ **De `try` dekt alléén de aanroep en niet het ontleden.** De eerste versie
  //    deed dat wel, en meldde een échte parseerfout als "geen database" — dan
  //    lijkt een defect een overslag. Zelfde val als in `kolomrechten-controle`.
  let ruw;
  try {
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

  const policies = ontleedPolicies(ruw).filter((p) => p.tabel.includes(filter));

  const bestanden = readdirSync(TESTMAP)
    .filter((n) => n.endsWith('.test.ts'))
    .map((naam) => ({ naam, inhoud: readFileSync(join(TESTMAP, naam), 'utf8') }));

  console.log(`rls-dekking: ${policies.length} policies, elk apart opengezet.\n`);
  const bevindingen = [];

  for (const [i, policy] of policies.entries()) {
    const open = verzwakSql(policy);
    const terug = herstelSql(policy);
    const kop = `[${i + 1}/${policies.length}] ${policy.tabel}.${policy.naam}`;

    if (open === null || terug === null) {
      bevindingen.push(oordeel(policy, 'onverzwakbaar'));
      console.log(`  ·  ${kop} — geen uitdrukking om open te zetten`);
      continue;
    }

    psql(open);
    let uitkomst;
    try {
      uitkomst = draai(bestandenVoor(policy.tabel, bestanden));
    } finally {
      // ⚠️ Altijd terugzetten, ook als vitest omvalt. Blijft er tóch een policy
      //    open staan, dan zegt de melding hieronder welke.
      psql(terug);
    }

    const b = oordeel(policy, uitkomst);
    bevindingen.push(b);
    console.log(`  ${uitkomst === 'rood' ? '✓' : '✗'}  ${kop}${b.melding ? ` — ${b.melding}` : ''}`);
  }

  const onbewaakt = bevindingen.filter((b) => b.status === 'onbewaakt');
  console.log(
    `\n${bevindingen.filter((b) => b.status === 'bewaakt').length} van de ${policies.length} ` +
      'policies worden door minstens één test bewaakt.',
  );

  if (onbewaakt.length > 0) {
    console.log(`\n✗ ${onbewaakt.length} policy/policies die niemand mist:\n`);
    for (const b of onbewaakt) console.log(`    ${b.tabel}.${b.naam} (${b.cmd})`);
    console.log(
      '\nEen policy die je wagenwijd kunt openzetten zonder dat een test het merkt,\n' +
        'bewaakt niets. Schrijf er een test bij, of leg vast waarom hij niet te\n' +
        'toetsen is — zie QS8-185.',
    );
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
