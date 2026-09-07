/**
 * QS8-312 — een straf verandert niet van getuige, niet van eigenaar, en verdwijnt niet.
 *
 * ⚠️ **De belofte, en hij gaat over het geheel en niet over een policy:**
 *
 *      Er is geen opstelling waarin een straf van eigenaar verandert, zichzelf
 *      als getuige krijgt, of stilzwijgend verdwijnt.
 *
 * ⚠️ **Waar die belofte vandaag écht op rust, is gemeten en het is niet wat het
 *    issue aannam.** QS8-312 schreef dat een vervanger aanwijzen niet kan omdat
 *    `bewaak_begunstigde()` het weigert — `beneficiary_user_id = null` en
 *    zichzelf aanwijzen, allebei nagemeten. Die twee weigeringen bestaan, maar
 *    een gewone client bereikt ze nooit. 📏 Gemeten als `authenticated` eigenaar
 *    met echte claims, via PostgREST:
 *
 *      set + getuige lid        → permission denied for table commitments
 *      set + getuige vertrokken → permission denied for table commitments
 *      due + getuige vertrokken → permission denied for table commitments
 *
 *    De grendel is de **kolomgrant** van 0057 — `grant update (body, image_url,
 *    status)` — en die staat vóór de trigger. De trigger is het tweede slot en
 *    de metingen in het issue zijn met `service_role` gedaan, die langs
 *    kolomgrants heen gaat.
 *
 * ⚠️⚠️ **En dat verschil is de reden dat dit bestand bestaat.** Het tweede slot
 *    dekt de eerste belofte niet: `bewaak_begunstigde()` verbiedt alleen
 *    leeghalen en jezelf aanwijzen. Wisselen naar een ánder groepslid laat hij
 *    door — `commitments_update` heeft daar zelfs een `with check` voor staan.
 *    Wordt `beneficiary_user_id` ooit aan de grant toegevoegd, dan is er dus
 *    géén slot meer dat het wisselen tegenhoudt, en er is vandaag geen test die
 *    daar rood van wordt. Zie de registertest onderaan.
 *
 * ⚠️ **Elke must-deny heeft hier een must-allow naast (valkuil 10).** Een grant
 *    die per ongeluk helemaal wegvalt, haalt elke weigertest hieronder moeiteloos
 *    en breekt de app. §1 staat daarom vooraan.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  WEIGERCODES,
  type TestUser,
} from './harness';
import { psql } from './psql-stack';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  /** Eigenaar van de doelen en instelster van de straffen. */
  alice: TestUser;
  /** Groepsgenoot en aangewezen getuige. */
  bob: TestUser;
  /** Tweede groepsgenoot — de kandidaat-vervanger. */
  carol: TestUser;
  groupId: string;
  /** Straf op `set`: de eigenaar mag hier nog aan komen. */
  strafSet: string;
  /** Straf op `due`: verschuldigd, en bevroren. */
  strafDue: string;
}

let w: Wereld;

/** De rij zoals `adminDb()` hem ziet — die komt overal bij. */
function leesStraf(id: string) {
  return () =>
    adminDb()
      .from('commitments')
      .select('goal_id, beneficiary_user_id, beneficiary_group_id, status, body')
      .eq('id', id)
      .maybeSingle();
}

/**
 * "Deze poging mag de straf niet veranderen, en de aanroeper hoort dat te merken."
 *
 * ⚠️ Eerst bewijzen dat er iets te veranderen valt, dan een weigering eisen, dan
 *    onveranderd. Zonder de eerste stap is "onveranderd" gratis.
 */
async function veranderNiets(
  poging: () => PromiseLike<{ error: { code?: string; message?: string } | null }>,
  lees: () => PromiseLike<{ data: unknown }>,
): Promise<string> {
  const voorData = (await lees()).data ?? null;
  if (voorData === null) throw new Error('veranderNiets: er valt niets te lezen, dus niets te bewijzen.');
  const voor = JSON.stringify(voorData);

  const { error } = await poging();

  if (error !== null && !WEIGERCODES.includes(error.code as never)) {
    throw new Error(`Geweigerd met een onverwachte code ${error.code}: ${error.message}`);
  }

  const na = JSON.stringify((await lees()).data ?? null);
  if (na !== voor) {
    throw new Error(`De straf is wél veranderd.\n  vóór: ${voor}\n  ná:   ${na}`);
  }
  return error?.message ?? '';
}

describe.skipIf(!rlsTestsConfigured)('QS8-312 — een straf houdt zijn getuige, zijn eigenaar en zijn bestaan', () => {
  beforeAll(async () => {
    const alice = await createTestUser('getuigeblijft-alice');
    const bob = await createTestUser('getuigeblijft-bob');
    const carol = await createTestUser('getuigeblijft-carol');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Getuigegroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    registreerGroep(gd.group.id);

    for (const lid of [bob, carol]) {
      const mee = await lid.db.rpc('join_group_with_code', { code: gd.group.invite_code });
      if ((mee.data as { ok?: boolean })?.ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
    }

    // ⚠️ Twee doelen, want `commitments_een_open_per_soort` staat één open straf
    //    per doel toe. Gemeten toen de eerste opzet met één doel omviel.
    async function maakDoel(titel: string): Promise<string> {
      const d = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, target_date: addDays(vandaag, 60) })
        .select('id')
        .single();
      if (d.error || d.data === null) throw new Error(`doel ${titel}: ${d.error?.message}`);
      return (d.data as { id: string }).id;
    }

    // ⚠️ Via `adminDb()`: `status` is voor de client niet te kiezen (0006) — een
    //    straf gaat alleen in werking door een verstreken deadline. Dit bestand
    //    gaat over wie hem dáárna nog kan veranderen, niet over de weg ernaartoe.
    async function maakStraf(goalId: string, status: string): Promise<string> {
      const s = await adminDb()
        .from('commitments')
        .insert({
          goal_id: goalId,
          type: 'penalty',
          body: 'Ik trakteer de groep op taart',
          beneficiary_user_id: bob.id,
          status,
          confirmed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (s.error || s.data === null) throw new Error(`straf ${status}: ${s.error?.message}`);
      return (s.data as { id: string }).id;
    }

    w = {
      alice,
      bob,
      carol,
      groupId: gd.group.id,
      strafSet: await maakStraf(await maakDoel('GETUIGE-SET'), 'set'),
      strafDue: await maakStraf(await maakDoel('GETUIGE-DUE'), 'due'),
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // 1. De tegenhanger — wat de eigenaar wél mag
  // -------------------------------------------------------------------------

  it(
    'de eigenaar past de tekst van een openstaande straf gewoon aan',
    async () => {
      // ⚠️ Vooraan, en niet als bijzaak: valt de kolomgrant ooit helemaal weg,
      //    dan halen alle weigertests hieronder het moeiteloos terwijl de app
      //    stuk is. Deze test is het bewijs dat er iets te weigeren viel.
      const r = await w.alice.db
        .from('commitments')
        .update({ body: 'Ik trakteer op iets anders' })
        .eq('id', w.strafSet)
        .select();

      expect(r.error).toBeNull();
      expect(r.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. De getuige blijft de getuige
  // -------------------------------------------------------------------------

  it(
    'de eigenaar wijst geen vervanger aan zolang de getuige gewoon lid is',
    async () => {
      const melding = await veranderNiets(
        () =>
          w.alice.db
            .from('commitments')
            .update({ beneficiary_user_id: w.carol.id })
            .eq('id', w.strafSet),
        leesStraf(w.strafSet),
      );
      expect(melding).toContain('commitments');
    },
    TEST_TIMEOUT,
  );

  it(
    'en ook niet nadat de getuige de groep verlaten heeft — het scenario van QS8-312',
    async () => {
      // ⚠️ **Dit is de kern van het issue.** 0183 laat het oppervlak van de
      //    getuige de groepsband volgen, dus zolang Bob weg is ziet niemand deze
      //    straf behalve Alice. De vraag was of Alice er dan een ander op mag
      //    zetten. Het antwoord is nee, en dat is een besluit — zie
      //    `docs/decisions/2026-09-07-de-getuige-blijft-de-getuige.md`.
      await adminDb()
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', w.groupId)
        .eq('user_id', w.bob.id);

      try {
        await veranderNiets(
          () =>
            w.alice.db
              .from('commitments')
              .update({ beneficiary_user_id: w.carol.id })
              .eq('id', w.strafSet),
          leesStraf(w.strafSet),
        );

        // ⚠️ **Opschorten en niet vernietigen**, en dat is de helft die het
        //    besluit draagt: de aanwijzing blijft staan, dus de straf krijgt
        //    zijn getuige terug zodra hij terugkomt.
        const na = await leesStraf(w.strafSet)();
        expect((na.data as { beneficiary_user_id: string }).beneficiary_user_id).toBe(w.bob.id);
      } finally {
        await adminDb()
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', w.groupId)
          .eq('user_id', w.bob.id);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'de eigenaar haalt de getuige er niet uit',
    async () => {
      await veranderNiets(
        () =>
          w.alice.db
            .from('commitments')
            .update({ beneficiary_user_id: null })
            .eq('id', w.strafSet),
        leesStraf(w.strafSet),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'de eigenaar maakt zichzelf niet tot getuige van zijn eigen straf',
    async () => {
      await veranderNiets(
        () =>
          w.alice.db
            .from('commitments')
            .update({ beneficiary_user_id: w.alice.id })
            .eq('id', w.strafSet),
        leesStraf(w.strafSet),
      );
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. De straf verandert niet van eigenaar en verdwijnt niet
  // -------------------------------------------------------------------------

  it(
    'een straf verhuist niet naar het doel van iemand anders',
    async () => {
      const anders = await w.carol.db
        .from('goals')
        .insert({
          owner_id: w.carol.id,
          title: 'DOEL VAN CAROL',
          target_date: addDays(localDateIn('UTC' as TimeZone, now()) as IsoDate, 60),
        })
        .select('id')
        .single();
      if (anders.error || anders.data === null) throw new Error(`doel: ${anders.error?.message}`);

      await veranderNiets(
        () =>
          w.alice.db
            .from('commitments')
            .update({ goal_id: (anders.data as { id: string }).id })
            .eq('id', w.strafSet),
        leesStraf(w.strafSet),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'een straf is niet te verwijderen — ook niet door de eigenaar',
    async () => {
      // ⚠️ `authenticated` heeft geen DELETE-recht op deze tabel, dus RLS komt
      //    er niet eens aan te pas. Dat is de sterkste vorm, en de reden dat deze
      //    test naar de uitkomst kijkt en niet naar een foutcode: een DELETE die
      //    op een policy afketst geeft 204 zonder fout (valkuil 5).
      await w.alice.db.from('commitments').delete().eq('id', w.strafSet);
      const na = await leesStraf(w.strafSet)();
      expect(na.data, 'de straf staat er nog').not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'een verschuldigde straf is helemaal bevroren',
    async () => {
      // ⚠️ `commitments_update` heeft `using (status = 'set' …)`, dus zodra een
      //    straf `due` is, raakt de eigenaar hem niet meer aan — ook zijn tekst
      //    niet. Dit is de must-deny naast §1.
      await veranderNiets(
        () => w.alice.db.from('commitments').update({ body: 'toch maar niet' }).eq('id', w.strafDue),
        leesStraf(w.strafDue),
      );
      await veranderNiets(
        () => w.alice.db.from('commitments').update({ status: 'cancelled' }).eq('id', w.strafDue),
        leesStraf(w.strafDue),
      );
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 4. Het register onder de belofte
  // -------------------------------------------------------------------------

  it(
    'de kolomgrant op commitments laat de getuige en het doel niet schrijven',
    async () => {
      // ⚠️⚠️ **Lees dit als deze test rood staat.** Hij is geen stijlregel maar
      //    de grendel onder QS8-312. De gedragstests hierboven weigeren vandaag
      //    op de kolomgrant van 0057 — `grant update (body, image_url, status)` —
      //    en niet op `bewaak_begunstigde()`. Die trigger verbiedt alleen
      //    leeghalen en jezelf aanwijzen; **wisselen naar een ander groepslid
      //    laat hij door.** Zet iemand `beneficiary_user_id` in deze grant, dan
      //    is er dus geen enkel slot meer dat het wisselen tegenhoudt, en de
      //    gedragstests hierboven worden dan rood zonder te zeggen waarom.
      //
      //    Wie de grant wil verbreden, neemt daarmee de beslissing die QS8-312
      //    bewust heeft laten liggen: wie mag de nieuwe getuige worden en wie
      //    bevestigt dat. Dat is grens 1 van de beslisbevoegdheid (domeinregel
      //    5). Lees `docs/decisions/2026-09-07-de-getuige-blijft-de-getuige.md`
      //    en pas dán deze lijst aan.
      //
      // ⚠️ Rechtstreeks aan de catalogus gevraagd en niet aan een migratiebestand:
      //    grants staan niet in de code, en 0057 is niet de laatste die ze had
      //    kunnen wijzigen. Zelfde reden als in `kolomrechten-controle.mjs`.
      const gemeten = psql(
        "select coalesce(string_agg(column_name, ',' order by column_name), '(geen)') " +
          "from information_schema.column_privileges " +
          "where table_name = 'commitments' and grantee = 'authenticated' " +
          "and privilege_type = 'UPDATE';",
      ).trim();

      expect(gemeten).toBe('body,image_url,status');
    },
    TEST_TIMEOUT,
  );
});
