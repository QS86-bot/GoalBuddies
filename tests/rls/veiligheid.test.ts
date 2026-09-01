import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MELDREDENEN } from '../../src/modules/buddies/veiligheid-schemas';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Melden, blokkeren en uitzetten — QS8-232, migratie 0145.
 *
 * ⚠️ **Dit bestand bewaakt twee beloftes die allebei stil zijn, en dat is wat ze
 *    gevaarlijk maakt.** Een lek in een meldknop of een blokkade is niet te zien
 *    aan een scherm dat er raar uitziet; hij is te zien aan iemand die weet dat
 *    hij gemeld is. Er is dus geen enkel signaal dat dit fout gaat behalve deze
 *    toetsen.
 *
 *    1. **De gemelde persoon merkt niets** — ook niet als hij beheerder van de
 *       groep is. Dat laatste is het geval waarin het ertoe doet, en het is
 *       precies het geval dat een policy zonder de derde voorwaarde doorlaat.
 *    2. **Een blokkade is voor de geblokkeerde onzichtbaar én onontkoombaar.**
 *       Hij mag hem niet kunnen lezen, en hij mag er langs geen van de vier
 *       routes omheen.
 *
 * ⚠️ **De vier routes zijn de kern van dit bestand.** WERKVOORRAAD §7: zoek álle
 *    routes naar een effect, niet de route die je net gevonden hebt. Elke route
 *    heeft hieronder een eigen geval, want een blokkade die drie van de vier
 *    respecteert, is geen blokkade.
 *
 * ⚠️ Met de hand rood gemaakt; wat er per belofte gebroken is, staat bij het
 *    geval zelf.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Groep {
  id: string;
  code: string;
}

interface Fixture {
  /** Beheerder van de groep. Meldt Bram. */
  anna: TestUser;
  /** Gewoon lid. Wordt gemeld en later uitgezet. */
  bram: TestUser;
  /** Gewoon lid, ziet niets van de melding. */
  cor: TestUser;
  /** Buiten de groep. Blokkeert Anna, en komt er dus niet meer in. */
  dirk: TestUser;
  groep: Groep;
  /** Vindbaar, zodat route 2 en 4 te toetsen zijn. */
  vindbaar: Groep;
  doelId: string;
  berichtId: string;
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
  return { id: gelezen.group.id, code: gelezen.group.invite_code };
}

async function laatMeedoen(wie: TestUser, groep: Groep): Promise<void> {
  const { data, error } = await wie.db.rpc('join_group_with_code', { code: groep.code });
  if (error) throw new Error(`meedoen (HTTP): ${error.message}`);

  const gelezen = data as unknown as { ok?: boolean; reason?: string };
  if (gelezen.ok !== true) throw new Error(`meedoen mislukte: ${gelezen.reason ?? 'geen reden'}`);
}

interface Uitkomst {
  ok?: boolean;
  reason?: string;
  ontkoppelde_doelen?: number;
}

async function meld(
  wie: TestUser,
  argumenten: Record<string, unknown>,
): Promise<Uitkomst> {
  const { data, error } = await wie.db.rpc('meld', argumenten as never);
  if (error) throw new Error(`melden: ${error.message}`);
  return data as unknown as Uitkomst;
}

describe.skipIf(!rlsTestsConfigured)('melden, blokkeren en uitzetten', () => {
  beforeAll(async () => {
    const anna = await createTestUser('veilig-anna');
    const bram = await createTestUser('veilig-bram');
    const cor = await createTestUser('veilig-cor');
    const dirk = await createTestUser('veilig-dirk');

    const groep = await maakGroep(anna, 'VEILIG groep');
    const vindbaar = await maakGroep(anna, 'VEILIG vindbaar');

    await laatMeedoen(bram, groep);
    await laatMeedoen(cor, groep);

    const kolommen = await anna.db
      .from('groups')
      .update({ categorie: 'other', voertaal: 'nl' })
      .eq('id', vindbaar.id);
    if (kolommen.error) throw new Error(`kolommen: ${kolommen.error.message}`);

    const aan = await anna.db.rpc('zet_groepsontdekbaarheid', {
      p_group_id: vindbaar.id,
      p_naar: true,
      p_bevestigd: true,
    });
    if ((aan.data as unknown as Uitkomst)?.ok !== true) {
      throw new Error(`vindbaar: ${JSON.stringify(aan.data)}`);
    }

    const doel = await bram.db
      .from('goals')
      .insert({ owner_id: bram.id, title: 'VEILIG doel', target_date: '2027-06-30' })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const koppel = await bram.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groep.id });
    if (koppel.error) throw new Error(`koppelen: ${koppel.error.message}`);

    const bericht = await bram.db
      .from('chat_messages')
      .insert({ group_id: groep.id, sender_id: bram.id, body: 'VEILIG een bericht van Bram' })
      .select('id')
      .single();
    if (bericht.error || bericht.data === null) throw new Error(`bericht: ${bericht.error?.message}`);

    f = { anna, bram, cor, dirk, groep, vindbaar, doelId: doel.data.id, berichtId: bericht.data.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    for (const g of [f.groep, f.vindbaar]) {
      await adminDb().from('groups').delete().eq('id', g.id);
    }
    await adminDb().from('goals').delete().eq('id', f.doelId);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // De lijst in de app en de CHECK in de database
  // -------------------------------------------------------------------------

  it(
    'laat precies de meldredenen toe die de app kent',
    async () => {
      const { data, error } = await adminDb().rpc('check_waarden', {
        p_tabel: 'reports',
        p_constraint: 'reports_reden_geldig',
      });

      expect(error).toBeNull();
      const inDeDatabase = [...(data ?? [])].sort();

      expect(inDeDatabase.length, 'de constraint geeft geen waarden terug').toBeGreaterThan(0);
      expect(inDeDatabase).toEqual([...MELDREDENEN].sort());
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Melden
  // -------------------------------------------------------------------------

  it(
    'meldt een bericht en leidt de gemelde persoon uit het bericht af',
    async () => {
      const uit = await meld(f.anna, {
        p_group_id: f.groep.id,
        p_message_id: f.berichtId,
        p_reden: 'harassment',
        p_toelichting: 'VEILIG dit kan niet',
      });

      expect(uit.ok, JSON.stringify(uit)).toBe(true);

      const rij = await adminDb()
        .from('reports')
        .select('subject_id, reporter_id, bericht_kopie, reden')
        .eq('message_id', f.berichtId)
        .single();

      // ⚠️ Bram en niet iets wat de client meestuurde: die stuurde geen subject.
      expect(rij.data?.subject_id).toBe(f.bram.id);
      expect(rij.data?.reporter_id).toBe(f.anna.id);
      expect(rij.data?.reden).toBe('harassment');
      expect(rij.data?.bericht_kopie).toBe('VEILIG een bericht van Bram');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De kopie is er omdat de gemelde zijn eigen bericht mag weghalen.**
   *    Zonder kopie wijst de melding daarna naar niets, en een beheerder leest
   *    een melding zonder onderwerp — of hij verdwijnt helemaal, afhankelijk van
   *    de `on delete`.
   *
   * Rood gemaakt door `bericht_kopie` niet te vullen: de melding blijft dan
   * staan, maar er is niets meer te lezen.
   */
  it(
    'houdt de tekst vast nadat de gemelde zijn bericht weghaalt',
    async () => {
      const weg = await f.bram.db.from('chat_messages').delete().eq('id', f.berichtId);
      expect(weg.error).toBeNull();

      const rij = await adminDb()
        .from('reports')
        .select('message_id, bericht_kopie')
        .eq('subject_id', f.bram.id)
        .single();

      expect(rij.data?.message_id, 'de verwijzing hoort leeg te zijn').toBeNull();
      expect(rij.data?.bericht_kopie).toBe('VEILIG een bericht van Bram');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De belofte van dit issue, en de reden dat dit bestand bestaat.**
   *
   * Rood gemaakt door `subject_id <> auth.uid()` uit `reports_select` te halen —
   * en dan pas met Bram als beheerder, want als gewoon lid houdt de eerste helft
   * van de policy hem al tegen. Dat verschil is gemeten en niet beredeneerd: de
   * toets hieronder maakt Bram daarom eerst beheerder.
   */
  it(
    'laat de gemelde persoon zijn eigen melding niet zien, ook niet als beheerder',
    async () => {
      const alsLid = await f.bram.db.from('reports').select('*');
      expect(alsLid.data ?? [], 'als gewoon lid').toHaveLength(0);

      const promoveer = await f.anna.db
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', f.groep.id)
        .eq('user_id', f.bram.id);
      expect(promoveer.error).toBeNull();

      const alsBeheerder = await f.bram.db.from('reports').select('*');
      expect(alsBeheerder.data ?? [], 'als beheerder van dezelfde groep').toHaveLength(0);

      // En de beheerder die níét gemeld is, ziet hem wél.
      const bijAnna = await f.anna.db.from('reports').select('id');
      expect(bijAnna.data ?? [], 'de melder ziet zijn eigen melding').toHaveLength(1);

      await f.anna.db
        .from('group_members')
        .update({ role: 'member' })
        .eq('group_id', f.groep.id)
        .eq('user_id', f.bram.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een ander lid van de groep niets van de melding zien',
    async () => {
      const { data } = await f.cor.db.from('reports').select('*');
      expect(data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand rechtstreeks een melding schrijven, wijzigen of weghalen',
    async () => {
      const insert = await f.cor.db.from('reports').insert({
        reporter_id: f.cor.id,
        subject_id: f.bram.id,
        group_id: f.groep.id,
        reden: 'spam',
      });
      expect(insert.error, 'een kale insert hoort te falen').not.toBeNull();

      const update = await f.anna.db
        .from('reports')
        .update({ status: 'dismissed' })
        .eq('subject_id', f.bram.id)
        .select('id');
      expect(update.data ?? [], 'een status bijstellen hoort niets te raken').toHaveLength(0);

      const verwijder = await f.anna.db
        .from('reports')
        .delete()
        .eq('subject_id', f.bram.id)
        .select('id');
      expect(verwijder.data ?? [], 'weghalen hoort niets te raken').toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een melding over jezelf, over een vreemde en van buiten de groep',
    async () => {
      const zelf = await meld(f.anna, { p_group_id: f.groep.id, p_subject_id: f.anna.id });
      const vreemde = await meld(f.anna, { p_group_id: f.groep.id, p_subject_id: f.dirk.id });
      const buiten = await meld(f.dirk, { p_group_id: f.groep.id, p_subject_id: f.bram.id });

      expect(zelf.reason).toBe('self');
      expect(vreemde.reason).toBe('unknown_subject');
      expect(buiten.reason).toBe('not_member');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een melding over een systeembericht',
    async () => {
      const systeem = await adminDb()
        .from('chat_messages')
        .select('id')
        .eq('group_id', f.groep.id)
        .eq('type', 'system')
        .limit(1)
        .maybeSingle();

      expect(systeem.data?.id, 'de fixture heeft geen systeembericht').toBeDefined();

      const uit = await meld(f.anna, {
        p_group_id: f.groep.id,
        p_message_id: systeem.data?.id ?? '',
      });
      expect(uit.reason).toBe('unknown_message');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Blokkeren — de vier routes
  // -------------------------------------------------------------------------

  it(
    'laat de geblokkeerde zijn blokkade nergens lezen',
    async () => {
      const gezet = await f.anna.db.rpc('blokkeer', { p_user: f.dirk.id });
      expect((gezet.data as unknown as Uitkomst).ok).toBe(true);

      const bijDirk = await f.dirk.db.from('user_blocks').select('*');
      expect(bijDirk.data ?? [], 'de geblokkeerde leest de rij').toHaveLength(0);

      const bijAnna = await f.anna.db.from('user_blocks').select('blocked_id');
      expect(bijAnna.data ?? []).toHaveLength(1);
      expect(bijAnna.data?.[0]?.blocked_id).toBe(f.dirk.id);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Route 1.** Rood gemaakt door de `blokkade_met_groep()`-tak uit
   *    `join_group_with_code()` te halen: Dirk komt dan gewoon binnen bij Anna.
   *
   * ⚠️ **En `invalid` en niet iets eigens.** Zou hier `blocked` staan, dan weet
   *    Dirk dat iemand in díe groep hem geblokkeerd heeft.
   */
  it(
    'houdt een geblokkeerde buiten via een uitnodigingslink, met hetzelfde antwoord als een foute code',
    async () => {
      const { data } = await f.dirk.db.rpc('join_group_with_code', { code: f.groep.code });
      const uit = data as unknown as Uitkomst;

      expect(uit.ok).toBe(false);
      expect(uit.reason, 'de reden verraadt de blokkade').toBe('invalid');

      const lid = await adminDb()
        .from('group_members')
        .select('user_id')
        .eq('group_id', f.groep.id)
        .eq('user_id', f.dirk.id);
      expect(lid.data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De blokkade werkt twee kanten op, en dit is de helft die het makkelijkst
   *    ontbreekt.** Anna blokkeerde Dirk; nu blokkeert Dirk niemand, maar Anna
   *    mag evengoed niet in een groep van Dirk komen. Werkt hij maar één kant op,
   *    dan beschermt hij tegen benaderd worden en niet tegen samen in een groep
   *    zitten — en dat tweede is wat QS8-232 vraagt.
   *
   * Rood gemaakt door in `blokkade_met_groep()` één van de twee `or`-takken weg
   * te halen.
   */
  it(
    'werkt ook de andere kant op',
    async () => {
      const vanDirk = await maakGroep(f.dirk, 'VEILIG van Dirk');

      const { data } = await f.anna.db.rpc('join_group_with_code', { code: vanDirk.code });
      expect((data as unknown as Uitkomst).reason).toBe('invalid');

      await adminDb().from('groups').delete().eq('id', vanDirk.id);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Route 2 en route 4 in één geval, want ze horen bij elkaar:** de zoeklijst
   *    laat de groep niet zien, én de aanvraag wordt geweigerd met hetzelfde
   *    antwoord dat "die groep bestaat niet voor jou" al gaf.
   *
   * Rood gemaakt door de `not blokkade_met_groep(...)` uit `ontdek_groepen()` te
   * halen (dan staat de groep in de lijst) en door de derde tak van de
   * `not_open`-voorwaarde in `vraag_lidmaatschap_aan()` weg te laten (dan landt
   * de aanvraag).
   */
  it(
    'toont een geblokkeerde de groep niet in de zoeklijst en neemt zijn aanvraag niet aan',
    async () => {
      const gevonden = await f.dirk.db.rpc('ontdek_groepen', {
        p_categorie: null,
        p_taal: null,
        p_limit: 50,
        p_offset: 0,
      });
      const rijen = (gevonden.data ?? []) as unknown as readonly { group_id: string }[];
      expect(
        rijen.find((r) => r.group_id === f.vindbaar.id),
        'de groep staat in de zoeklijst van een geblokkeerde',
      ).toBeUndefined();

      // En voor iemand zonder blokkade staat hij er wél — anders bewijst het
      // bovenstaande alleen dat de lijst leeg is.
      const bijCor = await f.cor.db.rpc('ontdek_groepen', {
        p_categorie: null,
        p_taal: null,
        p_limit: 50,
        p_offset: 0,
      });
      const bij = (bijCor.data ?? []) as unknown as readonly { group_id: string }[];
      expect(bij.find((r) => r.group_id === f.vindbaar.id)).toBeDefined();

      const aanvraag = await f.dirk.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: f.vindbaar.id,
        p_bericht: null,
      });
      expect((aanvraag.data as unknown as Uitkomst).reason).toBe('not_open');

      const rij = await adminDb()
        .from('group_join_requests')
        .select('id')
        .eq('group_id', f.vindbaar.id)
        .eq('user_id', f.dirk.id);
      expect(rij.data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Route 3 — het venster dat route 2 openlaat.** Een aanvraag kan er al
   *    staan wanneer de blokkade ontstaat. Zonder deze toets is de blokkade te
   *    omzeilen door te wachten.
   *
   * Rood gemaakt door de `blocked`-tak uit `beslis_lidmaatschapsverzoek()` te
   * halen: de beheerder neemt de aanvraag dan gewoon aan.
   */
  it(
    'laat een aanvraag die er al stond daarna niet meer aannemen',
    async () => {
      const eva = await createTestUser('veilig-eva');

      const aanvraag = await eva.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: f.vindbaar.id,
        p_bericht: null,
      });
      expect((aanvraag.data as unknown as Uitkomst).ok).toBe(true);

      const geblokkeerd = await f.anna.db.rpc('blokkeer', { p_user: eva.id });
      expect((geblokkeerd.data as unknown as Uitkomst).ok).toBe(true);

      const verzoek = await f.anna.db
        .from('group_join_requests')
        .select('id')
        .eq('group_id', f.vindbaar.id)
        .eq('user_id', eva.id)
        .single();

      const beslis = await f.anna.db.rpc('beslis_lidmaatschapsverzoek', {
        p_request_id: verzoek.data?.id ?? '',
        p_naar: 'accepted',
      });
      expect((beslis.data as unknown as Uitkomst).reason).toBe('blocked');

      const lid = await adminDb()
        .from('group_members')
        .select('user_id')
        .eq('group_id', f.vindbaar.id)
        .eq('user_id', eva.id);
      expect(lid.data ?? []).toHaveLength(0);

      // ⚠️ Afwijzen mag wél — anders blijft de aanvraag voor altijd open staan.
      const afwijzen = await f.anna.db.rpc('beslis_lidmaatschapsverzoek', {
        p_request_id: verzoek.data?.id ?? '',
        p_naar: 'declined',
      });
      expect((afwijzen.data as unknown as Uitkomst).ok).toBe(true);
    },
    SETUP_TIMEOUT,
  );

  it(
    'laat een blokkade opheffen en daarna gaat de deur weer open',
    async () => {
      const op = await f.anna.db.rpc('deblokkeer', { p_user: f.dirk.id });
      expect((op.data as unknown as Uitkomst).ok).toBe(true);

      const { data } = await f.dirk.db.rpc('join_group_with_code', { code: f.groep.code });
      expect((data as unknown as Uitkomst).ok).toBe(true);

      // Terugzetten voor de gevallen hierna.
      await adminDb()
        .from('group_members')
        .delete()
        .eq('group_id', f.groep.id)
        .eq('user_id', f.dirk.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert jezelf blokkeren',
    async () => {
      const { data } = await f.anna.db.rpc('blokkeer', { p_user: f.anna.id });
      expect((data as unknown as Uitkomst).reason).toBe('self');
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft je eigen blokkadelijst mét naam terug',
    async () => {
      await f.cor.db.rpc('blokkeer', { p_user: f.bram.id });

      const { data, error } = await f.cor.db.rpc('mijn_blokkades');
      expect(error).toBeNull();

      const rijen = (data ?? []) as unknown as readonly { user_id: string; display_name: string }[];
      const rij = rijen.find((r) => r.user_id === f.bram.id);

      // ⚠️ De naam en niet alleen het id: zonder naam is de lijst niet te
      //    gebruiken, en dan kun je een blokkade niet opheffen.
      expect(rij?.display_name, 'de naam komt niet mee').toBeTruthy();

      await f.cor.db.rpc('deblokkeer', { p_user: f.bram.id });
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Uitzetten
  // -------------------------------------------------------------------------

  it(
    'weigert uitzetten zonder beheerderschap, zonder bevestiging en van jezelf',
    async () => {
      const doorLid = await f.cor.db.rpc('verwijder_lid', {
        p_group_id: f.groep.id,
        p_user_id: f.bram.id,
        p_bevestigd: true,
      });
      const zonder = await f.anna.db.rpc('verwijder_lid', {
        p_group_id: f.groep.id,
        p_user_id: f.bram.id,
        p_bevestigd: false,
      });
      const zelf = await f.anna.db.rpc('verwijder_lid', {
        p_group_id: f.groep.id,
        p_user_id: f.anna.id,
        p_bevestigd: true,
      });

      expect((doorLid.data as unknown as Uitkomst).reason).toBe('not_admin');
      expect((zonder.data as unknown as Uitkomst).reason).toBe('not_confirmed');
      expect((zelf.data as unknown as Uitkomst).reason).toBe('self');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Het autorisatiegat dat `verlaat_groep()` met zoveel woorden dichtzet, en
   *    dat een kale UPDATE openlaat.** `beslis_deadline_verzoek()` toetst het
   *    lidmaatschap van de *beslisser* en zegt niets over de aanvrager: blijft
   *    een verzoek `open`, dan kan de groep die iemand net heeft uitgezet nog
   *    steeds zijn streefdatum verzetten.
   *
   * Rood gemaakt door de `update deadline_requests` uit `verwijder_lid()` te
   * halen.
   */
  it(
    'ontkoppelt de doelen en trekt de openstaande deadline-verzoeken in',
    async () => {
      const verzoek = await f.bram.db.rpc('vraag_deadline_verschuiving', {
        p_goal_id: f.doelId,
        p_group_id: f.groep.id,
        p_new_date: '2027-09-30',
        p_reason: 'VEILIG het loopt anders omdat er van alles tussenkomt',
      });
      expect((verzoek.data as unknown as Uitkomst).ok, JSON.stringify(verzoek.data)).toBe(true);

      const uit = await f.anna.db.rpc('verwijder_lid', {
        p_group_id: f.groep.id,
        p_user_id: f.bram.id,
        p_bevestigd: true,
      });
      const gelezen = uit.data as unknown as Uitkomst;

      expect(gelezen.ok, JSON.stringify(gelezen)).toBe(true);
      expect(gelezen.ontkoppelde_doelen).toBe(1);

      const links = await adminDb()
        .from('goal_group_links')
        .select('goal_id')
        .eq('group_id', f.groep.id)
        .eq('goal_id', f.doelId);
      expect(links.data ?? [], 'het doel hangt nog aan de groep').toHaveLength(0);

      const open = await adminDb()
        .from('deadline_requests')
        .select('status')
        .eq('requester_id', f.bram.id)
        .eq('group_id', f.groep.id);
      expect(open.data?.every((r) => r.status !== 'open'), 'er staat nog een verzoek open').toBe(
        true,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **`inactive` en geen `delete`.** Vertrekken wist de rij; uitgezet worden
   *    laat hem staan, zodat `join_group_with_code()` de tak `removed` kan
   *    houden. Zou de rij weg zijn, dan loopt de uitgezette met dezelfde link
   *    weer binnen.
   */
  it(
    'laat de uitgezette niet terugkomen met dezelfde link',
    async () => {
      const lid = await adminDb()
        .from('group_members')
        .select('status')
        .eq('group_id', f.groep.id)
        .eq('user_id', f.bram.id)
        .single();
      expect(lid.data?.status).toBe('inactive');

      const { data } = await f.bram.db.rpc('join_group_with_code', { code: f.groep.code });
      expect((data as unknown as Uitkomst).reason).toBe('removed');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De audit hangt aan de tabel en niet aan de RPC**, want een beheerder kan
   *    sinds 0029 met één kaal verzoek aan PostgREST `status = 'inactive'` zetten.
   *    Zou het spoor in `verwijder_lid()` staan, dan is het precies zo
   *    betrouwbaar als de belofte dat niemand die route gebruikt.
   *
   * Rood gemaakt door de trigger `group_members_uitzetting` te droppen: dan
   * schrijft de RPC-weg nog steeds niets — er stond immers nooit een insert in de
   * functie — en verdwijnt het spoor volledig.
   */
  it(
    'schrijft een spoor, ook bij een uitzetting buiten de RPC om',
    async () => {
      const viaRpc = await adminDb()
        .from('group_events')
        .select('subject_id')
        .eq('group_id', f.groep.id)
        .eq('event_type', 'member_removed');
      expect(viaRpc.data ?? [], 'de RPC liet geen spoor na').toHaveLength(1);

      // Nu de kale weg: Cor eruit met een gewone UPDATE.
      const kaal = await f.anna.db
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', f.groep.id)
        .eq('user_id', f.cor.id);
      expect(kaal.error).toBeNull();

      const naKaal = await adminDb()
        .from('group_events')
        .select('subject_id')
        .eq('group_id', f.groep.id)
        .eq('event_type', 'member_removed');
      expect(naKaal.data ?? [], 'de kale UPDATE liet geen spoor na').toHaveLength(2);
    },
    TEST_TIMEOUT,
  );

  /**
   * Jezelf op `inactive` zetten is geen uitzetting.
   *
   * ⚠️ **Dit geval is herschreven nadat de mutatie hem groen liet**, en dat is
   *    het leerzame deel. Er stond eerst een vertrek via `verlaat_groep()` in —
   *    en die functie **verwijdert** de rij (0102) in plaats van hem op
   *    `inactive` te zetten, dus de UPDATE-trigger vuurde er sowieso nooit bij.
   *    De toets bewaakte niets: hij liep langs een pad dat een eerdere grendel al
   *    afvangt, precies de valkuil uit CLAUDE.md.
   *
   *    Het pad dat de voorwaarde wél raakt bleek smaller dan gedacht, en ook dat
   *    is gemeten en niet beredeneerd: een gewóón lid komt er ook niet, want
   *    `guard_group_member_update()` (0029) zet `new.status` voor hem terug. Wat
   *    overblijft is een **beheerder** die zijn eigen rij op `inactive` zet met
   *    een kale UPDATE — de beheerderstak van diezelfde guard laat dat door.
   *    Zonder `auth.uid() <> new.user_id` levert dat een `member_removed` op: een
   *    auditregel die zegt dat iemand eruit gezet is terwijl hij zelf wegging.
   *
   * Rood gemaakt door die voorwaarde uit `meld_uitzetting()` te halen.
   */
  it(
    'noemt jezelf inactief zetten geen uitzetting',
    async () => {
      const frank = await createTestUser('veilig-frank');
      await laatMeedoen(frank, f.vindbaar);

      // ⚠️ Beheerder, want alleen die komt langs `guard_group_member_update()`.
      //    Anna blijft de tweede beheerder, anders slaat de `last_admin`-grendel
      //    toe en toetst dit geval die in plaats van de trigger.
      const promoveer = await f.anna.db
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', f.vindbaar.id)
        .eq('user_id', frank.id);
      expect(promoveer.error).toBeNull();

      const eerder = await adminDb()
        .from('group_events')
        .select('id')
        .eq('group_id', f.vindbaar.id)
        .eq('event_type', 'member_removed');

      const zelf = await frank.db
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', f.vindbaar.id)
        .eq('user_id', frank.id);
      expect(zelf.error).toBeNull();

      const stand = await adminDb()
        .from('group_members')
        .select('status')
        .eq('group_id', f.vindbaar.id)
        .eq('user_id', frank.id)
        .single();
      expect(stand.data?.status, 'de wijziging is niet doorgekomen').toBe('inactive');

      const na = await adminDb()
        .from('group_events')
        .select('id')
        .eq('group_id', f.vindbaar.id)
        .eq('event_type', 'member_removed');
      expect(na.data ?? []).toHaveLength((eerder.data ?? []).length);
    },
    SETUP_TIMEOUT,
  );

  /**
   * ⚠️ Domeinregel 7: "X is uit de groep gezet" is een uitspraak over een ander
   *    die niets positiefs draagt — en waar de uitgezette niet meer op kan
   *    reageren, want hij kan de chat niet meer openen.
   */
  it(
    'stuurt geen systeembericht over een uitzetting',
    async () => {
      const { data } = await adminDb()
        .from('chat_messages')
        .select('system_event')
        .eq('group_id', f.groep.id)
        .not('system_event', 'is', null);

      const soorten = (data ?? []).map((r) => r.system_event);
      expect(soorten).not.toContain('member_removed');
    },
    TEST_TIMEOUT,
  );
});
