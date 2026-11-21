/**
 * De Ketting telt leden in een pauze mee — migratie 0329, QS8-769.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel, niet van de functie.** Niet
 *    "`in_aanmerking` bevat geen `breathers`-clausule" maar: *een groepslid kan uit
 *    wat het mag lezen niet afleiden dat een ander pauzeert.* Wat een lid leest is
 *    `ketting_stand()` en de `chain_links` van zijn groep. Daarom vergelijkt elk
 *    geval hieronder wat het medelid ziet **met** en **zonder** de pauze, op
 *    precies dezelfde schakels: de twee uitkomsten moeten gelijk zijn.
 *
 * ⚠️ **Twee huddledagen** (domeinregel 1): de periode die de functie krijgt is
 *    `group_period_start`, en die verschilt per groep. Een test met één groep kan
 *    groen zijn doordat de pauze net buiten die ene periode valt.
 *
 * ⚠️ **De pauze ligt op vandaag volgens de klok van de pauzerende zelf**, met een
 *    marge van een dag aan beide kanten, zodat de tijdzone van de suite er niet
 *    toe doet. Zonder dat dekt de pauze de test niet altijd, en dan bewijst hij
 *    niets: de niet-leegheid is zelf een assertie (zie de oude functie hieronder).
 *
 * Breek de grendel met de hand: zet in `ketting_stand()` het `not exists (…
 * breathers …)` terug (0204) en `in_aanmerking` zakt van 2 naar 1 — beide
 * gevallen worden rood.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Stand {
  schakels: number;
  in_aanmerking: number;
  voltallig: boolean;
}

interface Duo {
  groupId: string;
  huddleDay: number;
  periode: IsoDate;
  goalId: string;
}

let ik: TestUser;
let pauzerend: TestUser;
const duo: Duo[] = [];

async function bouwDuo(huddleDay: number): Promise<Duo> {
  const g = await ik.db.rpc('create_group', { group_name: `Pauze-ketting-${huddleDay}` });
  const d = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (d.ok !== true || !d.group) throw new Error(`groep aanmaken: ${JSON.stringify(g.data)}`);
  registreerGroep(d.group.id);
  const mee = await pauzerend.db.rpc('join_group_with_code', { code: d.group.invite_code });
  if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
    throw new Error(`medelid werd geen lid: ${JSON.stringify(mee.data)}`);
  }
  const zet = await adminDb().from('groups').update({ huddle_day: huddleDay }).eq('id', d.group.id);
  if (zet.error) throw new Error(`huddle_day zetten: ${zet.error.message}`);

  const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;
  const doel = await pauzerend.db
    .from('goals')
    .insert({ owner_id: pauzerend.id, title: `PAUZE-KETTING-${huddleDay}`, target_date: addDays(vandaag, 90) })
    .select('id')
    .single();
  if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
  const kop = await pauzerend.db.from('goal_group_links').insert({ goal_id: doel.data.id, group_id: d.group.id });
  if (kop.error) throw new Error(`koppeling: ${kop.error.message}`);

  // Een periodestart die per huddledag anders is: de laatste huddledag tot en met vandaag.
  const dagVanWeek = new Date(`${vandaag}T00:00:00Z`).getUTCDay();
  const terug = (dagVanWeek - huddleDay + 7) % 7;
  return { groupId: d.group.id, huddleDay, periode: addDays(vandaag, -terug), goalId: doel.data.id };
}

async function stand(d: Duo): Promise<Stand> {
  const r = await ik.db.rpc('ketting_stand', { p_group_id: d.groupId, p_period_start: d.periode });
  if (r.error) throw new Error(`ketting_stand: ${r.error.message}`);
  return r.data as unknown as Stand;
}

async function schakelsZichtbaar(d: Duo): Promise<string[]> {
  const r = await ik.db
    .from('chain_links')
    .select('user_id, group_period_start')
    .eq('group_id', d.groupId)
    .order('user_id');
  if (r.error) throw new Error(`chain_links lezen: ${r.error.message}`);
  return (r.data ?? []).map((x) => `${x.user_id}@${x.group_period_start}`);
}

describe.skipIf(!rlsTestsConfigured)('een pauze is niet af te leiden uit De Ketting (0329)', () => {
  beforeAll(async () => {
    ik = await createTestUser('ketting-pauze-ik');
    pauzerend = await createTestUser('ketting-pauze-ander');
    duo.push(await bouwDuo(0), await bouwDuo(3));
    // Alleen ik heb een schakel; de ander niet, met of zonder pauze.
    for (const d of duo) {
      const s = await adminDb()
        .from('chain_links')
        .insert({ group_id: d.groupId, user_id: ik.id, group_period_start: d.periode });
      if (s.error) throw new Error(`schakel: ${s.error.message}`);
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it.each([0, 3])(
    'huddledag %i: ketting_stand en chain_links zijn gelijk met en zonder pauze van het medelid',
    async (huddleDay) => {
      const d = duo.find((x) => x.huddleDay === huddleDay);
      if (d === undefined) throw new Error('duo ontbreekt');

      const zonder = { stand: await stand(d), links: await schakelsZichtbaar(d) };

      const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;
      const pauze = await adminDb()
        .from('breathers')
        .insert({
          user_id: pauzerend.id,
          goal_id: d.goalId,
          starts_cycle: addDays(vandaag, -1),
          ends_cycle: addDays(vandaag, 6),
        })
        .select('id')
        .single();
      expect(pauze.error, 'de pauze is niet gezet, dus de test bewijst niets').toBeNull();

      const met = { stand: await stand(d), links: await schakelsZichtbaar(d) };

      // De belofte: het medelid ziet hetzelfde.
      expect(met.stand).toEqual(zonder.stand);
      expect(met.links).toEqual(zonder.links);
      // En het getal telt het medelid mee (anders zakt het bij een pauze).
      expect(met.stand.in_aanmerking).toBe(2);
      expect(met.stand.voltallig).toBe(false);

      await adminDb().from('breathers').delete().eq('id', pauze.data?.id ?? '');
    },
    TEST_TIMEOUT,
  );

  it(
    'een lid in een pauze krijgt via de echte schrijver gewoon een schakel, en dan is de week voltallig',
    async () => {
      // ⚠️ De schrijver van `chain_links` is de trigger op `week_reviews`. Een pauzecheck daar
      //    zou een pauzerend lid structureel schakelloos maken, en dat is zelf het signaal.
      const d = duo[0];
      if (d === undefined) throw new Error('duo ontbreekt');
      const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;
      const pauze = await adminDb()
        .from('breathers')
        .insert({
          user_id: pauzerend.id,
          goal_id: d.goalId,
          starts_cycle: addDays(vandaag, -1),
          ends_cycle: addDays(vandaag, 6),
        })
        .select('id')
        .single();
      expect(pauze.error, 'de pauze is niet gezet, dus de test bewijst niets').toBeNull();

      const schrijf = await pauzerend.db.from('week_reviews').insert({
        group_id: d.groupId,
        user_id: pauzerend.id,
        group_period_start: d.periode,
        did_text: 'afgesloten tijdens een pauze',
      });
      expect(schrijf.error?.message ?? null).toBeNull();

      const na = await stand(d);
      await adminDb().from('breathers').delete().eq('id', pauze.data?.id ?? '');

      expect(na).toEqual({ schakels: 2, in_aanmerking: 2, voltallig: true });
    },
    TEST_TIMEOUT,
  );
});
