import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Elke dagteller heeft een rem — QS8-363, migratie 0207.
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
 * ⚠️⚠️ **Maar de naam alleen is niet genoeg, en de eerste versie van deze test
 *    keek alleen daarnaar.** Een rem die `AFTER` is, of `FOR EACH STATEMENT`, of
 *    uitgezet, remt niets — hij staat er alleen. 📏 De security-review van 08-09
 *    heeft vijf van die vormen gemeten en ze waren alle vijf groen; met
 *    `doelinterviews_rem` als `after insert … for each statement` kostte een
 *    geweigerde batch van 20.000 weer 3008 kB bij nul overgebleven rijen.
 *
 *    ⚠️ **En dat is de waarschijnlijkste fout van allemaal**, want de dagteller
 *    ernaast *is* `after insert … for each statement`. Wie de volgende rem
 *    schrijft door de vorm van zijn buurman te kopiëren, landt er precies op.
 *    Vandaar dat de query nu `tgtype` en `tgenabled` leest.
 *
 * IJKING — met de hand gedraaid op 08-09-2026:
 *
 *   A  `drop trigger dagzetten_rem on daily_moves`
 *      → 1 rood: 'elke dagteller heeft een rem', met `daily_moves` in de melding
 *   B  een teller zonder rem toevoegen (`create trigger proef_dagplafond …`)
 *      → 1 rood, met die tabel erbij
 *   C  de rem `for each statement` maken in plaats van `for each row`
 *      → 1 rood
 *   D  de rem `after insert` maken in plaats van `before insert`
 *      → 1 rood
 *   E  `alter table … disable trigger` op de rem
 *      → 1 rood
 *   F  `dagzetten_rem` naar `rem_doelinterviews()` laten wijzen — goede naam,
 *      goede vorm, verkeerde tabel
 *      → 1 rood
 *
 *   ⚠️ C t/m F waren vóór de reparatie alle vier **groen**. Regel 18 vraag 3:
 *      de eerste ijking brak de aanwézigheid van de rem, en dat is niet de as
 *      waarlangs deze fout binnenkomt.
 *
 *   ⚠️ F kwam pas boven bij het náschrijven van deze tabel: hij stond er als
 *      resultaat terwijl hij niet gemeten was, en bleek groen. Dat is dezelfde
 *      fout een laag hoger — een ijkingstabel die je invult uit wat je denkt
 *      dat de query doet, is zelf een aanname.
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
            -- ⚠️⚠️ **De vorm telt, niet alleen de naam.** Zie de kop: een rem die
            --    AFTER of FOR EACH STATEMENT is, remt niets — en dat is precies
            --    de vorm van de dagtellers ernaast, dus de meest waarschijnlijke
            --    fout van wie er een bijschrijft.
            and (r.tgtype & 2) = 2   -- BEFORE
            and (r.tgtype & 1) = 1   -- FOR EACH ROW
            and (r.tgtype & 4) = 4   -- INSERT
            and r.tgenabled = 'O'    -- en hij staat aan
            -- ⚠️ En het is de rem van *deze* tabel. Een trigger dagzetten_rem
            --    die rem_doelinterviews() aanroept heeft de goede naam en de
            --    goede vorm, en telt in de sleutel van een andere tabel tegen
            --    een ander plafond. 📏 Zonder deze regel bleef die mutatie groen.
            and r.tgfoid::regproc::text
                  = 'rem_' || replace(t.tgname, '_dagplafond', '')
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

    // ⚠️ Een exact getal en geen ondergrens. Er stond `> 10` bij veertien
    //    tellers: vier hadden kunnen verdwijnen zonder dat deze zelftoets
    //    aansloeg. Komt er een teller bij, dan hoort dit getal mee te bewegen —
    //    en dan kijkt er iemand naar of er ook een rem bij hoort.
    //
    // ⚠️ 📏 **En dat werkte, twee keer op één dag.** 0214 (QS8-369) zette de
    //    vijftiende teller op `push_tokens`, en deze regel was het enige dat
    //    erover begon: rood op 14 ≠ 15, terwijl de test hierboven groen bleef
    //    omdat de rem er meteen bij zat. 0215 (QS8-379) deed hetzelfde met
    //    `taken_dagplafond` op `todo_items`, en ook daar stond `taken_rem`
    //    ernaast. Precies de handeling waar deze regel voor bedoeld is — een
    //    mens die naar de nieuwe teller kijkt en vraagt of er een rem bij hoort.
    expect(aantal, 'het aantal dagtellers is veranderd; hoort er een rem bij?').toBe(16);
  }, 60_000);
});
