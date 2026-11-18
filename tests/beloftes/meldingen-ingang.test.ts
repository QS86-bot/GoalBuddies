import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { meldingenIngangStand } from '../../src/modules/buddies/meldingeningang';

/**
 * De ingang naar /meldingen staat er voor wie mag beoordelen — QS8-705.
 *
 * ⚠️ **De belofte is "voor wie mag beoordelen, ook als er niets wacht, en voor
 *    niemand anders".** Dat zijn drie dingen op drie plekken: de poort in de
 *    database (`tests/rls/moderatiepoort-leesbaar.test.ts`), de beslissing hier,
 *    en het scherm dat ze aanroept. Deze test dekt de tweede en de naad naar de
 *    derde; zonder die naad blijft alles groen terwijl het scherm een andere
 *    functie aanroept en de ingang er nooit is.
 *
 * IJKING — met de hand, 18-11-2026, vooraf en achteraf 6 groen:
 *
 *   A  `meldingenIngangStand` (in `meldingeningang.ts`) laat `rustig` vallen (altijd `geen` bij 0 wachtend)
 *      -> rood: 'mag je beoordelen en wacht er niets, dan blijft de ingang staan'
 *   B  `magBeoordelen` negeren (altijd `rustig` bij 0 wachtend)
 *      -> rood: 'wie niet mag beoordelen, ziet niets'
 *   C  de volgorde omdraaien (eerst `magBeoordelen`)
 *      -> rood: 'wacht er iets, dan is het antwoord niet afhankelijk van de poort'
 *   D  `MeldingenIngang` in `profiel.tsx` laat `laadMeldingenIngang` vallen
 *      -> rood: 'het scherm roept de loader aan die de poort vraagt'
 */

describe('wat de ingang laat zien', () => {
  it('mag je beoordelen en wacht er niets, dan blijft de ingang staan', () => {
    expect(meldingenIngangStand(0, true)).toBe('rustig');
  });

  it('wie niet mag beoordelen, ziet niets', () => {
    expect(meldingenIngangStand(0, false)).toBe('geen');
  });

  it('wat wacht wint van wat je mag', () => {
    expect(meldingenIngangStand(1, true)).toBe('wacht');
    expect(meldingenIngangStand(3, true)).toBe('wacht');
  });

  it('wacht er iets, dan is het antwoord niet afhankelijk van de poort', () => {
    // Een melding die wacht komt uit `openstaande_meldingen()`, dat zelf alleen
    // rijen geeft aan wie mag beoordelen. De poort hoeft er niets aan toe te voegen.
    expect(meldingenIngangStand(1, false)).toBe('wacht');
  });
});

describe('de naad naar het scherm', () => {
  const bron = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'profiel.tsx'), 'utf8')
    .split('\n')
    .filter((regel) => !/^\s*(\/\/|\*|\/\*)/.test(regel))
    .join('\n');

  it('het scherm roept de loader aan die de poort vraagt', () => {
    expect(bron).toMatch(/useAsync\(\(\) => laadMeldingenIngang\(\)/);
  });

  it('het scherm toont de ingang niet als je niet mag beoordelen', () => {
    expect(bron).toMatch(/data === 'geen'\) return null/);
  });
});
