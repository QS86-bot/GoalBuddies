#!/usr/bin/env node
/**
 * klokgrens-controle — een register van elke `current_date` in het schema.
 *
 * ⚠️ **De bevinding van 19-08 en de meting van 25-08 spraken elkaar tegen, en de
 *    meting had ongelijk.** De bevinding zei: `current_date` als bovengrens
 *    breekt elke periodestart in de nacht, want `current_date` is de serverdatum
 *    in UTC en `groupPeriod()` rekent in de tijdzone van de groep. In
 *    Pacific/Auckland is een geldige periodestart twaalf uur lang één dag "in de
 *    toekomst". Gerepareerd in 0037 met `current_date + 1`. De meting van 25-08
 *    greep op `current_date` en zag de `+ 1` er niet naast staan; alle vier de
 *    grenscontroles dragen hem wél.
 *
 * ⚠️ **Wat er ontbrak was niet de reparatie maar de bewaking.** Een dertiende
 *    `current_date` erbij is geen rode test — er is niets kapot, er staat alleen
 *    een aanname in een grens waar niemand hem zoekt. Dat is exact de vorm die
 *    dit project vijf keer duur betaald heeft.
 *
 * Vandaar dit register. Elk voorkomen van `current_date` in een functie van
 * `public` staat hieronder met de reden waarom het daar mag staan. De controle
 * is **tweezijdig**, net als `levend-controle`:
 *
 *   - Een voorkomen dat hier niet staat, is rood. Schrijf op waarom het mag.
 *   - Een regel hier die in het schema niet meer bestaat, is óók rood. Anders
 *     verwordt het register tot een lijst met redenen voor code die weg is, en
 *     dan bewaakt hij niets meer.
 *
 * ⚠️ **De maat is niet "staat er `+ 1`" maar "welke kant valt de fout op".** Een
 *    lokale datum ligt altijd in `[current_date - 1, current_date + 1]`: geen
 *    enkele zone loopt meer dan een dag voor of achter op UTC. Een bovengrens
 *    op een dóór de gebruiker aangeleverde datum moet die dag dus meenemen; een
 *    ondergrens met vijf weken speling niet.
 *
 * Draait tegen een opgebouwde database — de lokale RLS-stack of het echte
 * project — want `pg_get_functiondef()` is de waarheid en een migratiebestand
 * niet (de les van 0084). Zie `docs/ENGINEER-REVIEW.md`, rij van 19-08-2026.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Elke `current_date` in het schema, met de reden waarom hij daar mag staan.
 *
 * De sleutel is `functie :: de regel waar hij in staat`, witruimte genormaliseerd.
 *
 * ⚠️ **Twee regels van `group_overview()` stonden hier tot 0120 en zijn weg.**
 *    Ze rekenden het kettingvenster in UTC terwijl een groep zijn eigen klok
 *    heeft; 0120 verving ze door `groepsdatum(gid)`. Dit register kijkt naar
 *    `current_date`, dus een grens op `groepsdatum()` valt er per definitie
 *    buiten — en dát is een blinde vlek die 0120 zelf gemaakt heeft. Wat hem
 *    vandaag afdekt is geen register maar een gedragstest:
 *    `tests/rls/kettingklok.test.ts` legt de grens op zes dagen vast in twee
 *    tijdzones, en wordt rood bij zeven net zo goed als bij acht.
 */
export const REGISTER = new Map([
  [
    'bewaak_week_review_periode :: if new.group_period_start > current_date + 1',
    'Bovengrens op een datum die de client aanlevert. De `+ 1` van 0037 is de dag ' +
      'die een zone vóór UTC kan lopen.',
  ],
  [
    'bewaak_week_review_periode :: or new.group_period_start < current_date - 35 then',
    'Ondergrens met vijf weken speling; een dag verschuiving valt daar ruim binnen.',
  ],
  [
    'herbereken_risico :: and w.cycle_start_date < current_date;',
    'Telt alleen cycli die al begonnen zijn. Een dag te streng betekent één week ' +
      'minder in het venster, en dus een lagere risicoschatting — de kant waarop ' +
      'de app niets beweert dat ze niet weet.',
  ],
  [
    'herbereken_risico :: v_venster_start := current_date - (c_venster * 7);',
    'Terugkijkvenster van hele weken; een dag verschuiving verandert de uitkomst niet.',
  ],
  [
    'herbereken_risico :: v_weken_over := greatest(0, floor((v_doel.target_date - current_date) / 7.0)::integer);',
    'Weken tot de streefdatum, naar beneden afgerond. Een dag scheelt hoogstens ' +
      'op de grens van een hele week, en dan naar de voorzichtige kant.',
  ],
  [
    'wikkel_commitments_af :: v_vandaag := coalesce(eigenaarsdatum(v_doel.owner_id), current_date);',
    '⚠️ Dit is de terugval en niet de grens. De grens is `eigenaarsdatum()` — de ' +
      'eigen datum van de eigenaar — en die staat er sinds 0134 juist om `current_date` ' +
      'hier wég te halen: in UTC gaf de `+ 1` de een nul respijtdagen en de ander twee. ' +
      '`current_date` blijft alleen staan voor het geval dat het profiel niet meer ' +
      'bestaat, en dan is het bewust de mildste kant: zou de null doorlopen, dan wordt ' +
      '`v_op_tijd` zelf null, gaat de `if` naar de `else`, en vervalt de beloning van ' +
      'iemand die niets verkeerd deed. Getoetst in tests/rls/respijtdag.test.ts, met ' +
      'twee zones die het hele etmaal dekken.',
  ],
  [
    'ketting_uit_weekafsluiting :: if new.group_period_start > current_date + 1',
    'Dezelfde bovengrens als in de trigger ernaast; die weigert de rij al, deze ' +
      'slaat alleen de schakel over.',
  ],
  [
    'ketting_uit_weekafsluiting :: or new.group_period_start < current_date - 35 then',
    'Ondergrens met vijf weken speling.',
  ],
]);

const VRAAG = `
select p.proname || ' :: ' || regexp_replace(trim(l), '\\s+', ' ', 'g')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace,
lateral unnest(string_to_array(pg_get_functiondef(p.oid), chr(10))) l
where n.nspname = 'public'
  and p.prokind = 'f'
  and l ilike '%current_date%'
order by 1;
`;

/**
 * Knipt een SQL-regel af bij zijn commentaar.
 *
 * ⚠️ **Zonder dit meldt de controle zijn eigen uitleg.** Migratie 0107 zette in
 *    `ketting_stand()` een regel commentaar die het woord `current_date`
 *    noemt om te vertéllen dat het daar wég is — en de controle las dat als een
 *    voorkomen zonder reden. Dezelfde vorm die `pin:controle` op 27-08 had, en
 *    dezelfde oplossing: de beslissing uit SQL halen en hier onder test zetten.
 *
 * ⚠️ **Een `--` binnen een tekenreeks is geen commentaar**, en dat is niet
 *    theoretisch: een foutmelding of een systeembericht mag een streepje
 *    bevatten. Vandaar dat dit de aanhalingstekens telt in plaats van op de
 *    eerste `--` te knippen. `''` binnen een tekenreeks is een ontsnapt
 *    aanhalingsteken en sluit hem dus niet.
 */
export function zonderCommentaar(regel) {
  let inTekst = false;

  for (let i = 0; i < regel.length; i += 1) {
    if (regel[i] === "'") {
      if (inTekst && regel[i + 1] === "'") {
        i += 1;
        continue;
      }
      inTekst = !inTekst;
      continue;
    }
    if (!inTekst && regel[i] === '-' && regel[i + 1] === '-') return regel.slice(0, i);
  }

  return regel;
}

/** Zet de uitvoer van `psql -At` om in sleutels. Leeg en dubbel gaan eruit. */
export function ontleed(uitvoer) {
  return uitvoer
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/**
 * Houdt alleen de sleutels over waar `current_date` buiten het commentaar staat.
 *
 * ⚠️ **Een eigen stap en niet ingebouwd in `ontleed()`.** Die is een ontleder en
 *    verder niets; er staat een test op dat hij elke regel doorlaat. Een filter
 *    dat zich in een ontleder verstopt, is het soort naad waar dit project vijf
 *    keer voor betaald heeft — en hier zou het betekenen dat je `ontleed()` niet
 *    meer los kunt ijken.
 *
 * ⚠️ De SQL-kant is een grove voorselectie: élke regel die het woord noemt, ook
 *    in commentaar. Hier valt af wat alleen daar stond.
 */
export function metEchteGrens(sleutels) {
  return sleutels.filter((s) => {
    const streep = s.indexOf(' :: ');
    const romp = streep === -1 ? s : s.slice(streep + 4);
    return /current_date/i.test(zonderCommentaar(romp));
  });
}

/**
 * Legt de gevonden voorkomens naast het register.
 *
 * @param voorkomens sleutels, zoals `ontleed()` ze levert — als parameter zodat
 *   deze controle te voeden is zonder een database.
 */
export function beoordeel(voorkomens, register = REGISTER) {
  const gezien = new Set(voorkomens);
  return {
    onbekend: voorkomens.filter((v) => !register.has(v)),
    verdwenen: [...register.keys()].filter((k) => !gezien.has(k)),
  };
}

function lees() {
  const db = process.env.DB ?? 'goalbuddies_rls';
  const args = ['--quiet', '--no-psqlrc', '-At', '-d', db, '-c', VRAAG];
  if (process.env.PGHOST) args.unshift('-h', process.env.PGHOST);
  return execFileSync('psql', args, { encoding: 'utf8' });
}

function hoofd() {
  let uitvoer;
  try {
    uitvoer = lees();
  } catch (fout) {
    console.error(
      `✗ Geen database om tegen te meten (${process.env.DB ?? 'goalbuddies_rls'}).\n\n` +
        'Deze controle leest `pg_get_functiondef()` en niet de migratiebestanden —\n' +
        'die laatste vertellen wat er ooit gedeployd is, niet wat er draait.\n' +
        'Start de lokale stack met `npm run rls:stack`.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  const voorkomens = metEchteGrens(ontleed(uitvoer));
  const { onbekend, verdwenen } = beoordeel(voorkomens);

  if (onbekend.length > 0) {
    console.error(`✗ ${onbekend.length} keer \`current_date\` zonder reden in het register:\n`);
    for (const v of onbekend) console.error(`    ${v}`);
    console.error(
      '\nEen lokale datum ligt altijd in [current_date - 1, current_date + 1]. Vraag je\n' +
        'bij elk van deze af welke kant de fout op valt: een bovengrens op een datum die\n' +
        'de client aanlevert heeft die dag nodig (`+ 1`, zoals 0037), een ondergrens met\n' +
        'weken speling niet. Zet daarna de regel én de reden in REGISTER in\n' +
        'scripts/klokgrens-controle.mjs.',
    );
    return 1;
  }

  if (verdwenen.length > 0) {
    console.error(`✗ ${verdwenen.length} regel(s) in het register bestaan niet meer:\n`);
    for (const v of verdwenen) console.error(`    ${v}`);
    console.error(
      '\nDat is goed nieuws en toch rood. Een register dat achterloopt, geeft redenen\n' +
        'voor code die weg is en bewaakt niets meer. Haal ze uit REGISTER.',
    );
    return 1;
  }

  console.log(
    `klokgrens-controle: ${voorkomens.length} keer \`current_date\`, allemaal met een reden.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
