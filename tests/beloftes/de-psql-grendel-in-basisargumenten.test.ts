import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * QS8-720 — **met een `PGHOST` buiten loopback start de RLS-suite geen
 * psql-proces**, langs welke van de vier ingangen van `tests/rls/psql-stack.ts`
 * dan ook.
 *
 * ⚠️ **Waarom deze toets er moest komen.** QS8-703 zette `eisLokaleDatabase()`
 *    op twee plekken: in `stackBeschikbaarOfFaal()` en in `basisArgumenten()`.
 *    De eerste is via `dotenv-opent-het-slot-niet.test.ts` geijkt; de tweede
 *    niet. 📏 Gemeten: met `eisLokaleDatabase();` weggehaald uit
 *    `basisArgumenten()` bleef de unit-groep groen op 195 bestanden en 3.688
 *    tests. Een grendel die niets rood maakt als je hem weghaalt, is een
 *    aanname (CLAUDE.md, regel 18, vraag 3).
 *
 * ⚠️ **De belofte is "er start geen proces", niet "er wordt een fout
 *    geworpen".** `node:child_process` is hier een vanger die elke aanroep
 *    vastlegt en zelf werpt; hij laat nooit iets starten, ook niet als de
 *    grendel kapot is. Het ijkpunt onderaan bewijst dat de vanger een aanroep
 *    wél ziet — anders was "geen aanroep" hierboven altijd groen.
 *
 * ⚠️ De host eindigt op `.invalid`; ook zonder vanger kan hij nergens heen.
 */

const gestart = vi.hoisted(() => ({ aanroepen: [] as string[] }));

vi.mock('node:child_process', async (echt) => {
  const mod = await echt<typeof import('node:child_process')>();
  const vang = (bin: string) => {
    gestart.aanroepen.push(bin);
    throw new Error('rls-grendeltoets: er mocht geen proces starten');
  };
  return { ...mod, execFileSync: vang, execFile: vang };
});

/** Vers laden: `PSQL_OMGEVING` en de basisargumenten worden bij het laden berekend. */
async function laad() {
  vi.resetModules();
  return import('../rls/psql-stack');
}

beforeEach(() => {
  gestart.aanroepen = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('QS8-720 — met PGHOST buiten loopback start geen psql-proces', () => {
  beforeEach(() => {
    vi.stubEnv('PGHOST', 'db.wehgocadxehottiiyvsc.supabase.invalid');
  });

  it('psqlBasisArgumenten() weigert', async () => {
    const { psqlBasisArgumenten } = await laad();
    expect(() => psqlBasisArgumenten()).toThrow(/weigert psql/);
    expect(gestart.aanroepen).toEqual([]);
  });

  it('psql() weigert vóór er een proces start', async () => {
    const { psql } = await laad();
    expect(() => psql('select 1')).toThrow(/weigert psql/);
    expect(gestart.aanroepen).toEqual([]);
  });

  it('psqlMetInvoer() weigert vóór er een proces start', async () => {
    const { psqlMetInvoer } = await laad();
    expect(() => psqlMetInvoer('select 1')).toThrow(/weigert psql/);
    expect(gestart.aanroepen).toEqual([]);
  });

  it('psqlParallel() weigert vóór er een proces start', async () => {
    const { psqlParallel } = await laad();
    await expect(psqlParallel(['select 1'])).rejects.toThrow(/weigert psql/);
    expect(gestart.aanroepen).toEqual([]);
  });
});

describe('ijkpunt: met een lokale host gaat de aanroep wél naar psql', () => {
  it('psql() start precies één proces', async () => {
    vi.stubEnv('PGHOST', '127.0.0.1');
    const { psql } = await laad();
    expect(() => psql('select 1')).toThrow(/er mocht geen proces starten/);
    expect(gestart.aanroepen).toEqual(['psql']);
  });
});
