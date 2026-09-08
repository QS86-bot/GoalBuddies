import { describe, expect, it } from 'vitest';

import { bouwRapport, isFout, vergelijkFuncties } from '../../scripts/functies-vergelijk.mjs';

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


/**
 * De vólgorde van het rapport — QS8-220.
 *
 * ⚠️⚠️ **Dit blok bestaat omdat de commentaarmelding onbereikbaar was.** Hij
 *    stond in `functies-controle.mjs` ná `process.exit(1)`, dus zodra er óók een
 *    logicaverschil was, werd hij nooit afgedrukt — terwijl `vergelijkFuncties()`
 *    hem al die tijd wél teruggaf.
 *
 *    📏 En dat is precies de toestand van vandaag: productie staat op migratie
 *    0186 en de map op 0213, dus 75 functies verschillen van logica en 48 staan
 *    alleen lokaal. De 21 functies die op productie hun commentaar kwijt zijn —
 *    waaronder `domeinregel3_bewaking`, `onveranderlijkheid_bewaking` en
 *    `is_pushdienst` — kwamen er dus niet uit. De controle die dit issue moest
 *    vinden, kon het niet melden.
 *
 * ⚠️ Regel 18 vraag 3 op een script: de melding stond er, was juist, en werd
 *    nooit bereikt. Een test op `vergelijkFuncties()` alleen bleef daar groen bij,
 *    want die functie deed niets fout.
 *
 * IJKING — met de hand gedraaid op 08-09-2026:
 *
 *   A  het commentaarblok uit `bouwRapport()` halen (de vorm van vóór deze branch)
 *      → 4 rood
 *   B  het commentaarblok ná de foutblokken zetten
 *      → 1 rood: 'zet de melding vóór de fouten'
 */
describe('bouwRapport — de melding gaat niet verloren achter een fout', () => {
  const uitslag = {
    logica: ['group_overview'],
    commentaar: ['domeinregel3_bewaking', 'is_pushdienst'],
    alleenProductie: ['oude_functie'],
    alleenLokaal: ['nieuwe_functie'],
  };

  it('noemt de commentaarfuncties óók als er een logicaverschil is', () => {
    const namen = bouwRapport(uitslag).flatMap((b: { namen: string[] }) => b.namen);

    expect(namen, 'de commentaarmelding hoort niet weg te vallen').toContain(
      'domeinregel3_bewaking',
    );
    expect(namen).toContain('is_pushdienst');
  });

  it('zet de melding vóór de fouten, want een lezer kapt af bij de eerste fout', () => {
    const soorten = bouwRapport(uitslag).map((b: { soort: string }) => b.soort);

    expect(soorten[0], 'de melding staat bovenaan').toBe('melding');
    expect(soorten.slice(1).every((s: string) => s === 'fout')).toBe(true);
  });

  it('houdt de vier categorieën uit elkaar', () => {
    // ⚠️ Vier blokken en niet één lijst: "andere logica", "alleen op productie",
    //    "alleen lokaal" en "commentaar weg" zijn vier problemen met vier
    //    antwoorden. Ze samenvoegen is de controle leren negeren.
    expect(bouwRapport(uitslag)).toHaveLength(4);
  });

  it('zwijgt volledig als er niets aan de hand is', () => {
    expect(
      bouwRapport({ logica: [], commentaar: [], alleenProductie: [], alleenLokaal: [] }),
    ).toEqual([]);
  });

  it('meldt alleen het commentaar als dát het enige verschil is', () => {
    const alleen = bouwRapport({
      logica: [],
      commentaar: ['is_pushdienst'],
      alleenProductie: [],
      alleenLokaal: [],
    });

    expect(alleen).toHaveLength(1);
    expect(alleen[0]?.soort).toBe('melding');
  });
});
