import { describe, expect, it } from 'vitest';

import { haalbaarheidUit, mijlpalenUit, planUit, weekdoelenUit } from './uitvoer';

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

// ---------------------------------------------------------------------------
// planUit — QS8-201
// ---------------------------------------------------------------------------

/** Een compleet plan zoals het schema van de Doelcoach het teruggeeft. */
function plan(over: Record<string, unknown> = {}) {
  return {
    title: '20 kg afvallen voor de zomer',
    category: 'other',
    identity_statement: 'Ik ben iemand die elke week beweegt.',
    milestones: [
      { title: 'Eerste 5 kg', description: 'Rustig beginnen.', target_date: '2026-10-01' },
      { title: 'Volgende 10 kg', description: null, target_date: '2026-12-01' },
    ],
    first_weekly_goal: {
      title: 'Drie keer wandelen',
      floor_text: 'Eén keer twintig minuten',
      ceiling_text: 'Drie keer veertig minuten',
    },
    haalbaarheid: '',
    ...over,
  };
}

describe('planUit', () => {
  it('leest een compleet plan', () => {
    const uit = planUit(plan());

    expect(uit?.title).toBe('20 kg afvallen voor de zomer');
    expect(uit?.category).toBe('other');
    expect(uit?.identity_statement).toBe('Ik ben iemand die elke week beweegt.');
    expect(uit?.milestones).toHaveLength(2);
    expect(uit?.first_weekly_goal?.floor_text).toBe('Eén keer twintig minuten');
    expect(uit?.haalbaarheid).toBeNull();
  });

  it('leest een weekdoel dat als één object binnenkomt en niet als lijst', () => {
    // ⚠️ Dit is de val die bij het schrijven al toesloeg. `weekdoelenUit()`
    //    accepteert een kale array of een object mét `weekly_goals`; een lós
    //    weekdoelobject valt tussen die twee door en geeft stil een lege lijst.
    //    Dan komt élk plan zonder eerste week aan en ziet niemand waarom.
    expect(planUit(plan())?.first_weekly_goal).not.toBeNull();
  });

  it('accepteert Nederlandse sleutels', () => {
    const uit = planUit({
      titel: 'Mijn website af voor kerst',
      categorie: 'business',
      identiteitszin: 'Ik ben iemand die afmaakt wat hij begint.',
      mijlpalen: [{ titel: 'Ontwerp klaar', streefdatum: '2026-10-15' }],
      eerste_weekdoel: { titel: 'Twee avonden bouwen', vloer: 'Eén avond', plafond: 'Drie avonden' },
    });

    expect(uit?.title).toBe('Mijn website af voor kerst');
    expect(uit?.category).toBe('business');
    expect(uit?.milestones).toHaveLength(1);
    expect(uit?.first_weekly_goal?.title).toBe('Twee avonden bouwen');
  });

  it.each([
    ['een onbekende categorie', 'health'],
    ['een lege categorie', ''],
    ['geen categorie', undefined],
    ['een getal', 42],
  ])('valt bij %s terug op other in plaats van te falen', (_naam, categorie) => {
    // ⚠️ `goals.category` heeft een CHECK. Een verzonnen categorie zou het
    //    aanmaken laten stuklopen op een 23514 die de gebruiker niets zegt.
    //    De terugval is zichtbaar: het scherm toont de categorie en je kunt hem
    //    bijstellen vóór je bevestigt.
    expect(planUit(plan({ category: categorie }))?.category).toBe('other');
  });

  it('herkent een categorie ongeacht hoofdletters', () => {
    expect(planUit(plan({ category: 'Study' }))?.category).toBe('study');
  });

  it.each([
    ['een lege titel', ''],
    ['een titel van twee tekens', 'ab'],
    ['alleen spaties', '   '],
    ['geen titel', undefined],
  ])('geeft null bij %s — daar valt geen doel van te maken', (_naam, titel) => {
    expect(planUit(plan({ title: titel }))).toBeNull();
  });

  it.each([
    ['null', null],
    ['een array', [{ title: 'x' }]],
    ['een string', 'geen plan'],
    ['een getal', 7],
  ])('geeft null bij %s', (_naam, invoer) => {
    expect(planUit(invoer)).toBeNull();
  });

  it('houdt het doel bruikbaar als het weekdoel onbruikbaar is', () => {
    // ⚠️ Een vloer gelijk aan het plafond is geen weekdoel maar een tweede
    //    formulering van dezelfde stap (domeinregel 8). Dat maakt het plan niet
    //    onbruikbaar: het doel en de mijlpalen blijven staan, de gebruiker vult
    //    zijn eerste week zelf in.
    const uit = planUit(
      plan({ first_weekly_goal: { title: 'Wandelen', floor_text: 'Elke dag', ceiling_text: 'elke dag' } }),
    );

    expect(uit).not.toBeNull();
    expect(uit?.first_weekly_goal).toBeNull();
    expect(uit?.milestones).toHaveLength(2);
  });

  it('geeft de haalbaarheidstegenspraak door als die er is', () => {
    const uit = planUit(plan({ haalbaarheid: 'Twintig kilo in drie maanden is erg snel.' }));
    expect(uit?.haalbaarheid).toBe('Twintig kilo in drie maanden is erg snel.');
  });

  it('laat de identiteitszin null als hij ontbreekt', () => {
    expect(planUit(plan({ identity_statement: '' }))?.identity_statement).toBeNull();
  });
});

describe('de categorielijst in uitvoer.ts', () => {
  it('loopt gelijk met het schema van goals', async () => {
    // ⚠️ `uitvoer.ts` importeert met opzet niets uit een module die de
    //    Supabase-client meetrekt, dus de lijst staat daar in kopie. Deze test
    //    is de grendel daarop: verschuift `CATEGORIEEN` (QS8-224 wil dat), dan
    //    valt hij om en niet stilletjes de categoriekeuze van de Doelcoach.
    const { CATEGORIEEN } = await import('../goals/schemas');

    for (const categorie of CATEGORIEEN) {
      expect(planUit(plan({ category: categorie }))?.category).toBe(categorie);
    }
  });
});
