import { afterEach, describe, expect, it } from 'vitest';

import { en } from './en';
import { nl } from './nl';
import {
  getal,
  STANDAARDTAAL,
  t,
  TALEN,
  taal,
  taalUitApparaat,
  weekdagNaam,
  zetTaal,
} from './index';

/**
 * QS8-113.
 *
 * ⚠️ De eerste test is de belangrijkste en de reden dat deze catalogus geen
 *    bibliotheek nodig heeft: hij wordt rood zodra een taal achterloopt. Zonder
 *    zo'n controle is een half vertaalde taal onzichtbaar tot een gebruiker hem
 *    aanzet en willekeurig twee talen door elkaar krijgt.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('de catalogi lopen gelijk', () => {
  it('heeft in elke taal exact dezelfde sleutels', () => {
    const nlSleutels = Object.keys(nl).sort();
    const enSleutels = Object.keys(en).sort();

    expect(enSleutels).toEqual(nlSleutels);
  });

  it('laat geen enkele tekst leeg', () => {
    for (const [taalcode, catalogus] of [
      ['nl', nl],
      ['en', en],
    ] as const) {
      for (const [sleutel, tekst] of Object.entries(catalogus)) {
        expect(tekst.trim(), `${taalcode}:${sleutel}`).not.toBe('');
      }
    }
  });

  it('gebruikt in elke taal dezelfde parameters', () => {
    // ⚠️ Dit is de fout die je in een vertaling niet ziet: {naam} wordt {name},
    //    de vervanging slaat over, en er staat letterlijk "{name} doet mee" op het
    //    scherm. Een vertaler die de taal wél spreekt en de code niet kent, maakt
    //    hem gegarandeerd een keer.
    const parameters = (tekst: string) =>
      (tekst.match(/\{(\w+)\}/g) ?? []).sort().join(',');

    for (const sleutel of Object.keys(nl) as (keyof typeof nl)[]) {
      expect(parameters(en[sleutel]), sleutel).toBe(parameters(nl[sleutel]));
    }
  });
});

describe('t()', () => {
  it('geeft de tekst in de ingestelde taal', () => {
    zetTaal('nl');
    expect(t('auth.knop.inloggen')).toBe('Inloggen');

    zetTaal('en');
    expect(t('auth.knop.inloggen')).toBe('Log in');
  });

  it('vult parameters in', () => {
    zetTaal('nl');
    expect(t('systeembericht.member_joined', { naam: 'Sanne' })).toBe('Sanne doet mee.');
  });

  it('vult twee parameters in de juiste rol in', () => {
    zetTaal('nl');
    expect(t('systeembericht.completion_approved', { naam: 'Sanne', actor: 'Tim' })).toBe(
      'Tim bevestigde de week van Sanne.',
    );
  });

  it('laat een ontbrekende parameter staan in plaats van "undefined" te tonen', () => {
    // Allebei fout, maar dit wijst naar de aanroeper in plaats van naar de
    // vertaling.
    expect(t('systeembericht.member_joined')).toBe('{naam} doet mee.');
  });
});

describe('de taal kiezen', () => {
  it('valt terug op de standaardtaal bij een onbekende code', () => {
    // Een profiel met een taalcode die deze versie van de app niet kent, hoort
    // een Nederlandse app te krijgen en geen wit scherm.
    expect(zetTaal('kl')).toBe(STANDAARDTAAL);
    expect(zetTaal(null)).toBe(STANDAARDTAAL);
    expect(zetTaal(undefined)).toBe(STANDAARDTAAL);
    expect(taal()).toBe(STANDAARDTAAL);
  });

  it('leest de taal van het apparaat, met of zonder regio', () => {
    expect(taalUitApparaat(['en-GB', 'nl-NL'])).toBe('en');
    expect(taalUitApparaat(['nl'])).toBe('nl');
    // Regiovarianten bestaan bewust niet; `pt-BR` is geen bekende taal en de
    // volgende voorkeur wint.
    expect(taalUitApparaat(['pt-BR', 'en-US'])).toBe('en');
  });

  it('valt terug op de standaardtaal als het apparaat niets bruikbaars aanbiedt', () => {
    expect(taalUitApparaat(['fr-FR', 'de-DE'])).toBe(STANDAARDTAAL);
    expect(taalUitApparaat([])).toBe(STANDAARDTAAL);
  });

  it('kent precies de talen van fase 1', () => {
    // Wordt rood zodra er een taal bij komt — met opzet, want dan moet er ook
    // een catalogus bij, en dan hoort iemand de aanspreekvorm vast te leggen.
    expect([...TALEN]).toEqual(['nl', 'en']);
  });
});

describe('opmaak die geen catalogus nodig heeft', () => {
  it('schrijft getallen met het decimaalteken van de taal', () => {
    zetTaal('nl');
    expect(getal(0.5)).toBe('0,5');

    zetTaal('en');
    expect(getal(0.5)).toBe('0.5');
  });

  it('rondt af op één decimaal, want meer suggereert precisie die er niet is', () => {
    zetTaal('nl');
    expect(getal(0.44)).toBe('0,4');
    expect(getal(2)).toBe('2');
  });

  it('noemt de weekdagen in de taal van de gebruiker', () => {
    // ⚠️ Deze namen komen uit `Intl` en staan bewust niet in de catalogus: zeven
    //    sleutels per taal overtypen levert alleen de kans op een tikfout in een
    //    taal die hier niemand spreekt.
    // ⚠️ Mét hoofdletter. `Intl` geeft in het Nederlands "maandag" — juist in een
    //    lopende zin, maar dit is een keuzelijst, en daar stond vóór QS8-115
    //    "Maandag". Die keuze mag de vertaling niet stilletjes ongedaan maken.
    zetTaal('nl');
    expect(weekdagNaam(1)).toBe('Maandag');
    expect(weekdagNaam(0)).toBe('Zondag');

    zetTaal('en');
    expect(weekdagNaam(1)).toBe('Monday');
    expect(weekdagNaam(0)).toBe('Sunday');
  });

  it('geeft zeven verschillende dagnamen, in beide talen', () => {
    // De nummering is die van Postgres en van `shared/time`: 0 = zondag. Een
    // verschuiving van één zou hier zeven namen opleveren die stuk voor stuk
    // net verkeerd zijn — en dat ziet niemand aan een lijstje.
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      const namen = new Set([0, 1, 2, 3, 4, 5, 6].map(weekdagNaam));
      expect(namen.size, taalcode).toBe(7);
    }
  });
});
