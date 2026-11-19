import { describe, expect, it } from 'vitest';

import { doelperiodeBand, type Periodeband } from '../../src/shared/time';
import { psqlMetInvoer, stackBeschikbaarOfFaal } from '../rls/psql-stack';

/**
 * De belofte: **de periodeband is aan beide kanten dezelfde.**
 *
 * `public.doelperiode(date, date)` (migratie 0299) deelt wachtrijrijen in bakken;
 * `doelperiodeBand()` uit `src/shared/time` zegt tegen de gebruiker in welke bak
 * hij zit. Twee implementaties, één belofte.
 *
 * ⚠️⚠️ **Dit is onwrikbare regel 18 in zijn zuiverste vorm.** Elk van de twee is
 *    los prima te testen en dan blijven ze allebei groen terwijl de belofte
 *    breekt: het scherm zegt dat je met mensen van "binnen een half jaar"
 *    gezocht wordt terwijl de matcher je in de jaarbak stopt. De naad zit
 *    tússen de twee, en daar staat deze toets.
 *
 * ⚠️ **Waarom een raster en geen handvol gevallen.** De fout die dit soort
 *    spiegels maakt, zit op de grens: 90 tegen 91, een schrikkeldag, een
 *    zomertijdsprong. Die vind je niet met drie voorbeelden. Het raster loopt
 *    over vier jaar en over elke bandgrens heen.
 *
 * ⚠️ Dezelfde vorm als de naadtest op `CATEGORIEEN` ↔ `goals_category_valid`:
 *    de SQL-kant wordt in één aanroep om álle antwoorden gevraagd, niet per
 *    geval — dat scheelt duizenden psql-starts.
 */

const PEILDATUM = '2026-03-01';

/** Elke grensdag, plus ruim eromheen, plus een schrikkeljaar en twee zomertijdsprongen. */
function rasterdagen(): readonly number[] {
  const dagen = new Set<number>();
  for (const grens of [0, 90, 180, 365]) {
    for (const delta of [-2, -1, 0, 1, 2]) dagen.add(grens + delta);
  }
  for (let d = -5; d <= 1500; d += 37) dagen.add(d);
  return [...dagen].sort((a, b) => a - b);
}

function datumNaDagen(vanaf: string, dagen: number): string {
  const basis = new Date(`${vanaf}T00:00:00Z`);
  basis.setUTCDate(basis.getUTCDate() + dagen);
  return basis.toISOString().slice(0, 10);
}

describe('de periodeband is aan twee kanten dezelfde', () => {
  const dagen = rasterdagen();
  const datums = dagen.map((d) => datumNaDagen(PEILDATUM, d));

  it('SQL en TypeScript geven over het hele raster hetzelfde antwoord', () => {
    if (!stackBeschikbaarOfFaal('select 1', import.meta.url)) return;

    const waarden = datums.map((d) => `('${d}'::date)`).join(',');
    const ruw = psqlMetInvoer(
      `select coalesce(public.doelperiode(t.d, '${PEILDATUM}'::date)::text, 'null')
         from (values ${waarden}) as t(d);`,
    );
    const uitSql = ruw
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r !== '');

    expect(uitSql).toHaveLength(datums.length);

    const verschillen: string[] = [];
    datums.forEach((datum, i) => {
      const ts = doelperiodeBand(new Date(`${datum}T00:00:00Z`), new Date(`${PEILDATUM}T00:00:00Z`));
      const tsTekst = ts === null ? 'null' : String(ts);
      if (tsTekst !== uitSql[i]) {
        verschillen.push(`${datum} (+${dagen[i]}d): SQL=${uitSql[i]} TS=${tsTekst}`);
      }
    });

    expect(verschillen).toEqual([]);
  });

  it('de banden liggen op 90, 180 en 365 dagen, en een verstreken datum geeft null', () => {
    const peil = new Date(`${PEILDATUM}T00:00:00Z`);
    const band = (d: number): Periodeband | null =>
      doelperiodeBand(new Date(`${datumNaDagen(PEILDATUM, d)}T00:00:00Z`), peil);

    expect(band(-1)).toBeNull();
    expect(band(0)).toBe(0);
    expect(band(90)).toBe(0);
    expect(band(91)).toBe(1);
    expect(band(180)).toBe(1);
    expect(band(181)).toBe(2);
    expect(band(365)).toBe(2);
    expect(band(366)).toBe(3);
  });

  it('een ontbrekende of ongeldige datum geeft null en geen uitzondering', () => {
    const peil = new Date(`${PEILDATUM}T00:00:00Z`);
    expect(doelperiodeBand(null, peil)).toBeNull();
    expect(doelperiodeBand(peil, null)).toBeNull();
    expect(doelperiodeBand(new Date('onzin'), peil)).toBeNull();
    expect(doelperiodeBand(peil, new Date('onzin'))).toBeNull();
  });
});
