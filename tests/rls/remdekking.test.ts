import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Elke dagteller heeft een rem — QS8-363, migratie 0206.
 *
 * ⚠️ **Deze test bestaat omdat een waarschuwing in een dossier geen grendel is.**
 *    0200 (QS8-347) mat dat een geweigerde bulk-insert de rijen éérst schrijft:
 *    de dagteller is `AFTER INSERT … FOR EACH STATEMENT`, want een transitietabel
 *    bestaat alleen in `AFTER`, en Postgres schrijft dus 50.000 rijen weg voordat
 *    de trigger nee zegt. Die migratie zette op negen tabellen een
 *    `BEFORE INSERT … FOR EACH ROW`-rem ervoor.
 *
 *    In `docs/ENGINEER-REVIEW.md` stond daarna letterlijk: *"QS8-344 bouwt het
 *    defect opnieuw op tien tabellen als hij zonder rem landt."* 📏 Een paar uur
 *    later landde 0203 met zes nieuwe dagtellers en géén rem, en op `daily_moves`
 *    kostte een geweigerde batch van 20.000 weer **2,9 MB** die pas bij een
 *    `vacuum full` terugkomt.
 *
 *    Twee branches breidden dezelfde structuur uit, git zag geen conflict, en het
 *    enige dat het merkte was een mens die nog wist dat de rij er stond. Deze
 *    test is wat dat had moeten zijn.
 *
 * ⚠️ **Hij leest `pg_trigger` en niet de migratiebestanden.** De database is de
 *    waarheid: een rem die in een migratie staat maar door een latere `drop`
 *    verdwenen is, telt niet — en precies dat verschil kunnen de bestanden niet
 *    zien.
 *
 * ⚠️ **De koppeling loopt over de naam, en dat is een afspraak.** Een teller heet
 *    `<naam>_dagplafond` en zijn rem `<naam>_rem`. Wie een teller anders noemt,
 *    wordt hier rood — en dat is de bedoeling: dan is de afspraak zichtbaar
 *    verbroken in plaats van stil.
 *
 * IJKING — met de hand gedraaid op 08-09-2026:
 *
 *   A  `drop trigger dagzetten_rem on daily_moves`
 *      → 1 rood: 'elke dagteller heeft een rem', met `daily_moves` in de melding
 *   B  een teller zonder rem toevoegen (`create trigger proef_dagplafond …`)
 *      → 1 rood, met die tabel erbij
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'rem_dagzetten'",
  import.meta.url,
);

/** Tabellen met een `*_dagplafond`-trigger maar zonder `*_rem` ervoor. */
function tellersZonderRem(): string[] {
  const uit = psql(`
    select c.relname || ' (' || t.tgname || ')'
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal
       and t.tgname like '%\\_dagplafond'
       and not exists (
         select 1 from pg_trigger r
          where r.tgrelid = t.tgrelid
            and not r.tgisinternal
            and r.tgname = replace(t.tgname, '_dagplafond', '_rem')
       )
     order by 1
  `);
  return uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '');
}

describe.skipIf(!beschikbaar)('elke dagteller heeft een rem', () => {
  it('geen enkele tabel heeft een dagteller zonder rem ervoor', () => {
    const zonder = tellersZonderRem();

    expect(
      zonder,
      `deze tabellen hebben een AFTER STATEMENT-dagteller zonder BEFORE ROW-rem, ` +
        `dus een geweigerde bulk-insert schrijft er alsnog megabytes weg: ` +
        `${zonder.join(', ')}. Zie migratie 0200 voor de vorm van de rem.`,
    ).toEqual([]);
  }, 60_000);

  it('en de teller telt werkelijk iets — anders bewijst de regel hierboven niets', () => {
    // ⚠️ **Zonder deze helft is de test hierboven gratis groen.** Vindt de query
    //    door een typefout nul dagtellers, dan is de lijst leeg en klopt de
    //    assertie — terwijl er geen enkele rem gemeten is. Regel 18, vraag 3.
    const aantal = Number(
      psql(`select count(*) from pg_trigger
              where not tgisinternal and tgname like '%\\_dagplafond'`).trim(),
    );

    expect(aantal, 'er is geen enkele dagteller gevonden; de query zoekt iets verkeerds').toBeGreaterThan(10);
  }, 60_000);
});
