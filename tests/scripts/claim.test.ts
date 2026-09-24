import { describe, expect, it } from 'vitest';

import {
  botsendeBranches,
  claimNaam,
  claimVoor,
  gelandVoor,
  isGelandeVorm,
  nummerUit,
} from '../../scripts/claim.mjs';

/**
 * Een issue bezetten met een lege branch — QS8-294.
 *
 * ⚠️ **De belofte is niet "het script pusht een branch".** Die is: *twee sessies
 *    bouwen niet twee keer hetzelfde issue*. Het script bereikt dat door de
 *    remote branchlijst te lezen, en heeft daarmee precies twee manieren om
 *    nutteloos te worden:
 *
 *    - hij mist een botsing die er wél is (dan bouw je alsnog dubbel);
 *    - hij meldt een botsing die er niet is (dan leer je de melding overslaan,
 *      en dan mist hij ze allemaal).
 *
 *    Beide helften staan hieronder, en de tweede is niet de minder belangrijke.
 *
 * ⚠️ **De vorm van de eerste helft is gemeten en niet bedacht.** Bij QS8-287
 *    stonden er twee branches met verschillende slugs voor hetzelfde issue,
 *    omdat Linear zijn slug uit de titel maakt en die titel veranderd was. Een
 *    vergelijking op de volledige branchnaam had die botsing gemist.
 */
describe('nummerUit', () => {
  it('kent het issuenummer in elke vorm waarin iemand het intypt', () => {
    for (const vorm of ['QS8-123', 'qs8-123', '#QS8-123', 'Qs8-123', '123']) {
      expect(nummerUit(vorm), vorm).toBe(123);
    }
  });

  it('haalt het nummer ook uit een volledige branchnaam van Linear', () => {
    expect(nummerUit('quintenstrijdonk/qs8-287-verdien-badges-zonder-autorisatietoets')).toBe(287);
  });

  it('zegt nee tegen wat geen issuenummer is', () => {
    for (const vorm of ['', '   ', 'main', 'QS8-', 'abc', '123abc', null, undefined]) {
      expect(nummerUit(vorm), String(vorm)).toBeNull();
    }
  });
});

describe('botsendeBranches', () => {
  const refs = [
    'main',
    'quintenstrijdonk/qs8-287-verdien-badges-zonder-autorisatietoets',
    'quintenstrijdonk/qs8-287-verdien_badges-heeft-geen-autorisatietoets',
    'quintenstrijdonk/qs8-1234-een-heel-ander-issue',
    'quintenstrijdonk/qs8-28-oud-werk',
  ];

  it('vindt béide branches van hetzelfde issue, ook als de slug afwijkt', () => {
    // ⚠️ Dit is het geval van 06-09: twee sessies, twee slugs, één issue.
    expect(botsendeBranches(287, refs)).toEqual([
      'quintenstrijdonk/qs8-287-verdien-badges-zonder-autorisatietoets',
      'quintenstrijdonk/qs8-287-verdien_badges-heeft-geen-autorisatietoets',
    ]);
  });

  it('laat een issue met een gelijkend nummer met rust', () => {
    // ⚠️ De andere helft: `qs8-1234-` is niet `qs8-123`, en `qs8-28-` is niet
    //    `qs8-287-`. Een claim die daarover alarm slaat, leer je overslaan.
    expect(botsendeBranches(123, refs)).toEqual([]);
    expect(botsendeBranches(28, refs)).toEqual(['quintenstrijdonk/qs8-28-oud-werk']);
  });

  it('zwijgt als het issue vrij is', () => {
    expect(botsendeBranches(999, refs)).toEqual([]);
  });

  it('kijkt niet naar hoofdletters', () => {
    expect(botsendeBranches(287, ['quintenstrijdonk/QS8-287-iets'])).toHaveLength(1);
  });
});

describe('claimNaam', () => {
  it('gebruikt de naam van Linear als die meegegeven is', () => {
    const naam = 'quintenstrijdonk/qs8-294-drie-keer-hetzelfde-gebouwd';
    expect(claimNaam(naam, 294)).toEqual({ naam, vanLinear: true });
  });

  it('valt terug op een eigen naam bij een kaal issuenummer, en zegt dat erbij', () => {
    // ⚠️ De terugval wérkt, maar Linear koppelt branch, PR en issue alleen
    //    automatisch bij zíjn eigen naam. Het script hoort dat te melden in
    //    plaats van stilzwijgend iets anders te doen dan de gebruiker verwacht.
    expect(claimNaam('QS8-294', 294)).toEqual({
      naam: 'quintenstrijdonk/qs8-294-claim',
      vanLinear: false,
    });
  });
});

/**
 * De tweede bron: de geschiedenis van `origin/main` — QS8-449.
 *
 * ⚠️ **De belofte hier is niet "de regex klopt" maar "een afgerond issue waarvan
 *    de branch is opgeruimd, komt er niet als vrij uit".** De branchlijst
 *    antwoordt op *"zit hier iemand"*; ze werd ook gelezen als antwoord op *"is
 *    dit al gebouwd"*, en dat is ze niet zodra iemand opruimt.
 *
 * ⚠️ **Elke onderwerpregel hieronder is er een die écht op `main` staat.** Een
 *    zelfverzonnen regel toetst of mijn regex mijn eigen voorbeeld vindt; dit
 *    toetst of hij de vormen vindt die dit project daadwerkelijk produceert.
 */
const ONDERWERPEN = [
  // Vorm 1 — de merge-commit. 232 van de 1109 regels op main.
  'Merge pull request #440 — De overdracht bijgewerkt met de vier valkuilen van 13-09 (QS8-447)',
  'Merge pull request #431 — De taakbalk blijft staan op elk scherm (QS8-437)',
  'Merge pull request #430 — Elk vragenscherm krijgt verder en terug (QS8-438)',
  'Merge pull request #425 — een grant is geen slot zodra de aanroep uit het plan verdwijnt (QS8-433, migratie 0254)',
  // Vorm 2 — de squash. Zo landde QS8-294, het issue dat dit script maakte.
  'Claimen is een commando geworden in plaats van een gewoonte (QS8-294) (#232)',
  // Vorm 3 — de claim-commit die de merge meenam (QS8-611). Het onderwerp van
  // de merge noemt het issue niet; de tweede ouder draagt deze regel wél.
  'Merge pull request #603 — een uitzondering die niet over een uitzondering ging',
  'claim: QS8-606 — bezet sinds 12:08 UTC',
  // ⚠️ Geen van de volgende drie is een landing, en alle drie noemen ze een issue.
  "main erin gehaald om QS8-364 te kunnen landen",
  'Samengaan met main — QS8-174 is geland (0180)',
  'claim: QS8-381 — bezet, gestapeld op QS8-380',
];

describe('isGelandeVorm', () => {
  it('kent de twee vormen waarin werk op main belandt', () => {
    expect(isGelandeVorm('Merge pull request #440 — iets (QS8-447)')).toBe(true);
    expect(isGelandeVorm('Iets moois (QS8-294) (#232)')).toBe(true);
  });

  /**
   * ⚠️ **Dit is de helft die de meting redde.** 📏 Zonder deze grens noemde
   *    14 van de 22 open issues wel érgens een commit op main — dit project
   *    verwijst in vrijwel elke commit-tekst naar een ander issue. Mét de grens
   *    zijn het er drie, en die drie zijn terecht.
   */
  it.each([
    ['een merge van main ín een branch', "main erin gehaald om QS8-364 te kunnen landen"],
    ['een samengaan', 'Samengaan met main — QS8-174 is geland (0180)'],
    // ⚠️ Een claim-commit is geen vórm van een landing; of hij op `main` staat
    //    en dus meegeland is, beslist `claimVoor()` in `gelandVoor()` (QS8-611).
    ['een claim-commit', 'claim: QS8-449 — bezet sinds 13:41 UTC'],
    ['een gewone commit op een branch', 'De kop noemt de voorwaarde niet (QS8-449)'],
    ['een nummer dat op een PR lijkt maar middenin staat', 'Iets (#232) en daarna nog tekst'],
  ])('laat %s met rust', (_naam, regel) => {
    expect(isGelandeVorm(regel)).toBe(false);
  });
});

describe('gelandVoor', () => {
  /**
   * 📏 **De twee gevallen van 13-09-2026.** Beide branches waren na de merge
   *    opgeruimd, dus `botsendeBranches` gaf ze vrij. Dit is wat dat moest
   *    opvangen.
   */
  it('vindt QS8-437 en QS8-438 — de twee die de branchlijst vrijgaf', () => {
    expect(gelandVoor(437, ONDERWERPEN)).toHaveLength(1);
    expect(gelandVoor(438, ONDERWERPEN)).toHaveLength(1);
  });

  it('vindt een squash-landing net zo goed als een merge-commit', () => {
    expect(gelandVoor(294, ONDERWERPEN)).toEqual([
      'Claimen is een commando geworden in plaats van een gewoonte (QS8-294) (#232)',
    ]);
  });

  it('vindt een landing waar het issuenummer een staart achter zich heeft', () => {
    // ⚠️ `(QS8-433, migratie 0254)` — de komma mag de treffer niet breken.
    expect(gelandVoor(433, ONDERWERPEN)).toHaveLength(1);
  });

  /**
   * ⚠️ **De andere helft, en die is hier niet de minder belangrijke.** Deze
   *    melding stáát een claim in de weg. Slaat ze aan op een issue waar niets
   *    voor geland is, dan is `--vervolg` binnen een week een gewoonte en is de
   *    grendel weg — dezelfde afweging als bij `botsendeBranches` hierboven.
   */
  it.each([
    ['een issue waar niets voor geland is', 450],
    ['een nummer dat alleen in een merge-van-main staat', 364],
    ['een nummer dat alleen in een samengaan staat', 174],
    ['de branch waar een gestapelde claim op staat', 380],
  ])('zwijgt bij %s', (_naam, nummer) => {
    expect(gelandVoor(nummer, ONDERWERPEN)).toEqual([]);
  });

  it('verwart 44 niet met 447, en 4471 niet met 447', () => {
    // ⚠️ Links grenst het aan het letterlijke `qs8-`, rechts aan een niet-cijfer.
    expect(gelandVoor(44, ONDERWERPEN)).toEqual([]);
    expect(gelandVoor(4471, ONDERWERPEN)).toEqual([]);
    expect(gelandVoor(43, ONDERWERPEN)).toEqual([]);
  });

  it('kijkt niet naar hoofdletters', () => {
    expect(gelandVoor(447, ['Merge pull request #440 — iets (qs8-447)'])).toHaveLength(1);
  });

  /**
   * 📏 **Het geval van 24-09-2026 (QS8-611).** Het onderwerp van de merge noemt
   *    QS8-606 niet, dus de twee vormen van `isGelandeVorm()` zagen niets en de
   *    claim gaf het issue vrij. De claim-commit die de merge meenam staat wél
   *    op `main`.
   */
  it('MUST-FIND: een landing die alleen aan haar claim-commit te herkennen is', () => {
    expect(gelandVoor(606, ONDERWERPEN)).toEqual(['claim: QS8-606 — bezet sinds 12:08 UTC']);
  });
});

describe('claimVoor', () => {
  it('herkent de claim-commit van dít issue, in elke vorm die op main staat', () => {
    expect(claimVoor(606, 'claim: QS8-606 — bezet sinds 12:08 UTC')).toBe(true);
    expect(claimVoor(381, 'claim: QS8-381 — bezet, gestapeld op QS8-380')).toBe(true);
    expect(claimVoor(345, 'claim: QS8-345 — herbezet, QS8-342 is intussen geland')).toBe(true);
    expect(claimVoor(606, 'claim: qs8-606 — bezet sinds 12:08 UTC')).toBe(true);
  });

  it.each([
    ['het nummer waar een gestapelde claim op staat', 380, 'claim: QS8-381 — bezet, gestapeld op QS8-380'],
    ['een langer nummer', 60, 'claim: QS8-606 — bezet sinds 12:08 UTC'],
    ['een korter nummer', 6061, 'claim: QS8-606 — bezet sinds 12:08 UTC'],
    ['een claim die middenin geciteerd wordt', 777, 'Terug naar claim: QS8-777 — bezet sinds 10:00 UTC'],
    ['een claim zonder issuenummer', 449, 'claim: agentsturing naar risico — bezet sinds 15:05 UTC'],
  ])('laat %s met rust', (_naam, nummer, regel) => {
    expect(claimVoor(nummer, regel)).toBe(false);
  });
});
