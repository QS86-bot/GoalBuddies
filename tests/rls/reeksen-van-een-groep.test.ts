import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * De naad tussen `group_visible_streaks` en `zichtbare_reeksen_van_groep()` —
 * QS8-210, migratie 0151.
 *
 * ⚠️ **Dit bestand bewaakt geen feature maar een gelijkheid, en dat is met
 *    opzet.** Sinds 0151 staat de maskering van besluit A41 op twee plekken: de
 *    view, die een API-oppervlak is waar `authenticated` SELECT op heeft, en de
 *    functie, die `group_overview()` gebruikt omdat de view op
 *    `security_barrier` staat en zijn `where` daardoor per rij van de héle
 *    `user_streaks` draait.
 *
 *    Twee plekken die hetzelfde horen te zeggen, is de vorm van de duurste fout
 *    die dit project kent (0032/0034). De grendel is hier geen gedeelde
 *    hulpfunctie — die zou per rij een extra definer-aanroep kosten en de winst
 *    van 0151 deels opeten — maar deze test: de twee paden op één opstelling,
 *    naast elkaar, in **beide** richtingen.
 *
 * ⚠️ **Beide richtingen, en dat is niet dubbelop.** Een functie die te wéinig
 *    teruggeeft is een verdwenen groepsgenoot; een functie die te véél
 *    teruggeeft is een lek onder domeinregel 7. Eén richting vangt één van die
 *    twee.
 *
 * ⚠️ **De opstelling bestaat uit de gevallen waar ze uiteen kúnnen lopen, niet
 *    uit het gemakkelijke geval.** Tien leden met tien reeksen in één beschermde
 *    groep geeft tien tegen tien en bewijst niets: elke voor de hand liggende
 *    fout in de maskering leeft in de randen. Vandaar een open groep, een
 *    beschermde groep, een doel dat aan allebei hangt, een eigenaar die is
 *    weggegaan, en een kijker die nergens lid van is. Regel 18, vraag 3.
 *
 * ⚠️ Met de hand rood gemaakt; wat er per belofte gebroken is, staat bij het
 *    geval zelf.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

const CYCLUS = '2024-05-06';

interface Groep {
  id: string;
  code: string;
}

interface Fixture {
  /** Eigenaar van alle doelen hieronder. Lid van beide groepen. */
  anna: TestUser;
  /** De kijker. Lid van beide groepen, eigenaar van niets. */
  bram: TestUser;
  /** Inactief lid van de beschermde groep; zijn doel hangt er nog wel aan. */
  cor: TestUser;
  /** Nergens lid van. */
  dries: TestUser;
  open: Groep;
  dicht: Groep;
  /** Een tweede beschermde groep die `bram` óók met `cor` deelt. */
  tweede: Groep;
  /** Gearchiveerd. Geen enkel pad hoort hier nog iets uit te geven. */
  archief: Groep;
  /** Alleen in de beschermde groep. */
  doelDicht: string;
  /** Alleen in de open groep. */
  doelOpen: string;
  /** In allebei — het geval waar de twee paden het snelst uiteenlopen. */
  doelGemengd: string;
  /** Van `cor`, gekoppeld aan `dicht` én `tweede`; `cor` is inactief in `dicht`. */
  doelVertrokken: string;
  /** Van `anna`, in de gearchiveerde groep. */
  doelArchief: string;
}

let f: Fixture;

/** Eén rij zoals beide paden hem horen te geven. */
interface Reeks {
  user_id: string;
  goal_id: string;
  current_streak: number;
  best_streak: number | null;
  last_cycle_start: string | null;
}

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

async function maakDoel(eigenaar: TestUser, titel: string, groepen: Groep[]): Promise<string> {
  const doel = await eigenaar.db
    .from('goals')
    .insert({ owner_id: eigenaar.id, title: titel, target_date: '2027-09-30' })
    .select('id')
    .single();
  if (doel.error || doel.data === null) throw new Error(`doel ${titel}: ${doel.error?.message}`);

  for (const groep of groepen) {
    const koppel = await eigenaar.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groep.id });
    if (koppel.error) throw new Error(`koppelen ${titel}: ${koppel.error.message}`);
  }
  return doel.data.id;
}

/**
 * Wat de view déze kijker geeft, beperkt tot de doelen van één groep.
 *
 * ⚠️ De view heeft geen `group_id` — hij gaat per doel. De beperking tot de
 *    groep gebeurt hier met de doel-ids, want anders vergelijk je een lijst over
 *    alle groepen met een lijst over één.
 */
async function viaView(kijker: TestUser, doelIds: readonly string[]): Promise<readonly Reeks[]> {
  const { data, error } = await kijker.db
    .from('group_visible_streaks')
    .select('user_id, goal_id, current_streak, best_streak, last_cycle_start')
    .in('goal_id', [...doelIds]);
  if (error) throw new Error(`view: ${error.message}`);
  return (data ?? []) as unknown as readonly Reeks[];
}

/**
 * De doel-ids die aan een groep hangen.
 *
 * ⚠️ **Afgeleid en niet opgeschreven, en dat is geen netheid.** De eerste versie
 *    van dit bestand gaf elke gelijkheidstoets zijn eigen handgeschreven lijst
 *    doelen. Toen de opstelling er één bij kreeg, vergeleek één test een lijst
 *    van twee met een lijst van drie en werd rood om een reden die niets met de
 *    belofte te maken had. Een lijst die de opstelling herhaalt, loopt er ooit
 *    uit — dan bewaakt de test de opstelling van gisteren.
 */
async function doelenVan(groupId: string): Promise<readonly string[]> {
  const { data, error } = await adminDb()
    .from('goal_group_links')
    .select('goal_id')
    .eq('group_id', groupId);
  if (error) throw new Error(`doelen van groep: ${error.message}`);
  return (data ?? []).map((rij) => rij.goal_id);
}

/** Wat de functie déze kijker geeft voor één groep. */
async function viaFunctie(kijker: TestUser, groupId: string): Promise<readonly Reeks[]> {
  const { data, error } = await kijker.db.rpc('zichtbare_reeksen_van_groep', {
    p_group_id: groupId,
  });
  if (error) throw new Error(`functie: ${error.message}`);
  return (data ?? []) as unknown as readonly Reeks[];
}

/** Een vergelijkbare sleutel per rij, zodat volgorde niet meetelt. */
function sleutels(rijen: readonly Reeks[]): readonly string[] {
  return rijen
    .map(
      (r) =>
        `${r.goal_id}|${r.user_id}|${r.current_streak}|${r.best_streak ?? 'NULL'}|${r.last_cycle_start ?? 'NULL'}`,
    )
    .sort();
}

describe.skipIf(!rlsTestsConfigured)('de reeksen van een groep, langs twee paden', () => {
  beforeAll(async () => {
    const anna = await createTestUser('reeksen-anna');
    const bram = await createTestUser('reeksen-bram');
    const cor = await createTestUser('reeksen-cor');
    const dries = await createTestUser('reeksen-dries');

    const open = await maakGroep(anna, 'Reeksen-open', 'open');
    const dicht = await maakGroep(anna, 'Reeksen-dicht', 'beschermd');
    const tweede = await maakGroep(anna, 'Reeksen-tweede', 'beschermd');
    const archief = await maakGroep(anna, 'Reeksen-archief', 'beschermd');

    await laatMeedoen(bram, open);
    await laatMeedoen(bram, dicht);
    await laatMeedoen(bram, tweede);
    await laatMeedoen(bram, archief);
    await laatMeedoen(cor, dicht);
    await laatMeedoen(cor, tweede);

    const doelDicht = await maakDoel(anna, 'REEKSEN dicht', [dicht]);
    const doelOpen = await maakDoel(anna, 'REEKSEN open', [open]);
    const doelGemengd = await maakDoel(anna, 'REEKSEN gemengd', [open, dicht]);
    // ⚠️ **Aan allebei de beschermde groepen, en dát is het geval waar de eerste
    //    versie van deze migratie de mist in ging.** `cor` wordt zo meteen
    //    inactief in `dicht` maar blijft actief in `tweede`. Een rijfilter die
    //    op déze groep kijkt (`join group_members o` op `p_group_id`) laat hem
    //    dan weg; de view kijkt naar élke gedeelde levende groep en houdt hem.
    //    Zonder deze tweede koppeling geven beide vormen hetzelfde en kan geen
    //    enkele test dat verschil zien.
    const doelVertrokken = await maakDoel(cor, 'REEKSEN vertrokken', [dicht, tweede]);
    const doelArchief = await maakDoel(anna, 'REEKSEN archief', [archief]);

    // ⚠️ `best_streak` hoger dan `current_streak`: dát is de combinatie die een
    //    verbroken reeks verraadt. Waren ze gelijk, dan zou een lek er
    //    onschuldig uitzien en zou deze hele opstelling niets kunnen bewijzen.
    //
    //    Via de admin-client, want `user_streaks` is een cache die de database
    //    zelf bijhoudt en de policy erop is eigenaar-only.
    const reeksen = await adminDb()
      .from('user_streaks')
      .upsert([
        ...[doelDicht, doelOpen, doelGemengd].map((goal_id) => ({
          user_id: anna.id,
          goal_id,
          current_streak: 2,
          best_streak: 7,
          last_cycle_start: CYCLUS,
        })),
        {
          user_id: anna.id,
          goal_id: doelArchief,
          current_streak: 2,
          best_streak: 7,
          last_cycle_start: CYCLUS,
        },
        {
          user_id: cor.id,
          goal_id: doelVertrokken,
          current_streak: 3,
          best_streak: 9,
          last_cycle_start: CYCLUS,
        },
      ]);
    if (reeksen.error) throw new Error(`reeksen: ${reeksen.error.message}`);

    // `cor` wordt inactief lid van de beschermde groep terwijl zijn doel eraan
    // gekoppeld blijft. Dat is de toestand die de eigenaarshelft van 0102
    // (QS8-57) moet afvangen: een oud-lid dat zijn reeks aan een groep bleef
    // uitdelen die hij verlaten had.
    //
    // ⚠️ **Met de admin-client, en dat is geen luiheid maar de enige weg.** Zowel
    //    `verlaat_groep()` als `verwijder_lid()` wissen de rij in
    //    `goal_group_links` méé; via de app is "inactief lid met een levende
    //    koppeling" dus niet te bereiken. De eerste versie van deze opstelling
    //    riep `verlaat_groep()` aan en was daardoor groen gebleven terwijl de
    //    eigenaarshelft uit de functie geknipt was — de test raakte de belofte
    //    niet, hij toetste dat een verdwenen koppeling verdwenen is. CLAUDE.md
    //    regel 18, vraag 3.
    //
    //    De grendel blijft de moeite waard: hij staat om dezelfde reden in
    //    `shares_group_with_goal()`, en de dag dat er een zachtere manier van
    //    weggaan bijkomt is hij het enige dat die reeks binnenhoudt.
    const inactief = await adminDb()
      .from('group_members')
      .update({ status: 'inactive' })
      .eq('group_id', dicht.id)
      .eq('user_id', cor.id);
    if (inactief.error) throw new Error(`inactief zetten: ${inactief.error.message}`);

    // De groep gaat op archief nádat alles erin staat.
    const gearchiveerd = await anna.db.rpc('archiveer_groep', {
      p_group_id: archief.id,
      p_bevestigd: true,
    });
    if (gearchiveerd.error) throw new Error(`archiveren (HTTP): ${gearchiveerd.error.message}`);
    const uitslag = gearchiveerd.data as unknown as { ok?: boolean; reason?: string };
    if (uitslag.ok !== true) throw new Error(`archiveren mislukte: ${uitslag.reason ?? '?'}`);

    f = {
      anna,
      bram,
      cor,
      dries,
      open,
      dicht,
      tweede,
      archief,
      doelDicht,
      doelOpen,
      doelGemengd,
      doelVertrokken,
      doelArchief,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin
      .from('goals')
      .delete()
      .in('id', [f.doelDicht, f.doelOpen, f.doelGemengd, f.doelVertrokken, f.doelArchief]);
    await admin
      .from('groups')
      .delete()
      .in('id', [f.open.id, f.dicht.id, f.tweede.id, f.archief.id]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // De naad zelf
  // -------------------------------------------------------------------------

  it(
    'geeft in de beschermde groep aan beide kanten precies dezelfde rijen',
    async () => {
      // ⚠️ Rood gemaakt door in 0151 `deelt_open_groep_met_doel(d.id)` te
      //    vervangen door `lid_van_open_groep(p_group_id)` — de groepsgebonden
      //    variant die er op het eerste gezicht juister uitziet. `doelGemengd`
      //    hangt óók in de open groep, dus de view geeft daar `best_streak = 7`
      //    en de functie `null`. Precies de stilzwijgende divergentie waar dit
      //    bestand voor bestaat.
      const view = sleutels(await viaView(f.bram, await doelenVan(f.dicht.id)));
      const functie = sleutels(await viaFunctie(f.bram, f.dicht.id));

      expect(functie).toEqual(view);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft in de open groep aan beide kanten precies dezelfde rijen',
    async () => {
      const view = sleutels(await viaView(f.bram, await doelenVan(f.open.id)));
      const functie = sleutels(await viaFunctie(f.bram, f.open.id));

      expect(functie).toEqual(view);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft de eigenaar zelf langs beide paden hetzelfde',
    async () => {
      // De eigenaar ziet zijn eigen `best_streak` altijd, ongeacht de
      // zichtbaarheid van de groep. Dat is de andere tak van dezelfde `case`.
      const view = sleutels(await viaView(f.anna, await doelenVan(f.dicht.id)));
      const functie = sleutels(await viaFunctie(f.anna, f.dicht.id));

      expect(functie).toEqual(view);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Wat de functie op zichzelf moet doen
  // -------------------------------------------------------------------------

  it(
    'maskeert best_streak en last_cycle_start in een beschermde groep',
    async () => {
      // ⚠️ Rood gemaakt door de `case` in 0151 weg te halen en `s.best_streak`
      //    kaal terug te geven. Dit is de toets die zegt wát er gelijk moet
      //    zijn; zonder hem kunnen de twee paden in stilte allebéi lekken en
      //    blijft de gelijkheidstoets hierboven groen.
      const rijen = await viaFunctie(f.bram, f.dicht.id);
      const eigen = rijen.find((r) => r.goal_id === f.doelDicht);

      expect(eigen?.current_streak).toBe(2);
      expect(eigen?.best_streak).toBeNull();
      expect(eigen?.last_cycle_start).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'toont best_streak wel in een open groep',
    async () => {
      const rijen = await viaFunctie(f.bram, f.open.id);
      const eigen = rijen.find((r) => r.goal_id === f.doelOpen);

      expect(eigen?.best_streak).toBe(7);
      expect(eigen?.last_cycle_start).toBe(CYCLUS);
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt het doel van een inactief lid dat elders nog actief is, precies zoals de view',
    async () => {
      // ⚠️ **Dit geval is contra-intuïtief en het staat er met opzet.** `cor` is
      //    inactief in `dicht`, dus je zou verwachten dat zijn doel daar
      //    verdwijnt. Dat gebeurt niet: `shares_group_with_goal()` vraagt of de
      //    kijker een lévende groep met dit doel deelt waar de eigenaar óók nog
      //    actief in is — en dat is `tweede`. De view doet dat sinds 0078 zo, en
      //    0151 doet het daarom net zo.
      //
      //    ⚠️ Rood gemaakt door in 0151 `shares_group_with_goal(d.id)` te
      //    vervangen door `join group_members o on o.group_id = l.group_id and
      //    o.user_id = d.owner_id and o.status <> 'inactive'` — de
      //    groepsgebonden vorm die er juister uitziet. Die is strénger en laat
      //    dit doel wél weg: een gedragsverandering in het scherm dat elk
      //    groepslid opent, precies wat een prestatiemigratie niet hoort te
      //    doen.
      const functie = await viaFunctie(f.bram, f.dicht.id);
      const view = await viaView(f.bram, [f.doelVertrokken]);

      expect(sleutels(functie).filter((k) => k.startsWith(f.doelVertrokken))).toEqual(
        sleutels(view),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een niet-lid niets',
    async () => {
      // ⚠️ Rood gemaakt door de `exists` op het lidmaatschap uit 0151 weg te
      //    halen. Dat is de énige autorisatie in de functie: hij is
      //    `security definer` en leest `user_streaks`, waar de kijker geen recht
      //    op heeft. Zonder die `exists` kan iedere ingelogde gebruiker de
      //    reeksen van elke groep opvragen als hij het groeps-id kent.
      const rijen = await viaFunctie(f.dries, f.dicht.id);

      expect(rijen).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een inactief lid niets meer over díe groep',
    async () => {
      // ⚠️ Dezelfde grendel als hierboven maar aan de kijkerskant: de `exists`
      //    gaat over `p_group_id` en niet over "een groep". `cor` is elders nog
      //    actief en krijgt hier tóch niets.
      const rijen = await viaFunctie(f.cor, f.dicht.id);

      expect(rijen).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft niets uit een gearchiveerde groep, langs beide paden',
    async () => {
      // ⚠️ Rood gemaakt door `and gr.status <> 'archived'` uit de `exists` in
      //    0151 te halen: dan geeft de RPC de reeks van `anna` gewoon terug.
      //    Zonder dít geval blijft die mutatie op alle acht andere tests groen —
      //    de security-ronde van 03-09 heeft dat gemeten, en dat is precies de
      //    reden dat deze test er staat. 0092 en 0102 hebben een hele migratie
      //    besteed aan dit effect op de ándere oppervlakken.
      const functie = await viaFunctie(f.bram, f.archief.id);
      const view = await viaView(f.bram, await doelenVan(f.archief.id));

      expect(functie).toHaveLength(0);
      expect(view).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft total_points niet terug — besluit A42',
    async () => {
      // ⚠️ **Een toets op de vórm en niet op een waarde, want dat is wat A42
      //    belooft.** Een dalend puntentotaal is zichtbaar bewijs van een
      //    gemiste week. `policies.test.ts` doet ditzelfde voor
      //    `group_overview()`; zonder deze kopie is de nieuwe RPC de enige van de
      //    twee paden waar niets tegen een "handige" uitbreiding staat.
      const rijen = await viaFunctie(f.bram, f.open.id);

      expect(rijen.length).toBeGreaterThan(0);
      for (const rij of rijen) {
        expect(Object.keys(rij)).not.toContain('total_points');
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'heeft geen enkele functie meer die de barrière-view leest',
    async () => {
      // ⚠️ **Dit is de énige test die de réden van 0151 bewaakt.** Alle andere
      //    toetsen de gelijkheid van de twee paden, en die blijft waar als
      //    iemand `left join group_visible_streaks` terugzet in
      //    `group_overview()` — dan is het weer 9384 executies in plaats van 133
      //    en wordt niets rood. Regel 18 vraag 3.
      //
      //    ⚠️ Rood gemaakt door precies die join terug te zetten: dan meldt
      //    `barrierelezers()` `group_overview`.
      const { data, error } = await adminDb().rpc('barrierelezers');
      if (error) throw new Error(`barrierelezers: ${error.message}`);

      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
