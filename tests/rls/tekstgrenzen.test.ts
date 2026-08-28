import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * Elke tekstkolom die de client mag schrijven, heeft een lengtegrens — 0123.
 *
 * ⚠️ **De Zod-schema's hadden die grenzen al, en dat was precies het probleem.**
 *    `doelSchema` zegt `description` maximaal 2000 en `identity_statement`
 *    maximaal 200, en `mijlpaalSchema` en `weekly-schemas.ts` doen hetzelfde.
 *    Maar een verzoek aan PostgREST komt langs geen enkel Zod-schema. Elk
 *    onderdeel klopt en het geheel lekt — regel 18, en de reden dat onwrikbare
 *    regel 3 over de sérver gaat.
 *
 * ⚠️ **Veertien kolommen, niet de zes uit de bevinding.** Generiek gemeten. Vier
 *    ervan wórden door een CHECK genoemd zonder dat die iets over lengte zegt:
 *    `chat_messages.attachment_url` (een inhoudseis) en `commitments.image_url`
 *    (een https-vorm). Een https-URL kan een megabyte zijn.
 *
 * ⚠️ **Waarom dit op een gratis tier zonder backups telt:** opslag is er eindig
 *    en er staat geen `pg_dump` tussen jou en een tabel die volloopt.
 */
describe.skipIf(!rlsTestsConfigured)('0123 — tekst zonder grens is opslag van een ander', () => {
  let gebruiker: TestUser;
  let doelId: string;

  beforeAll(async () => {
    gebruiker = await createTestUser('tekstgrens');

    const doel = await gebruiker.db
      .from('goals')
      .insert({ owner_id: gebruiker.id, title: 'Grensdoel', target_date: '2027-06-30' })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    doelId = doel.data.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('goals').delete().eq('id', doelId);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'kent geen enkele schrijfbare tekstkolom zonder lengtegrens',
    async () => {
      const { data, error } = await adminDb().rpc('tekstgrenzen_bewaking');

      expect(error).toBeNull();
      expect(data ?? [], JSON.stringify(data)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'de bewaking is niet aanroepbaar als gewone gebruiker',
    async () => {
      // ⚠️ Niet "er is een fout": PostgREST geeft óók een fout als de functie
      //    helemáál niet bestaat, en dan is de test hierboven groen terwijl de
      //    bewaking weg is.
      const { error } = await gebruiker.db.rpc('tekstgrenzen_bewaking');

      expect(error?.code, JSON.stringify(error)).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De gedragskant, en zonder deze bewijst de nulmeting niets.** De bewaking
   *    kijkt naar constraints; deze test gaat de weg die de aanvaller ook gaat —
   *    rechtstreeks langs PostgREST, buiten elk formulier om.
   */
  it(
    'weigert een omschrijving die de grens overschrijdt, buiten het formulier om',
    async () => {
      const { error } = await gebruiker.db
        .from('goals')
        .update({ description: 'a'.repeat(2001) })
        .eq('id', doelId);

      expect(error?.code, JSON.stringify(error)).toBe('23514');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De tweede helft van de ijking.** Een grens die precies op de grens
   *    weigert, is een nieuwe fout en geen reparatie: het formulier zegt dan
   *    "mag" en de database zegt "nee". De schema's tellen in UTF-16-eenheden en
   *    de CHECK in codepunten, en `.length` is altijd ≥ `char_length` — dus
   *    alles wat Zod goedkeurt, hoort hier te passen.
   */
  it(
    'laat precies de maximale lengte wél door',
    async () => {
      const { error } = await gebruiker.db
        .from('goals')
        .update({ description: 'a'.repeat(2000) })
        .eq('id', doelId);

      expect(error, JSON.stringify(error)).toBeNull();
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **En met emoji, want dat is waar de twee eenheden uit elkaar lopen.**
   *    Duizend keer 😀 is `char_length` 1000 en `.length` 2000: Zod keurt het
   *    precies goed en de CHECK hoort dat ook te doen. Zou de CHECK in
   *    UTF-16-eenheden tellen, dan was dit 2000 en werd het geweigerd — een
   *    storingsmelding nadat het formulier "lang genoeg" zei. Zie QS8-118.
   */
  it(
    'telt codepunten en geen UTF-16-eenheden',
    async () => {
      const { error } = await gebruiker.db
        .from('goals')
        .update({ description: '\u{1F600}'.repeat(1000) })
        .eq('id', doelId);

      expect(error, JSON.stringify(error)).toBeNull();
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Tien jobs per dag is pas een quotum als één job begrensd is.**
   *    `vraag_ai_job()` schreef zijn eigen risico al op — *"dan stuur je gewoon
   *    je eigen prompt en betaalt Quinten de rekening"* — en begrensde de invoer
   *    niet. Een invoer van 450.000 tekens werd geaccepteerd, opgeslagen en naar
   *    het model gestuurd.
   */
  it(
    'weigert een AI-aanvraag met een invoer boven de grens',
    async () => {
      const db = gebruiker.db as unknown as {
        rpc: (naam: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
      };

      const { data } = await db.rpc('vraag_ai_job', {
        p_kind: 'milestones',
        p_goal_id: doelId,
        p_input: { doel: 'a'.repeat(9000) },
      });

      expect(data as Record<string, unknown>).toMatchObject({
        ok: false,
        reason: 'invoer_te_groot',
      });
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tegentest. Zonder deze is "te groot wordt geweigerd" ook waar op een
   *    functie die alles weigert, en dan is de Doelcoach stuk in plaats van
   *    begrensd.
   */
  it(
    'laat een aanvraag van normale omvang gewoon door',
    async () => {
      const db = gebruiker.db as unknown as {
        rpc: (naam: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
      };

      const { data } = await db.rpc('vraag_ai_job', {
        p_kind: 'milestones',
        p_goal_id: doelId,
        p_input: { doel: 'Marathon lopen', streefdatum: '2027-06-30' },
      });

      expect(data as Record<string, unknown>).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );
});
