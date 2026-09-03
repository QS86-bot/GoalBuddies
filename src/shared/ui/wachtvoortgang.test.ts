import { describe, expect, it } from 'vitest';

import {
  VERWACHTE_WACHT_MS,
  voortgangsweergave,
  wachtstand,
  type Wachtstand,
} from './wachtvoortgang';

/** Drie stappen, zoals beide coachschermen ze meegeven. */
const DRIE = 3;

function na(seconden: number): Wachtstand {
  return wachtstand(seconden * 1000, VERWACHTE_WACHT_MS, DRIE);
}

describe('wachtstand', () => {
  it('loopt van niets naar vol over de verwachte twintig seconden', () => {
    expect(na(0).deel).toBe(0);
    expect(na(10).deel).toBeCloseTo(0.5, 5);
    expect(na(20).deel).toBe(1);
  });

  it('rekent naar de verwachting en niet naar de bovengrens van het pollen', () => {
    // ⚠️ Het pollen loopt zestig rondes van twee seconden, dus twee minuten. Een
    //    balk die daarnaartoe loopt, staat na twintig seconden op een zesde
    //    terwijl het antwoord er dan is — en dat is precies het beeld van een
    //    app die niets doet.
    expect(na(20).deel).toBeGreaterThan(wachtstand(20_000, 120_000, DRIE).deel);
  });

  it('blijft op 1 staan en gaat er niet overheen', () => {
    expect(na(60).deel).toBe(1);
    expect(na(600).deel).toBe(1);
  });

  it('zegt voorbij de verwachting dat het langer duurt', () => {
    // ⚠️ De belofte uit het issue: bij het overschrijden niet blijven hangen op
    //    100%, maar overgaan in "dit duurt langer dan gewoonlijk". Een volle balk
    //    zonder die tekst is hetzelfde beeld als vóór QS8-208.
    expect(na(19).fase).toBe('loopt');
    expect(na(20).fase).toBe('loopt');
    expect(na(21).fase).toBe('duurt_langer');
  });

  it('wisselt de stap op tijd en blijft binnen de lijst', () => {
    expect(na(0).stap).toBe(0);
    expect(na(6).stap).toBe(0);
    expect(na(7).stap).toBe(1);
    expect(na(14).stap).toBe(2);
    // Voorbij de verwachte tijd blijft hij op de laatste staan in plaats van
    // buiten de lijst te wijzen.
    expect(na(300).stap).toBe(DRIE - 1);
  });

  it('geeft geen index als er geen stappen zijn', () => {
    // Een `0` zou de aanroeper naar `lijst[0]` van een lege lijst sturen, en dat
    // is `undefined` op een plek waar een zin hoort te staan.
    expect(wachtstand(5000, VERWACHTE_WACHT_MS, 0).stap).toBe(-1);
  });

  it('telt hele seconden voor de tekstuele teller', () => {
    expect(wachtstand(0, VERWACHTE_WACHT_MS, DRIE).seconden).toBe(0);
    expect(wachtstand(1999, VERWACHTE_WACHT_MS, DRIE).seconden).toBe(1);
  });

  it('valt niet om op een negatieve of nulinvoer', () => {
    // De klok van het apparaat kan verzet worden terwijl dit scherm openstaat.
    expect(na(-5).deel).toBe(0);
    expect(na(-5).seconden).toBe(0);
    expect(wachtstand(1000, 0, DRIE).deel).toBe(1);
  });
});

describe('voortgangsweergave', () => {
  it('laat altijd iets zichtbaars zien, hoe de voorkeur ook staat', () => {
    // ⚠️ **Dit is de belofte en niet de balk.** De valkuil is dat je "verminder
    //    beweging" leest als "laat de voortgang weg" — en dan kijkt precies de
    //    gebruiker die het minst aan een animatie heeft, twintig seconden naar
    //    stilstaande tekst. Dat was de toestand vóór QS8-208, voor iedereen.
    for (const reduced of [true, false]) {
      const weergave = voortgangsweergave(reduced);
      expect(weergave.balk || weergave.teller).toBe(true);
    }
  });

  /**
   * ⚠️ **Eén mutatie bleef groen, en dat is met opzet.** `balk: !reduced` — de
   *    balk verbergen en alleen de teller tonen — maakt geen enkele test rood.
   *    Nagelopen en het is geen gat: die variant houdt de belofte
   *    (*"er is altijd zichtbare voortgang, en zonder animatie"*) gewoon waar.
   *    Het is een andere vórmgeving van hetzelfde, en daar hoort een
   *    belofte-test onverschillig voor te zijn. Wat wél rood wordt is
   *    `balk: false` mét `teller: false`, en dat is de breuk.
   */
  it('zet er een tekstuele teller bij zodra beweging uit staat', () => {
    expect(voortgangsweergave(true).teller).toBe(true);
  });

  it('animeert niet als de gebruiker om minder beweging vraagt', () => {
    expect(voortgangsweergave(true).animatieMs).toBe(0);
    expect(voortgangsweergave(false).animatieMs).toBeGreaterThan(0);
  });
});
