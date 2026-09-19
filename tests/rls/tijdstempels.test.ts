import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De client zet geen servertijdstempel — QS8-299, vervolg op QS8-295.
 *
 * ⚠️ **Waarom dit meer is dan netheid.** Elke teller en elk venster dat op een
 *    `created_at` rekent — een dagquotum, een bedenktijd, een wachtvenster — is
 *    te omzeilen zodra de client die kolom zelf mag meesturen. Bij QS8-295 was
 *    dat geen theorie: `weekly_plan_steps` stond óók in de UPDATE-grant, dus de
 *    limiet van 200 per dag bleef omzeilbaar met eerlijk invoegen en daarna
 *    terugdateren.
 *
 * ⚠️ **Het waren tabelbréde grants, en dat is de reden dat 0173 lang is.** Een
 *    `revoke insert(kolom)` doet niets tegen een `grant insert` op de hele
 *    tabel; de enige weg is de tabelgrant intrekken en per kolom teruggeven.
 *    📏 Gemeten vóór 0173: **33 grants over 19 tabellen**. Erna: nul.
 *
 * ## Twee tests, en ze bewaken verschillende dingen
 *
 * De eerste toetst de **klasse** via `tijdstempel_bewaking()` — die blijft
 * kloppen als er tabellen bijkomen, zonder dat iemand er een test bij schrijft.
 * De tweede toetst dat de reparatie de app niet gesloopt heeft: de kolommen die
 * de client wél hoort te schrijven, mag hij nog steeds schrijven.
 *
 * ⚠️ Zonder die tweede is "niemand mag dit meer" ook te halen met een tabel die
 *    voor niemand meer schrijfbaar is.
 *
 * ## De derde bewaakt waar de bewaking naar kíjkt — QS8-558
 *
 * ⚠️⚠️ **Tot 0292 selecteerde `tijdstempel_bewaking()` op `column_default like
 *    '%now()%'`, en dat is de spelling en niet de eigenschap.** 📏 Gemeten op een
 *    wegwerptabel: `CURRENT_TIMESTAMP`, `transaction_timestamp()`,
 *    `statement_timestamp()`, `clock_timestamp()` en een eigen `stable`-functie
 *    kwamen er alle vijf onveranderd langs.
 *
 *    En dat is geen randgeval: 📏 `select now() = transaction_timestamp()` geeft
 *    `t`. `now()` **ís** `transaction_timestamp()`, en `CURRENT_TIMESTAMP` is de
 *    SQL-standaardspelling van datzelfde. De bewaking meldde dan nul bezwaren
 *    omdat ze niet gekeken had.
 *
 * ⚠️ **Deze derde test kost vandaag niets en dat hoort erbij.** 📏 Alle 49
 *    serverklok-kolommen in dit schema spellen hem `now()`, dus de oude vorm gaf
 *    nul bezwaren en de nieuwe ook. Wat hij bewaakt is de spelling die nog
 *    niemand getypt heeft — en `0176` stelt `clock_timestamp()` als default in
 *    zijn eigen kop al voor, dus dat is geen verzonnen toekomst.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'tijdstempel_bewaking'",
  import.meta.url,
);

describe.skipIf(!beschikbaar)('de client zet geen servertijdstempel', () => {
  it(
    'laat geen enkele timestamptz met een now()-default in een client-grant staan',
    async () => {
      const uit = psql(
        "select coalesce(string_agg(tabel || '.' || kolom || ': ' || bezwaar, E'\\n'), '') from tijdstempel_bewaking()",
      );

      expect(uit.trim()).toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de kolommen die de client wél hoort te schrijven met rust',
    async () => {
      // ⚠️ De must-allow. `title` op een mijlpaal, `title` op een doel en
      //    `did_text` op een weekafsluiting zijn wat de gebruiker zélf invult;
      //    die horen open te blijven.
      //
      // ⚠️ **De UPDATE-helft was tot 08-09 `chat_messages.body`, en die is met
      //    0193 ingetrokken** (QS8-327): een chatbericht is niet meer te
      //    bewerken, dus die kolom is geen must-allow meer maar precies het
      //    tegenovergestelde. Vervangen door `goals.title`, dat wél een echt
      //    schrijfpad heeft — `src/modules/goals/api.ts:410` zet hem in de
      //    `update`-patch. Zonder een levende UPDATE-kolom hier zou een migratie
      //    die álle updaterechten intrekt gewoon groen staan, en dat is de reden
      //    dat deze helft bestaat.
      //
      // ⚠️ Hier stond eerst `week_reviews.id`, en die viel om — terecht: dat is
      //    één van de 23 kolommen zonder schrijfpad die 0173 níét meer uitdeelt.
      //    Een must-allow moet een kolom noemen die de gebruiker écht vult, niet
      //    een sleutel die de database zelf zet. Zonder
      //    deze helft zou een migratie die álles intrekt ook groen staan.
      //
      // ⚠️ **Hier staat met opzet géén assertie dat `created_at` dicht is**, ook
      //    al zou die hier logisch passen. Die hoort bij de test hierboven, en
      //    stond hier eerst wél — met als gevolg dat één mutatie (de tabelbrede
      //    grant terugzetten) béíde tests rood maakte. Dan isoleert deze test
      //    niets meer: hij zegt "de must-allow is gebroken" terwijl er iets
      //    anders aan de hand is. Mutatie per grendel, en dus assertie per
      //    grendel.
      const uit = psql(`
        select
          has_column_privilege('authenticated', 'public.milestones',     'title',      'INSERT')::text || ' ' ||
          has_column_privilege('authenticated', 'public.goals',          'title',      'UPDATE')::text || ' ' ||
          has_column_privilege('authenticated', 'public.week_reviews',   'did_text',   'INSERT')::text
      `);

      expect(uit.trim(), 'deze drie horen open te blijven').toBe('true true true');
    },
    TEST_TIMEOUT,
  );

  it(
    'herkent een serverklok ook als hij niet `now()` heet',
    async () => {
      // ⚠️ **De must-allow staat in dezelfde tabel en dat is met opzet.** Een
      //    bewaking die álle timestamptz-kolommen meldt, haalt de vijf gevallen
      //    hierboven ook — en leert je hem uitzetten. `constante` moet er
      //    dus juist níet uit komen.
      //
      // ⚠️⚠️ **De `grant` hieronder is overbodig en staat er met die reden.**
      //    Hier stond dat hij nodig was omdat de bewaking twee eisen stelt. Dat
      //    is onwaar en het is nagemeten: `pg_default_acl` geeft `authenticated`
      //    op élke nieuwe tabel in `public` al `arwdx`, dus een verse tabel is
      //    meteen schrijfbaar en de bewaking meldt hem ook zónder deze regel.
      //    Gevonden in de security-ronde op QS8-558. Hij blijft staan zodat de
      //    opstelling niet stil verandert als die standaardrechten ooit smaller
      //    worden — maar wie het oude commentaar geloofde, dacht dat een verse
      //    tabel dicht stond, en dat is de gevaarlijke kant.
      const uit = psql(`
        begin;
        create table public.proef_serverklok (
          via_now        timestamptz not null default now(),
          via_current    timestamptz not null default current_timestamp,
          via_transactie timestamptz not null default transaction_timestamp(),
          via_statement  timestamptz not null default statement_timestamp(),
          via_clock      timestamptz not null default clock_timestamp(),
          via_utc        timestamptz not null default timezone('utc', now()),
          constante      timestamptz not null default '2020-01-01T00:00:00Z'
        );
        grant insert on public.proef_serverklok to authenticated;
        select string_agg(distinct kolom, ' ' order by kolom)
          from tijdstempel_bewaking() where tabel = 'proef_serverklok';
        rollback;
      `);

      expect(
        uit.trim(),
        'een servertijdstempel onder een andere naam kwam er onveranderd langs',
      ).toBe('via_clock via_current via_now via_statement via_transactie via_utc');
    },
    TEST_TIMEOUT,
  );
});
