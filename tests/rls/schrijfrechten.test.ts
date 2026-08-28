import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  onbekendeCode,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const TEST_TIMEOUT = 30_000;
const SETUP_TIMEOUT = 180_000;

/**
 * Een schrijfrecht waar geen policy bij hoort, geeft niets — en hoort weg.
 *
 * ⚠️ **Sinds 0118 is dit de generieke vorm, en dat is de reparatie van 0101.**
 *    0101 trok de rechten in op vier tabellen en zette er een bewaking naast met
 *    **die vier namen erin gebeiteld**. Dat is precies de klasse die 0101 kwam
 *    voorkomen: `alter default privileges` van Supabase deelt élke nieuwe tabel
 *    in `public` de volle set uit aan `anon` en `authenticated`, dus de volgende
 *    tabel krijgt ze weer en een lijst van vier kijkt de andere kant op. Op 28-08
 *    stonden er zo 58 rechten voor `anon` over 21 tabellen en 18 voor
 *    `authenticated` over 9 — geen enkele in die lijst.
 *
 * ⚠️ **De regel die de lijst vervangt:** een schrijfrecht voor `anon` of
 *    `authenticated` waar geen permissieve policy voor diezelfde rol en opdracht
 *    bij hoort. Uit te rekenen, dus geen lijst nodig.
 *
 * Wat 0101 zelf deed staat hieronder, want die tests blijven staan:
 *
 * Vier tabellen die alleen `service_role` schrijft, weigeren sinds 0101 lúid.
 *
 * ⚠️ **Wat er mis was is niet dat er iets kon, maar dat er niets gebeurde.**
 *    `points_ledger`, `user_streaks`, `week_pass_events` en `chain_links` hebben
 *    bewust alléén een SELECT-policy, en droegen tot 0101 nog de standaard
 *    Supabase-tabelgrants. Voor INSERT gaf dat al een harde `42501` — er is geen
 *    rij om weg te filteren. Voor UPDATE en DELETE niet: RLS filtert de rijen
 *    weg, en een DELETE die nul rijen raakt is geen fout. De client kreeg HTTP
 *    204 en een ongewijzigde tabel.
 *
 * ⚠️ **De gegevens waren veilig, en dat is precies wat dit lastig maakt.** Een
 *    test die op deze tabellen een foutcode verwacht, wordt groen zonder iets te
 *    bewijzen — dat stond zo in de rij van 19-08. Daarom toetst dit bestand
 *    allebei: dát de weigering nu een code heeft, én dat de rij er nog staat.
 *
 * ⚠️ **De hele suite bleef groen bij het intrekken** (27 bestanden, 443 tests,
 *    vóór en ná 0101). Een grant die je zonder één rode test kunt teruggeven, is
 *    niet bewaakt — regel 18, vraag 3. Vandaar `schrijfrechten_bewaking()` én de
 *    gedragstests hieronder: de eerste ziet de grant terugkomen, de tweede ziet
 *    of het gedrag klopt.
 *
 * ⚠️ Met de hand rood gemaakt door de vier grants terug te geven op de lokale
 *    stack: de bewaking meldt dan 24 rijen (twee rollen × vier tabellen × drie rechten) en tien
 *    tests vallen om. De drie INSERT-tests blijven in béide standen groen, en dat
 *    hoort: die weigerde vóór 0101 ook al hard.
 */

/**
 * De vier tabellen die alleen `service_role` schrijft.
 *
 * ⚠️ De UPDATE hieronder zet `user_id` op de waarde die er al staat — een patch
 *    die niets verandert. Dat is met opzet: de weigering hoort van de tabelgrant
 *    te komen en niet van de inhoud, dus zelfs een lege wijziging moet er hard
 *    op stuklopen. `user_id` is bovendien de enige kolom die alle vier delen.
 */
const TABELLEN = ['points_ledger', 'user_streaks', 'week_pass_events', 'chain_links'] as const;

describe.skipIf(!rlsTestsConfigured)('0101 — schrijfrechten op service_role-tabellen', () => {
  let gebruiker: TestUser;

  beforeAll(async () => {
    gebruiker = await createTestUser('sr-schrijfrechten');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'geen enkele tabel geeft anon of authenticated een recht zonder policy',
    async () => {
      const { data, error } = await adminDb().rpc('schrijfrechten_bewaking');

      expect(error).toBeNull();
      // De melding noemt tabel, rol en recht, zodat de volgende lezer niet hoeft
      // te zoeken welke combinatie terug is.
      expect(data ?? [], JSON.stringify(data)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De negatieve helft, en zonder deze bewijst de test hierboven niets.**
   *    Nul rijen is ook wat je krijgt van een bewaking die niets vindt omdat er
   *    niets meer te schrijven valt. `authenticated` houdt na 0118 zevenendertig
   *    schrijfrechten over — allemaal met een policy erbij — en de bewaking hoort
   *    daar géén van te noemen. Een controle die alles meldt, leert je hem te
   *    negeren.
   */
  it(
    'laat de rechten die wél een policy hebben met rust',
    async () => {
      // Een gewone eigen schrijfactie. Slaagt dit niet, dan is de app dicht in
      // plaats van opgeruimd, en zegt de nulmeting hierboven niets.
      const { error } = await gebruiker.db
        .from('profiles')
        .update({ display_name: 'Schrijfrechten' })
        .eq('id', gebruiker.id);

      expect(error, JSON.stringify(error)).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'de bewaking is niet aanroepbaar als gewone gebruiker',
    async () => {
      // ⚠️ De positieve controle op de bewaking zelf. Niet "er is een fout":
      //    PostgREST geeft óók een fout als de functie helemáál niet bestaat, en
      //    dan is deze test groen terwijl de bewaking weg is.
      const { error } = await gebruiker.db.rpc('schrijfrechten_bewaking');

      expect(error?.code, JSON.stringify(error)).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  for (const tabel of TABELLEN) {
    it(
      `een UPDATE op ${tabel} weigert met een code in plaats van stil`,
      async () => {
        // ⚠️ Vóór 0101 gaf dit HTTP 204 en een ongewijzigde tabel: RLS filtert
        //    de rijen weg en een UPDATE die nul rijen raakt is geen fout. Precies
        //    het gedrag dat een test laat slagen zonder iets te bewijzen.
        const { error } = await gebruiker.db
          .from(tabel)
          .update({ user_id: gebruiker.id })
          .eq('user_id', gebruiker.id);

        expect(error?.code, `${tabel}: ${JSON.stringify(error)}`).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      `een DELETE op ${tabel} weigert met een code in plaats van stil`,
      async () => {
        const { error } = await gebruiker.db
          .from(tabel)
          .delete()
          .eq('user_id', gebruiker.id);

        expect(error?.code, `${tabel}: ${JSON.stringify(error)}`).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      `een INSERT op ${tabel} weigert nog steeds`,
      async () => {
        // ⚠️ Deze weigerde vóór 0101 ook al, en staat er als grens naast de twee
        //    hierboven: hij hoort niet stiller te worden van het intrekken.
        const { error } = await gebruiker.db
          .from(tabel)
          .insert({ user_id: gebruiker.id } as never);

        expect(error, tabel).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  }

  it(
    'lezen kan nog gewoon — anders bewijst het bovenstaande niets',
    async () => {
      // ⚠️ De toelating hoort erbij. Zonder dit bewijs kan alles hierboven groen
      //    zijn omdat er helemaal geen toegang meer is tot deze tabellen, en dan
      //    is de app stuk in plaats van dicht.
      const { error } = await gebruiker.db
        .from('user_streaks')
        .select('user_id')
        .eq('user_id', gebruiker.id);

      expect(error).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'een onbekende id verandert daar niets aan',
    async () => {
      // De weigering komt van de tabelgrant en niet van de rijen, dus hij hoort
      // net zo hard te zijn op een filter die sowieso niets raakt.
      const { error } = await gebruiker.db
        .from('points_ledger')
        .delete()
        .eq('reason', onbekendeCode());

      expect(error?.code).toBe('42501');
    },
    TEST_TIMEOUT,
  );
});
