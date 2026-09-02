import { describe, expect, it } from 'vitest';

import {
  interviewSchema,
  LEEG_INTERVIEW,
  PROFIELCONTEXT,
  PROFIELSPIEGELING,
  vulVoorUitProfiel,
} from './interview-schemas';
import { CATEGORIEEN } from './schemas';
import {
  LEGE_VRAGENLIJST,
  MAX_FOCUSGEBIEDEN,
  patchUitVragenlijst,
  urenPerWeekUitMinuten,
  VALKUILEN,
  valkuilAntwoord,
  vragenlijstSchema,
  type VragenlijstInvoer,
} from './vragenlijst-schemas';

/**
 * De korte vragenlijst — QS8-257.
 *
 * ⚠️ **De drie acceptatiecriteria van dit issue staan hier als test en niet als
 *    belofte:** geen vraag wordt twee keer gesteld, elk antwoord op vraag 4 wijst
 *    aantoonbaar iets aan, en alles overslaan wist niets.
 */

describe('alles overslaan', () => {
  it('is een geldige vragenlijst', () => {
    expect(vragenlijstSchema.safeParse(LEGE_VRAGENLIJST).success).toBe(true);
  });

  /**
   * ⚠️ **Dit is acceptatiecriterium 3, en het is de toets die het makkelijkst
   *    stilletjes breekt.** Een patch die elk veld meestuurt, zet een
   *    overgeslagen antwoord op `null` — en dan wist "overslaan" gegevens die er
   *    al stonden. Dezelfde regel als `spiegelpatch()` in QS8-205.
   */
  it('stuurt geen enkel veld mee, en wist dus niets', () => {
    expect(patchUitVragenlijst(LEGE_VRAGENLIJST)).toEqual({});
  });

  it('stuurt alleen de velden mee die beantwoord zijn', () => {
    const patch = patchUitVragenlijst({ ...LEGE_VRAGENLIJST, minutes_per_day: 15 });

    expect(Object.keys(patch)).toEqual(['minutes_per_day']);
  });

  it('kopieert de arrays in plaats van ze te delen', () => {
    // Anders verandert een latere wijziging in het formulier de al verstuurde
    // patch — een klasse fout die pas bij de tweede opslag zichtbaar wordt.
    const invoer: VragenlijstInvoer = { ...LEGE_VRAGENLIJST, focus_areas: ['fitness'] };
    const patch = patchUitVragenlijst(invoer);

    (invoer.focus_areas as string[]).push('nutrition');

    expect(patch.focus_areas).toEqual(['fitness']);
  });
});

describe('de focusgebieden', () => {
  it('komen uit dezelfde woordenlijst als de categorieën van een doel', () => {
    // ⚠️ Geen tweede lijst: het schema leest `CATEGORIEEN`. Deze toets legt dat
    //    vast, zodat een losse kopie hier meteen opvalt.
    for (const gebied of CATEGORIEEN) {
      const uit = vragenlijstSchema.safeParse({ ...LEGE_VRAGENLIJST, focus_areas: [gebied] });
      expect(uit.success, gebied).toBe(true);
    }
  });

  it('weigert er meer dan drie', () => {
    const teveel = CATEGORIEEN.slice(0, MAX_FOCUSGEBIEDEN + 1);
    const uit = vragenlijstSchema.safeParse({ ...LEGE_VRAGENLIJST, focus_areas: teveel });

    expect(uit.success).toBe(false);
  });

  it('weigert een gebied dat niet bestaat', () => {
    const uit = vragenlijstSchema.safeParse({ ...LEGE_VRAGENLIJST, focus_areas: ['sport'] });

    expect(uit.success).toBe(false);
  });
});

describe('minuten per dag naar uren per week', () => {
  /**
   * ⚠️ **Eén decimaal, want de kolom is `numeric(4,1)`.** Afronden op hele uren
   *    zou vijf minuten per dag op één uur per week zetten — en dan liegt het
   *    voorstel precies de kant op die de gebruiker zich laat overschatten.
   */
  it('rekent om zonder de kant op te ronden die vleit', () => {
    expect(urenPerWeekUitMinuten(5)).toBe(0.6);
    expect(urenPerWeekUitMinuten(15)).toBe(1.8);
    expect(urenPerWeekUitMinuten(30)).toBe(3.5);
    expect(urenPerWeekUitMinuten(60)).toBe(7);
  });

  it('geeft niets terug als er niets gekozen is', () => {
    expect(urenPerWeekUitMinuten(null)).toBeNull();
    expect(urenPerWeekUitMinuten(0)).toBeNull();
  });

  it('geeft nooit NaN terug', () => {
    // `Number.NaN` binnen zou als antwoord in de database landen.
    expect(urenPerWeekUitMinuten(Number.NaN)).toBeNull();
    expect(urenPerWeekUitMinuten(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

/**
 * Acceptatiecriterium 1 — geen enkele vraag wordt twee keer gesteld.
 *
 * ⚠️ **Getoetst met een volledig ingevuld blok en niet met één veld tegelijk**,
 *    precies zoals QS8-205 het doet. Die test bleef groen op een derde veld dat
 *    één kant op liep, omdat élke fixture dat veld leeg had.
 */
describe('de overlap met het zes-vragen-interview', () => {
  const profiel = { minutes_per_day: 30, what_breaks_it: ['all_or_nothing', 'forget'] };

  it('vult de urenvraag voor met wat de vragenlijst al weet', () => {
    const uit = vulVoorUitProfiel(LEEG_INTERVIEW, profiel, urenPerWeekUitMinuten);

    expect(uit.antwoorden.hours_per_week).toBe(3.5);
    expect(uit.voorgevuld).toEqual(['hours_per_week']);
  });

  it('laat een eerder gegeven antwoord staan', () => {
    // ⚠️ Wat de gebruiker in het interview getypt heeft, is zijn antwoord op déze
    //    vraag; het profiel is een afgeleide. Zou het profiel winnen, dan
    //    overschrijft een tweede bezoek zijn antwoord met een oudere waarde.
    const uit = vulVoorUitProfiel(
      { ...LEEG_INTERVIEW, hours_per_week: 12 },
      profiel,
      urenPerWeekUitMinuten,
    );

    expect(uit.antwoorden.hours_per_week).toBe(12);
    expect(uit.voorgevuld).toEqual([]);
  });

  /**
   * ⚠️ **`stuck_before` wordt getóónd en niet ingevuld, en dat is het besluit.**
   *    Aan de ene kant staan aangevinkte valkuilen, aan de andere vrije tekst.
   *    Die omzetten zou betekenen dat de app een zin schrijft en hem opslaat
   *    alsof de gebruiker hem getypt heeft — erger dan de vraag nog eens stellen.
   */
  it('vult de vraag over eerder vastlopen niet in, maar toont wel wat er ligt', () => {
    const uit = vulVoorUitProfiel(LEEG_INTERVIEW, profiel, urenPerWeekUitMinuten);

    expect(uit.antwoorden.stuck_before).toBeNull();
    expect(uit.context.stuck_before).toEqual(['all_or_nothing', 'forget']);
  });

  it('toont die context ook als het veld al ingevuld is', () => {
    const uit = vulVoorUitProfiel(
      { ...LEEG_INTERVIEW, stuck_before: 'Ik stopte in maart.' },
      profiel,
      urenPerWeekUitMinuten,
    );

    expect(uit.context.stuck_before).toEqual(['all_or_nothing', 'forget']);
  });

  it('doet niets bij een leeg profiel', () => {
    const uit = vulVoorUitProfiel(
      LEEG_INTERVIEW,
      { minutes_per_day: null, what_breaks_it: [] },
      urenPerWeekUitMinuten,
    );

    expect(uit.antwoorden).toEqual(LEEG_INTERVIEW);
    expect(uit.voorgevuld).toEqual([]);
    expect(uit.context).toEqual({});
  });

  /**
   * ⚠️ **De naad tussen de twee tabellen.** Een veld dat in allebei staat zou
   *    tegelijk voorgevuld én als context getoond worden — twee antwoorden op
   *    één vraag. Twee tabellen met elk één regel is de vorm die niet uit de pas
   *    kan lopen; deze toets is wat dat vasthoudt.
   */
  it('houdt voorvullen en context strikt uit elkaar', () => {
    const gespiegeld = Object.keys(PROFIELSPIEGELING);
    const context = Object.keys(PROFIELCONTEXT);

    expect(gespiegeld.filter((veld) => context.includes(veld))).toEqual([]);

    // En allebei zijn het echte interviewvelden, geen typefouten.
    const velden = Object.keys(interviewSchema.shape);
    for (const veld of [...gespiegeld, ...context]) {
      expect(velden, veld).toContain(veld);
    }
  });
});

/**
 * Acceptatiecriterium 2 — elk antwoord op vraag 4 wijst aantoonbaar iets aan.
 */
describe('wat de app tegen een valkuil heeft', () => {
  it('geeft voor elke valkuil een echte zin en geen catalogussleutel', () => {
    for (const valkuil of VALKUILEN) {
      const antwoord = valkuilAntwoord(valkuil);

      expect(antwoord.kop, valkuil).not.toMatch(/^valkuil\./);
      expect(antwoord.antwoord, valkuil).not.toMatch(/^valkuil\./);
      expect(antwoord.antwoord.length, valkuil).toBeGreaterThan(30);
    }
  });

  it('geeft elke valkuil een eigen antwoord', () => {
    // Twee valkuilen met dezelfde zin betekent dat er één niets aanwijst.
    const zinnen = VALKUILEN.map((v) => valkuilAntwoord(v).antwoord);

    expect(new Set(zinnen).size).toBe(VALKUILEN.length);
  });

  /**
   * ⚠️ `forget` wijst naar herinneringen, en die zijn nog niet gebouwd (EPIC 11).
   *    Hij heeft daarom géén route — een knop naar een scherm dat niet bestaat,
   *    is erger dan geen knop.
   */
  it('wijst alleen naar plekken die bestaan', () => {
    expect(valkuilAntwoord('forget').route).toBeNull();

    for (const valkuil of VALKUILEN.filter((v) => v !== 'forget')) {
      expect(valkuilAntwoord(valkuil).route, valkuil).toMatch(/^\//);
    }
  });
});
