import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');

function getalUit(pad: string, naam: string): number {
  const bron = readFileSync(join(WORTEL, pad), 'utf8');
  const zonderCommentaar = bron
    .split('\n')
    .filter((regel) => !regel.trimStart().startsWith('*') && !regel.trimStart().startsWith('//'))
    .join('\n');
  const treffer = new RegExp(`const ${naam} = ([0-9_]+);`).exec(zonderCommentaar);
  if (treffer === null) throw new Error(`${naam} niet gevonden in ${pad}`);
  return Number(treffer[1]!.replaceAll('_', ''));
}

/**
 * De klok van de client moet ruimer staan dan die van de Edge Function.
 *
 * ⚠️ **Dit is een naad tussen twee bestanden die elkaar niet importeren.** De
 *    Supabase-client legt één globale timeout op élke fetch, en `functions.invoke()`
 *    loopt daar doorheen. De Doelcoach doet een Anthropic-call en geeft zichzelf
 *    dertig seconden; de kop van `app/doel/coach/[id].tsx` zegt dat hij er gemeten
 *    twintig nodig heeft. De client stond op vijftien.
 *
 * ⚠️ **Vijftien kleiner dan twintig, en niets werd daar rood van.** De client
 *    brak dus élke AI-call af vóórdat hij klaar kón zijn. De job liep gewoon
 *    door en kwam op `done`, de kosten werden geboekt, en het scherm zei "Het
 *    lukte niet". Drukte de gebruiker op Opnieuw, dan was dat een tweede
 *    Anthropic-call en een tweede plek uit zijn dagquotum voor een antwoord dat
 *    al klaarstond. Elk onderdeel klopte; alleen samen deugden ze niet.
 *
 * ⚠️ Deze test toetst de verhouding en niet de getallen zelf. Wie de functie
 *    meer tijd geeft, moet de client meenemen — en andersom.
 */
describe('de klok van de client en die van de Edge Function', () => {
  const clientAlgemeen = getalUit('src/lib/supabase.ts', 'TIMEOUT_MS');
  const clientFunctie = getalUit('src/lib/supabase.ts', 'FUNCTIE_TIMEOUT_MS');
  const doelcoach = getalUit('supabase/functions/doelcoach/index.ts', 'TIMEOUT_MS');

  it('geeft een Edge Function meer tijd dan de gewone verzoeken', () => {
    expect(clientFunctie).toBeGreaterThan(clientAlgemeen);
  });

  it('wacht langer dan de Doelcoach zichzelf gunt', () => {
    // Gelijk is niet genoeg: dan wint de ene keer de client en de andere keer de
    // functie, en dat is de vervelendste soort fout om terug te vinden.
    expect(clientFunctie).toBeGreaterThan(doelcoach);
  });

  it('en de Doelcoach gunt zichzelf meer dan de twintig seconden die hij meet', () => {
    // De gemeten duur staat in de kop van `app/doel/coach/[id].tsx` (21-08-2026).
    // Zakt de functie hieronder, dan breekt hij zijn eigen werk af.
    expect(doelcoach).toBeGreaterThan(20_000);
  });
});
