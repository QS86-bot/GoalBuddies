/**
 * Te laat afronden laat de straf staan — QS8-322, migratie 0238.
 *
 * **De belofte die dit bestand bewaakt:**
 *
 *      Rond je je doel ná de respijtdag af, dan vervalt je straf niet: hij
 *      blijft staan en wordt verschuldigd. Rond je op tijd af, dan vervalt hij
 *      wél — dat is het besluit van 21-08-2026 en dat blijft.
 *
 * ⚠️⚠️ **Deze test staat met opzet op de kéten en niet op de tak.** Alleen de
 *    `else`-tak van `wikkel_commitments_af()` toetsen zou groen zijn geweest
 *    terwijl er niets gerepareerd was: `rond_doel_af()` zet het doel op
 *    `completed` en `maak_straffen_verschuldigd()` filterde dat weg, dus de
 *    straf bleef eeuwig op `set` staan. Elk onderdeel klopte; de keten was
 *    onderbroken. Regel 18 vraag 5, en het issue waarschuwde er zelf voor.
 *
 *    Daarom loopt §1 het hele pad af: doel met verstreken deadline → afronden →
 *    de job → `due`. Een test die bij "de straf staat nog op set" was gestopt,
 *    had de reparatie niet gemeten maar alleen de helft ervan.
 *
 * ⚠️ **§2 is een must-allow en geen bijvangst.** Zonder die helft is de
 *    goedkoopste manier om §1 groen te krijgen: de straf nooit meer laten
 *    vervallen. Dat zou een strenger product zijn dan besloten is, en niets zou
 *    er rood van worden.
 *
 * ⚠️ **§4 hoort hier omdat §2 van de migratie hem nodig maakt.** Met de filter
 *    op `completed` weg, wordt élke `set`-straf op een afgerond doel alsnog
 *    verschuldigd. 📏 Gemeten vóór de reparatie: een straf hángen aan een doel
 *    dat al `completed` is, lukte gewoon. Die deur zit nu dicht, en als iemand
 *    hem weer openzet is het niet zichtbaar in §1 of §2 — vandaar een eigen §.
 *
 * **Met de hand rood gemaakt, grendel voor grendel (regel 18, vraag 3):**
 *
 *      1. de penalty-update terug buiten de if/else van `wikkel_commitments_af`
 *         → §1 rood ("de straf staat verschuldigd na de job"), §2 groen
 *      2. `and g.status <> 'completed'` terug in `maak_straffen_verschuldigd`
 *         → §1 rood, §2 groen — en dit is de mutatie die de kéten breekt
 *           terwijl beide onderdelen los kloppen
 *      3. `and g.status = 'active'` uit `commitments_insert`
 *         → §4 rood, §1 en §2 groen
 *
 *    Drie mutaties voor drie grendels, en niet één mutatie voor de hele
 *    controle: mutatie 1 en 2 raken allebei §1, en alleen door ze los te draaien
 *    is te zien dat §1 ze allebei bewaakt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
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
  alice: TestUser;
  bob: TestUser;
  groupId: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): {
  ok?: boolean;
  reason?: string;
  commitments?: { vervallen?: number; blijft_staan?: number; vrijgespeeld?: number };
} {
  return (data ?? {}) as ReturnType<typeof uit>;
}

/**
 * Een doel met een straf erop, klaar om afgerond te worden.
 *
 * ⚠️⚠️ **Het doel wordt in de toekomst gemaakt en daarna teruggezet, en dat is
 *    geen omweg maar de enige route.** `commitments_insert` eist
 *    `g.target_date >= mijn_datum()`: je kunt geen straf hangen aan een doel
 *    waarvan de deadline al verstreken is. 📏 Gemeten toen deze suite het wél
 *    zo probeerde: *new row violates row-level security policy*. In het echt
 *    zet de gebruiker zijn straf terwijl het doel nog loopt en verstrijkt de
 *    datum daarna — dat is precies wat hier nagebouwd wordt.
 *
 *    De adminclient zet `target_date` daarna terug en niet `zet_streefdatum()`:
 *    die weigert een verschuiving met een open straf (0184). Dat is een grendel
 *    van een ánder issue en hij hoort hier niet omzeild te worden door hem te
 *    verzwakken, maar door er met de steiger omheen te gaan.
 *
 * ⚠️ `created_at` gaat twee dagen terug. Het wachtvenster van 24 uur (0171) is
 *    een grendel van `maak_straffen_verschuldigd()` die hier niet getoetst wordt
 *    maar wel in de weg zit; hem terugdateren houdt deze suite op zijn eigen
 *    onderwerp. De kolom is voor de client niet schrijfbaar, dus dit kán alleen
 *    met de adminclient — dat is QS8-295.
 */
async function doelMetStraf(titel: string, streefdatum: IsoDate): Promise<string> {
  const doel = await adminDb()
    .from('goals')
    .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 30) })
    .select('id')
    .single();
  if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
  const doelId = doel.data.id as string;

  const straf = await w.alice.db
    .from('commitments')
    .insert({
      goal_id: doelId,
      type: 'penalty',
      body: `${titel} — ik trakteer de groep`,
      beneficiary_user_id: w.bob.id,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (straf.error) throw new Error(`straf ${titel}: ${straf.error.message}`);

  const terug = await adminDb()
    .from('commitments')
    .update({ created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() })
    .eq('id', straf.data.id as string);
  if (terug.error) throw new Error(`terugdateren ${titel}: ${terug.error.message}`);

  const verzetten = await adminDb()
    .from('goals')
    .update({ target_date: streefdatum })
    .eq('id', doelId);
  if (verzetten.error) throw new Error(`streefdatum ${titel}: ${verzetten.error.message}`);

  return doelId;
}

async function strafstand(doelId: string): Promise<string | null> {
  const r = await adminDb()
    .from('commitments')
    .select('status')
    .eq('goal_id', doelId)
    .eq('type', 'penalty')
    .maybeSingle();
  if (r.error) throw new Error(`strafstand: ${r.error.message}`);
  return (r.data?.status as string | undefined) ?? null;
}

/** De job die straffen verschuldigd maakt, zoals de rollover hem draait. */
async function draaiDeJob(): Promise<number> {
  const r = await adminDb().rpc('maak_straffen_verschuldigd', {
    p_owner_id: w.alice.id,
    p_vandaag: w.vandaag,
  });
  if (r.error) throw new Error(`job: ${r.error.message}`);
  return (r.data ?? 0) as number;
}

describe.skipIf(!rlsTestsConfigured)('te laat afronden laat de straf staan', () => {
  beforeAll(async () => {
    const alice = await createTestUser('telaat-alice');
    const bob = await createTestUser('telaat-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const gemaakt = await alice.db.rpc('create_group', { group_name: 'Telaatgroep' });
    const d = gemaakt.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (d.ok !== true || !d.group) throw new Error(`groep: ${JSON.stringify(gemaakt.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: d.group.invite_code });
    if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
      throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
    }

    const zone = await adminDb().from('profiles').update({ tz: 'UTC' }).in('id', [alice.id, bob.id]);
    if (zone.error) throw new Error(`tijdzone vastzetten: ${zone.error.message}`);

    w = { alice, bob, groupId: d.group.id, vandaag };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('1. te laat afronden — het hele pad', () => {
    it(
      'de straf staat verschuldigd na de job, en niet op vervallen',
      async () => {
        // Twee dagen over de streefdatum, dus ook voorbij de respijtdag.
        const doelId = await doelMetStraf('Te laat', addDays(w.vandaag, -2));

        const af = await w.alice.db.rpc('rond_doel_af', { p_goal_id: doelId });
        expect(uit(af.data).ok, JSON.stringify(af.data)).toBe(true);

        expect(
          await strafstand(doelId),
          'de straf hoort na een late afronding nog op `set` te staan; staat hier ' +
            '`cancelled`, dan annuleert `wikkel_commitments_af()` hem weer buiten de tak',
        ).toBe('set');

        const geraakt = await draaiDeJob();
        expect(
          geraakt,
          'de job hoort de straf op te pakken; is dit 0, dan houdt een filter een ' +
            'afgerond doel nog tegen en is de keten alsnog onderbroken',
        ).toBeGreaterThanOrEqual(1);

        expect(await strafstand(doelId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'het antwoord van het afronden vertelt dat de straf blijft staan',
      async () => {
        const doelId = await doelMetStraf('Te laat en gemeld', addDays(w.vandaag, -2));

        const af = await w.alice.db.rpc('rond_doel_af', { p_goal_id: doelId });
        const c = uit(af.data).commitments ?? {};

        // Domeinregel 5: een commitment device treedt nooit stilzwijgend in
        // werking. Zonder deze teller heeft het scherm niets om dat mee te zeggen.
        expect(c.blijft_staan, JSON.stringify(af.data)).toBe(1);
        expect(c.vervallen).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('2. op tijd afronden laat de straf wél vervallen (must-allow)', () => {
    it(
      'binnen de streefdatum vervalt de straf en de job laat hem met rust',
      async () => {
        const doelId = await doelMetStraf('Op tijd', addDays(w.vandaag, 30));

        const af = await w.alice.db.rpc('rond_doel_af', { p_goal_id: doelId });
        expect(uit(af.data).ok, JSON.stringify(af.data)).toBe(true);
        expect(uit(af.data).commitments?.vervallen).toBe(1);

        expect(await strafstand(doelId)).toBe('cancelled');

        await draaiDeJob();
        expect(
          await strafstand(doelId),
          'een vervallen straf hoort niet alsnog verschuldigd te worden',
        ).toBe('cancelled');
      },
      TEST_TIMEOUT,
    );

    it(
      'de respijtdag telt nog mee — afronden op de dag ná de streefdatum is op tijd',
      async () => {
        const doelId = await doelMetStraf('Respijt', addDays(w.vandaag, -1));

        const af = await w.alice.db.rpc('rond_doel_af', { p_goal_id: doelId });
        expect(uit(af.data).ok, JSON.stringify(af.data)).toBe(true);

        expect(
          await strafstand(doelId),
          'de respijtdag van 0173 (`target_date + 1`) verandert niet met QS8-322',
        ).toBe('cancelled');
      },
      TEST_TIMEOUT,
    );
  });

  describe('4. een afgerond doel gaat niet meer open', () => {
    it(
      'heropenen en opnieuw afronden krijgt de straf niet alsnog weg',
      async () => {
        const doelId = await doelMetStraf('Heropenen', addDays(w.vandaag, -5));

        const af = await w.alice.db.rpc('rond_doel_af', { p_goal_id: doelId });
        expect(uit(af.data).ok, JSON.stringify(af.data)).toBe(true);
        expect(await strafstand(doelId)).toBe('set');

        // De achterdeur: `zet_doelstatus()` zette vóór 0238 §4 onvoorwaardelijk
        // `active`, ook vanaf `completed`.
        const open = await w.alice.db.rpc('zet_doelstatus', {
          p_goal_id: doelId,
          p_gearchiveerd: false,
        });
        expect(
          (open.data as { reason?: string } | null)?.reason,
          'een afgerond doel hoort niet meer open te gaan; lukt dit wél, dan is de ' +
            'tweede afronding "op tijd" zodra de streefdatum vooruit staat en vervalt ' +
            'de straf alsnog via de op-tijd-tak',
        ).toBe('already_completed');

        // En de streefdatum vooruit zetten helpt dan ook niet meer.
        const verzet = await adminDb()
          .from('goals')
          .update({ target_date: addDays(w.vandaag, 30) })
          .eq('id', doelId);
        if (verzet.error) throw new Error(`streefdatum: ${verzet.error.message}`);

        const nogmaals = await w.alice.db.rpc('rond_doel_af', { p_goal_id: doelId });
        expect((nogmaals.data as { reason?: string } | null)?.reason).toBe('already_completed');

        expect(
          await strafstand(doelId),
          'de straf hoort de hele keten door op `set` te blijven',
        ).toBe('set');
      },
      TEST_TIMEOUT,
    );

    it(
      'archiveren en terughalen blijft gewoon werken op een lopend doel (must-allow)',
      async () => {
        const doelId = await doelMetStraf('Archiveerbaar', addDays(w.vandaag, 30));

        const heen = await w.alice.db.rpc('zet_doelstatus', {
          p_goal_id: doelId,
          p_gearchiveerd: true,
        });
        expect((heen.data as { ok?: boolean } | null)?.ok, JSON.stringify(heen.data)).toBe(true);

        const terug = await w.alice.db.rpc('zet_doelstatus', {
          p_goal_id: doelId,
          p_gearchiveerd: false,
        });
        expect(
          (terug.data as { ok?: boolean } | null)?.ok,
          'de weigering van §4 hoort alleen een afgerond doel te raken, niet het ' +
            'archief waar deze functie voor bestaat (QS8-32)',
        ).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });

  describe('3. een straf hoort bij een doel dat nog loopt', () => {
    it(
      'een straf hangen aan een afgerond doel wordt geweigerd',
      async () => {
        const doel = await adminDb()
          .from('goals')
          .insert({
            owner_id: w.alice.id,
            title: 'Al af',
            target_date: addDays(w.vandaag, 20),
            status: 'completed',
          })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);

        const straf = await w.alice.db.from('commitments').insert({
          goal_id: doel.data.id as string,
          type: 'penalty',
          body: 'Straf op iets dat al af is',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });

        expect(
          straf.error,
          'dit lukte vóór 0238 gewoon; met de completed-filter uit ' +
            '`maak_straffen_verschuldigd()` weg zou zo`n straf verschuldigd worden ' +
            'op een doel dat al af is',
        ).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'een beloning op een lopend doel kan gewoon (must-allow)',
      async () => {
        const doelId = await doelMetStraf('Loopt nog', addDays(w.vandaag, 30));

        const beloning = await w.alice.db.from('commitments').insert({
          goal_id: doelId,
          type: 'reward',
          body: 'Een avond vrij',
          confirmed_at: new Date().toISOString(),
        });

        expect(beloning.error, JSON.stringify(beloning.error)).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
