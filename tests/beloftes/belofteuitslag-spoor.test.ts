import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * De uitslag van een belofte leest het spoor, en dat spoor schrijft SQL — QS8-815.
 *
 * ⚠️ **De naad.** `belofteuitslag()` in `src/modules/commitments/weekbelofte.ts`
 *    onderscheidt gehouden van ingetrokken aan drie dingen die alleen de
 *    migraties beloven: de spoorregel van een intrekking heet `cancelled`, ze
 *    draagt `doelstatus` in de payload, en `rond_doel_af()` zet het doel op
 *    `completed` vóórdat hij de beloftes afwikkelt. Verschuift een van die drie
 *    in een latere migratie, dan leest een gehouden belofte stil als
 *    ingetrokken. Deze test leest de **laatste** definitie van elke functie.
 *
 * ⚠️ Wat dit níet toetst: dat de rollover zonder JWT draait en de actor dus
 *    `null` is. Dat is een eigenschap van hoe hij aangeroepen wordt, en staat
 *    in `tests/rls/weekbelofte-beslissing.test.ts` aan de databasekant.
 */

const MAP = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const bestanden = readdirSync(MAP)
  .filter((naam) => naam.endsWith('.sql'))
  .sort();

/** Het lichaam van de laatste `create or replace function public.<naam>(` in de migraties. */
function laatsteDefinitie(naam: string): string {
  const kop = new RegExp(`create or replace function public\\.${naam}\\(`, 'i');
  for (const bestand of [...bestanden].reverse()) {
    const tekst = readFileSync(join(MAP, bestand), 'utf8');
    const treffers = [...tekst.matchAll(new RegExp(kop.source, 'gi'))];
    const laatste = treffers.at(-1);
    if (laatste?.index === undefined) continue;
    const rest = tekst.slice(laatste.index);
    const einde = rest.search(/\$(function)?\$;/);
    return einde === -1 ? rest : rest.slice(0, einde);
  }
  throw new Error(`geen definitie van ${naam} in de migraties`);
}

describe('het spoor waar de uitslag van een belofte op leunt', () => {
  it('noteer_commitment() noemt de overgang naar cancelled `cancelled`', () => {
    expect(laatsteDefinitie('noteer_commitment')).toMatch(/when new\.status = 'cancelled' then 'cancelled'/);
  });

  it("noteer_commitment() zet de doelstatus in de payload, onder de sleutel 'doelstatus'", () => {
    const lichaam = laatsteDefinitie('noteer_commitment');
    expect(lichaam).toMatch(/'doelstatus',\s*v_doelstatus/);
    expect(lichaam).toMatch(/select g\.status into v_doelstatus from goals g/);
  });

  it('noteer_commitment() neemt de actor uit auth.uid(), dus zonder JWT is hij null', () => {
    expect(laatsteDefinitie('noteer_commitment')).toMatch(/then auth\.uid\(\)/);
  });

  it('rond_doel_af() zet het doel op completed vóórdat hij de commitments afwikkelt', () => {
    const lichaam = laatsteDefinitie('rond_doel_af');
    const afgerond = lichaam.search(/update goals set status = 'completed'/);
    const afwikkelen = lichaam.search(/wikkel_commitments_af\(/);
    expect(afgerond).toBeGreaterThan(-1);
    expect(afwikkelen).toBeGreaterThan(afgerond);
  });

  it('beslis_weekbeloftes() zet een gehouden belofte op cancelled en nooit op resolved', () => {
    expect(laatsteDefinitie('beslis_weekbeloftes')).toMatch(
      /set status = case when r\.gebroken then 'due' else 'cancelled' end/,
    );
  });
});
