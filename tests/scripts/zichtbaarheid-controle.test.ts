import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `pinuitzonderingen-controle.test.ts`.
import {
  beoordeel,
  GEEN_OPPERVLAK,
  ontleed,
  OPPERVLAKKEN,
} from '../../scripts/zichtbaarheid-controle.mjs';

import { nl } from '../../src/shared/i18n/nl';

/**
 * De ijking van `npm run zichtbaarheid:controle`.
 *
 * ⚠️ **Wat hier bewaakt wordt is geen kolom maar een belofte.** Besluit A41 gaf
 *    een groep de keuze tussen beschermd en open, en de zin die de gebruiker
 *    daarbij leest sómt op wat er dan zichtbaar wordt. Die zin staat in de
 *    catalogus; wat er werkelijk varieert staat in de database. Niets legde die
 *    twee naast elkaar, en dat is precies hoe die zin op 24-08-2026 een derde
 *    van de waarheid ging vertellen.
 *
 * ⚠️ **De bevinding van 25-08 zei dat zo'n controle "een machineleesbare vorm
 *    van §6b" vraagt.** Dat is naar de verkeerde bron gekeken: het
 *    beslisdocument is een beschrijving, de database is de waarheid. Wat op
 *    `groups.zichtbaarheid` varieert is gewoon te tellen.
 *
 * ⚠️ **Het register is tweezijdig, en de tweede helft is geen bijvangst.** Zes
 *    plekken noemen zichtbaarheid zonder een oppervlak te zijn — de twee
 *    hulpfuncties, de setter, de pin, het aanmaken en de uitnodigingspreview.
 *    Zonder die lijst meldt de controle er zes en leer je hem te negeren; mét
 *    die lijst is élke plek geclassificeerd en valt een nieuwe naam op.
 */

describe('ontleed', () => {
  it('houdt één plek per regel over', () => {
    expect(ontleed('functie:group_overview\nview:group_visible_streaks\n')).toEqual([
      'functie:group_overview',
      'view:group_visible_streaks',
    ]);
  });

  it('laat lege regels vallen — `psql -At` sluit af met een lege regel', () => {
    expect(ontleed('\n  functie:group_overview  \n\n')).toEqual(['functie:group_overview']);
  });
});

describe('beoordeel', () => {
  const opp = new Map([['functie:een', 'varieert']]);
  const geen = new Map([['functie:twee', 'is de setter']]);

  it('meldt een vijfde oppervlak dat in geen van beide lijsten staat', () => {
    // Dit is waar de bevinding om vroeg: "wordt zwaarder als er een vijfde
    // oppervlak op `groups.zichtbaarheid` gaat variëren".
    const uit = beoordeel(['functie:een', 'functie:twee', 'functie:nieuw'], opp, geen);

    expect(uit.onbekend).toEqual(['functie:nieuw']);
    expect(uit.verdwenen).toEqual([]);
  });

  it('meldt een register-rij waarvan de code weg is', () => {
    // ⚠️ De helft die je vergeet te bouwen. Een register dat achterloopt geeft
    //    redenen voor code die er niet meer is — en dan noemt de
    //    toestemmingszin mogelijk iets dat niet meer bestaat.
    const uit = beoordeel(['functie:een'], opp, geen);

    expect(uit.verdwenen).toEqual(['functie:twee']);
    expect(uit.onbekend).toEqual([]);
  });

  it('telt een plek uit de niet-oppervlaklijst niet als bezwaar', () => {
    // Zonder deze helft meldt de controle de zes mechanismeplekken elke keer.
    expect(beoordeel(['functie:een', 'functie:twee'], opp, geen)).toEqual({
      onbekend: [],
      verdwenen: [],
    });
  });
});

describe('de twee registers', () => {
  it('overlappen niet — een plek is een oppervlak of hij is het niet', () => {
    // Stond een naam in allebei, dan is de classificatie zelf de vraag die deze
    // controle hoort te beantwoorden.
    const beide = [...(OPPERVLAKKEN as Map<string, string>).keys()].filter((k) =>
      (GEEN_OPPERVLAK as Map<string, string>).has(k),
    );

    expect(beide).toEqual([]);
  });

  it('geven bij elke plek een reden en niet alleen een vinkje', () => {
    for (const register of [OPPERVLAKKEN, GEEN_OPPERVLAK] as Map<string, string>[]) {
      for (const [plek, reden] of register) {
        expect(reden.length, `${plek} heeft geen reden`).toBeGreaterThan(30);
      }
    }
  });

  it('dragen een soortprefix, zodat een functie en een view niet botsen', () => {
    for (const register of [OPPERVLAKKEN, GEEN_OPPERVLAK] as Map<string, string>[]) {
      for (const plek of register.keys()) {
        expect(plek, `${plek} mist een soort`).toMatch(/^(functie|policy|view):/);
      }
    }
  });
});

describe('de toestemmingszin', () => {
  /**
   * ⚠️ **Dit is de naad waar de hele bevinding over gaat**, en de test kan hem
   *    niet dichttimmeren: of een zin vier oppervlakken *dekt*, is een oordeel
   *    en geen meting. Wat wél te toetsen valt, is dat de zin er is en dat hij
   *    de dingen noemt die vandaag opengaan. Verandert het aantal oppervlakken,
   *    dan wordt `zichtbaarheid:controle` rood en komt iemand hier langs.
   */
  it('bestaat en noemt de drie dingen die vandaag opengaan', () => {
    const zin = nl['zichtbaarheid.open_uitleg'];

    expect(zin).toBeTruthy();
    expect(zin).toMatch(/gemiste/i);
    expect(zin).toMatch(/reeks/i);
    expect(zin).toMatch(/meedeed|meedoet/i);
  });

  it('staat ook in de bevestiging, want dáár geeft iemand toestemming', () => {
    const zin = nl['bevestiging.groep_openzetten.uitleg'];

    expect(zin).toBeTruthy();
    expect(zin).toMatch(/gemiste/i);
    expect(zin).toMatch(/reeks/i);
  });

  it('noemt dat het met terugwerkende kracht geldt', () => {
    // ⚠️ De duurste helft van die zin: openzetten onthult ook de weken die er
    //    al staan. Wie dat pas ná het omzetten leest, heeft toestemming gegeven
    //    voor iets anders dan hij dacht.
    expect(nl['bevestiging.groep_openzetten.uitleg']).toMatch(/al staan|terugwerkende/i);
  });
});
