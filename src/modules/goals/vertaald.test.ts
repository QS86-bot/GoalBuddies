import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../../shared/i18n';

import { deadlineVerzoekSchema } from './deadline-schemas';
import { interviewStappen } from './interview-schemas';
import { CATEGORIEEN, categorieLabels, doelSchema } from './schemas';

/**
 * QS8-115, modules-laag: `goals`.
 *
 * ⚠️ Zoals overal in deze migratie: dit toetst of de tekst nog van de taal
 *    afhangt, niet wat er staat. De inhoud wordt elders bewaakt.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('de categorieën', () => {
  /**
   * ⚠️ Tegen `CATEGORIEEN.length` en niet tegen een getal. Bij QS8-224 gingen er
   *    twaalf gebieden bij en stond hier `toBe(3)` — dan is de test een
   *    onderhoudspost in plaats van een grendel. Wat hij moet bewaken is dat er
   *    geen twee gebieden hetzelfde heten en dat er geen label leeg is; het
   *    áántal is daar de uitdrukking van en niet het onderwerp.
   */
  it('hebben in elke taal een eigen, niet-leeg label', () => {
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      const labels = Object.values(categorieLabels());

      expect(labels.length, taalcode).toBe(CATEGORIEEN.length);
      expect(new Set(labels).size, taalcode).toBe(CATEGORIEEN.length);
      for (const label of labels) expect(label.trim(), taalcode).not.toBe('');
    }
  });

  it('vertaalt', () => {
    zetTaal('nl');
    expect(categorieLabels().business).toBe('Werk');

    zetTaal('en');
    expect(categorieLabels().business).toBe('Work');
  });
});

describe('het Doelcoach-interview', () => {
  it('heeft in beide talen zes stappen in dezelfde volgorde', () => {
    // ⚠️ De vólgorde is het interview zelf en geen tekst: die hoort niet mee te
    //    veranderen met de taal.
    const velden = [
      'measurable',
      'identity',
      'deadline_reason',
      'hours_per_week',
      'already_done',
      'stuck_before',
    ];

    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      expect(
        interviewStappen().map((s) => s.veld),
        taalcode,
      ).toEqual(velden);
    }
  });

  it('belooft in beide talen dat de laatste vraag nooit naar de groep gaat', () => {
    // ⚠️ **Dit is domeinregel 7 en geen copy.** "Waar liep het eerder vast?" is
    //    het enige veld waarin iemand expliciet over tegenslag schrijft. De
    //    toelichting belooft dat het bij hem en de Doelcoach blijft; die belofte
    //    mag een vertaling niet vlakker maken.
    zetTaal('nl');
    const nl = interviewStappen().find((s) => s.veld === 'stuck_before');
    expect(nl?.toelichting).toContain('je groep ziet dit nooit');

    zetTaal('en');
    const en = interviewStappen().find((s) => s.veld === 'stuck_before');
    expect(en?.toelichting).toContain('your group never sees this');
  });

  it('geeft elke stap een eigen vraag', () => {
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      expect(new Set(interviewStappen().map((s) => s.vraag)).size, taalcode).toBe(6);
    }
  });
});

describe('Zod-meldingen van een doel', () => {
  it('volgen de taal van een al opgebouwd schema', () => {
    // Zelfde bewaking als in `auth/vertaald.test.ts`: het schema is op
    // moduleniveau gebouwd, dus dit gaat alleen goed met `{ error: () => t(...) }`.
    const kort = { title: 'ab', category: 'other', target_date: '2027-01-01' };

    zetTaal('nl');
    expect(doelSchema.safeParse(kort).error?.issues[0]?.message).toBe(
      'Geef je doel een naam van minstens drie tekens.',
    );

    zetTaal('en');
    expect(doelSchema.safeParse(kort).error?.issues[0]?.message).toBe(
      'Give your goal a name of at least three characters.',
    );
  });
});

describe('het deadline-verzoek', () => {
  it('vertaalt de melding bij een te kort argument', () => {
    // ⚠️ Dit schema stond op 22-08 al in de catalogus, verhuisde daarna naar
    //    `deadline-schemas.ts` (QS8-120) en verloor bij die verhuizing zijn
    //    `t()`-aanroep zonder dat één test rood werd. Zie de kop van
    //    `../completions/vertaald.test.ts`.
    const invoer = { new_date: '2099-01-01', reason: 'te kort' };

    zetTaal('nl');
    const nl = deadlineVerzoekSchema.safeParse(invoer).error?.issues[0]?.message;

    zetTaal('en');
    const en = deadlineVerzoekSchema.safeParse(invoer).error?.issues[0]?.message;

    expect(nl).toBeDefined();
    expect(en).toBeDefined();
    expect(nl).not.toBe(en);
  });
});
