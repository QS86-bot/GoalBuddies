import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HELDSLEUTELS } from '../../src/modules/helden/helden';
import { heldkeuze, HELDVRAGEN, teBewarenHeld } from '../../src/modules/helden/quiz';

import { zonderCommentaar } from './roept-aan';

/**
 * Bij gelijkspel ziet de gebruiker álle gedeelde koplopers — QS8-474, besluit 7
 * van QS8-468.
 *
 * ⚠️⚠️ **`quiz.test.ts` kan groen blijven terwijl deze belofte breekt, en dat is
 *    de reden dat dit bestand bestaat.** Die suite toetst dat `koplopers()` er
 *    vier teruggeeft. Wat hij niet ziet, is een scherm dat die vier keurig
 *    ontvangt en er daarna twee van tekent — precies "de top 2" uit het
 *    brondocument, dat besluit 7 juist verving. Regel 18 vraag 2: de belofte is
 *    een eigenschap van het gehéél, de telling een eigenschap van het onderdeel.
 *
 * ⚠️ **Waarom een bronscan.** Er is in dit project geen React-testbibliotheek —
 *    zie de kop van `de-vragenlijst-wordt-niet-twee-keer-gesteld.test.ts`. Wat
 *    je zonder renderer wél kunt vastleggen is dat het scherm de lijst
 *    ongesneden doorgeeft, en dat het aantal stappen uit de module komt en niet
 *    uit een getal dat iemand heeft ingetypt.
 *
 * IJKING — met de hand gedraaid op 14-09-2026, mutatie per grendel:
 *
 *   A  `keuze.koplopers.map(` → `keuze.koplopers.slice(0, 2).map(`
 *      → grendel 1 rood ("snijdt de koplopers af")
 *   B  `const SAMENVATTING: Stap = 8` → `= 6`
 *      → grendel 2 rood, met 6 en 8 in de melding
 *   C  een tweede `<Samenvatting` in de render
 *      → grendel 3 rood
 *   D  `HELDVRAGEN.map(` vervangen door vier losse `<HeldVraag vraag="…" />`
 *      → grendel 4 rood
 *
 * ⚠️ Bij elke mutatie is eerst nagekeken dat de vorm er écht in stond vóór de
 *    uitslag geloofd werd.
 */

const SCHERM = readFileSync(
  fileURLToPath(new URL('../../app/onboarding/vragenlijst.tsx', import.meta.url)),
  'utf8',
);

const SCHOON = zonderCommentaar(SCHERM);

/** Hoeveel vragen er vóór de heldenvragen staan: de vier van besluit A56. */
const VRAGEN_VAN_A56 = 4;

describe('het scherm toont elke gedeelde koploper', () => {
  it('snijdt de koplopers nergens af', () => {
    // ⚠️ **De vorm en niet het getal.** Een toets op "er staat geen 2 in dit
    //    bestand" is onhoudbaar; een toets op "er wordt niets van deze lijst
    //    afgehaald" is precies de belofte. `slice`, `splice`, `at(` en een
    //    index erop zijn allemaal manieren om er twee van te maken.
    expect(SCHOON, 'het scherm tekent één kaart per koploper').toMatch(
      /keuze\.koplopers\.map\(/,
    );

    for (const snee of ['slice', 'splice', 'at(', 'shift', 'pop']) {
      expect(SCHOON.includes(`koplopers.${snee}`), `koplopers.${snee}`).toBe(false);
    }

    expect(/koplopers\s*\[\s*\d/.test(SCHOON), 'koplopers[0]').toBe(false);
  });

  it('leidt het aantal kaarten af en noemt het niet', () => {
    // ⚠️ `keuze.koplopers.length` mag — dat is de zin "je antwoorden wijzen even
    //    hard naar N helden". Wat niet mag is een vergelijking met een vast
    //    getal, want dat is waar "de top 2" terugkomt.
    expect(/koplopers\.length\s*[<>]=?\s*\d/.test(SCHOON), 'grens op het aantal koplopers').toBe(
      false,
    );
  });
});

describe('acht vragen en precies één samenvatting', () => {
  /**
   * ⚠️ **Dit is de grendel onder besluit A56.** QS8-257 ging er expliciet over
   *    dat het samenvattingsscherm het punt was en niet de vier vragen. Acht
   *    vragen met twéé samenvattingen draait dat besluit stil om, en niets
   *    anders in dit project zou dat melden.
   */
  it('zet de samenvatting achter alle acht de vragen, afgeleid uit de module', () => {
    const eerste = Number(/const EERSTE_HELDVRAAG = (\d+)/.exec(SCHOON)?.[1]);
    const samenvatting = Number(/const SAMENVATTING: Stap = (\d+)/.exec(SCHOON)?.[1]);

    expect(eerste, 'EERSTE_HELDVRAAG staat niet in het scherm').toBe(VRAGEN_VAN_A56);
    expect(
      samenvatting,
      `de samenvatting staat op ${samenvatting} en er zijn ${eerste + HELDVRAGEN.length} vragen`,
    ).toBe(eerste + HELDVRAGEN.length);
  });

  it('monteert de samenvatting precies één keer', () => {
    const treffers = SCHOON.match(/<Samenvatting\b/g) ?? [];
    expect(treffers, 'één samenvatting, niet twee').toHaveLength(1);
  });

  it('haalt de heldenvragen uit de module en schrijft ze niet uit', () => {
    // ⚠️ Vier handgeschreven vragen zetten de zes helden vier keer in de
    //    schermlaag, en dan loopt die lijst uit elkaar met het register zonder
    //    dat iets rood wordt. Bovendien staat `app/` precies op het plafond van
    //    regel 15.
    expect(SCHOON).toMatch(/HELDVRAGEN\.map\(/);
    expect(SCHOON.match(/<HeldVraag\b/g) ?? [], 'één keer gemonteerd').toHaveLength(1);
  });

  it('noemt geen enkele heldsleutel letterlijk in de schermlaag', () => {
    // ⚠️ Het register bezit de zes, en het scherm leest ze. Een sleutel die hier
    //    letterlijk staat, is een zevende bron.
    for (const sleutel of HELDSLEUTELS) {
      expect(SCHOON.includes(`'${sleutel}'`), `'${sleutel}' staat in het scherm`).toBe(false);
    }
  });
});

describe('de uitslag die het scherm bewaart, klopt met wat het toont', () => {
  it('bewaart bij een onbeslist gelijkspel niets — dezelfde bron als het scherm leest', () => {
    // ⚠️ Deze twee horen bij elkaar en dat is de naad: het scherm tékent
    //    `heldkeuze()` en bewáárt `teBewarenHeld()` van diezelfde waarde. Zou de
    //    ene de keuze wél laten vallen en de andere niet, dan ziet de gebruiker
    //    vier kaarten zonder selectie en landt er tóch een held.
    const gelijk = heldkeuze(
      { aantrekking: 'meridian', tegenslag: 'quip', motivatie: 'forge', viering: 'lucerna' },
      null,
    );

    expect(gelijk.soort).toBe('gelijkspel');
    expect(teBewarenHeld(gelijk)).toBeNull();
  });

  it('leest het scherm de keuze af en houdt hem niet in state', () => {
    // ⚠️ `heldkeuze()` laat een achterhaalde gelijkspelkeuze vallen. Zou het
    //    scherm de uitslag in `useState` bewaren, dan overleeft die keuze
    //    precies de wijziging die hem ongeldig maakte.
    expect(SCHOON, 'de uitslag wordt afgeleid').toMatch(
      /const keuze = heldkeuze\(heldantwoorden, gekozenHeld\)/,
    );
    expect(/useState[^\n]*Heldkeuze/.test(SCHOON), 'de uitslag staat in state').toBe(false);
  });
});
