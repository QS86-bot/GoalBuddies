import { describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured } from './harness';

const TEST_TIMEOUT = 30_000;
const SETUP_TIMEOUT = 180_000;

/**
 * Domeinregel 3 heeft twee sloten, en één ervan stond niet onder test.
 *
 * ⚠️ **CLAUDE.md, domeinregel 3:** *"Alleen een lid van dezelfde buddy-groep mag
 *    een voltooiing goedkeuren. Nooit jezelf. Afgedwongen in RLS **én** met een
 *    database-constraint, niet alleen in de UI. Test dit expliciet."*
 *
 *    De constraint-helft is uitgebreid getest in `policies.test.ts` en werkt.
 *    De RLS-helft — de clausule `c.user_id <> auth.uid()` in
 *    `completion_approvals_insert` — was vanuit een client niet los te toetsen:
 *    Postgres draait `before insert`-triggers vóór de RLS `with check`, dus
 *    `fill_approval_subject()` en de CHECK gooien altijd als eerste. De test
 *    daar zegt dat ook met zoveel woorden.
 *
 * ⚠️ **Op 27-08-2026 gemeten in plaats van beredeneerd.** Op de lokale stack is
 *    die clausule uit de policy gehaald en daarna draaide de héle suite:
 *    **24 bestanden, 428 tests, alles groen.** Het gedrag bleef goed — de
 *    constraint vangt de gebruiker nog steeds — maar de dúbbele beveiliging die
 *    domeinregel 3 met zoveel woorden eist, was een enkele geworden, en niets
 *    zou dat gemeld hebben.
 *
 * ⚠️ **Dat is regel 18, vraag 3:** kan deze test groen blijven terwijl de
 *    belofte breekt? Hier was het antwoord ja. Nog een gedragstest erbij zou
 *    niet helpen — die raakt hetzelfde onderste slot. Vandaar een bewaking op
 *    het bestáán van beide sloten, naast de gedragstests die bewijzen dat de
 *    deur dicht is.
 *
 * ⚠️ Met de hand gebroken vóór hij hier kwam te staan, in een teruggedraaide
 *    transactie: clausule weg gaf `rls`, daarbovenop de constraint weg gaf
 *    `rls` + `constraint`, en daarbovenop de trigger weg gaf alle drie. Met
 *    alles op zijn plek: nul.
 */
describe.skipIf(!rlsTestsConfigured)('Domeinregel 3 — twee sloten op peer-goedkeuring', () => {
  it(
    'beide sloten staan er, en de trigger die het tweede voedt',
    async () => {
      const { data, error } = await adminDb().rpc('domeinregel3_bewaking');

      expect(error).toBeNull();
      // Bij een treffer staat in de melding wélk slot weg is en wat er precies
      // ontbreekt, zodat de volgende lezer niet hoeft te zoeken.
      expect(data ?? [], JSON.stringify(data)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'is niet aanroepbaar als gewone gebruiker',
    async () => {
      // ⚠️ De positieve controle. Deze functie leest het systeemcatalogus en
      //    hoort alleen voor `service_role` te bestaan. En niet alleen "er is
      //    een fout": PostgREST geeft ook een fout als de functie helemáál niet
      //    bestaat, en dan is deze test groen terwijl de bewaking weg is.
      const alice = await createTestUser('domeinregel3-alice');

      try {
        const { error } = await alice.db.rpc('domeinregel3_bewaking');
        expect(error?.code, JSON.stringify(error)).toBe('42501');
      } finally {
        await removeTestUsers();
      }
    },
    SETUP_TIMEOUT,
  );
});
