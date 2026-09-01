import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const SCHERM = join(WORTEL, 'app', 'aanmelden.tsx');

/**
 * Het aanmeldscherm opent op inloggen, en die beslissing blijft toetsbaar — QS8-248.
 *
 * ⚠️ **Waarom een bronbewaking en geen render.** Er is geen renderer in dit
 *    project en geen enkele test in `app/`. `aanmeldmodus.test.ts` toetst de
 *    beslissing volledig, maar kan één ding niet zien: of het schérm hem nog
 *    stelt. Zou iemand `useState<Aanmeldmodus>('aanmelden')` schrijven, dan
 *    blijft élke test daar groen terwijl de bug exact terug is. Dat is CLAUDE.md
 *    regel 18 vraag 3, en dit bestand is het antwoord erop.
 *
 * ⚠️ **Wat deze test níét kan, en dat hoort erbij te staan.** Hij leest tekst en
 *    voert niets uit: hij bewijst dat de beslissing uit `beginModus()` komt, niet
 *    dat het scherm daarna het goede tekent. Die tweede helft hangt aan één
 *    afgeleide regel (`const nieuw = modus === 'aanmelden'`) en aan de
 *    ternaries eronder, en die zijn met het oog na te lopen. Zodra er ooit een
 *    renderer in dit project komt, hoort dit bestand vervangen te worden door
 *    een test die het scherm daadwerkelijk opent.
 *
 * ⚠️ **Vandaar dat hij eerst bewijst dát hij het bestand vindt.** CLAUDE.md
 *    vraag 4: een test die naar een plek grijpt in plaats van naar de belofte,
 *    wordt bij een verhuizing niet rood — hij bewaakt dan stilletjes niets. Hier
 *    is het ontbreken van het bestand een harde fout, geen lege verzameling.
 *
 * IJKING — met de hand gedraaid op 01-09-2026, één mutatie per grendel:
 *
 *   A  `useState<Aanmeldmodus>('aanmelden')` in plaats van `beginModus(...)`  → 1 rood
 *   B  `router.push('/aanmelden?nieuw=1')` met de hand in de uitnodiging      → 1 rood
 *   C  het scherm hernoemd / verplaatst                                       → 3 rood,
 *      met de bovenste die zégt dat het bestand weg is
 *
 * De twee grendels in `beginModus()` en `ROUTE_AANMELDEN` zelf staan geijkt in
 * `src/modules/auth/aanmeldmodus.test.ts`:
 *
 *   D  `beginModus()` wordt een aanwezigheidstoets (`nieuw !== undefined`)     → 8 rood
 *   E  `ROUTE_AANMELDEN` krijgt `?nieuw=yes`, wat de lezer niet kent           → 1 rood
 */

/** Commentaar eruit en witruimte plat, vóór je een patroon telt — les van `tekst:controle`. */
function plat(bron: string): string {
  return bron
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/\s+/g, ' ');
}

/**
 * ⚠️ **Lezen ín een test en niet ernaast.** Stond dit op moduleniveau, dan klapt
 *    het hele bestand om op een `ENOENT` zodra het scherm hernoemd wordt — de
 *    exitcode is dan wel 1, maar de assertie die uitlegt wát er mis is draait
 *    nooit. Een grendel die alleen nog een stacktrace produceert, heeft de helft
 *    van zijn werk niet gedaan.
 */
function schermbron(): string {
  return plat(readFileSync(SCHERM, 'utf8'));
}

describe('het aanmeldscherm laat zijn beginstand uit aanmeldmodus komen', () => {
  it('vindt het scherm — anders bewaakt de rest van dit bestand niets', () => {
    expect(
      () => statSync(SCHERM),
      'app/aanmelden.tsx is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
  });

  /**
   * ⚠️ **De grendel die de bug tegenhoudt.** `useState(true)` was de hele bug:
   *    één boolean die de titel, de knop, de wachtwoordhint én `autoComplete`
   *    zette.
   */
  it('stelt zijn modus met beginModus en niet met een waarde uit de hand', () => {
    const aanroep = /useState<Aanmeldmodus>\((.*?)\);/.exec(schermbron())?.[1];

    expect(aanroep, 'geen useState<Aanmeldmodus>(…) gevonden in het scherm').toBeDefined();
    expect(aanroep).toContain('beginModus');
  });

  it('leest de routeparameters, anders heeft beginModus niets om op te beslissen', () => {
    expect(schermbron()).toContain('useLocalSearchParams');
  });
});

/**
 * ⚠️ **De tweede naad: een querystring die met de hand geschreven wordt.**
 *    `?nieuw=1` is één typefout verwijderd van stilte — je komt dan gewoon op
 *    inloggen uit, er is geen foutmelding en geen enkele test wordt rood. Eén
 *    plek die het pad schrijft (`ROUTE_AANMELDEN`) staat onder test in
 *    `aanmeldmodus.test.ts`; hier bewaken we dat niemand eromheen gaat.
 */
describe('niemand schrijft het aanmeldpad met de hand', () => {
  const schermen = schermbestanden(join(WORTEL, 'app'));

  it('vindt de schermen, anders toetst de rest niets', () => {
    expect(schermen.length).toBeGreaterThan(10);
  });

  it('gebruikt overal ROUTE_AANMELDEN in plaats van een eigen querystring', () => {
    const fout = schermen.filter((pad) => /['"`]\/aanmelden\?/.test(readFileSync(pad, 'utf8')));

    expect(
      fout.map((p) => p.slice(WORTEL.length + 1)),
      'schrijf `/aanmelden?…` niet met de hand — gebruik ROUTE_AANMELDEN uit modules/auth',
    ).toEqual([]);
  });
});

function schermbestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...schermbestanden(pad));
    else if (naam.endsWith('.tsx')) uit.push(pad);
  }
  return uit;
}
