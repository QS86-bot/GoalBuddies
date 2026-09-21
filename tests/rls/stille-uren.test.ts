import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De grenzen van het stille venster staan in de database — QS8-406.
 *
 * ⚠️ **Waarom hier en niet alleen in Zod.** `profielSchema` geeft de gebruiker
 *    een nette foutmelding vóór het verzoek de deur uit gaat, maar dat is de
 *    melding en niet de grens: een kaal PostgREST-verzoek gaat langs Zod heen.
 *    Wat een half venster tegenhoudt is de CHECK, en die hoort dus getoetst te
 *    worden tegen de dráaiende database.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_constraint where conname = 'profiles_stilte_is_geen_punt'",
  import.meta.url,
);

/**
 * Probeert een venster te zetten. Geeft `'ok'` terug, of de naam van de CHECK
 * die het tegenhield.
 *
 * ⚠️ **De naam van de constraint en niet alleen de SQLSTATE.** `23514` zegt
 *    alleen "een CHECK weigerde dit"; welke, is precies wat deze test belooft.
 *    Zonder de naam blijft hij groen als een ánder slot het geval afvangt — de
 *    val die deze branch al drie keer heeft opgeleverd.
 *
 * ⚠️ `begin … rollback` zodat een geslaagde poging niets achterlaat; bij een
 *    fout breekt psql de hele reeks af en is er sowieso niets gecommit.
 */
function zetVenster(van: string, tot: string): string {
  const id = "gen_random_uuid()";
  const sql =
    `begin;
     with nieuw as (
       insert into auth.users (id, email)
         values (${id}, gen_random_uuid() || '@proef.test')
         returning id
     )
     insert into public.profiles (id, display_name, quiet_from, quiet_to)
       select id, 'proef', ${van}, ${tot} from nieuw;
     rollback;`;

  try {
    psql(sql);
    return 'ok';
  } catch (fout) {
    const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
    return tekst.match(/constraint "([a-z_]+)"/)?.[1] ?? tekst.slice(0, 200);
  }
}

describe.skipIf(!beschikbaar)('het stille venster', () => {
  it(
    'laat een normaal venster toe',
    () => {
      expect(zetVenster('22', '7')).toBe('ok');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat "geen stille uren" toe',
    () => {
      expect(zetVenster('null', 'null')).toBe('ok');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️⚠️ **Het geval dat de eerste versie van deze migratie omver haalde.**
   *    `handle_new_user()` maakt bij élke aanmelding een profielrij met béide
   *    kolommen op `null`. Met `quiet_from is distinct from quiet_to` als CHECK —
   *    de vorm die er eerst stond — is dat `false`, dus de trigger viel om en
   *    kon er niemand meer een account maken. 📏 Gemeten: `null is distinct from
   *    null` geeft `f`.
   *
   *    Dit is dus geen randgeval van de feature maar het hoofdpad van de app, en
   *    deze test staat er los van "laat geen stille uren toe" omdat hij een
   *    ándere belofte draagt: aanmelden blijft werken.
   */
  it(
    'laat een gewone aanmelding ongemoeid',
    () => {
      // De trigger doet de insert; hier alleen de gebruiker aanmaken.
      const uit = psql(
        `begin;
         insert into auth.users (id, email)
           values (gen_random_uuid(), gen_random_uuid() || '@aanmelding.test');
         select count(*) from public.profiles;
         rollback;`,
      );
      expect(uit.trim().length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Half ingevuld zou "stil vanaf 22:00 tot nooit" betekenen — een stand die
   *    niet uit te leggen is en die de job als "geen stille uren" zou lezen.
   */
  it(
    'weigert een half venster',
    () => {
      expect(zetVenster('22', 'null')).toBe('profiles_stilte_is_heel_of_niet');
      expect(zetVenster('null', '7')).toBe('profiles_stilte_is_heel_of_niet');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ `van === tot` is niet te onderscheiden tussen "altijd stil" en "nooit
   *    stil", en béide betekenissen zijn al langs een andere weg bereikbaar.
   *    Een dubbelzinnige grens maak je onmogelijk in plaats van hem te raden.
   */
  it(
    'weigert een venster van nul uur',
    () => {
      expect(zetVenster('22', '22')).toBe('profiles_stilte_is_geen_punt');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een uur buiten 0–23',
    () => {
      expect(zetVenster('24', '7')).toBe('profiles_stilte_is_heel_of_niet');
      expect(zetVenster('22', '-1')).toBe('profiles_stilte_is_heel_of_niet');
    },
    TEST_TIMEOUT,
  );
});
