import { describe, expect, it } from 'vitest';

import { haalbaarheidUit, mijlpalenUit, weekdoelenUit } from './uitvoer';

/**
 * ⚠️ Dit is modeluitvoer, en dat is de reden dat deze tests bestaan. De Edge
 *    Function valideert met Zod vóór opslag, maar `mijlpalenUit()` is de laatste
 *    plek vóór het scherm — en op de dag dat het formaat verschuift, is een lege
 *    lijst een beter antwoord dan een scherm vol `undefined`.
 */
describe('mijlpalenUit', () => {
  it('leest de vorm die de Doelcoach vandaag teruggeeft', () => {
    // Deze vorm is op 21-08-2026 echt uit de keten gekomen, niet bedacht.
    const uitkomst = mijlpalenUit({
      milestones: [
        {
          title: 'Outline afronden en vastzetten',
          description: 'Werk je ruwe outline uit tot een plan per hoofdstuk.',
          target_date: '2026-09-15',
        },
        { title: 'Hoofdstuk 1 af', description: null, target_date: '2026-10-01' },
      ],
    });

    expect(uitkomst).toHaveLength(2);
    expect(uitkomst[0]?.title).toBe('Outline afronden en vastzetten');
    expect(uitkomst[1]?.target_date).toBe('2026-10-01');
  });

  it('accepteert een kale array en een Nederlandse sleutel', () => {
    expect(mijlpalenUit([{ title: 'Eén' }])).toHaveLength(1);
    expect(mijlpalenUit({ mijlpalen: [{ titel: 'Twee' }] })).toHaveLength(1);
    expect(mijlpalenUit({ mijlpalen: [{ titel: 'Twee' }] })[0]?.title).toBe('Twee');
  });

  it('geeft een lege lijst bij onzin in plaats van te crashen', () => {
    for (const onzin of [null, undefined, 42, 'tekst', {}, { milestones: 'geen array' }]) {
      expect(mijlpalenUit(onzin), String(onzin)).toEqual([]);
    }
  });

  it('gooit rijen zonder titel weg', () => {
    const uitkomst = mijlpalenUit({
      milestones: [{ title: 'Goed' }, { description: 'geen titel' }, { title: '   ' }],
    });

    expect(uitkomst).toHaveLength(1);
    expect(uitkomst[0]?.title).toBe('Goed');
  });

  it('laat nooit undefined in een veld staan', () => {
    const uitkomst = mijlpalenUit({ milestones: [{ title: 'Kaal' }] });

    expect(uitkomst[0]?.description).toBeNull();
    expect(uitkomst[0]?.target_date).toBeNull();
  });
});

describe('haalbaarheidUit', () => {
  it('geeft de tegenspraak terug als die er is', () => {
    const tekst = haalbaarheidUit({
      haalbaarheid: 'Zes uur per week is te weinig voor deze datum. Verzet hem of maak het kleiner.',
      milestones: [],
    });

    expect(tekst).toContain('te weinig');
  });

  /**
   * ⚠️ "Geen bezwaar" en "een bezwaar zonder tekst" zijn niet hetzelfde. Het
   *    tweede is een modelfout en hoort niet als lege waarschuwing in beeld te
   *    komen — een leeg rood kader is enger dan geen kader.
   */
  it('geeft null bij leeg, ontbrekend of onzin', () => {
    for (const onzin of [
      { haalbaarheid: '' },
      { haalbaarheid: '   ' },
      { haalbaarheid: 42 },
      { milestones: [] },
      null,
      'tekst',
    ]) {
      expect(haalbaarheidUit(onzin), JSON.stringify(onzin)).toBeNull();
    }
  });
});

/**
 * ⚠️ **De zeef filtert per rij en nooit de hele lijst**, en dat is het verschil
 *    tussen "de coach doet niets" en "één voorstel was half werk". Elke vorm
 *    hieronder wordt apart aangeboden: de vormen die eruit moeten én de vormen
 *    die met rust gelaten horen te worden. Die tweede helft is even belangrijk —
 *    een zeef die alles weggooit, leert je hem te negeren.
 */
describe('weekdoelenUit', () => {
  const goed = {
    title: 'Drie leveranciers bellen',
    floor_text: 'Eén leverancier bellen',
    ceiling_text: 'Drie leveranciers bellen en de offertes vergelijken',
  };

  it('laat een compleet voorstel door', () => {
    expect(weekdoelenUit({ weekly_goals: [goed] })).toEqual([goed]);
  });

  it('trimt de velden', () => {
    const uit = weekdoelenUit({
      weekly_goals: [{ title: '  Bellen  ', floor_text: ' Eén ', ceiling_text: ' Drie ' }],
    });

    expect(uit).toEqual([{ title: 'Bellen', floor_text: 'Eén', ceiling_text: 'Drie' }]);
  });

  /**
   * ⚠️ Het acceptatiecriterium van QS8-41 luidt: "elk voorgesteld weekdoel komt
   *    mét vloer en plafond — anders is de suggestie half werk". Dat is een eis
   *    per voorstel, dus een rij zonder vloer valt af en de rest blijft staan.
   */
  it('gooit half werk eruit en laat de rest staan', () => {
    const uit = weekdoelenUit({
      weekly_goals: [
        { title: 'Zonder vloer', ceiling_text: 'Drie stuks' },
        { title: 'Zonder plafond', floor_text: 'Eén stuk' },
        { title: 'Lege vloer', floor_text: '   ', ceiling_text: 'Drie stuks' },
        goed,
      ],
    });

    expect(uit).toEqual([goed]);
  });

  /**
   * ⚠️ Het meest waarschijnlijke faalgeval van het model: twee formuleringen van
   *    dezelfde stap. Domeinregel 8 zegt dat de vloer "de versie is die je op je
   *    slechtste week nog haalt" — een vloer die het plafond is, is geen vangnet.
   */
  it('weigert een vloer die het plafond is, ook met andere hoofdletters', () => {
    const uit = weekdoelenUit({
      weekly_goals: [
        { title: 'Bellen', floor_text: 'Drie stuks', ceiling_text: 'Drie stuks' },
        { title: 'Mailen', floor_text: 'drie stuks', ceiling_text: 'Drie Stuks' },
      ],
    });

    expect(uit).toEqual([]);
  });

  it('weigert een titel die korter is dan het schema toestaat', () => {
    expect(
      weekdoelenUit({
        weekly_goals: [{ title: 'ab', floor_text: 'Eén', ceiling_text: 'Drie' }],
      }),
    ).toEqual([]);
  });

  /**
   * ⚠️ De grens is 200 en wordt in UTF-16-eenheden gemeten, want dat is wat
   *    `weekdoelSchema.max(200)` telt. `.length >= telTekens()` altijd, dus dit
   *    is de striktere van de twee en laat niets door dat Zod daarna weigert.
   *    Zie QS8-118, maar dan aan de bovengrens.
   */
  it('weigert een veld dat over de grens van het schema gaat', () => {
    expect(
      weekdoelenUit({
        weekly_goals: [{ title: 'x'.repeat(201), floor_text: 'Eén', ceiling_text: 'Drie' }],
      }),
    ).toEqual([]);

    expect(
      weekdoelenUit({
        weekly_goals: [{ title: 'Bellen', floor_text: 'y'.repeat(201), ceiling_text: 'Drie' }],
      }),
    ).toEqual([]);
  });

  it('laat emoji met rust — die mag de gebruiker overal typen', () => {
    const met = {
      title: 'Drie leveranciers bellen 📞',
      floor_text: 'Eén bellen 👍',
      ceiling_text: 'Drie bellen en vergelijken 🎯',
    };

    expect(weekdoelenUit({ weekly_goals: [met] })).toEqual([met]);
  });

  it('accepteert een kale array en Nederlandse veldnamen', () => {
    expect(
      weekdoelenUit([{ titel: 'Bellen', vloer: 'Eén stuk', plafond: 'Drie stuks' }]),
    ).toEqual([{ title: 'Bellen', floor_text: 'Eén stuk', ceiling_text: 'Drie stuks' }]);

    expect(
      weekdoelenUit({ weekdoelen: [{ titel: 'Mailen', vloer: 'Eén', plafond: 'Drie' }] }),
    ).toEqual([{ title: 'Mailen', floor_text: 'Eén', ceiling_text: 'Drie' }]);
  });

  it('geeft een lege lijst bij onzin in plaats van om te vallen', () => {
    for (const onzin of [null, undefined, 42, 'tekst', {}, { weekly_goals: 'geen array' }]) {
      expect(weekdoelenUit(onzin), JSON.stringify(onzin)).toEqual([]);
    }
  });
});
