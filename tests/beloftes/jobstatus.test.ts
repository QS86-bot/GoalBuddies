/**
 * De statuslijst van een AI-job bestaat aan twee kanten van de grens.
 *
 * ⚠️ **De belofte is niet "`JobStatus` heeft vier waarden" maar "het scherm
 *    herkent élke status die de database kan opleveren".** Dat eerste is een
 *    eigenschap van een onderdeel en die toetst zichzelf. Het tweede is een
 *    eigenschap van het gehéél, en die brak: de CHECK `ai_jobs_status_valid`
 *    kent `'failed'`, `doelcoach` schrijft `'failed'`, en de app kende
 *    `'error'`. Elk onderdeel klopte. De tak in het coach-scherm die een
 *    mislukking afhandelde, was onbereikbaar — sinds QS8-38, en er is dus nog
 *    nooit iemand de reden van een mislukte generatie te zien gekregen.
 *
 * ⚠️ **Dit is exact de vorm van 0032/0034**, de allowlist van systeemberichten
 *    die twee kanten op werd getoetst en tóch uit elkaar liep omdat de tweede
 *    test de oude lijst met zichzelf vergeleek. Valkuil 11: **twee insluitingen
 *    zijn geen gelijkheid.** Deze test toetst daarom de gelijkheid van de twee
 *    verzamelingen, en niet dat de een in de ander past.
 *
 * ⚠️ **De CHECK wordt uit het migratiebestand gelezen en niet overgetypt.** Een
 *    tweede handgeschreven lijst hier zou de derde kopie zijn, en dan bewaakt
 *    deze test alleen nog of ik twee dingen consistent heb overgetypt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JOB_STATUSSEN } from '../../src/modules/ai/job-schemas';

const WORTEL = join(__dirname, '..', '..');

/** De waarden uit `constraint ai_jobs_status_valid check (status in (…))`. */
function statussenUitDeCheck(): readonly string[] {
  const sql = readFileSync(join(WORTEL, 'supabase', 'migrations', '0001_schema.sql'), 'utf8');

  const regel = /constraint\s+ai_jobs_status_valid\s+check\s*\(\s*status\s+in\s*\(([^)]*)\)/i.exec(
    sql,
  );
  if (regel === null) {
    throw new Error(
      'ai_jobs_status_valid niet gevonden in 0001_schema.sql. Is de CHECK verplaatst ' +
        'naar een latere migratie? Dan wijst deze test naar de verkeerde bron en ' +
        'bewaakt hij niets meer.',
    );
  }

  return (regel[1] ?? '')
    .split(',')
    .map((deel) => deel.trim().replace(/^'|'$/g, ''))
    .filter((deel) => deel !== '');
}

describe('de statuslijst van een AI-job', () => {
  it('staat in de app precies zoals in de database', () => {
    const uitDeDatabase = [...statussenUitDeCheck()].sort();
    const uitDeApp = [...JOB_STATUSSEN].sort();

    // ⚠️ `toEqual` op twee gesorteerde lijsten, en niet twee keer `toContain`.
    //    Dat laatste is de fout van 0032: allebei de insluitingen slaagden en de
    //    lijsten liepen tóch uit elkaar.
    expect(uitDeApp).toEqual(uitDeDatabase);
  });

  it('vindt de CHECK daadwerkelijk, en verzint hem niet', () => {
    // ⚠️ Zonder deze regel zou een lege uitkomst uit de regex een lege lijst
    //    opleveren, en `[] === []` is groen. Dan bewaakt de test niets — dezelfde
    //    val als een controle die nul meldt omdat hij nergens keek.
    expect(statussenUitDeCheck().length).toBeGreaterThan(0);
    expect(statussenUitDeCheck()).toContain('failed');
  });

  it('kent geen enkele status die de database zou weigeren', () => {
    // De richting die er in de praktijk toe deed: de app had `'error'`, en de
    // database zou zo'n rij nooit schrijven. Een status die alleen in de app
    // bestaat, is een tak die nooit afgaat.
    for (const status of JOB_STATUSSEN) {
      expect(statussenUitDeCheck()).toContain(status);
    }
  });
});
