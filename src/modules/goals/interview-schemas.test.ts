import { describe, expect, it } from 'vitest';

import {
  ANTWOORD_MAX,
  GESPIEGELDE_VELDEN,
  heeftAntwoorden,
  interviewSchema,
  interviewStappen,
  LEEG_INTERVIEW,
  SPIEGELING,
  spiegelpatch,
  urenUitTekst,
  vulVoorUitDoel,
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

/**
 * QS8-205 — de vragenlijst die twee keer gesteld werd.
 *
 * ⚠️ **De belofte is niet "het veld staat vol" maar "wat je al beantwoord hebt,
 *    hoef je niet nog eens te typen".** Dat is een eigenschap van de naad tussen
 *    twee schermen, en dus precies waar onwrikbare regel 18 op wijst: `/doel/nieuw`
 *    schrijft twee kolommen op `goals`, en het interview stelt diezelfde twee
 *    vragen. Elk scherm klopte; het geheel vroeg het twee keer.
 */
describe('de spiegeling tussen doel en interview', () => {
  const DOEL = { identity_statement: 'Iemand die elke week schrijft', available_hours_per_week: 6 };

  /**
   * ⚠️ **Dit geval bewaakt dat de twee richtingen dezelfde velden kennen.** Zou
   *    iemand een derde veld aan `spiegelpatch()` toevoegen zonder aan
   *    `vulVoorUitDoel()`, dan wordt dat antwoord wél weggeschreven en komt het
   *    nooit meer terug — en dat is precies de fout die dit issue was, één veld
   *    verder.
   *
   *    Ze lezen daarom dezelfde tabel, en dit geval toetst dát.
   */
  it.each(GESPIEGELDE_VELDEN)('veld %s loopt beide kanten op', (veld) => {
    const antwoord = veld === 'hours_per_week' ? 12 : 'Iets nieuws';
    const patch = spiegelpatch({ ...LEEG_INTERVIEW, [veld]: antwoord });

    // Heen: het antwoord landt op de kolom die de tabel noemt.
    expect(patch[SPIEGELING[veld]]).toBe(antwoord);
    expect(Object.keys(patch)).toEqual([SPIEGELING[veld]]);

    // Terug: een leeg interview haalt diezelfde waarde weer op.
    const doel = { identity_statement: null, available_hours_per_week: null, ...patch };
    const vulling = vulVoorUitDoel(LEEG_INTERVIEW, doel);
    expect(vulling.antwoorden[veld]).toBe(antwoord);
    expect(vulling.voorgevuld).toEqual([veld]);
  });

  /**
   * ⚠️ **Een vól interview, en dat geval is de ijking zelf geweest.** Het geval
   *    hierboven voedt per keer één veld, en dat is genoeg om te zien dát een
   *    gespiegeld veld beide kanten op loopt — maar niet om te zien dat er géén
   *    dérde bij zit. Bij het ijken is er een regel aan `spiegelpatch()`
   *    toegevoegd die `measurable` naar `goals.description` schreef en nooit
   *    terugkwam: precies dít issue, één veld verder. **Alle dertig tests bleven
   *    groen**, want in elk voorbeeld stond `measurable` op `null`.
   *
   *    Een antwoord op élke vraag legt de hele uitgaande kant bloot.
   */
  it('schrijft uit een volledig interview niets anders weg dan de gespiegelde velden', () => {
    const vol = {
      measurable: 'Twintig betalende klanten',
      identity: 'Iemand die elke week schrijft',
      deadline_reason: 'Dan loopt mijn contract af',
      hours_per_week: 6,
      already_done: 'Een landingspagina',
      stuck_before: 'Ik hield het drie weken vol',
    };

    const patch = spiegelpatch(vol);
    expect(Object.keys(patch).sort()).toEqual(
      GESPIEGELDE_VELDEN.map((veld) => SPIEGELING[veld]).sort(),
    );
  });

  it('vult beide velden voor bij een vers doel zonder interview', () => {
    const vulling = vulVoorUitDoel(LEEG_INTERVIEW, DOEL);

    expect(vulling.antwoorden.identity).toBe(DOEL.identity_statement);
    expect(vulling.antwoorden.hours_per_week).toBe(6);
    expect([...vulling.voorgevuld].sort()).toEqual(['hours_per_week', 'identity']);
  });

  /**
   * ⚠️ Een eerder antwoord wint. De kolom op `goals` is een afgeleide van het
   *    interview; zou het doel winnen, dan overschrijft een tweede bezoek aan dit
   *    scherm een antwoord met een oudere waarde.
   */
  it('laat een bestaand antwoord staan en meldt het niet als voorgevuld', () => {
    const eerder = { ...LEEG_INTERVIEW, identity: 'Wat ik zelf typte', hours_per_week: 3 };
    const vulling = vulVoorUitDoel(eerder, DOEL);

    expect(vulling.antwoorden.identity).toBe('Wat ik zelf typte');
    expect(vulling.antwoorden.hours_per_week).toBe(3);
    expect(vulling.voorgevuld).toEqual([]);
  });

  /**
   * ⚠️ `''` en `null` zijn allebei overgeslagen — aan beide kanten. Twee functies
   *    die dat verschillend lezen is hoe een naad gaat lekken: de ene schrijft
   *    een lege string weg, de andere ziet hem als een antwoord en vult niet voor.
   */
  it('leest een lege string als overgeslagen, in beide richtingen', () => {
    const leegGetypt = { ...LEEG_INTERVIEW, identity: '   ' };

    expect(spiegelpatch(leegGetypt)).toEqual({});
    expect(vulVoorUitDoel(leegGetypt, DOEL).voorgevuld).toContain('identity');
  });

  it('vult niets voor uit een leeg doel', () => {
    const leeg = { identity_statement: null, available_hours_per_week: null };
    const vulling = vulVoorUitDoel(LEEG_INTERVIEW, leeg);

    expect(vulling.antwoorden).toEqual(LEEG_INTERVIEW);
    expect(vulling.voorgevuld).toEqual([]);
  });

  /** Nul uur is een antwoord en geen ontbrekende waarde. */
  it('behandelt nul uur als een gegeven antwoord', () => {
    const nul = { identity_statement: null, available_hours_per_week: 0 };
    expect(vulVoorUitDoel(LEEG_INTERVIEW, nul).antwoorden.hours_per_week).toBe(0);
    expect(spiegelpatch({ ...LEEG_INTERVIEW, hours_per_week: 0 })).toEqual({
      available_hours_per_week: 0,
    });
  });

  /**
   * ⚠️ **De reden dat `urenUitTekst()` bestaat.** `goals.available_hours_per_week`
   *    is `numeric(4,1)` en `/doel/nieuw` accepteert een breuk. Het interviewveld
   *    streepte alles weg wat geen cijfer was — zolang dat veld leeg begon, was
   *    dat onzichtbaar. Zodra het wordt vóórgevuld, verandert zes-en-een-half uur
   *    in vijfenzestig zodra de gebruiker het aanraakt.
   */
  it('houdt een halve uurwaarde heel over de hele keten', () => {
    const doel = { identity_statement: null, available_hours_per_week: 6.5 };
    const voorgevuld = vulVoorUitDoel(LEEG_INTERVIEW, doel).antwoorden.hours_per_week;

    expect(voorgevuld).toBe(6.5);
    // Wat het scherm toont, en wat er terugkomt als de gebruiker niets verandert.
    expect(urenUitTekst(String(voorgevuld))).toBe(6.5);
    expect(spiegelpatch({ ...LEEG_INTERVIEW, hours_per_week: 6.5 })).toEqual({
      available_hours_per_week: 6.5,
    });
  });
});

describe('urenUitTekst', () => {
  it('leest een heel getal', () => {
    expect(urenUitTekst('6')).toBe(6);
  });

  it('leest een komma als scheidingsteken', () => {
    expect(urenUitTekst('6,5')).toBe(6.5);
  });

  it('leest een punt als scheidingsteken', () => {
    expect(urenUitTekst('6.5')).toBe(6.5);
  });

  it('geeft null bij een leeg veld — overslaan blijft overslaan', () => {
    expect(urenUitTekst('')).toBeNull();
    expect(urenUitTekst('   ')).toBeNull();
    expect(urenUitTekst('uur')).toBeNull();
  });

  /**
   * ⚠️ Geen `NaN`, ooit. Die zou als `hours_per_week` het schema in gaan, daar
   *    door `z.number()` geweigerd worden, en de gebruiker een invoerfout geven op
   *    een veld dat hij netjes invulde.
   */
  it('geeft nooit NaN terug op rommel', () => {
    for (const rommel of ['6.5.5', '...', ',', '1,2,3', '-', '6-5']) {
      const uit = urenUitTekst(rommel);
      expect(uit === null || Number.isFinite(uit)).toBe(true);
    }
  });

  it('negeert tekens die geen cijfer of scheidingsteken zijn', () => {
    expect(urenUitTekst('6 uur')).toBe(6);
    expect(urenUitTekst('ongeveer 6,5 per week')).toBe(6.5);
  });
});
