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
 * ## Twee tests die verschillende dingen bewaken
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

describe.skipIf(!beschikbaar)('een tijdelijke tabel stuurt geen enkele functie', () => {
  it(
    'laat `eigenaarsdatum()` de echte profielrij lezen, ook met een tijdelijke `profiles`',
    async () => {
      // ⚠️ De twee zones liggen een etmaal uit elkaar, dus een overschaduwde
      //    lezing geeft aantoonbaar een ándere datum dan de echte. Zou de temp
      //    table dezelfde zone dragen, dan is "gelijk" geen bewijs.
      const uit = inEenSessie(`
        begin;
        insert into auth.users (id, email, raw_user_meta_data)
          values ('9e1d0000-0000-4000-8000-000000000001', 'schaduw@voorbeeld.test', '{}'::jsonb);
        update profiles set tz = 'UTC'
          where id = '9e1d0000-0000-4000-8000-000000000001';

        select 'echt=' || eigenaarsdatum('9e1d0000-0000-4000-8000-000000000001');

        create temp table profiles (id uuid, tz text);
        insert into profiles values ('9e1d0000-0000-4000-8000-000000000001', 'Pacific/Kiritimati');

        select 'schaduw=' || eigenaarsdatum('9e1d0000-0000-4000-8000-000000000001');
        rollback;
      `);

      const regels = uit.split('\n').map((r) => r.trim());
      const echt = regels.find((r) => r.startsWith('echt='))?.slice('echt='.length);
      const schaduw = regels.find((r) => r.startsWith('schaduw='))?.slice('schaduw='.length);

      // ⚠️ Eerst dat er íets uitkwam. Zou de functie niets teruggeven, dan is
      //    "de twee zijn gelijk" waar én leeg, en bewijst deze test niets.
      expect(echt, `geen datum uit de opstelling: ${uit}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(
        schaduw,
        'de tijdelijke tabel `profiles` heeft de echte overschaduwd — `eigenaarsdatum()` ' +
          'mist `pg_temp` in zijn zoekpad',
      ).toBe(echt);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat `groepsdatum()` de echte groepsrij lezen, ook met een tijdelijke `groups`',
    async () => {
      // ⚠️ Aparte test en niet dezelfde opstelling: dit is een ándere functie met
      //    een eigen zoekpad, en hij stuurt een ándere grendel — `chain_links_select`.
      //    Eén assertie over twee functies zou niet zeggen welke van de twee lekt.
      const uit = inEenSessie(`
        begin;
        insert into auth.users (id, email, raw_user_meta_data)
          values ('9e1d0000-0000-4000-8000-000000000002', 'schaduw2@voorbeeld.test', '{}'::jsonb);
        insert into groups (id, name, created_by, invite_code, tz)
          values ('9e1d0000-0000-4000-8000-00000000000a', 'Schaduwgroep',
                  '9e1d0000-0000-4000-8000-000000000002', 'SCHAD1', 'UTC');

        select 'echt=' || groepsdatum('9e1d0000-0000-4000-8000-00000000000a');

        create temp table groups (id uuid, tz text);
        insert into groups values ('9e1d0000-0000-4000-8000-00000000000a', 'Pacific/Kiritimati');

        select 'schaduw=' || groepsdatum('9e1d0000-0000-4000-8000-00000000000a');
        rollback;
      `);

      const regels = uit.split('\n').map((r) => r.trim());
      const echt = regels.find((r) => r.startsWith('echt='))?.slice('echt='.length);
      const schaduw = regels.find((r) => r.startsWith('schaduw='))?.slice('schaduw='.length);

      expect(echt, `geen datum uit de opstelling: ${uit}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(
        schaduw,
        'de tijdelijke tabel `groups` heeft de echte overschaduwd — `groepsdatum()` mist ' +
          '`pg_temp` in zijn zoekpad, en die functie stuurt de zichtbaarheidsgrens van ' +
          'De Ketting',
      ).toBe(echt);
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

  it(
    'laat `definer_bewaking()` een zoekpad zonder `pg_temp` ook echt melden',
    async () => {
      // ⚠️ **Zonder deze test bewaakt de derde tak van 0156 niets**, en dat is
      //    gemeten en niet bedacht: haal die tak uit `definer_bewaking()` en alle
      //    andere tests hier blijven groen. De catalogustest hierboven vraagt het
      //    de catalogus rechtstreeks en merkt er dus niets van.
      //
      //    Dit is de must-see erbij: een bewaking die nooit iets vindt is net zo
      //    groen als eentje die werkt. We voeren hem één geval en eisen dat hij
      //    het noemt — in een teruggedraaide transactie, dus er blijft niets van
      //    staan.
      const uit = inEenSessie(`
        begin;
        create function public.zoekpad_proef_qs8_269() returns integer
          language sql immutable
          set search_path = public, pg_catalog
          as 'select 1';

        select 'gemeld=' || coalesce(
          (select string_agg(bezwaar, ',') from definer_bewaking()
           where naam = 'zoekpad_proef_qs8_269'),
          'NIETS');
        rollback;
      `);

      const gemeld = uit
        .split('\n')
        .map((r) => r.trim())
        .find((r) => r.startsWith('gemeld='))
        ?.slice('gemeld='.length);

      expect(
        gemeld,
        'definer_bewaking() noemt een functie met een zoekpad zonder `pg_temp` niet — ' +
          'de derde tak uit 0156 is weg, en dan valt een vijfde geval stil binnen',
      ).toBe('zoekpad noemt pg_temp niet');
    },
    TEST_TIMEOUT,
  );
});
