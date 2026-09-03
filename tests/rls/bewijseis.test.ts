/**
 * De bewijseis van een groep, in beide richtingen gemeten — QS8-261.
 *
 * ⚠️ **Dit is de test die er niet was, en dat is de hele bevinding.**
 *    `note_and_attachment` bestond op zes plekken en werd op nul plekken
 *    afgedwongen: de CHECK liet hem toe, `BEWIJSEISEN` bood hem aan, het scherm
 *    liet hem kiezen, beide catalogi vertaalden hem, `bewijseisVoorDoel()` leidde
 *    hem af als strengste eis, en `completions.attachment_url` had er een
 *    INSERT-kolomgrant voor. Alleen `enforce_evidence_policy()` deed er niets
 *    mee.
 *
 *    Er was niets kápot — elk onderdeel klopte — dus geen enkele test werd rood.
 *    Onwrikbare regel 18, vraag 5: de keten waarvan elk schakeltje af is en die
 *    nergens verbonden wordt.
 *
 * ⚠️ **Een gelijkheidstoets en geen insluiting, en dat is de les van 0032.** Daar
 *    kwam `deadline_requested` op de CHECK terwijl `SYSTEEM_GEBEURTENISSEN` op
 *    acht bleef staan, en de test die dat had moeten vangen vergeleek de
 *    app-lijst met zichzelf. Hier wordt het rood ongeacht welke kant het eerst
 *    verandert: verruimt iemand de CHECK zonder `BEWIJSEISEN`, óf `BEWIJSEISEN`
 *    zonder de CHECK.
 *
 * ⚠️ **Wat hier bewust níét staat: een toets op de INSERT-kolomgrant van
 *    `completions.attachment_url`.** 0150 trekt dat recht in omdat zijn reden
 *    wegvalt, en dat wordt al bewaakt door `npm run kolomrechten:controle` —
 *    die meldt een grant zonder schrijfpad, en de uitzondering die hem stil
 *    hield is met dit issue verwijderd. Een tweede toets hier zou een tweede
 *    lijst zijn, en dat is precies de fout die dit bestand bewaakt.
 *
 * ⚠️ Rechtstreeks uit `schemas.ts` en niet via `modules/buddies/index.ts`. Die
 *    laatste re-exporteert `api.ts`, en die trekt de Supabase-client en
 *    AsyncStorage mee — en daarmee React Native, in een test die in Node draait.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BEWIJSEISEN } from '../../src/modules/buddies/schemas';
import { userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestProfile,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const TEST_TIMEOUT = 30_000;
const SETUP_TIMEOUT = 180_000;

describe.skipIf(!rlsTestsConfigured)('de bewijseis van een groep — QS8-261', () => {
  afterAll(async () => {
    await removeTestUsers();
  });

  it(
    'de database en de app staan exact dezelfde bewijseisen toe',
    async () => {
      const { data, error } = await adminDb().rpc('bewijseis_allowlist');

      expect(error).toBeNull();

      const inDeDatabase = [...((data as string[] | null) ?? [])].sort();
      const inDeApp = [...BEWIJSEISEN].sort();

      expect(inDeDatabase).toEqual(inDeApp);
    },
    TEST_TIMEOUT,
  );

  it(
    'accepteert elke bewijseis die de app kent',
    async () => {
      // ⚠️ De andere kant van de allowlist, en die is niet vanzelfsprekend: de
      //    test hierboven leest de CHECK, deze schrijft er doorheen. Een CHECK
      //    die niemand ooit raakt, kan een waarde noemen die de kolom om een
      //    andere reden weigert.
      const eigenaar = await createTestProfile('bewijseis-ja');

      const groep = await adminDb()
        .from('groups')
        .insert({
          name: 'Bewijseis-allowlist',
          created_by: eigenaar.id,
          invite_code: 'BEWIJSEISJAJA',
        })
        .select('id')
        .single();

      expect(groep.error).toBeNull();

      for (const toegestaan of BEWIJSEISEN) {
        const poging = await adminDb()
          .from('groups')
          .update({ evidence_policy: toegestaan })
          .eq('id', groep.data?.id ?? '')
          .select('evidence_policy')
          .single();

        expect(poging.error, `${toegestaan} zou moeten mogen`).toBeNull();
        expect(poging.data?.evidence_policy).toBe(toegestaan);
      }

      await adminDb().from('groups').delete().eq('id', groep.data?.id ?? '');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert note_and_attachment — die waarde bestaat sinds 0150 niet meer',
    async () => {
      // ⚠️ Via `adminDb()` en dus onder `service_role`. Een CHECK geldt óók voor
      //    die rol, en dat is het punt: dit is een grens in het schema en niet
      //    in een policy. Wie de CHECK verruimt, krijgt hier een groene test in
      //    plaats van een rode — en dan is de test hierboven het slot.
      const eigenaar = await createTestProfile('bewijseis-nee');

      const groep = await adminDb()
        .from('groups')
        .insert({
          name: 'Bewijseis-geweigerd',
          created_by: eigenaar.id,
          invite_code: 'BEWIJSEISNEEE',
        })
        .select('id')
        .single();

      expect(groep.error).toBeNull();

      const poging = await adminDb()
        .from('groups')
        .update({ evidence_policy: 'note_and_attachment' })
        .eq('id', groep.data?.id ?? '')
        .select('id');

      expect(poging.error).not.toBeNull();
      expect(poging.error?.code).toBe('23514');

      await adminDb().from('groups').delete().eq('id', groep.data?.id ?? '');
    },
    TEST_TIMEOUT,
  );
});

/**
 * ⚠️ **En dit is het gat dat bij het repareren aan het licht kwam.**
 *    `enforce_evidence_policy()` bestaat sinds 0021 en dwingt de notitie af.
 *    Gemeten op 02-09: geen enkele test raakte die belofte. `policies.test.ts`
 *    noemt `note_required` één keer, maar als *reden* in een ander antwoord;
 *    `domeinregel3` en `epic13` schrijven in hun commentaar dat hun groep op
 *    `optional` staat en de eis dus niet meedoet.
 *
 *    0150 herschrijft die functie — de dode `note_and_attachment`-tak gaat eruit
 *    — en dan is "er is geen test die dit kan raken" geen detail meer. Zonder
 *    deze tests bewijst niets dat de notitie-eis de herschrijving overleeft.
 */
describe.skipIf(!rlsTestsConfigured)('note_required wordt echt afgedwongen', () => {
  let alice: TestUser;
  let doelId: string;
  let cyclusStart: string;
  let volgendeIndex = 0;

  /**
   * ⚠️ **Een eigen weekdoel per test, en dat is geen netheid.** De eerste versie
   *    deelde er één. Bij de mutatieproef — de notitie-eis uit de trigger halen —
   *    werd de derde test óók rood, maar op een dubbele voltooiing en niet op zijn
   *    eigen belofte. Een test die rood wordt om de verkeerde reden bewijst niets,
   *    en dit is dezelfde kruisbesmetting die QS8-145 kwam opruimen.
   */
  async function versWeekdoel(): Promise<string> {
    volgendeIndex += 1;

    const weekdoel = await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: doelId,
        title: `Bewijseisweek ${volgendeIndex}`,
        cycle_start_date: cyclusStart,
        cycle_index: volgendeIndex,
      })
      .select('id')
      .single();

    if (weekdoel.error || weekdoel.data === null) {
      throw new Error(`weekdoel: ${weekdoel.error?.message}`);
    }
    return weekdoel.data.id;
  }

  beforeAll(async () => {
    alice = await createTestUser('bewijseis-eis');

    const groep = await alice.db.rpc('create_group', { group_name: 'Bewijseis-eis' });
    const uit = (groep.data ?? {}) as { ok?: boolean; group?: { id: string } };
    if (groep.error || uit.ok !== true || uit.group === undefined) {
      throw new Error(`Groep niet aangemaakt: ${groep.error?.message ?? 'geen groep'}`);
    }

    // ⚠️ `create_group` zet de standaard, en die is `note_required`. Toch hier
    //    expliciet, want deze test gaat over díe waarde en niet over wat de
    //    standaard toevallig vandaag is.
    const eis = await adminDb()
      .from('groups')
      .update({ evidence_policy: 'note_required' })
      .eq('id', uit.group.id);
    if (eis.error) throw new Error(`bewijseis: ${eis.error.message}`);

    const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());
    cyclusStart = cycle.startDate;

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Bewijseisdoel', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const koppel = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: uit.group.id });
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    doelId = doel.data.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'weigert een voltooiing zonder notitie',
    async () => {
      const poging = await alice.db.from('completions').insert({
        weekly_goal_id: await versWeekdoel(),
        user_id: alice.id,
        achieved_level: 'ceiling',
        cycle_start_date: cyclusStart,
      });

      expect(poging.error).not.toBeNull();
      expect(poging.error?.code).toBe('23514');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een notitie die alleen uit spaties bestaat',
    async () => {
      // ⚠️ `btrim` staat er niet voor de sier: zonder die regel voldoet één
      //    spatie aan "de groep vraagt om een korte notitie", en dan is de eis
      //    een formaliteit in plaats van iets om op te reageren.
      const poging = await alice.db.from('completions').insert({
        weekly_goal_id: await versWeekdoel(),
        user_id: alice.id,
        achieved_level: 'ceiling',
        note: '   ',
        cycle_start_date: cyclusStart,
      });

      expect(poging.error).not.toBeNull();
      expect(poging.error?.code).toBe('23514');
    },
    TEST_TIMEOUT,
  );

  it(
    'de strengste groep wint als een doel er in twee hangt',
    async () => {
      // ⚠️ **Deze test komt uit een mutatie die groen bleef.** `bool_or` naar
      //    `bool_and` omzetten — "alle groepen moeten het vragen" in plaats van
      //    "één is genoeg" — haalde geen enkele test onderuit, want de opstelling
      //    hierboven heeft maar één groep. Dan is de belofte niet te ráken.
      //
      //    Onwrikbare regel 18, vraag 6: dit is een aanname die van "er is er
      //    altijd precies één" naar "er kunnen er meer zijn" is getild, en dat
      //    gebeurde bij QS8-56 zonder dat deze eis meeging.
      //
      //    De losse groep staat op `optional`. Zou de losste winnen, dan bepaalt
      //    de vrijblijvendste groep hoeveel bewijs alle andere krijgen — precies
      //    wat de kop van 0021 uitsluit.
      const tweede = await alice.db.rpc('create_group', { group_name: 'Bewijseis-los' });
      const uit = (tweede.data ?? {}) as { ok?: boolean; group?: { id: string } };
      if (tweede.error || uit.ok !== true || uit.group === undefined) {
        throw new Error(`tweede groep: ${tweede.error?.message ?? 'geen groep'}`);
      }

      const los = await adminDb()
        .from('groups')
        .update({ evidence_policy: 'optional' })
        .eq('id', uit.group.id);
      expect(los.error).toBeNull();

      const koppel = await alice.db
        .from('goal_group_links')
        .insert({ goal_id: doelId, group_id: uit.group.id });
      expect(koppel.error).toBeNull();

      const poging = await alice.db.from('completions').insert({
        weekly_goal_id: await versWeekdoel(),
        user_id: alice.id,
        achieved_level: 'ceiling',
        cycle_start_date: cyclusStart,
      });

      expect(poging.error).not.toBeNull();
      expect(poging.error?.code).toBe('23514');

      await alice.db
        .from('goal_group_links')
        .delete()
        .eq('goal_id', doelId)
        .eq('group_id', uit.group.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een voltooiing mét notitie door',
    async () => {
      // De andere kant, en die is even nodig: een trigger die álles weigert
      //    haalt de twee tests hierboven ook.
      const poging = await alice.db
        .from('completions')
        .insert({
          weekly_goal_id: await versWeekdoel(),
          user_id: alice.id,
          achieved_level: 'ceiling',
          note: 'Deze week drie keer gelopen.',
          cycle_start_date: cyclusStart,
        })
        .select('id')
        .single();

      expect(poging.error).toBeNull();
      expect(poging.data?.id).toBeTruthy();
    },
    TEST_TIMEOUT,
  );
});
