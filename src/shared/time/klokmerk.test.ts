import { describe, expect, it } from 'vitest';

import { cyclesBetween, groupPeriod, nextCycle, previousCycle, userCycle } from './cycle';
import type { Gebruikerscyclus, Groepsperiode } from './types';

/**
 * Het merk op `Cycle` — QS8-180.
 *
 * ⚠️ **Dit toetst een naad en niet een onderdeel** (onwrikbare regel 18, vraag 1).
 *    `userCycle()` en `groupPeriod()` zijn elk apart al uitgebreid getoetst in
 *    `cycle.test.ts`, en die tests bleven groen terwijl domeinregel 1 — "geen
 *    enkele query haalt de twee klokken door elkaar" — precies daar te breken
 *    was: op de plek waar twee correcte cycli aan elkaar geknoopt worden. De
 *    belofte is niet "de cyclus klopt", de belofte is "de klok verlaat zijn merk
 *    nooit".
 *
 * ⚠️ **Er zijn twee grendels en ze worden hieronder los geijkt** — de typegrens
 *    (`cyclesBetween` heeft twee overloads en geen generieke parameter) en de
 *    draaiende code (dezelfde functie werpt). Ze vangen verschillende dingen: de
 *    eerste vangt de programmeur, de tweede vangt een `as`, een `any` uit een
 *    query, en de Deno-kopie in `supabase/functions/_shared/time` — die wordt
 *    door een andere typecheck bekeken dan deze.
 */

const AMS = 'Europe/Amsterdam';
const HET_MOMENT = new Date('2026-08-25T09:00:00Z');

/** Maandag als week-startdag; woensdag als huddledag. Twee verschillende dagen. */
const persoonlijk = (): Gebruikerscyclus => userCycle({ weekStartDay: 1, tz: AMS }, HET_MOMENT);
const groeps = (): Groepsperiode => groupPeriod({ huddleDay: 3, tz: AMS }, HET_MOMENT);

describe('het merk op Cycle', () => {
  it('stempelt elke constructor met de klok die hem maakte', () => {
    expect(persoonlijk().klok).toBe('gebruiker');
    expect(groeps().klok).toBe('groep');
  });

  it('houdt het merk vast bij het navigeren, beide kanten op', () => {
    expect(previousCycle(persoonlijk()).klok).toBe('gebruiker');
    expect(nextCycle(persoonlijk()).klok).toBe('gebruiker');
    expect(previousCycle(groeps()).klok).toBe('groep');
    expect(nextCycle(groeps()).klok).toBe('groep');
  });

  /**
   * ⚠️ Dit is de belofte in haar kortste vorm: er bestáát geen antwoord op "hoeveel
   *    cycli zitten er tussen jouw week en de huddleweek van je groep". Niet nul,
   *    niet een getal. Vandaar een uitzondering en geen waarde.
   */
  it('weigert twee cycli van verschillende klokken te vergelijken', () => {
    const mijn = persoonlijk();
    const hun = groeps();

    // ⚠️ De cast is hier het gereedschap en niet de fout: hij bootst precies na
    //    wat er in de draaiende code gebeurt wanneer de typegrens er niet was —
    //    een cyclus die uit een `any` of uit de Deno-kopie komt.
    expect(() => cyclesBetween(mijn, hun as unknown as Gebruikerscyclus)).toThrow(
      /twee klokken: gebruiker en groep/,
    );
    expect(() => cyclesBetween(hun, mijn as unknown as Groepsperiode)).toThrow(
      /twee klokken: groep en gebruiker/,
    );
  });

  it('vergelijkt twee cycli van dezelfde klok gewoon', () => {
    expect(cyclesBetween(persoonlijk(), nextCycle(persoonlijk()))).toBe(1);
    expect(cyclesBetween(groeps(), previousCycle(groeps()))).toBe(-1);
  });

  /**
   * De typegrens. Deze test doet op zichzelf niets — hij bestaat om door
   * `npm run typecheck` gelezen te worden.
   *
   * ⚠️ **`@ts-expect-error` is hier de assertie en niet een onderdrukking.**
   *    Verdwijnt het merk van `Cycle`, dan compileert de aanroep eronder gewoon,
   *    en dan meldt TypeScript "Unused '@ts-expect-error' directive" — rood, op
   *    precies de regel die de belofte draagt. Een `expect(...)` kan dit niet
   *    toetsen: dit gaat over wat er níet compileert.
   *
   * ⚠️ Zonder deze grendel zou `cyclesBetween` een generieke parameter kunnen
   *    krijgen — `<K extends Klok>(from: Cycle<K>, to: Cycle<K>)` — en die ziet
   *    eruit alsof hij hetzelfde doet. Dat doet hij niet: `K` wordt uit beide
   *    argumenten samen afgeleid en landt bij een gemengd paar op de unie. De
   *    twee overloads in `cycle.ts` bestaan om die reden en niet uit stijl.
   */
  it('laat een gemengde vergelijking niet compileren', () => {
    // ⚠️ **Wordt met opzet nooit aangeroepen.** Zou hier `expect(...).toThrow()`
    //    staan, dan zou déze test ook rood worden als iemand alleen de worp uit
    //    `cyclesBetween` haalt — en dan ijkt hij twee grendels tegelijk en dus
    //    geen van beide scherp. De worp heeft zijn eigen test hierboven.
    const nooitAangeroepen = (): void => {
      // @ts-expect-error — een groepsperiode is geen gebruikerscyclus (QS8-180)
      cyclesBetween(persoonlijk(), groeps());
      // @ts-expect-error — en andersom net zo goed (QS8-180)
      cyclesBetween(groeps(), persoonlijk());
    };

    expect(typeof nooitAangeroepen).toBe('function');
  });
});
