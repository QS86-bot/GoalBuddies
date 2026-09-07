/**
 * QS8-337 — de bewakingen zien een `grant … to public`.
 *
 * ⚠️ **De belofte, en hij gaat over de klasse en niet over één functie:**
 *
 *      Elke bewaking die een recht van een client bewaakt, ziet dat recht ook
 *      wanneer het via `PUBLIC` is uitgedeeld.
 *
 * ⚠️ **Waarom dit bestand bestaat.** Een recht dat via `grant … to public` wordt
 *    gegeven, geldt voor élke rol — `anon` en `authenticated` incluis — maar
 *    staat in `information_schema` op de rij `grantee = 'PUBLIC'` en in
 *    `aclexplode()` op grantee-oid `0`. Vier bewakingen filterden op een
 *    rolnáám en keken er daarmee langs. 📏 Gemeten vóór 0191:
 *
 *      grant insert (created_at) on commitments to public
 *        has_column_privilege('authenticated', …)   t     ← het recht ís er
 *        tijdstempel_bewaking()                     0     ← en hij zweeg
 *      dezelfde grant aan authenticated
 *        tijdstempel_bewaking()                     1     ← die zag hij wél
 *
 * ⚠️ **Spiegelbeeld van onwrikbare regel 4**, en dat is geen woordspel maar de
 *    reden dat dit twee keer kon gebeuren: daar leest `revoke … from public,
 *    anon` als "van iedereen" terwijl het precies `authenticated` overhoudt;
 *    hier leest `grant … to public` als onschuldig terwijl het juist iedereen
 *    raakt. Dezelfde verwarring tussen de SQL-rol `PUBLIC` en "openbaar".
 *
 * ⚠️ **De bestaande tests op deze vier bewakingen eisen alleen dat ze leeg zijn.**
 *    Dat is de must-allow, en die blijft groen bij een bewaking die niets meer
 *    kán vinden. Precies daarom staat hier de andere helft: elk geval deelt het
 *    recht écht uit en eist dat de bewaking hem noemt. Regel 18 vraag 3, met de
 *    hand gebroken in plaats van beredeneerd.
 *
 * ⚠️ **Elke grant staat in een transactie die terugrolt** — zelfde vorm als
 *    `groepspin.test.ts`. Een grant die een test overleeft, verandert het schema
 *    voor elke test daarna, en dan meet de suite iets anders dan hij zegt.
 */
import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

const TEST_TIMEOUT = 30_000;

const stackErIs = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'tijdstempel_bewaking'",
  import.meta.url,
);

/**
 * Deelt één recht uit binnen een transactie, telt wat de bewaking ziet, en rolt
 * terug.
 *
 * ⚠️ De telling gebeurt binnen dezelfde transactie als de grant — anders is de
 *    grant al weg voordat de bewaking kijkt, en meet dit niets.
 */
function metGrant(grant: string, bewaking: string): number {
  const uit = psql(`
    begin;
    ${grant}
    select count(*) from ${bewaking}();
    rollback;
  `);
  const regels = uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => /^\d+$/.test(r));
  if (regels.length === 0) throw new Error(`geen telling uit ${bewaking}: ${JSON.stringify(uit)}`);
  return Number(regels[regels.length - 1]);
}

/** Wat de bewaking op de basislijn ziet — hoort nul te zijn. */
function zonderGrant(bewaking: string): number {
  return Number(psql(`select count(*) from ${bewaking}();`).trim());
}

interface Geval {
  bewaking: string;
  /** Waar het recht op slaat, voor de testnaam. */
  wat: string;
  publiek: string;
  aanAuthenticated: string;
}

const GEVALLEN: readonly Geval[] = [
  {
    bewaking: 'tijdstempel_bewaking',
    wat: 'een servertijdstempel (`commitments.created_at`)',
    publiek: 'grant insert (created_at) on public.commitments to public;',
    aanAuthenticated: 'grant insert (created_at) on public.commitments to authenticated;',
  },
  {
    bewaking: 'volgorde_bewaking',
    wat: 'de volgordesleutel van het auditspoor (`commitment_events.seq`)',
    publiek: 'grant update (seq) on public.commitment_events to public;',
    aanAuthenticated: 'grant update (seq) on public.commitment_events to authenticated;',
  },
  {
    bewaking: 'viewrechten_bewaking',
    wat: 'een schrijfrecht op een view (`mijn_profiel`)',
    publiek: 'grant update on public.mijn_profiel to public;',
    aanAuthenticated: 'grant update on public.mijn_profiel to authenticated;',
  },
  {
    bewaking: 'ddl_rechten_in_de_api',
    wat: 'TRUNCATE op de puntenboekhouding (`points_ledger`)',
    publiek: 'grant truncate on public.points_ledger to public;',
    aanAuthenticated: 'grant truncate on public.points_ledger to authenticated;',
  },
];

describe.skipIf(!stackErIs)('QS8-337 — een grant aan PUBLIC is niet onzichtbaar', () => {
  // -------------------------------------------------------------------------
  // 1. De must-allow: op de basislijn zwijgen ze allemaal
  // -------------------------------------------------------------------------
  //
  // ⚠️ Deze staat vooraan. Een bewaking die op álles afgaat, haalt §2 moeiteloos
  //    en maakt de poort onbruikbaar.
  it.each(GEVALLEN.map((g) => [g.bewaking] as const))(
    '%s meldt niets op de basislijn',
    (bewaking) => {
      expect(zonderGrant(bewaking)).toBe(0);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. De belofte: een grant aan PUBLIC wordt gezien
  // -------------------------------------------------------------------------

  it.each(GEVALLEN.map((g) => [g.bewaking, g.wat, g.publiek] as const))(
    '%s ziet %s die aan PUBLIC is gegeven',
    (bewaking, _wat, grant) => {
      expect(
        metGrant(grant, bewaking),
        `${bewaking} zag een grant aan PUBLIC niet — dat is het defect van QS8-337`,
      ).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. En de oude helft blijft werken
  // -------------------------------------------------------------------------
  //
  // ⚠️ 0191 verving de rolnaamfilter door `has_*_privilege`. Zonder deze gevallen
  //    zou een omzetting die per ongeluk álleen nog naar PUBLIC kijkt, groen
  //    blijven — en dan is er een gat teruggekomen op de plek waar er net een
  //    weg was.
  it.each(GEVALLEN.map((g) => [g.bewaking, g.wat, g.aanAuthenticated] as const))(
    '%s ziet %s die aan authenticated is gegeven',
    (bewaking, _wat, grant) => {
      expect(metGrant(grant, bewaking)).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );
});
