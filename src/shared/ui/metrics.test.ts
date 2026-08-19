import { describe, expect, it } from 'vitest';

import {
  FLOOR_MARK,
  kettingLabel,
  kettingVulling,
  milestoneProgress,
  rangeState,
  streakLabel,
  weekpasLabel,
  weekpasReddeDezeCyclus,
  weekpasVoortgang,
  WEEKPAS_UITLEG,
  type WeekpasStand,
  type WeeklyGoalStatus,
} from './metrics';

const owner = { viewer: 'owner' } as const;
const group = { viewer: 'group' } as const;

describe('rangeState — wat de groep te zien krijgt', () => {
  // Dit is de belangrijkste test in dit bestand. Domeinregel 7 is niet "we
  // proberen aardig te zijn" maar de reden dat de app in groepen van drie
  // overleeft.
  const tegenslag: WeeklyGoalStatus[] = ['todo', 'missed', 'carried', 'excused'];

  it.each(tegenslag)('verbergt status %s volledig voor de groep', (status) => {
    const state = rangeState({ status, achieved: 'none', hasFloor: true, ...group });

    expect(state.hidden).toBe(true);
    expect(state.label).toBe('');
    expect(state.fill).toBe(0);
  });

  it('toont een goedgekeurde week wél aan de groep', () => {
    const state = rangeState({
      status: 'approved',
      achieved: 'ceiling',
      hasFloor: true,
      ...group,
    });

    expect(state.hidden).toBe(false);
    expect(state.tone).toBe('progress');
    expect(state.fill).toBe(1);
  });

  it('toont een week die op goedkeuring wacht aan de groep — daar moeten ze juist iets mee', () => {
    const state = rangeState({ status: 'pending', achieved: 'floor', hasFloor: true, ...group });

    expect(state.hidden).toBe(false);
    expect(state.awaitingApproval).toBe(true);
  });

  it('geeft nooit de rode rol terug, voor geen enkele status', () => {
    // Rood is in dit stelsel uitsluitend deadline-risico. Een gemiste week
    // rood maken is de schaamteprikkel die groepen opblaast.
    const alle: WeeklyGoalStatus[] = [
      'todo',
      'pending',
      'approved',
      'missed',
      'carried',
      'excused',
    ];

    for (const status of alle) {
      for (const viewer of ['owner', 'group'] as const) {
        const state = rangeState({ status, achieved: 'none', hasFloor: false, viewer });
        expect(['progress', 'pending', 'neutral']).toContain(state.tone);
      }
    }
  });
});

describe('rangeState — wat de eigenaar ziet', () => {
  it('noemt een gemiste week zakelijk, niet bestraffend', () => {
    const state = rangeState({ status: 'missed', achieved: 'none', hasFloor: true, ...owner });

    expect(state.hidden).toBe(false);
    expect(state.label).toBe('Niet afgerond');
    expect(state.tone).toBe('neutral');
  });

  it('vult tot de vloermarkering bij een gehaalde vloer', () => {
    const state = rangeState({ status: 'approved', achieved: 'floor', hasFloor: true, ...owner });

    expect(state.fill).toBe(FLOOR_MARK);
    expect(state.label).toBe('Vloer gehaald');
  });

  it('vult helemaal als er geen vloer is — dan zijn er maar twee uitkomsten', () => {
    const state = rangeState({ status: 'approved', achieved: 'floor', hasFloor: false, ...owner });

    expect(state.fill).toBe(1);
    expect(state.label).toBe('Gehaald');
  });

  it('zegt erbij dat er op een buddy gewacht wordt', () => {
    const state = rangeState({ status: 'pending', achieved: 'ceiling', hasFloor: true, ...owner });

    expect(state.label).toContain('wacht op je buddy');
    expect(state.awaitingApproval).toBe(true);
  });

  it('behandelt een adempauze als neutraal, niet als verlies', () => {
    const state = rangeState({ status: 'excused', achieved: 'none', hasFloor: true, ...owner });

    expect(state.label).toBe('Adempauze');
    expect(state.tone).toBe('neutral');
  });
});

describe('milestoneProgress', () => {
  it('rekent mijlpalen om naar een deel van 1', () => {
    expect(milestoneProgress(3, 12)).toBe(0.25);
  });

  it('geeft 0 als er nog geen mijlpalen zijn — niet NaN', () => {
    expect(milestoneProgress(0, 0)).toBe(0);
  });

  it('kan niet boven 1 of onder 0 uitkomen', () => {
    expect(milestoneProgress(15, 12)).toBe(1);
    expect(milestoneProgress(-3, 12)).toBe(0);
  });
});

describe('streakLabel', () => {
  it('telt in weken, niet in dagen', () => {
    expect(streakLabel(1)).toBe('1 week op rij');
    expect(streakLabel(7)).toBe('7 weken op rij');
  });

  it('maakt van nul geen "0 weken op rij"', () => {
    expect(streakLabel(0)).toBe('Nog geen reeks');
  });
});

// ---------------------------------------------------------------------------
// De Ketting — QS8-80
// ---------------------------------------------------------------------------

describe('kettingLabel', () => {
  it('zegt bij nul schakels dat de week begonnen is, niet dat niemand iets deed', () => {
    // ⚠️ Dit is het verschil tussen een teller en een verwijt. Nul schakels op
    //    maandagochtend is de normale toestand van elke groep.
    expect(kettingLabel({ schakels: 0, inAanmerking: 3, voltallig: false })).toBe(
      'De week is net begonnen',
    );
  });

  it('noemt wat er is en nooit wat er mist', () => {
    const tekst = kettingLabel({ schakels: 1, inAanmerking: 3, voltallig: false });

    expect(tekst).toBe('1 schakel deze week');
    // Geen "van 3", geen "nog 2 te gaan": dat is dezelfde mededeling over
    // andermans week met een vriendelijker gezicht (domeinregel 7).
    expect(tekst).not.toMatch(/van 3|nog \d|te gaan|mist/i);
  });

  it('viert voltallig, en in een groep van één zonder grootspraak', () => {
    expect(kettingLabel({ schakels: 3, inAanmerking: 3, voltallig: true })).toBe(
      'Voltallig — de ketting is rond',
    );
    expect(kettingLabel({ schakels: 1, inAanmerking: 1, voltallig: true })).toBe(
      'Je schakel ligt er',
    );
  });

  it('houdt een lege groep uit de teller', () => {
    expect(kettingLabel({ schakels: 0, inAanmerking: 0, voltallig: true })).toBe(
      'Nog niemand doet mee',
    );
  });
});

describe('kettingVulling', () => {
  it('loopt van leeg naar vol', () => {
    expect(kettingVulling({ schakels: 0, inAanmerking: 4, voltallig: false })).toBe(0);
    expect(kettingVulling({ schakels: 2, inAanmerking: 4, voltallig: false })).toBe(0.5);
    expect(kettingVulling({ schakels: 4, inAanmerking: 4, voltallig: true })).toBe(1);
  });

  it('geeft nul bij een lege noemer in plaats van vol', () => {
    // ⚠️ "Voltallig" zonder deelnemers is een deling door nul, geen prestatie.
    expect(kettingVulling({ schakels: 0, inAanmerking: 0, voltallig: true })).toBe(0);
  });

  it('blijft binnen 0…1 als de database iets raars teruggeeft', () => {
    expect(kettingVulling({ schakels: 9, inAanmerking: 3, voltallig: true })).toBe(1);
    expect(kettingVulling({ schakels: -2, inAanmerking: 3, voltallig: false })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Weekpassen — QS8-81
// ---------------------------------------------------------------------------

function stand(over: Partial<WeekpasStand> = {}): WeekpasStand {
  return {
    voorraad: 0,
    maximum: 2,
    voltooideCycli: 0,
    totVolgende: 1,
    laatstVerbruikt: null,
    ...over,
  };
}

describe('weekpasLabel', () => {
  it('noemt nul geen tekort', () => {
    // ⚠️ "Geen weekpassen" leest als iets wat je kwijt bent. Je hebt hem nog
    //    niet verdiend, en dat is een ander gevoel.
    expect(weekpasLabel(stand({ voorraad: 0 }))).toBe('Nog geen weekpas');
  });

  it('zet de voorraad tegen de bovengrens', () => {
    // ⚠️ "1 weekpas klaar" zei niet hoeveel er passen; twee grijze balkjes
    //    ernaast zeiden dat wél, maar alleen als je ze telde.
    expect(weekpasLabel(stand({ voorraad: 1, maximum: 2 }))).toBe('1 weekpas van 2');
    expect(weekpasLabel(stand({ voorraad: 2, maximum: 2 }))).toBe('2 weekpassen van 2');
  });
});

describe('WEEKPAS_UITLEG', () => {
  // Dit is de belangrijkste test van dit blok. Domeinregel 10 zegt dat een
  // weekpas de réeks beschermt en niet het punt; snapt de gebruiker dat niet,
  // dan leest een terecht minpunt als een storing.
  it('zegt dat de pas de reeks redt en niet het punt', () => {
    expect(WEEKPAS_UITLEG).toMatch(/reeks/i);
    expect(WEEKPAS_UITLEG).toMatch(/punt/i);
  });

  it('zegt dat je zelf niets hoeft te doen', () => {
    // Zonder deze zin gaat de gebruiker zoeken naar een knop "pas inzetten",
    // en die bestaat niet — inzetten kan alleen de rollover.
    expect(WEEKPAS_UITLEG).toMatch(/niets te doen|automatisch/i);
  });

  it('zegt dat passen per doel gelden', () => {
    // Bij drie doelen staan er drie verschillende standen naast elkaar, en
    // zonder deze zin ziet dat eruit als een fout.
    expect(WEEKPAS_UITLEG).toMatch(/per doel/i);
  });
});

describe('weekpasVoortgang', () => {
  it('meldt een volle voorraad in plaats van een volgende pas', () => {
    const tekst = weekpasVoortgang(stand({ voorraad: 2, maximum: 2 }));

    expect(tekst).not.toMatch(/Nog \d+ voltooide weken/);
    // ⚠️ En zegt dat een extra pas níét verloren gaat maar vrijkomt — sinds
    //    migratie 0042 is het recht onbegrensd en alleen de voorraad niet.
    expect(tekst).toMatch(/vrij/i);
    expect(tekst).not.toMatch(/vervalt/i);
  });

  it('telt af in hele weken, enkelvoud en meervoud', () => {
    expect(weekpasVoortgang(stand({ voorraad: 1, totVolgende: 1 }))).toMatch(
      /Nog één voltooide week/,
    );
    expect(weekpasVoortgang(stand({ voorraad: 1, totVolgende: 4 }))).toMatch(
      /Nog 4 voltooide weken/,
    );
  });

  it('noemt de eerste pas een eerste, niet een volgende', () => {
    expect(weekpasVoortgang(stand({ voorraad: 0, totVolgende: 1 }))).toMatch(/eerste weekpas/);
  });
});

describe('weekpasReddeDezeCyclus', () => {
  it('herkent de cyclus die zojuist gered is', () => {
    expect(
      weekpasReddeDezeCyclus(stand({ laatstVerbruikt: '2026-08-10' }), '2026-08-10'),
    ).toBe(true);
  });

  it('meldt niets over een oudere geredde cyclus', () => {
    // ⚠️ Anders blijft de melding "een weekpas heeft je reeks gered" wekenlang
    //    staan, en dan is het geen melding maar een verwijt.
    expect(
      weekpasReddeDezeCyclus(stand({ laatstVerbruikt: '2026-07-06' }), '2026-08-10'),
    ).toBe(false);
  });

  it('meldt niets als er nooit een pas verbruikt is', () => {
    expect(weekpasReddeDezeCyclus(stand(), '2026-08-10')).toBe(false);
  });

  it('meldt niets zolang de cyclus onbekend is', () => {
    // Het profiel is nog niet geladen: dan liever geen melding dan een
    // verkeerde.
    expect(weekpasReddeDezeCyclus(stand({ laatstVerbruikt: '2026-08-10' }), null)).toBe(false);
  });
});
