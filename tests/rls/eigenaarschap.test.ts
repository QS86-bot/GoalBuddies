import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  WEIGERCODES,
  type TestUser,
} from './harness';

/**
 * De eigenaarsketen: doel, weekdoel, mijlpaal, voltooiing — QS8-262, ronde 4.
 *
 * Alle policies hier zeggen hetzelfde: **deze rij hangt aan een doel dat van jou
 * is.** `rls:dekking` mat op 03-09 dat geen enkele helft ervan bewaakt werd, en
 * dat is de zwaarste uitslag van dat rapport tot nu toe — dit is niet de rand van
 * het schema maar de kern.
 *
 * ⚠️ **Twee ervan zijn vóór dit bestand met de hand nagemeten**, omdat het te
 *    mooi was om te geloven: `completions_select` op `using (true)` en
 *    `goals_insert` op `with check (true)` lieten allebei de héle suite van 812
 *    tests groen. Je kon dus een doel op andermans naam zetten en elke voltooiing
 *    van iedereen lezen zonder dat er iets rood werd.
 *
 * ⚠️⚠️ **De reden dat 24 bestanden `completions` noemen en er geen één omvalt:
 *    ze handelen allemaal als de eigenaar of als groepsgenoot.** Ze toetsen dat
 *    de rij terugkomt voor wie hem hoort te zien. Niemand vroeg ooit wat een
 *    volstrékt onbetrokken gebruiker ziet. Dat is regel 18 vraag 2 in zijn
 *    zuiverste vorm: de tests toetsen een eigenschap van het ónderdeel ("de
 *    query werkt"), niet de belofte ("een ander kan er niet bij").
 *
 * ## De kolomgrant bepaalt welke helft je los kunt breken
 *
 * Dit is de vondst die het ontwerp van dit bestand stuurt, en hij is uit
 * `information_schema.column_privileges` gehaald en niet bedacht.
 *
 * ⚠️ **`goals_update` en `weekly_goals_update` zijn per helft niet te breken.**
 *    Bij allebei is `using` letterlijk dezelfde uitdrukking als `check`, en de
 *    kolom die de eigenaar aanwijst staat niet in de UPDATE-grant (`owner_id`
 *    respectievelijk `goal_id`). Zet je alleen `using` open, dan bereikt een
 *    vreemde de rij wél maar draagt de nieuwe rij nog steeds de eigenaar van een
 *    ander, dus `check` weigert. Zet je alleen `check` open, dan houdt `using`
 *    hem tegen. **Er bestaat geen rij die de ene helft passeert en de andere
 *    niet** — dezelfde vorm als `profiles_update` in ronde 3.
 *
 *    Het páár is wél te breken, en daar staat hieronder een test op. Die is
 *    geijkt door **beide** helften tegelijk open te zetten; dat is hier de
 *    grendel, en één mutatie per grendel blijft dus kloppen.
 *
 *    **Wordt per helft toetsbaar zodra de twee uitdrukkingen uit elkaar lopen**,
 *    of zodra `owner_id`/`goal_id` in de UPDATE-kolomgrant komt — dan kan een
 *    eigenaar zijn eigen rij naar een ander verplaatsen en is `check` in zijn
 *    eentje de grendel.
 *
 * ⚠️ **Bij `milestones_write` ligt het andersom, en dáárom kan dit bestand die
 *    twee helften wél scheiden.** `goal_id` staat daar wél in de UPDATE-grant.
 *    Drie routes, elk apart geijkt:
 *
 *    | Helft | Route |
 *    | -- | -- |
 *    | `using` | een DELETE — daar bestáát geen `check`, dus alleen `using` telt |
 *    | `using` | een vreemde trekt andermans mijlpaal naar zijn **eigen** doel: `check` zou slagen, alleen `using` houdt tegen |
 *    | `check` | een vreemde **voegt** een mijlpaal toe aan andermans doel — een INSERT kent geen `using` |
 *
 * ## ⚠️⚠️ PostgREST schrijft `UPDATE ... RETURNING`, en dat schuift de SELECT-policy ervoor
 *
 * Dit is de duurste vondst van deze ronde en hij kostte twee verkeerde tests.
 *
 * De `check`-route hierboven was eerst *"de eigenaar verplaatst zijn eigen
 * mijlpaal naar het doel van een ander"*. Die test was groen — óók met
 * `milestones_write.check` volledig open, en met exact dezelfde melding
 * `42501 new row violates row-level security policy`. Die melding komt daar dan
 * niet van de `check` maar van `milestones_select`: PostgREST voert een update
 * uit als `UPDATE ... RETURNING 1`, en met een RETURNING moet de níeuwe rij ook
 * door de SELECT-policy. De verplaatste mijlpaal valt daar buiten, dus weigert
 * hij. Pas met **beide** open landt hij (204, `goal_id` staat daarna op het doel
 * van de vreemde). Een INSERT wordt niet zo afgeschermd — gemeten: met alleen
 * `check` open landt die met een 201.
 *
 * Dezelfde schaduw trof `goals_update` en `weekly_goals_update`, en daar erger:
 * die tests lieten een **vreemde** het doel van een ander hernoemen en bleven
 * groen met beide helften open. `goals_select` is eigenaar-óf-groepsgenoot, dus
 * een vreemde ziet het doel niet, zijn `where` raakt nul rijen en de
 * update-policy komt er nooit aan te pas. De acteur is daarom een
 * **groepsgenoot**, met een must-see-test ervóór.
 *
 * **De regel die hieruit volgt en die breder geldt dan dit bestand:** een
 * schrijfpolicy is voor een PostgREST-client alleen bereikbaar zolang de
 * SELECT-policy van diezelfde tabel de rij dóórlaat — vóór én ná de wijziging.
 * Een test die dat niet regelt, toetst de SELECT-policy en denkt dat hij de
 * schrijfpolicy toetst.
 *
 * ## De tegentest hoort erbij
 *
 * Een vreemde die niets ziet en niets mag, bewijst niets zolang niet vaststaat
 * dat de eigenaar het wél kan: een kapotte fixture, een filter dat niets raakt of
 * een tabel die leeg bleef geven exact hetzelfde beeld. Elk geval hieronder heeft
 * daarom zijn must-allow-helft.
 *
 * ⚠️ **En bij de twee leespolicies staat de `or` per tak.** `completions_select`
 *    en `milestones_select` zijn *"ik ben de eigenaar"* óf *"ik deel een groep met
 *    dit doel"*. Op `soloGoalId` — aan géén groep gekoppeld — kán de groepstak
 *    niets doen, dus wat de eigenaar daar ziet, ziet hij via de eigenaarstak. Dat
 *    is de les van ronde 2, waar de eigenaarstak stilletjes door de groepstak
 *    gedekt werd omdat de eigenaar zelf ook lid was.
 *
 * ## Geijkt — acht mutaties, elk apart
 *
 * | # | Open gezet | Rood |
 * | -- | -- | -- |
 * | 1 | `goals_insert.check` | het doel op andermans naam |
 * | 2 | `completions_insert.check` | beide conjuncten (user_id én weekdoel) |
 * | 3 | `completions_select.using` | de vreemde ziet voltooiingen |
 * | 4 | `milestones_select.using` | de vreemde ziet mijlpalen |
 * | 5 | `milestones_write.using` | de twee `using:`-tests, plus de leestest — `for all` betekent dat deze helft óók SELECT stuurt |
 * | 6 | `milestones_write.check` | alleen de INSERT-test |
 * | 7 | `goals_update` — **beide** | de groepsgenoot hernoemt het doel |
 * | 8 | `weekly_goals_update` — **beide** | de groepsgenoot hernoemt het weekdoel |
 *
 * Bij 7 en 8 is elke helft ook los open gezet: **nul rood**, in beide richtingen.
 * Dat is de meting achter de bewering hierboven dat die helften elkaar dekken —
 * niet een redenering maar vier extra runs.
 *
 * ⚠️ Na afloop is het schema **opnieuw opgebouwd** en de suite opnieuw gedraaid.
 *    Een teruggezette mutatie is geen gemeten schema; dat heeft deze sessie al
 *    twee valse uitslagen gekost.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  /** Eigenaar van beide doelen, lid van de groep. */
  eigenaar: TestUser;
  /** Lid van dezelfde groep — ziet mee waar de groepstak geldt. */
  groepsgenoot: TestUser;
  /** Eigen groep, eigen doel, deelt niets met de eigenaar. */
  vreemde: TestUser;
  /** Gekoppeld aan de groep: hier werkt de groepstak. */
  groepsGoalId: string;
  /** Aan géén groep gekoppeld: hier kán alleen de eigenaarstak werken. */
  soloGoalId: string;
  /** Het doel van de vreemde — nodig om een mijlpaal naartoe te kunnen stelen. */
  vreemdGoalId: string;
  groepsWeekId: string;
  soloWeekId: string;
  groepsCompletionId: string;
  soloCompletionId: string;
  groepsMijlpaalId: string;
  soloMijlpaalId: string;
  vandaag: IsoDate;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('de eigenaarsketen van doel tot voltooiing', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('eig-eigenaar');
    const groepsgenoot = await createTestUser('eig-genoot');
    const vreemde = await createTestUser('eig-vreemde');

    const admin = adminDb();
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await eigenaar.db.rpc('create_group', { group_name: 'Eigenaarschap' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await groepsgenoot.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    const meeUit = (mee.data ?? {}) as { ok?: boolean; reason?: string };
    if (meeUit.ok !== true) throw new Error(`genoot: ${meeUit.reason ?? '?'}`);

    // ⚠️ De vreemde krijgt een eigen groep, zodat hij een gewone gebruiker is en
    //    niet iemand zonder enige groep. Anders zit er een tweede verschil in het
    //    geval waar deze tests niets over zeggen.
    const eigenGroep = await vreemde.db.rpc('create_group', { group_name: 'Eigenaarschap-vreemd' });
    if (((eigenGroep.data ?? {}) as { ok?: boolean }).ok !== true) {
      throw new Error(`vreemde groep: ${JSON.stringify(eigenGroep.data)}`);
    }

    const maakDoel = async (wie: TestUser, titel: string): Promise<string> => {
      const d = await wie.db
        .from('goals')
        .insert({ owner_id: wie.id, title: titel, target_date: addDays(vandaag, 90) })
        .select('id')
        .single();
      if (d.error || d.data === null) throw new Error(`doel ${titel}: ${d.error?.message}`);
      return d.data.id;
    };

    const groepsGoalId = await maakDoel(eigenaar, 'EIG-GROEP');
    const soloGoalId = await maakDoel(eigenaar, 'EIG-SOLO');
    const vreemdGoalId = await maakDoel(vreemde, 'EIG-VREEMD');

    const koppel = await eigenaar.db
      .from('goal_group_links')
      .insert({ goal_id: groepsGoalId, group_id: gd.group.id });
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    const maakWeek = async (goalId: string, titel: string): Promise<string> => {
      const r = await admin
        .from('weekly_goals')
        .insert({
          goal_id: goalId,
          title: titel,
          points_ceiling: 2,
          points_floor: 1,
          points_miss: -1,
          cycle_start_date: vandaag,
          cycle_index: 1,
        })
        .select('id')
        .single();
      if (r.error || r.data === null) throw new Error(`weekdoel ${titel}: ${r.error?.message}`);
      return r.data.id;
    };

    const groepsWeekId = await maakWeek(groepsGoalId, 'EIGWEEK-GROEP');
    const soloWeekId = await maakWeek(soloGoalId, 'EIGWEEK-SOLO');

    const maakVoltooiing = async (weekId: string): Promise<string> => {
      const r = await eigenaar.db
        .from('completions')
        .insert({
          weekly_goal_id: weekId,
          user_id: eigenaar.id,
          achieved_level: 'ceiling',
          note: 'af',
          cycle_start_date: vandaag,
        })
        .select('id')
        .single();
      if (r.error || r.data === null) throw new Error(`voltooiing: ${r.error?.message}`);
      return r.data.id;
    };

    const groepsCompletionId = await maakVoltooiing(groepsWeekId);
    const soloCompletionId = await maakVoltooiing(soloWeekId);

    const maakMijlpaal = async (goalId: string, titel: string): Promise<string> => {
      const r = await admin
        .from('milestones')
        .insert({ goal_id: goalId, title: titel, order_index: 1, status: 'todo' })
        .select('id')
        .single();
      if (r.error || r.data === null) throw new Error(`mijlpaal ${titel}: ${r.error?.message}`);
      return r.data.id;
    };

    const groepsMijlpaalId = await maakMijlpaal(groepsGoalId, 'EIGMIJL-GROEP');
    const soloMijlpaalId = await maakMijlpaal(soloGoalId, 'EIGMIJL-SOLO');

    w = {
      eigenaar,
      groepsgenoot,
      vreemde,
      groepsGoalId,
      soloGoalId,
      vreemdGoalId,
      groepsWeekId,
      soloWeekId,
      groepsCompletionId,
      soloCompletionId,
      groepsMijlpaalId,
      soloMijlpaalId,
      vandaag,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een insert die moet weigeren, met de code die daarbij hoort. */
  async function insertMagNiet(
    poging: () => PromiseLike<{ error: { code?: string; message?: string } | null }>,
    wat: string,
  ): Promise<void> {
    const { error } = await poging();
    expect(error, `${wat}: dit hoort geweigerd te worden`).not.toBeNull();
    expect(
      WEIGERCODES as readonly string[],
      `${wat}: geweigerd met ${error?.code} — ${error?.message}. Dat is geen ` +
        'policy-weigering maar iets anders, en dan bewaakt deze test de verkeerde grendel',
    ).toContain(error?.code);
  }

  /** Leest een rij als `service_role`, dus buiten elke policy om. */
  const rij = (tabel: 'goals' | 'weekly_goals' | 'milestones', id: string) => () =>
    adminDb().from(tabel).select('*').eq('id', id).maybeSingle();

  /**
   * ⚠️ **`milestones_goal_order_uniq` eist een eigen `order_index` per doel.**
   *    Deelden de wegwerprijen er één, dan ketste de tweede af op die index — en
   *    bij de weigertests zou dat betekenen dat ze `23505` teruggeven in plaats
   *    van een policy-weigering. `23505` staat niet in `WEIGERCODES`, dus dan
   *    was de test rood om de verkeerde reden geweest. Gemeten en niet bedacht.
   */
  let index = 10;
  const volgendeIndex = (): number => (index += 1);

  /**
   * Een verse mijlpaal op het solodoel, alleen voor deze ene test.
   *
   * ⚠️ **Elke test die bij een geslaagde mutatie de rij écht verplaatst of wist,
   *    hoort op een eigen rij te werken.** Anders is de rij weg of verhuisd
   *    zodra je de grendel breekt, vallen de tests erna om op een lege of
   *    andermans rij, en wijst de ijking vier grendels aan waar er één stuk is.
   *    Gemeten: dat gebeurde hier twee keer, en het maakte mutatie 5
   *    onleesbaar.
   */
  async function wegwerpMijlpaal(titel: string): Promise<string> {
    const r = await adminDb()
      .from('milestones')
      .insert({ goal_id: w.soloGoalId, title: titel, order_index: volgendeIndex(), status: 'todo' })
      .select('id')
      .single();
    if (r.error || r.data === null) throw new Error(`wegwerpmijlpaal: ${r.error?.message}`);
    return r.data.id;
  }

  // ---------------------------------------------------------------------------
  describe('goals_insert (check) — een doel staat op jouw naam of het bestaat niet', () => {
    it(
      'je kunt geen doel op andermans naam zetten',
      async () => {
        await insertMagNiet(
          () =>
            w.vreemde.db.from('goals').insert({
              owner_id: w.eigenaar.id,
              title: 'GESTOLEN DOEL',
              target_date: addDays(w.vandaag, 30),
            }),
          'een doel met andermans owner_id',
        );

        // ⚠️ Niet alleen de foutcode: een weigering die tóch landt is erger dan
        //    geen weigering, want dan staat de test er als bewijs voor een slot
        //    dat niets deed.
        const gelekt = await adminDb()
          .from('goals')
          .select('id')
          .eq('title', 'GESTOLEN DOEL');
        expect(gelekt.data ?? [], 'het doel is alsnog aangemaakt').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'je kunt wél een doel op je eigen naam zetten',
      async () => {
        const { error } = await w.vreemde.db.from('goals').insert({
          owner_id: w.vreemde.id,
          title: 'EIGEN DOEL',
          target_date: addDays(w.vandaag, 30),
        });
        expect(error, 'je eigen doel aanmaken hoort te lukken').toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('completions_insert (check) — twee conjuncten, elk apart', () => {
    it(
      'je kunt geen voltooiing op naam van een ander boeken',
      async () => {
        // `weekly_goal_id` is van de eigenaar zélf, dus de tweede conjunct is
        // tevreden. Alleen `user_id = auth.uid()` kan dit nog tegenhouden.
        await insertMagNiet(
          () =>
            w.eigenaar.db.from('completions').insert({
              weekly_goal_id: w.soloWeekId,
              user_id: w.vreemde.id,
              achieved_level: 'ceiling',
              note: 'niet van mij',
              cycle_start_date: w.vandaag,
            }),
          'een voltooiing met andermans user_id',
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'je kunt geen voltooiing hangen aan het weekdoel van een ander',
      async () => {
        // `user_id` is de vreemde zélf, dus de eerste conjunct is tevreden.
        // Alleen "dit weekdoel hangt aan mijn doel" kan dit nog tegenhouden.
        await insertMagNiet(
          () =>
            w.vreemde.db.from('completions').insert({
              weekly_goal_id: w.soloWeekId,
              user_id: w.vreemde.id,
              achieved_level: 'ceiling',
              note: 'niet mijn week',
              cycle_start_date: w.vandaag,
            }),
          'een voltooiing op andermans weekdoel',
        );
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('completions_select (using) — wie mag een voltooiing lezen', () => {
    it(
      'de eigenaar ziet zijn voltooiing op een doel dat aan géén groep hangt',
      async () => {
        const { data } = await w.eigenaar.db
          .from('completions')
          .select('id')
          .eq('id', w.soloCompletionId);
        expect(data ?? [], 'de eigenaarstak hoort dit door te laten').toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot ziet de voltooiing op het gekoppelde doel',
      async () => {
        const { data } = await w.groepsgenoot.db
          .from('completions')
          .select('id')
          .eq('id', w.groepsCompletionId);
        expect(data ?? [], 'de groepstak hoort dit door te laten').toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een vreemde ziet geen van beide voltooiingen',
      async () => {
        const { data } = await w.vreemde.db
          .from('completions')
          .select('id')
          .in('id', [w.soloCompletionId, w.groepsCompletionId]);
        expect(
          data ?? [],
          'een gebruiker zonder enige band met dit doel leest hier voltooiingen',
        ).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('milestones_select (using) — wie mag een mijlpaal lezen', () => {
    it(
      'de eigenaar ziet zijn mijlpaal op een doel dat aan géén groep hangt',
      async () => {
        const { data } = await w.eigenaar.db
          .from('milestones')
          .select('id')
          .eq('id', w.soloMijlpaalId);
        expect(data ?? [], 'de eigenaarstak hoort dit door te laten').toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot ziet de mijlpaal op het gekoppelde doel',
      async () => {
        const { data } = await w.groepsgenoot.db
          .from('milestones')
          .select('id')
          .eq('id', w.groepsMijlpaalId);
        expect(data ?? [], 'de groepstak hoort dit door te laten').toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een vreemde ziet geen van beide mijlpalen',
      async () => {
        const { data } = await w.vreemde.db
          .from('milestones')
          .select('id')
          .in('id', [w.soloMijlpaalId, w.groepsMijlpaalId]);
        expect(data ?? [], 'een vreemde leest hier mijlpalen').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('milestones_write — de enige policy hier waarvan de helften te scheiden zijn', () => {
    it(
      'using: een vreemde wist de mijlpaal van een ander niet',
      async () => {
        // ⚠️ Een DELETE heeft geen `check`. Dit is dus de zuiverste isolatie van
        //    de `using`-helft die er bestaat.
        //
        // ⚠️ **Op een eigen wegwerprij en niet op `soloMijlpaalId`.** Bij het
        //    ijken lukt deze delete per definitie, en dan was de fixture weg en
        //    vielen de drie tests hierna om op een lege `lees()` in plaats van op
        //    hun eigen grendel. Een ijking die zijn buren meesleept, wijst niets
        //    aan.
        const id = await wegwerpMijlpaal('EIGMIJL-WEGWERP-WIS');

        await magNietLanden(
          () => w.vreemde.db.from('milestones').delete().eq('id', id),
          rij('milestones', id),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'using: een vreemde trekt andermans mijlpaal niet naar zijn eigen doel',
      async () => {
        // ⚠️ De tweede route naar dezelfde helft, en de scherpste: de nieuwe rij
        //    zou de `check` glansrijk halen — `goal_id` wijst dan naar een doel
        //    van de vreemde zélf. Alleen `using` houdt dit nog tegen.
        const id = await wegwerpMijlpaal('EIGMIJL-WEGWERP-TREK');

        await magNietLanden(
          () => w.vreemde.db.from('milestones').update({ goal_id: w.vreemdGoalId }).eq('id', id),
          rij('milestones', id),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'check: een vreemde hangt geen mijlpaal aan het doel van een ander',
      async () => {
        // ⚠️ **Een INSERT, want dat is de énige route die de `check`-helft alléén
        //    raakt.** Een INSERT kent geen `using`, dus er is niets anders dat
        //    hem kan tegenhouden — gemeten: met alleen deze helft open landt de
        //    rij met een 201.
        await insertMagNiet(
          () =>
            w.vreemde.db.from('milestones').insert({
              goal_id: w.soloGoalId,
              title: 'INGESLOPEN MIJLPAAL',
              order_index: volgendeIndex(),
              status: 'todo',
            }),
          'een mijlpaal op andermans doel',
        );

        const gelekt = await adminDb()
          .from('milestones')
          .select('id')
          .eq('title', 'INGESLOPEN MIJLPAAL');
        expect(gelekt.data ?? [], 'de mijlpaal is alsnog aangemaakt').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een mijlpaal is niet naar het doel van een ander te duwen (het páár write.check + select.using)',
      async () => {
        // ⚠️ **Deze staat er als belofte en niet als grendel, en dat verschil is
        //    gemeten.** Zet je alleen `milestones_write.check` open, dan weigert
        //    dit nog steeds — met dezelfde `42501 new row violates row-level
        //    security policy`, en dat is misleidend, want die komt dan niet van
        //    de `check`. PostgREST schrijft zijn UPDATE als
        //    `UPDATE ... RETURNING 1`, en met een RETURNING moet de níeuwe rij
        //    óók door de SELECT-policy. Die ziet de verplaatste mijlpaal niet
        //    meer, dus die weigert.
        //
        //    Pas met `milestones_write.check` **en** `milestones_select.using`
        //    allebei open landt hij (204, en `goal_id` staat daarna op het doel
        //    van de vreemde). Dat is dus het paar, en beide helften worden
        //    hierboven al apart bewaakt — deze test voegt geen dekking toe maar
        //    legt de belofte vast in de vorm waarin een gebruiker hem kent.
        const id = await wegwerpMijlpaal('EIGMIJL-WEGWERP-DUW');

        await magNietLanden(
          () => w.eigenaar.db.from('milestones').update({ goal_id: w.vreemdGoalId }).eq('id', id),
          rij('milestones', id),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar past zijn eigen mijlpaal wél aan',
      async () => {
        const { error } = await w.eigenaar.db
          .from('milestones')
          .update({ title: 'EIGMIJL-SOLO-HERNOEMD' })
          .eq('id', w.soloMijlpaalId);
        expect(error, 'je eigen mijlpaal hernoemen hoort te lukken').toBeNull();

        const na = await adminDb()
          .from('milestones')
          .select('title')
          .eq('id', w.soloMijlpaalId)
          .single();
        expect(na.data?.title).toBe('EIGMIJL-SOLO-HERNOEMD');
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('goals_update en weekly_goals_update — het páár, want de helften dekken elkaar', () => {
    /**
     * ⚠️ **De acteur is hier een groepsgenoot en met opzet geen vreemde.** De
     *    eerste versie liet een vreemde het doel van een ander hernoemen, en die
     *    test was groen met `goals_update` **volledig** open — beide helften. De
     *    reden is dat `goals_select` eigenaar-óf-groepsgenoot is: een vreemde
     *    ziet het doel niet, dus de `where` van zijn UPDATE raakt nul rijen en de
     *    update-policy komt er nooit aan te pas. Dat is een stríkter slot, maar
     *    het betekent dat die test een grendel bewaakte die niet aan de beurt was.
     *
     *    Een groepsgenoot ziet het doel wél. Daar ís `goals_update` het enige dat
     *    hem tegenhoudt, en daarom staat de must-see-test hieronder als eerste:
     *    zonder bewijs dat hij de rij zíet, bewijst "hij kan hem niet wijzigen"
     *    niets.
     */
    it(
      'een groepsgenoot ziet het doel — anders bewaakt de test hieronder niets',
      async () => {
        const { data } = await w.groepsgenoot.db
          .from('goals')
          .select('id')
          .eq('id', w.groepsGoalId);
        expect(
          data ?? [],
          'de groepsgenoot ziet het doel niet, dus de UPDATE hieronder raakt nul ' +
            'rijen en toetst goals_update helemaal niet',
        ).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot hernoemt het doel van een ander niet',
      async () => {
        await magNietLanden(
          () =>
            w.groepsgenoot.db.from('goals').update({ title: 'GEKAAPT' }).eq('id', w.groepsGoalId),
          rij('goals', w.groepsGoalId),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar hernoemt zijn eigen doel wél',
      async () => {
        const { error } = await w.eigenaar.db
          .from('goals')
          .update({ title: 'EIG-GROEP-HERNOEMD' })
          .eq('id', w.groepsGoalId);
        expect(error, 'je eigen doel hernoemen hoort te lukken').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot ziet het weekdoel — anders bewaakt de test hieronder niets',
      async () => {
        const { data } = await w.groepsgenoot.db
          .from('weekly_goals')
          .select('id')
          .eq('id', w.groepsWeekId);
        expect(
          data ?? [],
          'de groepsgenoot ziet het weekdoel niet, dus de UPDATE hieronder toetst ' +
            'weekly_goals_update helemaal niet',
        ).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot hernoemt het weekdoel van een ander niet',
      async () => {
        await magNietLanden(
          () =>
            w.groepsgenoot.db
              .from('weekly_goals')
              .update({ title: 'GEKAAPT' })
              .eq('id', w.groepsWeekId),
          rij('weekly_goals', w.groepsWeekId),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar hernoemt zijn eigen weekdoel wél',
      async () => {
        const { error } = await w.eigenaar.db
          .from('weekly_goals')
          .update({ title: 'EIGWEEK-GROEP-HERNOEMD' })
          .eq('id', w.groepsWeekId);
        expect(error, 'je eigen weekdoel hernoemen hoort te lukken').toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
