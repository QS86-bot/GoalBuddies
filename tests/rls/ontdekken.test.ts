import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { VOERTALEN } from '../../src/modules/buddies/schemas';
import { CATEGORIEEN } from '../../src/shared/categorieen';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Groepen ontdekken — QS8-231, migratie 0144.
 *
 * ⚠️ **De hoofdvraag van dit bestand is niet "werkt het zoeken" maar: kan een
 *    vreemde méér over een groep te weten komen dan de zes velden die hij hoort
 *    te zien?** Het acceptatiecriterium van QS8-231 vraagt dat expliciet *per
 *    kolom* en niet beredeneerd — want de les van EPIC 5 is dat de schermen de
 *    regel netjes aanhielden terwijl de database hem lekte.
 *
 *    Vandaar de vorm hieronder: de sleutels van de teruggegeven rij worden
 *    letterlijk vergeleken met een vaste lijst. Zou iemand ooit een kolom aan de
 *    `returns table` van `ontdek_groepen()` toevoegen — `invite_code` is de
 *    verleidelijke, want daarmee kan een scherm meteen laten deelnemen — dan
 *    wordt deze test rood vóór het scherm ooit gebouwd is.
 *
 * ⚠️ **De tweede vraag is de omweg**, en die is even belangrijk: `groups_select`
 *    blijft dicht. Een vreemde heeft na het zoeken een groeps-id in handen, en
 *    dat id mag geen sleutel zijn. Er staat hieronder daarom voor elke tabel die
 *    aan een groep hangt een toets dat er nul rijen uitkomen.
 *
 * ⚠️ **En de derde is de belangrijkste van de drie voor domeinregel 7:** een
 *    ontdekbare groep kan niet open zijn. Zou dat wel kunnen, dan is elke
 *    aanvrager die binnenkomt iemand die de gemiste weken van vreemden ziet — en
 *    dan is de regel via een omweg afgeschaft in plaats van verruimd.
 *
 * ⚠️ Met de hand rood gemaakt; wat er per belofte gebroken is, staat bij het
 *    geval zelf.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * De acht kolommen die `ontdek_groepen()` teruggeeft.
 *
 * ⚠️ **Dit is de belofte van dit issue, uitgeschreven.** Zes ervan gaan naar het
 *    scherm; `group_id` is er omdat je zonder id geen aanvraag kunt doen, en
 *    `totaal` is het aantal rijen voor de paginering. Er staat met opzet geen
 *    `invite_code`, geen `zichtbaarheid`, geen `created_by` en geen `status` in.
 */
const ZICHTBARE_KOLOMMEN = [
  'categorie',
  'group_id',
  'huddle_day',
  'leden',
  'naam',
  'omschrijving',
  'totaal',
  'voertaal',
] as const;

interface Groep {
  id: string;
  code: string;
}

interface Fixture {
  /** Beheerder van de vindbare groep. */
  anna: TestUser;
  /** Gewoon lid van de vindbare groep. */
  bram: TestUser;
  /** Kent niemand. De vreemde in elke toets hieronder. */
  cor: TestUser;
  vindbaar: Groep;
  /** Vindbaar noch beschermd: de tegenhanger voor de CHECK. */
  open: Groep;
  /** Beschermd en met categorie, maar niet vindbaar. Hoort nooit in de zoeklijst. */
  verborgen: Groep;
  doelId: string;
}

let f: Fixture;

async function maakGroep(eigenaar: TestUser, naam: string, zicht: string): Promise<Groep> {
  const { data, error } = await eigenaar.db.rpc('create_group', {
    group_name: naam,
    zichtbaarheid: zicht,
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
  ontdekbaar?: boolean;
  status?: string;
}

async function zetVindbaar(
  wie: TestUser,
  groupId: string,
  naar: boolean,
  bevestigd = true,
): Promise<Uitkomst> {
  const { data, error } = await wie.db.rpc('zet_groepsontdekbaarheid', {
    p_group_id: groupId,
    p_naar: naar,
    p_bevestigd: bevestigd,
  });
  if (error) throw new Error(`ontdekbaarheid: ${error.message}`);
  return data as unknown as Uitkomst;
}

async function zoek(
  kijker: TestUser,
  opties: { categorie?: string | null; taal?: string | null } = {},
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await kijker.db.rpc('ontdek_groepen', {
    p_categorie: opties.categorie ?? null,
    p_taal: opties.taal ?? null,
    p_limit: 50,
    p_offset: 0,
  });
  if (error) throw new Error(`zoeken: ${error.message}`);
  return (data ?? []) as unknown as readonly Record<string, unknown>[];
}

function vind(
  rijen: readonly Record<string, unknown>[],
  groupId: string,
): Record<string, unknown> | undefined {
  return rijen.find((rij) => rij.group_id === groupId);
}

describe.skipIf(!rlsTestsConfigured)('een groep die zich laat vinden', () => {
  beforeAll(async () => {
    const anna = await createTestUser('ontdek-anna');
    const bram = await createTestUser('ontdek-bram');
    const cor = await createTestUser('ontdek-cor');

    const vindbaar = await maakGroep(anna, 'ONTDEK vindbaar', 'beschermd');
    const open = await maakGroep(anna, 'ONTDEK open', 'open');
    const verborgen = await maakGroep(anna, 'ONTDEK verborgen', 'beschermd');

    await laatMeedoen(bram, vindbaar);

    // ⚠️ Via de gewone updateweg en niet via `adminDb()`: als een beheerder deze
    //    drie kolommen niet kan zetten, is de hele feature onbereikbaar en hoort
    //    dat hier stuk te gaan. Dat was op 01-09 precies de fout — er was geen
    //    kolomgrant voor UPDATE en niets merkte het.
    //
    // ⚠️ Geijkt door `grant update (categorie, omschrijving, voertaal)` uit de
    //    migratie te halen: dan valt déze regel om met `42501` en slaat het hele
    //    bestand over. Dat is de bedoelde uitslag — een feature waar geen enkele
    //    beheerder bij kan, hoort niet gedeeltelijk groen te zijn (regel 18
    //    vraag 5: is de keten ergens onderbroken terwijl elk schakeltje af is?).
    for (const groep of [vindbaar, verborgen]) {
      const gezet = await anna.db
        .from('groups')
        .update({
          categorie: 'fitness',
          omschrijving: 'ONTDEK wij lopen elke week samen hard.',
          voertaal: 'nl',
        })
        .eq('id', groep.id);
      if (gezet.error) throw new Error(`kolommen zetten: ${gezet.error.message}`);
    }

    const aan = await zetVindbaar(anna, vindbaar.id, true);
    if (aan.ok !== true) throw new Error(`vindbaar maken mislukte: ${JSON.stringify(aan)}`);

    const doel = await anna.db
      .from('goals')
      .insert({ owner_id: anna.id, title: 'ONTDEK doel', target_date: '2027-06-30' })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const koppel = await anna.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: vindbaar.id });
    if (koppel.error) throw new Error(`koppelen: ${koppel.error.message}`);

    f = { anna, bram, cor, vindbaar, open, verborgen, doelId: doel.data.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    for (const groep of [f.vindbaar, f.open, f.verborgen]) {
      await adminDb().from('groups').delete().eq('id', groep.id);
    }
    await adminDb().from('goals').delete().eq('id', f.doelId);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // De lijsten in de app en de CHECKs in de database
  // -------------------------------------------------------------------------

  /**
   * ⚠️ De derde kopie van dezelfde woordenlijst — `goals_category_valid` (0142)
   *    en `profiles_focus_areas_geldig` (0143) zijn de andere twee. Elk van de
   *    drie heeft een eigen toets, want een naad die je één keer legt is een
   *    naad die één keer uit elkaar loopt.
   */
  it(
    'laat als groepscategorie precies de gebieden toe die een doel kent',
    async () => {
      const { data, error } = await adminDb().rpc('check_waarden', {
        p_tabel: 'groups',
        p_constraint: 'groups_categorie_geldig',
      });

      expect(error).toBeNull();
      const inDeDatabase = [...(data ?? [])].sort();

      expect(inDeDatabase.length, 'de constraint geeft geen waarden terug').toBeGreaterThan(0);
      expect(inDeDatabase).toEqual([...CATEGORIEEN].sort());
    },
    TEST_TIMEOUT,
  );

  it(
    'laat als voertaal precies de talen toe die het profiel kent',
    async () => {
      const groepstalen = await adminDb().rpc('check_waarden', {
        p_tabel: 'groups',
        p_constraint: 'groups_voertaal_geldig',
      });
      const profieltalen = await adminDb().rpc('check_waarden', {
        p_tabel: 'profiles',
        p_constraint: 'profiles_locale_bekend',
      });

      const inDeDatabase = [...(groepstalen.data ?? [])].sort();

      expect(inDeDatabase.length, 'de constraint geeft geen waarden terug').toBeGreaterThan(0);
      expect(inDeDatabase).toEqual([...VOERTALEN].sort());
      expect(inDeDatabase, 'groep en profiel kennen niet dezelfde talen').toEqual(
        [...(profieltalen.data ?? [])].sort(),
      );
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Wat een vreemde ziet — per kolom
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Het acceptatiecriterium van dit issue, letterlijk.** Niet "de rij bevat
   *    geen invite_code" maar: de sleutelverzameling ís deze en geen andere. Het
   *    verschil telt, want een toets op één verboden kolom laat de zestien
   *    andere die er ooit bij kunnen komen ongemoeid.
   *
   * Rood gemaakt door `g.invite_code` aan de `returns table` en de select van
   * `ontdek_groepen()` toe te voegen: negen sleutels waar er acht horen.
   */
  it(
    'geeft een niet-lid precies acht kolommen en geen negende',
    async () => {
      const rijen = await zoek(f.cor);
      const rij = vind(rijen, f.vindbaar.id);

      expect(rij, 'de vindbare groep staat niet in de zoeklijst').toBeDefined();
      expect(Object.keys(rij ?? {}).sort()).toEqual([...ZICHTBARE_KOLOMMEN]);
    },
    TEST_TIMEOUT,
  );

  it(
    'toont een niet-lid de zes velden waar hij recht op heeft',
    async () => {
      const rij = vind(await zoek(f.cor), f.vindbaar.id);

      expect(rij?.naam).toBe('ONTDEK vindbaar');
      expect(rij?.categorie).toBe('fitness');
      expect(rij?.omschrijving).toBe('ONTDEK wij lopen elke week samen hard.');
      expect(rij?.voertaal).toBe('nl');
      expect(Number(rij?.leden)).toBe(2);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De omweg, en die is het halve issue.** Een vreemde heeft na het zoeken
   *    een geldig groeps-id. Dat id mag geen sleutel zijn: `groups_select` staat
   *    op `is_group_member(id)` en blijft daar staan.
   *
   * Rood gemaakt door `groups_select` een tak `or ontdekbaar` te geven: dan leest
   * Cor de hele rij, `invite_code` incluis, en kan hij zonder aanvraag naar
   * binnen.
   */
  it(
    'laat een niet-lid met het gevonden id nog steeds niets over de groep lezen',
    async () => {
      const { data, error } = await f.cor.db.from('groups').select('*').eq('id', f.vindbaar.id);

      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Vijf tabellen die aan een groep hangen, in één toets. Ze hebben elk hun
   *    eigen policy en die zijn elders getoetst; wat híer bewezen moet worden is
   *    dat het gevonden id ze geen van alle opent.
   */
  it(
    'laat een niet-lid met het gevonden id geen leden, doelen of chat lezen',
    async () => {
      const leden = await f.cor.db.from('group_members').select('*').eq('group_id', f.vindbaar.id);
      const doelen = await f.cor.db
        .from('goal_group_links')
        .select('*')
        .eq('group_id', f.vindbaar.id);
      const chat = await f.cor.db.from('chat_messages').select('*').eq('group_id', f.vindbaar.id);
      // ⚠️ `group_visible_streaks` heeft geen `group_id` — hij gaat per doel.
      //    Wat een vreemde hier niet mag zien is de reeks van het doel dat aan
      //    deze groep hangt, en dat is de goede vraag: de view is de plek waar
      //    besluit A41 zichtbaar wordt.
      const reeksen = await f.cor.db
        .from('group_visible_streaks')
        .select('*')
        .eq('goal_id', f.doelId);
      const gebeurtenissen = await f.cor.db
        .from('group_events')
        .select('*')
        .eq('group_id', f.vindbaar.id);

      expect(leden.data ?? [], 'leden').toHaveLength(0);
      expect(doelen.data ?? [], 'gekoppelde doelen').toHaveLength(0);
      expect(chat.data ?? [], 'chat').toHaveLength(0);
      expect(reeksen.data ?? [], 'reeksen').toHaveLength(0);
      expect(gebeurtenissen.data ?? [], 'groepsgebeurtenissen').toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'toont een groep die niet vindbaar is aan niemand van buiten',
    async () => {
      const rijen = await zoek(f.cor);

      expect(vind(rijen, f.verborgen.id), 'de verborgen groep staat in de zoeklijst').toBeUndefined();
      expect(vind(rijen, f.open.id), 'de open groep staat in de zoeklijst').toBeUndefined();
    },
    TEST_TIMEOUT,
  );

  it(
    'filtert op categorie en op taal',
    async () => {
      const raak = await zoek(f.cor, { categorie: 'fitness', taal: 'nl' });
      const mis = await zoek(f.cor, { categorie: 'study' });
      const andereTaal = await zoek(f.cor, { taal: 'en' });

      expect(vind(raak, f.vindbaar.id)).toBeDefined();
      expect(vind(mis, f.vindbaar.id)).toBeUndefined();
      expect(vind(andereTaal, f.vindbaar.id)).toBeUndefined();
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Vindbaar en open sluiten elkaar uit
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **De belangrijkste toets van dit bestand.** Een open groep deelt de
   *    gemiste weken van zijn leden (besluit A41). Zou hij ook vindbaar kunnen
   *    zijn, dan komt daar iedereen bij die aanklopt — en dan is domeinregel 7
   *    niet verruimd maar via een omweg afgeschaft.
   *
   * ⚠️ **Deze toets ijkt de RPC en níét de CHECK, en dat verschil is gemeten.**
   *    `zet_groepsontdekbaarheid()` kijkt zélf naar de zichtbaarheid en geeft
   *    `not_protected` terug vóórdat er iets geschreven wordt — dus met de CHECK
   *    weggehaald blijft deze test gewoon groen. Dat is de valkuil die CLAUDE.md
   *    beschrijft: een ijking die zijn geval door een pad voert dat een eerdere
   *    grendel al tegenhoudt, bewaakt niet wat hij belooft.
   *
   *    De CHECK zelf wordt geijkt door de toets hieronder, want
   *    `zet_groepszichtbaarheid()` weet niets van `ontdekbaar` en loopt er dus
   *    wél tegenaan. Allebei zijn ze nodig; ze bewaken twee verschillende dingen.
   */
  it(
    'weigert een open groep vindbaar te maken',
    async () => {
      const gezet = await zetVindbaar(f.anna, f.open.id, true);

      expect(gezet.ok).toBe(false);
      expect(gezet.reason).toBe('not_protected');

      const rij = await adminDb()
        .from('groups')
        .select('ontdekbaar')
        .eq('id', f.open.id)
        .single();
      expect(rij.data?.ontdekbaar).toBe(false);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Dezelfde grens van de andere kant**, en die was makkelijk te vergeten:
   *    de CHECK werkt in beide richtingen, dus een vindbare groep openzetten
   *    hoort net zo goed te stuiten. Zonder deze toets zou een migratie die de
   *    constraint vervangt door een trigger op INSERT ongemerkt de helft
   *    weglaten.
   *
   * ⚠️ **Dit is de enige toets die `groups_ontdekbaar_is_beschermd` raakt**, zie
   *    hierboven. Rood gemaakt door de constraint te droppen: de vindbare groep
   *    gaat dan open en staat vanaf dat moment in de zoeklijst mét de gemiste
   *    weken van zijn leden erachter.
   */
  it(
    'weigert een vindbare groep open te zetten',
    async () => {
      const { data, error } = await f.anna.db.rpc('zet_groepszichtbaarheid', {
        p_group_id: f.vindbaar.id,
        p_naar: 'open',
        p_bevestigd: true,
      });

      // De CHECK slaat toe binnen de functie: dat is een 23514 en geen `ok:false`.
      const mislukt = error !== null || (data as unknown as Uitkomst)?.ok === false;
      expect(mislukt, 'de vindbare groep ging open').toBe(true);

      const rij = await adminDb()
        .from('groups')
        .select('zichtbaarheid, ontdekbaar')
        .eq('id', f.vindbaar.id)
        .single();
      expect(rij.data?.zichtbaarheid).toBe('beschermd');
      expect(rij.data?.ontdekbaar).toBe(true);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ `ontdekbaar` is een toestemming en geen instelling: hij heeft geen
   *    kolomgrant én `guard_group_update()` zet hem terug.
   *
   * ⚠️⚠️ **"Deze toets raakt ze allebei tegelijk — wat genoeg is" stond hier tot
   *    02-09, en dat was het níet.** Van die twee grendels werkte er één:
   *    `guard_group_update()` was `SECURITY DEFINER` en besliste op
   *    `current_user`, en binnen een definer-functie is dat de eigenaar — dus de
   *    pin ging nooit om. Deze test bleef groen, want de kolomgrant alleen houdt
   *    het al tegen. **Een toets die twee sloten tegelijk raakt, kan niet zien
   *    dat er één kapot is**, en dat is precies de vorm van CLAUDE.md regel 18
   *    vraag 3.
   *
   *    Deze test blijft staan — hij bewaakt de belofte *"langs deze weg lukt het
   *    niet"*, en dat is de belofte die de gebruiker raakt.
   *    `tests/rls/groepspin.test.ts` (QS8-264) tilt de twee sloten uit elkaar
   *    door `authenticated` tijdelijk het kolomrecht te geven en te kijken of de
   *    pin het alsnog terugdraait.
   */
  it(
    'laat een beheerder ontdekbaar niet rechtstreeks zetten',
    async () => {
      const gezet = await f.anna.db
        .from('groups')
        .update({ ontdekbaar: true })
        .eq('id', f.verborgen.id);

      const rij = await adminDb()
        .from('groups')
        .select('ontdekbaar')
        .eq('id', f.verborgen.id)
        .single();

      // Of PostgREST weigert (geen grant), of de trigger draait hem terug. Wat
      // niet mag is dat de kolom omgaat.
      expect(rij.data?.ontdekbaar, `update gaf ${gezet.error?.code ?? 'geen fout'}`).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert vindbaar maken zonder bevestiging en zonder beheerderschap',
    async () => {
      const zonderBevestiging = await zetVindbaar(f.anna, f.verborgen.id, true, false);
      const doorEenLid = await zetVindbaar(f.bram, f.verborgen.id, true);

      expect(zonderBevestiging.reason).toBe('not_confirmed');
      expect(doorEenLid.reason).toBe('not_admin');
    },
    TEST_TIMEOUT,
  );

  it(
    'schrijft een systeembericht bij het vindbaar maken en niet bij het verbergen',
    async () => {
      const berichten = await adminDb()
        .from('chat_messages')
        .select('system_event')
        .eq('group_id', f.vindbaar.id)
        .eq('system_event', 'group_discoverable');

      expect(berichten.data ?? []).toHaveLength(1);

      const gebeurtenissen = await adminDb()
        .from('group_events')
        .select('event_type')
        .eq('group_id', f.vindbaar.id)
        .eq('event_type', 'discoverable_changed');

      expect(gebeurtenissen.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Aanvragen
  // -------------------------------------------------------------------------

  it(
    'laat een vreemde een aanvraag doen en de beheerder hem lezen',
    async () => {
      const { data, error } = await f.cor.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: f.vindbaar.id,
        p_bericht: 'ONTDEK ik loop drie keer per week.',
      });
      expect(error).toBeNull();
      expect((data as unknown as Uitkomst).ok).toBe(true);

      const bijBeheerder = await f.anna.db
        .from('group_join_requests')
        .select('id, user_id, bericht, status')
        .eq('group_id', f.vindbaar.id);

      expect(bijBeheerder.data ?? []).toHaveLength(1);
      expect(bijBeheerder.data?.[0]?.user_id).toBe(f.cor.id);
      expect(bijBeheerder.data?.[0]?.status).toBe('pending');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Een gewoon lid ziet niet wie er aanklopt.** Dat is geen tegenslag, maar
   *    het is wel een uitspraak over iemand die er nog niet bij hoort — en die
   *    gaat de groep niet aan. `group_join_requests_select` noemt daarom de
   *    beheerder en de aanvrager, en niemand anders.
   *
   * Rood gemaakt door de policy te verruimen naar `is_group_member(group_id)`.
   */
  it(
    'laat een gewoon lid de aanvragen van zijn groep niet zien',
    async () => {
      const { data, error } = await f.bram.db
        .from('group_join_requests')
        .select('*')
        .eq('group_id', f.vindbaar.id);

      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de aanvrager zijn eigen aanvraag zien',
    async () => {
      const { data } = await f.cor.db.from('group_join_requests').select('id, status');

      expect(data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De unieke partiële index `group_join_requests_een_openstaand`. Zonder hem
   *    is de knop een spamkanaal richting één beheerder — beveiligingsregel 5 van
   *    de andere kant.
   */
  it(
    'maakt van een tweede aanvraag geen tweede rij',
    async () => {
      const { data } = await f.cor.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: f.vindbaar.id,
        p_bericht: 'ONTDEK nog een keer dan.',
      });

      expect((data as unknown as Uitkomst).ok).toBe(true);

      const rijen = await f.anna.db
        .from('group_join_requests')
        .select('id')
        .eq('group_id', f.vindbaar.id);

      expect(rijen.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een aanvraag op een groep die niet vindbaar is',
    async () => {
      const verborgen = await f.cor.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: f.verborgen.id,
        p_bericht: null,
      });
      const open = await f.cor.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: f.open.id,
        p_bericht: null,
      });

      expect((verborgen.data as unknown as Uitkomst).reason).toBe('not_open');
      expect((open.data as unknown as Uitkomst).reason).toBe('not_open');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een aanvraag van iemand die er al in zit',
    async () => {
      const { data } = await f.bram.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: f.vindbaar.id,
        p_bericht: null,
      });

      expect((data as unknown as Uitkomst).reason).toBe('already_member');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een gewoon lid niet over een aanvraag beslissen',
    async () => {
      const verzoek = await f.anna.db
        .from('group_join_requests')
        .select('id')
        .eq('group_id', f.vindbaar.id)
        .single();

      const { data } = await f.bram.db.rpc('beslis_lidmaatschapsverzoek', {
        p_request_id: verzoek.data?.id ?? '',
        p_naar: 'accepted',
      });

      expect((data as unknown as Uitkomst).reason).toBe('not_admin');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de beheerder aannemen, en dan is de aanvrager lid',
    async () => {
      const verzoek = await f.anna.db
        .from('group_join_requests')
        .select('id')
        .eq('group_id', f.vindbaar.id)
        .single();

      const { data } = await f.anna.db.rpc('beslis_lidmaatschapsverzoek', {
        p_request_id: verzoek.data?.id ?? '',
        p_naar: 'accepted',
      });

      expect((data as unknown as Uitkomst).ok).toBe(true);

      const lid = await adminDb()
        .from('group_members')
        .select('status')
        .eq('group_id', f.vindbaar.id)
        .eq('user_id', f.cor.id)
        .single();

      expect(lid.data?.status).toBe('active');

      // ⚠️ Tweemaal beslissen mag niet: `for update` plus de statustoets.
      const nogEens = await f.anna.db.rpc('beslis_lidmaatschapsverzoek', {
        p_request_id: verzoek.data?.id ?? '',
        p_naar: 'declined',
      });
      expect((nogEens.data as unknown as Uitkomst).reason).toBe('already_decided');
    },
    TEST_TIMEOUT,
  );

  it(
    'schrijft geen systeembericht over een aanvraag',
    async () => {
      const berichten = await adminDb()
        .from('chat_messages')
        .select('system_event')
        .eq('group_id', f.vindbaar.id)
        .in('system_event', ['group_discoverable']);

      // Wél het bericht over vindbaar worden, en niets over wie er aanklopte.
      expect(berichten.data ?? []).toHaveLength(1);

      const spoor = await adminDb()
        .from('group_events')
        .select('event_type')
        .eq('group_id', f.vindbaar.id)
        .eq('event_type', 'join_request_decided');

      expect(spoor.data ?? [], 'het besluit staat niet in het auditspoor').toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De dagrem
  // -------------------------------------------------------------------------

  /**
   * ⚠️ Aanvragen zijn dezelfde spam-vector als uitnodigingen, van de andere kant:
   *    één iemand kan honderd beheerders bereiken. Zelfde vorm als
   *    `uitnodigingslimiet.test.ts`.
   *
   * ⚠️ De teller telt élke aanvraag van vandaag, ook die op een groep die
   *    intussen is beslist. Cor heeft er hierboven al één gedaan, dus zijn
   *    beginstand is negen — en dat is precies wat de toets vastlegt.
   */
  it(
    'telt af naar nul en weigert daarna',
    async () => {
      const start = await f.cor.db.rpc('lidmaatschapsverzoeken_over');
      expect(typeof start.data).toBe('number');
      expect(start.data as number).toBeLessThan(10);
      expect(start.data as number).toBeGreaterThanOrEqual(0);

      // ⚠️ **Tien verse groepen, verdeeld over twee verse beheerders.** Eén
      //    beheerder kan het niet: `create_group` heeft zijn eigen dagrem van
      //    tien én je kunt in hoogstens tien groepen zitten, en Anna heeft er in
      //    deze fixture al drie. Die twee remmen zijn hier geen onderwerp — ze
      //    stonden alleen in de weg, en dat is precies het soort ruis dat een
      //    test laat omvallen op iets dat de belofte niet raakt.
      const extra: Groep[] = [];
      for (const [n, beheerder] of [
        await createTestUser('ontdek-rem-een'),
        await createTestUser('ontdek-rem-twee'),
      ].entries()) {
        for (let i = 0; i < 5; i += 1) {
          const groep = await maakGroep(beheerder, `ONTDEK rem ${n}-${i}`, 'beschermd');
          const kolommen = await beheerder.db
            .from('groups')
            .update({ categorie: 'other', voertaal: 'nl' })
            .eq('id', groep.id);
          if (kolommen.error) throw new Error(`rem-kolommen: ${kolommen.error.message}`);

          const aan = await zetVindbaar(beheerder, groep.id, true);
          if (aan.ok !== true) throw new Error(`rem-vindbaar: ${JSON.stringify(aan)}`);
          extra.push(groep);
        }
      }

      let geweigerd = 0;
      for (const groep of extra) {
        const { data } = await f.cor.db.rpc('vraag_lidmaatschap_aan', {
          p_group_id: groep.id,
          p_bericht: null,
        });
        if ((data as unknown as Uitkomst).reason === 'rate_limited') geweigerd += 1;
      }

      expect(geweigerd, 'de dagrem heeft nooit toegeslagen').toBeGreaterThan(0);

      const over = await f.cor.db.rpc('lidmaatschapsverzoeken_over');
      expect(over.data).toBe(0);

      for (const groep of extra) {
        await adminDb().from('groups').delete().eq('id', groep.id);
      }
    },
    SETUP_TIMEOUT,
  );
});
