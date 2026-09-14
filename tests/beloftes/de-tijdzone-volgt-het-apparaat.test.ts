import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { moetSynchroniseren } from '../../src/modules/auth/tijdzonesync-regel';
import { userCycle } from '../../src/shared/time';

const WORTEL = join(__dirname, '..', '..');

/**
 * De belofte: **wie van tijdzone verandert, ziet zijn week meeverschuiven** —
 * QS8-472.
 *
 * ⚠️ **Niet "de helper geeft de goede string terug".** Dat is een eigenschap van
 *    het onderdeel en hij blijft kloppen terwijl de belofte breekt: een zone die
 *    netjes wordt opgehaald en nooit wordt weggeschreven, voldoet eraan. Wat hier
 *    getoetst wordt is de naad — de zone bepaalt waar de cyclusgrens ligt — plus
 *    de vraag wanneer er überhaupt geschreven wordt.
 *
 * ⚠️ **Waarom dit een naad is en geen detail.** Het handmatige veld is weg
 *    (`TijdzoneKeuze`, QS8-27/QS8-212), dus `useTijdzoneSync()` is het énige pad
 *    waarlangs `profiles.tz` nog verandert. Schrijft die hook niet, dan rekent de
 *    hele app permanent in de zone van de dag waarop je je aanmeldde, en geen
 *    scherm laat dat zien. Afweging in
 *    `docs/decisions/2026-09-14-de-tijdzone-komt-uit-het-apparaat.md`.
 *
 * ⚠️⚠️ **Twee ijkingen kwamen groen terug en de oorzaak lag in het ijkharnas,
 *    niet in de grendel.** Het script maakte per bestand een back-up op
 *    `basename`, en `app/(tabs)/profiel.tsx` en `app/onboarding/profiel.tsx`
 *    heten allebei `profiel.tsx` — dus de mutatie op het ene scherm werd door de
 *    herstelstap van het andere teruggedraaid vóórdat de suite draaide, en het
 *    tabblad hield daarna de inhoud van de onboarding over. Een ijking is een
 *    meting, en een meetopstelling die twee dingen dezelfde naam geeft, meet het
 *    verkeerde ding. Zelfde les als CLAUDE.md bij QS8-412: kijk wélke toets
 *    omvalt, en of er überhaupt iets gemuteerd was.
 */

describe('de zone bepaalt waar de cyclusgrens ligt', () => {
  /**
   * Twee week-starts, want domeinregel 1 eist dat — en per week-start een moment
   * dat de grens van díé week-start doorsnijdt.
   *
   * ⚠️ **Een dag verschil is niet genoeg, en dat is de valkuil die deze toets
   *    eerst had.** Op 2026-09-14T11:30:00Z is het in Amsterdam maandag de 14e en
   *    in Auckland dinsdag de 15e — twee verschillende dagen, maar dezelfde
   *    cyclus, want een cyclus is een week. De zone doet pas iets als de twee
   *    zones aan wéérszijden van de startdag vallen. 📏 Zonder dat inzicht stond
   *    hier een toets die op beide week-starts omviel terwijl de code klopte.
   */
  const GEVALLEN = [
    // Zondag 23:30 in Amsterdam is al maandag 09:30 in Auckland.
    { dag: 1 as const, moment: new Date('2026-09-13T21:30:00Z') },
    // Woensdag 23:30 in Amsterdam is al donderdag 09:30 in Auckland.
    { dag: 4 as const, moment: new Date('2026-09-16T21:30:00Z') },
  ];

  it.each(GEVALLEN)('geeft met week-start $dag een andere grens per zone', ({ dag, moment }) => {
    const amsterdam = userCycle({ weekStartDay: dag, tz: 'Europe/Amsterdam' }, moment);
    const auckland = userCycle({ weekStartDay: dag, tz: 'Pacific/Auckland' }, moment);

    expect(
      amsterdam.startDate === auckland.startDate && amsterdam.endDate === auckland.endDate,
      'twee zones aan weerszijden van de week-startdag geven dezelfde cyclus — de zone doet dan niets',
    ).toBe(false);
  });

  /**
   * ⚠️ **De must-allow-helft.** Zonder deze toets is de bovenstaande te
   *    bevredigen door `userCycle()` per aanroep iets anders te laten teruggeven.
   *    Dezelfde zone hoort dezelfde grens te geven.
   */
  it.each(GEVALLEN)('geeft met week-start $dag dezelfde grens voor dezelfde zone', ({ dag, moment }) => {
    const een = userCycle({ weekStartDay: dag, tz: 'Europe/Amsterdam' }, moment);
    const twee = userCycle({ weekStartDay: dag, tz: 'Europe/Amsterdam' }, moment);

    expect(een.startDate).toBe(twee.startDate);
    expect(een.endDate).toBe(twee.endDate);
  });
});

describe('er wordt geschreven wanneer het moet en niet vaker', () => {
  it('schrijft als het profiel nog geen zone heeft', () => {
    expect(
      moetSynchroniseren({ opgeslagen: '', apparaat: 'Europe/Amsterdam', geprobeerd: null }),
    ).toBe(true);
  });

  it('schrijft als het apparaat een andere zone meldt', () => {
    expect(
      moetSynchroniseren({
        opgeslagen: 'Europe/Amsterdam',
        apparaat: 'Pacific/Auckland',
        geprobeerd: null,
      }),
    ).toBe(true);
  });

  /**
   * ⚠️ **De must-allow-helft, en hier is hij het zwaarst.** Een sync die bij
   *    elke start schrijft ook als er niets veranderd is, is een schrijfactie per
   *    app-start per gebruiker. Dat is geen netheid maar `max_connections = 60`
   *    voor de héle database.
   */
  it('schrijft niet als de zone al klopt', () => {
    expect(
      moetSynchroniseren({
        opgeslagen: 'Europe/Amsterdam',
        apparaat: 'Europe/Amsterdam',
        geprobeerd: null,
      }),
    ).toBe(false);
  });

  /**
   * ⚠️ `Intl` accepteert `europe/amsterdam`, en een profiel dat zo is opgeslagen
   *    werkt prima. Zou hier op de ruwe string vergeleken worden, dan werd dat
   *    profiel bij élke start herschreven met dezelfde zone in een ander jasje.
   */
  it('schrijft niet voor dezelfde zone in een andere schrijfwijze', () => {
    expect(
      moetSynchroniseren({
        opgeslagen: 'europe/amsterdam',
        apparaat: 'Europe/Amsterdam',
        geprobeerd: null,
      }),
    ).toBe(false);
  });

  /**
   * ⚠️⚠️ **De grendel tegen een schrijflus.** Schrijft de server de zone anders
   *    terug dan wij aanboden, dan blijft "opgeslagen ≠ apparaat" waar en gaat
   *    het effect bij elke render opnieuw. Eén poging per zone — en een mislukte
   *    poging telt óók mee, want juist die herhaalt zich anders eindeloos.
   */
  it('probeert dezelfde zone geen tweede keer, ook niet na een mislukking', () => {
    expect(
      moetSynchroniseren({
        opgeslagen: 'Europe/Amsterdam',
        apparaat: 'Pacific/Auckland',
        geprobeerd: 'Pacific/Auckland',
      }),
    ).toBe(false);
  });

  /**
   * ⚠️ De must-allow-helft van de grendel hierboven: de ref mag geen slot zijn.
   *    Verhuist iemand dóór, dan is dat een nieuwe zone en hoort hij wél
   *    geschreven te worden.
   */
  it('schrijft wél als er daarna een derde zone langskomt', () => {
    expect(
      moetSynchroniseren({
        opgeslagen: 'Europe/Amsterdam',
        apparaat: 'Asia/Tokyo',
        geprobeerd: 'Pacific/Auckland',
      }),
    ).toBe(true);
  });
});

/**
 * ⚠️ **Geen scherm laat de gebruiker een tijdzone kíezen** — QS8-472,
 *    acceptatiecriterium 2.
 *
 * ⚠️⚠️ **De eerste vorm van deze grendel was fout, en de ijking liet dat niet
 *    zien.** Hij luidde "geen scherm schrijft een `tz`" en matchte op
 *    `/\btz:\s*[A-Za-z_$]/`. 📏 `app/onboarding/profiel.tsx` schrijft `tz` als
 *    **shorthand** (`tz,` op regel 118), dus die grendel was groen terwijl er wel
 *    degelijk een tweede schrijver stond — en alle zeven ijkingen kwamen netjes
 *    rood. Een ijking toetst of een grendel afgaat op wat hij zóekt, niet of hij
 *    het juiste zoekt; dat blijft handwerk, precies zoals CLAUDE.md bij
 *    `padverwijzing:controle` zegt.
 *
 * ⚠️ **De belofte is daarom scherper geformuleerd.** De onboarding mág `tz`
 *    schrijven: die waarde is afgeleid van `apparaatTijdzone()` en niet gekozen,
 *    en bij een vers profiel is dat de eerste keer dat de kolom gevuld wordt. Wat
 *    niet mag is een pad waarlangs een mens een andere zone kan zetten dan zijn
 *    apparaat meldt — dat is het pad dat met `TijdzoneKeuze` verdween. Vandaar:
 *    geen zetter en geen keuzecomponent, en de waarde komt aantoonbaar uit het
 *    apparaat.
 */
describe('geen scherm laat de gebruiker een tijdzone kiezen', () => {
  const SCHERMEN = [
    join(WORTEL, 'app', '(tabs)', 'profiel.tsx'),
    join(WORTEL, 'app', 'onboarding', 'profiel.tsx'),
  ];

  it.each(SCHERMEN)('%s heeft geen zetter en geen keuzecomponent', (pad) => {
    expect(
      () => statSync(pad),
      `${pad} is verdwenen of hernoemd — verhuis deze grendel mee`,
    ).not.toThrow();

    const bron = readFileSync(pad, 'utf8');

    expect(
      /\bsetTz\b/.test(bron),
      'dit scherm heeft een zetter voor de tijdzone — dan kan een mens hem alsnog kiezen',
    ).toBe(false);
    expect(
      /^import[^;]*\bTijdzoneKeuze\b/m.test(bron),
      'dit scherm importeert weer een tijdzonekeuze',
    ).toBe(false);
  });

  /**
   * ⚠️ De must-allow-helft: de onboarding schrijft `tz` en dat hóórt. Wat deze
   *    toets vastlegt is waar die waarde vandaan komt — uit het apparaat, niet
   *    uit een veld. Zonder deze helft is de toets hierboven te bevredigen door
   *    de onboarding een willekeurige constante te laten schrijven.
   */
  it('laat de onboarding zijn zone uit het apparaat halen', () => {
    const bron = readFileSync(join(WORTEL, 'app', 'onboarding', 'profiel.tsx'), 'utf8');

    expect(bron, 'de onboarding leidt zijn tijdzone niet meer af van het apparaat').toMatch(
      /const \[tz\][^\n]*apparaatTijdzone\(\)/,
    );
  });

  /** Het profieltabblad schrijft helemáál geen zone — daar is niets te vullen. */
  it('laat het profieltabblad zelf geen tz schrijven', () => {
    const bron = readFileSync(join(WORTEL, 'app', '(tabs)', 'profiel.tsx'), 'utf8');
    const schrijft = /\btz[:,]\s*(?:[A-Za-z_$][A-Za-z0-9_$]*)?\s*\}/.exec(bron);

    expect(
      schrijft,
      `het profieltabblad schrijft zelf een tijdzone (${schrijft?.[0] ?? ''})`,
    ).toBeNull();
  });

  it('en de enige schrijver bij elke start staat er ook echt', () => {
    const bron = readFileSync(join(WORTEL, 'app', '_layout.tsx'), 'utf8');

    expect(
      bron,
      'geen <Tijdzonewacht /> in app/_layout.tsx — dan verandert profiles.tz na de onboarding nergens meer',
    ).toMatch(/<Tijdzonewacht \/>/);
  });
});
