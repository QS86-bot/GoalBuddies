/**
 * Een vast lettertype voor de browserharnassen. QS8-811.
 *
 * ⚠️ **Waarom.** Zonder geladen lettertype valt `"Times New Roman"` op elke machine terug op een ander
 *    systeemlettertype, en de breedte van een tekstknop volgt het lettertype. 📏 De stijltoets van de
 *    spatiebalk mat in de cloudsessie 78,09 px voor `Optie A` en op de runner van GitHub 77,27 px
 *    (run 45179652334). De momentopname was dus machinegebonden.
 *
 * ⚠️ **Geen download en geen dependency.** Het lettertype staat als subset van 28 KB in de repo
 *    (`tests/browser/harnas/lettertype/`, met licentie) en gaat als `data:`-URL de pagina in. Een
 *    `@font-face` die mislukt, valt in de browser stil terug op het systeemlettertype. Daarom geeft
 *    `wachtOpLettertype()` terug óf het geladen is, en eist de test dat.
 *
 * ⚠️ **Een eigen familienaam**, en niet `DejaVu Sans`. Staat DejaVu Sans op de machine geïnstalleerd
 *    (in de cloudsessie wel), dan zou de browser de systeemversie kunnen pakken, en die is niet gesubset.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const LETTERTYPE = 'Harnaslettertype';

/**
 * De startvlaggen van Chromium voor elke browsertest. QS8-811, vervolg.
 *
 * ⚠️ **Waarom `--font-render-hinting=none`.** Met hinting aan rondt Chromium de breedte van tekst af op hele
 *    pixels. 📏 Op de runner van GitHub mat de stijltoets `Optie A` 80 px (run 45187664320); in de
 *    cloudsessie 79,94 px. Lokaal nagebootst: met `full` of `medium` is "Optie A" 52 px, met `none` of
 *    zonder vlag 51,9375 px. De standaard verschilt dus per machine. Een vast lettertype zonder vaste
 *    rendering meet nog steeds de machine.
 */
export const CHROMIUM_VLAGGEN = ['--font-render-hinting=none'];

const BESTAND = resolve(import.meta.dirname, 'harnas/lettertype/DejaVuSans-latijn.ttf');

/** De `<style>` die het vaste lettertype laadt en op de hele pagina zet. */
export function lettertypeStijl(): string {
  const data = readFileSync(BESTAND).toString('base64');
  return (
    `<style>@font-face{font-family:"${LETTERTYPE}";src:url(data:font/ttf;base64,${data}) format("truetype");}` +
    `*{font-family:"${LETTERTYPE}" !important;}</style>`
  );
}

/**
 * In de pagina: laad het lettertype en zeg of het er is.
 *
 * ⚠️ Niet `document.fonts.check()`: die zegt ook `true` bij een familie die niet bestaat. En een bestand dat
 *    geen lettertype is, laat `load()` afwijzen; dat wordt `false`, zodat precies de lettertypetoets rood
 *    wordt en niet elke test via `beforeEach`.
 */
export function wachtOpLettertype(familie: string): Promise<boolean> {
  return document.fonts
    .load(`16px "${familie}"`)
    .then((faces) => faces.some((f) => f.status === 'loaded'))
    .catch(() => false);
}
