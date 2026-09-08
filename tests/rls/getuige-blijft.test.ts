/**
 * QS8-312 — een straf die in werking is, verandert niet meer.
 *
 * ⚠️⚠️ **De belofte is smaller dan de eerste versie van dit bestand beweerde, en
 *    dat verschil is de hele opbrengst van dit issue.** Er stond hier:
 *
 *      "Er is geen opstelling waarin een straf van eigenaar verandert, zichzelf
 *       als getuige krijgt, of stilzwijgend verdwijnt."
 *
 *    Dat is onwaar voor een straf op `set`, en de security-ronde mat het na:
 *    de eigenaar trekt hem in (`trekIn()`, 0057) en maakt een nieuwe aan met een
 *    andere getuige (`maakCommitment()`). Twee bestaande knoppen, geen truc.
 *    📏 Zelf nagemeten als `authenticated` eigenaar via PostgREST:
 *
 *      straf aanmaken met bob   → {"status":"set","beneficiary_user_id":<bob>}
 *      intrekken                → GELUKT, 1 rij
 *      nieuwe straf met carol   → {"status":"set","beneficiary_user_id":<carol>}
 *
 * **Wat er wél houdt, en wat dit bestand daarom bewaakt:**
 *
 *      Een straf die in werking is (`status = 'due'`) verandert niet meer van
 *      getuige, niet van eigenaar, en verdwijnt niet — zolang zijn getuige
 *      bestaat.
 *
 * ⚠️⚠️ **Die laatste bijzin is er op 08-09-2026 bij gekomen (QS8-333, migratie
 *    0212), en de manier waaróp is precies waar regel 18 voor waarschuwt.** De
 *    belofte hierboven stond zonder uitzondering, en `herstel_stuurloze_straf()`
 *    maakt daar een uitzondering op: verdwijnt de getuige met zijn account, dan
 *    wijst de eigenaar een nieuwe aan of wikkelt hij de straf af.
 *
 *    **Geen enkele test in dit bestand werd daar rood van.** Ze voeren allemaal
 *    de directe tabelroute, en die is nog steeds dicht — de kolomgrant en
 *    `commitments_update` zijn niet aangeraakt. De belofte verschoof dus en de
 *    bewaking merkte het niet. Daarom is deze kop bijgesteld en niet alleen de
 *    code: een test die groen blijft terwijl de belofte kleiner wordt, bewaakt
 *    vanaf dat moment iets anders dan zijn kop zegt.
 *
 *    De nieuwe grens staat in `tests/rls/stuurloze-straf.test.ts` §3: de RPC
 *    weigert met `heeft_nog_een_begunstigde` zolang de getuige er is. Dat is de
 *    must-deny die de zin hierboven overeind houdt voor het normale geval.
 *
 *    📏 Alle vier de routes dichtgemeten voor `due`: annuleren raakt nul rijen,
 *    een tweede straf op hetzelfde doel botst op
 *    `commitments_een_open_per_soort`, `verwijder_doel()` weigert met
 *    `commitment_in_werking`, en `rond_doel_af()` raakt alleen `set`.
 *
 * ⚠️ **Voor `set` is het tegendeel waar, en met opzet.** Dat is de bedenktijd:
 *    een straf is een voornemen tot hij verschuldigd wordt. Het antwoord op de
 *    vraag van QS8-312 — *kan de eigenaar een vervanger aanwijzen als de getuige
 *    vertrekt* — is dus **ja, via intrekken en opnieuw aanmaken**, en dat pad is
 *    expliciet, bevestigd en auditeerbaar zoals domeinregel 5 vraagt. §2 legt dat
 *    vast als must-allow, zodat niemand het per ongeluk dichtzet in de
 *    veronderstelling dat het een gat is.
 *
 * ⚠️ **Wat de kolomgrant dan nog doet.** `beneficiary_user_id` is voor geen enkele
 *    client schrijfbaar (`grant update (body, image_url, status)`, 0057), dus de
 *    getuige van een *bestaande* rij wisselt nooit stil: er komt altijd een
 *    ingetrokken rij naast te staan. Dat is het verschil tussen een wisseling die
 *    in `commitment_events` staat en een die nergens staat. §4 bewaakt die grant,
 *    want er was geen test die iets zei als iemand hem verbreedde.
 *
 * ⚠️ Twee gaten die hier níet gedicht werden en die als dossierrij stonden:
 *    `verwijder_doel()` cascadeerde een bevestigde `set`-straf én zijn
 *    `commitment_events` weg, en `verwijder_mijn_account()` van de getuige liet
 *    een `due`-straf met `beneficiary_user_id = NULL` achter. **Allebei
 *    inmiddels behandeld** — het eerste door QS8-331/0189, het tweede door
 *    QS8-333/0212, dat er de RPC hierboven voor bouwde. Wat er van het tweede
 *    blijft staan is de vraag wat er met het spoor gebeurt als de **eigenaar**
 *    zijn account verwijdert; dat is QS8-335.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  magNietLanden,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  carol: TestUser;
  groupId: string;
  /** Doel met een straf op `set` — de bedenktijd. */
  goalSet: string;
  strafSet: string;
  /** Doel met een straf op `due` — in werking. */
  goalDue: string;
  strafDue: string;
}

let w: Wereld;

/**
 * ⚠️ De poortwachter van QS8-270. Dit bestand leest de grants rechtstreeks met
 *    `psql`; zonder deze regel zou het met `RLS_DOEL` op het échte project de
 *    grants van een toevallig draaiende lókale stack lezen en groen melden over
 *    productie. De proef vraagt naar de tabel die dit bestand toetst.
 */
const stackErIs = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'commitments'",
  import.meta.url,
);

function leesStraf(id: string) {
  return () =>
    adminDb()
      .from('commitments')
      .select('goal_id, beneficiary_user_id, beneficiary_group_id, status, body')
      .eq('id', id)
      .maybeSingle();
}

describe.skipIf(!rlsTestsConfigured || !stackErIs)('QS8-312 — een straf in werking verandert niet meer', () => {
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

    // ⚠️ Twee doelen: `commitments_een_open_per_soort` staat één open straf per
    //    doel toe. Gemeten toen de eerste opzet met één doel omviel.
    async function maakDoel(titel: string): Promise<string> {
      const d = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, target_date: addDays(vandaag, 60) })
        .select('id')
        .single();
      if (d.error || d.data === null) throw new Error(`doel ${titel}: ${d.error?.message}`);
      return (d.data as { id: string }).id;
    }

    const goalSet = await maakDoel('GETUIGE-SET');
    const goalDue = await maakDoel('GETUIGE-DUE');

    // ⚠️ De `set`-straf via de échte clientweg, want §2 toetst wat een gebruiker
    //    kan. De `due`-straf via `adminDb()`, want `status` is voor de client niet
    //    te kiezen (0006): een straf gaat alleen in werking door een verstreken
    //    deadline, en dít bestand gaat over wat er dáárna nog kan.
    const s1 = await alice.db
      .from('commitments')
      .insert({
        goal_id: goalSet,
        type: 'penalty',
        body: 'Ik trakteer de groep op taart',
        beneficiary_user_id: bob.id,
        confirmed_at: 'now',
      })
      .select('id')
      .single();
    if (s1.error || s1.data === null) throw new Error(`straf set: ${s1.error?.message}`);

    const s2 = await adminDb()
      .from('commitments')
      .insert({
        goal_id: goalDue,
        type: 'penalty',
        body: 'Ik trakteer de groep op taart',
        beneficiary_user_id: bob.id,
        status: 'due',
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (s2.error || s2.data === null) throw new Error(`straf due: ${s2.error?.message}`);

    w = {
      alice,
      bob,
      carol,
      groupId: gd.group.id,
      goalSet,
      strafSet: (s1.data as { id: string }).id,
      goalDue,
      strafDue: (s2.data as { id: string }).id,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // 1. Een straf in werking verandert niet meer — de vier routes
  // -------------------------------------------------------------------------

  it(
    'een verschuldigde straf is niet in te trekken',
    async () => {
      await magNietLanden(
        () => w.alice.db.from('commitments').update({ status: 'cancelled' }).eq('id', w.strafDue),
        leesStraf(w.strafDue),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'een verschuldigde straf is niet te overschrijven met een tweede straf',
    async () => {
      // ⚠️ Dit is de route die §2 hieronder voor `set` juist wél openlaat. Het
      //    verschil is `commitments_een_open_per_soort`: die telt `set`,
      //    `unlocked` en `due`, dus naast een `due` past er geen tweede.
      const tweede = await w.alice.db.from('commitments').insert({
        goal_id: w.goalDue,
        type: 'penalty',
        body: 'een mildere straf',
        beneficiary_user_id: w.carol.id,
        confirmed_at: 'now',
      });

      expect(tweede.error, 'een tweede open straf hoort te botsen').not.toBeNull();
      const na = await leesStraf(w.strafDue)();
      expect((na.data as { beneficiary_user_id: string }).beneficiary_user_id).toBe(w.bob.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'het doel van een verschuldigde straf is niet te verwijderen',
    async () => {
      const uit = await w.alice.db.rpc('verwijder_doel', { p_goal_id: w.goalDue });
      expect((uit.data as { ok?: boolean; reason?: string })?.ok).toBe(false);
      expect((uit.data as { reason?: string })?.reason).toBe('commitment_in_werking');

      const na = await leesStraf(w.strafDue)();
      expect(na.data, 'de straf staat er nog').not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'de getuige van een verschuldigde straf is niet te wisselen',
    async () => {
      await magNietLanden(
        () =>
          w.alice.db
            .from('commitments')
            .update({ beneficiary_user_id: w.carol.id })
            .eq('id', w.strafDue),
        leesStraf(w.strafDue),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'een verschuldigde straf verhuist niet naar een ander doel',
    async () => {
      await magNietLanden(
        () => w.alice.db.from('commitments').update({ goal_id: w.goalSet }).eq('id', w.strafDue),
        leesStraf(w.strafDue),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'een verschuldigde straf is niet te verwijderen',
    async () => {
      // ⚠️ `authenticated` heeft geen DELETE-recht op deze tabel, dus RLS komt er
      //    niet aan te pas. Naar de uitkomst kijken en niet naar een foutcode: een
      //    DELETE die op een policy afketst geeft 204 zonder fout (valkuil 5).
      await w.alice.db.from('commitments').delete().eq('id', w.strafDue);
      const na = await leesStraf(w.strafDue)();
      expect(na.data, 'de straf staat er nog').not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. De tegenhanger: in de bedenktijd mág het, en dat is het antwoord op QS8-312
  // -------------------------------------------------------------------------

  it(
    'in de bedenktijd trekt de eigenaar zijn straf in en zet er een met een andere getuige voor in de plaats',
    async () => {
      // ⚠️ **Dit is een must-allow en geen gat.** Dit ís het antwoord op de vraag
      //    van QS8-312: een vertrokken getuige vervang je door de straf in te
      //    trekken en opnieuw aan te maken. Het loopt via de bevestigingsstap in
      //    de UI, laat een `cancelled`-rij in `commitment_events` achter, en is
      //    dus expliciet, bevestigd en auditeerbaar — domeinregel 5.
      //
      //    Zonder deze test leest §1 als "een straf verandert nooit", en dan zet
      //    de volgende sessie dit pad dicht in de veronderstelling dat het een
      //    lek is.
      const trek = await w.alice.db
        .from('commitments')
        .update({ status: 'cancelled' })
        .eq('id', w.strafSet)
        .select();
      expect(trek.error).toBeNull();
      expect(trek.data ?? []).toHaveLength(1);

      const opnieuw = await w.alice.db
        .from('commitments')
        .insert({
          goal_id: w.goalSet,
          type: 'penalty',
          body: 'Ik trakteer de groep op taart',
          beneficiary_user_id: w.carol.id,
          confirmed_at: 'now',
        })
        .select('beneficiary_user_id, status')
        .single();

      expect(opnieuw.error).toBeNull();
      expect((opnieuw.data as { beneficiary_user_id: string }).beneficiary_user_id).toBe(w.carol.id);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. Ook in de bedenktijd wisselt de getuige nooit stíl
  // -------------------------------------------------------------------------

  it(
    'de getuige van een bestaande straf is nooit rechtstreeks te wisselen — er komt altijd een ingetrokken rij naast',
    async () => {
      // ⚠️ Het verschil met §2 is het spoor. Een wisseling via intrekken laat een
      //    rij in `commitment_events` achter; een `update` op de kolom zou dat
      //    niet doen. Dát is wat de kolomgrant bewaakt, en niet of de getuige ooit
      //    verandert.
      const nieuw = await w.alice.db
        .from('commitments')
        .insert({
          goal_id: await (async () => {
            const d = await w.alice.db
              .from('goals')
              .insert({
                owner_id: w.alice.id,
                title: 'GETUIGE-STIL',
                target_date: addDays(localDateIn('UTC' as TimeZone, now()) as IsoDate, 60),
              })
              .select('id')
              .single();
            return (d.data as { id: string }).id;
          })(),
          type: 'penalty',
          body: 'taart',
          beneficiary_user_id: w.bob.id,
          confirmed_at: 'now',
        })
        .select('id')
        .single();
      const id = (nieuw.data as { id: string }).id;

      await magNietLanden(
        () => w.alice.db.from('commitments').update({ beneficiary_user_id: w.carol.id }).eq('id', id),
        leesStraf(id),
      );
      await magNietLanden(
        () => w.alice.db.from('commitments').update({ beneficiary_user_id: null }).eq('id', id),
        leesStraf(id),
      );
      await magNietLanden(
        () => w.alice.db.from('commitments').update({ beneficiary_user_id: w.alice.id }).eq('id', id),
        leesStraf(id),
      );
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 4. Het register onder de grant
  // -------------------------------------------------------------------------

  it(
    'geen enkele client mag de getuige of het doel van een straf schrijven',
    async () => {
      // ⚠️⚠️ **Lees dit als deze test rood staat.** Hij bewaakt dat een wisseling
      //    van getuige altijd een spoor achterlaat. Kan `beneficiary_user_id`
      //    rechtstreeks geschreven worden, dan verdwijnt dat spoor: geen
      //    ingetrokken rij, geen `commitment_events`, alleen een andere naam.
      //    `bewaak_begunstigde()` houdt dat níét tegen — die verbiedt alleen
      //    leeghalen en jezelf aanwijzen, en laat wisselen naar een ander
      //    groepslid door. 📏 Gemeten: één `grant update (beneficiary_user_id)`
      //    erbij en het wisselen lukt.
      //
      //    Lees `docs/decisions/2026-09-07-de-getuige-blijft-de-getuige.md`
      //    voordat je deze lijst aanpast.
      //
      // ⚠️ **`has_column_privilege` en niet `information_schema` op
      //    `grantee = 'authenticated'`.** Dat laatste stond hier eerst en het
      //    heeft een gat: 📏 gemeten dat `grant update (goal_id) … to public` het
      //    recht wél geeft (`has_column_privilege` = `t`) terwijl de
      //    grantee-filter niets ziet en de hele suite groen blijft. Spiegelbeeld
      //    van onwrikbare regel 4: daar leest `revoke … from public, anon` als
      //    "van iedereen", hier leest `grant … to public` als onschuldig. Het
      //    effectieve recht is de waarheid, niet de boekhouding erover.
      const verboden = ['beneficiary_user_id', 'beneficiary_group_id', 'goal_id', 'type', 'confirmed_at'];
      const gemeten = psql(
        `select string_agg(k, ',' order by k) from (
           select unnest(array['${verboden.join("','")}']) as k
         ) v where has_column_privilege('authenticated', 'public.commitments', v.k, 'UPDATE');`,
      ).trim();

      expect(gemeten, 'deze kolommen horen voor geen enkele client schrijfbaar te zijn').toBe('');
    },
    TEST_TIMEOUT,
  );
});
