import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Een uuid die gegarandeerd nergens naar verwijst. */
const NERGENS = '00000000-0000-4000-8000-000000000000';

/**
 * Kun je met de drie hulpfuncties het bestaan van iets aftasten? — de rij van
 * 15-08 in ENGINEER-REVIEW.
 *
 * ⚠️ **De vraag die die rij stelt.** `is_group_member()`,
 *    `shares_group_with_goal()` en `shares_group_with_user()` zijn
 *    `SECURITY DEFINER` en uitvoerbaar door élke ingelogde gebruiker — dat moet,
 *    want de RLS-policies roepen ze namens de aanroeper aan. De rij noteerde het
 *    als bewust geaccepteerd risico met één open vraag: *"Laten nakijken of een
 *    aanvaller met deze drie booleans het bestaan van groepen of doelen kan
 *    aftasten (uuid-enumeratie)."*
 *
 * ⚠️ **Het antwoord volgt uit de vorm, en daarom is het getest en niet
 *    beredeneerd.** Alle drie zijn `exists(...)` over een join die altijd
 *    `m.user_id = auth.uid()` bevat. Voor iets waar je niets mee te maken hebt,
 *    is de uitkomst dus dezelfde als voor iets dat niet bestaat: `false`. Er is
 *    geen derde antwoord en geen fout, dus geen orakel.
 *
 *    Dat is precies het soort eigenschap dat stil kan sneuvelen. Eén `or`-tak
 *    erbij, of de `auth.uid()`-voorwaarde uit één van de drie, en het verschil
 *    tussen "bestaat niet" en "bestaat, maar niet van jou" wordt zichtbaar —
 *    zonder dat een gedragstest daar iets van merkt, want de policies blijven
 *    gewoon werken.
 *
 * ⚠️ **Wat hier níét bewezen wordt: het tijdsverschil.** Een bestaande rij
 *    opzoeken kan meetbaar sneller of trager zijn dan een lege index-lookup. Dat
 *    is een zijkanaal en geen returnwaarde, en het is met deze opstelling niet
 *    betrouwbaar te meten. Het staat als grens in de reviewrij.
 */
describe.skipIf(!rlsTestsConfigured)('De hulpfuncties zijn geen orakel', () => {
  let alice: TestUser;
  let carol: TestUser;
  let groupId: string;
  let goalId: string;

  beforeAll(async () => {
    alice = await createTestUser('aftasten-alice');
    carol = await createTestUser('aftasten-carol');

    // ⚠️ Via `create_group()` en niet met een rauwe insert: die functie zet ook
    //    het lidmaatschap en de uitnodigingscode, en dat is wat een echte groep
    //    heeft. Zelfde patroon als `archief.test.ts`.
    const { data: gemaakt, error: groepFout } = await alice.db.rpc('create_group', {
      group_name: 'Aftastgroep',
    });
    if (groepFout) throw new Error(`groep aanmaken: ${groepFout.message}`);
    const g = (gemaakt ?? {}) as { ok?: boolean; group?: { id: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep aanmaken: ${JSON.stringify(gemaakt)}`);
    groupId = g.group.id;

    const { data: doel, error: doelFout } = await adminDb()
      .from('goals')
      .insert({
        owner_id: alice.id,
        title: 'Aftastdoel',
        status: 'active',
        target_date: '2026-12-31',
      })
      .select('id')
      .single();
    if (doelFout) throw new Error(`doel aanmaken: ${doelFout.message}`);
    goalId = doel!.id;

    await adminDb().from('goal_group_links').insert({ goal_id: goalId, group_id: groupId });
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'geeft carol hetzelfde antwoord voor een bestaande groep als voor een verzonnen uuid',
    async () => {
      // ⚠️ Dit is de kern. Zou het echte id `false` geven en het verzonnen id
      //    een fout, of andersom, dan is de functie een bestaanstest.
      const echt = await carol.db.rpc('is_group_member', { gid: groupId });
      const verzonnen = await carol.db.rpc('is_group_member', { gid: NERGENS });

      expect(echt.error).toBeNull();
      expect(verzonnen.error).toBeNull();
      expect(echt.data).toBe(false);
      expect(verzonnen.data).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'idem voor een bestaand doel dat aan een groep hangt waar carol niet in zit',
    async () => {
      const echt = await carol.db.rpc('shares_group_with_goal', { g: goalId });
      const verzonnen = await carol.db.rpc('shares_group_with_goal', { g: NERGENS });

      expect(echt.error).toBeNull();
      expect(verzonnen.error).toBeNull();
      expect(echt.data).toBe(false);
      expect(verzonnen.data).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'idem voor een bestaande gebruiker met wie carol geen groep deelt',
    async () => {
      const echt = await carol.db.rpc('shares_group_with_user', { other: alice.id });
      const verzonnen = await carol.db.rpc('shares_group_with_user', { other: NERGENS });

      expect(echt.error).toBeNull();
      expect(verzonnen.error).toBeNull();
      expect(echt.data).toBe(false);
      expect(verzonnen.data).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'en voor alice, die er wél bij hoort, staan ze alle drie op waar',
    async () => {
      // ⚠️ De positieve controle. Zonder deze test is een stel functies dat
      //    altijd `false` teruggeeft — of helemaal weg is — net zo groen als een
      //    stel dat precies het juiste doet. Vraag 3 uit regel 18.
      const groep = await alice.db.rpc('is_group_member', { gid: groupId });
      const doel = await alice.db.rpc('shares_group_with_goal', { g: goalId });

      expect(groep.data).toBe(true);
      expect(doel.data).toBe(true);
    },
    TEST_TIMEOUT,
  );
});
