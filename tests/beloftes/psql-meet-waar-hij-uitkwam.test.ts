import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * QS8-715 — de naad: `psql()` en `stackBeschikbaarOfFaal()` vragen de
 * bestemming écht, vóór hun eigen vraag, en een verkeerde bestemming heet dan
 * niet "geen database".
 *
 * ⚠️ **Met een nagemaakte `psql` en niet tegen een database**, en dat is eerlijk
 *    opgeschreven: in de cloudsessie die dit bouwde mocht er geen eigen
 *    Postgres-cluster draaien. De nep antwoordt op de bestemmingsvraag met wat
 *    een tunnel zou antwoorden (een adres buiten loopback) en op elke andere
 *    vraag met `1`. Wat dit toetst is de keten in `tests/rls/psql-stack.ts`;
 *    dat Postgres `inet_server_addr()` zo invult, is de documentatie van
 *    Postgres en hier niet gemeten.
 */

const antwoord = vi.hoisted(() => ({
  bestemming: '127.0.0.1|goalbuddies_rls|',
  verbinding: true,
  meetfout: false,
  vragen: [] as string[],
}));

vi.mock('node:child_process', async (echt) => {
  const mod = await echt<typeof import('node:child_process')>();
  return {
    ...mod,
    execFileSync: (_bin: string, args: readonly string[]) => {
      const sql = args.at(-1) ?? '';
      if (!antwoord.verbinding) throw Object.assign(new Error('psql: could not connect to server'), { status: 2 });
      if (sql.includes('inet_server_addr')) {
        // Een tunnel die de meetverbinding één keer weigert met iets anders dan
        // "geen verbinding" — het geval van de security-review.
        if (antwoord.meetfout) throw Object.assign(new Error('too many clients'), { status: 1 });
        return `${antwoord.bestemming}\n`;
      }
      antwoord.vragen.push(sql);
      return '1\n';
    },
  };
});

const { psql, stackBeschikbaarOfFaal, vergeetBestemming } = await import('../rls/psql-stack');

const BRON = import.meta.url;

beforeEach(() => {
  vi.stubEnv('RLS_DOEL', 'lokaal');
  vergeetBestemming();
});

afterEach(() => {
  vi.unstubAllEnvs();
  antwoord.bestemming = '127.0.0.1|goalbuddies_rls|';
  antwoord.verbinding = true;
  antwoord.meetfout = false;
  antwoord.vragen = [];
});

describe('QS8-715 — psql meet waar hij uitkwam', () => {
  it('lokaal en de goede database: psql() antwoordt gewoon', () => {
    expect(psql('select 1')).toBe('1');
  });

  it('een tunnel (adres buiten loopback): psql() weigert vóór de eigen vraag', () => {
    antwoord.bestemming = '52.47.1.2|goalbuddies_rls|';
    expect(() => psql('select 1')).toThrow(/kwam uit op "52\.47\.1\.2"/);
  });

  it('een privé-adres op een dockerbrug waar wij geen interface hebben (een tunnel): psql() weigert', () => {
    antwoord.bestemming = '172.18.0.2|goalbuddies_rls|172.18.0.77';
    expect(() => psql('select 1')).toThrow(/kwam uit op "172\.18\.0\.2"/);
  });

  it('een andere database op loopback: psql() weigert', () => {
    antwoord.bestemming = '127.0.0.1|postgres|';
    expect(() => psql('select 1')).toThrow(/in database "postgres"/);
  });

  it('stackBeschikbaarOfFaal: een tunnel heet "weigert te meten" en niet "geen database"', () => {
    antwoord.bestemming = '52.47.1.2|goalbuddies_rls|';
    let melding = '';
    try {
      stackBeschikbaarOfFaal('select 1', BRON);
    } catch (fout) {
      melding = fout instanceof Error ? fout.message : String(fout);
    }
    expect(melding).toMatch(/weigert te meten/);
    expect(melding).not.toMatch(/geen database/);
  });

  it('geen verbinding: de bestaande melding "geen database" blijft de juiste', () => {
    antwoord.verbinding = false;
    expect(() => stackBeschikbaarOfFaal('select 1', BRON)).toThrow(/geen database op/);
  });

  it('geen verbinding bij een gewone aanroep: werpt, en er wordt niets uitgevoerd', () => {
    antwoord.verbinding = false;
    expect(() => psql('insert into x values (1)')).toThrow(/bestemming is niet gemeten/);
    expect(antwoord.vragen).toEqual([]);
  });

  it('een meting die mislukt met iets anders dan "geen verbinding": de echte vraag draait niet (security-review)', () => {
    antwoord.meetfout = true;
    expect(() => psql('insert into x values (1)')).toThrow(/niet vast te stellen/);
    expect(antwoord.vragen).toEqual([]);
  });
});
