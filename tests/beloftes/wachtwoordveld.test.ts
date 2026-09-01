import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const FIELD = join(WORTEL, 'src', 'shared', 'ui', 'Field.tsx');

/**
 * Elk wachtwoordveld heeft een knop om te spieken — QS8-249.
 *
 * ⚠️ **De belofte is "élk", en dat is precies wat een pure test niet kan zien.**
 *    `wachtwoordveld.test.ts` toetst wat een wachtwoordveld dóét zodra `Field`
 *    de vlag krijgt. Wat het niet kan zien is of een nieuw formulier straks
 *    gewoon `secureTextEntry` zet en de knop dus mist — dan is elke test daar
 *    groen en heeft de gebruiker geen knop. Regel 18 vraag 3.
 *
 * ⚠️ **Waarom een bronbewaking en geen render.** Er is geen renderer in dit
 *    project en geen enkele test in `app/`. Zodra die er komt, hoort dit bestand
 *    vervangen te worden door een test die het veld daadwerkelijk opent en de
 *    knop indrukt.
 *
 * ⚠️ **Wat deze test níét kan.** Hij leest tekst en voert niets uit. Hij bewijst
 *    dat er precies één plek is die weet hoe een wachtwoordveld eruitziet, niet
 *    dat die plek het goed tekent. En het gedrag op een écht toestel — zie de
 *    valkuil hieronder — kan hij al helemaal niet zien.
 *
 * IJKING — met de hand gedraaid op 01-09-2026:
 *
 *   A  `secureTextEntry` terugzetten in `app/aanmelden.tsx`  → 1 rood, met bestand en regel
 *   B  de `wachtwoord`-prop uit `Field.tsx` halen            → 1 rood
 */

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

describe('er is één plek die weet hoe een wachtwoordveld eruitziet', () => {
  it('vindt Field.tsx — anders bewaakt de rest hier niets', () => {
    expect(
      () => statSync(FIELD),
      'src/shared/ui/Field.tsx is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
  });

  it('kent daar de wachtwoord-prop', () => {
    expect(zonderCommentaar(readFileSync(FIELD, 'utf8'))).toContain('wachtwoord');
  });

  /**
   * ⚠️ **De grendel die de belofte draagt.** Een scherm dat zelf
   *    `secureTextEntry` zet, krijgt een veld zonder knop — en er is niets dat
   *    daar rood van wordt behalve dit.
   */
  it('zet niemand anders secureTextEntry met de hand', () => {
    const gevonden: string[] = [];

    for (const pad of [...bestanden(join(WORTEL, 'app')), ...bestanden(join(WORTEL, 'src'))]) {
      if (pad === FIELD || pad.endsWith('.test.ts') || pad.endsWith('.test.tsx')) continue;
      if (pad.includes(`${'wachtwoordveld'}`)) continue;

      zonderCommentaar(readFileSync(pad, 'utf8'))
        .split('\n')
        .forEach((regel, i) => {
          if (/\bsecureTextEntry\b/.test(regel)) {
            gevonden.push(`${relative(WORTEL, pad)}:${i + 1}`);
          }
        });
    }

    expect(
      gevonden,
      'gebruik de `wachtwoord`-prop van Field; `secureTextEntry` geeft een veld zonder spiekknop',
    ).toEqual([]);
  });
});
