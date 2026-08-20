import { describe, expect, it } from 'vitest';

import {
  risicoLabel,
  risicoTeken,
  risicoToon,
  risicoUitleg,
  type RisicoStand,
} from './risico';

const ALLE: readonly RisicoStand[] = ['on_track', 'at_risk', 'behind', 'unreachable'];

describe('de vier standen', () => {
  it('heeft er precies vier, allemaal met een eigen label', () => {
    const labels = new Set(ALLE.map(risicoLabel));
    expect(labels.size).toBe(4);
  });

  /**
   * ⚠️ QS8-94, criterium 2: vorm én kleur dragen de betekenis. Ongeveer één op
   *    de twaalf mannen ziet rood en groen niet uit elkaar; met alleen kleur is
   *    "op koers" dan niet te onderscheiden van "deadline onhaalbaar", en dat
   *    zijn net de twee die het verst uit elkaar liggen.
   */
  it('geeft elke stand een eigen vormteken, niet alleen een kleur', () => {
    const tekens = new Set(ALLE.map(risicoTeken));
    expect(tekens.size).toBe(4);
  });

  /**
   * ⚠️ Rood is in dit stelsel uitsluitend voor deadline-risico en nooit voor een
   *    gemiste week (domeinregel 7, vastgelegd bij de kleur zelf in tokens.ts).
   *    Alleen de zwaarste stand mag hem hebben.
   */
  it('gebruikt de rode rol alleen bij een onhaalbare deadline', () => {
    const metRood = ALLE.filter((s) => risicoToon(s) === 'atRisk');
    expect(metRood).toEqual(['unreachable']);
  });

  it('geeft op koers de voortgangskleur', () => {
    expect(risicoToon('on_track')).toBe('progress');
  });
});

describe('risicoUitleg', () => {
  /**
   * Acceptatiecriterium 4 van QS8-93: een nieuw doel zonder geschiedenis staat
   * op "op koers" — en de uitleg hoort dát te zeggen, niet een berekening met
   * gaten erin te tonen.
   */
  it('legt bij een nieuw doel uit dat er nog niets af te leiden valt', () => {
    const tekst = risicoUitleg('on_track', {
      weken_over: 20,
      open_mijlpalen: 5,
      cycli_bekeken: 0,
      cycli_gehaald: 0,
      tempo: null,
      benodigd_tempo: 0.25,
      vloeraandeel: null,
    });

    expect(tekst).toContain('Nog geen geschiedenis');
    expect(tekst).not.toContain('NaN');
    expect(tekst).not.toContain('null');
  });

  it('overleeft een lege onderbouwing zonder NaN of null in de tekst', () => {
    // Gebeurt echt: bij een gearchiveerd doel schrijft de database alleen
    // `{ reden: 'niet_actief' }`, en een oude rij kan velden missen.
    for (const stand of ALLE) {
      for (const reden of [null, {}]) {
        const tekst = risicoUitleg(stand, reden);
        expect(tekst.length, `${stand} met ${JSON.stringify(reden)}`).toBeGreaterThan(20);
        expect(tekst, stand).not.toContain('NaN');
        expect(tekst, stand).not.toContain('null');
        expect(tekst, stand).not.toContain('undefined');
      }
    }
  });

  it('noemt bij een onhaalbare deadline het werk en de tijd', () => {
    const tekst = risicoUitleg('unreachable', { weken_over: 3, open_mijlpalen: 9 });
    expect(tekst).toContain('9');
    expect(tekst).toContain('3');
  });

  it('zegt bij een verstreken streefdatum dat de datum er is', () => {
    const tekst = risicoUitleg('unreachable', { weken_over: 0, open_mijlpalen: 2 });
    expect(tekst).toContain('streefdatum is er');
  });

  /**
   * ⚠️ De toon. "Je hebt drie van de vier weken gemist" is waar, en het is
   *    precies de zin die iemand de app laat sluiten. Dit scherm is privé, maar
   *    domeinregel 7 gaat ook over toon: we tellen wat er wél is.
   */
  it('telt gehaalde weken en niet gemiste weken', () => {
    const tekst = risicoUitleg('behind', {
      weken_over: 20,
      open_mijlpalen: 8,
      cycli_bekeken: 4,
      cycli_gehaald: 1,
      tempo: 0.25,
      benodigd_tempo: 0.4,
    });

    expect(tekst).toContain('haalde 1');
    expect(tekst.toLowerCase()).not.toContain('gemist');
  });

  it('benoemt de vloer als die het signaal is', () => {
    const tekst = risicoUitleg('at_risk', {
      weken_over: 10,
      open_mijlpalen: 2,
      cycli_bekeken: 4,
      cycli_gehaald: 4,
      tempo: 1,
      benodigd_tempo: 0.2,
      vloeraandeel: 1,
    });

    expect(tekst).toContain('vloer');
    // ⚠️ En hij zegt erbij dat het meetelt. De vloer halen betekent dat de week
    //    telt (domeinregel 8); een waarschuwing die dat weglaat, leert de
    //    gebruiker dat de vloer niet goed genoeg is.
    expect(tekst).toContain('telt volledig mee');
  });

  it('gebruikt een komma als decimaalteken', () => {
    const tekst = risicoUitleg('at_risk', {
      weken_over: 10,
      open_mijlpalen: 5,
      cycli_bekeken: 4,
      cycli_gehaald: 2,
      tempo: 0.5,
      benodigd_tempo: 0.5,
      vloeraandeel: 0,
    });

    expect(tekst).toContain('0,5');
  });
});
