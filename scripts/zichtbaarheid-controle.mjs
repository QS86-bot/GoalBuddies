#!/usr/bin/env node
/**
 * zichtbaarheid-controle — wat gaat er in een open groep open?
 *
 * ⚠️ **Besluit A41 gaf een groep de keuze tussen beschermd en open, en de zin
 *    die de gebruiker daarbij leest somt op wat er dan zichtbaar wordt.** Die
 *    zin staat in de catalogus (`zichtbaarheid.open_uitleg` en
 *    `bevestiging.groep_openzetten.uitleg`); wat er werkelijk varieert staat in
 *    de database. Niets legde die twee naast elkaar, en dat is precies hoe die
 *    zin op 24-08-2026 een derde van de waarheid ging vertellen.
 *
 * ⚠️ **De bevinding van 25-08 zei dat een controle "een machineleesbare vorm van
 *    §6b" vraagt. Dat is naar de verkeerde bron gekeken.** Het beslisdocument is
 *    een beschrijving; de database is de waarheid. Wat op `groups.zichtbaarheid`
 *    varieert, is gewoon te tellen — en dan hoeft er aan dat document niets te
 *    veranderen.
 *
 * ⚠️ **Het register is tweezijdig en heeft twee soorten rijen.** Niet alles wat
 *    zichtbaarheid noemt is een oppervlak: de twee hulpfuncties zíjn het
 *    mechanisme, `zet_groepszichtbaarheid()` is de setter, `guard_group_update()`
 *    pint de kolom, en `create_group()` zet hem bij het aanmaken. Die staan hier
 *    met hun reden, zodat een níeuwe plek die zichtbaarheid noemt in geen van
 *    beide lijsten valt en dus opvalt.
 *
 * ⚠️ **De zoektocht gaat over de kolom én over de hulpfuncties, en dat is met
 *    opzet dubbel.** Een oppervlak dat rechtstreeks op `groups.zichtbaarheid`
 *    filtert zonder `lid_van_open_groep()` te gebruiken, is precies de valse
 *    negatief die `pin:controle` op 27-08 had — daar kostte één regex drie
 *    gemiste schrijfvormen.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * De oppervlakken die met opzet variëren op `groups.zichtbaarheid`, met wat de
 * gebruiker daarover leest.
 *
 * ⚠️ Vijf stuks, en alle vijf staan ze in `zichtbaarheid.open_uitleg` en in
 *    `bevestiging.groep_openzetten.uitleg`. Komt er een zesde bij, dan wordt
 *    deze controle rood — en dán is de vraag of die zin nog klopt, niet later.
 *
 * ⚠️ **Dat heeft op 01-09-2026 precies gewerkt en dat is het opschrijven waard.**
 *    Het klassement uit besluit A54 werd hier rood, en de melding wees naar de
 *    twee zinnen — die tot dat moment drie oppervlakken opsomden terwijl er vier
 *    waren en er een vijfde bij kwam. Zonder deze controle was de gebruiker de
 *    groep open blijven zetten op een zin die zijn punten niet noemde.
 */
export const OPPERVLAKKEN = new Map([
  [
    'policy:weekly_goals.weekly_goals_select',
    'De gemiste en doorgeschoven weken zelf (migratie 0077). Dit is het zwaarste ' +
      'oppervlak: het is de rij waar domeinregel 7 over gaat.',
  ],
  [
    'functie:group_overview',
    'Wie er in welke week meedeed en de laatste cyclus per lid (migratie 0078). ' +
      'Buiten een open groep geeft `closed_this_period` geen antwoord.',
  ],
  [
    'view:group_visible_streaks',
    'Elkaars beste reeks ooit (migratie 0078). Een view en geen policy, want RLS ' +
      'kan geen kolommen beperken.',
  ],
  [
    'policy:chain_links.chain_links_select',
    'De Ketting per lid (migratie 0079). De teller erboven blijft dicht — die is ' +
      'optellend en verraadt niemand (besluit A42).',
  ],
  [
    'functie:groep_klassement',
    'Het puntenklassement per lid (migratie 0141, besluit A54). Het vijfde ' +
      'oppervlak, en het eerste dat een besluit terúgdraait: punten stonden onder ' +
      'A42 in §6b als bewust dicht. Wat opengaat is het groepstotaal, niet het ' +
      'persoonlijke totaal en niet de deltas — en het kan niet dalen van een ' +
      'gemiste week, want `cycle_missed` draagt geen groep.',
  ],
]);

/**
 * Plekken die zichtbaarheid noemen zonder een oppervlak te zijn.
 *
 * ⚠️ Zonder deze lijst meldt de controle er zes en leert hij je zichzelf te
 *    negeren. Mét deze lijst is elke plek geclassificeerd, en dat is het punt:
 *    een nieuwe naam valt in geen van beide en komt bovendrijven.
 */
export const GEEN_OPPERVLAK = new Map([
  ['functie:lid_van_open_groep', 'De hulpfunctie zelf — dit ís het mechanisme.'],
  [
    'functie:deelt_open_groep_met_doel',
    'Dezelfde hulpfunctie voor de doelkant: deelt de kijker een open groep met dít ' +
      'doel? Ook mechanisme en geen oppervlak.',
  ],
  ['functie:zet_groepszichtbaarheid', 'De setter (0076). Zet de stand, leest niets van een lid.'],
  ['functie:guard_group_update', 'Pint de kolom vast; een client mag hem niet schrijven.'],
  ['functie:create_group', 'Zet de beginstand. Nieuwe groepen zijn beschermd.'],
  [
    'functie:invite_preview',
    'Geeft de stand van de gróep terug, niet iets over een lid — verantwoord in 0080: ' +
      'het is het feit dat iemand nodig heeft om te besluiten of hij meedoet.',
  ],
  [
    'functie:zet_groepsontdekbaarheid',
    'Leest `zichtbaarheid` om te wéigeren (QS8-231, migratie 0144): een open groep kan ' +
      'niet vindbaar zijn, want dan zouden onbekenden elkaars tegenslag zien. Hij geeft ' +
      'dus niets over een lid terug — hij gebruikt de stand als grens en niet als filter. ' +
      '⚠️ De grendel is de CHECK `groups_ontdekbaar_is_beschermd`; deze functie is de ' +
      'uitleg erbij, zodat een scherm een reden kan tonen in plaats van een 23514.',
  ],
]);

/**
 * Alles wat `groups.zichtbaarheid` of een van de open-groephulpfuncties noemt.
 *
 * ⚠️ Beide zoektermen, niet één. Zie de kop: op de kolom filteren zonder de
 *    helper is de valse negatief waar dit soort controle aan kapotgaat.
 */
const VRAAG = `
select 'functie:' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosrc like '%open_groep%' or p.prosrc like '%zichtbaarheid%')
union all
select 'policy:' || tablename || '.' || policyname
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || coalesce(with_check, '')) similar to '%(open\\_groep|zichtbaarheid)%'
union all
select 'view:' || viewname
from pg_views
where schemaname = 'public'
  and (definition like '%open_groep%' or definition like '%zichtbaarheid%')
order by 1;
`;

export function ontleed(uitvoer) {
  return uitvoer
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/**
 * Legt de gevonden plekken naast de twee registers — tweezijdig.
 *
 * `onbekend`  — noemt zichtbaarheid en staat in geen van beide lijsten.
 * `verdwenen` — staat in een register maar bestaat niet meer.
 */
export function beoordeel(gevonden, oppervlakken = OPPERVLAKKEN, geen = GEEN_OPPERVLAK) {
  const gezien = new Set(gevonden);
  const bekend = new Set([...oppervlakken.keys(), ...geen.keys()]);

  return {
    onbekend: gevonden.filter((p) => !bekend.has(p)),
    verdwenen: [...bekend].filter((p) => !gezien.has(p)),
  };
}

function psql(vraag) {
  const db = process.env.DB ?? 'goalbuddies_rls';
  const args = ['--quiet', '--no-psqlrc', '-At', '-d', db, '-c', vraag];
  if (process.env.PGHOST) args.unshift('-h', process.env.PGHOST);
  return execFileSync('psql', args, { encoding: 'utf8' });
}

function hoofd() {
  let gevonden;
  try {
    gevonden = ontleed(psql(VRAAG));
  } catch (fout) {
    console.error(
      '✗ Geen database om tegen te meten.\n\n' +
        'Deze controle leest `pg_proc`, `pg_policies` en `pg_views`, niet de\n' +
        'migratiebestanden. Start de lokale stack met `npm run rls:stack`.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  const { onbekend, verdwenen } = beoordeel(gevonden);

  if (onbekend.length > 0) {
    console.error(
      `✗ ${onbekend.length} plek(ken) noemen zichtbaarheid zonder classificatie:\n`,
    );
    for (const p of onbekend) console.error(`    ${p}`);
    console.error(
      '\nVarieert dit oppervlak wat een lid van een ánder ziet? Zet hem dan in\n' +
        'OPPERVLAKKEN — en lees `zichtbaarheid.open_uitleg` en\n' +
        '`bevestiging.groep_openzetten.uitleg` na: die zinnen sommen op wat er\n' +
        'opengaat, en met een vijfde oppervlak vertellen ze een deel van de\n' +
        'waarheid. Varieert hij niets, zet hem dan met de reden in GEEN_OPPERVLAK.',
    );
    return 1;
  }

  if (verdwenen.length > 0) {
    console.error(`✗ ${verdwenen.length} plek(ken) in het register bestaan niet meer:\n`);
    for (const p of verdwenen) console.error(`    ${p}`);
    console.error(
      '\nEen register dat achterloopt, geeft redenen voor code die weg is. Haal ze\n' +
        'eruit — en kijk of de toestemmingszin er nog een noemt die niet meer bestaat.',
    );
    return 1;
  }

  console.log(
    `zichtbaarheid-controle: ${OPPERVLAKKEN.size} oppervlakken variëren op ` +
      `\`groups.zichtbaarheid\`, en ${GEEN_OPPERVLAK.size} plekken noemen hem zonder er een te zijn.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
