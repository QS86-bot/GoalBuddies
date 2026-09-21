import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { roeptAan } from './roept-aan';
import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

const WORTEL = join(__dirname, '..', '..');

/**
 * Wie een doel aanmaakt, krijgt de vraag wie het met hem meemaakt — QS8-229.
 *
 * ⚠️⚠️ **De belofte is niet "`plan.tsx` navigeert naar `/doel/samen`".** Dat is
 *    een eigenschap van één bestand, en precies zo'n test bleef groen terwijl de
 *    keten los lag bij QS8-383: `/doel/plan` was af, gemerged, en er verwees
 *    niets naar. De belofte is een eigenschap van het gehéél — *elke manier om
 *    een doel te maken eindigt bij de vraag wie meedoet* — en daarom leidt deze
 *    test zijn lijst af uit wie een doel aanmáákt, en niet uit twee
 *    bestandsnamen die iemand hier ooit heeft ingetypt.
 *
 * ⚠️ **Dat verschil is het hele punt.** Komt er morgen een derde aanmaakroute —
 *    een sneltoets, een deeplink, een scherm voor een gedeeld doel — dan staat
 *    die vanzelf in deze lijst en wordt deze test rood tot hij de vraag ook
 *    stelt. Een test met `'app/doel/plan.tsx'` erin getypt zou hem nooit zien.
 *
 * ⚠️ **Wat deze test niet kan.** Hij leest bron en voert niets uit; er is in dit
 *    project geen renderer (zie de kop van `aanmeldscherm.test.ts`). Hij toetst
 *    dus dat de bestemming in het bestand stáát, niet dat de gebruiker er komt.
 *    Die tweede helft is `schermingang:controle` — die eist dat `/doel/samen`
 *    überhaupt een ingang heeft — plus de handmatige doorloop op QS8-200.
 *
 * ⚠️ **Ijking, met de hand gedraaid op 09-09-2026:**
 *    - `nieuw.tsx` terug op `router.replace('/doel/${…}')` → rood.
 *    - `plan.tsx` terug op `router.replace('/')` → rood.
 *    - `SAMEN` in `doelroute.ts` op een ander pad → rood (beide schermen).
 *    - alleen de bestemming in commentaar noemen → rood, want `roeptAan()` en de
 *      strip hieronder halen commentaar weg.
 */

/** Wie een doel áánmaakt. Twee namen, want er zijn twee manieren. */
const MAAKT_EEN_DOEL = ['maakDoel', 'pasPlanToe'] as const;

/** De bestemming die zo'n scherm in zijn succespad moet noemen. */
const SAMEN = '/doel/samen';

/**
 * De functie die de bestemming draagt.
 *
 * ⚠️ **Een scherm mag hem aanroepen óf het pad zelf noemen, en allebei telt.**
 *    De belofte is dat de gebruiker bij de vraag uitkomt, niet dat hij daar via
 *    een bepaalde functie komt — een test die de fúnctie eist, toetst een
 *    ontwerpkeuze en wordt rood van een refactor die niets breekt. Wat hij wél
 *    moet vangen is een scherm dat rechtstreeks ergens ánders heen gaat, en dat
 *    doet hij: dan staat geen van beide erin.
 */
const HELPER = 'naEenNieuwDoel';

function bestandenIn(map: string): readonly string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestandenIn(pad) : [pad];
  });
}

/**
 * De schermen die een doel aanmaken.
 *
 * ⚠️ Alleen `app/` — daar wonen de schermen. Een module die `maakDoel()`
 *    doorgeeft is geen aanmaakroute maar de laag eronder, en die hoort niets
 *    over navigatie te weten.
 */
function schermenDieEenDoelMaken(): readonly { readonly pad: string; readonly bron: string }[] {
  return bestandenIn(join(WORTEL, 'app'))
    .filter((p) => p.endsWith('.tsx') && !p.includes('.test.'))
    .map((pad) => ({ pad: pad.slice(WORTEL.length + 1), bron: readFileSync(pad, 'utf8') }))
    .filter(({ bron }) => MAAKT_EEN_DOEL.some((naam) => roeptAan(bron, naam)));
}

describe('elke manier om een doel te maken eindigt bij de vraag wie meedoet', () => {
  const schermen = schermenDieEenDoelMaken();

  it('vindt de aanmaakroutes die er zijn', () => {
    // ⚠️ **De positieve controle, en zonder deze helft bewaakt de test niets.**
    //    Zeeft `roeptAan()` straks alles weg — een hernoemde functie, een andere
    //    aanroepvorm — dan is een lege lijst óók een lijst waarin elk scherm
    //    voldoet, en dan is deze suite groen over een app zonder doelroute.
    expect(schermen.map((s) => s.pad).sort()).toEqual([
      'app/doel/nieuw.tsx',
      'app/doel/plan.tsx',
    ]);
  });

  it.each(schermenDieEenDoelMaken().map((s) => [s.pad, s.bron] as const))(
    '%s stuurt de gebruiker naar de uitnodigingsstap',
    (pad, bron) => {
      const schoon = zonderCommentaar(bron);
      expect(schoon.includes(SAMEN) || roeptAan(schoon, HELPER), pad).toBe(true);
    },
  );
});

describe('de bestemming staat op één plek', () => {
  it('`naEenNieuwDoel()` en de schermen noemen hetzelfde pad', () => {
    // ⚠️ De helper alleen is geen grendel: een scherm dat hem negeert en zelf
    //    een pad typt, is even stil kapot. Daarom leest de test hierboven de
    //    schermen. Deze test bewaakt de andere kant — dat de helper niet
    //    ergens anders heen wijst dan waar de schermen op rekenen.
    const bron = readFileSync(join(WORTEL, 'src', 'modules', 'goals', 'doelroute.ts'), 'utf8');
    expect(zonderCommentaar(bron)).toContain(`'${SAMEN}'`);
  });
});
