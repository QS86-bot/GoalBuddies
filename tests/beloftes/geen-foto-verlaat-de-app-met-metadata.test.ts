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
 * 📏 **De ijking — één mutatie per grendel én per ingang, met vooraf 7 groen.**
 *
 *    | Mutatie | Wat er brak | Welk geval rood werd |
 *    |---|---|---|
 *    | A | de knip uit `kiesFoto()` — de kale bytes gaan door | "kiesFoto.ts knipt de metadata eraf" |
 *    | B1 | de faalstand uit `kiesFoto.ts` | "kiesFoto.ts laat de foto vallen …" |
 *    | B2 | de faalstand uit `useAvatarKeuze.ts` | "useAvatarKeuze.ts laat de foto vallen …" |
 *    | C | een derde bestand met `launchImageLibraryAsync` erbij, niet in `INGANGEN` | "kent elke fotokiezer die er is" |
 *    | D | een derde bestand met `launchCameraAsync` erbij, niet in `INGANGEN` | "kent elke fotokiezer die er is" |
 *    | E1 | `kiesFoto.ts` geeft `bytes` terug in plaats van `schoon.data` | "kiesFoto.ts geeft de geknipte bytes terug …" |
 *    | E2 | `useAvatarKeuze.ts` idem | "useAvatarKeuze.ts geeft de geknipte bytes terug …" |
 *
 *    ⚠️⚠️ **B was tot 12-09-2026 één mutatie voor twee ingangen, en dáárdoor
 *       bewaakte hij er maar één** (QS8-443). De assertie was
 *       `toMatch(/\.ok\b/)` op de hele bron. In `kiesFoto.ts` is `schoon.ok` de
 *       enige `.ok`, dus daar beet hij; in `useAvatarKeuze.ts` staan er nog twee
 *       — `uitkomst.ok` in het upload- en het verwijderpad.
 *
 *       📏 Gemeten met de grendel eruit: de óude assertie bleef **groen** op
 *       `uitkomst.ok`, de nieuwe wordt rood. De reparatie is niet een scherpere
 *       regex maar een andere vraag — niet *"staat er ergens een `.ok`"* maar
 *       *"wordt de uitkomst van déze aanroep gelezen"*, gebonden aan de naam die
 *       `opvangerVan()` vindt.
 *
 *    ⚠️ **E is er sinds hetzelfde issue en dekt een klasse die geen van beide
 *       andere gevallen ziet:** de knipper aanroepen, netjes op `.ok` toetsen, en
 *       daarna de **rauwe** bytes teruggeven. Dan staat de grendel er, is de
 *       faalstand dicht, en verlaat de foto de app alsnog met zijn coördinaten.
 *
 *    Afweging in
 *    `docs/decisions/2026-09-12-een-grendel-die-in-twee-bestanden-staat-ijk-je-twee-keer.md`.
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
 *       er groen van gebleven — twee grendels, twee mutaties. En sinds QS8-443
 *       twee ingangen, want een grendel die in twee bestanden staat, ijk je in
 *       twee bestanden.
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

import { roeptAan, zonderCommentaar } from './roept-aan';

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

/**
 * De naam waarin `ontdoeVanMetadata()` wordt opgevangen — QS8-443.
 *
 * ⚠️⚠️ **Hier stond `toMatch(/\.ok\b/)` op de hele bron, en dat was leeg voor
 *    de helft van `INGANGEN`.** 📏 In `kiesFoto.ts` is `schoon.ok` de enige
 *    `.ok` en werkte het; in `useAvatarKeuze.ts` staan er drie — de grendel én
 *    twee `uitkomst.ok` in het upload- en verwijderpad. De grendel weghalen
 *    liet de test dus groen, en dan verlaat de ongeknipte avatar de app.
 *
 *    De reparatie is niet een scherpere regex maar een **andere vraag**: niet
 *    "staat er ergens een `.ok`" maar "wordt de uitkomst van déze aanroep
 *    gelezen". Dat is de belofte; het eerste was de plek.
 */
export function opvangerVan(bron: string): string | null {
  const gevonden = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*ontdoeVanMetadata\s*\(/.exec(
    zonderCommentaar(bron),
  );
  return gevonden?.[1] ?? null;
}

const lees = (pad: string) => readFileSync(pad, 'utf8');

describe('geen foto verlaat de app met zijn metadata', () => {
  it.each(INGANGEN)('%s knipt de metadata eraf', (pad) => {
    expect(roeptAan(lees(pad), 'ontdoeVanMetadata')).toBe(true);
  });

  it.each(INGANGEN)('%s laat de foto vallen als het knippen mislukt', (pad) => {
    // ⚠️ **De faalstand is de helft die ertoe doet.** Een aanroep die zijn
    //    uitkomst niet leest, is een aanroep die niets afdwingt: dan gaat de
    //    ongeknipte foto alsnog de deur uit.
    const bron = zonderCommentaar(lees(pad));
    const opvanger = opvangerVan(bron);

    expect(opvanger, 'de uitkomst van ontdoeVanMetadata() wordt nergens opgevangen').not.toBeNull();
    expect(bron).toMatch(new RegExp(`\\b${opvanger ?? ''}\\.ok\\b`));
  });

  /**
   * ⚠️⚠️ **De klasse die de assertie hierboven níét dekt, ook niet gebonden.**
   *    Een bestand kan de knipper aanroepen, netjes op `.ok` toetsen, en
   *    vervolgens de **rauwe** bytes teruggeven. Dan staat de grendel er, is de
   *    faalstand dicht, en verlaat de foto de app alsnog met zijn coördinaten.
   *    Geen van de twee gevallen hierboven ziet dat.
   */
  it.each(INGANGEN)('%s geeft de geknipte bytes terug en niet de rauwe', (pad) => {
    const bron = zonderCommentaar(lees(pad));
    const opvanger = opvangerVan(bron);

    expect(bron).toMatch(new RegExp(`data:\\s*${opvanger ?? ''}\\.data\\b`));
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
