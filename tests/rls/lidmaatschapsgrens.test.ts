import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * Wie mag een lidmaatschapsrij aanraken — QS8-262, ronde 6.
 *
 * 📏 `rls:dekking` mat op 07-09 dat **beide helften** van `group_members_update`
 * door geen enkele test bewaakt worden. Nagemeten met de verruiming die iemand
 * realistisch schrijft — `is_group_admin(group_id)` naar `is_group_member(group_id)`,
 * dus *elk lid mag elke lidmaatschapsrij bijwerken* — en de héle suite bleef
 * groen: **1152 tests, nul rood.**
 *
 * ⚠️⚠️ **De voor de hand liggende test kán dit niet zien, en dat is de vondst van
 *    deze ronde.** `magNietLanden()` vergelijkt de rij vóór en ná de poging. Op
 *    déze tabel staat `guard_group_member_update()` (0016/0029/0145), en die zet
 *    voor een niet-beheerder élke kolom terug in plaats van te werpen. De rij is
 *    dus altijd onveranderd — met de policy én zonder. 📏 Gemeten, als bob die
 *    geen beheerder is:
 *
 *    | | policy zoals hij is | verruimd naar `is_group_member` |
 *    |---|---|---|
 *    | bob werkt de rij van alice bij | `[]` | `[{"status":"active"}]` |
 *    | status van alice erna | `active` | `active` |
 *
 *    De waarde verschilt niet; **het aantal geraakte rijen wel.** Daarom toetst
 *    dit bestand wat de update *raakt* en niet wat er daarna in de rij staat. Een
 *    test op de waarde zou hier groen zijn en niets bewaken — precies de vorm die
 *    QS8-262 zeven keer heeft gevonden.
 *
 * ⚠️ **Geen enkele poging hieronder verwacht een fout.** PostgREST geeft op een
 *    UPDATE die nul rijen raakt gewoon `200` met een lege lijst; er is niets aan
 *    de hand, er is alleen niets gebeurd. Een test die op `42501` wacht, wacht
 *    hier op iets dat nooit komt.
 *
 * ⚠️ **De must-allow staat erbij, en dat is hier geen formaliteit.** "Bob raakt
 *    nul rijen" is óók waar als er helemaal niets werkt — een verkeerd filter,
 *    een lege groep, een verlopen token. De beheerder die dezelfde rij wél raakt,
 *    is het bewijs dat de opstelling deugt.
 *
 * ## De `check`-helft is het tweede slot, en alleen te zien met het eerste uit
 *
 * Ronde 6 liet deze helft als vraag open: *de trigger pint `user_id` en
 * `group_id` vóórdat de `with check` aan de nieuwe rij toekomt, dus mogelijk is
 * er geen rij te bouwen die de ene helft passeert en de andere niet.* 📏 In ronde
 * 7 gemeten, en het antwoord is tweeledig:
 *
 * | | uitkomst |
 * |---|---|
 * | bob verplaatst zijn eigen rij naar alice, trigger **aan** | geen fout, één rij, `user_id` onveranderd |
 * | idem, trigger **uit** | **`42501`** — de `check`-helft weigert |
 *
 * De helft is dus wél falsifieerbaar, alleen niet in de wereld waarin de app
 * draait. Dat is precies de vorm van de zelfgetuige-opstelling in
 * `getuigemelding.test.ts`: **twee sloten op één belofte, en de vraag is of het
 * tweede standhoudt als het eerste ooit lekt.** Vandaar de test hieronder, met
 * `group_members_guard` even uit — geen kunstgreep, maar de enige manier om bij
 * het slot te komen dat je wilt toetsen.
 *
 * ⚠️ Daarmee gaat deze helft **níet** in `NIET_PER_HELFT_TE_METEN`. Hij is te
 *    meten; er was alleen een opstelling voor nodig die niemand geprobeerd had.
 *
 * ## `groups_update` staat hier ook, en die is per hélft niet te scheiden
 *
 * Dezelfde ronde, andere uitkomst, en het verschil zit in de kolomgrant. 📏
 * `rls:dekking` meldde beide helften van `groups_update` als onbewaakt; nagemeten
 * blijkt het páár wél bewaakt te zijn:
 *
 * | Opengezet | Uitslag |
 * |---|---|
 * | `groups_update.using` alleen | nul rood |
 * | `groups_update.check` alleen | nul rood |
 * | **allebei tegelijk** | **3 rood** |
 *
 * De drie zijn *"laat een gewoon lid de groep niet hernoemen of verwijderen"* en
 * *"sluit alle schrijfroutes in één keer, ook voor de beheerder zelf"* in
 * `policies.test.ts`, en *"is door een gewoon lid niet te wijzigen"* in
 * `archief.test.ts`.
 *
 * ⚠️ **Waarom de helften daar niet te scheiden zijn.** `using` en `with check`
 *    zijn letterlijk dezelfde uitdrukking (`is_group_admin(id)`), en `id` staat
 *    níet in de UPDATE-kolomgrant van `groups` — 📏 gemeten: `name`, `tz`,
 *    `huddle_day`, `categorie` en zeven andere wél, `id` niet. Er bestaat dus geen
 *    rij die de ene helft passeert en de andere niet. Zelfde vorm als
 *    `goals_update` in ronde 4 en `profiles_update` in ronde 3.
 *
 * ⚠️ **En dáárom staat `group_members_update` hier wél onder test.** Daar staan
 *    `user_id` en `group_id` juist wél in de UPDATE-kolomgrant, dus die symmetrie
 *    geldt er niet — de helften zijn er in principe te scheiden, en de `using`
 *    bleek gewoon ongedekt. Twee policies die er hetzelfde uitzien in het
 *    dekkingsrapport en een tegengesteld antwoord verdienen. **Dat verschil is
 *    niet te zien zonder de kolomgrant erbij te halen.**
 *
 * Beide `groups_update`-helften staan als `NIET_PER_HELFT_TE_METEN` in
 * `scripts/rls-dekking.mjs`, met de terugkeervoorwaarde erbij.
 *
 * IJKING — met de hand gedraaid op 07-09-2026:
 *
 *   A  `is_group_admin(group_id)` → `is_group_member(group_id)` in beide helften
 *      → 1 rood: 'een gewoon lid raakt de rij van een ander niet'
 *   B  beide helften op `true`
 *      → 1 rood, plus de structurele telling in `hulpfuncties`
 *   C  de `check`-helft op `true`
 *      → 1 rood: 'de check-helft houdt de rij tegen als de trigger hem niet pint'
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  /** Oprichter en dus beheerder van de groep. */
  alice: TestUser;
  /** Gewoon lid. Doet de pogingen die nergens op mogen landen. */
  bob: TestUser;
  groupId: string;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('group_members_update — wie raakt welke rij', () => {
  beforeAll(async () => {
    const alice = await createTestUser('lidgrens-alice');
    const bob = await createTestUser('lidgrens-bob');

    const groep = await alice.db.rpc('create_group', { group_name: 'Lidgrensgroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    const uit = (mee.data ?? {}) as { ok?: boolean };
    if (uit.ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    w = { alice, bob, groupId: gd.group.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'een gewoon lid raakt de rij van een ander niet',
    async () => {
      const poging = await w.bob.db
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', w.groupId)
        .eq('user_id', w.alice.id)
        .select('user_id, status');

      expect(poging.error, 'PostgREST weigert niet, hij raakt niets').toBeNull();
      expect(
        poging.data ?? [],
        'de using-helft hoort de rij van een ander buiten bereik te houden',
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'en de beheerder raakt diezelfde rij wél — anders bewijst de vorige test niets',
    async () => {
      // ⚠️ **De must-allow, en hij gaat over de opstelling en niet over de policy.**
      //    "Nul rijen" is gratis zodra het filter nergens op past. Deze test toont
      //    dat de rij bestaat, dat het filter klopt en dat de weg open is voor wie
      //    hem mag nemen.
      const poging = await w.alice.db
        .from('group_members')
        .update({ status: 'paused' })
        .eq('group_id', w.groupId)
        .eq('user_id', w.bob.id)
        .select('user_id, status');

      expect(poging.error).toBeNull();
      expect(poging.data ?? []).toHaveLength(1);

      const terug = await adminDb()
        .from('group_members')
        .update({ status: 'active' })
        .eq('group_id', w.groupId)
        .eq('user_id', w.bob.id);
      expect(terug.error).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'een lid raakt zijn eigen rij wél, en de trigger beslist wat ervan overblijft',
    async () => {
      // ⚠️ **Deze test legt de tweede grendel vast en verwart hem niet met de
      //    eerste.** De `using`-helft laat je je eigen rij raken — daar staat
      //    `user_id = auth.uid()` voor. Dat je jezelf daarmee géén beheerder maakt,
      //    is het werk van `guard_group_member_update()` en niet van de policy.
      //
      // 📏 Gemeten: de update geeft één rij terug, zonder fout, en `role` staat er
      //    daarna nog steeds op `member`. Dat de trigger dat stil doet, is een
      //    eigen bevinding — QS8-314.
      const poging = await w.bob.db
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', w.groupId)
        .eq('user_id', w.bob.id)
        .select('role');

      expect(poging.error).toBeNull();
      expect(poging.data ?? [], 'je eigen rij is wél bereikbaar').toHaveLength(1);

      const na = await adminDb()
        .from('group_members')
        .select('role')
        .eq('group_id', w.groupId)
        .eq('user_id', w.bob.id)
        .single();

      expect(na.data?.role, 'de trigger zet het beheerderschap terug').toBe('member');
    },
    TEST_TIMEOUT,
  );

  it(
    'de check-helft houdt de rij tegen als de trigger hem niet pint',
    async () => {
      // ⚠️ **Het tweede slot, en de reden dat de trigger hier even uit gaat.**
      //    Met `group_members_guard` aan is deze helft onbereikbaar: hij pint
      //    `new.user_id := old.user_id`, dus de nieuwe rij is altijd dezelfde als
      //    de oude en wat `using` doorlaat, laat `check` ook door. 📏 Gemeten:
      //    trigger aan → geen fout en `user_id` onveranderd; trigger uit →
      //    `42501`.
      //
      // ⚠️ Zelfde opstelling en zelfde reden als de zelfgetuige-test in
      //    `getuigemelding.test.ts`: twee sloten op één belofte, en dit toetst of
      //    het tweede standhoudt als het eerste ooit lekt. Zonder de trigger uit
      //    te zetten is er geen wereld waarin deze helft iets doet — en een test
      //    die zo'n wereld niet kan bouwen, bewaakt niets.
      psql('alter table public.group_members disable trigger group_members_guard;');

      try {
        const poging = await w.bob.db
          .from('group_members')
          .update({ user_id: w.alice.id })
          .eq('group_id', w.groupId)
          .eq('user_id', w.bob.id)
          .select('user_id');

        expect(
          poging.error?.code,
          'de nieuwe rij hoort de check niet te passeren: hij zou van alice zijn',
        ).toBe('42501');
      } finally {
        psql('alter table public.group_members enable trigger group_members_guard;');
      }

      // En de rij staat er nog zoals hij stond.
      const na = await adminDb()
        .from('group_members')
        .select('user_id')
        .eq('group_id', w.groupId)
        .eq('user_id', w.bob.id);
      expect(na.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});
