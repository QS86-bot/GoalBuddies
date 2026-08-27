import { describe, expect, it } from 'vitest';

import { metSchuineStrepen } from '../../scripts/paden.mjs';
import { UITGEZONDERD } from '../../scripts/levend-controle.mjs';
import { OVERSLAAN } from '../../scripts/tekst-controle.mjs';

/**
 * Paduitzonderingen werken ook op Windows — QS8-24, verbreed op 26-08-2026.
 *
 * ⚠️ **De `scripts_windows`-job vond deze fout twee runs achter elkaar, in twee
 *    verschillende scripts.** Dat is geen toeval maar een klasse: een controle
 *    schrijft zijn uitzonderingen met schuine strepen, `join()` levert op
 *    Windows backslashes, en de uitzondering matcht dan nóóit — dus de controle
 *    scant juist de bestanden die hij moest overslaan.
 *
 *      tekst-controle   meldde tientallen typedeclaraties uit `database.types.ts`
 *                       en de catalogus als onvertaalde UI-tekst
 *      levend-controle  telde 31 vlaggen in plaats van 27, omdat `useAsync.ts`
 *                       en `useAsync.test.ts` niet meer uitgezonderd werden
 *
 *    Allebei faalden ze luid met onzin. Dat is niet onschuldiger dan stil
 *    falen — een controle die onzin meldt, leer je te negeren.
 *
 * ⚠️ **Waarom `metSchuineStrepen()` béide scheidingstekens omzet en niet alleen
 *    `sep`.** Met alleen `sep` is de functie op Linux een no-op voor een
 *    Windows-pad. Elke test die het geval hier wil nabootsen, normaliseert dan
 *    een pad dat al goed stond en is groen zonder iets te bewijzen. Dat is
 *    vraag 3 uit regel 18, en mijn eerste versie van deze test liep er precies
 *    in. Vandaar letterlijke backslashes hieronder, zonder omzetting vooraf.
 */
describe('metSchuineStrepen', () => {
  it.each([
    ['een Windows-pad', 'src\\lib\\database.types.ts', 'src/lib/database.types.ts'],
    ['een POSIX-pad blijft zoals het is', 'src/lib/x.ts', 'src/lib/x.ts'],
    ['gemengd', 'app\\(tabs)/profiel.tsx', 'app/(tabs)/profiel.tsx'],
    ['zonder scheidingsteken', 'index.ts', 'index.ts'],
  ])('%s', (_naam, invoer, verwacht) => {
    expect(metSchuineStrepen(invoer)).toBe(verwacht);
  });
});

describe('de uitzonderingen van beide controles', () => {
  it.each([
    ['tekst: de gegenereerde types', 'src\\lib\\database.types.ts'],
    ['tekst: de catalogus', 'src\\shared\\i18n\\nl.ts'],
  ])('%s wordt overgeslagen met backslashes', (_naam, pad) => {
    expect(OVERSLAAN.some((r: RegExp) => r.test(metSchuineStrepen(pad)))).toBe(true);
  });

  it.each([
    ['levend: de bron van useAsync', 'src\\shared\\ui\\useAsync.ts'],
    ['levend: de test ernaast', 'src\\shared\\ui\\useAsync.test.ts'],
  ])('%s wordt uitgezonderd met backslashes', (_naam, pad) => {
    // ⚠️ Precies de vier vlaggen die het verschil tussen 31 en 27 maakten.
    expect(UITGEZONDERD.includes(metSchuineStrepen(pad))).toBe(true);
  });

  it.each([
    ['een gewoon scherm', 'app\\(tabs)\\profiel.tsx'],
    ['een module', 'src\\modules\\goals\\regels.ts'],
  ])('%s blijft wél meetellen', (_naam, pad) => {
    // De andere richting. Een uitzonderingenlijst die alles overslaat, is een
    // controle die nooit meer iets vindt.
    const genormaliseerd = metSchuineStrepen(pad);

    expect(OVERSLAAN.some((r: RegExp) => r.test(genormaliseerd))).toBe(false);
    expect(UITGEZONDERD.includes(genormaliseerd)).toBe(false);
  });
});
