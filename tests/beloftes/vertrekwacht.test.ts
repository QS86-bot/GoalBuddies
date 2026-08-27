import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Een scherm dat belooft je tekst te bewaken, bewaakt óók de uitgangen die het
 * niet zelf tekent — bevinding van 18-08-2026, gesloten op 27-08.
 *
 * ⚠️ **Waarom dit niet in `vertrekwacht.test.ts` kan.** Dat bestand toetst dat
 *    `bindVertrekwacht()` het juiste doet als je hem aanroept. Dit toetst dat
 *    hij aangeroepen wórdt. Dat is regel 18 in het klein: het onderdeel was
 *    sinds EPIC 7 in orde — "Terug naar de groep" werd een waarschuwing zodra er
 *    tekst stond — terwijl verversen, het tabblad sluiten en de hardwareknop
 *    diezelfde tekst gewoon weggooiden. Elk onderdeel klopte; de keten was
 *    korter dan de belofte.
 *
 * ⚠️ **De catalogus is hier het register, en dat is met opzet.** Een scherm mag
 *    zijn tekst niet hardcoderen (`npm run tekst:controle`), dus een tweede
 *    scherm met dezelfde belofte krijgt onvermijdelijk een eigen `*.toch_weg`-
 *    sleutel. Die sleutel is dus het spoor dat een nieuw scherm achterlaat, en
 *    daarop haakt deze test aan. Dat is sterker dan zoeken naar dit ene
 *    bestandspad: verhuist het scherm, dan verhuist de sleutel mee.
 *
 * ⚠️ **Wat hij niet vangt, en dat hoort hier te staan.** Een scherm dat
 *    onopgeslagen tekst heeft maar er nooit voor waarschuwt, laat geen enkel
 *    spoor achter en wordt hier niet gevonden — dezelfde open helft als bij
 *    `keten:controle`. De vraag uit regel 18 blijft het werk: *kan een gebruiker
 *    hier iets kwijtraken, en langs welke knop?*
 *
 * ⚠️ Met de hand rood gemaakt door `useVertrekwacht(vuil, …)` uit
 *    `app/groep/weekafsluiting/[id].tsx` te halen. Dan noemt hij dat bestand met
 *    naam.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

const MAPPEN = ['app', 'src'];

/** De sleutel waarmee een scherm belooft dat weglopen een tweede tik kost. */
const BELOFTE = /\bt\(\s*['"][a-z0-9_.]*\.toch_weg['"]/;

/** Het aansluitpunt dat die belofte waarmaakt buiten de app om. */
const WACHT = /\buseVertrekwacht\s*\(/;

/**
 * De catalogus zelf noemt de sleutel per definitie, en is geen scherm.
 * `src/shared/ui` bevat de wacht en mag de sleutel in commentaar noemen.
 */
const GEEN_SCHERM = /^src\/shared\/(i18n|ui)\//;

export function schermenZonderWacht(
  bestanden: readonly { readonly pad: string; readonly inhoud: string }[],
): string[] {
  return bestanden
    .map((b) => ({ ...b, pad: b.pad.replace(/\\/g, '/') }))
    .filter((b) => !GEEN_SCHERM.test(b.pad))
    .filter((b) => BELOFTE.test(b.inhoud))
    .filter((b) => !WACHT.test(b.inhoud))
    .map((b) => b.pad);
}

function bestanden(map: string): string[] {
  const pad = join(WORTEL, map);
  const gevonden: string[] = [];

  for (const naam of readdirSync(pad)) {
    const vol = join(pad, naam);
    if (statSync(vol).isDirectory()) {
      gevonden.push(...bestanden(join(map, naam)));
    } else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) {
      gevonden.push(join(map, naam));
    }
  }

  return gevonden;
}

describe('schermenZonderWacht — geijkt op losse vormen', () => {
  const gevallen: readonly [string, string, boolean][] = [
    ['belofte zonder wacht', "<Button>{t('week.toch_weg')}</Button>", true],
    [
      'belofte mét wacht',
      "useVertrekwacht(vuil, () => setX(true));\n<Button>{t('week.toch_weg')}</Button>",
      false,
    ],
    ['geen belofte, geen wacht', "<Button>{t('week.terug')}</Button>", false],
    [
      'wacht zonder belofte — mag, dat is strenger dan nodig',
      'useVertrekwacht(vuil, () => setX(true));',
      false,
    ],
    ['dubbele aanhalingstekens', '{t("week.toch_weg")}', true],
    ['spatie na de haak', "{t( 'week.toch_weg' )}", true],
    [
      'een andere sleutel die toevallig zo eindigt',
      "{t('concept.toch_weg')}",
      true,
    ],
    ['de sleutel in commentaar zonder t()', '// week.toch_weg staat in nl.ts', false],
  ];

  for (const [naam, inhoud, verwacht] of gevallen) {
    it(`${naam} → ${verwacht ? 'gemeld' : 'met rust gelaten'}`, () => {
      const uitkomst = schermenZonderWacht([{ pad: 'app/x.tsx', inhoud }]);
      expect(uitkomst).toEqual(verwacht ? ['app/x.tsx'] : []);
    });
  }

  it('laat de catalogus met rust, ook al staat de sleutel er letterlijk in', () => {
    expect(
      schermenZonderWacht([
        { pad: 'src/shared/i18n/nl.ts', inhoud: "'week.toch_weg': 'Toch weg' t('week.toch_weg')" },
      ]),
    ).toEqual([]);
  });
});

describe('de app zelf', () => {
  it('elk scherm dat waarschuwt, bewaakt ook de uitgangen erbuiten', () => {
    const alles = MAPPEN.flatMap((map) =>
      bestanden(map).map((pad) => ({ pad, inhoud: readFileSync(join(WORTEL, pad), 'utf8') })),
    );

    expect(schermenZonderWacht(alles)).toEqual([]);
  });

  it('en er is er minstens één, anders bewaakt deze test niets', () => {
    const alles = MAPPEN.flatMap((map) =>
      bestanden(map).map((pad) => ({ pad, inhoud: readFileSync(join(WORTEL, pad), 'utf8') })),
    );

    const beloften = alles
      .map((b) => b.pad.replace(/\\/g, '/'))
      .filter((pad) => !GEEN_SCHERM.test(pad))
      .filter((pad) => BELOFTE.test(readFileSync(join(WORTEL, pad), 'utf8')));

    expect(beloften.length).toBeGreaterThan(0);
  });
});
