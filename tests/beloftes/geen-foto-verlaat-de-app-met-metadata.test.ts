/**
 * De belofte: **geen enkele afbeelding verlaat deze app met zijn metadata er nog
 * aan** — QS8-395.
 *
 * ⚠️⚠️ **Dit is de naad en niet het onderdeel.** `src/shared/afbeelding` heeft
 *    een eigen suite die toetst dát `ontdoeVanMetadata()` een APP1-segment,
 *    een `eXIf`-chunk en een `EXIF`-chunk eruit knipt, en dat hij dichtvalt op
 *    wat hij niet volledig kan lezen. Die suite blijft groen als iemand morgen
 *    een tweede uploadpad bouwt dat de knipper nergens aanroept.
 *
 *    De belofte is een eigenschap van het **gehéél**: elke plek waar bytes van
 *    het apparaat de app binnenkomen, knipt. Dat is regel 18 vraag 1 —
 *    *waar knopen twee correcte onderdelen aan elkaar?*
 *
 * ⚠️ **De aanleiding is een gemeten verbreding.** Bij QS8-391 werd
 *    `kiesChatfoto()` hernoemd tot `kiesFoto()` en kreeg hij een tweede
 *    aanroeper: de bewijsfoto bij een voltooiing. Die kreeg de knip gratis mee
 *    omdat het één functie is — maar niets bewaakte dat. Een derde emmer met een
 *    eigen kiezer zou er stil buiten vallen.
 *
 * 📏 **De ijking — één mutatie per grendel, alle drie op 10-09-2026 rood gezien.**
 *
 *    | Mutatie | Wat er brak | Welk geval rood werd |
 *    |---|---|---|
 *    | A | de knip uit `kiesFoto()` — de kale bytes gaan door | "kiesFoto.ts knipt de metadata eraf" |
 *    | B | alleen de faalstand eruit: de aanroep blijft, de uitkomst wordt niet gelezen | "laat de foto vallen als het knippen mislukt" (en A bleef groen) |
 *    | C | een derde bestand met `launchImageLibraryAsync` erbij, niet in `INGANGEN` | "kent elke fotokiezer die er is" |
 *
 *    ⚠️ **B is de mutatie die ertoe doet**, want dat is de vorm die je in het echt
 *       krijgt: iemand roept de knipper aan en leest zijn uitkomst niet. A werd
 *       er groen van gebleven — twee grendels, twee mutaties.
 *
 * ⚠️ **Waarom een lijst en geen zoekopdracht over de hele boom.** Een test die
 *    zelf uitvogelt welke bestanden "een uploadpad" zijn, ijk je niet: je weet
 *    niet of hij niets vond of niet keek. Deze lijst is met de hand vastgesteld
 *    en de tweede helft van deze suite bewaakt dat hij compleet blijft — zodra
 *    er ergens anders een `launchImageLibraryAsync` opduikt, wordt hij rood.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { roeptAan } from './roept-aan';

/**
 * Elke plek waar bytes van het apparaat de app binnenkomen.
 *
 * ⚠️ Twee bestanden en niet drie: `kiesFoto.ts` bedient zowel de chat als het
 *    bewijs. Dat het er één is, ís de reparatie — zie de kop.
 */
const INGANGEN = [
  'src/shared/ui/kiesFoto.ts',
  'src/modules/auth/useAvatarKeuze.ts',
] as const;

const lees = (pad: string) => readFileSync(pad, 'utf8');

describe('geen foto verlaat de app met zijn metadata', () => {
  it.each(INGANGEN)('%s knipt de metadata eraf', (pad) => {
    expect(roeptAan(lees(pad), 'ontdoeVanMetadata')).toBe(true);
  });

  it.each(INGANGEN)('%s laat de foto vallen als het knippen mislukt', (pad) => {
    // ⚠️ **De faalstand is de helft die ertoe doet.** Een aanroep die zijn
    //    uitkomst niet leest, is een aanroep die niets afdwingt: dan gaat de
    //    ongeknipte foto alsnog de deur uit. 📏 Gemeten door `!schoon.ok` uit
    //    `kiesFoto.ts` te halen — dan blijft de aanroep staan en wordt dit
    //    geval rood terwijl het geval hierboven groen blijft.
    const bron = lees(pad).replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(bron).toMatch(/\.ok\b/);
  });

  it('kent elke fotokiezer die er is', () => {
    // ⚠️⚠️ **De tweede helft, en zonder deze helft bewaakt de eerste niets.**
    //    Een lijst met de hand veroudert stil: wie een derde kiezer bouwt, zet
    //    hem niet uit zichzelf hierboven. Deze zeef zoekt de plek waar de bytes
    //    vandaan komen — `launchImageLibraryAsync` van `expo-image-picker` — en
    //    eist dat elk bestand dat hem aanroept in `INGANGEN` staat.
    const gevonden = zoekKiezers();
    expect([...gevonden].sort()).toEqual([...INGANGEN].sort());
  });
});

/** Elk bestand in `src/` en `app/` dat zelf de fotokiezer opent. */
function zoekKiezers(): readonly string[] {
  const raak: string[] = [];
  for (const wortel of ['src', 'app']) loopMap(wortel, raak);
  return raak;
}

function loopMap(map: string, raak: string[]): void {
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) {
      loopMap(pad, raak);
      continue;
    }
    if (!/\.tsx?$/.test(pad) || pad.includes('.test.')) continue;
    // ⚠️ Blokcommentaar eraf, om dezelfde reden als in `roept-aan.ts`: een
    //    aantekening *over* de kiezer is niet de kiezer.
    const bron = lees(pad).replace(/\/\*[\s\S]*?\*\//g, ' ');
    if (/launchImageLibraryAsync\s*\(/.test(bron)) raak.push(pad);
  }
}
