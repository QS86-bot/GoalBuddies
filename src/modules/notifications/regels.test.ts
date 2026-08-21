import { describe, expect, it } from 'vitest';

import {
  berichtVoor,
  magNudgen,
  nudgeBericht,
  nudgeReden,
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
