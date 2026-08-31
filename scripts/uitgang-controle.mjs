#!/usr/bin/env node
/**
 * uitgang-controle — elk scherm buiten de tabbladen heeft een uitgang (QS8-211).
 *
 * ⚠️ **De belofte is een eigenschap van het gehéél en niet van één component**
 *    (onwrikbare regel 18). `app/_layout.tsx` zet `headerShown: false` op de hele
 *    `Stack`, dus er is nergens een navigatiebalk; `Screen` tekende achtergrond,
 *    veilige zone en een kop en verder niets. Elk scherm werkte op zichzelf —
 *    elke component-test bleef groen — en tóch was élk scherm buiten de vier
 *    tabbladen alleen te verlaten via een knop die dat scherm zélf toevallig
 *    tekende. `app/doel/[id].tsx` had er geen: het langste en belangrijkste
 *    scherm van de app was alleen te verlaten door je doel weg te gooien of met
 *    de browserknop, en op een telefoon is er geen browserknop.
 *
 * ⚠️ **Waarom een controle en niet een test per scherm.** Het gat ontstaat bij
 *    het volgende scherm dat iemand toevoegt, niet in de achttien die er nu
 *    staan. Een controle die over `app/` loopt, is het enige dat een scherm kan
 *    zien dat vandaag nog niet bestaat.
 *
 * ⚠️ **Wat hij niet kan.** Hij toetst dat er een terugmogelijkheid ís, niet dat
 *    hij op de goede plek uitkomt. Dat de knop nooit dood kan zijn, zit in het
 *    type: `Terug.naar` is verplicht (`src/shared/ui/Screen.tsx`).
 *
 * De ijking staat in `tests/scripts/uitgang-controle.test.ts`, met de vormen die
 * hij moet vinden én de vormen die hij met rust moet laten. Die tweede helft is
 * even belangrijk: een controle die alles meldt, leert je hem te negeren.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Schermen die géén terugmogelijkheid hóren te hebben, met de reden erbij.
 *
 * ⚠️ **Redenen en geen namen** — zelfde vorm als `BEWUST_ONGESCHREVEN` in
 *    `dode-keten-controle.mjs`. Wie hier een pad neerzet zonder op te schrijven
 *    waarom de gebruiker daar niet weg hóéft te kunnen, heeft de controle het
 *    zwijgen opgelegd in plaats van een uitzondering vastgelegd.
 */
export const GEEN_UITGANG_NODIG = {
  'app/aanmelden.tsx':
    'Het beginpunt zonder sessie. `bestemmingVoor()` stuurt elke route zonder ' +
    'sessie hierheen, dus er is per definitie niets om naar terug te gaan.',
  'app/onboarding/uitleg.tsx':
    'Het beginpunt van de onboarding, en die is een poort: zonder ' +
    '`onboarded_at` stuurt `bestemmingVoor()` je hier terug. Elk stapje heeft ' +
    'al zijn eigen "overslaan"; een terugknop zou naar het aanmeldscherm ' +
    'wijzen dat je net verlaten hebt.',
};

/** Bestanden in `app/` die geen scherm zijn. */
const GEEN_SCHERM = /(^|\/)(_layout|\+html|\+not-found)\.tsx$/;

/**
 * Haalt commentaar en tekst tussen aanhalingstekens weg.
 *
 * ⚠️ **Dit ontbrak in `keten:controle` en dat kostte maanden stilte** (QS8-156).
 *    Een `<Screen`-voorbeeld in een uitleg-blok is geen scherm, en een scherm
 *    dat het woord `terug` in een knoplabel heeft, heeft daarmee nog geen
 *    terugknop.
 */
export function zonderCommentaarEnTekst(bron) {
  let uit = '';
  let i = 0;

  while (i < bron.length) {
    const twee = bron.slice(i, i + 2);

    if (twee === '//') {
      const eind = bron.indexOf('\n', i);
      i = eind === -1 ? bron.length : eind;
      continue;
    }
    if (twee === '/*') {
      const eind = bron.indexOf('*/', i + 2);
      i = eind === -1 ? bron.length : eind + 2;
      continue;
    }

    const teken = bron[i];
    if (teken === "'" || teken === '"' || teken === '`') {
      i += 1;
      while (i < bron.length && bron[i] !== teken) i += bron[i] === '\\' ? 2 : 1;
      i += 1;
      // Een lege string terugzetten: het onderscheid tussen `x=''` en `x=` moet
      // blijven bestaan, anders leest een weggehaalde prop als aanwezig.
      uit += `${teken}${teken}`;
      continue;
    }

    uit += teken;
    i += 1;
  }

  return uit;
}

/**
 * De openingstag van elke `<Screen …>` in dit bestand.
 *
 * Telt accolades mee, want een prop mag een objectliteraal of een expressie over
 * meerdere regels zijn — precies de vorm die `tekst:controle` op 28-08 miste.
 */
export function schermtags(bron) {
  const schoon = zonderCommentaarEnTekst(bron);
  const tags = [];

  for (const start of [...schoon.matchAll(/<Screen(?=[\s/>])/g)].map((m) => m.index)) {
    let diepte = 0;

    for (let i = start; i < schoon.length; i += 1) {
      const teken = schoon[i];
      if (teken === '{') diepte += 1;
      else if (teken === '}') diepte -= 1;
      else if (teken === '>' && diepte === 0) {
        tags.push(schoon.slice(start, i + 1));
        break;
      }
    }
  }

  return tags;
}

/**
 * Beoordeelt één scherm. Geeft de fouten terug; een lege lijst is goed.
 *
 * @param pad Pad vanaf de wortel, met `/` als scheidingsteken.
 */
export function beoordeelScherm({ pad, bron }) {
  if (GEEN_SCHERM.test(pad)) return [];
  if (pad.includes('/(tabs)/')) return [];

  const tags = schermtags(bron);

  if (Object.hasOwn(GEEN_UITGANG_NODIG, pad)) {
    if (tags.some((tag) => /\bterug=/.test(tag))) {
      return [
        `${pad} staat in GEEN_UITGANG_NODIG maar heeft wél een terugknop. ` +
          'Haal het pad uit de lijst — een uitzondering die niet meer geldt, ' +
          'dekt straks een scherm af dat wél stuk is.',
      ];
    }
    return [];
  }

  if (tags.length === 0) {
    return [
      `${pad} gebruikt geen <Screen>. Elk scherm hoort door dezelfde ` +
        'buitenrand te lopen, anders heeft het ook geen terugmogelijkheid.',
    ];
  }

  const zonder = tags.filter((tag) => !/\bterug=/.test(tag));
  if (zonder.length === 0) return [];

  return [
    `${pad} heeft een <Screen> zonder \`terug\`. Zonder tabbalk eronder is dit ` +
      'scherm alleen te verlaten met de browserknop, en op een telefoon is die ' +
      'er niet. Zet `terug={{ naar: … }}` erop, of zet het pad met een reden in ' +
      'GEEN_UITGANG_NODIG.',
  ];
}

function schermbestanden(map) {
  const uit = [];

  for (const naam of readdirSync(map)) {
    const vol = join(map, naam);
    if (statSync(vol).isDirectory()) uit.push(...schermbestanden(vol));
    else if (naam.endsWith('.tsx')) uit.push(vol);
  }

  return uit;
}

function hoofd() {
  const bestanden = schermbestanden(join(WORTEL, 'app'));
  const fouten = [];

  for (const vol of bestanden) {
    const pad = relative(WORTEL, vol).split(sep).join('/');
    fouten.push(...beoordeelScherm({ pad, bron: readFileSync(vol, 'utf8') }));
  }

  // Een uitzondering voor een bestand dat niet meer bestaat, is een aanname die
  // niemand meer nakijkt.
  for (const pad of Object.keys(GEEN_UITGANG_NODIG)) {
    if (!bestanden.some((vol) => relative(WORTEL, vol).split(sep).join('/') === pad)) {
      fouten.push(`${pad} staat in GEEN_UITGANG_NODIG maar bestaat niet meer.`);
    }
  }

  if (fouten.length === 0) {
    console.log(
      `uitgang-controle: alle ${bestanden.length} bestanden in app/ zijn te verlaten.`,
    );
    return 0;
  }

  for (const fout of fouten) console.error(`✗ ${fout}`);
  console.error('\nZie QS8-211 en `src/shared/ui/Screen.tsx`.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
