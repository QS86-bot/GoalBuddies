import { describe, expect, it } from 'vitest';

import {
  berichtVoor,
  herinneringVelden,
  magNudgen,
  nudgeBericht,
  nudgeReden,
  tijdVoorInvoer,
  uurUit,
  type Melding,
  type NudgeSituatie,
} from './regels';

/** Alles staat goed: deze situatie levert wél een nudge op. */
const MAG: NudgeSituatie = {
  herinneringAan: true,
  herinneringUur: 20,
  lokaalUur: 20,
  heeftDagzet: false,
  heeftAfronding: false,
  heeftOpenWeekdoel: true,
  inAdempauze: false,
  alleenSlapendeGroepen: false,
  alVerstuurd: false,
};

describe('magNudgen', () => {
  /**
   * ⚠️ De positieve controle staat vooraan, en met opzet. Alle tests hieronder
   *    zijn weigeringen; zonder deze zouden ze allemaal groen blijven als
   *    `magNudgen()` domweg altijd `false` teruggeeft — en dan stuurt de app
   *    nooit iets, wat je pas merkt als een gebruiker het meldt.
   */
  it('stuurt een nudge als alles klopt', () => {
    expect(magNudgen(MAG)).toBe(true);
    expect(nudgeReden(MAG)).toBeNull();
  });

  it('stuurt niets als de herinnering uitstaat', () => {
    expect(magNudgen({ ...MAG, herinneringAan: false })).toBe(false);
  });

  it('stuurt alleen op het ingestelde uur', () => {
    expect(magNudgen({ ...MAG, lokaalUur: 19 })).toBe(false);
    expect(magNudgen({ ...MAG, lokaalUur: 21 })).toBe(false);
    expect(magNudgen({ ...MAG, herinneringUur: null })).toBe(false);
  });

  /** Acceptatiecriterium van QS8-77: slaat over als er al iets gebeurd is. */
  it('slaat over als er vandaag al een Dagzet of afronding is', () => {
    expect(magNudgen({ ...MAG, heeftDagzet: true })).toBe(false);
    expect(magNudgen({ ...MAG, heeftAfronding: true })).toBe(false);
  });

  it('stuurt niets als er niets openstaat om aan te werken', () => {
    expect(magNudgen({ ...MAG, heeftOpenWeekdoel: false })).toBe(false);
  });

  /**
   * ⚠️ Een herinnering tijdens je vakantie is het tegenovergestelde van wat een
   *    adempauze belooft: die week telt niet mee, niet positief en niet negatief
   *    (domeinregel 10). QS8-91 noemt het met naam.
   */
  it('stuurt niets tijdens een adempauze', () => {
    expect(magNudgen({ ...MAG, inAdempauze: true })).toBe(false);
    expect(nudgeReden({ ...MAG, inAdempauze: true })).toBe('adempauze');
  });

  it('stuurt niets vanuit alleen slapende groepen', () => {
    expect(magNudgen({ ...MAG, alleenSlapendeGroepen: true })).toBe(false);
  });

  /** "Maximaal één per dag, ook bij meerdere doelen." */
  it('stuurt niet twee keer op dezelfde dag', () => {
    expect(magNudgen({ ...MAG, alVerstuurd: true })).toBe(false);
  });

  it('geeft per weigering een eigen reden', () => {
    // Zonder eigen redenen is "waarom kreeg ik niets" niet te beantwoorden
    // zonder de code erbij te pakken.
    const redenen = new Set(
      [
        { ...MAG, herinneringAan: false },
        { ...MAG, herinneringUur: null },
        { ...MAG, lokaalUur: 3 },
        { ...MAG, heeftDagzet: true },
        { ...MAG, heeftAfronding: true },
        { ...MAG, heeftOpenWeekdoel: false },
        { ...MAG, inAdempauze: true },
        { ...MAG, alleenSlapendeGroepen: true },
        { ...MAG, alVerstuurd: true },
      ].map((s) => nudgeReden(s)),
    );

    expect(redenen.size).toBe(9);
    expect(redenen.has(null)).toBe(false);
  });
});

describe('de teksten', () => {
  it('verschilt van toon, maar beschuldigt in geen van beide', () => {
    const zacht = nudgeBericht('gentle');
    const streng = nudgeBericht('firm');

    expect(zacht.body).not.toBe(streng.body);

    for (const bericht of [zacht, streng]) {
      const tekst = `${bericht.titel} ${bericht.body}`.toLowerCase();
      for (const verwijt of ['gefaald', 'mislukt', 'gemist', 'te laat', 'alweer']) {
        expect(tekst, verwijt).not.toContain(verwijt);
      }
    }
  });

  /**
   * ⚠️ Een pushmelding staat op een vergrendeld scherm dat iemand anders kan
   *    meelezen. De doeltitel hoort daar niet — dezelfde regel als bij
   *    systeemberichten (beslisdocument 002 §3): noem de persoon en de
   *    gebeurtenis, nooit de inhoud.
   */
  it('noemt bij een goedkeuringsverzoek de persoon en niet het doel', () => {
    const bericht = berichtVoor('approval_request', { naam: 'Sanne' });

    expect(bericht.body).toContain('Sanne');
    expect(bericht.body.toLowerCase()).not.toContain('doel:');
    expect(bericht.body.toLowerCase()).not.toContain('weekdoel:');
  });

  it('werkt ook zonder naam', () => {
    for (const soort of ['approval_request', 'approval_received', 'cycle_summary'] as const) {
      const bericht = berichtVoor(soort, {});
      expect(bericht.body, soort).not.toContain('undefined');
      expect(bericht.titel.length, soort).toBeGreaterThan(0);
    }
  });

  /** QS8-91: elk type een diepe link naar de juiste plek. */
  it('geeft elke soort een pad', () => {
    const paden: string[] = [nudgeBericht('gentle').pad];
    for (const soort of ['approval_request', 'approval_received', 'cycle_summary'] as const) {
      paden.push(berichtVoor(soort, {}).pad);
    }

    for (const pad of paden) {
      expect(pad.startsWith('/')).toBe(true);
    }

    // Een goedkeuringsverzoek hoort naar het beoordeelscherm te gaan en niet
    // naar het dashboard — anders moet de ontvanger alsnog zoeken.
    expect(berichtVoor('approval_request', {}).pad).toBe('/beoordelen');
  });

  /**
   * ⚠️ De vier soorten zijn de grens. Er is er geen die over de tegenslag van
   *    een ander gaat, en die mag er ook niet bij komen zonder migratie — de
   *    CHECK in 0053 dwingt dat af. Deze test is de kopie aan de codekant,
   *    zoals `SYSTEEM_GEBEURTENISSEN` dat is voor de chat.
   */
  it('kent precies vier soorten, geen ervan over een ander', () => {
    const soorten: Melding[] = ['nudge', 'approval_request', 'approval_received', 'cycle_summary'];
    expect(soorten).toHaveLength(4);

    for (const verboden of ['missed_week', 'buddy_missed', 'streak_broken', 'behind']) {
      expect(soorten as string[]).not.toContain(verboden);
    }
  });
});

describe('uurUit', () => {
  it('leest het uur uit een tijd met en zonder seconden', () => {
    expect(uurUit('20:00')).toBe(20);
    expect(uurUit('20:00:00')).toBe(20);
    expect(uurUit('09:30')).toBe(9);
    expect(uurUit('0:15')).toBe(0);
  });

  it('geeft null bij onzin in plaats van een verkeerd uur', () => {
    // `profiles.reminder_time` is een `time`-kolom, maar de waarde komt als
    // string binnen en een lege of kapotte waarde mag geen nudge om middernacht
    // opleveren.
    for (const onzin of [null, '', 'twintig uur', '25:00', '99']) {
      expect(uurUit(onzin), String(onzin)).toBeNull();
    }
  });
});

describe('de taal van de ontvanger', () => {
  /**
   * ⚠️ **De taal is hier een parameter en geen globale stand, en dat is de hele
   *    reden dat deze module `shared/i18n` niet gebruikt.** De meldingenjob loopt
   *    over álle profielen. Met een procesbrede taal krijgt iedereen de taal van
   *    wie er toevallig als laatste is ingesteld — en dat merk je niet, want er
   *    kómt gewoon een melding aan.
   *
   *    Deze tests wisselen daarom bínnen één test van taal, zonder ergens iets in
   *    te stellen. Lukt dat niet meer, dan is er een globale stand ingeslopen.
   */
  it('geeft twee ontvangers hun eigen taal, in dezelfde ronde', () => {
    const nederlands = nudgeBericht('gentle', 'nl');
    const engels = nudgeBericht('gentle', 'en');

    expect(nederlands.titel).not.toBe(engels.titel);
    expect(nederlands.titel).toBe('Hoe gaat het met je week?');
    expect(engels.titel).toBe('How is your week going?');
  });

  it('valt terug op Nederlands bij een onbekende of ontbrekende taal', () => {
    // `profiles.locale` is `null` zolang er niets gekozen is. Een server weet
    // niet op welk toestel dit geopend wordt, dus de apparaattaal bestaat hier
    // niet — het wordt de standaardtaal.
    const standaard = nudgeBericht('gentle', 'nl').titel;

    expect(nudgeBericht('gentle', null).titel).toBe(standaard);
    expect(nudgeBericht('gentle', undefined).titel).toBe(standaard);
    expect(nudgeBericht('gentle').titel).toBe(standaard);
  });

  it('vertaalt alle drie de andere soorten, met en zonder naam', () => {
    for (const soort of ['approval_request', 'approval_received', 'cycle_summary'] as const) {
      const nl = berichtVoor(soort, { naam: 'Sanne' }, 'nl');
      const en = berichtVoor(soort, { naam: 'Sanne' }, 'en');

      expect(nl.titel, soort).not.toBe(en.titel);

      // Het pad is navigatie en geen tekst: dat hoort in beide talen gelijk.
      expect(en.pad, soort).toBe(nl.pad);

      // Zonder naam moet er nog steeds een zin staan — het profiel kan
      // verwijderd zijn.
      expect(berichtVoor(soort, {}, 'en').body.length, soort).toBeGreaterThan(10);
    }
  });

  it('beschuldigt in geen van beide talen', () => {
    // Zelfde eis als de Nederlandse toon-test hierboven. Een vertaler die de
    // code niet kent, kent dat criterium niet.
    for (const taal of ['nl', 'en'] as const) {
      for (const toon of ['gentle', 'firm'] as const) {
        const bericht = nudgeBericht(toon, taal);
        const heel = `${bericht.titel} ${bericht.body}`;

        expect(heel, `${taal}/${toon}`).not.toMatch(/gefaald|mislukt|failed|behind|achter/i);
      }
    }
  });
});

/**
 * De herinneringsvelden — QS8-77, bereikbaar gemaakt op 26-08-2026.
 *
 * ⚠️ **De belofte hier is "uit is uit"**, en niet "deze functie geeft drie
 *    velden terug". Ze staat sinds vandaag op twee schermen — het onboarding-
 *    scherm en het profieltabblad — en dat is precies de naad die CLAUDE.md
 *    regel 18 beschrijft: beide schermen kloppen op zichzelf, en het geheel
 *    lekt zodra iemand er één aanpast. Vandaar één functie en een test op de
 *    belofte, plus `tests/beloftes/herinnering.test.ts` dat bewaakt dat geen
 *    scherm eromheen schrijft.
 */
describe('herinneringVelden', () => {
  it('maakt de tijd leeg zodra de herinnering uit gaat', () => {
    // ⚠️ Dit is het leerpunt uit de Habit Huddle-analyse: een herinnering die
    //    terugkomt nadat je hem uitzette, is de snelste manier om een app van
    //    iemands telefoon te krijgen. Bewaren "voor als je hem weer aanzet" is
    //    dus geen service maar precies het verkeerde.
    const velden = herinneringVelden({ aan: false, tijd: '20:00', toon: 'firm' });

    expect(velden.reminder_enabled).toBe(false);
    expect(velden.reminder_time).toBeNull();
  });

  it('houdt de toon vast als je uitzet', () => {
    // De toon is geen herinnering maar een voorkeur over hoe je aangesproken
    // wilt worden, en die hoort niet te verdampen omdat je een kanaal dichtzet.
    expect(herinneringVelden({ aan: false, tijd: '20:00', toon: 'firm' }).reminder_tone).toBe(
      'firm',
    );
  });

  it('bewaart de tijd als hij aan staat, zonder omringende spaties', () => {
    const velden = herinneringVelden({ aan: true, tijd: '  07:30 ', toon: 'gentle' });

    expect(velden.reminder_enabled).toBe(true);
    expect(velden.reminder_time).toBe('07:30');
  });
});

describe('tijdVoorInvoer', () => {
  it('kort een Postgres-tijd in tot HH:MM', () => {
    expect(tijdVoorInvoer('20:00:00')).toBe('20:00');
  });

  it('vult een enkelcijferig uur aan', () => {
    // `9:05` zou het schema weigeren; het veld hoort meteen een geldige waarde
    // te tonen en niet een die pas bij het bewaren omvalt.
    expect(tijdVoorInvoer('9:05')).toBe('09:05');
  });

  it('geeft de terugval bij null — dat is "nog niets ingesteld"', () => {
    // ⚠️ En niet middernacht. Precies dit stond op productie: één profiel met
    //    reminder_time NULL, waardoor `nudgeReden()` altijd "geen tijdstip
    //    ingesteld" antwoordde en er nooit een nudge kon vuren.
    expect(tijdVoorInvoer(null)).toBe('20:00');
    expect(tijdVoorInvoer(null, '08:00')).toBe('08:00');
  });

  it('geeft de terugval bij iets onleesbaars', () => {
    expect(tijdVoorInvoer('geen tijd')).toBe('20:00');
    expect(tijdVoorInvoer('')).toBe('20:00');
  });

  it('sluit aan op wat de nudge ervan maakt', () => {
    // ⚠️ De naad tussen het invoerveld en de meldingenjob. `tijdVoorInvoer()`
    //    toont, `uurUit()` beslist — en die twee horen hetzelfde uur te zien.
    expect(uurUit(tijdVoorInvoer('7:05'))).toBe(7);
  });
});
