import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestProfile,
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
  /** Uitgezet uit de vólle groep. Zijn terugkeer moet op het plafond stuiten. */
  eva: TestUser;
  /** Zit al in tien groepen. Er kan er geen bij, ook niet via een verzoek. */
  frits: TestUser;
  vindbaar: Groep;
  /** Twaalf actieve leden. Er kan er geen bij, ook niet via een verzoek. */
  vol: Groep;
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

/** De systeemberichten over een toetreding van deze persoon in deze groep. */
async function toetredingsberichten(groupId: string, userId: string): Promise<number> {
  const { data, error } = await adminDb()
    .from('chat_messages')
    .select('id')
    .eq('group_id', groupId)
    .eq('system_event', 'member_joined')
    .eq('subject_id', userId);
  if (error) throw new Error(`chat_messages lezen: ${error.message}`);
  return (data ?? []).length;
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

    // ---- de volle groep, voor het ledenplafond ----
    const eva = await createTestUser('besluit-eva');
    const vol = await maakGroep(anna, 'BESLUIT vol');

    const meeVol = await rpc(eva, 'join_group_with_code', { code: vol.code });
    if (meeVol.ok !== true) throw new Error(`meedoen (vol): ${JSON.stringify(meeVol)}`);

    const wegVol = await rpc(anna, 'verwijder_lid', {
      p_group_id: vol.id,
      p_user_id: eva.id,
      p_bevestigd: true,
    });
    if (wegVol.ok !== true) throw new Error(`uitzetten (vol): ${JSON.stringify(wegVol)}`);

    // ⚠️ Opvulprofielen en geen echte gebruikers: ze loggen nooit in, ze hoeven
    //    alleen te tellen. Ze gaan wél door dezelfde opruimgrendel.
    //    Anna plus elf opvullers is twaalf actieve leden — precies het plafond
    //    dat `join_group_with_code()` hanteert.
    for (let i = 0; i < 11; i += 1) {
      const opvuller = await createTestProfile(`besluit-vul-${i}`);
      const gezet = await adminDb()
        .from('group_members')
        .insert({ group_id: vol.id, user_id: opvuller.id, role: 'member', status: 'active' });
      if (gezet.error) throw new Error(`opvullen: ${gezet.error.message}`);
    }

    const kolommenVol = await anna.db
      .from('groups')
      .update({
        categorie: 'fitness',
        omschrijving: 'BESLUIT deze groep zit vol.',
        voertaal: 'nl',
      })
      .eq('id', vol.id);
    if (kolommenVol.error) throw new Error(`kolommen (vol): ${kolommenVol.error.message}`);

    const aanVol = await rpc(anna, 'zet_groepsontdekbaarheid', {
      p_group_id: vol.id,
      p_naar: true,
      p_bevestigd: true,
    });
    if (aanVol.ok !== true) throw new Error(`vindbaar (vol): ${JSON.stringify(aanVol)}`);

    const vraagEva = await rpc(eva, 'vraag_lidmaatschap_aan', {
      p_group_id: vol.id,
      p_bericht: null,
    });
    if (vraagEva.ok !== true) throw new Error(`aanvraag (vol): ${JSON.stringify(vraagEva)}`);

    // ---- frits zit al in tien groepen ----
    const frits = await createTestUser('besluit-frits');

    // ⚠️ Rechtstreeks ingevoegd en niet via `create_group()`: die functie heeft
    //    dezelfde grens van tien en zou bij de elfde weigeren. Wat hier getoetst
    //    wordt is of `beslis_lidmaatschapsverzoek()` hem óók hanteert, dus de
    //    opstelling moet erbuiten om.
    for (let i = 0; i < 10; i += 1) {
      const gemaakt = await adminDb()
        .from('groups')
        .insert({
          name: `BESLUIT vol-frits ${i}`,
          invite_code: `BF${String(i).padStart(4, '0')}`,
          created_by: anna.id,
        })
        .select('id')
        .single();
      if (gemaakt.error) throw new Error(`groep voor frits: ${gemaakt.error.message}`);

      registreerGroep(gemaakt.data.id);

      const lid = await adminDb()
        .from('group_members')
        .insert([
          { group_id: gemaakt.data.id, user_id: anna.id, role: 'admin', status: 'active' },
          { group_id: gemaakt.data.id, user_id: frits.id, role: 'member', status: 'active' },
        ]);
      if (lid.error) throw new Error(`frits lid maken: ${lid.error.message}`);
    }

    const vraagFrits = await rpc(frits, 'vraag_lidmaatschap_aan', {
      p_group_id: vindbaar.id,
      p_bericht: null,
    });
    if (vraagFrits.ok !== true) throw new Error(`aanvraag (frits): ${JSON.stringify(vraagFrits)}`);

    f = { anna, cor, dirk, eva, frits, vindbaar, vol };
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

      // ⚠️ Hier stond een `if/else` die allebei de uitkomsten goedkeurde: `ok`
      //    met een actief lid, óf niet-`ok` met nul auditrijen. Die tweede tak
      //    is óók waar als de functie op `not_admin` zou afketsen — dan bewaakt
      //    de test de belofte niet meer maar alleen zijn eigen vorm. De
      //    gekozen richting is dat aannemen slaagt, dus dat staat er nu.
      expect(besluit.ok).toBe(true);
      expect(status).toBe('active');
      expect(rijen).toHaveLength(1);
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
    'kondigt de terugkeer aan zoals elke toetreding, want stilte is zelf een signaal',
    async () => {
      // ⚠️ **Dit is de spiegel van beslisdocument 002 rij 22.** Daar staat
      //    waarom een vertrek géén systeembericht krijgt: anders wordt *de
      //    afwezigheid van het bericht het signaal*. De trigger stond op AFTER
      //    INSERT, dus een eerste toetreder werd aangekondigd en een
      //    teruggekeerd lid niet — en dan is een naam die in de ledenlijst
      //    verschijnt zónder regel in de chat per constructie een oud-lid. Elk
      //    lid kan dat aflezen.
      //
      // ⚠️ Twee berichten: de eerste toetreding en de terugkeer. Precies
      //    dezelfde zin, geen letter meer.
      expect(await toetredingsberichten(f.vindbaar.id, f.cor.id)).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een teruggekeerd lid niet over het ledenplafond heen glippen',
    async () => {
      // ⚠️ 📏 Het plafond van 12 staat alléén in `join_group_with_code()` en
      //    `create_group()` — geen CHECK, geen trigger. Gemeten vóór deze
      //    wijziging: een groep met 12 actieve leden groeide via dit pad naar
      //    13. Een uitgezet lid telt in `status <> 'inactive'` niet mee, dus
      //    zijn terugkeer duwt de groep er per definitie overheen.
      const leden = await adminDb()
        .from('group_members')
        .select('user_id')
        .eq('group_id', f.vol.id)
        .neq('status', 'inactive');
      expect((leden.data ?? []).length).toBe(12);

      const id = await verzoekId(f.vol.id, f.eva.id);
      const besluit = await rpc(f.anna, 'beslis_lidmaatschapsverzoek', {
        p_request_id: id,
        p_naar: 'accepted',
      });

      expect(besluit.reason).toBe('group_full');
      expect(await lidstatus(f.vol.id, f.eva.id)).toBe('inactive');

      // ⚠️ En het verzoek blijft openstaan: er is niets besloten, dus er hoort
      //    ook niets afgehandeld te zijn. Anders is dit dezelfde bugklasse in
      //    een nieuwe jas — een verzoek op `accepted` waar niets gebeurd is.
      const verzoek = await adminDb()
        .from('group_join_requests')
        .select('status')
        .eq('id', id)
        .single();
      expect(verzoek.data?.status).toBe('pending');
      expect(await besluitrijen(f.vol.id)).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een aanvrager niet over zijn eigen groepsgrens heen glippen',
    async () => {
      // ⚠️ Dezelfde omissie als het ledenplafond, aan de andere kant: de grens
      //    van tien groepen per gebruiker staat alleen in
      //    `join_group_with_code()` en `create_group()`. Zonder deze toets kan
      //    iemand er via aanvragen ongelimiteerd bij.
      const id = await verzoekId(f.vindbaar.id, f.frits.id);
      const besluit = await rpc(f.anna, 'beslis_lidmaatschapsverzoek', {
        p_request_id: id,
        p_naar: 'accepted',
      });

      expect(besluit.reason).toBe('too_many_groups');
      expect(await lidstatus(f.vindbaar.id, f.frits.id)).toBeNull();

      const verzoek = await adminDb()
        .from('group_join_requests')
        .select('status')
        .eq('id', id)
        .single();
      expect(verzoek.data?.status).toBe('pending');
    },
    TEST_TIMEOUT,
  );

  it(
    'raakt bij afwijzen het lidmaatschap niet aan',
    async () => {
      // De andere tak van de beslissing. Zonder deze test is een functie die
      // bij élke beslissing lid maakt ook groen.
      const vraag = await rpc(f.eva, 'vraag_lidmaatschap_aan', {
        p_group_id: f.vindbaar.id,
        p_bericht: null,
      });
      expect(vraag.ok).toBe(true);

      const id = await verzoekId(f.vindbaar.id, f.eva.id);
      const besluit = await rpc(f.anna, 'beslis_lidmaatschapsverzoek', {
        p_request_id: id,
        p_naar: 'declined',
      });

      expect(besluit.ok).toBe(true);
      expect(await lidstatus(f.vindbaar.id, f.eva.id)).toBeNull();
      expect(await toetredingsberichten(f.vindbaar.id, f.eva.id)).toBe(0);
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
