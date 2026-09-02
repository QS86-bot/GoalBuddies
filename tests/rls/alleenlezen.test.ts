import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepsperiodeVan } from '../../src/modules/buddies/periods';

import type { Database } from '../../src/lib/database.types';
import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  WEIGERCODES,
  type TestDb,
  type TestUser,
} from './harness';

/**
 * Wat de client alleen mag lézen, blijft alleen te lezen — QS8-262, migratie 0148.
 *
 * ⚠️ **Dit bestand bestaat omdat de policies vermoedelijk kloppen en niemand het
 *    zou merken als dat ophield.** `npm run rls:dekking` (QS8-185) mat op 01-09:
 *    81 van de 102 policyhelften worden door een test bewaakt, 21 niet. Dat is
 *    geen lijst van beveiligingsgaten maar het verschil tussen *"het klopt"* en
 *    *"het blijft kloppen"*.
 *
 * ⚠️ **De vorm is bewust die van 0118 en niet die van 0101.** 0101 zette een
 *    bewaking neer met vier tabelnamen erin gebeiteld, en keek daarna de andere
 *    kant op toen er 21 tabellen bij kwamen. `alleenlezen_bewaking()` (0148)
 *    rékent uit welke policyhelften letterlijk `false` zijn terwijl
 *    `authenticated` het recht wél heeft; de fixtures hieronder zijn met de hand
 *    geschreven, want een fixture is niet uit te rekenen. **De test legt die
 *    twee lijsten naast elkaar en wordt rood zodra ze uiteenlopen.**
 *
 *    Dat is de assertie die dit bestand houdbaar maakt:
 *    * komt er een tabel bij → rood, tot iemand er een fixture voor schrijft;
 *    * valt er een `false` weg → ook rood, en dát is de regressie.
 *
 * ⚠️ **Waarom de rechtentoets in de databasefunctie staat en niet hier.** Zonder
 *    grant is de policy niet de grendel maar de grant, en dan kan geen enkele
 *    test hierover omvallen: de DELETE geeft `42501` óók met de policy wagenwijd
 *    open (regel 18 vraag 3). `chain_links` en `milestone_tips` vallen er zo
 *    vanzelf uit; die horen in `tests/rls/schrijfrechten.test.ts`.
 *
 * ⚠️⚠️ **Elke helft is apart geijkt, en drie fixtures waren eerst groen om de
 *    verkeerde reden.** Dat is de kern van dit bestand: een test die weigert
 *    omdat er íets weigert, bewaakt de policy niet. Alle drie zijn gevonden door
 *    de policy open te zetten en te kijken of de test rood werd — niet door hem
 *    te lezen.
 *
 *    | Wat er in de weg stond | Hoe het eruitzag | Wat het werd |
 *    | -- | -- | -- |
 *    | `deadline_requests_een_open_per_doel` en `approval_withdrawals_een_per_goedkeuring` | de insert weigerde met `23505` — een unieke index, niet de policy | een tweede doel en een tweede goedkeuring, allebei nog vrij |
 *    | de guard van PostgREST tegen een update die de rij uit je éigen zicht tilt | dezelfde `42501` als een policy, dus niet van elkaar te onderscheiden | een kolom wijzigen waar de zichtbaarheid niet aan hangt |
 *    | `group_join_requests_status_valid` en `reports_status_geldig` | `23514`, en die staat in `WEIGERCODES` | een statuswaarde die de CHECK toelaat |
 *
 * ⚠️ **En één keer bedierf de ijking zelf de meting.** Een `alter policy … using
 *    (false) with check (false)` om een mutatie terug te draaien zette een
 *    expliciete `with check` op twee policies die er geen hadden. Daarna gedroeg
 *    de database zich anders dan de migraties hem beschrijven, en twee gevallen
 *    "bewezen" iets wat er niet stond. Schema opnieuw opgebouwd en opnieuw
 *    gemeten. **Bouw het schema opnieuw op voordat je een uitslag gelooft.**
 *
 * ⚠️ **Een `using false` maakt de `check`-helft van dezelfde UPDATE
 *    onbereikbaar**, en dat is eerlijker opgeschreven dan verzwegen. Bij
 *    `approval_withdrawals_update`, `deadline_requests_update` en
 *    `week_review_replies_update` staan beide helften op `false`; een test kan
 *    het páár bewaken, niet elke helft apart. Zet iemand alleen de `check` om,
 *    dan verandert er niets en blijft deze test terecht groen.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * De tabelnaam is hier een váriabele, en dat is de hele opzet: welke tabellen
 * meedoen, komt uit `alleenlezen_bewaking()` en niet uit dit bestand.
 *
 * ⚠️ **Getypeerd tegen het schema en niet tegen `string`.** Een typefout in een
 *    tabelnaam moet een rode typecheck geven en geen test die stilletjes niets
 *    aanraakt — dat laatste is precies de val die `magNietLanden()` beschrijft.
 */
type Tabelnaam = keyof Database['public']['Tables'];

/**
 * De losse bouwer die één cast waard is.
 *
 * ⚠️ De gegenereerde types van PostgREST eisen een **letterlijke** tabelnaam om
 *    de kolommen van die tabel te kunnen afleiden. Met een variabele naam kan
 *    dat niet, en dat is geen tekortkoming maar de prijs van tabelgedreven
 *    toetsen. Eén plek waar dat wordt losgelaten, met de náám wél getoetst.
 */
interface LosseVraag
  extends PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
    count?: number | null;
  }> {
  eq: (kolom: string, waarde: string) => LosseVraag;
}

interface LosseBouwer {
  select: (kolommen: string, opties?: { count: 'exact'; head: true }) => LosseVraag;
  insert: (rij: Record<string, string>) => LosseVraag;
  update: (rij: Record<string, string>) => LosseVraag;
  delete: () => LosseVraag;
}

function bouwer(db: TestDb, tabel: Tabelnaam): LosseBouwer {
  return (db as unknown as { from: (t: string) => LosseBouwer }).from(tabel);
}

/** Eén rij die de client niet mag aanraken, plus hoe je hem terugvindt. */
interface Doelwit {
  /** De tabel, zoals `alleenlezen_bewaking()` hem noemt. */
  readonly tabel: Tabelnaam;
  /** De opdrachten waarvoor deze tabel een `false`-helft heeft. */
  readonly opdrachten: readonly ('DELETE' | 'INSERT' | 'UPDATE')[];
  /** De client die de poging doet — degene die er nog het meeste recht op heeft. */
  poger: TestUser;
  /** Het filter waarmee `adminDb()` en de client dezelfde rij aanwijzen. */
  readonly sleutel: Readonly<Record<string, string>>;
  /** Een wijziging die zou landen als `using`/`check` het toelieten. */
  readonly wijziging: Readonly<Record<string, string>>;
  /** Een rij die de client zou invoegen als de `check` het toeliet. */
  readonly nieuweRij: Readonly<Record<string, string>> | null;
}

let doelwitten: Doelwit[] = [];

function filter(vraag: LosseVraag, sleutel: Readonly<Record<string, string>>): LosseVraag {
  let q = vraag;
  for (const [kolom, waarde] of Object.entries(sleutel)) {
    q = q.eq(kolom, waarde);
  }
  return q;
}

/** De rij zoals `adminDb()` hem ziet — die ziet hem hoe dan ook. */
function lees(d: Doelwit): () => PromiseLike<{ data: unknown }> {
  return () => filter(bouwer(adminDb(), d.tabel).select('*'), d.sleutel);
}

describe.skipIf(!rlsTestsConfigured)('wat de client alleen mag lezen, blijft alleen te lezen', () => {
  let eigenaar: TestUser;
  let buddy: TestUser;
  let buitenstaander: TestUser;

  beforeAll(async () => {
    eigenaar = await createTestUser('alleenlezen-eigenaar');
    buddy = await createTestUser('alleenlezen-buddy');
    buitenstaander = await createTestUser('alleenlezen-buiten');

    const admin = adminDb();
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    // --- de groep, en meteen de rij in `group_members` en `groups` -----------
    const groep = await eigenaar.db.rpc('create_group', { group_name: 'Alleenlezen' });
    const groepData = groep.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    const groupId = groepData.group.id;

    const mee = await buddy.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    const meeData = (mee.data ?? {}) as { ok?: boolean; reason?: string };
    if (meeData.ok !== true) throw new Error(`buddy werd geen lid: ${meeData.reason ?? '?'}`);

    // --- het doel, de week en de voltooiing ----------------------------------
    const doel = await eigenaar.db
      .from('goals')
      .insert({ owner_id: eigenaar.id, title: 'ALLEENLEZEN', target_date: addDays(vandaag, 90) })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    const goalId = doel.data.id;

    const koppel = await eigenaar.db
      .from('goal_group_links')
      .insert({ goal_id: goalId, group_id: groupId });
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    const week = await admin
      .from('weekly_goals')
      .insert({
        goal_id: goalId,
        title: 'ALLEENLEZENWEEK',
        points_ceiling: 2,
        points_floor: 1,
        points_miss: -1,
        cycle_start_date: vandaag,
        cycle_index: 1,
      })
      .select('id')
      .single();
    if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);

    const voltooiing = await eigenaar.db
      .from('completions')
      .insert({
        weekly_goal_id: week.data.id,
        user_id: eigenaar.id,
        achieved_level: 'ceiling',
        note: 'af',
        cycle_start_date: vandaag,
      })
      .select('id')
      .single();
    if (voltooiing.error || voltooiing.data === null) {
      throw new Error(`voltooiing: ${voltooiing.error?.message}`);
    }

    // --- approval_withdrawals: goedkeuren en meteen intrekken ---------------
    const gegeven = await buddy.db
      .from('completion_approvals')
      .insert({
        completion_id: voltooiing.data.id,
        approver_id: buddy.id,
        subject_id: buddy.id,
        group_id: groupId,
        status: 'approved',
      })
      .select('id')
      .single();
    if (gegeven.error || gegeven.data === null) {
      throw new Error(`goedkeuren: ${gegeven.error?.message}`);
    }
    const ingetrokken = await buddy.db.rpc('trek_goedkeuring_in', {
      p_approval_id: gegeven.data.id,
    });
    if (ingetrokken.error) throw new Error(`intrekken: ${ingetrokken.error.message}`);

    // ⚠️ **Een tweede weekdoel met een goedkeuring die níet is ingetrokken.**
    //    `approval_withdrawals_een_per_goedkeuring` is uniek op `approval_id`,
    //    dus een insert op de eerste goedkeuring ketst af op die index en niet
    //    op de policy. Dan bewijst de test "er weigert íets" en niet "de policy
    //    weigert" — regel 18 vraag 3, en M2 van de ijking liet precies dat zien.
    const week2 = await admin
      .from('weekly_goals')
      .insert({
        goal_id: goalId,
        title: 'ALLEENLEZENWEEK-2',
        points_ceiling: 2,
        points_floor: 1,
        points_miss: -1,
        cycle_start_date: addDays(vandaag, 7),
        cycle_index: 2,
      })
      .select('id')
      .single();
    if (week2.error || week2.data === null) throw new Error(`weekdoel 2: ${week2.error?.message}`);

    const voltooiing2 = await eigenaar.db
      .from('completions')
      .insert({
        weekly_goal_id: week2.data.id,
        user_id: eigenaar.id,
        achieved_level: 'ceiling',
        note: 'ook af',
        cycle_start_date: addDays(vandaag, 7),
      })
      .select('id')
      .single();
    if (voltooiing2.error || voltooiing2.data === null) {
      throw new Error(`voltooiing 2: ${voltooiing2.error?.message}`);
    }

    const vrijeGoedkeuring = await buddy.db
      .from('completion_approvals')
      .insert({
        completion_id: voltooiing2.data.id,
        approver_id: buddy.id,
        subject_id: buddy.id,
        group_id: groupId,
        status: 'approved',
      })
      .select('id')
      .single();
    if (vrijeGoedkeuring.error || vrijeGoedkeuring.data === null) {
      throw new Error(`tweede goedkeuring: ${vrijeGoedkeuring.error?.message}`);
    }

    // ⚠️ Idem voor `deadline_requests_een_open_per_doel`: een tweede doel, zodat
    //    de insert hieronder alleen nog op de policy kán stuklopen.
    const doel2 = await eigenaar.db
      .from('goals')
      .insert({ owner_id: eigenaar.id, title: 'ALLEENLEZEN-2', target_date: addDays(vandaag, 90) })
      .select('id')
      .single();
    if (doel2.error || doel2.data === null) throw new Error(`doel 2: ${doel2.error?.message}`);

    // --- deadline_requests --------------------------------------------------
    const verzoek = await eigenaar.db.rpc('vraag_deadline_verschuiving', {
      p_goal_id: goalId,
      p_group_id: groupId,
      p_new_date: addDays(vandaag, 200),
      p_reason: 'Het loopt anders dan gedacht',
    });
    if (verzoek.error) throw new Error(`deadlineverzoek: ${verzoek.error.message}`);

    const verzoekRij = await admin
      .from('deadline_requests')
      .select('id')
      .eq('goal_id', goalId)
      .single();
    if (verzoekRij.error || verzoekRij.data === null) {
      throw new Error(`deadlineverzoek terugvinden: ${verzoekRij.error?.message}`);
    }

    // --- group_join_requests: een ontdekbare groep en een buitenstaander -----
    const open = await eigenaar.db.rpc('create_group', { group_name: 'Alleenlezen-open' });
    const openData = open.data as unknown as { ok?: boolean; group?: { id: string } };
    if (openData.ok !== true || !openData.group) {
      throw new Error(`open groep: ${JSON.stringify(open.data)}`);
    }
    const openId = openData.group.id;

    // ⚠️ `categorie` moet mee: `groups_ontdekbaar_heeft_categorie` staat een
    //    ontdekbare groep zonder categorie niet toe.
    const ontdekbaar = await admin
      .from('groups')
      .update({ ontdekbaar: true, categorie: 'other' })
      .eq('id', openId);
    if (ontdekbaar.error) throw new Error(`ontdekbaar: ${ontdekbaar.error.message}`);

    const aanvraag = await buitenstaander.db.rpc('vraag_lidmaatschap_aan', {
      p_group_id: openId,
      p_bericht: 'Mag ik meedoen?',
    });
    const aanvraagData = (aanvraag.data ?? {}) as { ok?: boolean; reason?: string };
    if (aanvraagData.ok !== true) {
      throw new Error(`lidmaatschapsverzoek: ${aanvraagData.reason ?? aanvraag.error?.message}`);
    }

    // ⚠️ En idem voor `group_join_requests_een_openstaand`, uniek op
    //    (group_id, user_id) zolang het verzoek `pending` is.
    const open2 = await eigenaar.db.rpc('create_group', { group_name: 'Alleenlezen-open-2' });
    const open2Data = open2.data as unknown as { ok?: boolean; group?: { id: string } };
    if (open2Data.ok !== true || !open2Data.group) {
      throw new Error(`tweede open groep: ${JSON.stringify(open2.data)}`);
    }
    const open2Id = open2Data.group.id;

    const ontdekbaar2 = await admin
      .from('groups')
      .update({ ontdekbaar: true, categorie: 'other' })
      .eq('id', open2Id);
    if (ontdekbaar2.error) throw new Error(`ontdekbaar 2: ${ontdekbaar2.error.message}`);

    // --- reports ------------------------------------------------------------
    const melding = await eigenaar.db.rpc('meld', {
      p_group_id: groupId,
      p_subject_id: buddy.id,
      p_reden: 'other',
      p_toelichting: 'Een testmelding',
    });
    const meldingData = (melding.data ?? {}) as { ok?: boolean; reason?: string };
    if (meldingData.ok !== true) {
      throw new Error(`melden: ${meldingData.reason ?? melding.error?.message}`);
    }

    // --- user_blocks --------------------------------------------------------
    const blokkade = await eigenaar.db.rpc('blokkeer', { p_user: buitenstaander.id });
    const blokkadeData = (blokkade.data ?? {}) as { ok?: boolean };
    if (blokkadeData.ok !== true) throw new Error(`blokkeren: ${blokkade.error?.message}`);

    // --- week_review_replies ------------------------------------------------
    // ⚠️ `group_period_start` moet een échte periodestart van deze groep zijn —
    //    een trigger toetst dat. De huddledag is de standaard van `create_group`.
    const periode = groepsperiodeVan({ huddle_day: 0, tz: 'Europe/Amsterdam' }, now());

    const review = await admin
      .from('week_reviews')
      .insert({
        group_id: groupId,
        user_id: eigenaar.id,
        group_period_start: periode.startDate,
        did_text: 'Deze week het hoofdstuk af.',
      })
      .select('id')
      .single();
    if (review.error || review.data === null) throw new Error(`weekreview: ${review.error?.message}`);

    const reactie = await buddy.db
      .from('week_review_replies')
      .insert({ week_review_id: review.data.id, author_id: buddy.id, body: 'Sterk gedaan' })
      .select('id')
      .single();
    if (reactie.error || reactie.data === null) throw new Error(`reactie: ${reactie.error?.message}`);

    doelwitten = [
      {
        tabel: 'approval_withdrawals',
        opdrachten: ['DELETE', 'INSERT', 'UPDATE'],
        poger: buddy,
        sleutel: { approval_id: gegeven.data.id },
        // ⚠️ **`created_at` en niet `approver_id`, en dat is gemeten.** PostgREST
        //    weigert een update die de rij uit het zicht van de schrijver zélf
        //    tilt, met precies dezelfde `42501` als een policy — hier ligt de
        //    zichtbaarheid op `approver_id`. Met die kolom als wijziging bleef
        //    deze test dus groen ook mét de policy wagenwijd open: hij bewaakte
        //    de guard van PostgREST en niet de policy (regel 18 vraag 3).
        wijziging: { created_at: '2024-01-01T00:00:00.000Z' },
        nieuweRij: {
          approval_id: vrijeGoedkeuring.data.id,
          completion_id: voltooiing2.data.id,
          approver_id: buddy.id,
        },
      },
      {
        tabel: 'deadline_requests',
        opdrachten: ['DELETE', 'INSERT', 'UPDATE'],
        poger: eigenaar,
        sleutel: { id: verzoekRij.data.id },
        wijziging: { status: 'approved' },
        nieuweRij: {
          goal_id: doel2.data.id,
          group_id: groupId,
          requester_id: eigenaar.id,
          old_date: addDays(vandaag, 90),
          new_date: addDays(vandaag, 300),
          reason: 'Rechtstreeks ingevoegd',
        },
      },
      {
        tabel: 'group_join_requests',
        opdrachten: ['DELETE', 'INSERT', 'UPDATE'],
        poger: buitenstaander,
        sleutel: { group_id: openId, user_id: buitenstaander.id },
        // ⚠️ Een wáárde die de CHECK toelaat. `'approved'` bestaat hier niet
        //    (pending/accepted/declined), en `23514` staat in `WEIGERCODES` —
        //    dus die wijziging maakte deze test groen om de verkeerde reden.
        wijziging: { status: 'accepted' },
        nieuweRij: { group_id: open2Id, user_id: buitenstaander.id },
      },
      {
        tabel: 'group_members',
        opdrachten: ['DELETE'],
        poger: buddy,
        sleutel: { group_id: groupId, user_id: buddy.id },
        wijziging: { role: 'admin' },
        nieuweRij: null,
      },
      {
        tabel: 'groups',
        opdrachten: ['DELETE', 'INSERT'],
        poger: eigenaar,
        sleutel: { id: groupId },
        wijziging: { name: 'Omgedoopt' },
        nieuweRij: { name: 'Rechtstreeks', created_by: eigenaar.id, invite_code: 'ALZ12345' },
      },
      {
        tabel: 'reports',
        opdrachten: ['DELETE', 'INSERT', 'UPDATE'],
        poger: eigenaar,
        sleutel: { reporter_id: eigenaar.id, group_id: groupId },
        // ⚠️ Idem: `reports_status_geldig` kent alleen open/reviewed/dismissed.
        wijziging: { status: 'reviewed' },
        nieuweRij: {
          reporter_id: eigenaar.id,
          subject_id: buddy.id,
          group_id: groupId,
          reden: 'other',
        },
      },
      {
        tabel: 'user_blocks',
        opdrachten: ['UPDATE'],
        poger: eigenaar,
        sleutel: { blocker_id: eigenaar.id, blocked_id: buitenstaander.id },
        wijziging: { blocked_id: buddy.id },
        nieuweRij: null,
      },
      {
        tabel: 'week_review_replies',
        opdrachten: ['UPDATE'],
        poger: buddy,
        sleutel: { id: reactie.data.id },
        wijziging: { body: 'Toch maar niet' },
        nieuweRij: null,
      },
    ];
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * ⚠️ **Dit is de assertie die het bestand houdbaar maakt, en niet een van de
   *    gevallen eronder.** De gevallen bewijzen dat de sloten dicht zitten; deze
   *    bewijst dat er geen slot buiten beeld valt. Zonder hem is dit weer de
   *    lijst van 0101, alleen langer.
   */
  it(
    'de fixtures dekken precies de policyhelften die `false` zijn',
    async () => {
      const { data, error } = await adminDb().rpc('alleenlezen_bewaking');
      if (error) throw new Error(`alleenlezen_bewaking: ${error.message}`);

      const gemeten = (data ?? []) as { tabel: string; opdracht: string }[];
      expect(gemeten.length, 'zonder rijen bewijst deze test niets').toBeGreaterThan(0);

      const uitDeDatabase = [...new Set(gemeten.map((r) => `${r.tabel} ${r.opdracht}`))].sort();
      const uitDeFixtures = doelwitten
        .flatMap((d) => d.opdrachten.map((o) => `${d.tabel} ${o}`))
        .sort();

      expect(uitDeFixtures, [
        'De fixtures en de database lopen uiteen.',
        'Staat er iets in de database dat hier ontbreekt, dan is er een tabel',
        'bijgekomen die de client niet mag schrijven — schrijf er een fixture bij.',
        'Ontbreekt er juist iets in de database, dan is een `false` weggevallen,',
        'en dat is de regressie waar dit bestand voor bestaat.',
      ].join('\n')).toEqual(uitDeDatabase);
    },
    TEST_TIMEOUT,
  );

  it(
    'geen enkele rij is door de client te verwijderen of te wijzigen',
    async () => {
      for (const d of doelwitten) {
        for (const opdracht of d.opdrachten) {
          if (opdracht === 'INSERT') continue;

          const bron = bouwer(d.poger.db, d.tabel);
          const poging = (): LosseVraag =>
            filter(opdracht === 'DELETE' ? bron.delete() : bron.update(d.wijziging), d.sleutel);

          await magNietLanden(poging, lees(d));
        }
      }
    },
    SETUP_TIMEOUT,
  );

  it(
    'geen enkele rij is door de client rechtstreeks in te voegen',
    async () => {
      for (const d of doelwitten) {
        if (!d.opdrachten.includes('INSERT') || d.nieuweRij === null) continue;

        const tel = async (): Promise<number | null | undefined> => {
          const uit = await bouwer(adminDb(), d.tabel).select('*', { count: 'exact', head: true });
          if (uit.error) throw new Error(`${d.tabel} tellen: ${uit.error.message}`);
          return uit.count;
        };

        const voor = await tel();
        const { error } = await bouwer(d.poger.db, d.tabel).insert(d.nieuweRij);

        expect(error, `${d.tabel}: de insert hoort te weigeren`).not.toBeNull();
        expect(
          WEIGERCODES as readonly string[],
          `${d.tabel}: geweigerd met ${error?.code} — ${error?.message}`,
        ).toContain(error?.code);

        expect(await tel(), `${d.tabel}: er is er tóch een bijgekomen`).toBe(voor);
      }
    },
    SETUP_TIMEOUT,
  );
});
