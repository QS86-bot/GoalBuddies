/**
 * QS8-342 — "je hebt nog geen doel om te delen" betekent dat je er geen hebt.
 *
 * ⚠️ **De belofte:** het koppelscherm toont een lege staat *dan en slechts dan
 *    als* er werkelijk geen koppelbaar doel is.
 *
 *    Vóór deze reparatie deed het scherm `fetchDoelen(userId)` — pagina 0, twintig
 *    doelen op `target_date` — en streepte daar de al gekoppelde doelen vanaf. Bij
 *    eenentwintig doelen waarvan de eerste twintig gekoppeld waren, bleef er niets
 *    over en las de gebruiker *"Je hebt nog geen doel om te delen"* met een knop
 *    "Nieuw doel" eronder. Doodlopend.
 *
 * ⚠️ **Dit is QS8-226, één scherm verderop.** Daar is dezelfde fout in augustus
 *    gerepareerd en staat de uitleg uitgeschreven in `fetchDoelnamen()`. De
 *    reparatie hing aan de plek en niet aan de belofte (regel 18, vraag 4), dus
 *    dit scherm bleef staan. Deze test hangt daarom aan het gétal — eenentwintig
 *    en twintig — en niet aan een scherm.
 *
 * ⚠️ **Waarom dit de query toetst en niet `fetchKoppelbareDoelen()` zelf.** Die
 *    functie leunt op `supabase()`, de client van de app, en die draagt hier geen
 *    testtoken. De RLS-suite importeert daarom alleen pure dingen uit
 *    `src/modules`. Wat hier staat is dus dezelfde vraag met de client van de
 *    harnas.
 *
 *    ⚠️ Dat is een naad: verandert de functie van vorm, dan blijft deze test
 *    groen. `tests/beloftes/koppelscherm-vraagt-koppelbare-doelen.test.ts` dekt de andere helft — dát het
 *    scherm deze functie aanroept en niet meer `fetchDoelen`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 300_000;
const TEST_TIMEOUT = 60_000;

/** Zoveel doelen geeft `fetchDoelen()` per pagina — en precies daar zat de bug. */
const PER_PAGINA = 20;

let alice: TestUser;
let groupId: string;
let doelIds: string[] = [];

/**
 * De vraag die `fetchKoppelbareDoelen()` stelt, met de client van de harnas.
 *
 * ⚠️⚠️ **Sinds QS8-345 is dat de RPC en niet meer een `not.in`.** De uitsluitlijst
 *    ging als id-lijst mee in de URL, en die heeft een grens: 📏 rond de 410 id's
 *    (≈15,3 KB) geeft `fetch` een harde `Headers Overflow Error`. Deze helper
 *    neemt daarom geen `uitsluiten` meer aan — er valt niets meer uit te sluiten
 *    aan deze kant, en dát is de reparatie.
 *
 * ⚠️ `count: 'exact'` met een `range` erop: één verzoek, en de telling blijft
 *    exact. `koppelbare_doelen()` pagineert met opzet niet zelf — zou hij dat
 *    doen, dan telt PostgREST wat er terugkomt en liegt `meer` opnieuw.
 */
async function koppelbaar(): Promise<{ rijen: number; totaal: number }> {
  const { data, error, count } = await alice.db
    .rpc('koppelbare_doelen', { p_group_id: groupId }, { count: 'exact' })
    .range(0, PER_PAGINA - 1);

  if (error) throw new Error(`koppelbaar: ${error.message}`);
  expect(count).not.toBeNull();
  return { rijen: (data ?? []).length, totaal: count ?? -1 };
}

describe.skipIf(!rlsTestsConfigured)('QS8-342 — de lege staat van het koppelscherm is waar', () => {
  beforeAll(async () => {
    alice = await createTestUser('koppelbaar-alice');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Koppelgroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    groupId = gd.group.id;
    registreerGroep(groupId);

    // ⚠️ Eenentwintig, want twintig is de paginagrootte. Bij precies twintig zou
    //    de oude code toevallig kloppen en bewees deze test niets.
    const rijen = Array.from({ length: PER_PAGINA + 1 }, (_, i) => ({
      owner_id: alice.id,
      title: `Koppeldoel ${String(i).padStart(2, '0')}`,
      target_date: addDays(vandaag, i + 1),
    }));

    const gemaakt = await adminDb().from('goals').insert(rijen).select('id, target_date');
    if (gemaakt.error) throw new Error(`doelen: ${gemaakt.error.message}`);
    doelIds = (gemaakt.data ?? [])
      .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)))
      .map((r) => r.id as string);
    expect(doelIds).toHaveLength(PER_PAGINA + 1);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'met eenentwintig doelen en nul gekoppeld staat er een volle pagina',
    async () => {
      // ⚠️ De must-allow. Zonder deze is "de lijst is niet leeg" hieronder gratis:
      //    een query die altijd alles teruggeeft, haalt hem ook.
      expect((await koppelbaar()).rijen).toBe(PER_PAGINA);
      // ⚠️ En de telling is die van de héle verzameling, niet van de pagina.
      expect((await koppelbaar()).totaal).toBe(PER_PAGINA + 1);
    },
    TEST_TIMEOUT,
  );

  it(
    'met de eerste twintig gekoppeld blijft het eenentwintigste doel over — en dat is precies wat er misging',
    async () => {
      const koppelingen = doelIds
        .slice(0, PER_PAGINA)
        .map((goal_id) => ({ goal_id, group_id: groupId }));

      const link = await adminDb().from('goal_group_links').insert(koppelingen);
      if (link.error) throw new Error(`koppelen: ${link.error.message}`);

      // ⚠️ **Dit is het getal waar het om gaat.** De oude code vroeg pagina 0 op
      //    (deze twintig) en trok ze eraf: nul over, "je hebt nog geen doel".
      //    Serverzijdig uitsluiten geeft er één.
      expect((await koppelbaar()).rijen).toBe(1);
      expect((await koppelbaar()).totaal).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'en pas als álles gekoppeld is, is de lijst werkelijk leeg',
    async () => {
      // ⚠️ De tegenhanger: de lege staat moet nog steeds kúnnen. Een reparatie die
      //    hem onbereikbaar maakt, is net zo fout als een die hem te vroeg toont.
      const laatste = doelIds[PER_PAGINA];
      if (laatste === undefined) throw new Error('geen eenentwintigste doel');

      const link = await adminDb()
        .from('goal_group_links')
        .insert([{ goal_id: laatste, group_id: groupId }]);
      if (link.error) throw new Error(`laatste koppelen: ${link.error.message}`);

      expect((await koppelbaar()).rijen).toBe(0);
      expect((await koppelbaar()).totaal).toBe(0);
    },
    TEST_TIMEOUT,
  );
  /**
   * ⚠️⚠️ **Verhuisd uit `tests/beloftes/uitsluitlijst-is-alleen-van-jezelf.test.ts`,
   *    dat met QS8-345 zijn onderwerp verloor.** Die test bewaakte dat
   *    `mijnGekoppeldeDoelIds()` alleen jóuw koppelingen ophaalde: `goal_group_links`
   *    bevat de doelen van élk groepslid, en zonder het owner-filter werd de
   *    uitsluitlijst zo groot als de hele groep. Die functie bestaat niet meer —
   *    de RPC sluit serverzijdig uit — maar **de belofte staat nog**: de
   *    koppelingen van een groepsgenoot mogen jouw lijst niet inkorten.
   *
   *    Regel 18 waarschuwt precies hiervoor: bij een verhuizing verhuizen de
   *    tests mee en blijven ze groen, want ze toetsen wat er in het bestand staat
   *    en niet wat het bestand beloofde. Deze belofte hoort nu hier, tegen de
   *    échte RPC in plaats van tegen een nagemaakte client.
   */
  it(
    'trekt de koppelingen van een groepsgenoot er niet vanaf',
    async () => {
      const bram = await createTestUser('koppelbaar-bram');
      const lid = await adminDb()
        .from('group_members')
        .insert({ group_id: groupId, user_id: bram.id, role: 'member', status: 'active' });
      if (lid.error) throw new Error(`bram als lid: ${lid.error.message}`);

      const vanBram = await adminDb()
        .from('goals')
        .insert({ owner_id: bram.id, title: 'doel van Bram', target_date: '2027-06-01' })
        .select('id')
        .single();
      if (vanBram.error) throw new Error(`doel van Bram: ${vanBram.error.message}`);

      const voor = await koppelbaar();

      const link = await adminDb()
        .from('goal_group_links')
        .insert({ goal_id: vanBram.data.id, group_id: groupId });
      if (link.error) throw new Error(`koppeling van Bram: ${link.error.message}`);

      // ⚠️ Bram koppelt zíjn doel aan dezelfde groep. Alice' lijst hoort daar
      //    niets van te merken — noch in de rijen, noch in de telling.
      const na = await koppelbaar();
      expect(na).toEqual(voor);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️⚠️ **Dit is de bug van QS8-345 zelf.** 📏 Rond de 410 id's in de `not.in`
   *    gaf `fetch` een harde `Headers Overflow Error` en stond het koppelblok
   *    permanent in de foutstaat. Vijfhonderd koppelingen is ruim over die klif;
   *    met de RPC gaat er niets meer over de URL en is het aantal koppelingen
   *    niet meer zichtbaar in de vraag.
   *
   * ⚠️ De must-allow zit erin: er blijft één los doel over en dát hoort er te
   *    staan. Zonder die helft is "geen foutmelding" ook groen als het antwoord
   *    stilletjes leeg is.
   */
  it(
    'blijft antwoorden bij vijfhonderd koppelingen, waar de uitsluitlijst in de URL stukliep',
    async () => {
      const veel = await adminDb()
        .from('goals')
        .insert(
          Array.from({ length: 500 }, (_, i) => ({
            owner_id: alice.id,
            title: `bulk ${i}`,
            target_date: '2028-01-01',
          })),
        )
        .select('id');
      if (veel.error) throw new Error(`bulkdoelen: ${veel.error.message}`);

      const links = await adminDb()
        .from('goal_group_links')
        .insert(veel.data.map((d) => ({ goal_id: d.id, group_id: groupId })));
      if (links.error) throw new Error(`bulkkoppelingen: ${links.error.message}`);

      const los = await adminDb()
        .from('goals')
        .insert({ owner_id: alice.id, title: 'nog los', target_date: '2028-06-01' })
        .select('id')
        .single();
      if (los.error) throw new Error(`los doel: ${los.error.message}`);

      const uit = await koppelbaar();
      expect(uit.rijen).toBe(1);
      expect(uit.totaal).toBe(1);
    },
    TEST_TIMEOUT,
  );
});
