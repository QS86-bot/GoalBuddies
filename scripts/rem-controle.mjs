#!/usr/bin/env node
/**
 * Draagt elke tabel die een client kan volschrijven een rem? — QS8-522.
 *
 * ⚠️⚠️ **Waarom dit bestaat, en waarom het geen negentiende rem is maar een
 *    controle.** 0200 legde uit waaróm een rem nodig is: een geweigerde
 *    bulk-insert schrijft de rijen eerst en gooit ze daarna weg. 📏 Gemeten in
 *    die migratie: 50.000 geweigerde doelen lieten `goals` met **9,6 MB**
 *    groeien terwijl er nul rijen bleven staan, en die ruimte komt pas terug bij
 *    een `vacuum full`. Op een gratis tier van 500 MB zonder automatische
 *    backups vult dat de schijf, en bij een volle schijf stopt Postgres met
 *    schrijven — voor iedereen.
 *
 *    Die rems zijn er inmiddels: 📏 **achttien**, met de hand bij elkaar
 *    gesprokkeld over 0200, 0207, 0214 en verder, en op 17-09-2026 dekten ze
 *    élke tabel waar `authenticated` op mag INSERTen — **nul** uitzonderingen.
 *    Wat er niet was, is iets dat rood wordt zodra er een negentiende tabel bij
 *    komt. Dat is de vorm die CLAUDE.md bij QS8-417 benoemt: *een reparatie die
 *    de instanties opruimt en het mechanisme laat staan, groeit terug — en hij
 *    doet dat onder een rij die "opgelost" zegt.*
 *
 * ⚠️ **Hij toetst ook de vórm, niet alleen het bestaan.** 📏 Achttien van de
 *    achttien vuren op `<naam>_plafond() * 2`: de rem is een noodgrens op twee
 *    keer de bedrijfsregel, en de dagteller doet de rest. Een rem die op iets
 *    anders staat is een besluit en geen detail, en hoort met zijn meting in
 *    `ZONDER_REM` of in `AFWIJKENDE_GRENS`. Zonder die tak verschuift de
 *    standaard zonder dat iemand hem verschuift.
 *
 * ⚠️⚠️ **Wat hij níet belooft: dat de rem de schrijfactie ook echt klein maakt.**
 *    📏 Gemeten op 17-09-2026 tegen `daily_moves`, 1000 rijen van 2000
 *    onsamendrukbare tekens: de tabel groeide van 376 kB naar 3272 kB en er
 *    bleef geen rij staan. De rem zweeg — zijn grens ligt op 1000 en de batch
 *    wás er 1000 — en de weigering kwam van de dagteller, ná het schrijven. De
 *    rem begrenst het schrijven op `2 × plafond`; hij maakt het niet goedkoop.
 *    Dat is het ontwerp en niet een defect, en het staat in rij 605 van
 *    `docs/ENGINEER-REVIEW.md`.
 *
 * ⚠️⚠️ **`has_table_privilege` is hier het verkeerde gereedschap, en dat heeft
 *    deze controle bijna gekost.** De eerste versie vroeg ernaar en meldde
 *    *"0 van de 0 beschrijfbare tabellen"* — met exitcode 0. 📏 De reden: dit
 *    project trekt tabelbrede rechten met opzet in en geeft kolommen terug
 *    (0236), dus `daily_moves` draagt `authenticated=rx` op tabelniveau en
 *    tóch een INSERT-recht op elke kolom. `has_table_privilege` is dan `false`
 *    en `has_any_column_privilege` `true`: **22** tabellen in plaats van nul.
 *    Zelfde familie als QS8-334, waar een `grant … to public` onder
 *    `grantee='PUBLIC'` wegviel uit een join.
 *
 * ⚠️⚠️ **En een kolomrecht alleen maakt een tabel nog niet beschrijfbaar.** 📏
 *    Vijf van de zeven tabellen zonder rem dragen `groups_insert` en verwanten
 *    met `with check (false)`: de grant staat er, de policy laat niets door, en
 *    het schrijven loopt via een definer-RPC. Ze meetellen zou vijf vrijbrieven
 *    in het register zetten die niets bewaken — en een register dat vol staat
 *    met redenen die niemand nodig heeft, leest niemand meer.
 *
 * ⚠️ Draait tegen een opgebouwde database, want triggers, grants én policies
 *    staan niet in de code. Zelfde patroon en dezelfde reden als
 *    `klokgrens-controle.mjs`.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

/**
 * Tabellen die `authenticated` mag vullen en die terecht géén rem dragen.
 *
 * ⚠️ Een reden en geen vinkje, en de reden hoort een **meting** te noemen: hoe
 *    groot is het ergste geweigerde verzoek op deze tabel. Wie hier een naam
 *    neerzet zonder dat, heeft de controle beantwoord in plaats van de vraag.
 *
 * ⚠️⚠️ **Deze twee zijn begrensd door iets anders, en juist dáárom staan ze
 *    hier.** Een unieke sleutel of een CHECK weigert per rij, net als een rem —
 *    maar niemand heeft hem daarvoor gebouwd. Verdwijnt die sleutel ooit bij een
 *    productwijziging, dan valt de bodem weg zonder dat er iets rood wordt. Dat
 *    is wat een register hoort vast te houden.
 *
 * @type {Record<string, string>}
 */
export const ZONDER_REM = {
  week_reviews:
    'Begrensd door `week_reviews_one_per_period` (uniek op groep, gebruiker, periode). ' +
    'Die index weigert al bij de twééde rij, dus een verzoek kan er geen stapel in ' +
    'schrijven. 📏 Gemeten 17-09-2026: een poging van 5000 rijen van 3×2000 ' +
    'onsamendrukbare tekens liet de tabel van 88 kB naar 144 kB groeien — twee rijen, ' +
    'geen vijfduizend — en eindigde op 23505. ⚠️ Verdwijnt die unieke sleutel ' +
    '(meerdere terugblikken per periode), dan is dit de eerste tabel die een rem nodig heeft.',
  hero_profiles:
    'Begrensd door `hero_profiles_source_geldig` (CHECK op `source`) en de primaire ' +
    'sleutel op `user_id` — één rij per gebruiker. 📏 Gemeten 17-09-2026: een poging ' +
    'van 5000 rijen weigerde op rij 1 met 23514 en liet de tabel op 32 kB staan. ' +
    '⚠️ Wordt `source` ooit vrije tekst zonder CHECK, dan valt de eerste grendel weg ' +
    'en blijft alleen de primaire sleutel over.',
};

/**
 * Rems die bewust op een andere grens staan dan `<naam>_plafond() * 2`.
 *
 * ⚠️ Ook hier een meting en geen mening. De standaardvorm is niet heilig, maar
 *    een afwijking die niemand opschrijft is geen besluit maar een slordigheid.
 *
 * @type {Record<string, string>}
 */
export const AFWIJKENDE_GRENS = {};

/** De vorm waar achttien van de achttien op stonden toen deze controle er kwam. */
const STANDAARDGRENS = /^([a-z_]+)_plafond\(\) \* 2$/;

/**
 * Eén regel per tabel die `authenticated` mag vullen, met de rem erachter.
 *
 * ⚠️ `has_any_column_privilege` en geen `has_table_privilege`: zie de kop. En
 *    geen join op `grantee` — een `grant … to public` bereikt élke rol maar
 *    staat geboekt onder `PUBLIC`, en dan mist een join precies de tabel die
 *    voor iedereen openstaat. Dat is de les van QS8-334.
 *
 * ⚠️ De policy-eis erbij: een kolomgrant zonder INSERT-policy, of met
 *    `with check (false)`, is geen beschrijfbare tabel. Zie de kop.
 *
 * ⚠️ `tgisinternal` eruit: de constraint-triggers van een foreign key heten niet
 *    `*_rem`, maar de filter hoort er toch te staan — anders is het toeval dat
 *    de naam ze niet vangt.
 */
const VRAAG = `
select c.relname || '|' ||
       coalesce(p.proname, '') || '|' ||
       coalesce((regexp_match(pg_get_functiondef(p.oid), 'if v_n > (.+?) then'))[1], '')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_trigger t
  on t.tgrelid = c.oid and not t.tgisinternal and t.tgname like '%\\_rem'
left join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relkind = 'r'
  and has_any_column_privilege('authenticated', c.oid, 'INSERT')
  and exists (
    select 1 from pg_policy pol
    where pol.polrelid = c.oid
      and pol.polcmd in ('a', '*')
      and coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') <> 'false'
  )
order by 1;
`;

/**
 * De regels van `psql` naar een lijst.
 *
 * @param {string} uitvoer
 * @returns {{ tabel: string, rem: string, grens: string }[]}
 */
export function ontleed(uitvoer) {
  return uitvoer
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .map((r) => {
      const [tabel, rem, grens] = r.split('|');
      return { tabel, rem: rem ?? '', grens: grens ?? '' };
    });
}

/**
 * Wat er niet klopt. Lege lijsten zijn goed nieuws.
 *
 * @param {readonly { tabel: string, rem: string, grens: string }[]} rijen
 * @param {Record<string, string>} [zonderRem]
 * @param {Record<string, string>} [afwijkend]
 */
export function beoordeel(rijen, zonderRem = ZONDER_REM, afwijkend = AFWIJKENDE_GRENS) {
  // ⚠️⚠️ **Nul rijen is ongemeten en niet groen**, en dat is hier geen theorie:
  //    de eerste versie van dit script vroeg naar `has_table_privilege`, vond
  //    niets, en meldde `0 van de 0` met exitcode 0. Een controle die een lege
  //    verzameling voor een schone uitslag aanziet, bewaakt niets — dezelfde
  //    faalvorm als een `OVERGESLAGEN` die voor groen doorgaat.
  if (rijen.length === 0) {
    return { kaal: [], anders: [], verdwenen: [], leeg: true, totaal: 0, metRem: 0 };
  }
  const kaal = rijen.filter((r) => r.rem === '' && !(r.tabel in zonderRem));
  const anders = rijen.filter(
    (r) => r.rem !== '' && !STANDAARDGRENS.test(r.grens) && !(r.tabel in afwijkend),
  );
  const namen = new Set(rijen.map((r) => r.tabel));
  const metRem = new Set(rijen.filter((r) => r.rem !== '').map((r) => r.tabel));

  // ⚠️ Een register dat achterloopt geeft redenen voor iets dat er niet meer is,
  //    en bewaakt vanaf dat moment niets. Zelfde tak als in klokgrens-controle.
  const verdwenen = [
    ...Object.keys(zonderRem).filter((t) => !namen.has(t) || metRem.has(t)),
    ...Object.keys(afwijkend).filter(
      (t) => !metRem.has(t) || rijen.some((r) => r.tabel === t && STANDAARDGRENS.test(r.grens)),
    ),
  ];

  return { kaal, anders, verdwenen, leeg: false, totaal: rijen.length, metRem: metRem.size };
}

function lees() {
  return execFileSync('psql', psqlArgumenten(VRAAG), { encoding: 'utf8' });
}

/** @returns {number} De exitcode. */
export function hoofd() {
  let uitvoer;
  try {
    uitvoer = lees();
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'rem-controle',
        leest:
          'Deze controle leest `pg_trigger` en de grants van een opgebouwde database —\n' +
          'triggers en rechten staan niet in de code.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  const { kaal, anders, verdwenen, leeg, totaal, metRem } = beoordeel(ontleed(uitvoer));

  if (leeg) {
    console.error(
      '✗ rem-controle vond geen enkele beschrijfbare tabel, en dat kan niet kloppen.\n\n' +
        'Dit is geen schone uitslag maar een lege vraag. Kijk of de database het schema\n' +
        'van `supabase/migrations/` draagt, en of de vraag nog `has_any_column_privilege`\n' +
        'gebruikt: `has_table_privilege` is `false` zodra een tabelrecht is ingetrokken en\n' +
        'er kolomrechten voor in de plaats staan (0236), en dan vindt hij er nul.',
    );
    return 1;
  }

  if (kaal.length > 0) {
    console.error(`✗ ${kaal.length} tabel(len) die \`authenticated\` mag vullen zonder rem:\n`);
    for (const r of kaal) console.error(`    ${r.tabel}`);
    console.error(
      '\nZonder rem is het schrijfvolume van een geweigerd verzoek onbegrensd: de rijen\n' +
        'worden fysiek geschreven en daarna weggegooid, en die ruimte komt pas terug bij\n' +
        'een `vacuum full`. 📏 0200 mat 9,6 MB voor één geweigerde batch op `goals`.\n' +
        'Bouw een rem zoals in 0200, of zet de tabel mét een meting in ZONDER_REM in\n' +
        'scripts/rem-controle.mjs.',
    );
  }

  if (anders.length > 0) {
    console.error(`\n✗ ${anders.length} rem(men) op een andere grens dan \`plafond() * 2\`:\n`);
    for (const r of anders) console.error(`    ${r.tabel}  ${r.rem}  →  ${r.grens || '(niet te lezen)'}`);
    console.error(
      '\nAchttien van de achttien stonden op twee keer het dagplafond toen deze controle\n' +
        'er kwam. Een andere grens mag, maar dan is het een besluit: zet hem met zijn\n' +
        'meting in AFWIJKENDE_GRENS. Een standaard die per tabel verschuift zonder dat\n' +
        'iemand het besloten heeft, is geen standaard meer.',
    );
  }

  if (verdwenen.length > 0) {
    console.error(`\n✗ ${verdwenen.length} registerrij(en) dekken niets meer:\n`);
    for (const t of verdwenen) console.error(`    ${t}`);
    console.error(
      '\nGoed nieuws en toch rood: de tabel is weg of heeft alsnog een gewone rem. Een\n' +
        'vrijbrief die niemand nodig heeft, dekt straks iets anders af.',
    );
  }

  if (kaal.length > 0 || anders.length > 0 || verdwenen.length > 0) return 1;

  console.log(
    `rem-controle: ${metRem} van de ${totaal} beschrijfbare tabellen dragen een rem op ` +
      'twee keer hun dagplafond.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
