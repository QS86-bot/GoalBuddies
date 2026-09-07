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
 *    groen. `tests/beloftes/koppelscherm.test.ts` dekt de andere helft — dát het
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
 * ⚠️ De `not.in` staat hier met opzet in dezelfde vorm als in de module: dat is
 *    wat er getoetst wordt.
 */
async function koppelbaar(uitsluiten: readonly string[]): Promise<number> {
  let vraag = alice.db
    .from('goal_dashboard')
    .select('*', { count: 'exact' })
    .eq('owner_id', alice.id)
    .eq('status', 'active');

  if (uitsluiten.length > 0) {
    vraag = vraag.not('id', 'in', `(${uitsluiten.join(',')})`);
  }

  const { data, error, count } = await vraag
    .order('target_date', { ascending: true })
    .range(0, PER_PAGINA - 1);

  if (error) throw new Error(`koppelbaar: ${error.message}`);
  expect(count).not.toBeNull();
  return (data ?? []).length;
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
      expect(await koppelbaar([])).toBe(PER_PAGINA);
    },
    TEST_TIMEOUT,
  );

  it(
    'met de eerste twintig gekoppeld blijft het eenentwintigste doel over — en dat is precies wat er misging',
    async () => {
      const eersteTwintig = doelIds.slice(0, PER_PAGINA);
      const koppelingen = eersteTwintig.map((goal_id) => ({ goal_id, group_id: groupId }));

      const link = await adminDb().from('goal_group_links').insert(koppelingen);
      if (link.error) throw new Error(`koppelen: ${link.error.message}`);

      // ⚠️ **Dit is het getal waar het om gaat.** De oude code vroeg pagina 0 op
      //    (deze twintig) en trok ze eraf: nul over, "je hebt nog geen doel".
      //    Serverzijdig uitsluiten geeft er één.
      expect(await koppelbaar(eersteTwintig)).toBe(1);
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

      expect(await koppelbaar(doelIds)).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
