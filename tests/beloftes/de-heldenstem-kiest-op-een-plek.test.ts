import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HELDSLEUTELS, TRIGGERS } from '../../src/modules/helden/helden';
import { kiesStem, magVerschijnen } from '../../src/modules/helden/stem';
import { STEMMOMENTEN } from '../../src/modules/helden/stemteksten';

import { zonderCommentaar } from './roept-aan';

/**
 * De heldenstem wordt op één plek gekozen, en pas ná de gratis poort — QS8-475.
 *
 * ⚠️⚠️ **`stem.test.ts` toetst de regels; dit bestand toetst dat de job ze
 *    gebruikt.** Die suite blijft groen als de meldingenjob `kiesStem()` negeert
 *    en zelf een held kiest, of als hij `hero_profiles` alvast in de
 *    profielquery meeneemt. Allebei breken ze een acceptatiecriterium zonder dat
 *    er iets rood wordt — de eerste regel 18 vraag 1 (waar twee correcte
 *    onderdelen aan elkaar knopen), de tweede het hele bestaansrecht van
 *    `nudge-besluit.ts`.
 *
 * ⚠️ **Waarom een bronscan.** De meldingenjob is een Edge Function: die draait
 *    op Deno en er is hier geen vitest voor. Wat je zonder uitvoeren wél kunt
 *    vastleggen is wáár de opzoeking staat en dat er maar één is. Dezelfde vorm
 *    als `de-vragenlijst-wordt-niet-twee-keer-gesteld.test.ts`.
 *
 * IJKING — met de hand gedraaid op 14-09-2026, mutatie per grendel:
 *
 *   K  `hero_profiles(hero_key)` erbij in de `select(...)` van de profielquery
 *      → "noemt hero_profiles precies één keer in de hele job"
 *   L  een tweede `hoofdheldVan(` erbij, buiten `metHeldenstem`
 *      → "zoekt de hoofdheld op precies één plek op"
 *   M  `kiesStem(` uit de job halen en de held met een eigen ternary kiezen
 *      → "zoekt de hoofdheld op precies één plek op" én "laat de job de keuze
 *        niet zelf maken" — twee, want die mutatie haalt de opzoeking óók weg
 *   N  de áánroep van `noteerVerschijning(` weghalen, de definitie laten staan
 *      → "schrijft elke verschijning weg"
 *
 * ⚠️⚠️ **Twee van deze vier bleven bij de eerste poging groen, en dat is de
 *    reden dat dit blok er staat.** K greep naar `from('hero_profiles')` en
 *    miste daarmee de embedding in een select — precies de vorm die de mutatie
 *    gebruikt. N greep naar `noteerVerschijning(` en matchte de definitie, die
 *    bij het weghalen van de aanroep gewoon blijft staan. Allebei gerepareerd
 *    door te tellen op de kale naam in plaats van op een vorm die toevallig in
 *    beeld was. **Een ijking die niet rood wordt, is de ijking die je wilde
 *    hebben.**
 */

const JOB = zonderCommentaar(
  readFileSync(
    fileURLToPath(new URL('../../supabase/functions/notificaties/index.ts', import.meta.url)),
    'utf8',
  ),
);

describe('de job zoekt de held op één plek op, en pas als hij nodig is', () => {
  it('noemt hero_profiles precies één keer in de hele job', () => {
    // ⚠️ **De profielquery is de plek waar dit stilletjes fout gaat.** Die draait
    //    voor élk profiel, elk uur; `hero_profiles` erbij zetten leest goedkoper
    //    dan het is en maakt het werk van QS8-341 ongedaan.
    //
    // ⚠️⚠️ **Op de tabelnaam en niet op `from('hero_profiles')`, en dat is een
    //    gecorrigeerde grendel.** 📏 Bij de ijking bleek die eerste vorm de
    //    mutatie die hij moest vangen glad te missen: PostgREST neemt een tabel
    //    mee via een **embedding** in de select — `.select('id, tz,
    //    hero_profiles(hero_key), …')` — en daar staat geen `from(` omheen. De
    //    controle stond groen op precies het geval dat zijn eigen comment
    //    beschreef. Op de kale naam telt élke vorm mee.
    const treffers = JOB.match(/hero_profiles/g) ?? [];
    expect(treffers, 'één vermelding, in hoofdheldVan()').toHaveLength(1);
  });

  it('zoekt de hoofdheld op precies één plek op', () => {
    const aanroepen = JOB.match(/\bhoofdheldVan\(/g) ?? [];
    // ⚠️ Twee: de definitie en de ene aanroep in `metHeldenstem()`.
    expect(aanroepen, 'gedefinieerd en één keer aangeroepen').toHaveLength(2);
  });

  it('laat de job de keuze niet zelf maken', () => {
    // ⚠️ Acceptatiecriterium 1. De job mag `kiesStem()` aanroepen en verder niets
    //    over helden beslissen — geen eigen ternary op een triggernaam, geen
    //    tweede lijst met heldsleutels.
    expect(JOB, 'de job gebruikt de gedeelde keuze').toMatch(/kiesStem\(/);

    for (const sleutel of HELDSLEUTELS) {
      expect(JOB.includes(`'${sleutel}'`), `'${sleutel}' staat letterlijk in de job`).toBe(false);
    }
  });

  it('past de dagregel toe en rekent hem niet na', () => {
    expect(JOB, 'de job gebruikt de gedeelde dagregel').toMatch(/magVerschijnen\(/);
  });

  it('schrijft elke verschijning weg', () => {
    // ⚠️ Acceptatiecriterium 4. Zonder deze schrijfactie is de dagregel van de
    //    vólgende melding blind, en dan spreken er alsnog twee helden op één dag.
    // ⚠️⚠️ **Tellen en niet matchen, en ook dit is een gecorrigeerde grendel.**
    //    📏 Bij de ijking bleef `toMatch(/noteerVerschijning\(/)` groen toen ik
    //    de áánroep weghaalde: die vorm matcht ook de definitie, die gewoon
    //    bleef staan. Twee treffers betekent gedefinieerd én één keer
    //    aangeroepen — dezelfde vorm als bij `hoofdheldVan()` hierboven.
    const noteer = JOB.match(/\bnoteerVerschijning\(/g) ?? [];
    expect(noteer, 'gedefinieerd en één keer aangeroepen').toHaveLength(2);

    const tabel = JOB.match(/hero_appearances/g) ?? [];
    expect(tabel.length, 'lezen én schrijven').toBe(2);
  });

  it('bepaalt de dag met shared/time en niet met een eigen aftrekking', () => {
    // ⚠️ Correctheidsregel 7, en het is hier makkelijk mis te gaan: `shown_at` is
    //    een timestamptz en de dag is die van de gebruiker.
    expect(JOB, 'de job gebruikt localDateOf').toMatch(/localDateOf\(/);
  });
});

describe('elke held heeft een zin voor elk moment', () => {
  /**
   * ⚠️ **Dit is de kant die stil breekt.** Een ontbrekende regel geeft geen fout
   *    maar een bericht dat halverwege ophoudt, en dat zie je pas op een
   *    telefoon. De tabel is handwerk; de dekking hoort dat niet te zijn.
   */
  it('dekt zes helden maal drie momenten, in beide talen', async () => {
    const { heldregel } = await import('../../src/modules/helden/stemteksten');

    for (const taal of ['nl', 'en'] as const) {
      for (const held of HELDSLEUTELS) {
        for (const moment of STEMMOMENTEN) {
          const regel = heldregel(held, moment, taal);

          // ⚠️ **Geen minimumlengte, en dat is een gecorrigeerde aanname.** Hier
          //    stond `> 10`, en daar viel Ignis' "Won. Next." op om — precies
          //    tien tekens. Die held ís kort ("Kort, hard, warm vanbinnen"), dus
          //    de drempel toetste geen belofte maar een smaak. Wat wél te
          //    toetsen is: er staat een zin, en hij is afgemaakt.
          expect(regel, `${taal}:${held}:${moment}`).toBeTruthy();
          expect(regel.trim(), `${taal}:${held}:${moment}`).toMatch(/[.!?]$/);
        }
      }
    }
  });

  it('geeft geen twee helden dezelfde zin op hetzelfde moment', async () => {
    // ⚠️ Zes helden die op een aansporing hetzelfde zeggen, is geen stem maar een
    //    sjabloon — en dat is precies waar dit epic tegenin gaat.
    const { heldregel } = await import('../../src/modules/helden/stemteksten');

    for (const taal of ['nl', 'en'] as const) {
      for (const moment of STEMMOMENTEN) {
        const regels = HELDSLEUTELS.map((h) => heldregel(h, moment, taal));
        expect(new Set(regels).size, `${taal}:${moment}`).toBe(regels.length);
      }
    }
  });
});

describe('de regels zelf blijven doen wat de job aanneemt', () => {
  it('geeft voor elke trigger een held terug, ook zonder hoofdheld', () => {
    // ⚠️ De job leunt hierop: hij vraagt de hoofdheld op en geeft `null` door als
    //    er geen is. Zou `kiesStem()` dan `geen` geven bij een trigger, dan
    //    verstomt de contextuele stem voor iedereen die de quiz oversloeg.
    for (const trigger of TRIGGERS) {
      expect(kiesStem(trigger, null).soort, trigger).toBe('held');
    }
  });

  it('laat een tweede held alleen bij een mijlpaal door', () => {
    expect(magVerschijnen(kiesStem('mijlpaal', null), 1)).toBe(true);
    expect(magVerschijnen(kiesStem('misser', null), 1)).toBe(false);
  });
});
