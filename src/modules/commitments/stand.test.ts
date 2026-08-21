import { describe, expect, it } from 'vitest';

import type { Commitment } from './api';
import { isAfgegaan, isOpenstaand, STATUS_TEKST, tekstVoor } from './stand';

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

describe('STATUS_TEKST', () => {
  it('heeft een tekst voor elke stand die een commitment echt kan hebben', () => {
    // `reward:due` en `reward:resolved` staan er bewust niet bij: een beloning
    // wordt nooit verschuldigd. Zou dat ooit veranderen, dan hoort deze lijst
    // mee te veranderen.
    for (const sleutel of [
      'reward:set',
      'reward:unlocked',
      'reward:cancelled',
      'penalty:set',
      'penalty:due',
      'penalty:resolved',
      'penalty:cancelled',
    ]) {
      expect(STATUS_TEKST[sleutel], sleutel).toBeDefined();
    }
  });

  it('verwijt niets en roept niets uit', () => {
    // Geen uitroeptekens, en geen woord dat iemand aankijkt op wat hij niet
    // gehaald heeft. De gebruiker heeft dit zichzelf opgelegd.
    const verboden = /helaas|jammer|mislukt|gefaald|niet gelukt|sorry|!/i;

    for (const [sleutel, tekst] of Object.entries(STATUS_TEKST)) {
      expect(tekst.uitleg, sleutel).not.toMatch(verboden);
      expect(tekst.titel, sleutel).not.toMatch(verboden);
      expect(tekst.uitleg.length, sleutel).toBeGreaterThan(20);
    }
  });

  it('zegt bij een ingestelde straf dat een gemiste week er niets aan doet', () => {
    // Domeinregel 11, en de meest waarschijnlijke misvatting die iemand heeft
    // op het moment dat hij een straf instelt.
    expect(STATUS_TEKST['penalty:set']?.uitleg).toContain('week');
  });

  it('zegt bij een verschuldigde straf wie hem nu kan lezen', () => {
    // Dit is het moment waarop de inhoud van privé naar de groep gaat. Dat mag
    // iemand niet hoeven afleiden.
    expect(STATUS_TEKST['penalty:due']?.uitleg).toContain('groep');
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
