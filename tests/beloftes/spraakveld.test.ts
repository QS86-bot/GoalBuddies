import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const UI = join(WORTEL, 'src', 'shared', 'ui');
const FIELD = join(UI, 'Field.tsx');
const HOOK = join(UI, 'useSpraak.ts');
const MICROFOON = join(UI, 'Microfoon.tsx');

/**
 * Elk vrijetekstveld is in te spreken — QS8-250.
 *
 * ⚠️ **De belofte is "élk", en dat is precies wat `spraakveld.test.ts` niet kan
 *    zien.** Die toetst wat `magSpraak()` besluit en wat `voegAan()` doet. Wat
 *    hij niet kan zien is of `Field` die beslissing ook gebruikt — laat iemand
 *    de aanroep weg, dan blijven alle zevenenveertig gevallen daar groen en
 *    heeft de gebruiker geen enkele microfoon. Regel 18, vraag 3 en 5.
 *
 * ⚠️ **De keten is hier vier schakels lang**, en elke schakel is los af te
 *    breken zonder dat er iets rood wordt:
 *
 *      Field → Microfoon → useSpraak → de herkenner van de browser
 *
 *    Vraag 5 gaat over precies deze vorm: kan een gebruiker hier daadwerkelijk
 *    bij, en langs welke knop? Elk van de vier krijgt hieronder een grendel.
 *
 * ⚠️ **Waarom een bronbewaking en geen render.** Er is geen renderer in dit
 *    project en geen enkele test in `app/`. Zodra die er komt, hoort dit bestand
 *    vervangen te worden door een test die een veld daadwerkelijk opent en de
 *    knop indrukt. Wat deze test niet kan: bewijzen dat het er goed uitziet, en
 *    al helemaal niet dat een échte browser de audio accepteert.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  `<Microfoon` uit `Field.tsx` halen                    → 1 rood
 *   B  `magSpraak` uit `Microfoon.tsx` halen                 → 1 rood
 *   C  `voegAan` uit `Microfoon.tsx` halen                   → 1 rood
 *   D  `useSpraak` uit `Microfoon.tsx` halen                 → 1 rood
 *   E  `webkitSpeechRecognition` uit `useSpraak.ts` halen    → 1 rood
 *   F  een tweede `webkitSpeechRecognition` in een scherm    → 1 rood, met bestand en regel
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

describe('de keten van veld naar microfoon is heel', () => {
  it('vindt Field.tsx — anders bewaakt de rest hier niets', () => {
    expect(
      () => statSync(FIELD),
      'src/shared/ui/Field.tsx is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
  });

  /**
   * ⚠️ **Schakel 1.** Zonder deze regel staat er nergens een microfoon, hoe goed
   *    `magSpraak()` ook besluit wie er een hoort te krijgen.
   */
  it('laat Field de microfoon ook daadwerkelijk tekenen', () => {
    expect(zonderCommentaar(readFileSync(FIELD, 'utf8'))).toContain('<Microfoon');
  });

  /**
   * ⚠️ **Schakel 2.** `Microfoon` besluit zélf of hij past — die knip zit daar en
   *    niet in `Field`, want anders komt `Field` boven de vijftig regels uit.
   *    Valt deze aanroep weg, dan verschijnt de knop óók bij een wachtwoordveld.
   */
  it('laat Microfoon beslissen met magSpraak', () => {
    expect(zonderCommentaar(readFileSync(MICROFOON, 'utf8'))).toContain('magSpraak');
  });

  /**
   * ⚠️ **Schakel 2b, en de duurste.** `voegAan()` is de tak die tekst kan
   *    wegvegen. Zet iemand hier `onChangeText(herkend)` neer, dan overschrijft
   *    inspreken wat de gebruiker al getypt had — en geen enkele unittest ziet
   *    dat, want `voegAan` blijft gewoon werken.
   */
  it('laat Microfoon aanvullen met voegAan en niet overschrijven', () => {
    expect(zonderCommentaar(readFileSync(MICROFOON, 'utf8'))).toContain('voegAan');
  });

  /** ⚠️ Schakel 3: de knop zonder herkenner is een knop die niets doet. */
  it('laat Microfoon de herkenner aanspreken via useSpraak', () => {
    expect(zonderCommentaar(readFileSync(MICROFOON, 'utf8'))).toContain('useSpraak');
  });

  /** ⚠️ Schakel 4: de hook bouwt de herkenner werkelijk. */
  it('laat useSpraak de herkenner van de browser bouwen', () => {
    const bron = zonderCommentaar(readFileSync(HOOK, 'utf8'));
    expect(bron).toContain('webkitSpeechRecognition');
  });
});

describe('er is één plek die weet hoe spraakherkenning werkt', () => {
  /**
   * ⚠️ **De grendel die de belofte draagt.** Een scherm dat zelf een herkenner
   *    bouwt, mist de featuredetectie, de taalkeuze, de foutmeldingen én de
   *    eenmalige uitleg over waar de stem heen gaat — en er is niets dat daar
   *    rood van wordt behalve dit.
   *
   * ⚠️ Dat laatste is geen netheid maar de belofte van acceptatiecriterium 3:
   *    een tweede herkenner is een tweede route naar de microfoon die die
   *    mededeling overslaat.
   */
  it('bouwt niemand anders een SpeechRecognition', () => {
    const gevonden: string[] = [];

    for (const pad of [...bestanden(join(WORTEL, 'app')), ...bestanden(join(WORTEL, 'src'))]) {
      if (pad === HOOK || pad.endsWith('.test.ts') || pad.endsWith('.test.tsx')) continue;
      // De pure module noemt de twee namen in haar typen en in haar detectie;
      // dát is juist de ene plek die het mag weten.
      if (pad === join(UI, 'spraakveld.ts')) continue;

      zonderCommentaar(readFileSync(pad, 'utf8'))
        .split('\n')
        .forEach((regel, i) => {
          if (/\b(webkit)?SpeechRecognition\b/.test(regel)) {
            gevonden.push(`${relative(WORTEL, pad)}:${i + 1}`);
          }
        });
    }

    expect(
      gevonden,
      'gebruik het gedeelde `Field`; een eigen herkenner mist de uitleg over waar de stem heen gaat',
    ).toEqual([]);
  });
});
