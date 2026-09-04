import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * De terugknop van de browser hoort bij de wacht, en de nooduitgang blijft open.
 *
 * ⚠️ **Waarom dit een eigen bestand is naast `vertrekwacht.test.ts`.** Dat
 *    bestand toetst wat `bindVertrekwacht()` doet als je hem aanroept, en
 *    `vertrekstap()` toetst de volgorde. Allebei onderdelen. Wat hier getoetst
 *    wordt is de knoop: krijgt het routerbeen dezelfde schakelaar en hetzelfde
 *    meldkanaal als de andere twee, en kan een scherm nog wél weg. Dat kan geen
 *    van beide bestanden zien, want het gaat om het aansluiten en niet om het
 *    aangeslotene.
 *
 * ⚠️ **Waarom niet met een React-testrunner.** `useVertrekwacht.ts` importeert
 *    `react-native` (Flow) en `expo-router`; dit project draait zijn tests in
 *    node en heeft daar met opzet geen renderer bij gezet. De keuze is dus niet
 *    "gedrag of tekst" maar "tekst of niets" — en niets is hier de duurdere: de
 *    twee fouten die dit vangt zijn allebei stil.
 *
 * ⚠️ **Het spoor is de definitie en niet een bestandspad.** Het aansluitpunt
 *    wordt gezocht op `export function useVertrekwacht`. Verhuist het bestand,
 *    dan verhuist deze test mee — de val van 03-09 was drie keer een test die de
 *    plek bewaakte in plaats van de belofte.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));
const MAPPEN = ['app', 'src'];

/** Het toegangspunt dat expo-router publiceert. Niet de interne indeling. */
const TOEGANGSPUNT = 'expo-router/react-navigation';

const DEFINITIE = /export\s+function\s+useVertrekwacht\s*\(/;
const IMPORT = /import\s*\{[^}]*\busePreventRemove\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/;
const BIND_ACTIEF = /bindVertrekwacht\(\{[\s\S]{0,400}?\bactief:\s*([^,\n]+?)\s*,/;
const BIND_MELDING = /bindVertrekwacht\(\{[\s\S]{0,400}?\bopGeblokkeerd:\s*([^\n]+?)\s*,\s*$/m;
const AANROEP = /\busePreventRemove\(\s*([^,]+?)\s*,\s*([\s\S]*?)\)\s*;/;

/**
 * Wat er mis is met het routerbeen in dit bestand. Leeg is goed.
 *
 * ⚠️ **Onleesbaar is hier een gebrek en geen overslaan.** Kan een van de vier
 *    stukken niet gevonden worden, dan meldt hij dat met naam. Een controle die
 *    bij twijfel zwijgt, is groen om de verkeerde reden — de fout van QS8-213.
 */
export function routerbeenGebreken(inhoud: string): string[] {
  const gebreken: string[] = [];

  const invoer = IMPORT.exec(inhoud);
  if (invoer === null) {
    gebreken.push('usePreventRemove wordt nergens geïmporteerd');
  } else if (invoer[1] !== TOEGANGSPUNT) {
    gebreken.push(`usePreventRemove komt uit '${invoer[1]}' en niet uit '${TOEGANGSPUNT}'`);
  }

  const aanroep = AANROEP.exec(inhoud);
  if (aanroep === null) {
    gebreken.push('usePreventRemove wordt nergens aangeroepen');
    return gebreken;
  }

  const actief = BIND_ACTIEF.exec(inhoud);
  if (actief === null) {
    gebreken.push('de schakelaar van bindVertrekwacht is niet te lezen');
  } else if (aanroep[1] !== actief[1]) {
    gebreken.push(
      `de routerwacht staat op '${aanroep[1]}' waar de andere benen op '${actief[1]}' staan`,
    );
  }

  const melding = BIND_MELDING.exec(inhoud);
  if (melding === null) {
    gebreken.push('het meldkanaal van bindVertrekwacht is niet te lezen');
  } else if (aanroep[2] !== melding[1]) {
    gebreken.push(
      `de routerwacht meldt via '${aanroep[2]}' waar de andere benen via '${melding[1]}' melden`,
    );
  }

  return gebreken;
}

/**
 * De tekst zonder commentaar.
 *
 * ⚠️ **Anders meldt de uitleg zichzelf aan.** Het scherm legt in een JSX-blok uit
 *    waaróm er geen kale `router.replace()` mag staan — en noemt die dus
 *    letterlijk. Een controle die daarop aanslaat, straft precies het opschrijven
 *    van de reden af, en dat is het laatste dat je wil afleren.
 *
 * ⚠️ **Het snijdt de andere kant niet open.** Code die in commentaar staat, ís
 *    geen code; wegstrepen kan hier dus niets verbergen wat er wel toe doet.
 *    `[^:]` vóór de dubbele schuine streep houdt `https://` heel.
 */
export function zonderCommentaar(inhoud: string): string {
  return inhoud.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const GEBRUIK = /\buseVertrekwacht\s*\(/;
const BINDING = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*useVertrekwacht\s*\(/;
const NAVIGATIE = /\brouter\.(?:replace|push|navigate|back|dismiss|dismissAll)\s*\(/g;

/**
 * Schermen die langs hun eigen wacht heen navigeren.
 *
 * ⚠️ **Dit is de val en niet een stijlregel.** De routerwacht houdt óók een
 *    navigatie bínnen de app tegen. Een knop "Toch weg, zonder delen" die
 *    rechtstreeks `router.replace()` aanroept, wordt daardoor door de wacht zelf
 *    tegengehouden: zichtbaar gebeurt er niets, er is geen fout, en de gebruiker
 *    zit vast met de tekst die hij weg wilde gooien.
 *
 * ⚠️ **Wat hij niet vangt, en dat hoort hier te staan.** Een scherm dat via een
 *    hulpfunctie navigeert (`gaTerug()` in een ander bestand) laat hier geen
 *    `router.`-spoor achter en komt er ongezien doorheen. De vraag uit regel 18
 *    blijft dus het werk: *kan een gebruiker hier daadwerkelijk weg, en langs
 *    welke knop?*
 */
export function schermenLangsDeWacht(
  bestanden: readonly { readonly pad: string; readonly inhoud: string }[],
): string[] {
  const gemeld: string[] = [];

  for (const bestand of bestanden) {
    const pad = bestand.pad.replace(/\\/g, '/');
    const inhoud = zonderCommentaar(bestand.inhoud);
    if (!GEBRUIK.test(inhoud) || DEFINITIE.test(inhoud)) continue;

    const binding = BINDING.exec(inhoud);
    if (binding === null) {
      gemeld.push(`${pad}: gebruikt de wacht maar niet zijn nooduitgang`);
      continue;
    }

    const uitgang = binding[1];
    for (const treffer of inhoud.matchAll(NAVIGATIE)) {
      const ervoor = inhoud.slice(Math.max(0, treffer.index - 80), treffer.index);
      if (!ervoor.includes(`${uitgang}(`)) {
        gemeld.push(`${pad}: ${treffer[0]} gaat niet door ${uitgang}()`);
      }
    }
  }

  return gemeld;
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

function alleBronnen(): { pad: string; inhoud: string }[] {
  return MAPPEN.flatMap((map) =>
    bestanden(map).map((pad) => ({ pad, inhoud: readFileSync(join(WORTEL, pad), 'utf8') })),
  );
}

const GOED = [
  "import { usePreventRemove } from 'expo-router/react-navigation';",
  '      bindVertrekwacht({',
  '        actief: wacht,',
  '        opGeblokkeerd: () => laatste.current(),',
  '        ...huidigePlatformwacht(),',
  '      }),',
  '  usePreventRemove(wacht, () => laatste.current());',
].join('\n');

describe('routerbeenGebreken — geijkt op losse vormen', () => {
  it('laat het goede geval met rust', () => {
    expect(routerbeenGebreken(GOED)).toEqual([]);
  });

  it('meldt een diepe import, die typecheckt en toch stil breekt', () => {
    const stuk = GOED.replace(TOEGANGSPUNT, 'expo-router/build/react-navigation/core');
    expect(routerbeenGebreken(stuk)).toEqual([
      "usePreventRemove komt uit 'expo-router/build/react-navigation/core' en niet uit 'expo-router/react-navigation'",
    ]);
  });

  it('meldt een import uit een los react-navigation-pakket', () => {
    const stuk = GOED.replace(TOEGANGSPUNT, '@react-navigation/native');
    expect(routerbeenGebreken(stuk)).toEqual([
      "usePreventRemove komt uit '@react-navigation/native' en niet uit 'expo-router/react-navigation'",
    ]);
  });

  it('meldt een routerbeen dat er helemaal niet is', () => {
    const stuk = GOED.replace('  usePreventRemove(wacht, () => laatste.current());', '');
    expect(routerbeenGebreken(stuk)).toEqual(['usePreventRemove wordt nergens aangeroepen']);
  });

  it('meldt een schakelaar die vastgezet is op true', () => {
    const stuk = GOED.replace('usePreventRemove(wacht,', 'usePreventRemove(true,');
    expect(routerbeenGebreken(stuk)).toEqual([
      "de routerwacht staat op 'true' waar de andere benen op 'wacht' staan",
    ]);
  });

  it('meldt een schakelaar die de nooduitgang negeert', () => {
    const stuk = GOED.replace('usePreventRemove(wacht,', 'usePreventRemove(actief,');
    expect(routerbeenGebreken(stuk)).toEqual([
      "de routerwacht staat op 'actief' waar de andere benen op 'wacht' staan",
    ]);
  });

  it('meldt een routerbeen dat het scherm niets vertelt', () => {
    const stuk = GOED.replace('usePreventRemove(wacht, () => laatste.current())', 'usePreventRemove(wacht, () => {})');
    expect(routerbeenGebreken(stuk)).toEqual([
      "de routerwacht meldt via '() => {}' waar de andere benen via '() => laatste.current()' melden",
    ]);
  });

  it('zwijgt niet als het bindstuk onleesbaar is', () => {
    const stuk = GOED.replace('        actief: wacht,\n', '');
    expect(routerbeenGebreken(stuk)).toEqual(['de schakelaar van bindVertrekwacht is niet te lezen']);
  });
});

describe('schermenLangsDeWacht — geijkt op losse vormen', () => {
  const scherm = (regels: string) => [{ pad: 'app/x.tsx', inhoud: regels }];

  it('laat een scherm met rust dat via de nooduitgang navigeert', () => {
    expect(
      schermenLangsDeWacht(
        scherm(
          'const verlaat = useVertrekwacht(vuil, m);\n' +
            'onPress={() => verlaat(() => router.replace(`/groep/${id}`))}',
        ),
      ),
    ).toEqual([]);
  });

  it('meldt een knop die de wacht overslaat', () => {
    expect(
      schermenLangsDeWacht(
        scherm(
          'const verlaat = useVertrekwacht(vuil, m);\n' +
            'onPress={() => router.replace(`/groep/${id}`)}',
        ),
      ),
    ).toEqual(['app/x.tsx: router.replace( gaat niet door verlaat()']);
  });

  it('meldt een scherm dat de nooduitgang niet eens aanneemt', () => {
    expect(schermenLangsDeWacht(scherm('useVertrekwacht(vuil, m);'))).toEqual([
      'app/x.tsx: gebruikt de wacht maar niet zijn nooduitgang',
    ]);
  });

  it('meldt elke overgeslagen uitgang apart, niet alleen de eerste', () => {
    expect(
      schermenLangsDeWacht(
        scherm(
          'const verlaat = useVertrekwacht(vuil, m);\n' +
            'router.replace(a);\n' +
            'router.back();',
        ),
      ),
    ).toEqual([
      'app/x.tsx: router.replace( gaat niet door verlaat()',
      'app/x.tsx: router.back( gaat niet door verlaat()',
    ]);
  });

  it('laat een scherm zonder wacht met rust, ook als het navigeert', () => {
    expect(schermenLangsDeWacht(scherm('router.replace(`/groep/${id}`);'))).toEqual([]);
  });

  it('slaat niet aan op de uitleg waarom een kale router-aanroep fout is', () => {
    expect(
      schermenLangsDeWacht(
        scherm(
          'const verlaat = useVertrekwacht(vuil, m);\n' +
            '{/* een kale router.replace() zou de wacht zichzelf laten dichthouden */}\n' +
            'onPress={() => verlaat(() => router.back())}',
        ),
      ),
    ).toEqual([]);
  });

  it('verbergt niets achter commentaar — de kale aanroep ernaast wordt gewoon gemeld', () => {
    expect(
      schermenLangsDeWacht(
        scherm(
          'const verlaat = useVertrekwacht(vuil, m);\n' +
            '// router.replace() mag hier niet\n' +
            'router.replace(a);',
        ),
      ),
    ).toEqual(['app/x.tsx: router.replace( gaat niet door verlaat()']);
  });

  it('laat het aansluitpunt zelf met rust — dat definieert de hook, het gebruikt hem niet', () => {
    expect(
      schermenLangsDeWacht(
        scherm('export function useVertrekwacht(actief, op) { router.back(); }'),
      ),
    ).toEqual([]);
  });
});

describe('de app zelf', () => {
  it('sluit het routerbeen op dezelfde schakelaar aan als de andere twee', () => {
    const aansluitpunten = alleBronnen().filter((b) => DEFINITIE.test(b.inhoud));

    expect(aansluitpunten.map((b) => b.pad.replace(/\\/g, '/'))).toHaveLength(1);
    for (const punt of aansluitpunten) {
      expect([punt.pad, routerbeenGebreken(punt.inhoud)]).toEqual([punt.pad, []]);
    }
  });

  it('laat elk scherm met een wacht ook weer weg', () => {
    expect(schermenLangsDeWacht(alleBronnen())).toEqual([]);
  });

  it('en er is minstens één scherm met een wacht, anders bewaakt dit niets', () => {
    const schermen = alleBronnen().filter(
      (b) => GEBRUIK.test(b.inhoud) && !DEFINITIE.test(b.inhoud),
    );

    expect(schermen.length).toBeGreaterThan(0);
  });
});
