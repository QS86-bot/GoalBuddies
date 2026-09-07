import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Wat `beslis_lidmaatschapsverzoek()` belóóft tegenover wat er gebeurt — QS8-328.
 *
 * ⚠️ **De belofte is niet "de tak klopt" maar: de audit en het lidmaatschap
 *    zeggen hetzelfde.** `group_events` is append-only en élk lid leest hem; een
 *    rij die zegt dat een verzoek is aangenomen terwijl de aanvrager geen lid
 *    werd, is een bewering in de onveranderlijke groepsgeschiedenis over iets
 *    dat niet gebeurd is. Dezelfde vorm als QS8-314 (migratie 0187) en als 0102.
 *
 * ⚠️ **Het bereikbare geval is geen race maar de normale weg terug.**
 *    `vraag_lidmaatschap_aan()` weigert een aanvraag van een bestaand lid — maar
 *    toetst met zoveel woorden `m.status <> 'inactive'`, dus een uitgezet lid
 *    mág aanvragen. Dat is de enige route terug: `join_group_with_code()`
 *    weigert hem met `removed`. Kwam die aanvraag vervolgens uit bij een
 *    `on conflict do nothing`, dan bleef hij uitgezet terwijl de beheerder
 *    `{"ok": true, "status": "accepted"}` terugkreeg.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Groep {
  id: string;
  code: string;
}

interface Uitkomst {
  ok?: boolean;
  reason?: string;
  status?: string;
}

interface Fixture {
  /** Beheerder van de vindbare groep. */
  anna: TestUser;
  /** Was lid, is er door anna uitgezet. De weg terug loopt via een aanvraag. */
  cor: TestUser;
  /** Nooit lid geweest. De tegenhanger: hier hóórt alles wél te gebeuren. */
  dirk: TestUser;
  vindbaar: Groep;
}

let f: Fixture;

async function maakGroep(eigenaar: TestUser, naam: string): Promise<Groep> {
  const { data, error } = await eigenaar.db.rpc('create_group', {
    group_name: naam,
    zichtbaarheid: 'beschermd',
  });
  if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);

  const gelezen = data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (gelezen.ok !== true || !gelezen.group) {
    throw new Error(`groep ${naam} mislukte: ${JSON.stringify(data)}`);
  }
  registreerGroep(gelezen.group.id);
  return { id: gelezen.group.id, code: gelezen.group.invite_code };
}

async function rpc(wie: TestUser, naam: string, args: Record<string, unknown>): Promise<Uitkomst> {
  const { data, error } = await wie.db.rpc(naam as never, args as never);
  if (error) throw new Error(`${naam} (HTTP): ${error.message}`);
  return data as unknown as Uitkomst;
}

/** De status van een lidmaatschapsrij, of `null` als er geen rij is. */
async function lidstatus(groupId: string, userId: string): Promise<string | null> {
  const { data } = await adminDb()
    .from('group_members')
    .select('status')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.status ?? null;
}

/** Alle auditrijen over een besluit op een lidmaatschapsverzoek in deze groep. */
async function besluitrijen(groupId: string): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await adminDb()
    .from('group_events')
    .select('actor_id, new_value, created_at')
    .eq('group_id', groupId)
    .eq('event_type', 'join_request_decided');
  if (error) throw new Error(`group_events lezen: ${error.message}`);
  return (data ?? []) as unknown as readonly Record<string, unknown>[];
}

async function verzoekId(groupId: string, userId: string): Promise<string> {
  const { data } = await adminDb()
    .from('group_join_requests')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.id) throw new Error('geen lidmaatschapsverzoek gevonden');
  return data.id;
}

describe.skipIf(!rlsTestsConfigured)('een besluit op een lidmaatschapsverzoek', () => {
  beforeAll(async () => {
    const anna = await createTestUser('besluit-anna');
    const cor = await createTestUser('besluit-cor');
    const dirk = await createTestUser('besluit-dirk');

    const vindbaar = await maakGroep(anna, 'BESLUIT vindbaar');

    // Cor doet mee en wordt daarna door anna uitgezet: dat is de toestand
    // waarin de rij bestaat en `on conflict do nothing` niets meer deed.
    const mee = await rpc(cor, 'join_group_with_code', { code: vindbaar.code });
    if (mee.ok !== true) throw new Error(`meedoen mislukte: ${JSON.stringify(mee)}`);

    // ⚠️ **Cor wordt eerst beheerder, en dat is geen versiering.**
    //    `verwijder_lid()` zet alleen `status` op 'inactive' en laat `role`
    //    staan, dus de rij van een uitgezette beheerder draagt nog
    //    `role = 'admin'`. Zonder deze stap toetst de roltest hieronder een rij
    //    die toch al 'member' was, en dan bewaakt hij niets — de vorm van een
    //    grendel die door een eerdere grendel wordt afgevangen.
    const gepromoveerd = await anna.db
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', vindbaar.id)
      .eq('user_id', cor.id);
    if (gepromoveerd.error) throw new Error(`promoveren: ${gepromoveerd.error.message}`);

    const weg = await rpc(anna, 'verwijder_lid', {
      p_group_id: vindbaar.id,
      p_user_id: cor.id,
      p_bevestigd: true,
    });
    if (weg.ok !== true) throw new Error(`uitzetten mislukte: ${JSON.stringify(weg)}`);

    // De opstelling is pas bruikbaar als de rij er ook echt zo bij ligt.
    const uitgezet = await adminDb()
      .from('group_members')
      .select('role, status')
      .eq('group_id', vindbaar.id)
      .eq('user_id', cor.id)
      .single();
    if (uitgezet.data?.role !== 'admin' || uitgezet.data.status !== 'inactive') {
      throw new Error(`opstelling klopt niet: ${JSON.stringify(uitgezet.data)}`);
    }

    // ⚠️ Via de gewone updateweg, om dezelfde reden als in `ontdekken.test.ts`:
    //    kan een beheerder deze kolommen niet zetten, dan is de hele feature
    //    onbereikbaar en hoort dat hier stuk te gaan.
    const kolommen = await anna.db
      .from('groups')
      .update({
        categorie: 'fitness',
        omschrijving: 'BESLUIT wij lopen elke week samen hard.',
        voertaal: 'nl',
      })
      .eq('id', vindbaar.id);
    if (kolommen.error) throw new Error(`kolommen zetten: ${kolommen.error.message}`);

    const aan = await rpc(anna, 'zet_groepsontdekbaarheid', {
      p_group_id: vindbaar.id,
      p_naar: true,
      p_bevestigd: true,
    });
    if (aan.ok !== true) throw new Error(`vindbaar maken mislukte: ${JSON.stringify(aan)}`);

    f = { anna, cor, dirk, vindbaar };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'laat een uitgezet lid wél aanvragen — dit is zijn enige weg terug',
    async () => {
      // ⚠️ Deze test staat er omdat de rest van dit bestand er anders naast
      //    zit: weigerde de aanvraag, dan was het geval hieronder onbereikbaar
      //    en bewaakte dit bestand niets. `join_group_with_code()` is dicht voor
      //    een uitgezet lid, dus als deze weg ook dicht zou zijn, komt hij nooit
      //    meer binnen.
      expect(await lidstatus(f.vindbaar.id, f.cor.id)).toBe('inactive');

      const terug = await rpc(f.cor, 'join_group_with_code', { code: f.vindbaar.code });
      expect(terug.reason).toBe('removed');

      const vraag = await rpc(f.cor, 'vraag_lidmaatschap_aan', {
        p_group_id: f.vindbaar.id,
        p_bericht: 'Mag ik terugkomen?',
      });
      expect(vraag.ok).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de audit en het lidmaatschap niet uit elkaar lopen bij een uitgezet lid',
    async () => {
      // ⚠️ **De belofte, en niet de tak.** Er staat hier bewust niet "de functie
      //    geeft reason X" maar: wat er in de onveranderlijke geschiedenis komt,
      //    klopt met wat er met het lidmaatschap gebeurd is. Die formulering
      //    blijft staan welke van de drie denkrichtingen er ook gekozen wordt.
      const id = await verzoekId(f.vindbaar.id, f.cor.id);

      const besluit = await rpc(f.anna, 'beslis_lidmaatschapsverzoek', {
        p_request_id: id,
        p_naar: 'accepted',
      });

      const status = await lidstatus(f.vindbaar.id, f.cor.id);
      const rijen = await besluitrijen(f.vindbaar.id);

      if (besluit.ok === true) {
        // Zegt de functie dat het gelukt is, dan is de aanvrager ook echt lid.
        expect(status).toBe('active');
      } else {
        // Zegt hij van niet, dan staat er ook niets over in de geschiedenis.
        expect(rijen).toHaveLength(0);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een teruggekeerd lid geen beheerdersrechten terug',
    async () => {
      // ⚠️ `verwijder_lid()` zet alleen `status` op `inactive` en laat `role`
      //    staan. Een rij van een uitgezette beheerder draagt dus nog
      //    `role = 'admin'`, en alleen de status omzetten zou die rechten
      //    stilzwijgend teruggeven. De insert-tak schrijft `'member'`; de weg
      //    terug hoort hetzelfde te doen.
      const { data } = await adminDb()
        .from('group_members')
        .select('role')
        .eq('group_id', f.vindbaar.id)
        .eq('user_id', f.cor.id)
        .maybeSingle();

      expect(data?.role).toBe('member');
    },
    TEST_TIMEOUT,
  );

  it(
    'schrijft voor een gewone aanvrager wél een auditrij, en maakt hem lid',
    async () => {
      // De tegenhanger. Zonder deze test is "nooit een auditrij schrijven" ook
      // groen, en dan bewaakt dit bestand een functie die niets meer doet.
      const vraag = await rpc(f.dirk, 'vraag_lidmaatschap_aan', {
        p_group_id: f.vindbaar.id,
        p_bericht: null,
      });
      expect(vraag.ok).toBe(true);

      const id = await verzoekId(f.vindbaar.id, f.dirk.id);
      const besluit = await rpc(f.anna, 'beslis_lidmaatschapsverzoek', {
        p_request_id: id,
        p_naar: 'accepted',
      });

      expect(besluit.ok).toBe(true);
      expect(await lidstatus(f.vindbaar.id, f.dirk.id)).toBe('active');

      const rijen = await besluitrijen(f.vindbaar.id);
      expect(rijen.filter((r) => r.actor_id === f.anna.id).length).toBeGreaterThanOrEqual(1);
    },
    TEST_TIMEOUT,
  );
});
