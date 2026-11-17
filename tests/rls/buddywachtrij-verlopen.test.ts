import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * Na veertien dagen in de buddywachtrij — QS8-643, migratie 0303.
 *
 * ⚠️⚠️ **De belofte: wie tevergeefs zocht, ziet dát, en kan opnieuw zoeken — ook
 *    als de matcher nooit gedraaid heeft.** Dat laatste is geen randgeval maar
 *    de stand van productie: de Edge Function `koppelen` is daar niet uitgerold
 *    (QS8-641), en zij is de enige die `wachtend` op `verlopen` zette. Zonder
 *    0303 bleef zo'n rij `wachtend`: de stand zei "we zoeken", en "opnieuw
 *    zoeken" kreeg `already_queued` en deed niets.
 *
 *    De twee naden uit de acceptatiecriteria staan hier elk apart:
 *    1. een rij die verloopt **zonder dat de matcher ooit gedraaid heeft**;
 *    2. een rij die verloopt **terwijl het scherm open staat**: dezelfde
 *       aanroep, eerst vóór en dan ná het verstrijken. (Wat het scherm zelf doet
 *       met een stand die het al vasthoudt, toetst `isVerlopen()` in
 *       `src/modules/buddies/wachtrij.test.ts`.)
 *
 * ⚠️ Het verstrijken gebeurt met `psql` als eigenaar van de tabel: veertien
 *    dagen wachten bestaat niet in een testsuite, en een client kan
 *    `expires_at` niet schrijven (0299, `goal_match_queue_update` is `false`).
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 240_000;

const CATEGORIE = 'nutrition';

let eva: TestUser;
let frank: TestUser;
let gijs: TestUser;
let hanna: TestUser;
let ilse: TestUser;
let jan: TestUser;

async function maakDoel(eigenaar: TestUser, titel: string, dagen: number): Promise<string> {
  const datum = new Date(Date.now() + dagen * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await eigenaar.db
    .from('goals')
    .insert({ owner_id: eigenaar.id, title: titel, category: CATEGORIE, target_date: datum })
    .select('id')
    .single();
  if (error) throw new Error(`doel ${titel}: ${error.message}`);
  return data.id;
}

function antwoord(data: unknown): string {
  const gelezen = (data ?? {}) as { ok?: boolean; reason?: string };
  if (gelezen.ok === true) return gelezen.reason === undefined ? 'ok' : `ok:${gelezen.reason}`;
  return gelezen.reason ?? 'geen antwoord';
}

async function zoek(wie: TestUser, goalId: string, bevestigd = true): Promise<string> {
  const { data, error } = await wie.db.rpc('zoek_buddies_aan', { p_goal_id: goalId, p_bevestigd: bevestigd });
  if (error) throw new Error(`zoek_buddies_aan: ${error.message}`);
  return antwoord(data);
}

interface Stand {
  status: string;
  nog_nodig: number;
  verloopt: string;
}

async function stand(wie: TestUser, goalId: string): Promise<readonly Stand[]> {
  const { data, error } = await wie.db.rpc('buddyzoek_stand', { p_goal_id: goalId });
  if (error) throw new Error(`buddyzoek_stand: ${error.message}`);
  return (data ?? []) as Stand[];
}

/** Laat de wachtende rij van dit doel verstrijken, zonder de matcher. */
function laatVerstrijken(goalId: string): void {
  psql(
    `update goal_match_queue
        set created_at = now() - interval '15 days', expires_at = now() - interval '1 day'
      where goal_id = '${goalId}' and status = 'wachtend'`,
  );
}

/** De statussen van de rijen van dit doel, zoals ze in de tabel staan. */
function statussenInDeTabel(goalId: string): string {
  return psql(
    `select coalesce(string_agg(status, ',' order by created_at), '') from goal_match_queue where goal_id = '${goalId}'`,
  ).trim();
}

describe.skipIf(!rlsTestsConfigured)('de buddywachtrij na veertien dagen — QS8-643', () => {
  beforeAll(async () => {
    eva = await createTestUser('verlopen-eva');
    frank = await createTestUser('verlopen-frank');
    gijs = await createTestUser('verlopen-gijs');
    hanna = await createTestUser('verlopen-hanna');
    ilse = await createTestUser('verlopen-ilse');
    jan = await createTestUser('verlopen-jan');

    const iedereen = [eva, frank, gijs, hanna, ilse, jan].map((u) => `'${u.id}'`).join(',');
    psql(`update profiles set week_start_day = 1 where id in (${iedereen})`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  describe('de stand kent verlopen', () => {
    it(
      'een rij die verloopt zonder dat de matcher ooit gedraaid heeft, heet verlopen, met de datum',
      async () => {
        const doel = await maakDoel(eva, 'verlopen-zonder-matcher', 40);
        expect(await zoek(eva, doel)).toBe('ok');
        laatVerstrijken(doel);

        // ⚠️ De tabel zegt nog `wachtend`: hier heeft niets hem omgezet.
        expect(statussenInDeTabel(doel)).toBe('wachtend');

        const [rij, ...rest] = await stand(eva, doel);
        expect(rest).toEqual([]);
        expect(rij?.status).toBe('verlopen');
        expect(rij?.nog_nodig).toBe(0);
        expect(new Date(rij?.verloopt ?? '').getTime()).toBeLessThan(Date.now());
      },
      TEST_TIMEOUT,
    );

    it(
      'een rij die verloopt terwijl het scherm open staat: dezelfde aanroep, eerst wachtend en daarna verlopen',
      async () => {
        const doel = await maakDoel(frank, 'verlopen-scherm-open', 40);
        expect(await zoek(frank, doel)).toBe('ok');

        expect((await stand(frank, doel))[0]?.status).toBe('wachtend');
        laatVerstrijken(doel);
        expect((await stand(frank, doel))[0]?.status).toBe('verlopen');

        // En als de matcher daarna wél draait, blijft het hetzelfde antwoord.
        psql(`select public.verloop_buddyzoekopdrachten(now())`);
        expect(statussenInDeTabel(doel)).toBe('verlopen');
        expect((await stand(frank, doel))[0]?.status).toBe('verlopen');
      },
      TEST_TIMEOUT,
    );

    it(
      'de oude handtekening met een peildag geeft dezelfde verlopen stand',
      async () => {
        const doel = await maakDoel(eva, 'verlopen-wrapper', 40);
        expect(await zoek(eva, doel)).toBe('ok');
        laatVerstrijken(doel);

        const { data, error } = await eva.db.rpc('buddyzoek_stand', { p_goal_id: doel, p_vandaag: '2030-01-01' });
        expect(error).toBeNull();
        expect(((data ?? []) as Stand[])[0]?.status).toBe('verlopen');
      },
      TEST_TIMEOUT,
    );

    it(
      'wie na een verlopen zoekopdracht opnieuw zoekt en dan zelf stopt, zoekt niet — geen oude verlopen-stand',
      async () => {
        // ⚠️ Gevonden in de security-review: de stand pakte de nieuwste rij ná
        //    het statusfilter, dus een `vertrokken` viel weg en de oudere
        //    `verlopen` kwam boven.
        const doel = await maakDoel(frank, 'verlopen-dan-stoppen', 40);
        expect(await zoek(frank, doel)).toBe('ok');
        laatVerstrijken(doel);
        expect(await zoek(frank, doel)).toBe('ok');

        const { data, error } = await frank.db.rpc('zoek_buddies_uit', { p_goal_id: doel });
        expect(error).toBeNull();
        expect(antwoord(data)).toBe('ok');

        expect(statussenInDeTabel(doel)).toBe('verlopen,vertrokken');
        expect(await stand(frank, doel)).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'een ander leest jouw verlopen stand niet',
      async () => {
        const doel = await maakDoel(eva, 'verlopen-privé', 40);
        expect(await zoek(eva, doel)).toBe('ok');
        laatVerstrijken(doel);

        expect(await stand(frank, doel)).toEqual([]);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('opnieuw zoeken na het verlopen', () => {
    it(
      'werkt ook als de matcher niet gedraaid heeft — geen already_queued meer',
      async () => {
        const doel = await maakDoel(gijs, 'opnieuw-zonder-matcher', 40);
        expect(await zoek(gijs, doel)).toBe('ok');
        laatVerstrijken(doel);

        expect(await zoek(gijs, doel)).toBe('ok');
        expect(statussenInDeTabel(doel)).toBe('verlopen,wachtend');
        expect((await stand(gijs, doel))[0]?.status).toBe('wachtend');
      },
      TEST_TIMEOUT,
    );

    it(
      'vraagt nog steeds de bevestiging, en zonder bevestiging komt er geen rij',
      async () => {
        const doel = await maakDoel(hanna, 'opnieuw-zonder-bevestiging', 40);
        expect(await zoek(hanna, doel)).toBe('ok');
        laatVerstrijken(doel);

        expect(await zoek(hanna, doel, false)).toBe('not_confirmed');
        expect(statussenInDeTabel(doel)).not.toContain('wachtend');
        expect((await stand(hanna, doel))[0]?.status).toBe('verlopen');
      },
      TEST_TIMEOUT,
    );

    it(
      'verstreken rijen tellen niet mee voor het plafond van drie tegelijk',
      async () => {
        const drie = [
          await maakDoel(ilse, 'plafond-1', 40),
          await maakDoel(ilse, 'plafond-2', 41),
          await maakDoel(ilse, 'plafond-3', 42),
        ];
        for (const doel of drie) expect(await zoek(ilse, doel)).toBe('ok');
        const vierde = await maakDoel(ilse, 'plafond-4', 43);
        expect(await zoek(ilse, vierde)).toBe('too_many_queued');

        for (const doel of drie) laatVerstrijken(doel);
        expect(await zoek(ilse, vierde)).toBe('ok');
      },
      TEST_TIMEOUT,
    );

    it(
      'zet alleen de eigen verstreken rijen om, nooit die van een ander',
      async () => {
        const vanJan = await maakDoel(jan, 'van-jan', 40);
        expect(await zoek(jan, vanJan)).toBe('ok');
        laatVerstrijken(vanJan);

        const vanEva = await maakDoel(eva, 'van-eva-erna', 40);
        expect(await zoek(eva, vanEva)).toBe('ok');

        expect(statussenInDeTabel(vanJan)).toBe('wachtend');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('het alternatief is nooit een automatisch gevormde groep', () => {
    it(
      'een groep uit de wachtrij staat niet in ontdek_groepen, en is niet ontdekbaar te maken',
      async () => {
        // Drie in dezelfde bak: dezelfde categorie, week-startdag en periode.
        const [a, b, c] = [frank, gijs, hanna];
        if (a === undefined || b === undefined || c === undefined) throw new Error('testgebruikers');
        for (const [wie, dagen] of [[a, 60], [b, 62], [c, 64]] as const) {
          expect(await zoek(wie, await maakDoel(wie, `bak-${wie.id}`, dagen))).toBe('ok');
        }
        psql(`select public.vorm_buddygroepen(current_date, 20)`);

        const automatisch = psql(
          `select coalesce(string_agg(g.id::text, ','), '') from groups g
            where g.automatisch
              and exists (select 1 from group_members m where m.group_id = g.id and m.user_id = '${a.id}')`,
        ).trim();
        expect(automatisch).not.toBe('');

        const { data, error } = await ilse.db.rpc('ontdek_groepen', {
          p_categorie: CATEGORIE, p_taal: null, p_limit: 50, p_offset: 0,
        });
        expect(error).toBeNull();
        const gevonden = ((data ?? []) as { group_id: string }[]).map((g) => g.group_id);
        for (const id of automatisch.split(',')) expect(gevonden).not.toContain(id);

        // ⚠️ En de reden is een CHECK, geen filter: ook de eigenaar van de tabel
        //    kan hem niet ontdekbaar maken.
        expect(() => psql(`update groups set ontdekbaar = true where id = '${automatisch.split(',')[0]}'`)).toThrow(
          /groups_automatisch_niet_ontdekbaar/,
        );
      },
      TEST_TIMEOUT,
    );
  });
});
