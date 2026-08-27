import { describe, expect, it } from 'vitest';

import { isFout, vergelijkFuncties } from '../../scripts/functies-vergelijk.mjs';

/**
 * Bouwen de migraties nog wat er draait? — de vergelijking, geijkt.
 *
 * ⚠️ **Deze test bestaat omdat de controle zelf twee databases nodig heeft.** Er
 *    is geen manier om te zien wat hij wél vindt zonder er twee op te tuigen, en
 *    een controle die je niet kunt voeden kun je niet ijken (CLAUDE.md, bij regel
 *    18). Vandaar dat de vergelijking in een eigen module staat en hier élk geval
 *    los krijgt aangeboden.
 *
 * ⚠️ **Het onderscheid dat deze controle draagt is het hele punt.** Verschilt de
 *    genormaliseerde vingerafdruk, dan lopen de lógica's uiteen en is dat een
 *    fout: de bestanden bouwen niet meer wat er draait. Verschilt alleen de ruwe,
 *    dan is het commentaar of opmaak — echt, en het hoort opgeruimd, maar het mag
 *    niets tegenhouden. Een controle die die twee op één hoop gooit, is er een
 *    die je leert negeren.
 *
 * ⚠️ Tweezijdig geijkt: bij elk geval dat gemeld moet worden staat het geval dat
 *    met rust gelaten hoort te worden.
 */

const gelijk = { naam: 'archiveer_groep', kaal: 'k1', ruw: 'r1' };

describe('vergelijkFuncties', () => {
  it('zwijgt als beide kanten hetzelfde zeggen', () => {
    const uit = vergelijkFuncties([gelijk], [gelijk]);

    expect(uit).toEqual({ logica: [], commentaar: [], alleenProductie: [], alleenLokaal: [] });
    expect(isFout(uit)).toBe(false);
  });

  it('meldt een logicaverschil, en dat is een fout', () => {
    const uit = vergelijkFuncties([{ ...gelijk, kaal: 'anders', ruw: 'anders' }], [gelijk]);

    expect(uit.logica).toEqual(['archiveer_groep']);
    expect(uit.commentaar).toEqual([]);
    expect(isFout(uit)).toBe(true);
  });

  it('meldt een commentaarverschil apart, en dat is géén fout', () => {
    // ⚠️ Dit is het geval van 27-08-2026: dezelfde logica, een ingekorte body.
    //    Zou dit als logicaverschil tellen, dan is elke migratie die via
    //    apply_migration landt meteen rood en wordt de controle genegeerd.
    const uit = vergelijkFuncties([{ ...gelijk, ruw: 'zonder-commentaar' }], [gelijk]);

    expect(uit.commentaar).toEqual(['archiveer_groep']);
    expect(uit.logica).toEqual([]);
    expect(isFout(uit)).toBe(false);
  });

  it('telt een functie nooit twee keer', () => {
    // Een logicaverschil impliceert een ruw verschil; hij hoort in één lijst.
    const uit = vergelijkFuncties([{ ...gelijk, kaal: 'anders', ruw: 'ook-anders' }], [gelijk]);

    expect(uit.logica).toEqual(['archiveer_groep']);
    expect(uit.commentaar).toEqual([]);
  });

  it('houdt de twee kanten van "ontbreekt" uit elkaar', () => {
    // ⚠️ Twee verschillende problemen: alleen op productie is een functie die
    //    uit de migraties verdween zonder gedropt te worden; alleen lokaal is een
    //    migratie die nooit is toegepast. Op één hoop zegt de melding niet wat er
    //    moet gebeuren.
    const extraProd = { naam: 'oude_functie', kaal: 'k', ruw: 'r' };
    const extraLok = { naam: 'nieuwe_functie', kaal: 'k', ruw: 'r' };

    const uit = vergelijkFuncties([gelijk, extraProd], [gelijk, extraLok]);

    expect(uit.alleenProductie).toEqual(['oude_functie']);
    expect(uit.alleenLokaal).toEqual(['nieuwe_functie']);
    expect(isFout(uit)).toBe(true);
  });

  it('sorteert elke lijst, zodat twee runs dezelfde melding geven', () => {
    const uit = vergelijkFuncties(
      [
        { naam: 'zet_doelstatus', kaal: 'x', ruw: 'x' },
        { naam: 'archiveer_groep', kaal: 'x', ruw: 'x' },
      ],
      [
        { naam: 'zet_doelstatus', kaal: 'y', ruw: 'y' },
        { naam: 'archiveer_groep', kaal: 'y', ruw: 'y' },
      ],
    );

    expect(uit.logica).toEqual(['archiveer_groep', 'zet_doelstatus']);
  });

  it('doet niets bij twee lege lijsten', () => {
    // De omgeving waarin niets gemeten is, hoort geen groen vinkje te geven én
    // geen valse melding. Het script zelf stopt eerder als er geen bron is.
    expect(isFout(vergelijkFuncties([], []))).toBe(false);
  });
});
