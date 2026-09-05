import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { nl } from '../../src/shared/i18n/nl';

/**
 * De huddledag valt op de dag zelf op — QS8-199.
 *
 * ⚠️ **De belofte is niet "er staat ergens het woord vandaag".** De huddledag
 *    bepaalt de weekafsluiting, De Ketting en het groepsoverzicht, en er was
 *    níéts dat hem markeerde wanneer hij er wás. "Huddledag: zondag" op een
 *    zondag laat de lezer dat zelf uitrekenen — dat is de bevinding van 18-08.
 *
 * ⚠️ **Dus toetst dit bestand twee dingen die een verhuizing overleven.**
 *
 *    1. **De catalogus draagt een zin die het nú noemt en geen dagnaam.** Een
 *       "vandaag"-zin met `{dag}` erin is de fout terug in nieuwe kleren.
 *    2. **Elke plek die de huddledag toont, vraagt het aan de klok van de
 *       groep.** Dat is de vraag van regel 18: is de keten ergens onderbroken
 *       terwijl elk schakeltje af is? De helper kan perfect zijn en nergens
 *       aangeroepen worden, en dan is er niets kapot en werkt er niets.
 *
 * ⚠️ **Waarom een zoektocht over de schermlaag en niet één bestandsnaam.** Een
 *    test die `app/(tabs)/groep.tsx` bij naam noemt, verhuist niet mee en wordt
 *    niet rood als er een dérde scherm bijkomt dat de huddledag toont — hij
 *    bewaakt dan iets anders dan hij belooft (regel 18, vraag 4). De vraag hier
 *    is over de laag: wie de huddledag rendert, vraagt het aan de klok.
 *
 * ⚠️ **`isHuddledagVandaag()` zelf staat niet hier onder test maar in
 *    `src/modules/buddies/periods.test.ts`** — daar met twee huddledagen en twee
 *    tijdzones, zoals domeinregel 1 eist. Dit bestand bewaakt de aansluiting.
 */

/** De sleutels die de huddledag als dagnaam tonen. */
const DAGNAAMSLEUTELS = ['groepen.huddledag', 'groepdetail.eyebrow'] as const;

/** En de zinnen die op de dag zelf in de plaats komen. */
const VANDAAGSLEUTELS = ['groepen.huddledag_vandaag', 'groepdetail.eyebrow_vandaag'] as const;

/**
 * Haalt commentaar weg voordat er in de bron gezocht wordt.
 *
 * ⚠️ **Twee keer gemeten en twee keer fout, dus dit staat er met reden.** De
 *    eerste versie zocht op de naam `isHuddledagVandaag` — die staat ook in de
 *    import-regel, dus het weghalen van de aanroep bleef groen. De tweede zocht
 *    op de áánroepvorm `isHuddledagVandaag(` — en die staat in het commentaar
 *    dat bij dat scherm uitlegt waarom de klok van de groep gevraagd wordt.
 *    Allebei bewaakten ze dat er ooit iemand aan gedacht heeft, niet dat het
 *    scherm het dóet.
 *
 *    Precies de valkuil uit CLAUDE.md bij regel 18: een grendel die zijn geval
 *    door een éérdere trefkans voert, bewaakt niets van wat hij belooft. Dat het
 *    twee rondes kostte om dat te zien, is de reden dat een mutatie met de hand
 *    de standaard is en niet een redenering.
 */
function zonderCommentaar(bron: string): string {
  return bron
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function bestandenIn(map: string): readonly string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) {
      uit.push(...bestandenIn(pad));
    } else if (pad.endsWith('.tsx') || pad.endsWith('.ts')) {
      uit.push(pad);
    }
  }
  return uit;
}

describe('de huddledag valt op de dag zelf op', () => {
  it('heeft voor elke dagnaamzin een tegenhanger die het nú noemt', () => {
    for (const sleutel of VANDAAGSLEUTELS) {
      const zin = nl[sleutel];
      expect(zin, `${sleutel} hoort in de catalogus te staan`).toBeTruthy();
      expect(
        zin,
        `${sleutel} draagt nog een {dag}-plaatshouder — dan staat er op de dag ` +
          'zelf weer een dagnaam, en laat je de lezer alsnog uitrekenen of het vandaag is',
      ).not.toContain('{dag}');
    }
  });

  it('laat de dagnaamzin en de vandaagzin verschillen', () => {
    const paren = [
      ['groepen.huddledag', 'groepen.huddledag_vandaag'],
      ['groepdetail.eyebrow', 'groepdetail.eyebrow_vandaag'],
    ] as const;

    for (const [dagnaam, vandaag] of paren) {
      expect(nl[vandaag]).not.toBe(nl[dagnaam]);
    }
  });

  it('vraagt op elke plek die de huddledag toont de klok van de groep', () => {
    // ⚠️ De keten. Rendert een scherm een dagnaamsleutel zonder ooit
    //    `isHuddledagVandaag` aan te roepen, dan toont het op de huddledag
    //    hetzelfde als op elke andere dag — precies de stand van vóór QS8-199.
    const schermen = bestandenIn('app');

    const tonenDeHuddledag = schermen.filter((pad) => {
      const bron = zonderCommentaar(readFileSync(pad, 'utf8'));
      return DAGNAAMSLEUTELS.some((sleutel) => bron.includes(`'${sleutel}'`));
    });

    expect(
      tonenDeHuddledag.length,
      'geen enkel scherm toont de huddledag meer — dan bewaakt deze test niets ' +
        'en is hij het herschrijven waard',
    ).toBeGreaterThan(0);

    const zonderKlok = tonenDeHuddledag.filter(
      (pad) => !/isHuddledagVandaag\s*\(/.test(zonderCommentaar(readFileSync(pad, 'utf8'))),
    );

    expect(
      zonderKlok,
      'deze schermen tonen de huddledag maar vragen nergens of het vandaag is',
    ).toEqual([]);
  });
});
