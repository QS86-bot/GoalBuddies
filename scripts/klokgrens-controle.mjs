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

/**
 * Elke `current_date` in het schema, met de reden waarom hij daar mag staan.
 *
 * De sleutel is `functie :: de regel waar hij in staat`, witruimte genormaliseerd.
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
    'group_overview :: p_period_start <= current_date + 1',
    'Zelfde bovengrens, zelfde reden. Bepaalt of `closed_this_period` überhaupt ' +
      'berekend wordt.',
  ],
  [
    'group_overview :: p_period_start >= current_date - 8',
    'Ondergrens van acht dagen — één periode plus een dag. De dag ís hier de speling.',
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
    'ketting_schakel :: if p_period_start > current_date + 1 or p_period_start < current_date - 35 then',
    'De grenscontrole uit de bevinding zelf, met de `+ 1` van 0037.',
  ],
  [
    'ketting_stand :: and current_date between b.starts_cycle and b.ends_cycle',
    '⚠️ Geen grens maar een peiling: ligt vandáág in de adempauze van dit lid? ' +
      '`starts_cycle`/`ends_cycle` staan in de persoonlijke cyclus van dát lid, ' +
      'dus de juiste vergelijking is per lid en niet in UTC. Een dag ernaast ' +
      'schuift een adempauze aan de rand een dag op, in beide richtingen. ' +
      'Bewust blijven staan: het echte antwoord vraagt een tijdzone per lid in ' +
      'deze query. Zie de rij van 25-08-2026 in docs/ENGINEER-REVIEW.md.',
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
  [
    'wikkel_commitments_af :: v_op_tijd := current_date <= v_doel.target_date + 1;',
    'De `+ 1` staat hier aan de andere kant van het `<=` en doet hetzelfde werk: ' +
      'een deadline is pas verstreken als hij dat in élke zone is. Domeinregel 5 ' +
      '— een straf gaat nooit een dag te vroeg lopen.',
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

/** Zet de uitvoer van `psql -At` om in sleutels. Leeg en dubbel gaan eruit. */
export function ontleed(uitvoer) {
  return uitvoer
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
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

  const voorkomens = ontleed(uitvoer);
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

if (import.meta.url === `file://${process.argv[1]}`) process.exit(hoofd());
