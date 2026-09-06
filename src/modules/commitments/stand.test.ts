import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../../shared/i18n';

import type { Commitment } from './api';
import {
  COMMITMENT_STANDEN,
  isAfgegaan,
  isOpenstaand,
  magStrafVastleggen,
  statusTeksten,
  tekstVoor,
} from './stand';

/**
 * De toon van een commitment is een acceptatiecriterium — QS8-84: "nuchter, niet
 * vernederend". Dat is precies het soort eis die je verliest bij de derde
 * herformulering, dus hij staat hier onder test en niet alleen in een comment.
 */

function commitment(type: string, status: string): Commitment {
  return {
    id: 'x',
    goal_id: 'g',
    type,
    body: 'iets',
    image_url: null,
    beneficiary_group_id: null,
    status,
    confirmed_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
  } as Commitment;
}

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('statusTeksten()', () => {
  it('heeft een tekst voor elke stand die een commitment echt kan hebben', () => {
    // `reward:due` en `reward:resolved` staan er bewust niet bij: een beloning
    // wordt nooit verschuldigd. Zou dat ooit veranderen, dan hoort deze lijst
    // mee te veranderen.
    for (const sleutel of COMMITMENT_STANDEN) {
      expect(statusTeksten()[sleutel], sleutel).toBeDefined();
    }
  });

  it('verwijt niets en roept niets uit', () => {
    // Geen uitroeptekens, en geen woord dat iemand aankijkt op wat hij niet
    // gehaald heeft. De gebruiker heeft dit zichzelf opgelegd.
    //
    // ⚠️ In béíde talen sinds QS8-115. De toon is een acceptatiecriterium van
    //    QS8-84, en een vertaler die de code niet kent, kent dat criterium ook
    //    niet — dus het hoort hier bewaakt te worden en niet in een comment.
    const verboden = /helaas|jammer|mislukt|gefaald|niet gelukt|sorry|unfortunately|failed|sadly|!/i;

    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);

      for (const [sleutel, tekst] of Object.entries(statusTeksten())) {
        const waar = `${taalcode}:${sleutel}`;
        expect(tekst.uitleg, waar).not.toMatch(verboden);
        expect(tekst.titel, waar).not.toMatch(verboden);
        expect(tekst.uitleg.length, waar).toBeGreaterThan(20);
      }
    }
  });

  it('zegt bij een ingestelde straf dat een gemiste week er niets aan doet', () => {
    // Domeinregel 11, en de meest waarschijnlijke misvatting die iemand heeft
    // op het moment dat hij een straf instelt.
    expect(statusTeksten()['penalty:set']?.uitleg).toContain('week');
  });

  it('zegt bij een verschuldigde straf wie hem nu kan lezen', () => {
    // Dit is het moment waarop de inhoud van privé naar de groep gaat. Dat mag
    // iemand niet hoeven afleiden.
    expect(statusTeksten()['penalty:due']?.uitleg).toContain('groep');
  });

  it('valt terug op iets leesbaars bij een onbekende combinatie', () => {
    expect(tekstVoor(commitment('penalty', 'onzin')).titel).toBe('Onbekend');
  });
});

describe('isAfgegaan', () => {
  it('is waar voor precies de standen waarop de groep meeleest', () => {
    // ⚠️ Deze lijst is een kopie van `commitments_select`. Loopt hij uit de pas,
    //    dan toont de UI "privé" terwijl de database het al deelt — en dat is de
    //    fout die je nooit ziet zonder test.
    expect(isAfgegaan(commitment('penalty', 'due'))).toBe(true);
    expect(isAfgegaan(commitment('reward', 'unlocked'))).toBe(true);
    expect(isAfgegaan(commitment('penalty', 'resolved'))).toBe(true);

    expect(isAfgegaan(commitment('penalty', 'set'))).toBe(false);
    expect(isAfgegaan(commitment('penalty', 'cancelled'))).toBe(false);
  });
});

describe('isOpenstaand', () => {
  it('staat intrekken alleen toe zolang de status `set` is', () => {
    // Dezelfde grens als `commitments_update`. Een straf die afgegaan is, kun je
    // niet wegpoetsen; anders is een commitment device geen commitment device.
    expect(isOpenstaand(commitment('penalty', 'set'))).toBe(true);
    expect(isOpenstaand(commitment('penalty', 'due'))).toBe(false);
    expect(isOpenstaand(commitment('reward', 'unlocked'))).toBe(false);
  });
});

/**
 * De clientkant van de derde grens van migratie 0170 — QS8-293.
 *
 * ⚠️ **Wat hier getoetst wordt is niet "de kaart verdwijnt" maar "de client
 *    biedt niets aan wat de database weigert".** Dat is de belofte; het scherm
 *    is maar één plek waar hij waargemaakt wordt. Vandaar dat de grens een
 *    functie is en niet een `<` in de JSX (regel 18 vraag 4).
 *
 * ⚠️ De grens in de database is `target_date >= mijn_datum()`. Staat hier `>`,
 *    dan verbergt het scherm het formulier op een dag waarop de database de
 *    straf gewoon zou aannemen — een client die strénger is dan de server, en
 *    dat is precies de kant die CLAUDE.md verbiedt bij dit paar regels.
 */
describe('magStrafVastleggen — dezelfde grens als `commitments_insert`', () => {
  it('mag op een doel dat in de toekomst afloopt', () => {
    expect(magStrafVastleggen('2026-09-30', '2026-09-06')).toBe(true);
  });

  it('mag nog op de dag zelf, want de database zegt `>=`', () => {
    expect(magStrafVastleggen('2026-09-06', '2026-09-06')).toBe(true);
  });

  it('mag niet meer zodra de streefdatum voorbij is', () => {
    expect(magStrafVastleggen('2026-09-05', '2026-09-06')).toBe(false);
  });

  it('mag zolang het scherm nog niet weet welke dag het is', () => {
    // ⚠️ Het profiel bepaalt de tijdzone en is dan nog aan het laden. De
    //    database weigert alsnog; een kaart die van "kan niet" naar "kan wel"
    //    springt zodra een lading binnenkomt, is de slechtere van de twee.
    expect(magStrafVastleggen('2020-01-01', null)).toBe(true);
  });
});
