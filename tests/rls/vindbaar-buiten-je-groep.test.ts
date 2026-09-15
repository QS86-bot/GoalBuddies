/**
 * De belofte: wie zichzelf vindbaar maakt, geeft zijn naam en zijn foto weg en
 * verder niets — QS8-476.
 *
 * ⚠️⚠️ **De retourvorm ís de belofte, en daarom staat hij hier letterlijk.**
 *    `zoek_mensen()` is een RPC en geen extra tak op `profiles_select`, omdat
 *    RLS geen kolommen kan beperken: die tak zou de héle rij weggeven —
 *    tijdzone, week-startdag, de vier meldingsvoorkeuren, de stille uren,
 *    `focus_areas`, `when_i_do_it`, `what_breaks_it`. Dat is de fout die QS8-370
 *    op `commitments_select` vond. Een kolom erbij is hier dus een rode test,
 *    vóór er een scherm bestaat dat hem toont.
 *
 * ⚠️⚠️ **En de zwaarste test is de naadtest.** Dat de RPC drie kolommen geeft is
 *    een eigenschap van een ónderdeel. De belofte is een eigenschap van het
 *    gehéél: *een gevonden id is geen sleutel*. Die toets voert het gevonden id
 *    door zeven andere leespaden en eist overal nul — en hij blijft kloppen als
 *    iemand later een policy verruimt die niets met dit issue te maken heeft.
 *    Regel 18 vraag 1.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  anonDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/** Precies wat een vreemde van je mag zien. Een sleutel erbij is een besluit. */
const ZICHTBARE_KOLOMMEN = ['id', 'display_name', 'avatar_url'] as const;

let zoeker: TestUser;
let vindbaar: TestUser;
let verborgen: TestUser;
let blokkeerder: TestUser;
let metateken: TestUser;

/** Een naamfragment dat alleen bij deze run hoort. */
const STAM = `Zx${Math.random().toString(36).slice(2, 8)}`;

async function noemEnZetVindbaar(u: TestUser, achtervoegsel: string, aan: boolean): Promise<void> {
  const uit = await adminDb()
    .from('profiles')
    .update({ display_name: `${STAM}${achtervoegsel}`, vindbaar: aan })
    .eq('id', u.id);
  if (uit.error !== null) throw new Error(`profiel zetten: ${uit.error.message}`);
}

describe.runIf(rlsTestsConfigured)('vindbaar buiten je groep', () => {
  beforeAll(async () => {
    zoeker = await createTestUser('vindbaar-zoeker');
    vindbaar = await createTestUser('vindbaar-ja');
    verborgen = await createTestUser('vindbaar-nee');
    blokkeerder = await createTestUser('vindbaar-blok');
    metateken = await createTestUser('vindbaar-meta');

    await noemEnZetVindbaar(vindbaar, 'Vindbaar', true);
    await noemEnZetVindbaar(verborgen, 'Verborgen', false);
    await noemEnZetVindbaar(blokkeerder, 'Blokkeerder', true);
    await noemEnZetVindbaar(zoeker, 'Zoeker', true);
    await noemEnZetVindbaar(metateken, 'Meta', true);

    const blok = await adminDb()
      .from('user_blocks')
      .insert({ blocker_id: blokkeerder.id, blocked_id: zoeker.id });
    if (blok.error !== null) throw new Error(`blokkade: ${blok.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'geeft precies drie kolommen terug, en niets uit de rest van het profiel',
    async () => {
      const uit = await zoeker.db.rpc('zoek_mensen', { p_term: `${STAM}Vindbaar` });
      expect(uit.error, `zoeken mislukte: ${uit.error?.message}`).toBeNull();

      const rijen = (uit.data ?? []) as Record<string, unknown>[];
      expect(rijen).toHaveLength(1);
      expect(Object.keys(rijen[0] ?? {}).sort()).toEqual([...ZICHTBARE_KOLOMMEN].sort());
    },
    TEST_TIMEOUT,
  );

  it(
    'een gevonden id is geen sleutel: geen enkel ander leespad geeft iets',
    async () => {
      // ⚠️ **Dit is de naadtest.** Niet per tabel beredeneerd maar per tabel
      //    gemeten — en het id komt uit de RPC zelf, niet uit de fixture, zodat
      //    hij precies het pad toetst dat een vreemde werkelijk heeft.
      const uit = await zoeker.db.rpc('zoek_mensen', { p_term: `${STAM}Vindbaar` });
      const gevonden = ((uit.data ?? []) as { id: string }[])[0]?.id;
      expect(gevonden, 'de opstelling vond niemand; dan meet deze test niets').toBe(vindbaar.id);
      if (gevonden === undefined) return;

      // ⚠️ Per tabel uitgeschreven en niet in een lus met een variabele
      //    kolomnaam: de kolom heet niet overal hetzelfde, en een lus die dat
      //    met een cast gladstrijkt, toetst niet meer welke kolom hij bevraagt.
      const deuren: readonly (readonly [
        string,
        () => PromiseLike<{ data: unknown[] | null }>,
      ])[] = [
        ['goals', () => zoeker.db.from('goals').select('id').eq('owner_id', gevonden)],
        // ⚠️ `daily_moves` en niet `weekly_goals`: die tweede hangt aan `goal_id`
        //    en is niet op gebruiker te bevragen. De Dagzet is bovendien privé
        //    per domeinregel 9, dus het is hier de zwaardere deur.
        ['daily_moves', () => zoeker.db.from('daily_moves').select('id').eq('user_id', gevonden)],
        ['completions', () => zoeker.db.from('completions').select('id').eq('user_id', gevonden)],
        ['points_ledger', () => zoeker.db.from('points_ledger').select('id').eq('user_id', gevonden)],
        ['group_members', () => zoeker.db.from('group_members').select('user_id').eq('user_id', gevonden)],
        ['user_streaks', () => zoeker.db.from('user_streaks').select('user_id').eq('user_id', gevonden)],
        ['chain_links', () => zoeker.db.from('chain_links').select('id').eq('user_id', gevonden)],
      ];

      const stand: Record<string, number> = {};
      for (const [naam, vraag] of deuren) {
        const rij = await vraag();
        stand[naam] = (rij.data ?? []).length;
      }

      expect(stand).toEqual(Object.fromEntries(deuren.map(([naam]) => [naam, 0])));

      // En het profiel zelf blijft ook dicht: vindbaarheid verruimt
      // `profiles_select` niet.
      //
      // ⚠️⚠️ **`select('id')` en niet `select('*')`, en dat is een gerepareerde
      //    valse groene.** `profiles` deelt SELECT per kolom uit — alleen
      //    `id, display_name, avatar_url`. Met `*` vraagt PostgREST óók de
      //    ongegunde kolommen, krijgt "permission denied", en dan is `data`
      //    `null`; `?? []` maakte daar een lege lijst van en de toets werd
      //    groen. 📏 Gemeten: met `profiles_select` verruimd naar `true` bleef
      //    deze test op 7 van 7 staan. Met een gegunde kolom wordt hij rood,
      //    want dán komt de rij er echt uit.
      const profiel = await zoeker.db.from('profiles').select('id').eq('id', gevonden);
      expect(profiel.error, `de profielvraag viel om: ${profiel.error?.message}`).toBeNull();
      expect(profiel.data ?? [], 'een vreemde las het profiel van wie hij vond').toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'wie zichzelf niet vindbaar maakt, komt er niet uit',
    async () => {
      const uit = await zoeker.db.rpc('zoek_mensen', { p_term: `${STAM}Verborgen` });
      expect(uit.error).toBeNull();
      expect((uit.data ?? []) as unknown[]).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'vindbaarheid is een keuze van de eigenaar en van niemand anders',
    async () => {
      // Must-deny: de zoeker zet de schakelaar van een ander om.
      const vreemde = await zoeker.db
        .from('profiles')
        .update({ vindbaar: false })
        .eq('id', vindbaar.id)
        .select('id');
      expect(vreemde.data ?? [], 'een ander mocht mijn vindbaarheid omzetten').toHaveLength(0);

      // Must-allow: de eigenaar zet zijn eigen schakelaar om, en terug.
      const eigen = await vindbaar.db
        .from('profiles')
        .update({ vindbaar: false })
        .eq('id', vindbaar.id)
        .select('id');
      expect(eigen.error, `de eigenaar mocht zijn eigen schakelaar niet omzetten`).toBeNull();
      expect(eigen.data ?? []).toHaveLength(1);

      const terug = await vindbaar.db.from('profiles').update({ vindbaar: true }).eq('id', vindbaar.id);
      expect(terug.error).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'een blokkade werkt beide kanten op in de zoeklijst',
    async () => {
      // ⚠️ Beide richtingen apart. Wie hier ooit één kant weghaalt, verandert de
      //    betekenis van blokkeren zonder dat er iets stukgaat.
      const zoekerZoekt = await zoeker.db.rpc('zoek_mensen', { p_term: `${STAM}Blokkeerder` });
      expect(zoekerZoekt.error).toBeNull();
      expect((zoekerZoekt.data ?? []) as unknown[], 'de geblokkeerde vond zijn blokkeerder').toHaveLength(0);

      const blokkeerderZoekt = await blokkeerder.db.rpc('zoek_mensen', { p_term: `${STAM}Zoeker` });
      expect(blokkeerderZoekt.error).toBeNull();
      expect(
        (blokkeerderZoekt.data ?? []) as unknown[],
        'de blokkeerder vond wie hij blokkeerde',
      ).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'een metateken is een teken en geen instructie',
    async () => {
      // ⚠️ Zonder ontsnapping geeft `%` de héle vindbare populatie in één
      //    verzoek — de enumeratie waar de dagrem tegen is, cadeau.
      for (const term of ['%', '%%', '_', `%${STAM}`]) {
        const uit = await zoeker.db.rpc('zoek_mensen', { p_term: term });
        expect(uit.error).toBeNull();
        expect((uit.data ?? []) as unknown[], `term ${term} gaf rijen`).toHaveLength(0);
      }
    },
    TEST_TIMEOUT,
  );

  // ⚠️⚠️ **Deze toets bestaat omdat de vorige groen was om de verkeerde reden.**
  //    Hierboven staan `%`, `%%` en `_` op nul rijen — en dat lukte ook toen de
  //    ondergrens ná de ontsnapping gemeten werd, simpelweg doordat geen enkele
  //    fixture-naam met zo'n teken begint. De belofte ("één teken is geen
  //    zoekopdracht") kon breken terwijl de test groen bleef: regel 18 vraag 3.
  //
  //    📏 Met de lengtetoets terug achter de ontsnapping geeft `zoek_mensen('%')`
  //    de rij hieronder wél terug — `%` wordt `\%`, twee tekens, en komt door
  //    een grens die "minstens twee" heet. Vandaar een naam die met een
  //    letterlijk metateken begint: zonder die naam meet de vorige test niets.
  it(
    'telt de ondergrens op de kale term en niet op de ontsnapte',
    async () => {
      await noemEnZetVindbaar(metateken, '', true);
      // De naam begint met een letterlijke `%`, dus een term van één `%` zou
      // hem vinden zodra de grens de ontsnapping meetelt.
      const uit = await adminDb()
        .from('profiles')
        .update({ display_name: `%${STAM}Meta` })
        .eq('id', metateken.id);
      expect(uit.error).toBeNull();

      const eenTeken = await zoeker.db.rpc('zoek_mensen', { p_term: '%' });
      expect(eenTeken.error).toBeNull();
      expect(
        (eenTeken.data ?? []) as unknown[],
        'een term van één teken kwam door de ondergrens',
      ).toHaveLength(0);

      // ⚠️ De must-allow-helft: met twee kale tekens hóórt hij gevonden te
      //    worden, anders bewijst de nul hierboven alleen dat er niets staat.
      const tweeTekens = await zoeker.db.rpc('zoek_mensen', { p_term: `%${STAM}` });
      expect(tweeTekens.error).toBeNull();
      expect(
        (tweeTekens.data ?? []) as unknown[],
        'een letterlijk metateken werd als wildcard behandeld of viel weg',
      ).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'uitgelogd komt er niet in',
    async () => {
      const uit = await anonDb().rpc('zoek_mensen', { p_term: STAM });
      expect(uit.error, 'anon mocht zoek_mensen uitvoeren').not.toBeNull();
    },
    TEST_TIMEOUT,
  );
});
