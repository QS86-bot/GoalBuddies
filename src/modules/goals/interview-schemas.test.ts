import { describe, expect, it } from 'vitest';

import {
  ANTWOORD_MAX,
  heeftAntwoorden,
  interviewSchema,
  interviewStappen,
  LEEG_INTERVIEW,
} from './interview-schemas';

describe('interviewSchema', () => {
  it('accepteert een interview waarin alles is overgeslagen', () => {
    // ⚠️ Dit is een acceptatiecriterium en geen randgeval: alles overslaan moet
    //    tot een generieker maar werkend resultaat leiden, niet tot een
    //    blokkade. Een schema dat hier struikelt, maakt van de Doelcoach een
    //    verplicht formulier.
    expect(interviewSchema.safeParse(LEEG_INTERVIEW).success).toBe(true);
  });

  it('accepteert één beantwoorde vraag tussen vijf overgeslagen', () => {
    const uitkomst = interviewSchema.safeParse({
      ...LEEG_INTERVIEW,
      measurable: 'Twintig betalende klanten.',
    });
    expect(uitkomst.success).toBe(true);
  });

  it('trimt witruimte rond een antwoord', () => {
    const uitkomst = interviewSchema.safeParse({ ...LEEG_INTERVIEW, identity: '  iemand  ' });
    expect(uitkomst.success && uitkomst.data.identity).toBe('iemand');
  });

  it('weigert een antwoord dat langer is dan de bovengrens', () => {
    const uitkomst = interviewSchema.safeParse({
      ...LEEG_INTERVIEW,
      already_done: 'x'.repeat(ANTWOORD_MAX + 1),
    });
    expect(uitkomst.success).toBe(false);
  });

  describe('uren per week', () => {
    it('neemt een getal aan', () => {
      const uitkomst = interviewSchema.safeParse({ ...LEEG_INTERVIEW, hours_per_week: 6.5 });
      expect(uitkomst.success && uitkomst.data.hours_per_week).toBe(6.5);
    });

    it('weigert tekst, ook als het een getal lijkt', () => {
      // ⚠️ De Risico-radar (EPIC 12) rekent met dit veld. Een string die er als
      //    een getal uitziet, is precies het soort waarde dat pas maanden later
      //    stukloopt — in een berekening, niet in een formulier.
      const uitkomst = interviewSchema.safeParse({ ...LEEG_INTERVIEW, hours_per_week: '6' });
      expect(uitkomst.success).toBe(false);
    });

    it('weigert een negatief aantal uren', () => {
      expect(
        interviewSchema.safeParse({ ...LEEG_INTERVIEW, hours_per_week: -1 }).success,
      ).toBe(false);
    });

    it('weigert meer uren dan een week telt', () => {
      expect(
        interviewSchema.safeParse({ ...LEEG_INTERVIEW, hours_per_week: 169 }).success,
      ).toBe(false);
    });

    it('staat nul uur toe', () => {
      // Iemand die eerlijk zegt geen tijd te hebben, geeft de radar het meest
      // bruikbare signaal dat er is.
      expect(interviewSchema.safeParse({ ...LEEG_INTERVIEW, hours_per_week: 0 }).success).toBe(true);
    });
  });
});

describe('interviewStappen()', () => {
  it('stelt precies zes vragen', () => {
    expect(interviewStappen()).toHaveLength(6);
  });

  it('dekt elk veld van het schema precies één keer', () => {
    // Anders bestaat er een antwoord dat nergens gevraagd wordt, of een vraag
    // waarvan het antwoord nergens landt.
    const velden = interviewStappen().map((s) => s.veld).sort();
    expect(velden).toEqual(Object.keys(LEEG_INTERVIEW).sort());
  });

  it('geeft elke vraag een toelichting', () => {
    for (const stap of interviewStappen()) {
      expect(stap.toelichting.length).toBeGreaterThan(0);
    }
  });

  it('vertelt bij de laatste vraag dat de groep hem niet ziet', () => {
    // ⚠️ "Waar liep het eerder vast" gaat per definitie over een eerdere
    //    mislukking. Domeinregel 7 houdt eigen tegenslag privé, en de gebruiker
    //    hoort dat te lezen vóór hij typt — niet erna.
    const laatste = interviewStappen()[interviewStappen().length - 1];
    expect(laatste?.veld).toBe('stuck_before');
    expect(laatste?.toelichting).toContain('groep');
  });
});

describe('heeftAntwoorden', () => {
  it('is onwaar bij een volledig overgeslagen interview', () => {
    expect(heeftAntwoorden(LEEG_INTERVIEW)).toBe(false);
  });

  it('is waar zodra er één vraag beantwoord is', () => {
    expect(heeftAntwoorden({ ...LEEG_INTERVIEW, stuck_before: 'tijdgebrek' })).toBe(true);
  });

  it('telt nul uur als een antwoord', () => {
    // `0` is falsy en dat is hier een valkuil: nul uur is een uitspraak.
    expect(heeftAntwoorden({ ...LEEG_INTERVIEW, hours_per_week: 0 })).toBe(true);
  });
});
