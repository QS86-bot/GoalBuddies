import { describe, expect, it } from 'vitest';

import {
  isPlanstapReden,
  MAX_PLANSTAPPEN,
  meldingBijReden,
  PLANSTAP_REDENEN,
  weekplanSchema,
  weekplanstapSchema,
} from './weekplan-schemas';
import { weekdoelSchema } from './weekly-schemas';

/**
 * QS8-203 — het weekplan, en de naden die het schema bewaakt.
 *
 * ⚠️ **Dit bestand toetst geen invoerveld maar twee beloftes**, en dat is het
 *    verschil dat onwrikbare regel 18 maakt:
 *
 *      1. *Wat je plant, past straks in een weekdoel.* Een geplande stap wordt
 *         letterlijk gekopieerd naar `weekly_goals`; loopt een grens hier op met
 *         die daar, dan slaagt het plannen en faalt het inschuiven — een week
 *         later, in een job zonder scherm.
 *      2. *Elke reden die de database kan teruggeven, heeft een zin.* Anders
 *         verdwijnt een uitkomst achter "er ging iets mis" terwijl de database
 *         precies verteld heeft wát er mis was.
 */

const STAP = {
  goal_id: '11111111-1111-4111-8111-111111111111',
  milestone_id: '22222222-2222-4222-8222-222222222222',
  title: 'Drie keer hardlopen',
  floor_text: 'Eén keer',
  ceiling_text: 'Drie keer',
};

describe('weekplanstapSchema', () => {
  it('accepteert een gewone stap', () => {
    expect(weekplanstapSchema.safeParse(STAP).success).toBe(true);
  });

  it('laat een stap zonder mijlpaal toe — een plan mag los onder het doel hangen', () => {
    expect(weekplanstapSchema.safeParse({ ...STAP, milestone_id: null }).success).toBe(true);
  });

  it('laat een stap zonder vloer en plafond toe, net als een weekdoel', () => {
    const kaal = { ...STAP, floor_text: null, ceiling_text: null };
    expect(weekplanstapSchema.safeParse(kaal).success).toBe(true);
  });

  it('weigert een titel van twee tekens', () => {
    expect(weekplanstapSchema.safeParse({ ...STAP, title: 'ab' }).success).toBe(false);
  });

  /**
   * ⚠️ **De naad.** Dit is geen dubbele test van een lengte: het is de vraag of
   *    wat je vandaag plant, over drie weken nog door `weekdoelSchema` komt.
   *    Verruimt iemand één van de twee, dan wordt dit rood — en niet de
   *    rollover, een week later, in een job die niemand ziet.
   *
   * ⚠️ **Eén veld per geval, en dat is de ijking zelf geweest.** De eerste versie
   *    zette alle drie de velden in één object op 201 tekens. Toen bij het ijken
   *    de titelgrens van 200 naar 400 werd gezet, bleef die test groen: het
   *    object viel nog steeds om op `floor_text`, dus hij bewaakte de titel
   *    helemaal niet. Mutatie per grendel, en niet één mutatie voor het geheel —
   *    ook als de grendel in je eigen test zit.
   */
  it.each(['title', 'floor_text', 'ceiling_text'] as const)(
    'heeft voor %s dezelfde grens als weekdoelSchema, want een stap wórdt een weekdoel',
    (veld) => {
      const opDeGrens = { ...STAP, [veld]: 'x'.repeat(200) };
      const eroverheen = { ...STAP, [veld]: 'x'.repeat(201) };

      expect(weekplanstapSchema.safeParse(opDeGrens).success).toBe(true);
      expect(weekdoelSchema.safeParse(opDeGrens).success).toBe(true);

      expect(weekplanstapSchema.safeParse(eroverheen).success).toBe(false);
      expect(weekdoelSchema.safeParse(eroverheen).success).toBe(false);
    },
  );

  /**
   * ⚠️ Zowel de titel als de teksten worden getrimd, en dat moet aan beide
   *    kanten hetzelfde zijn. Een stap die hier met spaties doorkomt en daar
   *    zonder, is een tekst die onderweg verandert.
   */
  it('trimt net als weekdoelSchema', () => {
    const metSpaties = { ...STAP, title: '  Drie keer hardlopen  ' };
    const stap = weekplanstapSchema.parse(metSpaties);
    const weekdoel = weekdoelSchema.parse(metSpaties);
    expect(stap.title).toBe(weekdoel.title);
  });
});

describe('weekplanSchema', () => {
  const kaal = { title: 'Drie keer hardlopen', floor_text: null, ceiling_text: null };

  it('accepteert een plan van één stap', () => {
    expect(weekplanSchema.safeParse([kaal]).success).toBe(true);
  });

  it('weigert een leeg plan', () => {
    expect(weekplanSchema.safeParse([]).success).toBe(false);
  });

  it('accepteert een plan tot precies een jaar', () => {
    const vol = Array.from({ length: MAX_PLANSTAPPEN }, () => kaal);
    expect(weekplanSchema.safeParse(vol).success).toBe(true);
  });

  /**
   * ⚠️ De grens hier hoort gelijk te zijn aan `weekly_plan_steps_order_bereik`
   *    in 0138. Zonder deze regel is "zet het hele plan klaar" een lus die de
   *    dagrem uit 0091 leegtrekt met één druk op de knop.
   */
  it('weigert een plan dat verder reikt dan een jaar', () => {
    const tevet = Array.from({ length: MAX_PLANSTAPPEN + 1 }, () => kaal);
    expect(weekplanSchema.safeParse(tevet).success).toBe(false);
  });

  it('draagt geen goal_id of milestone_id — die komen van de aanroeper', () => {
    const geparsed = weekplanSchema.parse([kaal]);
    expect(geparsed[0]).not.toHaveProperty('goal_id');
    expect(geparsed[0]).not.toHaveProperty('milestone_id');
  });
});

describe('isPlanstapReden', () => {
  it('herkent elke reden uit de lijst', () => {
    for (const reden of PLANSTAP_REDENEN) {
      expect(isPlanstapReden(reden)).toBe(true);
    }
  });

  it('laat onbekend gebied onbekend', () => {
    expect(isPlanstapReden('iets_nieuws')).toBe(false);
    expect(isPlanstapReden(null)).toBe(false);
    expect(isPlanstapReden(undefined)).toBe(false);
    expect(isPlanstapReden(42)).toBe(false);
    expect(isPlanstapReden({ reason: 'not_owner' })).toBe(false);
  });
});

describe('meldingBijReden', () => {
  /**
   * ⚠️ **De naad tussen 0138 en het scherm.** Elke reden die de database kan
   *    teruggeven heeft hier een eigen zin. Zou er een `default` staan, dan
   *    verdwijnt een nieuwe reden achter "er ging iets mis" terwijl de database
   *    precies verteld heeft wát er mis was — en dat is de klasse fout waar
   *    onwrikbare regel 18 over gaat.
   */
  it('geeft elke bekende reden een zin die niet de algemene fout is', () => {
    const algemeen = meldingBijReden('iets_wat_niet_bestaat');

    for (const reden of PLANSTAP_REDENEN) {
      const zin = meldingBijReden(reden);
      expect(zin.length).toBeGreaterThan(0);

      // `ongeldige_cyclus` is de enige die met opzet op de algemene zin
      // uitkomt: dat is een programmeerfout in de client en geen uitkomst die
      // de gebruiker iets zegt.
      if (reden !== 'ongeldige_cyclus') {
        expect(zin).not.toBe(algemeen);
      }
    }
  });

  it('valt terug op de algemene zin bij iets wat geen reden is', () => {
    expect(meldingBijReden(null)).toBe(meldingBijReden(undefined));
    expect(meldingBijReden({ reason: 'not_owner' })).toBe(meldingBijReden(7));
  });
});
