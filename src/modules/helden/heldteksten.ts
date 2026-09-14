import type { Sleutel } from '../../shared/i18n';

import { type Heldsleutel } from './helden';

/**
 * De catalogussleutels van de zes helden — QS8-469, afgesplitst bij QS8-475.
 *
 * ⚠️ **Staat los van `helden.ts` omdat dat bestand naar Deno gaat.** De
 *    meldingenjob kiest daar welke held spreekt en heeft de app-catalogus niet;
 *    `edge:sync` neemt `helden.ts` mee en dit bestand met opzet niet. Een
 *    type-only import van `Sleutel` telt daarbij gewoon mee — Deno moet het
 *    bestand alsnog kunnen oplossen.
 */

/** De drie teksten die elke held zelf draagt, los van zijn quotes. */
export type Heldtekst = 'naam' | 'ondertitel' | 'persoonlijkheid';

/**
 * De catalogussleutels van de drie teksten die elke held zelf draagt.
 *
 * ⚠️⚠️ **Voluit en niet samengesteld sinds QS8-474, om twee redenen die allebei
 *    gemeten zijn.**
 *
 *    1. **TypeScript toetst ze nu echt.** Hier stond `` `held.${sleutel}.${veld}`
 *       as Sleutel ``, en die cast is precies zo sterk als de belofte dat de
 *       sleutel bestaat. `t()` valt bij een onbekende sleutel terug op de
 *       sleutel zelf, dus een typefout werd een scherm met `held.qiup.naam`
 *       erop. Hieronder is elke waarde een `Sleutel`-literal.
 *    2. **`npm run catalogus:controle` kan een helper niet volgen.** Die
 *       controle herkent een template-literal alleen als hij direct in `t()`
 *       staat. 📏 Daarom stonden deze achttien sleutels na QS8-469 in
 *       `NOG_NIET_AANGESLOTEN` met de reden "heldencopy zonder scherm" — maar
 *       die reden werd onwaar zodra QS8-474 ze tóónde, en de controle zou dat
 *       niet hebben gemerkt. Nu ziet hij ze, en zijn de achttien rijen weg.
 *
 * ⚠️ De toets die hier al stond blijft staan: `helden.test.ts` legt elke
 *    afgeleide sleutel naast béide catalogi. Die vangt nu iets anders dan
 *    daarvoor — niet meer "bestaat de sleutel" (dat doet `tsc`) maar "staat hij
 *    ook in het Engels", en dat blijft handwerk.
 */
const TEKSTSLEUTELS: Readonly<Record<Heldsleutel, Readonly<Record<Heldtekst, Sleutel>>>> = {
  strix: {
    naam: 'held.strix.naam',
    ondertitel: 'held.strix.ondertitel',
    persoonlijkheid: 'held.strix.persoonlijkheid',
  },
  ignis: {
    naam: 'held.ignis.naam',
    ondertitel: 'held.ignis.ondertitel',
    persoonlijkheid: 'held.ignis.persoonlijkheid',
  },
  meridian: {
    naam: 'held.meridian.naam',
    ondertitel: 'held.meridian.ondertitel',
    persoonlijkheid: 'held.meridian.persoonlijkheid',
  },
  forge: {
    naam: 'held.forge.naam',
    ondertitel: 'held.forge.ondertitel',
    persoonlijkheid: 'held.forge.persoonlijkheid',
  },
  lucerna: {
    naam: 'held.lucerna.naam',
    ondertitel: 'held.lucerna.ondertitel',
    persoonlijkheid: 'held.lucerna.persoonlijkheid',
  },
  quip: {
    naam: 'held.quip.naam',
    ondertitel: 'held.quip.ondertitel',
    persoonlijkheid: 'held.quip.persoonlijkheid',
  },
};

/**
 * De catalogussleutel voor een tekst van een held.
 *
 * ⚠️ **Eén functie en geen drie.** Elke geëxporteerde functie zonder aanroeper
 *    is een rij in `BEKENDE_ONBEREIKBAAR`, en dat register mag alleen groeien
 *    met de reden erbij. Drie helpers die verschillen in één woord zijn drie
 *    rijen voor één gat.
 */
export function heldTekstSleutel(sleutel: Heldsleutel, veld: Heldtekst): Sleutel {
  return TEKSTSLEUTELS[sleutel][veld];
}
