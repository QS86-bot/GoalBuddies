import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * `getuigenissen_voor()` — de vraag die de meldingenjob stelt, QS8-298.
 *
 * ⚠️ **Waarom dit een tweede functie is naast `getuigenissen()` (0169).** Die
 *    leest `auth.uid()`, en de meldingenjob heeft er geen: hij draait als
 *    `service_role` over álle profielen. Dezelfde reden waarom
 *    `te_beoordelen_voor()` naast `openstaande_beoordelingen()` staat (0054), en
 *    daar staat de les er ook al: een INVOKER-functie als `service_role` geeft
 *    het hele project terug, en een melding daarop baseren betekent iemand
 *    vertellen over de straf van een wildvreemde.
 *
 * ⚠️ **De grens loopt op twee kanten, en de tests staan daarom in paren.** De
 *    functie moet genóeg geven om een melding te schrijven (het commitment en de
 *    naam) en niet méér dan 0168 besloot — geen doeltitel, geen `body`. Een test
 *    op alleen de eerste helft blijft groen bij een functie die de hele rij
 *    meestuurt.
 *
 * ⚠️ **Domeinregel 11 is hier de eerste test en niet een voetnoot.** Vóór
 *    `due` hoort de getuige niet te weten dát er een straf is — anders is de
 *    inzet zelf al een mededeling, en dan is de melding een verruiming van
 *    domeinregel 7 in plaats van de uitzondering die hij hoort te zijn.
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel:
 *
 *   A  `and c.status = 'due'` uit de functie halen
 *      → 1 rood: de getuige krijgt de straf al bij `set`
 *   B  `and g.owner_id <> p_user_id` eruit
 *      → 1 rood op de zelfgetuige-opstelling hieronder
 *   C  `g.title` aan de returntabel toevoegen
 *      → 1 rood op de kolomverzameling
 *   D  `grant execute … to authenticated`
 *      → 1 rood op de rechtentest
 *   E  de anti-join op `notifications_sent` eruit
 *      → 1 rood: hij levert een commitment op waar al over gemeld is
 *   F  het dagplafond op 50 zetten in plaats van 5
 *      → 1 rood op de plafondtest
 *   G  de lidmaatschapsconjunct eruit
 *      → 1 rood: een vertrokken lid krijgt nog meldingen
 *
 * ⚠️ **B werkte eerst niet, en dat heeft deze suite een test opgeleverd.** De
 *    eerste versie toetste alleen dat alice niets krijgt, en dat bleef groen met
 *    de conjunct eruit: `bewaak_begunstigde()` (0168) laat een zelfgetuige-rij
 *    niet ontstaan, ook niet als `service_role`, dus alice was gewoon nergens
 *    `beneficiary_user_id`. De test was groen om een andere reden dan hij zei.
 *    De opstelling die de trigger even uitzet, is wat de conjunct wél ijkt.
 *
 * ⚠️ **En C werkte eerst niet, om een reden die dit project al eens gekost
 *    heeft:** `create or replace` kan een returntype níét wijzigen, dus de
 *    mutatie is stil niet toegepast en de test bleef groen. Met een `drop`
 *    ervoor werd hij rood. Zelfde valkuil als bij QS8-292; zie ook de
 *    drop-uitzondering bij onwrikbare regel 20.
 *
 * ⚠️ **E, F en G komen uit de security-review van 07-09-2026** en niet uit deze
 *    suite — de eerste versie had ze geen van drieën. Ze staan hier omdat de
 *    functie ze nu draagt: zonder anti-join komt melding 51 nooit aan, zonder
 *    dagplafond kan één groepsgenoot er vijftig tegelijk laten landen, en zonder
 *    lidmaatschapstoets blijft een vertrokken lid ze krijgen.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  /** Eigenaar van het doel en instelster van de straf. */
  alice: TestUser;
  /** Groepsgenoot van alice, en de aangewezen getuige. */
  bob: TestUser;
  /** Deelt geen enkele groep met alice en is nergens getuige van. */
  carol: TestUser;
  groupId: string;
  goalId: string;
  /** Een tweede doel van alice, zonder straf — voor de zelfgetuige-opstelling. */
  goal2Id: string;
  strafId: string;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean } {
  return (data ?? {}) as { ok?: boolean };
}

async function getuigenissenVoor(userId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await adminDb().rpc('getuigenissen_voor', { p_user_id: userId });
  if (error) throw new Error(`getuigenissen_voor: ${error.message}`);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

const rechtenMeetbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'getuigenissen_voor'",
  import.meta.url,
);

describe.skipIf(!rechtenMeetbaar)('getuigenissen_voor() — wie hem mag uitvoeren', () => {
  it(
    'is alleen voor service_role, want hij toetst zijn aanroeper niet',
    () => {
      // ⚠️ De must-deny. Deze functie krijgt de gebruiker als árgument, dus wie
      //    hem mag aanroepen mag naar elke gebruiker vragen. `authenticated`
      //    erbij is meteen "vertel me over de straffen van dit id". Tak 4 van
      //    `definer_bewaking()` (0167) meldt dit ook, maar die kijkt naar de
      //    klasse — dit is de assertie op déze functie.
      const uitslag = psql(`
        select
          has_function_privilege('anon',          'public.getuigenissen_voor(uuid)', 'EXECUTE')::text || ' ' ||
          has_function_privilege('authenticated', 'public.getuigenissen_voor(uuid)', 'EXECUTE')::text || ' ' ||
          has_function_privilege('service_role',  'public.getuigenissen_voor(uuid)', 'EXECUTE')::text
      `);

      expect(uitslag.trim(), 'alleen de job mag deze vraag stellen').toBe('false false true');
    },
    TEST_TIMEOUT,
  );
});

describe.skipIf(!rlsTestsConfigured)('getuigenissen_voor() — wat hij teruggeeft', () => {
  beforeAll(async () => {
    const alice = await createTestUser('melding-alice');
    const bob = await createTestUser('melding-bob');
    const carol = await createTestUser('melding-carol');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Meldinggroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'MELDINGDOEL', target_date: addDays(vandaag, 60) })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    // ⚠️ Via `adminDb()`: `status` is voor de client niet te kiezen (0006), en dat
    //    hoort zo — een straf gaat alleen in werking door een verstreken deadline.
    const straf = await adminDb()
      .from('commitments')
      .insert({
        goal_id: doel.data.id,
        type: 'penalty',
        body: 'Ik trakteer de hele groep op taart',
        beneficiary_user_id: bob.id,
        status: 'set',
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (straf.error || straf.data === null) throw new Error(`straf: ${straf.error?.message}`);

    // ⚠️ Een tweede doel, want `commitments_een_open_per_soort` laat maar één
    //    open straf per doel toe. De zelfgetuige-opstelling verderop heeft een
    //    eigen doel nodig.
    const doel2 = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'MELDINGDOEL 2', target_date: addDays(vandaag, 60) })
      .select('id')
      .single();
    if (doel2.error || doel2.data === null) throw new Error(`doel 2: ${doel2.error?.message}`);

    w = {
      alice,
      bob,
      carol,
      groupId: gd.group.id,
      goalId: doel.data.id,
      goal2Id: doel2.data.id,
      strafId: straf.data.id,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'meldt niets zolang de straf niet verschuldigd is',
    async () => {
      expect(await getuigenissenVoor(w.bob.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'meldt het commitment met de naam van de eigenaar zodra het verschuldigd is',
    async () => {
      await adminDb().from('commitments').update({ status: 'due' }).eq('id', w.strafId);

      const rijen = await getuigenissenVoor(w.bob.id);

      expect(rijen.length).toBe(1);
      expect(rijen[0]?.commitment_id, 'het id is de ontdubbelsleutel van de job').toBe(w.strafId);
      expect(rijen[0]?.eigenaar_naam, 'zonder naam is de melding een raadsel').toBeTruthy();
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft niets meer dan het id en de naam — geen doeltitel, geen inzet',
    async () => {
      // ⚠️ De andere kant van de grens, dezelfde als in
      //    `getuigenis-oppervlak.test.ts`. Een pushmelding staat op een
      //    vergrendeld scherm dat iemand anders kan meelezen; de doeltitel en de
      //    tekst van de inzet horen daar niet, ook niet "omdat de job ze toch
      //    niet gebruikt". Wat de functie teruggeeft, kán morgen in een bericht
      //    belanden.
      const rijen = await getuigenissenVoor(w.bob.id);

      expect(rijen[0], 'de vorige test hoort een rij te hebben opgeleverd').toBeDefined();
      expect(Object.keys(rijen[0] ?? {}).sort()).toEqual(['commitment_id', 'eigenaar_naam']);
    },
    TEST_TIMEOUT,
  );

  it(
    'meldt een vreemde niets, ook niet nu de straf verschuldigd is',
    async () => {
      expect(await getuigenissenVoor(w.carol.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'meldt de eigenaar niets over zijn eigen straf',
    async () => {
      // Alice ziet haar eigen inzet op haar doelscherm. Zou zij hier rijen
      // krijgen, dan kreeg ze een melding dat ze getuige is van zichzelf.
      expect(await getuigenissenVoor(w.alice.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'meldt niets meer over een commitment waar al een melding over uitging',
    async () => {
      // ⚠️ **De anti-join, en de reden dat hij er is.** Zonder deze conjunct
      //    levert de functie elke ronde dezelfde oudste rijen op en slaat de job
      //    ze allemaal over — melding 51 komt dan nooit aan. En dat heelt zich
      //    niet: 📏 geen enkele functie zet `status = 'resolved'`, en
      //    `commitments_update` heeft `using (status = 'set' …)`, dus een `due`
      //    blijft `due`. Het venster zou voor altijd vastzitten.
      const gemeld = await adminDb()
        .from('notifications_sent')
        .insert({
          user_id: w.bob.id,
          kind: 'commitment_witness',
          local_date: new Date().toISOString().slice(0, 10),
          ref_type: 'commitment',
          ref_id: w.strafId,
        })
        .select('id')
        .single();
      if (gemeld.error) throw new Error(`melding vastleggen: ${gemeld.error.message}`);

      try {
        expect(await getuigenissenVoor(w.bob.id)).toEqual([]);
      } finally {
        await adminDb().from('notifications_sent').delete().eq('id', gemeld.data.id);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'levert niets meer zodra het dagplafond van vijf bereikt is',
    async () => {
      // ⚠️ **Onwrikbare regel 5, en geen zuinigheid.** Deze meldingsoort tilt een
      //    leesoppervlak naar een pushkanaal, en er is 📏 géén dagquotum op
      //    `goals` — dus één groepsgenoot kan vijftig doelen met elk één straf
      //    aanmaken en er de dag erna vijftig laten landen op een
      //    vergrendelscherm. De ontvanger kan de rol niet weigeren en heeft geen
      //    opt-out per soort.
      //
      // ⚠️ De vijf rijen wijzen naar ándere commitments dan `strafId`, anders
      //    zou de anti-join hierboven de uitkomst al verklaren en toetst deze
      //    test niets eigens.
      const rijen = Array.from({ length: 5 }, () => ({
        user_id: w.bob.id,
        kind: 'commitment_witness',
        local_date: new Date().toISOString().slice(0, 10),
        ref_type: 'commitment',
        ref_id: crypto.randomUUID(),
      }));
      const gezet = await adminDb().from('notifications_sent').insert(rijen).select('id');
      if (gezet.error) throw new Error(`plafond vullen: ${gezet.error.message}`);

      try {
        expect(
          await getuigenissenVoor(w.bob.id),
          'vijf meldingen in 24 uur is het plafond',
        ).toEqual([]);
      } finally {
        await adminDb()
          .from('notifications_sent')
          .delete()
          .in('id', (gezet.data ?? []).map((r) => r.id));
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'meldt niets meer aan een getuige die de groep verlaten heeft',
    async () => {
      // ⚠️ De grond onder deze melding is dat de eigenaar deze persoon zélf heeft
      //    aangewezen, en dat kon alleen omdat er een groepsband was
      //    (`commitments_insert` eist `shares_group_with_user`). Verdwijnt die
      //    band, dan verdwijnt de grond. Zelfde vorm als `te_beoordelen_voor()`
      //    (0054), dat dit al doet.
      const weg = await adminDb()
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', w.groupId)
        .eq('user_id', w.bob.id);
      if (weg.error) throw new Error(`vertrek: ${weg.error.message}`);

      try {
        expect(await getuigenissenVoor(w.bob.id)).toEqual([]);
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

  it.skipIf(!rechtenMeetbaar)(
    'meldt niets over een zelfgetuige-rij die er niet had mogen zijn',
    async () => {
      // ⚠️ **Deze test bestaat omdat de vorige niets bewees.** Bij het ijken bleek
      //    dat `and g.owner_id <> p_user_id` uit de functie halen géén rode test
      //    opleverde: `bewaak_begunstigde()` (0168) laat zo'n rij niet ontstaan,
      //    ook niet als `service_role`, dus alice was simpelweg nergens
      //    `beneficiary_user_id`. De test was groen om een andere reden dan hij
      //    zei — regel 18, vraag 3.
      //
      // ⚠️ Dus zetten we die rij hier met de trigger uit neer. Dat is geen
      //    kunstgreep maar precies de vraag die de conjunct beantwoordt: *houdt
      //    de meldingenkant stand als de schrijfkant ooit lekt?* Twee sloten op
      //    één belofte, elk apart te ijken — en dit is het tweede.
      psql(`
        alter table public.commitments disable trigger commitments_begunstigde;
        insert into public.commitments (goal_id, type, body, beneficiary_user_id, status, confirmed_at)
        values ('${w.goal2Id}', 'penalty', 'ZELFGETUIGE', '${w.alice.id}', 'due', now());
        alter table public.commitments enable trigger commitments_begunstigde;
      `);

      try {
        expect(await getuigenissenVoor(w.alice.id)).toEqual([]);
      } finally {
        psql(`delete from public.commitments where body = 'ZELFGETUIGE'`);
      }
    },
    TEST_TIMEOUT,
  );
});
