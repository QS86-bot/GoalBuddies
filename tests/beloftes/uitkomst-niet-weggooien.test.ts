import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');

/**
 * Een functie die een `Uitkomst` teruggeeft, mag niet weggegooid worden — QS8-245.
 *
 * ⚠️ **De belofte is niet "signOut wordt afgehandeld".** Dat is het geval. De
 *    belofte is: *als een handeling faalt, ziet de gebruiker dat.* Op het
 *    profielscherm stond
 *
 *      <Button onPress={() => void signOut()}>
 *
 *    en `void` gooit de `Uitkomst` weg. `signOut()` bouwt netjes
 *    `auth.fout.uitloggen` op, die melding staat in beide catalogi en is op
 *    inhoud getest — en werd door geen enkel scherm getoond. Mislukte het
 *    uitloggen, dan gebeurde er zichtbaar niets.
 *
 * ⚠️ **Regel 18 vraag 5 in zijn zuiverste vorm: er was niets kapot.** De functie
 *    was af, de melding was geschreven, vertaald en getest. Alleen was de keten
 *    nergens verbonden, en daar wordt per definitie geen enkele test rood van.
 *
 * ⚠️ **De lijst wordt uit de bron áfgeleid en niet met de hand bijgehouden.** Dat
 *    is de fout van 0032/0034: twee lijsten die uit elkaar lopen, waarbij de
 *    test de app-lijst met zichzelf vergeleek. Komt er een nieuwe functie met
 *    `Promise<Uitkomst>` bij, dan valt die hier automatisch onder.
 *
 * ⚠️ **`void` op een lokale handler is juist góed en wordt met rust gelaten.**
 *    `onPress={() => void bewaar()}` waarbij `bewaar()` de uitkomst zelf
 *    afhandelt, is het patroon dat overal in dit project staat — een controle
 *    die dát meldt, leer je uitzetten. De grens loopt bij een dátalaagfunctie
 *    die rechtstreeks in een `void` belandt.
 *
 * ⚠️ **En hij knipt commentaar weg vóór hij telt — dat is hier meteen misgegaan.**
 *    De eerste versie las de kale bron en meldde prompt een treffer: het
 *    commentaar in het profielscherm dat de oude bug cíteert. Precies de les van
 *    `tekst:controle`, twee keer op één dag. Een controle die zijn eigen uitleg
 *    als bevinding meldt, leer je uitzetten.
 *
 *    Het wegknippen behoudt de nieuwe regels, want de melding noemt het
 *    regelnummer — en een controle die naar de verkeerde regel wijst, kost een
 *    lezer meer tijd dan hij bespaart.
 *
 * IJKING — met de hand gedraaid op 01-09-2026:
 *
 *   A  `void signOut()` terugzetten in het profielscherm   → 1 rood, met naam en regel
 *   B  de afleiding uit de bron leeg maken                 → 1 rood ("vindt geen enkele")
 *   C  het wegknippen van commentaar eruit                 → 1 rood, en de vondst
 *      is het commentaar in `profiel.tsx` dat de oude bug citeert
 *   D  `<Uitloggen />` terug naar plek twaalf              → 1 rood
 *   E  `<AccountVerwijderen />` naar boven halen           → 1 rood
 *
 * ⚠️ B is de grendel die telt en de makkelijkste om te vergeten: een controle die
 *    niets meer te toetsen vindt, is groen om de verkeerde reden. Vandaar de
 *    ondergrens hieronder.
 */

/**
 * Commentaar eruit, regelnummers erin. Blokcommentaar wordt per regel geleegd
 * zodat de telling verderop nog naar de goede regel wijst.
 */
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

/** Elke geëxporteerde functie in `src/modules/` die een `Uitkomst` belooft. */
function uitkomstFuncties(): string[] {
  const namen = new Set<string>();
  for (const pad of bestanden(join(WORTEL, 'src', 'modules'), ['.ts'])) {
    if (pad.endsWith('.test.ts')) continue;
    const bron = readFileSync(pad, 'utf8');
    for (const m of bron.matchAll(/export\s+async\s+function\s+(\w+)\s*\([^)]*\)\s*:\s*Promise<Uitkomst/g)) {
      namen.add(m[1] as string);
    }
  }
  return [...namen].sort();
}

function bestanden(map: string, exts: readonly string[]): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad, exts));
    else if (exts.some((e) => naam.endsWith(e))) uit.push(pad);
  }
  return uit;
}

describe('geen enkel scherm gooit een Uitkomst weg', () => {
  const functies = uitkomstFuncties();

  /**
   * ⚠️ **Zonder deze regel is de rest van dit bestand groen om niets.** Verandert
   *    de signatuur ooit van vorm (`Promise<Uitkomst>` naar een alias), dan vindt
   *    de afleiding hierboven nul functies en meldt hij vrolijk niets.
   */
  it('vindt de functies die een Uitkomst beloven', () => {
    expect(functies.length, 'geen enkele Promise<Uitkomst> gevonden in src/modules').toBeGreaterThan(3);
  });

  it('roept er geen enkele aan met void, want dan is de melding onzichtbaar', () => {
    const gevonden: string[] = [];

    for (const pad of bestanden(join(WORTEL, 'app'), ['.tsx', '.ts'])) {
      const regels = zonderCommentaar(readFileSync(pad, 'utf8')).split('\n');
      regels.forEach((regel, i) => {
        for (const naam of functies) {
          if (new RegExp(`void\\s+${naam}\\s*\\(`).test(regel)) {
            gevonden.push(`${relative(WORTEL, pad)}:${i + 1} — void ${naam}()`);
          }
        }
      });
    }

    expect(
      gevonden,
      'vang de Uitkomst op en toon de melding; `void` maakt een mislukking onzichtbaar',
    ).toEqual([]);
  });
});

/**
 * ⚠️ **De tweede belofte van QS8-245: uitloggen is te vinden zonder te scrollen.**
 *
 *    Dit is een bronbewaking en geen render — er is geen renderer in dit project.
 *    Hij kan dus niet zien hoe ver je moet scrollen; wat hij wél kan zien is de
 *    volgorde waarin de blokken in het scherm staan, en dát was de bug: uitloggen
 *    was blok twaalf, ná taal, tijdzone, meldingen, herinnering, thema en viering.
 */
describe('uitloggen staat vóór de instellingen', () => {
  const SCHERM = join(WORTEL, 'app', '(tabs)', 'profiel.tsx');

  /** Een instelling die je niet zocht toen je wilde uitloggen. */
  const INSTELLINGEN = [
    '<TaalInstelling',
    '<TijdzoneInstelling',
    '<Meldingen',
    '<HerinneringInstelling',
    '<ThemaKeuze',
    '<VieringKeuze',
  ];

  it('vindt het profielscherm — anders bewaakt de rest hier niets', () => {
    expect(
      () => statSync(SCHERM),
      'app/(tabs)/profiel.tsx is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
  });

  it('zet het uitlogblok boven élke instelling', () => {
    const bron = readFileSync(SCHERM, 'utf8');
    const uitloggen = bron.indexOf('<Uitloggen />');

    expect(uitloggen, 'geen <Uitloggen /> in het profielscherm').toBeGreaterThan(-1);

    const teVroeg = INSTELLINGEN.filter((tag) => {
      const plek = bron.indexOf(tag);
      return plek > -1 && plek < uitloggen;
    });

    expect(teVroeg, 'deze instellingen staan vóór de uitlogknop').toEqual([]);
  });

  /**
   * ⚠️ **De must-allow-helft, en die is hier een domeinregel en geen smaak.**
   *    Account verwijderen hóórt moeilijk bereikbaar te zijn. Zou iemand deze
   *    grendel "verbeteren" door ook dat naar boven te halen, dan is dat een
   *    achteruitgang die niemand opmerkt.
   */
  it('laat account verwijderen juist onderaan staan', () => {
    const bron = readFileSync(SCHERM, 'utf8');

    expect(bron.indexOf('<AccountVerwijderen />')).toBeGreaterThan(bron.indexOf('<Uitloggen />'));
    for (const tag of INSTELLINGEN) {
      const plek = bron.indexOf(tag);
      if (plek > -1) expect(bron.indexOf('<AccountVerwijderen />')).toBeGreaterThan(plek);
    }
  });
});
