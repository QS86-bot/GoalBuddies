import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const FIELD = join(WORTEL, 'src', 'shared', 'ui', 'Field.tsx');
const LIJST = join(WORTEL, 'app', '(tabs)', 'lijst.tsx');

/**
 * Er is één plek die weet hoe een invoerveld eruitziet — QS8-380, vooruit op
 * QS8-250.
 *
 * ⚠️ **De belofte is niet "De Lijst gebruikt `Field`".** Die is: *elk scherm dat
 *    om tekst vraagt, krijgt de microfoon zodra QS8-250 hem aan `Field` hangt.*
 *    Dat is een eigenschap van het gehéél, en die breekt zodra één scherm zijn
 *    eigen `TextInput` neerzet — daar wordt vandaag niets rood van, en het valt
 *    pas op als een gebruiker in dat ene veld niet kan inspreken.
 *
 * ⚠️ **Waarom een bronbewaking en geen render.** Er is geen renderer in dit
 *    project en geen enkele test in `app/`. Zelfde grens en zelfde reden als
 *    `wachtwoordveld.test.ts`; zodra er een renderer is, hoort dit bestand
 *    vervangen te worden door een test die het veld werkelijk opent.
 *
 * ⚠️ **Vandaag is de lijst leeg, en dat is de reden om hem nú te zetten.** 📏
 *    Gemeten: buiten `Field.tsx` en `wachtwoordveld.ts` noemt geen enkel bestand
 *    in `src/` of `app/` `TextInput`. Een grendel op nul is gratis; dezelfde
 *    grendel over een half jaar kost eerst een opruimronde.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  een kale `<TextInput />` in `app/(tabs)/lijst.tsx` zetten
 *      -> 1 rood: 'bouwt niemand zijn eigen invoerveld'
 *   B  `Field` uit de import van `app/(tabs)/lijst.tsx` halen en het veld
 *      vervangen door `Card`
 *      -> 1 rood: 'MUST-ALLOW: De Lijst vraagt om tekst via het gedeelde veld'
 *   C  `telTekens(tekst.trim())` vervangen door `tekst.trim().length`
 *      -> 1 rood: 'telt gebruikerstekst in codepunten en niet in UTF-16'
 *   D  de datum weer uit de tijdstempel snijden (`done_at.slice(0, 10)`)
 *      -> 1 rood: 'kapt de tekst van een taak nergens af'
 */

/**
 * De bestanden die `TextInput` wél mogen noemen.
 *
 * ⚠️ Een lijst met twee namen en geen patroon: wie hier iets aan toevoegt, zet
 *    er de reden bij. `wachtwoordveld.ts` staat erbij omdat het de props van
 *    `Field` samenstelt en daarvoor het type nodig heeft.
 */
const MAG: readonly string[] = [
  join('src', 'shared', 'ui', 'Field.tsx'),
  join('src', 'shared', 'ui', 'wachtwoordveld.ts'),
];

/** Commentaar eruit vóór je telt — les van `tekst:controle`, en van QS8-245. */
function zonderCommentaar(bron: string): string {
  const uit: string[] = [];
  let inBlok = false;

  for (const regel of bron.split('\n')) {
    let schoon = regel;
    if (inBlok) {
      const eind = schoon.indexOf('*/');
      if (eind === -1) {
        uit.push('');
        continue;
      }
      schoon = schoon.slice(eind + 2);
      inBlok = false;
    }
    schoon = schoon.replace(/\/\*.*?\*\//g, ' ');
    const start = schoon.indexOf('/*');
    if (start !== -1) {
      schoon = schoon.slice(0, start);
      inBlok = true;
    }
    uit.push(schoon.replace(/(^|[^:])\/\/.*$/, '$1'));
  }
  return uit.join('\n');
}

function bestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    else if (naam.endsWith('.tsx') || naam.endsWith('.ts')) uit.push(pad);
  }
  return uit;
}

describe('er is één plek die weet hoe een invoerveld eruitziet', () => {
  it('vindt Field.tsx — anders bewaakt de rest hier niets', () => {
    expect(
      () => statSync(FIELD),
      'src/shared/ui/Field.tsx is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
  });

  /**
   * ⚠️ **De grendel die de belofte draagt.** QS8-250 hangt de microfoon aan
   *    `Field`. Een scherm dat zijn eigen `TextInput` neerzet, krijgt hem niet —
   *    en er is niets dat daar rood van wordt behalve dit.
   */
  it('bouwt niemand zijn eigen invoerveld', () => {
    const gevonden: string[] = [];

    for (const pad of [...bestanden(join(WORTEL, 'app')), ...bestanden(join(WORTEL, 'src'))]) {
      const kort = relative(WORTEL, pad);
      if (MAG.includes(kort) || kort.includes('.test.')) continue;

      zonderCommentaar(readFileSync(pad, 'utf8'))
        .split('\n')
        .forEach((regel, i) => {
          if (/\bTextInput\b/.test(regel)) gevonden.push(`${kort}:${i + 1}`);
        });
    }

    expect(
      gevonden,
      'gebruik het gedeelde `Field`; een eigen `TextInput` krijgt de microfoon van ' +
        'QS8-250 nooit, en die stilte merkt alleen de gebruiker',
    ).toEqual([]);
  });

  /**
   * ⚠️ **De must-allow, en zonder deze regel is de grendel hierboven gratis.**
   *    Een app zónder invoervelden haalt hem ook. Deze test zegt dat er minstens
   *    één scherm is dat om tekst vraagt en dat langs de gedeelde weg doet.
   */
  it('MUST-ALLOW: De Lijst vraagt om tekst via het gedeelde veld', () => {
    const bron = zonderCommentaar(readFileSync(LIJST, 'utf8'));

    expect(bron, 'De Lijst importeert `Field` niet meer').toMatch(/\bField\b/);
    expect(bron, 'De Lijst tekent geen `Field` meer').toContain('<Field');
  });

  /**
   * ⚠️ **Emoji, en de eenheid waarin je ze telt** — CLAUDE.md, Emoji. De teller
   *    onder het veld moet in codepunten tellen, want dat is wat
   *    `char_length(btrim(body))` in migratie 0219 telt. Met `.length` telt het
   *    scherm UTF-16-eenheden: één emoji kost er twee, een samengesteld gezin
   *    elf, en dan toont de app een grens die de database niet stelt.
   */
  it('telt gebruikerstekst in codepunten en niet in UTF-16', () => {
    const bron = zonderCommentaar(readFileSync(LIJST, 'utf8'));

    expect(bron, 'de teller onder het veld hoort `telTekens()` te gebruiken').toContain(
      'telTekens(',
    );
    // ⚠️ **Alleen op de tekstvariabelen en niet op elke `.length`.** `rijen.length`
    //    is een aantal rijen en heeft met codepunten niets te maken; een verbod op
    //    élke `.length` meldt dat mee, en een controle die alles meldt leer je
    //    negeren.
    expect(
      /\b(tekst|body)\.length\b/.test(bron),
      'De Lijst telt tekst met `.length`; dat is de eenheid van UTF-16 en niet die ' +
        'van de database',
    ).toBe(false);
  });

  /**
   * ⚠️ **En het scherm kapt gebruikerstekst nergens af.** `charAt(0)`, `[0]` en
   *    `.slice(0, n)` snijden in UTF-16-eenheden, en op de grens van een emoji
   *    levert dat een vervangingsteken op. Er is één plek in dit project die
   *    tekst wél afkapt (`initialen()`), en die doet het met codepunten.
   */
  it('kapt de tekst van een taak nergens af', () => {
    const bron = zonderCommentaar(readFileSync(LIJST, 'utf8'));

    for (const vorm of [/\.charAt\(/, /\.slice\(\s*0\s*,/, /\.substring\(/]) {
      expect(vorm.test(bron), `De Lijst snijdt met ${String(vorm)} in gebruikerstekst`).toBe(false);
    }
  });
});
