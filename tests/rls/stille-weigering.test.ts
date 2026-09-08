/**
 * QS8-314 / migratie 0187 — een geweigerde update meldt geen succes.
 *
 * ⚠️ **De belofte is niet "de niet-beheerderstak werpt".** Dat is een eigenschap
 *    van een tak, en een tak verhuist. De belofte is een eigenschap van het
 *    geheel:
 *
 *      Geen enkele UPDATE op `group_members` meldt succes terwijl
 *      `guard_group_member_update()` de wijziging heeft weggegooid.
 *
 * ⚠️ **Waar knopen twee correcte onderdelen aan elkaar (regel 18, vraag 1).**
 *    Precies hier, en dat is de reden dat dit bestand bestaat. De trigger is op
 *    zichzelf correct: hij laat de wijziging niet door. PostgREST is op zichzelf
 *    correct: hij meldt wat Postgres hem teruggaf, en Postgres telt een
 *    BEFORE-trigger die `new` teruggeeft als een geslaagde update. De leugen zit
 *    in de naad tussen die twee, en geen van beide onderdelen is stuk.
 *
 * ⚠️ **Waarom `magNietLanden()` hier niet volstaat.** Die helper toetst de enige
 *    eigenschap die bij een RLS-weigering in béide vormen klopt: de rij is
 *    achteraf onveranderd. Dat is precies de eigenschap die vóór 0187 ook al
 *    gold — `vertrek.test.ts` en `veiligheid.test.ts` waren groen op deze rij
 *    terwijl de aanroeper 200 met de oude rij terugkreeg. Een test die groen kan
 *    blijven terwijl de belofte breekt, bewaakt niets (regel 18, vraag 3).
 *    `weigertHoorbaar()` hieronder eist er de tweede helft bij: er komt een fout.
 *
 * ⚠️ **Elke "dit mag niet"-toets heeft een positieve tegenhanger (valkuil 10).**
 *    Een trigger die op álles werpt, haalt de weigertoetsen hieronder moeiteloos
 *    en breekt de app. Daarom staan §2 (de beheerder komt er wél door), §3 (een
 *    no-op blijft een no-op) en §4 (de keten van toetreden) ernaast, en zijn die
 *    drie even hard als §1.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  WEIGERCODES,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Rij {
  role: string;
  status: string;
}

/**
 * "Deze schrijfpoging mag niet landen, én de aanroeper hoort dat te merken."
 *
 * ⚠️ De tegenhanger van `magNietLanden()`. Die accepteert een stille weigering,
 *    omdat een RLS-`using` er nu eenmaal een is. Deze eist er een fout bij, en
 *    dat mag hier omdat de weigering van een trigger komt en niet van een
 *    policy-filter: een `raise` in een BEFORE-trigger bereikt de client altijd.
 *
 * ⚠️ Ook hier eerst bewijzen dat er iets te veranderen valt. Zonder die toets is
 *    "onveranderd" gratis en bewijst de test een slot dat hij nooit probeerde.
 */
async function weigertHoorbaar(
  schrijf: () => PromiseLike<{ error: { code?: string; message?: string } | null }>,
  lees: () => PromiseLike<{ data: unknown }>,
): Promise<string> {
  const voorData = (await lees()).data ?? null;
  if (voorData === null) {
    throw new Error('weigertHoorbaar: `lees()` geeft niets terug — er valt niets te veranderen.');
  }
  const voor = JSON.stringify(voorData);

  const { error } = await schrijf();

  if (error === null) {
    throw new Error(
      `De schrijfpoging meldde succes. Rij vóór: ${voor}, ná: ` +
        `${JSON.stringify((await lees()).data ?? null)}. ` +
        'Dat is de stille terugzet van QS8-314: geweigerd, en dat niet gezegd.',
    );
  }

  if (!WEIGERCODES.includes(error.code as never)) {
    throw new Error(
      `Geweigerd met een onverwachte code ${error.code}: ${error.message}. ` +
        'Dat is geen weigering maar iets dat stuk is.',
    );
  }

  const na = JSON.stringify((await lees()).data ?? null);
  if (na !== voor) {
    throw new Error(`Geweigerd met ${error.code}, maar de rij veranderde alsnog.\n  vóór: ${voor}\n  ná:   ${na}`);
  }

  return error.message ?? '';
}

describe.skipIf(!rlsTestsConfigured)('QS8-314 — een geweigerde update meldt geen succes', () => {
  let beheerder: TestUser;
  let lid: TestUser;
  let groupId: string;
  let code: string;

  beforeAll(async () => {
    beheerder = await createTestUser('stilweig-admin');
    lid = await createTestUser('stilweig-lid');

    const { data, error } = await beheerder.db.rpc('create_group', { group_name: 'Stille weigering' });
    if (error) throw new Error(`groep aanmaken: ${error.message}`);
    const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep aanmaken: ${JSON.stringify(data)}`);
    groupId = g.group.id;
    code = g.group.invite_code;
    registreerGroep(groupId);

    const toe = await lid.db.rpc('join_group_with_code', { code });
    if (toe.error) throw new Error(`toetreden: ${toe.error.message}`);
    expect((toe.data as { ok?: boolean }).ok).toBe(true);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  function leesRij(userId: string) {
    return () =>
      adminDb()
        .from('group_members')
        .select('group_id, user_id, role, status, joined_at')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();
  }

  // -------------------------------------------------------------------------
  // 1. De belofte, over het hele oppervlak
  // -------------------------------------------------------------------------
  //
  // ⚠️ **Uitputtend over de kolommen die `authenticated` mag bijwerken, en niet
  //    over een handvol favorieten.** De grant staat op `group_id`, `user_id`,
  //    `role` en `status`; `joined_at` heeft er geen en ketst al op 42501 af.
  //    Wie hier een kolom weglaat, laat precies daar de stille terugzet terug
  //    komen.
  // ⚠️ De patch staat hier uitgeschreven en wordt niet met een berekende sleutel
  //    gebouwd (`{ [kolom]: waarde }`). Dat laatste typecheckt niet tegen de
  //    gegenereerde tabeltypes, en een `as` erbij zou juist de toets weghalen die
  //    merkt dat een kolom hernoemd is.
  const alsGewoonLid = [
    { wat: 'role op admin', patch: { role: 'admin' } },
    { wat: 'status op inactive', patch: { status: 'inactive' } },
    { wat: 'status op paused', patch: { status: 'paused' } },
  ] as const;

  for (const { wat, patch } of alsGewoonLid) {
    it(
      `een gewoon lid dat zijn eigen ${wat} zet, krijgt een fout`,
      async () => {
        const melding = await weigertHoorbaar(
          () =>
            lid.db
              .from('group_members')
              .update(patch)
              .eq('group_id', groupId)
              .eq('user_id', lid.id),
          leesRij(lid.id),
        );
        expect(melding).toContain('geen_groepsbeheerder');
      },
      TEST_TIMEOUT,
    );
  }

  it(
    'de sleutel van een lidmaatschap verandert niet voor een beheerder',
    async () => {
      // ⚠️ De beheerderstak pinde `group_id` en `user_id` net zo stil terug als
      //    de andere tak. Dat is dezelfde belofte en dus dezelfde toets; hij
      //    staat hier zodat "de beheerder mag alles" geen vrijbrief wordt.
      const tweede = await beheerder.db.rpc('create_group', { group_name: 'Stille weigering II' });
      const g2 = (tweede.data ?? {}) as { group?: { id: string } };
      if (!g2.group) throw new Error(`tweede groep: ${JSON.stringify(tweede.data)}`);
      registreerGroep(g2.group.id);

      const melding = await weigertHoorbaar(
        () =>
          beheerder.db
            .from('group_members')
            .update({ group_id: g2.group!.id })
            .eq('group_id', groupId)
            .eq('user_id', lid.id),
        leesRij(lid.id),
      );
      expect(melding).toContain('lidmaatschap_verplaatst');
    },
    TEST_TIMEOUT,
  );

  it(
    'ook `service_role` verplaatst een lidmaatschap niet',
    async () => {
      // ⚠️ **De sleuteltoets staat vóór de vroege uitgang bij `auth.uid() is
      //    null`, en dat is de helft die de eerste versie van 0187 miste.** Stond
      //    hij erna, dan gold "voor niemand" alleen voor ingelogde aanroepers en
      //    verplaatste `service_role` een lidmaatschap met HTTP 200 en de
      //    verplaatste rij terug — aangewezen door de security-ronde en hier
      //    nagemeten.
      //
      //    Dit is dezelfde keuze die `archief_blijft_archief()` (0153) maakt, en
      //    om dezelfde reden: een rolfilter is geen grendel, want élke SECURITY
      //    DEFINER-functie komt er langs.
      const tweede = await beheerder.db.rpc('create_group', { group_name: 'Stille weigering III' });
      const g3 = (tweede.data ?? {}) as { group?: { id: string } };
      if (!g3.group) throw new Error(`derde groep: ${JSON.stringify(tweede.data)}`);
      registreerGroep(g3.group.id);

      const melding = await weigertHoorbaar(
        () =>
          adminDb()
            .from('group_members')
            .update({ group_id: g3.group!.id })
            .eq('group_id', groupId)
            .eq('user_id', lid.id),
        leesRij(lid.id),
      );
      expect(melding).toContain('lidmaatschap_verplaatst');
    },
    TEST_TIMEOUT,
  );

  it(
    'een niet-lid dat de rij van een ander wil zetten, landt niet en meldt geen succes',
    async () => {
      // ⚠️ Deze ketst op de policy af en niet op de trigger — RLS filtert de rij
      //    weg, de UPDATE raakt nul rijen en er komt géén fout. Dat is de reden
      //    dat hier `data` geteld wordt en niet op een fout gewacht: de belofte
      //    van dit bestand gaat over de trigger, en een `using`-filter is een
      //    ander mechanisme met een andere eerlijke uitkomst.
      const vreemde = await createTestUser('stilweig-vreemd');
      const poging = await vreemde.db
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', groupId)
        .eq('user_id', lid.id)
        .select();

      expect(poging.data ?? []).toHaveLength(0);
      const na = await leesRij(lid.id)();
      expect((na.data as Rij).status).toBe('active');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. De tegenhanger — wat wél moet kunnen
  // -------------------------------------------------------------------------

  it(
    'een beheerder zet de status van een lid en dat landt gewoon',
    async () => {
      // ⚠️ **Via `verwijder_lid()` sinds QS8-356.** Migratie 0199 sloot de kale
      //    PATCH-uitzetting, want die slaat de opruiming over die de RPC wél
      //    doet (`goal_group_links`, openstaande `deadline_requests`). De
      //    belofte van déze test staat los daarvan: een beheerder komt er wél
      //    doorheen, en dat is de tegenhanger die voorkomt dat de guard op alles
      //    werpt.
      const r = await beheerder.db.rpc('verwijder_lid', {
        p_group_id: groupId,
        p_user_id: lid.id,
        p_bevestigd: true,
      });

      expect(r.error).toBeNull();
      expect((r.data ?? {}) as { ok?: boolean }).toMatchObject({ ok: true });
      const na = await leesRij(lid.id)();
      expect((na.data as Rij).status).toBe('inactive');

      // terugzetten voor de tests hierna
      await adminDb()
        .from('group_members')
        .update({ status: 'active' })
        .eq('group_id', groupId)
        .eq('user_id', lid.id);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. Een no-op blijft een no-op
  // -------------------------------------------------------------------------

  it(
    'een lid dat zijn eigen rij overschrijft met dezelfde waarden, krijgt géén fout',
    async () => {
      // ⚠️ **Dit is de grens van de weigering en niet een detail.** Werpt de
      //    trigger op "je bent geen beheerder" in plaats van op "hier verandert
      //    iets", dan valt de upsert van `join_group_with_code()` om voor elk
      //    bestaand lid — §4 hieronder is dan rood. Deze toets legt vast dat de
      //    weigering aan de wijziging hangt en niet aan de rol.
      const r = await lid.db
        .from('group_members')
        .update({ status: 'active', role: 'member' })
        .eq('group_id', groupId)
        .eq('user_id', lid.id)
        .select();

      expect(r.error).toBeNull();
      expect(r.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 4. De keten: toetreden blijft werken, en terugkomen werkt nu écht
  // -------------------------------------------------------------------------

  it(
    'een bestaand lid dat de code opnieuw aanbiedt, treedt gewoon toe',
    async () => {
      const toe = await lid.db.rpc('join_group_with_code', { code });
      expect(toe.error).toBeNull();
      expect((toe.data as { ok?: boolean }).ok).toBe(true);
      const na = await leesRij(lid.id)();
      expect((na.data as Rij).status).toBe('active');
    },
    TEST_TIMEOUT,
  );

  it(
    'een lid op `paused` dat de code aanbiedt, komt terug op `active`',
    async () => {
      // ⚠️ **Dit is de keten die vóór 0187 stil onderbroken was (regel 18,
      //    vraag 5).** `join_group_with_code()` gaf `{"ok": true}` en de status
      //    bleef `paused`, want de niet-beheerderstak pinde hem terug. Er was
      //    geen kapot onderdeel, dus geen enkele test kon er rood van worden.
      //
      // ⚠️ `paused` wordt vandaag door geen enkele functie geschreven, dus deze
      //    toestand wordt hier met `adminDb()` gemaakt. Dat is geen omweg om een
      //    grendel heen: de grendel die deze test bewaakt zit op het pad van het
      //    lid, en dat pad loopt hieronder wél volledig als het lid zelf.
      await adminDb()
        .from('group_members')
        .update({ status: 'paused' })
        .eq('group_id', groupId)
        .eq('user_id', lid.id);

      const toe = await lid.db.rpc('join_group_with_code', { code });
      expect(toe.error).toBeNull();
      expect((toe.data as { ok?: boolean }).ok).toBe(true);

      const na = await leesRij(lid.id)();
      expect((na.data as Rij).status).toBe('active');
    },
    TEST_TIMEOUT,
  );

  it(
    'de uitzondering geldt alleen mét de code — een lid schuift zichzelf niet van `paused` naar `active`',
    async () => {
      // ⚠️ **De must-deny naast de must-allow hierboven.** De uitzondering hangt
      //    aan `app.hervat_lidmaatschap`, en die zet alleen
      //    `join_group_with_code()`. Zonder die instelling is dit een gewone
      //    statuswijziging door een niet-beheerder en hoort hij hoorbaar te
      //    weigeren — anders is de uitzondering een open deur die iedereen kan
      //    nemen zonder ooit een code te hebben gezien.
      await adminDb()
        .from('group_members')
        .update({ status: 'paused' })
        .eq('group_id', groupId)
        .eq('user_id', lid.id);

      const melding = await weigertHoorbaar(
        () =>
          lid.db
            .from('group_members')
            .update({ status: 'active' })
            .eq('group_id', groupId)
            .eq('user_id', lid.id),
        leesRij(lid.id),
      );
      expect(melding).toContain('geen_groepsbeheerder');

      await adminDb()
        .from('group_members')
        .update({ status: 'active' })
        .eq('group_id', groupId)
        .eq('user_id', lid.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'geen derde functie kent de ontgrendelsleutel — en geen enkele sleutel is ongeteld',
    async () => {
      // ⚠️ **De uitzondering van 0187 is een tweede loper-sleutel, en die kwam er
      //    bijna zonder teller in.** 0153 bouwde voor de eerste sleutel
      //    `sleutelzetters()` met de reden erbij: een nieuw bypass-mechanisme
      //    zonder eigen teller zou de uitzondering zijn. Deze migratie máákt zo'n
      //    mechanisme.
      //
      // ⚠️ **Zonder deze test bewaakt niets het.** 📏 Gemeten door een derde
      //    functie te planten die `app.hervat_lidmaatschap` zet en élke
      //    projectregel volgt: de volledige suite bleef groen. Een deur die
      //    alleen dichtzit omdat er verderop een `if` staat.
      //
      // ⚠️ De teller dekt sinds 0187 drie gevallen, en ze zijn los geijkt: een
      //    derde functie op de sleutel van 0187, een derde op die van 0153, en
      //    een functie met een `app.`-instelling die nergens geregistreerd staat.
      //    Dat laatste is de tak die de vólgende sleutel vangt.
      const { data, error } = await adminDb().rpc('sleutelzetters');
      if (error) throw new Error(`sleutelzetters: ${error.message}`);

      expect(data ?? [], 'elke rij hier is een tweede sleutel op een slot').toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'de overdracht in verlaat_groep() blijft werken — de beheerderstak raakt niet geblokkeerd',
    async () => {
      // ⚠️ Dit is het geval dat 0102 §"deze toets ontbrak" beschrijft: de
      //    overdracht-`update` werd voor een gewoon lid stil geneutraliseerd
      //    terwijl er wél een `admin_transferred`-rij werd geschreven. De
      //    overdracht door een échte beheerder moet er onveranderd doorheen.
      const vertrekker = await createTestUser('stilweig-vertrek');
      const g = await vertrekker.db.rpc('create_group', { group_name: 'Overdracht' });
      const gg = (g.data ?? {}) as { group?: { id: string; invite_code: string } };
      if (!gg.group) throw new Error(`groep: ${JSON.stringify(g.data)}`);
      registreerGroep(gg.group.id);

      const opvolger = await createTestUser('stilweig-opvolger');
      const toe = await opvolger.db.rpc('join_group_with_code', { code: gg.group.invite_code });
      expect((toe.data as { ok?: boolean }).ok).toBe(true);

      const weg = await vertrekker.db.rpc('verlaat_groep', {
        p_group_id: gg.group.id,
        p_bevestigd: true,
        p_nieuwe_beheerder: opvolger.id,
      });
      expect(weg.error).toBeNull();
      expect((weg.data as { ok?: boolean }).ok).toBe(true);

      const na = await adminDb()
        .from('group_members')
        .select('role')
        .eq('group_id', gg.group.id)
        .eq('user_id', opvolger.id)
        .maybeSingle();
      expect((na.data as { role: string }).role).toBe('admin');
    },
    TEST_TIMEOUT,
  );
});
