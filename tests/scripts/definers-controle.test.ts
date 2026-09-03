import { describe, expect, it } from 'vitest';

import {
  beoordeel,
  KERNTABELLEN,
  ontleed,
  schrijftNaarKerntabel,
  zonderCommentaar,
} from '../../scripts/definers-controle.mjs';

/**
 * `definers:controle` gevoed met elke vorm — QS8-262.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Dit bestand
 *    biedt de beslissende functies elke vorm los aan: de vormen die ze moeten
 *    vinden én de vormen die ze met rust moeten laten. Die tweede helft is even
 *    belangrijk — een controle die alles meldt, leert je hem te negeren.
 *
 * ⚠️⚠️ **Twee van de gevallen hieronder zijn geen bedenksels maar bugs die het
 *    script bij zijn eerste run had**, en allebei leverden ze een uitslag op die
 *    er plausibel uitzag:
 *
 *    1. De rijscheiding stond als `'\x5cx03'` ín de SQL-tekst, en Postgres leest
 *       dat als vier gewone tekens. De uitvoer werd nooit gesplitst, alles kwam
 *       als één blok binnen, en de naam van de alfabetisch eerste functie kreeg
 *       de bron van álle andere. Het script meldde precies één "onbekende"
 *       functie — met een naam die er relevant uitzag, en die niet eens in een
 *       kerntabel schrijft.
 *    2. De vlaggen kwamen als `true`/`false` terug (dat is wat `||` van een
 *       boolean maakt) terwijl `ontleed()` op `'t'` vergeleek. Het totaal klopte,
 *       de uitsplitsing zei "0 RPC's, 0 triggerfuncties" boven een lijst van 22.
 *
 *    Vorm 1 is nu een test op `ontleed()` met twee rijen; vorm 2 een test op de
 *    vlaggen. Zonder die twee zou het script bij de volgende wijziging opnieuw
 *    stil kunnen gaan liegen.
 */

const SCHEIDING = '\x02';
const RIJ = '\x03';

const rij = (naam: string, trigger: string, aanroepbaar: string, bron: string): string =>
  [naam, trigger, aanroepbaar, bron].join(SCHEIDING) + RIJ;

describe('schrijftNaarKerntabel', () => {
  it.each([
    ['insert into weekly_goals (goal_id) values (1)'],
    ['INSERT INTO public.completions (id) values (1)'],
    ['update goals set status = $$x$$ where id = 1'],
    ['delete from milestones where id = 1'],
    ['update only points_ledger set delta = 0'],
    ['insert into "weekly_goals" (id) values (1)'],
    ['update\n    goals\n  set status = 1'],
  ])('vindt %s', (bron) => {
    expect(schrijftNaarKerntabel(bron)).toBe(true);
  });

  it.each([
    ['een tabel die er alleen op lijkt', 'insert into goal_group_links (goal_id) values (1)'],
    ['een tabel met hetzelfde voorvoegsel', 'update weekly_goals_archief set x = 1'],
    ['alleen lezen', 'select * from goals where id = 1'],
    ['een andere tabel', 'insert into chat_messages (body) values ($$x$$)'],
    ['een verwijzing in een join', 'select 1 from completions c join goals g on g.id = c.id'],
  ])('laat %s met rust', (_naam, bron) => {
    expect(schrijftNaarKerntabel(bron)).toBe(false);
  });

  /**
   * ⚠️ **Dit is de reparatie van 27-08 bij `pin:controle`, hier vooraf ingebouwd.**
   *    Daar sloeg een regex aan op een zin die uitlegde wat een functie juist
   *    níét doet, en de reparatie was toen de zín herschrijven in plaats van de
   *    code. Een commentaar mag nooit bepalen of een functie in het register
   *    hoort.
   */
  it.each([
    ['een regelcommentaar', '-- deze functie doet géén insert into goals\nselect 1;'],
    ['een blokcommentaar', '/* nooit: update goals set owner_id = x */ select 1;'],
  ])('trapt niet in %s', (_naam, bron) => {
    expect(schrijftNaarKerntabel(bron)).toBe(false);
  });

  it('vindt de schrijfactie wél als er óók een commentaar over staat', () => {
    expect(
      schrijftNaarKerntabel('-- hier komt de update\nupdate goals set title = $$x$$;'),
    ).toBe(true);
  });

  it('kent alle vijf de kerntabellen', () => {
    for (const tabel of KERNTABELLEN) {
      expect(schrijftNaarKerntabel(`insert into ${tabel} (id) values (1)`), tabel).toBe(true);
    }
  });
});

describe('zonderCommentaar', () => {
  it('haalt regel- en blokcommentaar weg en laat de rest staan', () => {
    const uit = zonderCommentaar('select 1; -- weg\n/* ook weg */ select 2;');
    expect(uit).not.toContain('weg');
    expect(uit).toContain('select 1');
    expect(uit).toContain('select 2');
  });
});

describe('ontleed', () => {
  /**
   * ⚠️ **Twee rijen en niet één.** Met één rij is een kapotte rijscheiding niet
   *    van een goede te onderscheiden — precies de bug die het script bij zijn
   *    eerste run had.
   */
  it('splitst per rij en houdt de bronnen uit elkaar', () => {
    const uitvoer =
      rij('schrijver', 'nee', 'ja', 'update goals set title = $$x$$') +
      rij('lezer', 'nee', 'ja', 'select * from goals');

    expect(ontleed(uitvoer)).toEqual([{ naam: 'schrijver', trigger: false, aanroepbaar: true }]);
  });

  it('leest de vlaggen als `ja`/`nee` en niet als `t`/`f`', () => {
    const uitvoer =
      rij('trg', 'ja', 'nee', 'insert into completions (id) values (1)') +
      rij('rpc', 'nee', 'ja', 'insert into completions (id) values (1)');

    expect(ontleed(uitvoer)).toEqual([
      { naam: 'trg', trigger: true, aanroepbaar: false },
      { naam: 'rpc', trigger: false, aanroepbaar: true },
    ]);
  });

  it('overleeft een bron die zelf een scheidingsteken-achtig teken draagt', () => {
    const uitvoer = rij('raar', 'nee', 'ja', 'update goals set title = $$a|b\tc$$');
    expect(ontleed(uitvoer)).toHaveLength(1);
  });

  it('geeft niets terug bij lege uitvoer', () => {
    expect(ontleed('')).toEqual([]);
  });
});

describe('beoordeel', () => {
  const register = new Map([['bekend', 'een reden']]);

  it('meldt een functie die niet in het register staat', () => {
    const uit = beoordeel([{ naam: 'bekend' }, { naam: 'nieuw' }], register);
    expect(uit.onbekend).toEqual(['nieuw']);
    expect(uit.verdwenen).toEqual([]);
  });

  it('meldt een register-regel waarvan de functie weg is', () => {
    const uit = beoordeel([], register);
    expect(uit.onbekend).toEqual([]);
    expect(uit.verdwenen).toEqual(['bekend']);
  });

  it('zwijgt als beide kanten kloppen', () => {
    const uit = beoordeel([{ naam: 'bekend' }], register);
    expect(uit.onbekend).toEqual([]);
    expect(uit.verdwenen).toEqual([]);
  });
});
