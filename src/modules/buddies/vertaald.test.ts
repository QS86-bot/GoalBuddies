import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../../shared/i18n';

import { BEWIJSEISEN, bewijseisLabels, huddledagen, huddledagLabel } from './schemas';
import { vragen } from './weekafsluiting-schemas';

/**
 * QS8-115, modules-laag: `buddies`.
 *
 * ⚠️ Zoals overal in deze migratie toetst dit iets anders dan de bestaande
 *    tests: **of de tekst überhaupt nog van de taal afhangt.** De inhoud wordt
 *    elders bewaakt.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('de huddledagen', () => {
  it('komen in de taal van de gebruiker', () => {
    zetTaal('nl');
    expect(huddledagLabel(1)).toBe('Maandag');

    zetTaal('en');
    expect(huddledagLabel(1)).toBe('Monday');
  });

  it('staan in beide talen met maandag voorop en zondag achteraan', () => {
    // ⚠️ De vólgorde is een productkeuze en geen locale-data: die hoort niet mee
    //    te veranderen met de taal.
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      expect(
        huddledagen().map((d) => d.waarde),
        taalcode,
      ).toEqual([1, 2, 3, 4, 5, 6, 0]);
    }
  });

  it('geeft zeven verschillende namen', () => {
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      expect(new Set(huddledagen().map((d) => d.label)).size, taalcode).toBe(7);
    }
  });

  it('valt bij een waarde buiten 0–6 terug op zondag en niet op een gewrapte dag', () => {
    // ⚠️ `weekdagNaam` rekent modulo, dus 9 zou stilzwijgend dinsdag opleveren.
    //    Een waarde buiten het bereik is een fout in de data en hoort niet als
    //    een geldige dag te lezen.
    zetTaal('nl');
    expect(huddledagLabel(9)).toBe('Zondag');
    expect(huddledagLabel(-1)).toBe('Zondag');
  });
});

describe('de bewijseisen', () => {
  it('hebben in elke taal net zoveel verschillende labels als er eisen zijn', () => {
    // ⚠️ **`BEWIJSEISEN.length` en geen vast getal — QS8-261.** Hier stond `3`,
    //    en toen `note_and_attachment` met 0150 verdween, werd deze test rood
    //    zonder dat er iets stuk was. Een getal dat de lijst nálopt in plaats van
    //    hem te lézen, is een tweede lijst; dat is de fout van 0032/0034 in
    //    testvorm.
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      const labels = Object.values(bewijseisLabels());

      expect(new Set(labels).size, taalcode).toBe(BEWIJSEISEN.length);
      for (const label of labels) expect(label.trim(), taalcode).not.toBe('');
    }
  });
});

describe('de weekafsluiting', () => {
  it('zegt in beide talen bij vraag 2 dat de groep meeleest om te helpen', () => {
    // ⚠️ **Dit is domeinregel 7 en geen copy.** Vraag 2 is een van de drie routes
    //    waarlangs tegenslag de groep bereikt, en alle drie lopen ze via de
    //    gebruiker zelf. De hint zegt daarom expliciet dat de groep meeleest om
    //    te helpen en niet om te beoordelen; een vertaler die de code niet kent,
    //    weet dat niet en kan die zin ongemerkt vlakker maken.
    zetTaal('nl');
    const nl = vragen().find((v) => v.veld === 'blocked_text');
    expect(nl?.hint).toContain('helpen');
    expect(nl?.hint).toContain('niet om te beoordelen');

    zetTaal('en');
    const en = vragen().find((v) => v.veld === 'blocked_text');
    expect(en?.hint).toContain('help');
    expect(en?.hint).toContain('not to judge');
  });

  it('heeft in beide talen drie vragen met een eigen label en voorbeeld', () => {
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);

      expect(vragen(), taalcode).toHaveLength(3);
      expect(new Set(vragen().map((v) => v.label)).size, taalcode).toBe(3);

      for (const vraag of vragen()) {
        expect(vraag.label.trim(), taalcode).not.toBe('');
        expect(vraag.hint.trim(), taalcode).not.toBe('');
      }
    }
  });
});
