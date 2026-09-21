import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De vingerafdruk is per fúnctie en niet per naam — QS8-398, migratie 0232.
 *
 * ⚠️⚠️ **Waarom deze test naast `tests/scripts/functies-vergelijk.test.ts` staat
 *    en die niet vervangt.** Die toetst de vergelijking: geef je hem twee rijen
 *    met verschillende sleutels, dan komen ze er allebei uit. Dat is waar, en het
 *    is niet de belofte — hij voert de sleutels met de hand aan. Draait iemand
 *    `0232` terug, dan blijft hij groen terwijl de grendel weg is.
 *
 *    Regel 18 vraag 3 in zijn zuiverste vorm: *kan deze test groen blijven
 *    terwijl de belofte breekt?* Voor die daar is het antwoord ja. Dít bestand
 *    vraagt het aan de database, en daar is het antwoord nee.
 *
 * ## Wat er misging
 *
 * 📏 Gemeten op 09-09-2026, vóór 0232: `functie_vingerafdrukken()` gaf als sleutel
 *    `p.proname` zonder argumenten. `activeer_weekplanstap` bestaat in twee
 *    vormen, met twee vérschillende `kaal`-waarden, en `vergelijkFuncties()` legt
 *    de rijen in een `Map`:
 *
 *      rijen uit de database : 2
 *      na de Map             : 1   -> er verdwijnt er 1
 *
 *    De verdwenen overload zat noch in `logica`, noch in `commentaar`, noch in
 *    `alleenProductie` of `alleenLokaal`. Onzichtbaar, niet gemeld — en dat is
 *    precies de functie die moet vaststellen of productie nog draait wat de
 *    migraties bouwen.
 *
 * ⚠️ **De aanname wordt duurder, niet goedkoper.** Er is er vandaag één, en een
 *    overload komt er juist bij als een functie een argument krijgt zónder zijn
 *    aanroepers te breken — een gewone, aangemoedigde beweging.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'functie_vingerafdrukken'",
  import.meta.url,
);

describe.skipIf(!beschikbaar)('de vingerafdruk is per functie en niet per naam', () => {
  /**
   * ⚠️ **Dit is de grendel.** Zet `functie_vingerafdrukken()` terug op
   *    `p.proname::text` en deze regel wordt rood — er zijn dan minder sleutels
   *    dan rijen. Geen enkele andere test in dit project merkt dat.
   */
  it('geeft evenveel sleutels als rijen — geen twee functies delen er een', () => {
    const rijen = Number(psql('select count(*) from functie_vingerafdrukken()'));
    const sleutels = Number(psql('select count(distinct naam) from functie_vingerafdrukken()'));

    expect(rijen).toBeGreaterThan(0);
    expect(sleutels).toBe(rijen);
  });

  /**
   * ⚠️ **De must-find ernaast, en die is scherper dan de telling.** Een sleutel
   *    per rij kun je ook halen door de overload wég te laten uit het resultaat;
   *    dan klopt de telling en bewaakt hij niets. Deze regel eist dat de twee
   *    vormen er allebéi in zitten, met hun argumenten erbij.
   */
  it('noemt beide overloads van activeer_weekplanstap, mét hun argumenten', () => {
    const gevonden = psql(
      "select coalesce(string_agg(naam, E'\\n' order by naam), '') " +
        "from functie_vingerafdrukken() where naam like 'activeer_weekplanstap%'",
    )
      .split('\n')
      .filter((r) => r.trim() !== '');

    expect(gevonden).toEqual([
      'activeer_weekplanstap(p_goal_id uuid, p_cycle_start_date date)',
      'activeer_weekplanstap(p_goal_id uuid, p_cycle_start_date date, p_cycle_index integer)',
    ]);
  });

  /**
   * ⚠️ **De must-allow, en zonder deze is de reparatie te breed.** `STEIGER`
   *    (`/^shim_/`) in `functies-vergelijk.mjs` filtert de twee lokale
   *    hulpfuncties weg. Die regex ankert op het begin, dus hij blijft werken nu
   *    er argumenten achter de naam staan — maar dat is een aanname tot iemand
   *    hem meet. Zou de sleutel ooit met een schema of een prefix beginnen, dan
   *    valt de filter stil weg en vergelijkt de controle twee stacks die per
   *    definitie verschillen.
   */
  it('houdt de shim-namen vooraan, zodat de steigerfilter blijft werken', () => {
    const shims = psql(
      "select coalesce(string_agg(naam, E'\\n' order by naam), '') " +
        "from functie_vingerafdrukken() where naam like 'shim%'",
    )
      .split('\n')
      .filter((r) => r.trim() !== '');

    expect(shims.length).toBeGreaterThan(0);
    for (const naam of shims) expect(naam.startsWith('shim_')).toBe(true);
  });
});
