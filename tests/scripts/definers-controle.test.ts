import { describe, expect, it } from 'vitest';

import {
  beoordeel,
  KERNTABELLEN,
  leestKerntabel,
  ontleed,
  schrijftNaarKerntabel,
  soortVan,
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
    // ⚠️ De vier hieronder horen bij de tabellen die er op 06-09-2026 zijn
    //    bijgekomen (QS8-286). Elk van de vier begint met de naam van een
    //    kerntabel en is er géén — precies de vorm waar `(?![\w-])` voor staat,
    //    en de vorm die een verbrede lijst het makkelijkst stukmaakt.
    ['een groepstabel die er alleen op lijkt', 'insert into group_events (group_id) values (1)'],
    ['een ledentabel met een langere naam', 'update group_member_requests set status = $$x$$'],
    ['een badgetabel met hetzelfde voorvoegsel', 'insert into badge_definities (code) values (1)'],
    ['een verzoektabel met een langere naam', 'delete from deadline_requests_archief where id = 1'],
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

  it('kent elke tabel uit de lijst', () => {
    for (const tabel of KERNTABELLEN) {
      expect(schrijftNaarKerntabel(`insert into ${tabel} (id) values (1)`), tabel).toBe(true);
    }
  });

  /**
   * ⚠️⚠️ **De lijst zelf was de aanname, en dat is de vondst van QS8-286.**
   *    `KERNTABELLEN` telde vijf tabellen die allemaal over een dóél gingen.
   *    Daarbuiten schreven veertien definer-RPC's aan `groups`,
   *    `group_members`, `deadline_requests`, `approval_withdrawals`,
   *    `weekly_plan_steps` en `badges` — en die vielen daardoor buiten élk
   *    rapport. Drie ervan bleken hun eigenaarspoort ongedekt te hebben.
   *
   *    Dat is de sweep-die-zich-voordoet-als-inventarisatie, één laag hoger: het
   *    gereedschap dat de klasse telt trok zijn eigen grens, en niemand mat waar
   *    die grens langs liep.
   *
   * ⚠️ **Deze test bewaakt niet dat de lijst compleet is** — dat kán een test
   *    niet. Hij bewaakt dat de zes die het probleem waren er niet stilletjes
   *    weer uit vallen. Wie er een weghaalt, haalt de bijbehorende functies uit
   *    het register en dat is precies de beweging die dit issue was.
   */
  it('houdt de groepstabellen erin die QS8-286 heeft toegevoegd', () => {
    for (const tabel of [
      'groups',
      'group_members',
      'deadline_requests',
      'approval_withdrawals',
      'weekly_plan_steps',
      'badges',
    ]) {
      expect(KERNTABELLEN, tabel).toContain(tabel);
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

    expect(ontleed(uitvoer)).toEqual([
      { naam: 'schrijver', trigger: false, aanroepbaar: true, soort: 'schrijft' },
      { naam: 'lezer', trigger: false, aanroepbaar: true, soort: 'leest' },
    ]);
  });

  it('leest de vlaggen als `ja`/`nee` en niet als `t`/`f`', () => {
    const uitvoer =
      rij('trg', 'ja', 'nee', 'insert into completions (id) values (1)') +
      rij('rpc', 'nee', 'ja', 'insert into completions (id) values (1)');

    expect(ontleed(uitvoer)).toEqual([
      { naam: 'trg', trigger: true, aanroepbaar: false, soort: 'schrijft' },
      { naam: 'rpc', trigger: false, aanroepbaar: true, soort: 'schrijft' },
    ]);
  });

  it('laat een functie die geen kerntabel aanraakt helemaal weg', () => {
    expect(ontleed(rij('elders', 'nee', 'ja', 'select * from chat_messages'))).toEqual([]);
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

  /**
   * ⚠️ **Zonder dit filter zou het ene register de functies van het andere als
   *    "onbekend" melden, en allebei tegelijk** — QS8-181. Dan is de eerste
   *    uitslag een lijst van dertig namen die er geen van allen thuishoren, en
   *    die leer je overslaan.
   */
  it('kijkt alleen naar de soort die bij dit register hoort', () => {
    const gevonden = [
      { naam: 'bekend', soort: 'schrijft' },
      { naam: 'een_lezer', soort: 'leest' },
    ];

    expect(beoordeel(gevonden, register, 'schrijft')).toEqual({ onbekend: [], verdwenen: [] });
    expect(beoordeel(gevonden, register, 'leest').onbekend).toEqual(['een_lezer']);
  });
});

/**
 * De leeskant — QS8-181.
 *
 * ⚠️ **`SECURITY DEFINER` omzeilt RLS in beide richtingen.** Het schrijfregister
 *    hierboven telt wie er verandert; dit telt wie er léést, want ook een
 *    `select` komt langs elke policy heen. Dat is de klasse waar domeinregel 7
 *    aan hangt en die tot 10-09-2026 in geen enkel rapport stond.
 */
describe('leestKerntabel', () => {
  it.each([
    ['select * from goals where id = 1'],
    ['SELECT 1 FROM public.completions'],
    ['select 1 from x join weekly_goals w on w.id = x.id'],
    ['select 1 from only points_ledger'],
    ['select 1 from "group_members"'],
    ['select 1\n    from\n      groups g'],
  ])('vindt %s', (bron) => {
    expect(leestKerntabel(bron)).toBe(true);
  });

  it.each([
    ['een tabel die er alleen op lijkt', 'select 1 from goal_group_links'],
    ['een tabel met hetzelfde voorvoegsel', 'select 1 from weekly_goals_archief'],
    ['een tabel met een langere naam in een join', 'select 1 from x join group_events e on true'],
    ['een andere tabel', 'select 1 from chat_messages'],
    ['een kerntabel in een commentaar', '-- select 1 from goals\nselect 2;'],
    ['de naam als los woord', "raise exception $$goals is leeg$$"],
    ['de naam als kolom', 'select goals from elders'],
  ])('laat %s met rust', (_naam, bron) => {
    expect(leestKerntabel(bron)).toBe(false);
  });

  it('kent elke tabel uit de lijst', () => {
    for (const tabel of KERNTABELLEN) {
      expect(leestKerntabel(`select 1 from ${tabel}`), tabel).toBe(true);
    }
  });
});

describe('soortVan', () => {
  const f = (over: Partial<{ trigger: boolean; aanroepbaar: boolean; definitie: string }>) => ({
    trigger: false,
    aanroepbaar: true,
    definitie: 'select 1',
    ...over,
  });

  /**
   * ⚠️ **Schrijven wint van lezen.** Bijna elke schrijver leest ook — een
   *    `update … where owner_id = …` valt in beide patronen. Zonder deze
   *    voorrang zou dezelfde functie in twee registers staan met twee redenen
   *    die uit elkaar kunnen lopen.
   */
  it('zet een functie die schrijft én leest bij de schrijvers', () => {
    expect(soortVan(f({ definitie: 'update goals set x = 1 from group_members' }))).toBe(
      'schrijft',
    );
  });

  it('zet een zuivere lezer bij de lezers', () => {
    expect(soortVan(f({ definitie: 'select 1 from group_members' }))).toBe('leest');
  });

  /**
   * ⚠️ De twee gevallen hieronder zijn de grens van het leesregister, en die
   *    staat er met opzet: een triggerfunctie heeft geen aanroeper om te
   *    toetsen, en een functie zonder grant wordt door
   *    `tests/rls/functiegrants.test.ts` bewaakt. Zou een van beide hier tóch
   *    binnenkomen, dan vraagt het register een reden voor iets waar deze
   *    controle niets over kan zeggen.
   */
  it('laat een lezende triggerfunctie buiten het leesregister', () => {
    expect(soortVan(f({ trigger: true, definitie: 'select 1 from group_members' }))).toBe(null);
  });

  it('laat een lezer die authenticated niet mag aanroepen erbuiten', () => {
    expect(soortVan(f({ aanroepbaar: false, definitie: 'select 1 from group_members' }))).toBe(
      null,
    );
  });

  it('laat een functie die geen kerntabel aanraakt helemaal weg', () => {
    expect(soortVan(f({ definitie: 'select 1 from chat_messages' }))).toBe(null);
  });
});
