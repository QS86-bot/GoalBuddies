/**
 * Wie mag zien dat een aanvrager eerder lid was — QS8-332, migratie 0206.
 *
 * ⚠️ **De belofte is niet "de RPC geeft de goede rijen terug".** De belofte is:
 *    *alleen een beheerder van díé groep ziet dat een aanvrager eerder lid was,
 *    en hij ziet niet méér dan besloten is.* Een test die alleen de gelukkige
 *    tak toetst, is groen terwijl het oppervlak openstaat.
 *
 * 📏 **Twee sporen, en geen van beide is compleet** — gemeten tegen de draaiende
 *    database met `pg_get_functiondef()`, niet uit de migratiebestanden gelezen:
 *
 *      `verwijder_lid()`  is de énige schrijver van `status = 'inactive'`
 *      `verlaat_groep()`  is de énige die de lidmaatschapsrij **verwijdert**
 *
 *    Wie vertrok laat dus geen rij achter en wie weggestuurd werd juist wél.
 *    Daarom leest 0206 er twee: de rij én de `group_events`-gebeurtenis.
 *
 * ⚠️⚠️ **En daarnaast staat er een leesbaar signaal dat ouder is dan dit issue.**
 *    Omdat vertrekken de rij wíst en uitgezet worden hem op `inactive` zet, is
 *    het bestáán van een inactieve rij precies gelijk aan "deze persoon is uit de
 *    groep gezet" — en `group_members_select` staat op `mag_groep_lezen()`, dus
 *    élk lid leest dat met één API-verzoek.
 *
 *    ✅ **Besluit van Quinten, 08-09-2026: dat blijft zo.** Een groep die iemand
 *    wegstuurt, weet dat zelf; uitzetten is een handeling ván de groep en niet
 *    een tegenslag ván de uitgezette, en dat is de grens die domeinregel 7
 *    trekt. Het besluit staat als oppervlak 31 in
 *    `docs/decisions/002-domeinregel7-oppervlakken.md`.
 *
 *    ⚠️ **Het derde blok hieronder is daarmee geen "wat er nog openstaat" meer
 *    maar de tóets op dat besluit**, en dat is precies waarom het blijft staan:
 *    een besluit zonder test is een zin, en deze wordt rood zodra een van beide
 *    paden dichtgaat — dan is het geen besluit meer maar een verandering.
 *
 * IJKING — met de hand, 08-09-2026, door de functie in de dráaiende database te
 * vervangen door een variant zonder die ene tak. Eén mutatie per grendel.
 *
 *   X  `is_group_admin(p_group_id)` uit de `where`   → 3 rood: het gewone lid, de
 *      aanvrager zelf en iemand buiten de groep krijgen dan alle drie de lijst
 *   Y  terug naar een join op `subject_id` alleen    → 1 rood: `vertrokken` valt
 *      weg. Dit is geen bedachte mutatie — zo stond de eerste versie er, en deze
 *      test heeft hem gevonden
 *   Z  de eis dat er een spoor ís eruit              → 2 rood: de vreemde komt in
 *      de lijst, en zijn rij draagt geen datum
 *   W  `actor_id` er tóch bij in de returns          → 1 rood: de projectie. Dat
 *      veld staat in de rij die de functie leest, dus dit is de mutatie die
 *      niemand tegenhoudt behalve deze grendel
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
const TEST_TIMEOUT = 30_000;

interface Wereld {
  /** Oprichter en beheerder van de groep. */
  admin: TestUser;
  /** Was lid, is eruit gezet, vraagt opnieuw aan. */
  uitgezet: TestUser;
  /** Was lid, is zelf vertrokken, vraagt opnieuw aan. */
  vertrokken: TestUser;
  /** Nooit lid geweest, vraagt aan. */
  vreemde: TestUser;
  /** Gewoon lid, geen beheerder. */
  lid: TestUser;
  groep: string;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

interface Rij {
  user_id: string;
  soort: string;
  op: string | null;
}

describe.skipIf(!rlsTestsConfigured)('de geschiedenis van een aanvrager', () => {
  beforeAll(async () => {
    const admin = await createTestUser('verzoekgesch-admin');
    const uitgezet = await createTestUser('verzoekgesch-uitgezet');
    const vertrokken = await createTestUser('verzoekgesch-vertrokken');
    const vreemde = await createTestUser('verzoekgesch-vreemde');
    const lid = await createTestUser('verzoekgesch-lid');

    const gemaakt = await admin.db.rpc('create_group', { group_name: 'Verzoekgeschiedenis' });
    const g = (gemaakt.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(gemaakt.data)}`);

    for (const gebruiker of [uitgezet, vertrokken, lid]) {
      const mee = await gebruiker.db.rpc('join_group_with_code', { code: g.group.invite_code });
      if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
    }

    const weg = await admin.db.rpc('verwijder_lid', {
      p_group_id: g.group.id,
      p_user_id: uitgezet.id,
      p_bevestigd: true,
    });
    if (uit(weg.data).ok !== true) throw new Error(`uitzetten: ${JSON.stringify(weg.data)}`);

    const vertrek = await vertrokken.db.rpc('verlaat_groep', {
      p_group_id: g.group.id,
      p_bevestigd: true,
    });
    if (uit(vertrek.data).ok !== true) throw new Error(`vertrekken: ${JSON.stringify(vertrek.data)}`);

    // ⚠️ De categorie moet er staan vóór de groep ontdekbaar mag worden
    //    (`groups_ontdekbaar_heeft_categorie`), en er is geen RPC voor. Zelfde
    //    weg als in `alleenlezen.test.ts` en `beheerdersgrens.test.ts`.
    const cat = await adminDb().from('groups').update({ categorie: 'other' }).eq('id', g.group.id);
    if (cat.error) throw new Error(`categorie: ${cat.error.message}`);

    const open = await admin.db.rpc('zet_groepsontdekbaarheid', {
      p_group_id: g.group.id,
      p_naar: true,
      p_bevestigd: true,
    });
    if (uit(open.data).ok !== true) throw new Error(`ontdekbaar: ${JSON.stringify(open.data)}`);

    for (const gebruiker of [uitgezet, vertrokken, vreemde]) {
      const vraag = await gebruiker.db.rpc('vraag_lidmaatschap_aan', { p_group_id: g.group.id });
      if (uit(vraag.data).ok !== true) throw new Error(`aanvragen: ${JSON.stringify(vraag.data)}`);
    }

    w = { admin, uitgezet, vertrokken, vreemde, lid, groep: g.group.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function lees(gebruiker: TestUser): Promise<readonly Rij[]> {
    const uitkomst = await gebruiker.db.rpc('verzoekers_eerder_lid', { p_group_id: w.groep });
    if (uitkomst.error) throw new Error(`lezen: ${uitkomst.error.message}`);
    return (uitkomst.data ?? []) as unknown as readonly Rij[];
  }

  // -------------------------------------------------------------------------
  describe('de beheerder ziet wat hij nodig heeft', () => {
    it(
      'onderscheidt een uitgezet lid van iemand die zelf vertrok',
      async () => {
        const rijen = await lees(w.admin);
        const per = new Map(rijen.map((r) => [r.user_id, r.soort]));

        expect(per.get(w.uitgezet.id)).toBe('verwijderd');
        expect(per.get(w.vertrokken.id)).toBe('vertrokken');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De must-allow-helft. Zou élke aanvrager een rij krijgen, dan zegt de
     *    regel niets meer — en zou alleen een uitzetting een rij krijgen, dan ís
     *    de aanwezigheid van de regel het oordeel. Zie de kop van 0206.
     */
    it(
      'laat een aanvrager die nooit lid was helemaal weg',
      async () => {
        const rijen = await lees(w.admin);
        expect(rijen.map((r) => r.user_id)).not.toContain(w.vreemde.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een datum bij de gebeurtenis',
      async () => {
        const rijen = await lees(w.admin);
        for (const rij of rijen) expect(rij.op, `${rij.soort} zonder datum`).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft geen actor, geen oude rol en geen reden terug',
      async () => {
        const rijen = await lees(w.admin);
        expect(rijen.length).toBeGreaterThan(0);
        for (const rij of rijen) {
          expect(Object.keys(rij).sort()).toEqual(['op', 'soort', 'user_id']);
        }
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('en niemand anders', () => {
    it(
      'geeft een gewoon lid nul rijen',
      async () => {
        expect(await lees(w.lid)).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een aanvrager zelf nul rijen, ook over zijn eigen verleden',
      async () => {
        expect(await lees(w.uitgezet)).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft iemand buiten de groep nul rijen',
      async () => {
        expect(await lees(w.vreemde)).toEqual([]);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  /**
   * ⚠️ **Dit blok toetst een besluit en niet een gebrek** — 08-09-2026. Een
   *    gewoon lid kán lezen wie er uit de groep gezet is, en dat mag: een groep
   *    die iemand wegstuurt weet dat zelf. Zonder deze twee gevallen is dat
   *    besluit een zin in een document, en de volgende lezer weet niet of het zo
   *    bedoeld is of dat het niemand opgevallen was.
   *
   * ⚠️ **Wordt een van beide paden ooit dichtgezet, dan wordt dit blok rood.**
   *    Dat is geen defect maar een uitnodiging: dan is het besluit veranderd en
   *    hoort oppervlak 31 in beslisdocument 002 mee te bewegen.
   */
  describe('en wat een gewoon lid bewust wél kan lezen', () => {
    it(
      'een gewoon lid leest de uitzetting rechtstreeks uit group_members',
      async () => {
        const rijen = await w.lid.db
          .from('group_members')
          .select('user_id, status')
          .eq('group_id', w.groep)
          .eq('status', 'inactive');

        expect(rijen.error).toBeNull();
        expect(
          (rijen.data ?? []).map((r) => r.user_id),
          'dit pad is dichtgezet; dan is oppervlak 31 in beslisdocument 002 veranderd en hoort het mee te bewegen',
        ).toContain(w.uitgezet.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'en de gebeurtenis zelf uit group_events',
      async () => {
        const rijen = await w.lid.db
          .from('group_events')
          .select('subject_id, event_type')
          .eq('group_id', w.groep)
          .eq('event_type', 'member_removed');

        expect(rijen.error).toBeNull();
        expect(
          (rijen.data ?? []).map((r) => r.subject_id),
          'dit pad is dichtgezet; dan is oppervlak 31 in beslisdocument 002 veranderd en hoort het mee te bewegen',
        ).toContain(w.uitgezet.id);
      },
      TEST_TIMEOUT,
    );
  });
});
