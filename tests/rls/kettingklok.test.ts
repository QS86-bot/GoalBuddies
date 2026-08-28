/**
 * Het kettingvenster telt op de klok van de groep — migratie 0120.
 *
 * ⚠️ **Waarom deze test niet met één zone kan.** De policy vergelijkt met
 *    `now()`, en of een tijdzone op dit moment van de UTC-datum afwijkt, hangt
 *    van het úúr af. Een zone die toevallig gelijkloopt maakt de test **leeg**:
 *    de oude en de nieuwe uitdrukking zijn dan letterlijk hetzelfde en groen
 *    bewijst niets. Dat is precies de vorm van de fout die 0116 twee keer als
 *    opgelost liet afvinken.
 *
 * 📏 **Daarom twee uitersten, en dat is gemeten en niet bedacht.** Over de 24
 *    uur van een dag staat `Etc/GMT-14` er 14 uur vóór en `Etc/GMT+12` er 12 uur
 *    áchter — en er is **geen enkel uur** waarop geen van beide afwijkt. Eén van
 *    de twee is dus altijd onderscheidend, welk uur de suite ook draait.
 *
 * ⚠️ **De niet-leegheid is zelf een assertie.** Wijkt op enig moment geen van
 *    beide af, dan bewijst deze test niets meer en hoort hij rood te worden in
 *    plaats van stil groen te blijven.
 *
 * ⚠️ **Beide dagen, of het bewijst niets.** Alleen toetsen dat `groepsdag - 7`
 *    onzichtbaar is, is groen bij een venster van 6, 60 of 600 dagen. De
 *    tegenhanger op `groepsdag - 6` is de helft die de grens vastlegt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/** UTC+14 en UTC-12: de uitersten, en samen dekken ze elk uur van de dag. */
const VOORUIT = 'Etc/GMT-14';
const ACHTERUIT = 'Etc/GMT+12';

interface Groep {
  id: string;
  zone: string;
  /** Vandaag volgens de klok van de groep. */
  groepsdag: string;
  /** Vandaag volgens UTC — als dit gelijk is, is de zone niet onderscheidend. */
  utc: string;
}

let eigenaar: TestUser;
let medelid: TestUser;

async function bouwGroep(zone: string): Promise<Groep> {
  const g = await eigenaar.db.rpc('create_group', { group_name: `Klok-${zone}` });
  const data = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (data.ok !== true || !data.group) {
    throw new Error(`groep aanmaken mislukte: ${JSON.stringify(g.data)}`);
  }

  const mee = await medelid.db.rpc('join_group_with_code', { code: data.group.invite_code });
  const uitkomst = (mee.data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) throw new Error(`medelid werd geen lid: ${uitkomst.reason ?? '?'}`);

  const zetten = await adminDb().from('groups').update({ tz: zone }).eq('id', data.group.id);
  if (zetten.error) throw new Error(`tz zetten: ${zetten.error.message}`);

  // ⚠️ De groepsdag komt uit de database en niet uit JavaScript: de policy
  //    rekent met `now()` van Postgres, en dat is de klok die hier telt.
  const { data: groepsdag, error } = await adminDb().rpc('groepsdatum', { gid: data.group.id });
  if (error) throw new Error(`groepsdatum: ${error.message}`);

  return {
    id: data.group.id,
    zone,
    groepsdag: groepsdag as unknown as string,
    // `toISOString()` is per definitie UTC — dat is precies de klok waarmee
    // vergeleken moet worden om te weten of deze zone onderscheidend is.
    utc: new Date().toISOString().slice(0, 10),
  };
}

function verschuif(dag: string, dagen: number): string {
  const d = new Date(`${dag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

async function zichtbaar(groep: Groep, dag: string): Promise<number> {
  const { data, error } = await medelid.db
    .from('chain_links')
    .select('user_id')
    .eq('group_id', groep.id)
    .eq('group_period_start', dag);
  if (error) throw new Error(`lezen als medelid: ${error.message}`);
  return (data ?? []).length;
}

describe.runIf(rlsTestsConfigured)('het kettingvenster telt op de klok van de groep (0120)', () => {
  const groepen: Groep[] = [];

  beforeAll(async () => {
    eigenaar = await createTestUser('klok-eigenaar');
    medelid = await createTestUser('klok-medelid');
    groepen.push(await bouwGroep(VOORUIT));
    groepen.push(await bouwGroep(ACHTERUIT));
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'minstens één van de twee zones wijkt nu van UTC af — anders bewijst de rest niets',
    () => {
      const afwijkend = groepen.filter((g) => g.groepsdag !== g.utc);
      expect(
        afwijkend.length,
        `Geen van ${VOORUIT} en ${ACHTERUIT} wijkt nu van UTC af. Dan is deze ` +
          'suite leeg en toetst hij de oude uitdrukking net zo goed als de nieuwe.',
      ).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  it.each([VOORUIT, ACHTERUIT])(
    'in %s is de lopende periode zichtbaar en de afgesloten niet',
    async (zone) => {
      const groep = groepen.find((g) => g.zone === zone);
      if (!groep) throw new Error(`groep voor ${zone} ontbreekt`);

      const lopend = verschuif(groep.groepsdag, -6);
      const afgesloten = verschuif(groep.groepsdag, -7);

      await adminDb()
        .from('chain_links')
        .insert([
          { group_id: groep.id, user_id: eigenaar.id, group_period_start: lopend },
          { group_id: groep.id, user_id: eigenaar.id, group_period_start: afgesloten },
        ]);

      expect(
        await zichtbaar(groep, lopend),
        `${zone}: de lópende periode (${lopend}) was onzichtbaar voor een medelid`,
      ).toBe(1);

      expect(
        await zichtbaar(groep, afgesloten),
        `${zone}: de afgesloten periode (${afgesloten}) was zichtbaar voor een medelid`,
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
