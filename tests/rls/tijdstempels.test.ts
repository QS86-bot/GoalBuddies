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
      // ⚠️ De must-allow. `title` op een mijlpaal, `body` op een chatbericht en
      //    `did_text` op een weekafsluiting zijn wat de gebruiker zélf invult;
      //    die horen open te blijven.
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
          has_column_privilege('authenticated', 'public.chat_messages',  'body',       'UPDATE')::text || ' ' ||
          has_column_privilege('authenticated', 'public.week_reviews',   'did_text',   'INSERT')::text
      `);

      expect(uit.trim(), 'deze drie horen open te blijven').toBe('true true true');
    },
    TEST_TIMEOUT,
  );
});
