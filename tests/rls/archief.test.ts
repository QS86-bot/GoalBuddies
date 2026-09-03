/**
 * Migratie 0092 — een groep wordt gearchiveerd en niet gewist.
 *
 * ⚠️ **De belofte is niet "er is een archiefstatus" maar "een gearchiveerde groep
 *    is voor niemand meer te beschrijven, en niets zet hem terug".** Dat eerste
 *    is een kolom en die test zichzelf; dat tweede is een eigenschap van het
 *    gehéél, en daar zitten dertien routes in: tien schrijfpolicies die langs
 *    `is_group_member()` of `is_group_admin()` lopen, en vier functies die
 *    `update groups ... status` doen (waarvan één, `join_group_with_code()`,
 *    vanaf een client bereikbaar is).
 *
 *    Een test per policy zou dertien tests zijn die elk een onderdeel bewijzen.
 *    Deze suite toetst in plaats daarvan de twee sloten waar ze allemaal
 *    langskomen — plus de route die een gebruiker echt in handen heeft.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Groep {
  id: string;
  code: string;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

describe.skipIf(!rlsTestsConfigured)('0092 — archiveren in plaats van wissen', () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let levend: Groep;
  let archief: Groep;

  async function maakGroep(eigenaar: TestUser, naam: string): Promise<Groep> {
    const { data, error } = await eigenaar.db.rpc('create_group', { group_name: naam });
    if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);
    const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep ${naam}: ${JSON.stringify(data)}`);
    return { id: g.group.id, code: g.group.invite_code };
  }

  async function statusVan(id: string): Promise<string | null> {
    const { data } = await adminDb().from('groups').select('status').eq('id', id).single();
    return data?.status ?? null;
  }

  beforeAll(async () => {
    alice = await createTestUser('archief-alice');
    bob = await createTestUser('archief-bob');
    carol = await createTestUser('archief-carol');

    levend = await maakGroep(alice, 'Blijft levend');
    archief = await maakGroep(alice, 'Gaat het archief in');

    for (const groep of [levend, archief]) {
      const { data, error } = await bob.db.rpc('join_group_with_code', { code: groep.code });
      if (error) throw new Error(`meedoen (HTTP): ${error.message}`);
      if (uitkomst(data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(data)}`);
    }

    const gearchiveerd = await alice.db.rpc('archiveer_groep', {
      p_group_id: archief.id,
      p_bevestigd: true,
    });
    if (gearchiveerd.error) throw new Error(`archiveren: ${gearchiveerd.error.message}`);
    if (uitkomst(gearchiveerd.data).ok !== true) {
      throw new Error(`archiveren: ${JSON.stringify(gearchiveerd.data)}`);
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'archiveren vraagt een bevestiging en een beheerder',
    async () => {
      // ⚠️ Domeinregel 5-zwaarte: een handeling die iets wegneemt bij ánderen mag
      //    nooit één klik zijn. De database is hier de tweede rem, niet de enige.
      const zonder = await alice.db.rpc('archiveer_groep', { p_group_id: levend.id });
      expect(uitkomst(zonder.data).reason).toBe('not_confirmed');
      expect(await statusVan(levend.id)).toBe('active');

      const doorBob = await bob.db.rpc('archiveer_groep', {
        p_group_id: levend.id,
        p_bevestigd: true,
      });
      expect(uitkomst(doorBob.data).reason).toBe('not_admin');
      expect(await statusVan(levend.id)).toBe('active');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een spoor na in group_events en wist niets',
    async () => {
      // Domeinregel 6: corrigeren gebeurt met een record, niet door geschiedenis
      // weg te gooien. De rijen die vroeger meecascadeerden staan er nog.
      const { data: gebeurtenis } = await adminDb()
        .from('group_events')
        .select('event_type, new_value')
        .eq('group_id', archief.id)
        .eq('event_type', 'group_archived');

      expect(gebeurtenis).toHaveLength(1);

      const { count } = await adminDb()
        .from('group_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('group_id', archief.id);

      expect(count).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'sluit alle schrijfroutes in één keer, ook voor de beheerder zelf',
    async () => {
      // ⚠️ **Dit is de naadtest.** Er zijn tien schrijfpolicies die langs
      //    `is_group_member()` of `is_group_admin()` lopen; de toets zit in die
      //    twee functies en niet in de policies, juist zodat er geen elfde
      //    vergeten kan worden. Drie steekproeven over drie verschillende
      //    tabellen bewijzen dat het slot op de juiste laag zit — zat het per
      //    policy, dan zou elke tabel apart gerepareerd moeten zijn.
      const chat = await bob.db.from('chat_messages').insert({
        group_id: archief.id,
        sender_id: bob.id,
        body: 'hallo?',
        type: 'text',
      });
      expect(chat.error?.code).toBe('42501');

      const naam = await alice.db
        .from('groups')
        .update({ name: 'Nieuwe naam' })
        .eq('id', archief.id)
        .select('id');
      expect(naam.data ?? []).toHaveLength(0);
      expect(await adminDb().from('groups').select('name').eq('id', archief.id).single())
        .toHaveProperty('data.name', 'Gaat het archief in');

      const zicht = await alice.db.rpc('zet_groepszichtbaarheid', {
        p_group_id: archief.id,
        p_naar: 'open',
        p_bevestigd: true,
      });
      expect(uitkomst(zicht.data).reason).toBe('not_admin');
    },
    TEST_TIMEOUT,
  );

  it(
    'blijft in beeld voor zijn leden — sinds 0153, en dit was andersom',
    async () => {
      // ⚠️ **Deze test stond hier omgekeerd, en dat is geen fout van toen maar
      //    een besluit van nu.** 0092 liet de archieftoets in
      //    `is_group_member()` staan, en `groups_select` liep langs diezelfde
      //    functie — dus de groep verdween voor iedereen. Dat is als bewuste
      //    keuze met open eind opgeschreven en werd de dossierrij van 25-08
      //    (QS8-217): *"archief belooft leesbaarheid die er niet is"*.
      //
      //    0153 splitst lezen en schrijven. Wat hierboven staat blijft
      //    onverkort gelden — er is niets meer in te schrijven — maar de rijen
      //    zijn weer te bereiken. **De rest van dit bestand is niet aangeraakt;
      //    alleen deze ene belofte is omgedraaid.**
      const { data } = await bob.db.from('groups').select('id');
      const zichtbaar = (data ?? []).map((r) => r.id);

      expect(zichtbaar).toContain(levend.id);
      expect(zichtbaar).toContain(archief.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'niemand kan de groep nog verwijderen, ook de levende niet',
    async () => {
      // `groups_delete` staat sinds 0092 op `false`. Een DELETE die door de
      // `using` wordt weggefilterd raakt nul rijen en geeft géén fout — daarom
      // telt hier alleen of de rij er nog is.
      await alice.db.from('groups').delete().eq('id', levend.id);
      expect(await statusVan(levend.id)).toBe('active');
    },
    TEST_TIMEOUT,
  );

  it(
    'de uitnodigingscode wekt de groep niet weer tot leven',
    async () => {
      // ⚠️ **De route die een gebruiker echt in handen heeft.**
      //    `join_group_with_code()` eindigde met `update groups set status =
      //    'active'`, dus iedereen met de code kon een gearchiveerde groep zo
      //    terugzetten — van buiten de UI om. Carol zit in geen van beide groepen
      //    en heeft alleen de code.
      const poging = await carol.db.rpc('join_group_with_code', { code: archief.code });

      expect(poging.error).toBeNull();
      expect(uitkomst(poging.data).ok).toBe(false);
      expect(uitkomst(poging.data).reason).toBe('archived');
      expect(await statusVan(archief.id)).toBe('archived');

      // en de voorvertoning lekt de naam en de ledenlijst niet meer
      const preview = await carol.db.rpc('invite_preview', { code: archief.code });
      expect(preview.data).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'zelfs service_role zet de status niet terug zonder het bewust te doen',
    async () => {
      // ⚠️ De trigger geldt voor élke rol — ook `service_role` en definer-
      //    functies. Drie van de vier routes terug naar `active` zijn
      //    definer-functies, dus de rolfilter van `guard_group_update()` zou hier
      //    juist het gat zijn geweest. Dit is de test die dat verschil vastlegt.
      await adminDb().from('groups').update({ status: 'active' }).eq('id', archief.id);
      expect(await statusVan(archief.id)).toBe('archived');

      await adminDb().from('groups').update({ status: 'sleeping' }).eq('id', archief.id);
      expect(await statusVan(archief.id)).toBe('archived');
    },
    TEST_TIMEOUT,
  );

  it(
    'een gearchiveerde groep bezet je plek niet meer',
    async () => {
      // ⚠️ Zonder deze uitzondering is archiveren duurder dan weggooien was: je
      //    raakt de groep kwijt én je plek blijft bezet. Dan archiveert niemand,
      //    en staat er een slot dat niemand omdraait.
      //
      // ⚠️ De groepen en lidmaatschappen worden met `adminDb()` klaargezet en
      //    niet via `create_group()`. Anders slaat `daily_limit` (tien per
      //    etmaal) toe vóór `too_many_groups` (tien lidmaatschappen), en dan
      //    toetst deze test de verkeerde grens — precies het soort test dat
      //    groen staat op iets anders dan zijn naam belooft.
      const admin = adminDb();

      async function zetInGroepen(
        gebruiker: TestUser,
        aantal: number,
        gearchiveerd: number,
      ): Promise<void> {
        for (let i = 0; i < aantal; i++) {
          const { data, error } = await admin
            .from('groups')
            .insert({
              name: `Vulgroep ${gebruiker.id.slice(0, 8)}-${i}`,
              // ⚠️ Op naam van alice en niet van de gebruiker zelf. Anders telt
              //    `daily_limit` (tien aangemaakte groepen per etmaal) deze
              //    vulgroepen mee en slaat díé grens eerder toe — dan staat de
              //    test groen op een andere limiet dan zijn naam belooft.
              created_by: alice.id,
              invite_code: `T${gebruiker.id.slice(0, 6)}${String(i).padStart(2, '0')}`,
              status: i < gearchiveerd ? 'archived' : 'active',
            })
            .select('id')
            .single();
          if (error || data === null) throw new Error(`vulgroep: ${error?.message}`);

          const lid = await admin
            .from('group_members')
            .insert({ group_id: data.id, user_id: gebruiker.id, role: 'admin', status: 'active' });
          if (lid.error) throw new Error(`vullidmaatschap: ${lid.error.message}`);
        }
      }

      const vol = await createTestUser('archief-vol');
      await zetInGroepen(vol, 10, 0);
      const geweigerd = await vol.db.rpc('create_group', { group_name: 'De elfde' });
      expect(uitkomst(geweigerd.data).reason).toBe('too_many_groups');

      const ruimte = await createTestUser('archief-ruimte');
      await zetInGroepen(ruimte, 10, 3);
      const toegestaan = await ruimte.db.rpc('create_group', { group_name: 'Past nog' });
      expect(uitkomst(toegestaan.data).ok).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'toetreden telt hetzelfde plafond op dezelfde manier',
    async () => {
      // ⚠️ **De naad tussen twee tellingen van hetzelfde getal.** `create_group()`
      //    en `join_group_with_code()` bewaken allebei "hooguit tien groepen", en
      //    tot deze migratie rekenden ze verschillend: aanmaken sloot
      //    gearchiveerde groepen uit, toetreden niet. Een limiet die van je route
      //    afhangt, is geen limiet. Gevonden doordat de test hierboven het ene
      //    pad toetste en het andere niet.
      const admin = adminDb();
      const uitnodiger = await createTestUser('archief-uitnodiger');
      const doelgroep = await maakGroep(uitnodiger, 'Er is nog plek');

      const vol = await createTestUser('archief-vol-join');
      for (let i = 0; i < 10; i++) {
        const { data, error } = await admin
          .from('groups')
          .insert({
            name: `Joingroep ${i}`,
            created_by: alice.id,
            invite_code: `J${vol.id.slice(0, 6)}${String(i).padStart(2, '0')}`,
            status: i < 3 ? 'archived' : 'active',
          })
          .select('id')
          .single();
        if (error || data === null) throw new Error(`joingroep: ${error?.message}`);
        await admin
          .from('group_members')
          .insert({ group_id: data.id, user_id: vol.id, role: 'member', status: 'active' });
      }

      // Zeven actieve lidmaatschappen, drie gearchiveerd: er is nog plek.
      const poging = await vol.db.rpc('join_group_with_code', { code: doelgroep.code });
      expect(uitkomst(poging.data).ok).toBe(true);
    },
    TEST_TIMEOUT,
  );
});
