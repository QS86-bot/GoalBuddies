/**
 * Eén normalisatie voor bestandspaden — gedeeld door de controlescripts.
 *
 * ⚠️ **Waarom dit bestand bestaat.** Op 26-08-2026 vond de nieuwe
 *    `scripts_windows`-job binnen twee runs twee keer dezelfde fout: een
 *    controle die zijn uitzonderingen met schuine strepen opschrijft, terwijl
 *    `join()` op Windows `src\lib\database.types.ts` levert. De uitzondering
 *    matcht dan nóóit, en de controle scant precies de bestanden die hij moest
 *    overslaan.
 *
 *    `tekst-controle` meldde daardoor tientallen typedeclaraties als
 *    onvertaalde UI-tekst; `levend-controle` telde 31 vlaggen in plaats van 27,
 *    omdat `useAsync.ts` en `useAsync.test.ts` niet meer uitgezonderd werden.
 *    Beide faalden luid met onzin — en een controle die onzin meldt, leer je
 *    te negeren.
 *
 * ⚠️ **Béide scheidingstekens, en niet alleen `sep`.** Met alleen `sep` is deze
 *    functie op Linux een no-op voor een Windows-pad, en dan is élke test die
 *    het geval nabootst groen zonder iets te bewijzen — vraag 3 uit CLAUDE.md
 *    regel 18. Dit is precies de val waar mijn eerste testversie in liep.
 *
 * ⚠️ **Vergelijk je een gebouwd pad met een letterlijke `/`-vorm, gebruik dan
 *    deze functie.** Bouw je een pad om te lezen, dan hoeft het niet: `join()`
 *    en `readFileSync()` slikken beide vormen op elk platform.
 */
import { sep } from 'node:path';

export function metSchuineStrepen(pad) {
  return pad.split(sep).join('/').replace(/\\/g, '/');
}
