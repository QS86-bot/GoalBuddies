import { describe, expect, it } from 'vitest';

import type { IsoDate } from '../../shared/time';

import { HELDSLEUTELS, TRIGGERS, type Heldsleutel } from './helden';
import { kiesStem, magVerschijnen, STILTEDREMPEL_DAGEN, tegenslagtrigger } from './stem';

/**
 * QS8-475, epic QS8-468.
 *
 * ⚠️⚠️ **Acceptatiecriterium 7 zegt met zoveel woorden wat hier hoort en wat
 *    niet:** *"gegeven een gebruiker met hoofdheld X en een mijlpaalgebeurtenis,
 *    spreekt Strix en niet X"* is de belofte; *"de mapping-tabel klopt"* is een
 *    eigenschap van het onderdeel. Die tweede staat al in `helden.test.ts` (elke
 *    trigger heeft precies één held) en hoort hier niet nog een keer.
 *
 *    Het verschil is niet academisch. Een test die de tabel naleest, blijft
 *    groen als iemand de prioriteitsregel omdraait — dan klopt de tabel nog
 *    steeds en spreekt de verkeerde held.
 */

const VANDAAG = '2026-09-14' as IsoDate;

describe('een specifieke trigger gaat vóór de hoofdheld', () => {
  it('laat Strix spreken bij een mijlpaal, ook als de hoofdheld iemand anders is', () => {
    // ⚠️ De belofte van acceptatiecriterium 7, woordelijk.
    const stem = kiesStem('mijlpaal', 'quip');

    expect(stem).toEqual({ soort: 'held', held: 'strix', reden: 'trigger', trigger: 'mijlpaal' });
  });

  it('doet dat voor élke trigger en élke hoofdheld, en niet alleen voor de mijlpaal', () => {
    // ⚠️ Zesendertig combinaties. Zonder deze lus bewaakt de toets hierboven één
    //    rij van de tabel, en dat is precies het onderdeel in plaats van de
    //    belofte.
    for (const trigger of TRIGGERS) {
      for (const hoofdheld of HELDSLEUTELS) {
        const stem = kiesStem(trigger, hoofdheld);

        expect(stem.soort, `${trigger}/${hoofdheld}`).toBe('held');
        if (stem.soort !== 'held') continue;
        expect(stem.reden, `${trigger}/${hoofdheld}`).toBe('trigger');
        expect(stem.trigger, `${trigger}/${hoofdheld}`).toBe(trigger);
      }
    }
  });

  it('laat de hoofdheld spreken als er géén specifieke trigger is', () => {
    const stem = kiesStem(null, 'forge');

    expect(stem).toEqual({
      soort: 'held',
      held: 'forge',
      reden: 'hoofdheld',
      trigger: 'tussendoor',
    });
  });
});

describe('wie de quiz oversloeg krijgt geen fout en geen lege naam', () => {
  it('geeft `geen` als er geen trigger en geen hoofdheld is', () => {
    // ⚠️ Acceptatiecriterium 6: dan valt de oproeper terug op de bestaande
    //    neutrale toon. Geen foutmelding — en vooral geen bericht met een lege
    //    naam erin, wat de vorm is die je pas op een telefoon ziet.
    expect(kiesStem(null, null)).toEqual({ soort: 'geen' });
  });

  it('geeft wél de triggerheld als er geen hoofdheld is', () => {
    // ⚠️ De contextuele triggers werken gewoon zonder quiz. Dat staat er met
    //    zoveel woorden in acceptatiecriterium 6, en het is de helft die je
    //    kwijtraakt als je "geen held" op de trigger-tak toepast.
    for (const trigger of TRIGGERS) {
      const stem = kiesStem(trigger, null);
      expect(stem.soort, trigger).toBe('held');
    }
  });
});

describe('de overgang van Ignis naar Lucerna ligt op dag drie', () => {
  /**
   * ⚠️ **De grens zelf is de test, niet de twee gevallen eromheen.** Het
   *    brondocument zegt "3+ dagen geen activiteit"; een test op dag 1 en dag 5
   *    laat de grens vrij tussen 2 en 5 liggen.
   */
  it('is misser tot en met dag twee en stilte vanaf dag drie', () => {
    const gevallen: readonly [number, string][] = [
      [0, 'misser'],
      [1, 'misser'],
      [2, 'misser'],
      [3, 'stilte'],
      [4, 'stilte'],
      [30, 'stilte'],
    ];

    for (const [dagen, verwacht] of gevallen) {
      const laatste = new Date(Date.UTC(2026, 8, 14 - dagen)).toISOString().slice(0, 10) as IsoDate;
      expect(tegenslagtrigger(laatste, VANDAAG), `${dagen} dagen`).toBe(verwacht);
    }
  });

  it('legt de drempel vast op het getal uit het brondocument', () => {
    expect(STILTEDREMPEL_DAGEN).toBe(3);
  });

  it('noemt vandaag zelf geen stilte', () => {
    // ⚠️ Nul dagen afstand is dag 1 van een onderbroken reeks, en dat is Ignis.
    //    Zou dit `stilte` geven, dan neemt Lucerna het over op het moment dat er
    //    nog niets aan de hand is.
    expect(tegenslagtrigger(VANDAAG, VANDAAG)).toBe('misser');
  });
});

describe('niet twee helden op dezelfde dag, behalve bij een mijlpaal', () => {
  const strix: Heldsleutel = 'strix';

  it('laat de eerste held van de dag altijd door', () => {
    for (const trigger of TRIGGERS) {
      expect(magVerschijnen(kiesStem(trigger, null), 0), trigger).toBe(true);
    }
  });

  it('houdt een tweede held tegen', () => {
    // ⚠️ De belofte van acceptatiecriterium 7: gegeven twee gebeurtenissen op één
    //    dag, spreekt er één.
    for (const trigger of TRIGGERS.filter((t) => t !== 'mijlpaal')) {
      expect(magVerschijnen(kiesStem(trigger, null), 1), trigger).toBe(false);
    }
  });

  it('laat de mijlpaal er als tweede wél door', () => {
    expect(kiesStem('mijlpaal', null)).toMatchObject({ held: strix });
    expect(magVerschijnen(kiesStem('mijlpaal', null), 1)).toBe(true);
  });

  it('laat een derde ook bij een mijlpaal niet door', () => {
    // ⚠️ **Hier zit het verschil tussen een getal en een boolean.** Met "is er al
    //    een geweest" is de uitzondering onbegrensd en spreken er bij drie
    //    mijlpalen op één dag drie helden. De uitzondering is hoofdheld plus
    //    Strix, en dat zijn er twee.
    expect(magVerschijnen(kiesStem('mijlpaal', null), 2)).toBe(false);
    expect(magVerschijnen(kiesStem('mijlpaal', null), 5)).toBe(false);
  });

  it('laat niemand verschijnen als er geen held is', () => {
    expect(magVerschijnen({ soort: 'geen' }, 0)).toBe(false);
  });
});
