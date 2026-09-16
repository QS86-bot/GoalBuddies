#!/usr/bin/env node
/**
 * deleterecht-controle — een DELETE-grant zonder aanroeper is dood hout.
 *
 * ⚠️⚠️ **Waarom deze controle bestaat.** `kolomrechten-controle` kan de
 *    DELETE-klasse structureel niet zien, en dat is geen omissie maar een grens
 *    van het mechanisme: Postgres kent géén kolom-DELETE-privilege, dus er valt
 *    per kolom niets te vergelijken. De reviewrij van 08-09-2026 telde die
 *    klasse daarom met de **hand** — en concludeerde terecht dat er geen lek in
 *    zat.
 *
 *    📏 Diezelfde telling was op 16-09 achterhaald: zestien tabellen werden er
 *    zeventien, en de nieuwe (`hero_profiles`, uit 0264) was juist er één zonder
 *    aanroeper. **Een handtelling blijft niet waar.** Dat is wat hier
 *    geautomatiseerd wordt, niet de conclusie.
 *
 * ⚠️ **Waarom een DELETE-grant zonder aanroeper er toe doet.** 0197 mat het bij
 *    `daily_moves` en `goal_interviews`: met een DELETE ernaast is "bewerken"
 *    gewoon weghalen-en-opnieuw-invoegen, dus een UPDATE-revoke sluit de uitkomst
 *    niet. Een kolom die alleen een trigger mag zetten, is met een DELETE ernaast
 *    alsnog te verversen.
 *
 * ⚠️ **Wat "aanroeper" hier betekent, en waarom het er twee zijn.** Een tabel is
 *    in orde zodra er een client-`.delete()` op staat (dan is de grant in gebruik)
 *    óf een `security definer`-functie die eruit verwijdert (dan loopt het werk
 *    langs de functie en is de grant er niet voor nodig — maar hij hoort dan ook
 *    geen verrassing te zijn). 📏 `user_blocks` is precies dat tweede geval:
 *    geen `.delete()` in `src/`, wél `deblokkeer()`. Zonder die tweede helft zou
 *    deze controle hem onterecht melden, en een controle die onterecht meldt leer
 *    je uitzetten.
 *
 * ⚠️⚠️ **Drie dingen in de vraag die bij het meten fout gingen en hier dus
 *    uitgeschreven staan:**
 *
 *    1. `has_table_privilege()` en géén join op `grantee = 'authenticated'`.
 *       Een `grant ... to public` geldt voor élke rol maar staat in de view onder
 *       `grantee = 'PUBLIC'` — de les van QS8-334.
 *    2. `polcmd in ('d', '*')`. Een `FOR ALL`-policy dekt DELETE ook. 📏 Zonder
 *       de `*` lezen `milestones` en `week_reviews` als *"geen policy"* — precies
 *       de vorm die de reviewrij als "wordt zwaarder als" noemde — terwijl ze
 *       openstaan.
 *    3. `prokind = 'f'`. `pg_get_functiondef()` wérpt op een aggregaat
 *       (`"array_agg" is an aggregate function`) en neemt dan de hele vraag mee.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt ijken,
 *    kun je niet vertrouwen. `tests/scripts/deleterecht-controle.test.ts` biedt
 *    `beoordeel()` elke vorm los aan — de vormen die hij moet vinden én de vormen
 *    die hij met rust moet laten.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Tabellen waar een open DELETE-grant zonder aanroeper bewust blijft staan.
 *
 * ⚠️ Leeg, en dat hoort zo te blijven. Een rij hier is een besluit met een reden,
 *    geen plek om een melding te parkeren — zelfde bedoeling als `ZONDER_CI` en
 *    `ZONDER_PUSH`.
 */
export const ZONDER_AANROEPER = {};

/** De boom waarin een client-`.delete()` kan staan. */
export const BRONMAPPEN = ['src', 'app'];

export const VRAAG = `
select c.relname,
       case when not c.relrowsecurity then 'open'
            when count(p.polname) = 0 then 'dicht'
            when bool_and(coalesce(pg_get_expr(p.polqual, p.polrelid), 'true') = 'false') then 'dicht'
            else 'open' end,
       exists (
         select 1 from pg_proc f join pg_namespace fn on fn.oid = f.pronamespace
         where fn.nspname = 'public' and f.prokind = 'f'
           and pg_get_functiondef(f.oid) ~* ('delete[[:space:]]+from[[:space:]]+(public[.])?' || c.relname || '\\M')
       )
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid and p.polcmd in ('d','*')
where n.nspname = 'public' and c.relkind = 'r'
  and has_table_privilege('authenticated', c.oid, 'DELETE')
group by c.relname, c.relrowsecurity
order by c.relname;
`;

/**
 * Zet de uitvoer van `psql -At -F'|'` om in een tabellenlijst.
 *
 * ⚠️ Splitsen op `\r?\n` en niet op `\n`: psql schrijft op Windows `\r\n`, en dan
 *    plakt de `\r` aan het laatste veld. Zelfde reparatie als in
 *    `kolomrechten-controle`.
 */
export function ontleed(uitvoer) {
  const uit = [];
  for (const regel of uitvoer.split(/\r?\n/)) {
    if (regel.trim().length === 0) continue;
    const [tabel, stand, functie] = regel.split('|');
    uit.push({ tabel, open: stand === 'open', gewistDoorFunctie: functie === 't' });
  }
  return uit;
}

function bestanden(map) {
  if (!statSync(map, { throwIfNoEntry: false })?.isDirectory()) return [];
  const uit = [];
  for (const naam of readdirSync(map).sort()) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    else if (/\.tsx?$/.test(naam)) uit.push(pad);
  }
  return uit;
}

/**
 * De tabellen waar de client een `.delete()` op doet.
 *
 * ⚠️ Een venster ná `from('tabel')` en geen regex over het geheel:
 *    supabase-ketens lopen over meerdere regels, en `.delete()` staat zelden op
 *    dezelfde regel als de tabelnaam.
 *
 * ⚠️⚠️ **Het venster loopt tot de vólgende `.from(` en niet tot een vast aantal
 *    tekens.** 📏 Met een vast venster van 400 tekens pakte een `from('goals')`
 *    de `.delete()` van een kéten die er twee regels onder stond — dan leest een
 *    tabel als "heeft een aanroeper" terwijl die delete bij zijn buurman hoort,
 *    en meldt de controle hem nooit meer. Gevonden door de ijking en niet door
 *    het lezen van de code.
 */
export function clientWist(bron) {
  const uit = new Set();
  const start = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/g;
  const posities = [];
  let m;
  while ((m = start.exec(bron)) !== null) posities.push({ index: m.index, tabel: m[1] });

  for (let i = 0; i < posities.length; i += 1) {
    const eind = posities[i + 1]?.index ?? bron.length;
    if (/\.delete\(/.test(bron.slice(posities[i].index, eind))) uit.add(posities[i].tabel);
  }
  return uit;
}

/** De tabellen met een open DELETE-grant waar niets die grant gebruikt. */
export function beoordeel(tabellen, gewistDoorClient, register = ZONDER_AANROEPER) {
  return tabellen
    .filter((t) => t.open)
    .filter((t) => !t.gewistDoorFunctie)
    .filter((t) => !gewistDoorClient.has(t.tabel))
    .filter((t) => register[t.tabel] === undefined)
    .map((t) => t.tabel);
}

/** Registerrijen die niets meer dekken — anders dekken ze ooit stilletjes iets anders. */
export function verlopenRegels(tabellen, gewistDoorClient, register = ZONDER_AANROEPER) {
  const nodig = new Set(beoordeel(tabellen, gewistDoorClient, {}));
  return Object.keys(register).filter((t) => !nodig.has(t));
}

function hoofd() {
  let uitvoer;
  try {
    uitvoer = execFileSync('psql', psqlArgumenten(VRAAG), { encoding: 'utf8' });
  } catch (fout) {
    console.log(
      verbindingsmelding({
        naam: 'deleterecht-controle',
        leest: 'Deze controle leest `pg_class`, `pg_policy` en `pg_proc` en niet de\nmigratiebestanden.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  const tabellen = ontleed(uitvoer);
  const bron = BRONMAPPEN.flatMap((m) => bestanden(join(WORTEL, m)))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');
  const gewistDoorClient = clientWist(bron);

  const klachten = beoordeel(tabellen, gewistDoorClient);
  const verlopen = verlopenRegels(tabellen, gewistDoorClient);

  if (klachten.length > 0) {
    console.error(
      `✗ ${klachten.length} tabel(len) geven \`authenticated\` DELETE zonder dat iets\n` +
        'die grant gebruikt:\n',
    );
    for (const t of klachten) console.error(`    ${t}`);
    console.error(
      '\nEen grant zonder aanroeper is dood hout, en dood hout is hier niet\n' +
        'onschuldig: met een DELETE ernaast is "bewerken" gewoon weghalen en\n' +
        'opnieuw invoegen, dus een UPDATE-revoke sluit de uitkomst niet (0197).\n' +
        'Trek de grant in, of zet de tabel met een reden in ZONDER_AANROEPER.',
    );
  }

  if (verlopen.length > 0) {
    console.error(
      `\n✗ ${verlopen.length} rij(en) in ZONDER_AANROEPER dekken niets meer: ${verlopen.join(', ')}\n` +
        '  Haal ze weg — anders dekken ze ooit stilletjes een tabel die de grant\n' +
        '  wél zonder aanroeper heeft.',
    );
  }

  if (klachten.length + verlopen.length > 0) return 1;

  const open = tabellen.filter((t) => t.open).length;
  console.log(
    `deleterecht-controle: ${tabellen.length} tabellen geven \`authenticated\` DELETE, ` +
      `${tabellen.length - open} achter een dichte policy; elk van de ${open} openstaande ` +
      'heeft een aanroeper.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
