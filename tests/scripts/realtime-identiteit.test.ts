import { describe, expect, it } from 'vitest';

import { bevindingen, isFout } from '../../scripts/realtime-identiteit-controle.mjs';

/**
 * Het verbod op `REPLICA IDENTITY FULL`, gemeten op productie — QS8-463.
 *
 * ⚠️ **De belofte is niet "de vergelijking klopt" maar: een realtime-tabel die
 *    `full` draagt, komt er niet ongezien doorheen.** Supabase past RLS niet toe
 *    op DELETE; met `full` gaat de volledige oude rij naar elke abonnee. Dat is
 *    domeinregel 7 in zijn ergste vorm, en 0247 leunt er inmiddels op.
 *
 * ⚠️ **Twee uitslagen, en het verschil is opzet.** Gepubliceerd + `full` lekt nú
 *    en is rood. Niet-gepubliceerd + `full` is een geladen wapen en geen schot:
 *    het wordt gemeld, maar het houdt de poort niet tegen. 📏 Die tweede tak
 *    meldde op 13-09-2026 op productie **nul** — gemeten, niet gehoopt, want een
 *    controle die alles meldt leer je te negeren.
 *
 * ⚠️ **Waarom dit een aparte controle is en geen extra test in `epic7`.**
 *    `realtime_bewaking()` bestond al sinds 0027 en is prima; wat ontbrak was een
 *    aanroeper die naar het **échte project** kijkt. De bestaande tests draaien
 *    tegen de lokale stack, en juist daar kán niemand de instelling per ongeluk
 *    in de SQL-editor omzetten.
 *
 * IJKING — met de hand gedraaid op 13-09-2026, één mutatie per grendel:
 *
 *   A  `identiteit !== 'full'` omdraaien naar `=== 'full'`   → 8 rood hier
 *   B  `isFout()` altijd `false` laten geven                 → 2 rood hier
 *   C  de `in_publicatie`-tak vast op 'lekt' zetten          → 2 rood hier
 *
 * ⚠️ **Die getallen zijn gemeten en niet voorspeld, en twee van de drie zaten
 *    ernaast** — ik had 6 en 3 opgeschreven. A raakt meer tests dan verwacht
 *    omdat het omdraaien óók elke "met rust laten"-toets doet afgaan, en C
 *    minder omdat `isFout()` bij één `lekt` hetzelfde antwoord geeft. Een ijking
 *    die zijn verwachting noteert in plaats van zijn meting, is geen ijking.
 */

const rij = (tabel: string, in_publicatie: boolean, replica_identity: string) => ({
  tabel,
  in_publicatie,
  replica_identity,
});

describe('wat de controle moet vinden', () => {
  it('een gepubliceerde tabel met full lekt, en is dus een fout', () => {
    const gevonden = bevindingen([rij('chat_messages', true, 'full')]);

    expect(gevonden).toEqual([{ tabel: 'chat_messages', soort: 'lekt' }]);
    expect(isFout(gevonden)).toBe(true);
  });

  /**
   * ⚠️ Dit is de tak die vandaag niets meldt en die er tóch hoort te zijn: hij
   *    vangt het geval waarin iemand `full` zet vóórdat de tabel gepubliceerd
   *    wordt. Dan is de volgorde van twee losse handelingen het enige dat het
   *    lek nog tegenhoudt, en dat is geen grendel.
   */
  it('een niet-gepubliceerde tabel met full is geladen, en geen fout', () => {
    const gevonden = bevindingen([rij('points_ledger', false, 'full')]);

    expect(gevonden).toEqual([{ tabel: 'points_ledger', soort: 'geladen' }]);
    expect(isFout(gevonden)).toBe(false);
  });

  it('meldt beide naast elkaar, en blijft dan een fout', () => {
    const gevonden = bevindingen([
      rij('points_ledger', false, 'full'),
      rij('completions', true, 'full'),
    ]);

    expect(gevonden.map((b: { soort: string }) => b.soort)).toEqual(['lekt', 'geladen']);
    expect(isFout(gevonden)).toBe(true);
  });

  it('kijkt niet naar hoofdletters of spaties — de waarde komt van een RPC', () => {
    expect(bevindingen([rij('completions', true, ' FULL ')])).toHaveLength(1);
  });
});

describe('wat de controle met rúst moet laten', () => {
  it.each([
    ['de standaard', 'default'],
    ['nothing', 'nothing'],
    ['een index-identiteit', 'index'],
  ])('een gepubliceerde tabel met %s', (_naam, identiteit) => {
    expect(bevindingen([rij('weekly_goals', true, identiteit)])).toEqual([]);
  });

  /**
   * ⚠️ De andere helft, en hier de belangrijkste: `realtime_bewaking()` geeft
   *    **élke** tabel in `public` terug — op 13-09 waren dat er veertig. Meldt
   *    deze controle iets over de zevenendertig die niets mankeren, dan is hij
   *    binnen een week een regel die je wegscrollt.
   */
  it('de hele productiestand van 13-09-2026 geeft nul bevindingen', () => {
    const alles = [
      rij('chat_messages', true, 'default'),
      rij('completions', true, 'default'),
      rij('weekly_goals', true, 'default'),
      ...Array.from({ length: 37 }, (_, i) => rij(`tabel_${i}`, false, 'default')),
    ];

    expect(bevindingen(alles)).toEqual([]);
    expect(isFout(bevindingen(alles))).toBe(false);
  });

  it('een lege uitslag is geen fout', () => {
    expect(bevindingen([])).toEqual([]);
    expect(isFout([])).toBe(false);
  });
});
