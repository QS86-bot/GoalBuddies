import { describe, expect, it } from 'vitest';

import { beoordeel, consoleAanroepen } from '../../scripts/logboek-controle.mjs';

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
