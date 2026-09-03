import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * `group_overview()` pagineert met een cursor — 0152, QS8-149.
 *
 * ⚠️ **De laatste van de drie offsetlijsten, en de enige waar de kíjker de
 *    verschuiving niet zelf veroorzaakt.** Bij `weekafsluiting_reacties()`
 *    (0121) verwijdert iemand anders een reactie; bij
 *    `openstaande_beoordelingen()` (0125) is goedkeuren zélf de verschuiving.
 *    Hier is er een vertrek of een beheerdersactie voor nodig, en die vallen
 *    niet samen met bladeren. Dat is waarom deze als laatste ging — en niet
 *    waarom hij niet hoeft.
 *
 * ⚠️ **De belofte is niet "de query klopt" maar "er wordt niemand overgeslagen".**
 *    Regel 18 vraag 2: een test die de SQL naspeelt blijft groen als de SQL en de
 *    test dezelfde denkfout delen. Dit bestand toetst daarom de **unie** van wat
 *    een gebruiker in twee bladerslagen te zien krijgt, en niet de inhoud van
 *    één pagina.
 *
 * ⚠️ **Vandaag is dit in de app niet te bereiken en dat staat hier met opzet.**
 *    Een groep gaat niet boven twaalf leden en `LEDEN_PER_PAGINA` is twintig, dus
 *    er ís geen tweede pagina. Deze test roept de RPC daarom rechtstreeks aan met
 *    `p_limit = 2`. Dat is geen kunstgreep om de test te laten slagen maar de
 *    enige manier om de belofte te ráken — precies het geval dat vraag 3
 *    beschrijft, maar dan van de goede kant: de opstelling wordt naar de belofte
 *    toe gebouwd in plaats van dat de belofte naar de opstelling wordt gebogen.
 *
 * ⚠️ Alles hieronder loopt onder de **eigen sessie van de kijker**. `group_overview`
 *    is `stable` en geen definer: hij leest `group_members` en `profiles` onder de
 *    RLS van de aanroeper.
 */

interface Rij {
  readonly user_id: string;
  readonly joined_at: string;
  readonly display_name: string;
  readonly total_members: number;
}

interface Fixture {
  /** De oprichter, en de kijker in elke test. */
  anna: TestUser;
  /** Vier leden die na anna binnenkomen, in deze volgorde. */
  leden: readonly TestUser[];
  groep: string;
  periode: string;
}

describe.skipIf(!rlsTestsConfigured)('group_overview — bladeren slaat niemand over', () => {
  let f: Fixture;

  /** Eén pagina, zoals de client hem opvraagt. */
  async function pagina(
    kijker: TestUser,
    limiet: number,
    na: { joinedAt: string; userId: string } | null = null,
  ): Promise<readonly Rij[]> {
    const db = kijker.db as unknown as {
      rpc: (
        naam: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { data, error } = await db.rpc('group_overview', {
      p_group_id: f.groep,
      p_period_start: f.periode,
      p_limit: limiet,
      p_na_joined_at: na?.joinedAt ?? null,
      p_na_user_id: na?.userId ?? null,
    });
    if (error) throw new Error(`group_overview: ${error.message}`);
    return (data ?? []) as readonly Rij[];
  }

  /** De cursor die de client uit een pagina afleidt: de laatste rij. */
  function cursorVan(rijen: readonly Rij[]): { joinedAt: string; userId: string } | null {
    const laatste = rijen[rijen.length - 1];
    return laatste === undefined ? null : { joinedAt: laatste.joined_at, userId: laatste.user_id };
  }

  beforeAll(async () => {
    const anna = await createTestUser('blader-overzicht-anna');

    const gemaakt = await anna.db.rpc('create_group', { group_name: 'Bladeroverzicht' });
    if (gemaakt.error) throw new Error(`groep: ${gemaakt.error.message}`);
    const uit = gemaakt.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (uit.ok !== true || uit.group === undefined) {
      throw new Error(`groep mislukte: ${JSON.stringify(gemaakt.data)}`);
    }

    // ⚠️ **Eén voor één en niet met `Promise.all`.** De sortering is
    //    `(joined_at, user_id)`, en gelijktijdig meedoen levert vier keer
    //    dezelfde `now()` op. Dan bepaalt `user_id` de volgorde, en die is een
    //    willekeurige uuid — de test toetst dan iets anders dan hij beweert.
    const leden: TestUser[] = [];
    for (let n = 1; n <= 4; n += 1) {
      const lid = await createTestUser(`blader-overzicht-${n}`);
      const mee = await lid.db.rpc('join_group_with_code', { code: uit.group.invite_code });
      if (mee.error) throw new Error(`meedoen ${n}: ${mee.error.message}`);
      const gelezen = mee.data as unknown as { ok?: boolean; reason?: string };
      if (gelezen.ok !== true) throw new Error(`meedoen ${n}: ${gelezen.reason ?? '?'}`);
      leden.push(lid);
    }

    const groep = await adminDb()
      .from('groups')
      .select('id')
      .eq('invite_code', uit.group.invite_code)
      .single();
    if (groep.error) throw new Error(`groep lezen: ${groep.error.message}`);

    f = {
      anna,
      leden,
      groep: uit.group.id,
      // De periode doet er voor het bladeren niet toe; hij moet alleen geldig
      // zijn, want `closed_this_period` heeft hem nodig.
      periode: new Date().toISOString().slice(0, 10),
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('groups').delete().eq('id', f.groep);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'geeft alle vijf de leden over drie pagina\'s, zonder gaten en zonder dubbelen',
    async () => {
      // De gewone gang van zaken: niets verandert tussendoor.
      const gezien: string[] = [];
      let na: { joinedAt: string; userId: string } | null = null;

      for (let ronde = 0; ronde < 5; ronde += 1) {
        const rijen: readonly Rij[] = await pagina(f.anna, 2, na);
        if (rijen.length === 0) break;
        gezien.push(...rijen.map((r) => r.user_id));
        na = cursorVan(rijen);
      }

      const verwacht = [f.anna.id, ...f.leden.map((l) => l.id)];
      expect([...gezien].sort()).toEqual([...verwacht].sort());
      expect(new Set(gezien).size).toBe(gezien.length);
    },
    TEST_TIMEOUT,
  );

  it(
    'slaat niemand over als er tussen twee pagina\'s een lid vertrekt',
    async () => {
      // ⚠️ **Dit is de hele bevinding.** Pagina 1 geeft anna en lid 1. Lid 1
      //    vertrekt. Met een `offset` van 2 begint pagina 2 dan bij de derde rij
      //    van een lijst die er nog maar vier heeft — lid 2 valt eruit, stil, en
      //    de gebruiker ziet een ledenlijst die compleet lijkt.
      //
      //    ⚠️ Rood gemaakt door in 0152 de cursorclausule te vervangen door
      //    `offset 2`: lid 2 verdwijnt dan uit `gezien` en deze test valt om,
      //    terwijl de test hierboven groen blijft omdat daar niemand vertrekt.
      const eerste = await pagina(f.anna, 2, null);
      expect(eerste).toHaveLength(2);
      const na = cursorVan(eerste);

      const vertrekker = f.leden[0];
      if (vertrekker === undefined) throw new Error('opstelling mist lid 1');
      const weg = await vertrekker.db.rpc('verlaat_groep', {
        p_group_id: f.groep,
        p_bevestigd: true,
      });
      if (weg.error) throw new Error(`vertrek (HTTP): ${weg.error.message}`);
      const uitslag = weg.data as unknown as { ok?: boolean; reason?: string };
      if (uitslag.ok !== true) throw new Error(`vertrek mislukte: ${uitslag.reason ?? '?'}`);

      const gezien = eerste.map((r) => r.user_id);
      let cursor = na;
      for (let ronde = 0; ronde < 5; ronde += 1) {
        const rijen: readonly Rij[] = await pagina(f.anna, 2, cursor);
        if (rijen.length === 0) break;
        gezien.push(...rijen.map((r) => r.user_id));
        cursor = cursorVan(rijen);
      }

      // De vertrekker mag ontbreken — hij is weg. Iedereen die bleef moet er zijn.
      for (const lid of f.leden.slice(1)) {
        expect(gezien).toContain(lid.id);
      }
      expect(gezien).toContain(f.anna.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'telt total_members over de héle groep en niet vanaf de cursor',
    async () => {
      // ⚠️ **Dit was `count(*) over ()`, en dat telt met een cursorfilter erop
      //    nog maar de rijen die ná de cursor komen.** `fetchGroepsoverzicht()`
      //    rekent er `meer` uit; zou het getal met de cursor meebewegen, dan telt
      //    het af terwijl je bladert en verdwijnt de knop voor de lijst op is.
      //
      //    ⚠️ Rood gemaakt door de CTE-teller in 0152 terug te zetten naar
      //    `count(*) over ()`: de tweede pagina meldt er dan minder dan de eerste.
      const eerste = await pagina(f.anna, 2, null);
      const na = cursorVan(eerste);
      const tweede = await pagina(f.anna, 2, na);

      expect(eerste[0]?.total_members).toBeGreaterThan(0);
      expect(tweede[0]?.total_members).toBe(eerste[0]?.total_members);
    },
    TEST_TIMEOUT,
  );

  it(
    'behandelt een half ingevulde cursor als géén cursor',
    async () => {
      // ⚠️ De tweede grendel; de eerste staat in `fetchGroepsoverzicht()`, dat de
      //    sleutels helemaal weglaat zonder cursor. Zonder deze tak zou
      //    `(joined_at, null)` in SQL geen vergelijking zijn maar NULL, en viel
      //    de hele pagina stil weg.
      //
      //    ⚠️ Rood gemaakt door de twee `is null`-takken uit de `where` van 0152
      //    te halen: beide aanroepen hieronder geven dan nul rijen.
      const eerste = await pagina(f.anna, 2, null);

      const alleenDatum = await pagina(f.anna, 2, {
        joinedAt: eerste[0]?.joined_at ?? '',
        userId: null as unknown as string,
      });
      const alleenId = await pagina(f.anna, 2, {
        joinedAt: null as unknown as string,
        userId: eerste[0]?.user_id ?? '',
      });

      expect(alleenDatum.map((r) => r.user_id)).toEqual(eerste.map((r) => r.user_id));
      expect(alleenId.map((r) => r.user_id)).toEqual(eerste.map((r) => r.user_id));
    },
    TEST_TIMEOUT,
  );
});
