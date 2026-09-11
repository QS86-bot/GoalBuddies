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
 *    | D | een derde bestand met `launchCameraAsync` erbij, niet in `INGANGEN` | "kent elke fotokiezer die er is" |
 *
 *    ⚠️ **D is er sinds QS8-419, en C alleen dekte niet wat deze suite belooft.**
 *       De zeef zocht één van de twee ingangen van `expo-image-picker`; C voert
 *       zijn geval door de ingang die hij wél kende en bewijst daarmee niets
 *       over de andere. Dat is de val uit CLAUDE.md: *een ijking die zijn geval
 *       door een pad voert dat een eerdere grendel al afvangt, bewaakt niets van
 *       wat hij belooft.* Vandaar een mutatie per ingang.
 *
 *    📏 **En de omgekeerde ijking is ook gedaan, want die is het eigenlijke
 *       bewijs:** met de óude zeef (alleen `launchImageLibraryAsync`) én het
 *       camerabestand van D erbij was deze suite **5 passed** — volledig blind.
 *       Dat is de meting die dit issue opleverde.
 *
 *    ⚠️ **B is de mutatie die ertoe doet**, want dat is de vorm die je in het echt
 *       krijgt: iemand roept de knipper aan en leest zijn uitkomst niet. A werd
 *       er groen van gebleven — twee grendels, twee mutaties.
 *
 * ⚠️ **Waarom een lijst en geen zoekopdracht over de hele boom.** Een test die
 *    zelf uitvogelt welke bestanden "een uploadpad" zijn, ijk je niet: je weet
 *    niet of hij niets vond of niet keek. Deze lijst is met de hand vastgesteld
 *    en de tweede helft van deze suite bewaakt dat hij compleet blijft — zodra
 *    er ergens anders een fotokiezer opduikt, wordt hij rood. Wélke kiezers dat
 *    zijn, staat bij `KIEZERS` hieronder; het zijn er twee.
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
 *
 * ⚠️⚠️ **En op 11-09-2026 heeft deze lijst zijn verhuizing gevangen** (QS8-423).
 *    `kiesFoto.ts` ging van `src/shared/ui/` naar `src/shared/kiezers/`, en
 *    drie gevallen werden rood: de twee die het pad lézen, én *"kent elke
 *    fotokiezer die er is"* — want de zeef vond het bestand op zijn nieuwe plek
 *    terwijl deze lijst nog naar de oude wees. Dat is precies waarvoor de
 *    tweede helft bestaat, en het is de reden dat CLAUDE.md een verhuizing de
 *    gevaarlijkste beweging noemt: zonder die helft was de suite groen
 *    gebleven op een lijst die niets meer aanwees.
 */
const INGANGEN = [
  'src/shared/kiezers/kiesFoto.ts',
  'src/modules/auth/useAvatarKeuze.ts',
] as const;

/**
 * De plekken waar `expo-image-picker` bytes van het apparaat aanlevert.
 *
 * ⚠️⚠️ **Twee ingangen en niet één, en dat verschil is een bevinding geweest**
 *    (QS8-419, gevonden in de weekaudit van 10-09-2026). De zeef hieronder
 *    zocht alleen `launchImageLibraryAsync`. 📏 Gemeten op dat moment:
 *    `launchCameraAsync` gaf nul treffers in `src/` en `app/`, dus deze suite
 *    was groen — niet omdat de zeef die ingang zou vinden, maar omdat er nog
 *    geen camera-knop bestond. Een knop "neem een foto" in de groepschat had
 *    de knip stil overgeslagen, en er was geen enkele test rood van geworden.
 *
 * ⚠️ **Beide ingangen leveren dezelfde `assets[0].base64`.** Er is dus geen
 *    reden waarom de ene wel en de andere niet door `ontdoeVanMetadata()` zou
 *    hoeven — en bij de camera weegt het zwaarder, want een verse opname draagt
 *    de coördinaten van waar de gebruiker op dat moment staat.
 *
 * ⚠️ **Geen `g`-vlag.** `lastIndex` is statefull tussen `.test()`-aanroepen en
 *    zou hier willekeurig een bestand overslaan — dezelfde val als in
 *    `elke-soort-passeert-de-poort.test.ts`.
 *
 * ⚠️ `expo-document-picker` staat er met opzet niet bij: `chatdocs` laat alleen
 *    `application/pdf` toe (migratie 0240), en een pdf is geen afbeelding die
 *    deze knipper leest. Komt daar ooit een beeldtype bij, dan hoort die kiezer
 *    hier ook in.
 */
const KIEZERS = /\b(launchImageLibraryAsync|launchCameraAsync)\s*\(/;

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
    //    hem niet uit zichzelf hierboven. Deze zeef zoekt de plekken waar de
    //    bytes vandaan komen — béide ingangen van `expo-image-picker`, zie
    //    `KIEZERS` — en eist dat elk bestand dat er een aanroept in `INGANGEN`
    //    staat.
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
    if (KIEZERS.test(bron)) raak.push(pad);
  }
}
