import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { PSQL_DB, PSQL_OMGEVING, psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een tijdelijke tabel mag geen enkele functie kunnen sturen — QS8-269.
 *
 * ⚠️ **De vondst.** `eigenaarsdatum()` en `groepsdatum()` draaiden met
 *    `search_path = public, pg_catalog`. Dat leest als "gepind en dus veilig",
 *    maar het is het tegenovergestelde van wat het lijkt: noemt een pad
 *    `pg_temp` niet, dan doorzoekt Postgres het tijdelijke schema **als eerste**
 *    voor relaties. Het staat dan impliciet vooraan in plaats van dat het er
 *    niet is.
 *
 *    Gemeten vóór 0156, in één psql-sessie:
 *
 *    ```
 *    zonder temp table: 2026-09-04
 *    met temp table:    2026-09-05
 *    ```
 *
 *    De `SECURITY DEFINER`-functie las de tabel van de aanvaller.
 *
 * ⚠️ **Waarom `groepsdatum()` de zwaarste van de twee was.** Die stuurt de policy
 *    `chain_links_select` — `group_period_start >= groepsdatum(group_id) - 6` —
 *    en dat is de zichtbaarheidsgrens van De Ketting. Wie die klok een dag
 *    verzet, verzet wat andere leden te zien krijgen. Domeinregel 7.
 *
 * ⚠️ **Vandaag was het geen open deur**, en dat staat er eerlijk bij: PostgREST
 *    biedt geen DDL, dus een aanvaller krijgt zijn `create temp table` er niet
 *    in. Dit bestand bewaakt defense-in-depth, geen gedicht lek.
 *
 * ## ⚠️ Waarom de schaduwrij een ONGELDIGE tijdzone draagt
 *
 * De eerste versie van dit bestand zette `Pacific/Kiritimati` in de tijdelijke
 * tabel en vergeleek de twee datums. **Dat was tien uur per dag loos groen**, en
 * dat is gemeten en niet bedacht: tussen 00:00 en 09:59 UTC wijzen UTC en
 * Kiritimati dezelfde dag aan, dus `schaduw === echt` hield ongeacht of de
 * schaduw werkte. De ijking gaf alleen "rood" omdat hij om 18:01 UTC gedraaid is.
 *
 * ⚠️ **Dat is exact de fout uit QS8-267**, diezelfde dag gerepareerd in
 *    `klokgrens.test.ts` en `epic8.test.ts`: twee klokken vergelijken die elkaar
 *    een deel van de dag overlappen. Hier stond hij opnieuw, in een test die over
 *    iets heel anders ging.
 *
 * De opstelling vergelijkt daarom geen datums meer. De schaduwrij draagt een
 * tijdzone die niet bestáát, dus een overschaduwde lezing **werpt** — op elk uur
 * van de dag, zonder van `now()` af te hangen. Geen lezing uit de schaduw
 * betekent een geldige datum; wél een lezing betekent een exception.
 *
 * ## Vier tests die verschillende dingen bewaken
 *
 * De eerste toetst het **gedrag**: overschaduwen werkt niet meer. De tweede
 * toetst de **klasse** via `definer_bewaking()`, zodat een vijfde functie zonder
 * `pg_temp` opvalt zonder dat iemand er een test bij schrijft. Alleen de tweede
 * blijft kloppen als er functies bijkomen; alleen de eerste bewijst dat de
 * afdwinging echt in de database zit en niet alleen in een catalogusvraag.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'eigenaarsdatum'",
  import.meta.url,
);

/**
 * Draait SQL in **één** psql-sessie, zodat een `create temp table` en de aanroep
 * erna hetzelfde tijdelijke schema delen.
 *
 * ⚠️ `psql()` uit `./psql-stack` gebruikt `-c` en dat is hier precies fout: elke
 *    aanroep is dan een eigen sessie, het tijdelijke schema is weg vóór de
 *    functie draait, en de test wordt groen zonder iets te hebben geprobeerd.
 *    Vandaar stdin, met de omgeving uit dezelfde module zodat het poortnummer
 *    nog steeds op één plek staat (QS8-270).
 */
function inEenSessie(sql: string): string {
  return execFileSync(
    'psql',
    ['-U', PSQL_OMGEVING.PGUSER as string, '-d', PSQL_DB, '-q', '-w', '-v', 'ON_ERROR_STOP=1', '-tA'],
    { env: PSQL_OMGEVING, encoding: 'utf8', input: sql },
  ).trim();
}

/** Zoals `inEenSessie`, maar geeft de foutmelding terug in plaats van te werpen. */
function inEenSessieOfFout(sql: string): { ok: true; uit: string } | { ok: false; fout: string } {
  try {
    return { ok: true, uit: inEenSessie(sql) };
  } catch (opgevangen) {
    const tekst = opgevangen instanceof Error ? opgevangen.message : String(opgevangen);
    return { ok: false, fout: tekst };
  }
}

/**
 * Een tijdzone die niet bestaat.
 *
 * ⚠️ Dit is het hart van de opstelling: `now() at time zone` wérpt hierop. Wordt
 *    de tijdelijke tabel gelezen, dan valt de aanroep om; wordt hij niet gelezen,
 *    dan komt er een gewone datum uit. Dat onderscheid hangt van geen enkele klok
 *    af.
 */
const ONBESTAANDE_ZONE = 'Nergens/Bestaat_Niet';

describe.skipIf(!beschikbaar)('een tijdelijke tabel stuurt geen enkele functie', () => {
  it(
    'laat `eigenaarsdatum()` de echte profielrij lezen, ook met een tijdelijke `profiles`',
    async () => {
      const uitkomst = inEenSessieOfFout(`
        begin;
        insert into auth.users (id, email, raw_user_meta_data)
          values ('9e1d0000-0000-4000-8000-000000000001', 'schaduw@voorbeeld.test', '{}'::jsonb);
        update profiles set tz = 'UTC'
          where id = '9e1d0000-0000-4000-8000-000000000001';

        create temp table profiles (id uuid, tz text);
        insert into profiles values
          ('9e1d0000-0000-4000-8000-000000000001', '${ONBESTAANDE_ZONE}');

        select 'datum=' || eigenaarsdatum('9e1d0000-0000-4000-8000-000000000001');
        rollback;
      `);

      // ⚠️ Wérpt de aanroep, dan is de tijdelijke tabel gelezen: die draagt een
      //    tijdzone die niet bestaat, en de échte rij staat op UTC.
      expect(
        uitkomst.ok,
        uitkomst.ok
          ? ''
          : 'de tijdelijke tabel `profiles` is gelezen — `eigenaarsdatum()` mist ' +
            `\`pg_temp\` achteraan in zijn zoekpad.\n\n${uitkomst.ok ? '' : uitkomst.fout}`,
      ).toBe(true);

      if (!uitkomst.ok) return;

      const datum = uitkomst.uit
        .split('\n')
        .map((r) => r.trim())
        .find((r) => r.startsWith('datum='))
        ?.slice('datum='.length);

      // ⚠️ En de must-see: er kwam écht een datum uit. Zonder deze helft zou een
      //    opstelling die per ongeluk niets aanroept ook slagen.
      expect(datum, `geen datum uit de opstelling: ${uitkomst.uit}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat `groepsdatum()` de echte groepsrij lezen, ook met een tijdelijke `groups`',
    async () => {
      // ⚠️ Aparte test en niet dezelfde opstelling: dit is een ándere functie met
      //    een eigen zoekpad, en hij stuurt een ándere grendel —
      //    `chain_links_select`, de zichtbaarheidsgrens van De Ketting. Eén
      //    assertie over twee functies zou niet zeggen welke van de twee lekt.
      const uitkomst = inEenSessieOfFout(`
        begin;
        insert into auth.users (id, email, raw_user_meta_data)
          values ('9e1d0000-0000-4000-8000-000000000002', 'schaduw2@voorbeeld.test', '{}'::jsonb);
        insert into groups (id, name, created_by, invite_code, tz)
          values ('9e1d0000-0000-4000-8000-00000000000a', 'Schaduwgroep',
                  '9e1d0000-0000-4000-8000-000000000002', 'SCHAD1', 'UTC');

        create temp table groups (id uuid, tz text);
        insert into groups values
          ('9e1d0000-0000-4000-8000-00000000000a', '${ONBESTAANDE_ZONE}');

        select 'datum=' || groepsdatum('9e1d0000-0000-4000-8000-00000000000a');
        rollback;
      `);

      expect(
        uitkomst.ok,
        uitkomst.ok
          ? ''
          : 'de tijdelijke tabel `groups` is gelezen — `groepsdatum()` mist ' +
            `\`pg_temp\` achteraan in zijn zoekpad.\n\n${uitkomst.ok ? '' : uitkomst.fout}`,
      ).toBe(true);

      if (!uitkomst.ok) return;

      const datum = uitkomst.uit
        .split('\n')
        .map((r) => r.trim())
        .find((r) => r.startsWith('datum='))
        ?.slice('datum='.length);

      expect(datum, `geen datum uit de opstelling: ${uitkomst.uit}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
    TEST_TIMEOUT,
  );

  it(
    'noemt elke functie in `public` waarvan het zoekpad `pg_temp` overslaat',
    async () => {
      // ⚠️ **Dit is de tak die morgen werkt.** De twee tests hierboven bewaken de
      //    twee functies die het misging; deze bewaakt de klásse. Komt er een
      //    vijfde bij met `search_path = public, pg_catalog`, dan valt hij hier
      //    op zonder dat iemand er een test bij hoeft te schrijven.
      //
      //    ⚠️ Gesteld tegen de **catalogus** en niet tegen `definer_bewaking()`:
      //    deze assertie moet ook kloppen als die functie er niet was. Dat maakt
      //    hem blind voor de bewaking zelf — daarvoor staat de test hieronder.
      const zonder = psql(`
        select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\\_path=%')
          and not exists (select 1 from unnest(p.proconfig) c where c like 'search\\_path=%pg\\_temp%')
      `);

      expect(zonder, `deze functies laten `.concat('`pg_temp`', ' vooraan staan')).toBe('');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Elke vorm los aangeboden, en de helft die met rust gelaten moet worden
   *    net zo goed.** `CLAUDE.md`: een controle die je niet kunt voeden, kun je
   *    niet ijken — en een controle die álles meldt, leer je negeren.
   *
   *    De rij `pg_temp, public, pg_catalog` is degene die de security-review
   *    vond: de eerste versie van deze tak toetste of de tékst `pg_temp` ergens
   *    voorkwam, en die vorm schaduwt aantoonbaar terwijl hij dat toetsje
   *    passeert. Het is bovendien de vorm die iemand schrijft die 0156 leest en
   *    denkt "ik moet `pg_temp` toevoegen".
   */
  const VORMEN: readonly { naam: string; pad: string; gemeld: boolean; waarom: string }[] = [
    { naam: 'vorm_goed', pad: 'public, pg_temp', gemeld: false, waarom: 'de bedoelde vorm' },
    {
      naam: 'vorm_leeg',
      pad: "''",
      gemeld: false,
      waarom: 'een leeg pad is de strengste stand die er is; alles moet dan gekwalificeerd',
    },
    {
      naam: 'vorm_vooraan',
      pad: 'pg_temp, public, pg_catalog',
      gemeld: true,
      waarom: 'pg_temp vooraan schaduwt precies zo hard als pg_temp weglaten',
    },
    {
      naam: 'vorm_solo',
      pad: 'pg_temp',
      gemeld: true,
      waarom: 'alles onkwalificeerd landt dan in het schema van de aanvaller',
    },
    {
      naam: 'vorm_zonder',
      pad: 'public, pg_catalog',
      gemeld: true,
      waarom: 'het oorspronkelijke geval van QS8-269',
    },
    {
      naam: 'vorm_lijkend',
      pad: 'public, mijn_pg_temp_schema',
      gemeld: true,
      waarom: 'een schemanaam die `pg_temp` bevat is geen pg_temp',
    },
  ];

  it.each(VORMEN)(
    'definer_bewaking() over `set search_path = $pad`: gemeld = $gemeld',
    async ({ naam, pad, gemeld, waarom }) => {
      // ⚠️ In een teruggedraaide transactie, dus er blijft niets van staan. Het
      //    schema uit `vorm_lijkend` maken we mee aan, anders weigert Postgres
      //    het pad niet — hij accepteert onbekende schema's stil, maar dan toetst
      //    deze rij iets anders dan hij zegt.
      const uit = inEenSessie(`
        begin;
        create schema if not exists mijn_pg_temp_schema;
        create function public.${naam}() returns integer
          language sql immutable
          set search_path = ${pad}
          as 'select 1';

        select 'gemeld=' || case when exists (
          select 1 from definer_bewaking()
          where naam = '${naam}' and bezwaar like 'pg_temp%'
        ) then 'ja' else 'nee' end;
        rollback;
      `);

      const gezien = uit
        .split('\n')
        .map((r) => r.trim())
        .find((r) => r.startsWith('gemeld='))
        ?.slice('gemeld='.length);

      expect(gezien, `${naam} (${pad}): ${waarom}`).toBe(gemeld ? 'ja' : 'nee');
    },
    TEST_TIMEOUT,
  );
});
