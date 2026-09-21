import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { roeptAan } from './roept-aan';
import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

const WORTEL = join(__dirname, '..', '..');

/**
 * Wie toestemming vraagt, zegt wat hij deelt — QS8-229, besluit A41.
 *
 * ⚠️⚠️ **Koppelen aan een open groep deelt élke weekdoelrij, ook de gemiste.**
 *    Aan een beschermde groep niet. Dat verschil is de hele reden dat A41
 *    bestaat, en het is onzichtbaar op het moment dat je op de knop drukt — de
 *    gebruiker deelt dan met terugwerkende kracht zijn slechte weken. Daarom
 *    hoort bij élke koppelknop de zin die zegt wat er opengaat.
 *
 * ⚠️ **De naad die dit bewaakt.** Twee onderdelen klopten los van elkaar:
 *    `koppelDoelAanGroep()` landt de rij en RLS bewaakt hem, en de catalogus
 *    heeft gesplitste zinnen met een reden erbij. Wat níemand toetste is dat elk
 *    schérm dat koppelt die zin ook tóónt. `doel-in-meerdere-groepen.test.ts`
 *    grijpt naar `app/doel/[id].tsx` — één bestandsnaam — en dat is regel 18
 *    vraag 4: een derde koppelscherm is voor die test onzichtbaar. Deze test
 *    leidt zijn lijst daarom af uit wie er koppelt.
 *
 * ⚠️ **De zin moet op `zichtbaarheid` vertakken en niet alleen aanwezig zijn.**
 *    Eén van de twee zinnen neerzetten is voor de helft van de groepen onwaar,
 *    en dat is exact hoe A41 verwatert: niet door hem af te schaffen, maar door
 *    hem in één bewoording plat te slaan.
 *
 * ⚠️ **Ijking, met de hand gedraaid op 09-09-2026:**
 *    - de open/beschermd-ternary uit `app/doel/samen.tsx` halen → rood.
 *    - idem uit `app/groep/nieuw.tsx` → rood.
 *    - één van de twee zinnen laten staan zonder vertakking → rood.
 *    - de zin alleen in commentaar noemen → rood (`roeptAan()`-strip).
 *    - een bestand dat `koppelDoelAanGroep` alleen impórteert → blijft groen.
 */

/** De handeling waar het om gaat. */
const KOPPELT = 'koppelDoelAanGroep';

/**
 * De twee zinnen, in beide naamruimten.
 *
 * ⚠️ `deling.*` staat op het doelscherm en op de uitnodigingsstap, `koppel.*` op
 *    het groepsscherm. Twee naamruimten voor dezelfde belofte is historie en
 *    geen ontwerp; deze test accepteert ze allebei en dwingt alleen af dát er
 *    vertakt wordt.
 */
const OPEN = ['deling.uitleg_open', 'koppel.uitleg_open'] as const;
const BESCHERMD = ['deling.uitleg_beschermd', 'koppel.uitleg_beschermd'] as const;

function bestandenIn(map: string): readonly string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestandenIn(pad) : [pad];
  });
}

/** Elk bestand in `app/` en `src/` dat daadwerkelijk koppelt. */
function koppelaars(): readonly { readonly pad: string; readonly bron: string }[] {
  return ['app', 'src']
    .flatMap((map) => bestandenIn(join(WORTEL, map)))
    .filter((p) => /\.tsx?$/.test(p) && !p.includes('.test.'))
    .map((pad) => ({ pad: pad.slice(WORTEL.length + 1), bron: readFileSync(pad, 'utf8') }))
    .filter(({ bron }) => roeptAan(bron, KOPPELT))
    // ⚠️ De datalaag koppelt ook — dáár staat de functie zelf. Die hoort geen
    //    schermtekst te bevatten; de belofte gaat over de knop, niet over de
    //    aanroep eronder.
    .filter(({ pad }) => !pad.startsWith('src/modules/'));
}

describe('elke koppelknop zegt wat hij deelt', () => {
  const lijst = koppelaars();

  it('vindt de koppelschermen die er zijn', () => {
    // ⚠️ De positieve controle. Zonder deze helft is een lege lijst ook een
    //    lijst waarin iedereen voldoet, en dan bewaakt deze suite niets.
    expect(lijst.length).toBeGreaterThanOrEqual(3);
    expect(lijst.map((k) => k.pad)).toContain('app/doel/samen.tsx');
  });

  it.each(koppelaars().map((k) => [k.pad, k.bron] as const))(
    '%s vertakt tussen de open- en de beschermde zin',
    (pad, bron) => {
      const schoon = zonderCommentaar(bron);

      expect(OPEN.some((s) => schoon.includes(s)), `${pad}: geen open-zin`).toBe(true);
      expect(
        BESCHERMD.some((s) => schoon.includes(s)),
        `${pad}: geen beschermde zin`,
      ).toBe(true);
    },
  );
});
