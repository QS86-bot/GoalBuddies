import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Een datum wordt op één plek opgemaakt, en nooit aan de invoerkant — QS8-221.
 *
 * ⚠️ **De naad, en het issue wijst hem zelf aan:** *"dit is precies de naad waar
 *    weergave en opslag door elkaar kunnen lopen."* Twee onderdelen die allebei
 *    kloppen — een formulier dat ISO aanlevert, en een opmaakhelper die er
 *    `31-12-2026` van maakt — en het geheel lekt op de plek waar iemand de
 *    tweede voor de eerste gebruikt. `31-12-2026` en `12/31/2026` zijn dezelfde
 *    dag; `01-02-2026` en `02/01/2026` niet, en dat verschil merk je pas als een
 *    gebruiker in een ander land zijn streefdatum een maand ziet verspringen.
 *
 * ⚠️ **En de tweede helft: één bron van waarheid.** Correctheidsregel 7 gaat over
 *    rékenen, maar de reden is dezelfde. Een scherm dat zelf `toLocaleDateString`
 *    doet, is een tweede opvatting van hoe een datum eruitziet — precies zoals
 *    `risico.ts` ooit `.replace('.', ',')` deed voor een decimaalteken, hard
 *    Nederlands, in een app die inmiddels twee talen sprak.
 *
 * ⚠️ Met de hand rood gemaakt, per grendel apart:
 *    1. `toLocaleDateString()` in een scherm gezet   → grendel 1 rood.
 *    2. `new Intl.DateTimeFormat` in een scherm      → grendel 1 rood.
 *    3. `toonDatum(...)` als `value` van een `Field` → grendel 2 rood.
 *    4. `opmaaktaal()` uit een scherm gehaald dat
 *       `toonDatum` gebruikt                         → grendel 3 rood.
 */
const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

/**
 * De enige plekken die zélf een datum of tijd mogen opmaken, met de reden.
 *
 * ⚠️ **Een lijst met redenen en geen lijst met namen** — zelfde vorm als
 *    `MOET_EEN_SCHERM_HEBBEN` in `bereikbaar.test.ts`.
 */
const MAG_ZELF_OPMAKEN: Readonly<Record<string, string>> = {
  'src/shared/time/opmaak.ts': 'De opmaakhelpers zelf. Dit is de bron van waarheid.',
  'src/shared/time/zoned.ts':
    'Rekent met `Intl` aan tijdzones (`partsIn`, `normaliseerZone`) en maakt niets op ' +
    'voor weergave.',
  'src/shared/i18n/index.ts':
    'Weekdagnamen, getallen en sorteervolgorde, plus de locale die de opmaak gebruikt. ' +
    'Hier zit de taal, niet de datumvorm.',
};

/** Wat een scherm niet zelf mag aanroepen. */
const ZELF_OPMAKEN = /toLocaleDateString|toLocaleTimeString|toLocaleString|new Intl\.DateTimeFormat/;

/** De opmaakhelpers, zoals een scherm ze aanroept. */
const OPMAAKHELPERS = /\btoon(?:Datum|DatumKort|DatumLang|Tijd|KlokTijd|Moment)\s*\(/;

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

/** Commentaar weg; de ⚠️-blokken in dit project noemen deze namen zelf. */
function ontdaanVanCommentaar(bron: string): string {
  return bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const ALLE = [...bestanden('app'), ...bestanden('src')];

describe('een datum wordt op één plek opgemaakt', () => {
  it('vindt de bestanden om te doorzoeken', () => {
    expect(ALLE.length).toBeGreaterThan(50);
  });

  // Grendel 1: niemand maakt zelf een datum op.
  it('geen enkel scherm of module doet het zelf', () => {
    const overtreders = ALLE.filter(
      (pad) =>
        !(pad.split('\\').join('/') in MAG_ZELF_OPMAKEN) &&
        ZELF_OPMAKEN.test(ontdaanVanCommentaar(readFileSync(join(WORTEL, pad), 'utf8'))),
    );

    expect(
      overtreders,
      'Deze bestanden maken zelf een datum of tijd op. Gebruik `toonDatum()` en ' +
        'familie uit `shared/time`, of zet het bestand met een réden in ' +
        '`MAG_ZELF_OPMAKEN` hierboven.',
    ).toEqual([]);
  });

  it('elke uitzondering staat er met een reden en bestaat echt', () => {
    // Een naam die nergens meer op slaat, is een gat dat openstaat zonder dat
    // iemand het merkt.
    for (const [pad, reden] of Object.entries(MAG_ZELF_OPMAKEN)) {
      expect(ALLE, `${pad} staat op de uitzonderingslijst maar bestaat niet meer.`).toContain(pad);
      expect(reden.length, `${pad} staat er zonder reden.`).toBeGreaterThan(20);
    }
  });
});

/**
 * Grendel 2: een opmaakhelper komt nooit aan de invoerkant terecht.
 *
 * ⚠️ Dit is de belofte in zijn scherpste vorm. Een `Field` waarvan de `value` uit
 *    `toonDatum()` komt, ziet er goed uit en levert `31-12-2026` aan een schema
 *    dat `2026-12-31` verwacht — of erger, aan een land waar dat `12 januari`
 *    betekent. Het formulier van de herinnering is precies zo'n geval: het veld
 *    blijft `HH:MM` en de regel eronder volgt de klok van het toestel.
 */
describe('de opmaak blijft aan de weergavekant', () => {
  const INVOER = /\b(?:value|onChangeText|defaultValue)=\{[^}]*\btoon(?:Datum|DatumKort|DatumLang|Tijd|KlokTijd|Moment)\s*\(/;

  for (const pad of ALLE.filter((p) => p.startsWith('app'))) {
    const bron = ontdaanVanCommentaar(readFileSync(join(WORTEL, pad), 'utf8'));
    if (!OPMAAKHELPERS.test(bron)) continue;

    it(`${pad} voert geen opgemaakte datum een formulier in`, () => {
      expect(
        INVOER.test(bron),
        `${pad} zet een opgemaakte datum of tijd in een invoerveld. Wat de gebruiker ` +
          'typt en wat de database krijgt, is ISO; de opmaak is uitsluitend voor lezen.',
      ).toBe(false);
    });

    // Grendel 3: wie opmaakt, vraagt de taal aan de enige plek die hem kent.
    it(`${pad} haalt de locale bij opmaaktaal()`, () => {
      expect(
        bron,
        `${pad} maakt een datum op zonder \`opmaaktaal()\`. Een vaste locale is een ` +
          'tweede opvatting over welke taal geldt, en die loopt uit de pas met de ' +
          'keuze van de gebruiker.',
      ).toContain('opmaaktaal()');
    });
  }
});
