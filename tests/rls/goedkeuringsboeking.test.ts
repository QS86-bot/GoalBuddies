import { afterAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured } from './harness';
import { proefId } from './proefid';
import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

const TEST_TIMEOUT = 30_000;

/**
 * Een week draagt hoogstens één goedkeuringsboeking per ronde — QS8-454,
 * migratie 0267.
 *
 * ⚠️ **`points_ledger_dedupe_idx` héét de grendel tegen dubbel boeken, maar
 *    `reason` zit in zijn sleutel** — en `completion_approved_floor` en
 *    `completion_approved_ceiling` zijn twee verschillende redenen voor dezelfde
 *    week. 📏 Gemeten vóór 0267, op de draaiende stand: 2 rijen, som 3, voor een
 *    week met een plafond van 2.
 *
 * ⚠️⚠️ **Waarom dat niet af te doen is met "dat pad bestaat niet".** Alle drie de
 *    goedkeuringsroutes zetten `weekly_goals.status = 'approved'` en slaan over
 *    wat niet meer `pending` is, dus de tweede boeking is langs de normale weg
 *    onbereikbaar. Dat is precies de vorm uit onwrikbare regel 18: elk onderdeel
 *    klopt en de belofte hangt aan het gehéél. De index héét de grendel; wat hem
 *    werkelijk tegenhoudt is een statuscontrole twee lagen hoger. Een grendel die
 *    niet afdwingt wat hij belooft, is een grendel waar de volgende schrijver op
 *    vertrouwt.
 *
 * ⚠️ **Dit bestand staat los van `tests/rls/vastgelopen.test.ts`, en dat is een
 *    keuze uit het issue zelf.** Die suite gaat over vastgelopen goedkeuringen;
 *    dit is een eigenschap van `points_ledger`, en die hoort niet te verhuizen
 *    als die feature ooit verandert. Regel 18 vraag 4: toets de belofte, niet de
 *    plek waar hij vandaag toevallig ontstaat.
 *
 * ⚠️⚠️ **De drie must-allows wegen hier even zwaar als de weigering**, want een
 *    index die te veel dichttrekt breekt twee eerdere besluiten:
 *    * een `correction` naast een goedkeuring is **domeinregel 6** — corrigeren
 *      gebeurt met een record, niet door geschiedenis te overschrijven;
 *    * een goedkeuring op **ronde 2** is QS8-456 — een week die na een
 *      ingetrokken goedkeuring alsnog wordt goedgekeurd, moet weer uitbetalen.
 *
 *    Zonder die drie zou "alles botst" ook groen zijn op de weigering.
 *
 * ⚠️ 📏 De waarschuwing uit het issue geldt hier letterlijk: bij QS8-453 bleef een
 *    ijking van deze grendel **groen** omdat de mutatie hem niet raakte —
 *    `zonder_beoordelaar` aan de sleutel toevoegen verandert niets zolang de test
 *    dezelfde waarde invoert. Controleer dus dát je mutatie het geval raakt.
 */

/**
 * ⚠️ `proefId()` en geen vaste uuid: 📏 `gedeelde-identiteit:controle` wordt rood
 *    op een gebeitelde id, en terecht — draaien er twee suites tegen dezelfde
 *    lokale stack, dan dragen ze allebei dezelfde uuid en ruimt de één de rij
 *    van de ánder op (QS8-336).
 */
const GEBRUIKER = proefId(1);
const WEEK = proefId(2);

/**
 * ⚠️⚠️ **De beschikbaarheidsvraag gaat over de stáck en niet over de index onder
 *    test, en dat is met schade en schande zo gezet.** 📏 Een eerdere versie
 *    probeerde op `points_ledger_goedkeuring_per_ronde_idx`; bij het ijken —
 *    de index droppen — sloeg deze suite zichzelf daardoor **over** in plaats van
 *    rood te worden: *"Tests: no tests"*. In een volle run leest dat als groen.
 *
 *    Een probe die het onderwerp van de test ís, maakt van elke echte regressie
 *    een stille overslag. `points_ledger` bestaat zodra het schema er is en is
 *    dus wél een stackvraag.
 *
 * ⚠️ `stackBeschikbaarOfFaal()` en niet `rlsTestsConfigured`: dit bestand praat
 *    alleen met `psql` en heeft PostgREST niet nodig. Achter de PostgREST-vlag
 *    zou het zichzelf stil overslaan bij een kale `npm test` — mét de database
 *    ernaast, volledig meetbaar. Dat is het faalbeeld van QS8-270.
 */
const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'points_ledger'",
  import.meta.url,
);

/** Voert SQL uit in een transactie die altijd terugrolt. */
function inTerugrollendeTransactie(sql: string): string {
  return psqlMetInvoer(
    `begin;
     insert into auth.users (id, email) values ('${GEBRUIKER}', 'qs8454@test.local')
       on conflict do nothing;
     ${sql}
     rollback;`,
  );
}

/**
 * Boekt eerst een plafondboeking op ronde 1 en dan de rij onder test.
 *
 * ⚠️ Werpt als psql de tweede rij weigert — `psqlBasisArgumenten()` zet
 *    `ON_ERROR_STOP`, dus een botsing geeft een niet-nul exitcode. Dát is wat de
 *    weiger-toetsen hieronder opvangen.
 */
function boek(reason: string, delta: number, ronde = 1): string {
  return inTerugrollendeTransactie(
    `insert into points_ledger (user_id, delta, reason, ref_type, ref_id, ronde)
     values ('${GEBRUIKER}', 2, 'completion_approved_ceiling', 'weekly_goal', '${WEEK}', 1);
     insert into points_ledger (user_id, delta, reason, ref_type, ref_id, ronde)
     values ('${GEBRUIKER}', ${delta}, '${reason}', 'weekly_goal', '${WEEK}', ${ronde});`,
  );
}

/** De melding van een geweigerde boeking, of `''` als hij gewoon landde. */
function weigering(reason: string, delta: number, ronde = 1): string {
  try {
    boek(reason, delta, ronde);
    return '';
  } catch (fout) {
    return fout instanceof Error ? fout.message : String(fout);
  }
}

describe.runIf(beschikbaar)(
  'een week draagt hoogstens één goedkeuringsboeking per ronde (QS8-454)',
  () => {
    it('weigert een vloerboeking naast een plafondboeking in dezelfde ronde', () => {
      // 📏 Dít was het gat: twee redenen, dezelfde week, samen 3 punten waar het
      //    plafond 2 is.
      expect(
        weigering('completion_approved_floor', 1),
        'de tweede goedkeuringsboeking landde gewoon',
      ).toContain('points_ledger_goedkeuring_per_ronde_idx');
    });

    it('weigert ook twee plafondboekingen in dezelfde ronde', () => {
      // De bestaande `points_ledger_dedupe_idx` dekt dit al; hier staat hij zodat
      // een latere versmalling van díé index hier rood wordt en niet stil.
      expect(weigering('completion_approved_ceiling', 2)).toMatch(
        /points_ledger_(dedupe|goedkeuring_per_ronde)_idx/,
      );
    });

    it('laat een correction naast de goedkeuring staan — domeinregel 6', () => {
      // ⚠️ Must-allow. Corrigeren gebeurt met een record; botste dit, dan kon
      //    `trek_goedkeuring_in()` zijn werk niet doen.
      expect(weigering('correction', -2), 'de correctie werd geweigerd').toBe('');
    });

    it('laat een goedkeuring op ronde 2 staan — QS8-456', () => {
      // ⚠️⚠️ Must-allow, en de belangrijkste: zónder `ronde` in de nieuwe index
      //    zou dit botsen en stond de week weer `approved` met netto nul. Dat is
      //    precies de bug die 0266 repareerde.
      expect(weigering('completion_approved_ceiling', 2, 2)).toBe('');
    });

    it('laat een vloerboeking op ronde 2 staan', () => {
      // Dezelfde reden: de ronde onderscheidt, niet de reden.
      expect(weigering('completion_approved_floor', 1, 2)).toBe('');
    });

    it('de index bestaat en dekt precies de twee goedkeuringsredenen', () => {
      // ⚠️ Zonder deze assertie blijft de suite groen als iemand de index
      //    verbreedt naar élke reden — dan vallen de must-allows hierboven om,
      //    maar een latere lezer moet kunnen zien wát er beloofd was.
      const uit = psqlMetInvoer(
        `select indexdef from pg_indexes
         where indexname = 'points_ledger_goedkeuring_per_ronde_idx';`,
      );

      expect(uit, 'de index bestaat niet').toContain('points_ledger_goedkeuring_per_ronde_idx');
      expect(uit).toContain('completion_approved_floor');
      expect(uit).toContain('completion_approved_ceiling');
      expect(uit).toContain('ronde');
      expect(uit, 'correction hoort er juist buiten te vallen').not.toContain('correction');
    });
  },
);

/**
 * De keten door de échte functies — QS8-454, gevonden in de security-ronde.
 *
 * ⚠️⚠️ **Zonder dit blok waren de zes toetsen hierboven groen mét de bug erin,
 *    en dat is gemeten en niet bedacht.** Ze schrijven allemaal met de hand een
 *    `insert into points_ledger (…, ronde)` en kiezen de ronde **zelf** — precies
 *    het getal dat in de echte functies fout ging. Ze toetsen dus of het slot
 *    sluit, niet of de sleutel past.
 *
 *    📏 De bug: beide goedkeuringsfuncties telden `max(ronde) + 1` **per
 *    `reason`**, terwijl `points_ledger_goedkeuring_per_ronde_idx` over béíde
 *    goedkeuringsredenen heen sleutelt. Wisselt het niveau tussen twee rondes,
 *    dan begint de telling weer op 1, botst de insert, slikt
 *    `on conflict do nothing` hem, en staat de week `approved` met **0** punten.
 *
 * ⚠️ **En dat is de gewóne route, niet de uitzondering.** De meest voor de hand
 *    liggende reden om een goedkeuring in te trekken is dat het niveau niet
 *    klopte — en `dien_opnieuw_in()` laat de eigenaar het niveau vrij kiezen
 *    zolang de week `pending` staat, wat `trek_goedkeuring_in()` net gedaan heeft.
 *
 * ⚠️ Deze toets asserteert op het **puntentotaal** en niet op een indexnaam.
 *    Regel 18 vraag 2: de indexnaam is een eigenschap van het onderdeel, "een
 *    legitieme goedkeuring boekt punten" is de belofte.
 */
describe.skipIf(!rlsTestsConfigured)('de keten, met een niveauwissel tussen twee rondes', () => {
  afterAll(async () => {
    await removeTestUsers();
  }, TEST_TIMEOUT);

  it(
    'betaalt uit wanneer de week na een intrekking op een ander niveau wordt goedgekeurd',
    async () => {
      const eigenaar = await createTestUser('niveauwissel-eigenaar');
      const beoordelaar = await createTestUser('niveauwissel-beoordelaar');
      const admin = adminDb();
      const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

      const groep = await eigenaar.db.rpc('create_group', { group_name: 'Niveauwissel' });
      const g = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
      if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

      const mee = await beoordelaar.db.rpc('join_group_with_code', { code: g.group.invite_code });
      if ((mee.data as { ok?: boolean })?.ok !== true) throw new Error('beoordelaar werd geen lid');

      const doel = await eigenaar.db
        .from('goals')
        .insert({ owner_id: eigenaar.id, title: 'NIVEAUDOEL', target_date: addDays(vandaag, 90) })
        .select('id')
        .single();
      if (doel.error || !doel.data) throw new Error(`doel: ${doel.error?.message}`);

      const koppel = await eigenaar.db
        .from('goal_group_links')
        .insert({ goal_id: doel.data.id, group_id: g.group.id });
      if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

      const week = await admin
        .from('weekly_goals')
        .insert({
          goal_id: doel.data.id,
          title: 'NIVEAUWEEK',
          points_ceiling: 2,
          points_floor: 1,
          points_miss: -1,
          cycle_start_date: vandaag,
        })
        .select('id')
        .single();
      if (week.error || !week.data) throw new Error(`weekdoel: ${week.error?.message}`);

      // 1. de eigenaar rondt af op de VLOER
      const eerste = await eigenaar.db
        .from('completions')
        .insert({
          weekly_goal_id: week.data.id,
          user_id: eigenaar.id,
          achieved_level: 'floor',
          note: 'vloer gehaald',
          cycle_start_date: vandaag,
        })
        .select('id')
        .single();
      if (eerste.error || !eerste.data) throw new Error(`voltooiing: ${eerste.error?.message}`);

      // 2. de beoordelaar keurt goed -> +1
      const keur1 = await beoordelaar.db
        .from('completion_approvals')
        .insert({
          completion_id: eerste.data.id,
          approver_id: beoordelaar.id,
          subject_id: eigenaar.id,
          group_id: g.group.id,
          status: 'approved',
        })
        .select('id')
        .single();
      if (keur1.error) throw new Error(`goedkeuren: ${keur1.error.message}`);

      // 3. de beoordelaar trekt in — binnen het kwartier
      const terug = await beoordelaar.db.rpc('trek_goedkeuring_in', {
        p_approval_id: keur1.data.id as string,
      });
      if (terug.error) throw new Error(`intrekken: ${terug.error.message}`);

      // 4. de eigenaar dient opnieuw in, nu op het PLAFOND
      const opnieuw = await eigenaar.db.rpc('dien_opnieuw_in', {
        p_weekly_goal_id: week.data.id,
        p_achieved_level: 'ceiling',
        p_note: 'toch het plafond',
      });
      if (opnieuw.error) throw new Error(`opnieuw indienen: ${opnieuw.error.message}`);

      const nieuwe = await admin
        .from('completions')
        .select('id')
        .eq('weekly_goal_id', week.data.id)
        .is('superseded_by', null)
        .single();
      if (nieuwe.error || !nieuwe.data) throw new Error(`nieuwe voltooiing: ${nieuwe.error?.message}`);

      // 5. de beoordelaar keurt opnieuw goed
      const keur2 = await beoordelaar.db.from('completion_approvals').insert({
        completion_id: nieuwe.data.id,
        approver_id: beoordelaar.id,
        subject_id: eigenaar.id,
        group_id: g.group.id,
        status: 'approved',
      });
      if (keur2.error) throw new Error(`tweede goedkeuring: ${keur2.error.message}`);

      const boekingen = await admin
        .from('points_ledger')
        .select('delta')
        .eq('goal_id', doel.data.id);
      if (boekingen.error) throw new Error(`grootboek: ${boekingen.error.message}`);

      const netto = (boekingen.data ?? []).reduce((som, r) => som + (r.delta as number), 0);

      // ⚠️ 📏 Vóór de reparatie stond hier 0: de week `approved`, en de eigenaar
      //    met niets. Het plafond is 2, dus na +1 en −1 hoort er +2 te staan.
      expect(
        netto,
        'de week is goedgekeurd op een ander niveau maar levert netto niets op',
      ).toBe(2);
    },
    TEST_TIMEOUT,
  );
});
