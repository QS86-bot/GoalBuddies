#!/usr/bin/env node
/**
 * Bewaakt de afspraak over gedachtestreepjes — QS8-218.
 *
 * ⚠️ **Het gaat om het lange streepje `—` (em-dash, U+2014)**, niet om het
 *    koppelteken in "week-startdag". Dat lange streepje is de bekendste
 *    stilistische vingerafdruk van AI-tekst, en het stond in dit project in 83
 *    Nederlandse en 80 Engelse catalogusregels.
 *
 * ⚠️ **Waarom dit een script is en geen zin.** Zelfde redenering als bij
 *    `emoji-controle`: dit is een afspraak die over drie maanden niemand meer
 *    leest, en de volgende zin die iemand schrijft heeft er weer een. Een
 *    controle vergeet niet.
 *
 * ⚠️ **Commentaar telt niet mee, en dáár zit het verschil met de emoji-controle.**
 *    In `CLAUDE.md` en in de ⚠️-koppen van dit project is het streepje huisstijl
 *    en het staat er honderden keren. Maar "commentaar" is hier niet te
 *    herkennen aan het begin van een regel: een `{/* … *\/}` in JSX en een
 *    doorlopende `/** … *\/`-kop hebben vervolgregels die met een gewoon woord
 *    beginnen. De emoji-controle kijkt alleen naar `*`, `//` en `/*` aan het
 *    begin van een regel, en dat is voor emoji genoeg omdat die nooit in een
 *    doorlopende commentaarregel staan. Voor een streepje is het niet genoeg:
 *    gemeten op 03-09-2026 leverde die aanpak 104 meldingen op waarvan er 101
 *    commentaar waren.
 *
 *    Vandaar dat deze controle de commentaarstand over regels heen bijhoudt.
 *    Een controle die honderd correcte gevallen meldt, leer je uitzetten.
 *
 * ⚠️ Testbestanden tellen niet mee: `tests/scripts/streepje-controle.test.ts`
 *    voedt de vormen die hij moet vinden juist aan deze functie.
 *
 * Draaien: `npm run streepje:controle`. Hoort mee in `/audit` en in de poort.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAPPEN = ['src', 'app'];

/** Het lange gedachtestreepje. Niet het koppelteken, niet het en-streepje. */
const STREEPJE = '—';

/**
 * De regels met een gedachtestreepje buiten commentaar.
 *
 * ⚠️ Geëxporteerd zodat hij te ijken is. Een controle die je niet kunt voeden,
 *    kun je niet ijken — zie `tests/scripts/tekst-controle.test.ts`.
 *
 * ⚠️ **Grof genoeg, en dat is een keuze.** Deze functie leest geen JavaScript;
 *    hij houdt bij of hij binnen een `/* … *\/` zit en knipt `//` eraf. Een `/*`
 *    binnen een stringliteraal zou hem in de war brengen. Dat geval bestaat hier
 *    niet en een echte parser is voor deze vraag te veel machinerie — maar het
 *    hoort opgeschreven te staan in plaats van stilzwijgend te kloppen.
 */
export function treffersIn(regels) {
  const gevonden = [];
  let inBlok = false;

  regels.forEach((regel, i) => {
    // ⚠️ **Een vervolgregel van een ⚠️-kop, ook zonder de opener ervoor.** De
    //    blokstand hieronder dekt een heel bestand, maar niet een los fragment —
    //    en juist zo wordt deze functie geijkt. Zonder deze regel zou de ijking
    //    de vorm moeten aanpassen aan de controle in plaats van andersom.
    //
    // ⚠️ `*/` erbij is de uitzondering: `*/ const x = '…'` begint óók met een
    //    sterretje, en wat daarná staat is gewone code.
    const kaal = regel.trimStart();
    if (kaal.startsWith('*') && !kaal.includes('*/')) return;

    let rest = regel;
    let zichtbaar = '';

    while (rest !== '') {
      if (inBlok) {
        const eind = rest.indexOf('*/');
        if (eind === -1) {
          rest = '';
        } else {
          inBlok = false;
          rest = rest.slice(eind + 2);
        }
        continue;
      }

      const blok = rest.indexOf('/*');
      const regelcommentaar = rest.indexOf('//');

      // ⚠️ Wie het eerst komt. Stond hier alleen de blokcontrole, dan glipte
      //    `// een zin /* met een schijnbaar blok` erdoor als open blok en
      //    slikte de controle de rest van het bestand.
      if (regelcommentaar !== -1 && (blok === -1 || regelcommentaar < blok)) {
        zichtbaar += rest.slice(0, regelcommentaar);
        rest = '';
        continue;
      }

      if (blok === -1) {
        zichtbaar += rest;
        rest = '';
        continue;
      }

      zichtbaar += rest.slice(0, blok);
      inBlok = true;
      rest = rest.slice(blok + 2);
    }

    if (zichtbaar.includes(STREEPJE)) {
      gevonden.push({ regel: i + 1, tekst: regel.trim() });
    }
  });

  return gevonden;
}

function bestanden(map) {
  const gevonden = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) gevonden.push(vol);
    }
  };
  loop(join(WORTEL, map));
  return gevonden;
}

/**
 * ⚠️ Alleen draaien als dit bestand het startpunt is. Zonder deze grens roept
 *    het importeren vanuit de test `process.exit(0)` aan, en dan draait er geen
 *    enkele test — zelfde vorm als in `tekst-controle.mjs`.
 */
function hoofd() {
  const treffers = [];

  for (const map of MAPPEN) {
    for (const pad of bestanden(map)) {
      for (const t of treffersIn(readFileSync(pad, 'utf8').split('\n'))) {
        treffers.push(`${pad.replace(WORTEL, '')}:${t.regel}  ${t.tekst.slice(0, 90)}`);
      }
    }
  }

  if (treffers.length === 0) {
    console.log('streepje-controle: geen gedachtestreepjes in app-tekst.');
    process.exit(0);
  }

  console.error(
    `streepje-controle: ${treffers.length} regel(s) met een gedachtestreepje in tekst die de gebruiker leest.\n`,
  );
  for (const t of treffers) console.error(`  ${t}`);
  console.error(
    '\nHerschrijf de zin; vervang het streepje niet door een komma. Meestal zijn twee\n' +
      'zinnen of een puntkomma beter. Zie QS8-218.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
