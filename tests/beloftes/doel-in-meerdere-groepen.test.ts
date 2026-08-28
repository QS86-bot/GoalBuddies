import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { beslissendeGroep } from '../../src/modules/buddies/deling';

/**
 * Een verzoek om je streefdatum te verschuiven gaat naar de groep die je
 * aanwijst — QS8-56 (PRD 5.5).
 *
 * ⚠️ **Waarom dit bestand naast `deling.test.ts` staat, en dat is de hele les.**
 *    `beslissendeGroep()` kán bij twee groepen geen groep kiezen zonder keuze —
 *    dat is de structurele helft en die staat in `deling.test.ts`. De tweede
 *    helft is dat het scherm die functie ook echt gebruikt, en dat is een naad.
 *
 *    Tot QS8-56 stond er in `app/doel/[id].tsx` letterlijk `const groep =
 *    groepen[0]`. Elk onderdeel klopte: `vraagDeadlineVerschuiving()` toetste
 *    lidmaatschap én koppeling (migratie 0032), en die toetsen waren allebei
 *    getest. Wat niemand toetste was dat het scherm de gebruiker nooit gevraagd
 *    had welke van zijn groepen erover ging. Dat kon ook niet opvallen: er was
 *    geen scherm dat een doel aan twéé groepen hing, dus de toestand was
 *    onbereikbaar. PRD 5.5 is precies dat scherm.
 *
 * ⚠️ **De controles hieronder staan als functie en niet als losse regex in de
 *    test, omdat een controle die je niet kunt voeden, niet te ijken is** —
 *    QS8-115. Ze worden hieronder élke vorm los aangeboden: de vormen die ze
 *    moeten vangen én de vormen die ze met rust moeten laten.
 */

const SCHERM = fileURLToPath(new URL('../../app/doel/[id].tsx', import.meta.url));

/**
 * Onder welke naam bindt het scherm de beslissende groep?
 *
 * `null` betekent: het scherm bepaalt de beslisser zélf, en dan zegt
 * `beslissendeGroep()` niets meer over wat er daadwerkelijk gebeurt.
 */
export function beslisserNaam(inhoud: string): string | null {
  const gevonden = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*beslissendeGroep\(/.exec(inhoud);
  return gevonden?.[1] ?? null;
}

/**
 * Krijgt `vraagDeadlineVerschuiving()` de groep uit die binding, en niets anders?
 *
 * ⚠️ Kijkt naar het **tweede argument** en niet naar de aanwezigheid van de naam
 *    ergens in het bestand. Een scherm dat `beslissendeGroep()` netjes aanroept en
 *    er vervolgens `groepen[0].group_id` naast wegstuurt, is precies het geval dat
 *    deze test moet vangen — en dat is niet denkbeeldig, want dat is de regel die
 *    er tot QS8-56 stond.
 */
export function verzoekGebruiktBeslisser(inhoud: string, naam: string): boolean {
  const aanroep = /vraagDeadlineVerschuiving\(\s*([^)]*?)\)/s.exec(inhoud);
  const binnenkant = aanroep?.[1];
  if (binnenkant === undefined) return false;

  const argumenten = binnenkant
    .split(',')
    .map((deel) => deel.trim())
    .filter((deel) => deel.length > 0);

  return argumenten[1] === `${naam}.group_id`;
}

describe('beslisserNaam', () => {
  it('vindt de binding', () => {
    expect(beslisserNaam('const groep = beslissendeGroep(groepen, groepId);')).toBe('groep');
    expect(beslisserNaam('  const beslisser = beslissendeGroep(a, b);')).toBe('beslisser');
  });

  it('vindt niets als het scherm zelf kiest', () => {
    expect(beslisserNaam('const groep = groepen[0];')).toBeNull();
    expect(beslisserNaam('const groep = groepen.find((g) => g.group_id === groepId);')).toBeNull();
    // De import alleen is geen binding — dan is de functie er wel en doet ze niets.
    expect(beslisserNaam("import { beslissendeGroep } from '@/modules/buddies';")).toBeNull();
  });
});

describe('verzoekGebruiktBeslisser', () => {
  it('herkent de goede aanroep', () => {
    const goed = 'await vraagDeadlineVerschuiving(doel.id, groep.group_id, { a: 1 }, vandaag)';
    expect(verzoekGebruiktBeslisser(goed, 'groep')).toBe(true);
  });

  it('herkent hem ook over meerdere regels', () => {
    const goed = `await vraagDeadlineVerschuiving(
      doel.id,
      groep.group_id,
      { new_date: datum },
      vandaag,
    )`;
    expect(verzoekGebruiktBeslisser(goed, 'groep')).toBe(true);
  });

  it('vangt de stille eerste groep', () => {
    const fout = 'vraagDeadlineVerschuiving(doel.id, groepen[0].group_id, {}, vandaag)';
    expect(verzoekGebruiktBeslisser(fout, 'groep')).toBe(false);
  });

  it('vangt de terugval op leeg', () => {
    const fout = "vraagDeadlineVerschuiving(doel.id, groep?.group_id ?? '', {}, vandaag)";
    expect(verzoekGebruiktBeslisser(fout, 'groep')).toBe(false);
  });

  it('vangt een aanroep die er helemaal niet is', () => {
    expect(verzoekGebruiktBeslisser('niets hier', 'groep')).toBe(false);
  });

  it('laat een andere binding niet doorglippen', () => {
    const fout = 'vraagDeadlineVerschuiving(doel.id, andereGroep.group_id, {}, vandaag)';
    expect(verzoekGebruiktBeslisser(fout, 'groep')).toBe(false);
  });
});

describe('het doelscherm', () => {
  const inhoud = readFileSync(SCHERM, 'utf8');

  it('laat `beslissendeGroep()` bepalen wie beslist', () => {
    const naam = beslisserNaam(inhoud);

    expect(naam, 'het scherm bindt de beslissende groep niet aan beslissendeGroep()').not.toBeNull();
    expect(
      verzoekGebruiktBeslisser(inhoud, naam ?? ''),
      'het deadlineverzoek gaat naar een andere groep dan beslissendeGroep() aanwijst',
    ).toBe(true);
  });

  it('heeft een zin voor de gebruiker die nog niet gekozen heeft', () => {
    // ⚠️ De sleutel en niet de zin — QS8-115. Een test die de Nederlandse tekst
    //    zoekt, verhuist niet mee naar de catalogus en bewaakt daarna niets.
    expect(inhoud).toContain('deling.kies_eerst');
  });

  /**
   * ⚠️ **Dit is de rij die `beloftes.test.ts` in `TOEGESTAAN` op zijn woord
   *    gelooft.** Daar staat als reden: "app/doel/[id].tsx kiest per groep". Zonder
   *    deze test is dat een bewering in een commentaarregel. Een doel mag tegelijk
   *    in een open en een beschermde groep staan — EPIC 13 toetst die stand — dus
   *    één zin voor de hele lijst zou voor de helft onwaar zijn.
   */
  it('kiest de belofte per groep op de zichtbaarheid van die groep', () => {
    expect(inhoud).toContain('deling.uitleg_open');
    expect(inhoud).toContain('deling.uitleg_beschermd');

    const keuzes = inhoud.match(
      /zichtbaarheid === 'open'\s*\?\s*t\('deling\.uitleg_open'\)\s*:\s*t\('deling\.uitleg_beschermd'\)/g,
    );

    // Twee lijsten: de groepen waar het doel in staat, en de groepen waar het nog
    // bij kan. Allebei tonen ze een koppel- of ontkoppelmoment, dus allebei moeten
    // ze de juiste zin kiezen.
    expect(keuzes?.length, 'niet elke lijst kiest de zin op zichtbaarheid').toBe(2);
  });
});

/**
 * ⚠️ Eén regel die geen naad is maar een geheugensteun: `beslissendeGroep()` doet
 *    bij nul groepen niets. Zonder deze verwachting zou iemand de functie kunnen
 *    laten teruggeven wat er ook is, en dan zou het scherm een persoonlijk doel
 *    ineens langs een groep sturen.
 */
describe('een doel zonder groep', () => {
  it('heeft geen beslisser', () => {
    expect(beslissendeGroep([], 'wat dan ook')).toBeUndefined();
  });
});
