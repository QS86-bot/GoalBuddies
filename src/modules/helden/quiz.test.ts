import { describe, expect, it } from 'vitest';

import { en } from '../../shared/i18n/en';
import { nl } from '../../shared/i18n/nl';

import { HELDSLEUTELS } from './helden';

import {
  GEEN_HELDANTWOORDEN,
  heldkeuze,
  heldoptieTekstSleutel,
  heldScores,
  HELDVRAAGOPTIES,
  HELDVRAGEN,
  heldvraagTekstSleutel,
  teBewarenHeld,
  koplopers,
  type Heldantwoorden,
} from './quiz';

/**
 * QS8-474, epic QS8-468.
 *
 * ⚠️⚠️ **De belofte van dit issue is "alle gedeelde koplopers", niet "de
 *    scoring telt goed op".** Dat tweede is een eigenschap van het onderdeel en
 *    blijft groen terwijl de belofte breekt: een `koplopers()` die netjes telt
 *    en daarna `[0]` teruggeeft, haalt elke reken­toets en toont één kaart waar
 *    er vier horen. Acceptatiecriterium 5 zegt daarom met zoveel woorden dat er
 *    een test op de vier-weg-uitslag hoort. Dat is de eerste hieronder, en de
 *    rest staat eromheen.
 */

/** 1-1-1-1 over vier verschillende helden — een normale uitslag, geen randgeval. */
const VIER_WEG_GELIJK: Heldantwoorden = {
  aantrekking: 'meridian',
  tegenslag: 'quip',
  motivatie: 'forge',
  viering: 'lucerna',
};

describe('gelijkspel is de normale uitslag en niet het randgeval', () => {
  it('geeft bij vier gelijke koplopers vier helden terug, niet twee', () => {
    // ⚠️ De lijst staat hier voluit en niet als `toHaveLength(4)`. Een
    //    ondergrens of een telling laat "de top 2" — precies wat besluit 7
    //    verving — er alsnog doorheen zodra iemand er twee afsnijdt.
    expect(koplopers(VIER_WEG_GELIJK)).toEqual(['meridian', 'forge', 'lucerna', 'quip']);
  });

  it('geeft ze in roostervolgorde en niet in klikvolgorde', () => {
    // ⚠️ Dezelfde uitslag, andere invoervolgorde. Zonder deze toets ziet
    //    dezelfde uitslag er twee keer anders uit en leest het scherm als een
    //    lijst die per keer sorteert.
    const andersom: Heldantwoorden = {
      viering: 'lucerna',
      motivatie: 'forge',
      tegenslag: 'quip',
      aantrekking: 'meridian',
    };

    expect(koplopers(andersom)).toEqual(koplopers(VIER_WEG_GELIJK));
    expect(koplopers(andersom)).toEqual(['meridian', 'forge', 'lucerna', 'quip']);
  });

  it('geeft er twee bij een twee-weg-gelijkspel', () => {
    const tweeWeg: Heldantwoorden = {
      aantrekking: 'strix',
      tegenslag: 'strix',
      motivatie: 'quip',
      viering: 'quip',
    };

    expect(koplopers(tweeWeg)).toEqual(['strix', 'quip']);
  });

  it('geeft er één bij een duidelijke winnaar — en dan nog steeds als lijst', () => {
    const duidelijk: Heldantwoorden = {
      aantrekking: 'forge',
      tegenslag: 'forge',
      motivatie: 'forge',
      viering: 'strix',
    };

    // ⚠️ `toEqual([...])` en niet `toBe('forge')`. Een aanroeper die hier ooit
    //    een kale held terugkrijgt, is een aanroeper die zelf gaat raden.
    expect(koplopers(duidelijk)).toEqual(['forge']);
  });

  it('kent nergens een bovengrens op het aantal koplopers', () => {
    // ⚠️ Met vier vragen zijn er hoogstens vier koplopers, dus een vijfde en
    //    zesde zijn vandaag niet te voeden. Wat wél te toetsen is, is dat er
    //    nergens een getal staat dat er ooit twee afsnijdt: `koplopers()` leest
    //    alleen `HELDSLEUTELS` en een maximum, en `heldScores()` draagt alle zes
    //    de sleutels. Zou iemand hier "de top 2" terugzetten, dan valt de toets
    //    hierboven om.
    expect(Object.keys(heldScores(GEEN_HELDANTWOORDEN))).toHaveLength(HELDSLEUTELS.length);
  });
});

describe('alles overslaan levert geen held en geen fout op', () => {
  it('geeft nul koplopers bij nul antwoorden', () => {
    // ⚠️ **Dit is de vroege uitgang in `koplopers()` en geen gevolg van de
    //    rekensom.** Zonder hem staan alle zes op nul, is het maximum nul, en
    //    zijn "alle helden met de hoogste score" letterlijk alle zes — zes
    //    kaarten voor iemand die net gezegd heeft dat hij dit niet wilde
    //    invullen. Acceptatiecriterium 3.
    expect(koplopers(GEEN_HELDANTWOORDEN)).toEqual([]);
  });

  it('telt gewoon door als er één vraag beantwoord is en drie overgeslagen', () => {
    expect(koplopers({ tegenslag: 'lucerna' })).toEqual(['lucerna']);
  });

  it('zet elke held op nul in de scores, ook de niet-gekozen', () => {
    const scores = heldScores({ viering: 'quip' });

    expect(scores.quip).toBe(1);
    for (const sleutel of HELDSLEUTELS.filter((s) => s !== 'quip')) {
      expect(scores[sleutel], sleutel).toBe(0);
    }
  });
});

/**
 * ⚠️ **Een held die uit één vraag wegvalt, scoort structureel lager en niemand
 *    ziet dat aan de uitslag.** Vandaar dat dit in beide richtingen toetst: elke
 *    vraag noemt alle zes, en noemt er geen twee keer.
 */
describe('een keuze bij gelijkspel telt alleen zolang hij koploper is', () => {
  it('houdt de keuze vast zolang hij bij de koplopers hoort', () => {
    const keuze = heldkeuze(VIER_WEG_GELIJK, 'lucerna');

    expect(keuze).toEqual({
      soort: 'gelijkspel',
      koplopers: ['meridian', 'forge', 'lucerna', 'quip'],
      gekozen: 'lucerna',
    });
    expect(teBewarenHeld(keuze)).toEqual({ held: 'lucerna', bron: 'keuze' });
  });

  it('laat de keuze vallen zodra de antwoorden hem geen koploper meer maken', () => {
    // ⚠️ **Dit is het geval dat een scherm stilzwijgend fout doet.** De
    //    gebruiker krijgt een gelijkspel, kiest Lucerna, gaat terug om een vraag
    //    te wijzigen, en nu wint Strix alleen. Zou de keuze blijven staan, dan
    //    bewaart de app een held die zijn eigen antwoorden tegenspreken — en hij
    //    ziet dat niet, want hij kijkt naar de vraag die hij net wijzigde.
    const naWijziging: Heldantwoorden = {
      aantrekking: 'strix',
      tegenslag: 'strix',
      motivatie: 'strix',
      viering: 'lucerna',
    };

    expect(heldkeuze(naWijziging, 'lucerna')).toEqual({ soort: 'quiz', held: 'strix' });
  });

  it('noemt de bron `quiz` bij één koploper, ook na een eerdere keuze', () => {
    // ⚠️ Er valt dan niets te kiezen, dus `keuze` zou liegen over hoe de held
    //    tot stand kwam — en `source` in `hero_profiles` is juist de kolom die
    //    dat onderscheid moet dragen.
    const keuze = heldkeuze({ aantrekking: 'forge' }, 'quip');

    expect(keuze).toEqual({ soort: 'quiz', held: 'forge' });
    expect(teBewarenHeld(keuze)).toEqual({ held: 'forge', bron: 'quiz' });
  });

  it('bewaart niets bij een onbeslist gelijkspel', () => {
    // ⚠️ Geen fout en geen doodlopende weg: "Bewaren" slaat de vragenlijst op en
    //    laat de held leeg, net als bij overslaan.
    expect(teBewarenHeld(heldkeuze(VIER_WEG_GELIJK, null))).toBeNull();
  });

  it('bewaart niets als er geen antwoorden zijn', () => {
    expect(heldkeuze(GEEN_HELDANTWOORDEN, null)).toEqual({ soort: 'geen' });
    expect(teBewarenHeld({ soort: 'geen' })).toBeNull();
  });
});

describe('elke vraag biedt alle zes de helden precies één keer aan', () => {
  it('heeft vier vragen met elk zes opties', () => {
    expect(HELDVRAGEN).toHaveLength(4);
    for (const vraag of HELDVRAGEN) {
      expect(HELDVRAAGOPTIES[vraag], vraag).toHaveLength(HELDSLEUTELS.length);
    }
  });

  it('noemt in elke vraag elke held precies één keer', () => {
    for (const vraag of HELDVRAGEN) {
      const opties = HELDVRAAGOPTIES[vraag];
      expect([...opties].sort(), vraag).toEqual([...HELDSLEUTELS].sort());
    }
  });

  it('zet niet in elke vraag dezelfde held vooraan', () => {
    // ⚠️ Het brondocument geeft elke vraag een andere volgorde. Zou hier overal
    //    dezelfde staan, dan ligt positie 1 vier keer bij dezelfde held en
    //    stuurt een positie-effect de uitslag zonder dat iemand dat besloot.
    const eersten = new Set(HELDVRAGEN.map((v) => HELDVRAAGOPTIES[v][0]));
    expect(eersten.size).toBeGreaterThan(1);
  });
});

describe('elke afgeleide sleutel staat in beide catalogi', () => {
  const catalogi = [
    ['nl', nl],
    ['en', en],
  ] as const;

  it('kent vraag en toelichting van elke heldenvraag', () => {
    for (const [taal, catalogus] of catalogi) {
      for (const vraag of HELDVRAGEN) {
        for (const veld of ['vraag', 'toelichting'] as const) {
          const s = heldvraagTekstSleutel(vraag, veld);
          expect(Object.keys(catalogus), `${taal}:${s}`).toContain(s);
        }
      }
    }
  });

  it('kent elke antwoordoptie van elke vraag', () => {
    for (const [taal, catalogus] of catalogi) {
      for (const vraag of HELDVRAGEN) {
        for (const held of HELDVRAAGOPTIES[vraag]) {
          const s = heldoptieTekstSleutel(vraag, held);
          expect(Object.keys(catalogus), `${taal}:${s}`).toContain(s);
        }
      }
    }
  });

  it('geeft elke optie een eigen tekst en niet vier keer dezelfde', () => {
    // ⚠️ Vier vragen maal zes opties zijn vierentwintig antwoorden, en geen
    //    ervan hoort woordelijk gelijk te zijn aan een ander: dan is er ergens
    //    geknipt en geplakt zonder de tekst aan te passen, en beantwoordt de
    //    gebruiker twee keer dezelfde vraag.
    const teksten = HELDVRAGEN.flatMap((v) =>
      HELDVRAAGOPTIES[v].map((h) => nl[heldoptieTekstSleutel(v, h)]),
    );

    expect(new Set(teksten).size).toBe(teksten.length);
  });
});
