import { describe, expect, it } from 'vitest';

import {
  argumenten,
  beoordeel,
  beoordeelRaise,
  consoleAanroepen,
} from '../../scripts/logboek-controle.mjs';

/**
 * De ijking van `logboek-controle` — QS8-206.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Daarom staat de
 *    toets in een geëxporteerde functie en krijgt hij hier elke vorm los
 *    aangeboden: de vormen die hij moet vínden én de vormen die hij met rust moet
 *    laten. Die tweede helft weegt even zwaar — een controle die alles meldt,
 *    leert je hem te negeren, en dan is hij erger dan geen controle.
 *
 * ⚠️ **De meerregelige vorm is geen randgeval maar de kern.** De dossierrij van
 *    28-08 telde twee treffers; het waren er elf. Drie daarvan stonden over
 *    meerdere regels, en een regex per regel loopt daar langs. Dát verschil is de
 *    reden dat deze controle haakjes telt in plaats van regels te lezen.
 *
 * ⚠️⚠️ **De drie klassen worden apart geijkt en niet samen** (16-09-2026, ENGINEER-REVIEW-rij 07-09). Eén
 *    mutatie voor de hele controle bewijst alleen dat er íets rood wordt; wat je
 *    wilt weten is of de grendel die je noemt de zijne pakt. 📏 Dat is hier geen
 *    theorie: bij de eerste ijking van `beoordeelRaise` stond de mutatie in het
 *    bestand en bleef de controle groen, omdat `\btitle\b` het PL/pgSQL-gebruik
 *    `v_title` niet matcht — `_` is een woordteken. Zonder die aparte ijking was
 *    er een grendel geland die niets vindt.
 */

describe('consoleAanroepen', () => {
  it('leest een aanroep die over meerdere regels loopt in zijn geheel', () => {
    // ⚠️ Dit is de vorm die op 28-08 gemist werd.
    const bron = `
      console.error(
        \`versturen mislukte voor \${userId}: \${fout.message}\`,
      );
    `;
    const [eerste] = consoleAanroepen(bron);

    expect(eerste?.tekst).toContain('userId');
  });

  it('knipt niet op een haakje binnen de tekst zelf', () => {
    // Een sjabloonliteral mag haakjes bevatten; een niet-hebzuchtige regex knipt
    // dan op de verkeerde en ziet de rest van het argument niet.
    const bron = 'console.error(`mislukt (na een poging) voor ${user_id}`);';
    const [eerste] = consoleAanroepen(bron);

    expect(eerste?.tekst).toContain('user_id');
  });

  it('vindt elke console-variant en niet alleen error', () => {
    const bron = [
      'console.log(`a ${userId}`);',
      'console.warn(`b ${userId}`);',
      'console.info(`c ${userId}`);',
      'console.debug(`d ${userId}`);',
    ].join('\n');

    expect(consoleAanroepen(bron)).toHaveLength(4);
  });
});

describe('beoordeel — wat hij moet vinden', () => {
  const vormen: readonly (readonly [string, string])[] = [
    ['profiel.id', 'console.error(`mislukt voor ${profiel.id}`);'],
    ['user_id', 'console.error(`mislukt voor ${rij.user_id}`);'],
    ['userId', 'console.error(`mislukt voor ${userId}`);'],
    ['owner_id', 'console.error(`mislukt voor ${doel.owner_id}`);'],
    ['subject_id', 'console.error(`mislukt voor ${a.subject_id}`);'],
    ['actor_id', 'console.error(`mislukt voor ${e.actor_id}`);'],
    ['approver_id', 'console.error(`mislukt voor ${a.approver_id}`);'],
    ['requester_id', 'console.error(`mislukt voor ${v.requester_id}`);'],
    ['auth.uid()', 'console.error(`mislukt voor ${auth.uid()}`);'],
  ];

  for (const [naam, bron] of vormen) {
    it(`meldt ${naam}`, () => {
      expect(beoordeel(bron)).toHaveLength(1);
    });
  }

  it('meldt een geneste eigenschap ook', () => {
    expect(beoordeel('console.error(`voor ${opdracht.userId}: ${f}`);')).toHaveLength(1);
  });
});

describe('beoordeel — wat hij met rust moet laten', () => {
  /**
   * ⚠️ **Dit is de helft die bepaalt of iemand de controle serieus neemt.** Een
   *    doel-id in een logregel is precies wat je nodig hebt om een mislukte stap
   *    terug te vinden, en het wijst geen mens aan. Dezelfde stelregel als in
   *    `persoon-in-jsonb-controle`.
   */
  const metRust: readonly (readonly [string, string])[] = [
    ['goal_id', 'console.error(`mislukt voor ${weekdoel.goal_id}`);'],
    ['group_id', 'console.error(`mislukt voor ${groep.group_id}`);'],
    ['weekdoel.id', 'console.error(`mislukt voor ${weekdoel.id}`);'],
    ['een kale id-variabele', 'console.error(`mislukt voor ${goalId}`);'],
    ['een foutmelding zonder id', 'console.error(`mislukt: ${fout.message}`);'],
    ['een teller', 'console.log(`klaar: ${aantal} profielen`);'],
  ];

  for (const [naam, bron] of metRust) {
    it(`laat ${naam} met rust`, () => {
      expect(beoordeel(bron)).toEqual([]);
    });
  }

  it('kijkt niet buiten een console-aanroep', () => {
    // ⚠️ De code zélf mag `userId` overal gebruiken — dat is het hele punt van
    //    de variabele. Alleen wat de logs in gaat telt.
    const bron = [
      'const userId = opdracht.user_id;',
      'await meld(fout, "notificaties", { userId });',
      'console.error(`versturen mislukte: ${fout.message}`);',
    ].join('\n');

    expect(beoordeel(bron)).toEqual([]);
  });
});

describe('beoordeel — de rúwe melding van de database', () => {
  /**
   * ⚠️ **Dit is de klasse die de naam van de controle waar moest maken.** Tot
   *    16-09-2026 matchte hij uitsluitend broncode-identifiers, en gaf
   *    ``console.error(`x: ${fout.details}`)`` dus **0** treffers — terwijl
   *    `details` gemeten de héle rij draagt die de fout veroorzaakte.
   */
  const vormen: readonly (readonly [string, string])[] = [
    ['.details', 'console.error(`ophalen mislukte: ${fout.details}`);'],
    ['.hint', 'console.error(`ophalen mislukte: ${fout.hint}`);'],
    ['het hele foutobject in een sjabloon', 'console.error(`ophalen mislukte: ${fout}`);'],
    ['JSON.stringify van het foutobject', 'console.error(`mislukt: ${JSON.stringify(fout)}`);'],
    ['het foutobject als kaal argument', "console.error('ophalen mislukte', fout);"],
    ['een kale error', "console.error('mislukt', error);"],
    ['een samengestelde foutnaam', "console.error('mislukt', termijnFout);"],
  ];

  for (const [naam, bron] of vormen) {
    it(`meldt ${naam}`, () => {
      expect(beoordeel(bron)).toHaveLength(1);
    });
  }

  it('noemt de soort, zodat het advies bij de fout past', () => {
    expect(beoordeel('console.error(`x: ${fout.details}`);')[0]?.soort).toBe('melding');
    expect(beoordeel('console.error(`x: ${profiel.id}`);')[0]?.soort).toBe('persoon');
  });
});

describe('beoordeel — wat de meldingsklasse met rust moet laten', () => {
  /**
   * ⚠️ `String(fout)` staat hier bewust bij: op een PostgREST-fout levert die
   *    `[object Object]` op en op een `Error` de melding zonder de rij. Er staan
   *    er vandaag drie in de Edge Functions, en een controle die die drie meldt
   *    is een controle die je leert uitzetten.
   */
  const metRust: readonly (readonly [string, string])[] = [
    ['.message', 'console.error(`ophalen mislukte: ${fout.message}`);'],
    ['.code', 'console.error(`ophalen mislukte: ${fout.code}`);'],
    ['String(fout)', 'console.error(`mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);'],
    ['een komma binnen de tekst', 'console.error(`mislukt, opnieuw: ${fout.message}`);'],
    ['een tekst die het woord fout bevat', "console.error('er gaat geen foutmelding uit.');"],
  ];

  for (const [naam, bron] of metRust) {
    it(`laat ${naam} met rust`, () => {
      expect(beoordeel(bron)).toEqual([]);
    });
  }
});

describe('argumenten', () => {
  it('splitst niet op een komma binnen een sjabloonliteral', () => {
    // ⚠️ Zonder dit leest `fout` nooit meer als kale variabelenaam en mist de
    //    toets precies het geval waarvoor hij bestaat.
    expect(argumenten('console.error(`a, b`, fout)')).toEqual(['`a, b`', 'fout']);
  });

  it('splitst niet op een komma binnen een objectargument', () => {
    expect(argumenten('console.error("x", { a: 1, b: 2 })')).toEqual(['"x"', '{ a: 1, b: 2 }']);
  });
});

describe('beoordeelRaise — de bronkant van dezelfde belofte', () => {
  /**
   * ⚠️ **Waarom deze klasse bestaat.** `scrub.ts` zegt met zoveel woorden dat een
   *    `%`-interpolatie *de waarde die de fout veroorzaakte* in `message` zet en
   *    dat `scrubMessage()` die vorm er niet uit haalt. Zolang geen enkele
   *    `raise exception` een persoon of gebruikerstekst interpoleert, is
   *    `${fout.message}` in een logregel veilig. Deze toets is wat dat "zolang"
   *    waar houdt.
   */
  const vormen: readonly (readonly [string, string])[] = [
    ['een v_-variabele met een titel', "raise exception 'doel %', v_title;"],
    ['een p_-parameter met een persoon', "raise exception 'lid %', p_user_id;"],
    ['new.title', "raise exception 'doel %', new.title;"],
    ['display_name', "raise exception 'hoi %', v_display_name;"],
    ['auth.uid()', "raise exception 'jij bent %', auth.uid();"],
    ['een notitie', "raise exception 'notitie %', v_note;"],
    ['een reden', "raise exception 'reden %', v_reason;"],
  ];

  for (const [naam, bron] of vormen) {
    it(`meldt ${naam}`, () => {
      expect(beoordeelRaise(bron)).toHaveLength(1);
    });
  }

  const metRust: readonly (readonly [string, string])[] = [
    ['een teller', "raise exception 'te veel (%)', v_aantal;"],
    ['een doel-id', "raise exception 'doel % bestaat niet', v_goal_id;"],
    ['een groeps-id', "raise exception 'groep %', g.id;"],
    ['een voltooiings-id', "raise exception 'voltooiing % bestaat niet', new.completion_id;"],
    ['een tijdzone', "raise exception '% is geen bekende tijdzone', new.tz;"],
    ['het woord title in de meldingstekst zelf', "raise exception 'kolom title ontbreekt';"],
    ['een errcode zonder argumenten', "raise exception 'nee' using errcode = 'check_violation';"],
    ['een raise warning', "raise warning 'badges voor % mislukt', v_user_id;"],
  ];

  for (const [naam, bron] of metRust) {
    it(`laat ${naam} met rust`, () => {
      expect(beoordeelRaise(bron)).toEqual([]);
    });
  }

  it('leest een raise die over meerdere regels loopt', () => {
    const bron = [
      "raise exception 'doel % van %',",
      '  v_goal_id,',
      '  v_display_name;',
    ].join('\n');

    expect(beoordeelRaise(bron)).toHaveLength(1);
  });
});
