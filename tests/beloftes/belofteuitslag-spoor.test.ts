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
 * ⚠️⚠️ **"Geen actor = gehouden" is een afleiding uit een afwezigheid** (security-review
 *    QS8-815, Middel). Ze klopt zolang de rollover de enige server-side weg is die een
 *    commitment zonder JWT op `cancelled` zet. Daarom het register onderaan: elke functie
 *    waarvan de laatste definitie `commitments` op `cancelled` zet, staat erin met de
 *    actor die ze schrijft. Een nieuwe weg is rood tot iemand hem hier indeelt, en dan
 *    ook `belofteuitslag()` naloopt.
 *
 * IJKING — met de hand, 23-11-2026, elk rood op de bedoelde toets:
 *   N1  `'doelstatus', v_doelstatus` -> `'doel_status', …` in 0220 -> rood: de payloadsleutel
 *   N2  in 0057 `wikkel_commitments_af()` vóór `update goals set status = 'completed'` -> rood: de volgorde
 *   N3  een latere migratie die `noteer_commitment()` zonder doelstatus herdefinieert -> rood: drie toetsen
 *   N4  een nieuwe migratie `ruim_beloftes_op()` die `commitments` op `cancelled` zet -> rood: het register
 *
 * ⚠️ Wat dit níet toetst: dat de rollover zonder JWT draait en de actor dus
 *    `null` is. Dat is een eigenschap van hoe hij aangeroepen wordt, en staat
 *    in `tests/rls/weekbelofte-beslissing.test.ts` aan de databasekant.
 */

const MAP = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const bestanden = readdirSync(MAP)
  .filter((naam) => naam.endsWith('.sql'))
  .sort();

/** De laatste definitie van elke functie in de migraties, per naam. */
function alleLaatsteDefinities(): Map<string, string> {
  const uit = new Map<string, string>();
  for (const bestand of bestanden) {
    const tekst = readFileSync(join(MAP, bestand), 'utf8');
    for (const treffer of tekst.matchAll(/create or replace function (?:public\.)?([a-z_0-9]+)\s*\(/gi)) {
      const rest = tekst.slice(treffer.index);
      const einde = rest.search(/\$(function)?\$;/);
      uit.set(treffer[1]!.toLowerCase(), einde === -1 ? rest : rest.slice(0, einde));
    }
  }
  return uit;
}

/**
 * Elke functie die `commitments` op `cancelled` zet, en wie dan de actor in het spoor is.
 * 📏 Gemeten op 23-11-2026 (QS8-815): precies deze twee.
 */
const NAAR_CANCELLED: Readonly<Record<string, string>> = {
  wikkel_commitments_af:
    'alleen vanuit rond_doel_af(), onder het JWT van de eigenaar; het doel staat dan al op completed',
  beslis_weekbeloftes: 'alleen vanuit maak_straffen_verschuldigd() in de rollover, zonder JWT: actor null = gehouden',
};

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

  it('elke functie die een commitment op cancelled zet, staat in het register met haar actor', () => {
    const gevonden = [...alleLaatsteDefinities()]
      .filter(([, lichaam]) =>
        lichaam
          .split(';')
          .some((zin) => /update\s+(public\.)?commitments\b/i.test(zin) && /set\s+status\s*=[^;]*'cancelled'/i.test(zin)),
      )
      .map(([naam]) => naam)
      .sort();
    expect(gevonden).toEqual(Object.keys(NAAR_CANCELLED).sort());
  });
});
