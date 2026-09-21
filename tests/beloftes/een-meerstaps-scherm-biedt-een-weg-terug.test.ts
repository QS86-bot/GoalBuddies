/**
 * De belofte: **een scherm dat je door stappen leidt, laat je ook terug** —
 * QS8-438.
 *
 * ⚠️⚠️ **Dit is de belofte en niet de plek** (regel 18, vraag 4). De klacht ging
 *    over `app/onboarding/uitleg.tsx`, maar een test die dáár een knop zoekt,
 *    bewaakt dat ene scherm en niets anders — en het gat ontstaat bij het
 *    volgende meerstaps-scherm dat iemand bouwt. Deze suite zoekt daarom geen
 *    bestandsnaam en geen letterlijke zin: hij vindt zélf welke schermen
 *    stappen hebben, en eist van elk dat er een weg terug is.
 *
 * ⚠️⚠️ **Wat een "stap" is, is hier een meting en geen naam.** 📏 Op 12-09-2026
 *    staan er in `app/` acht stukken state die opgehoogd worden, en zes ervan
 *    zijn géén stap: `ronde` is een herlaadteller en `paginaNr` telt pagina's
 *    bij. Een regel op "wordt opgehoogd" alleen meldt die zes ook, en een
 *    controle die zes onzinnige dingen meldt leer je uitzetten.
 *
 *    De zeef eist daarom **twee** eigenschappen tegelijk: de state wordt
 *    opgehoogd **én** er wordt op vergeleken met een vast getal om te bepalen
 *    wat er getekend wordt. 📏 Gemeten over de hele map: die combinatie geeft
 *    precies de twee stapschermen en nul van de zes tellers.
 *
 * ⚠️ **Waarom een bronzeef en geen echte klik.** Dit project heeft met opzet
 *    geen React-renderer: `de-terugknop-van-de-router.test.ts` legt uit waarom
 *    ("de keuze is niet gedrag of tekst, maar tekst of niets"). Zelfde afweging,
 *    zelfde uitkomst.
 *
 * 📏 **De ijking — één mutatie per grendel, met vooraf gemeten 9 groen.**
 *
 *    | Mutatie | Wat er brak | Wat er rood werd |
 *    |---|---|---|
 *    | A | de terugovergang uit `uitleg.tsx` | 1 — "elk stapscherm laat je terug" |
 *    | B | de terugovergang uit `vragenlijst.tsx` | 1 — dezelfde, dus de zeef kijkt écht naar allebei |
 *    | C | de vergelijking als eis eruit | **3** — de twee tellertests én de belofte |
 *    | D | `onboarding.vorige` uit `en.ts` | 1 — "elke terug-sleutel staat in nl en en" |
 *
 *    ⚠️ **C is de mutatie die het meest zegt.** Zonder die eis leest de zeef de
 *       zes herlaad- en pagineertellers als stap zónder weg terug, en dan meldt
 *       hij zes schermen waar niets mis mee is. Dat hij dáár rood van wordt, is
 *       het bewijs dat de eis draagt en niet versiering is.
 *
 *    ⚠️ A en B maken dezelfde test rood, en dat hoort zo: de belofte is er één
 *       over de hele map. Wélk scherm hem breekt, staat in de foutmelding.
 *
 * Afweging in
 * `docs/decisions/2026-09-12-een-stap-vooruit-hoort-een-stap-terug-te-hebben.md`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { bestemmingVoor } from '../../src/modules/auth/routewacht';

/**
 * ⚠️ De knip staat sinds QS8-446 in `scripts/zonder-commentaar.mjs` en wordt
 *    hier alleen doorgegeven, zodat de bestaande importeurs blijven werken.
 *    Eén knip, één ijking — zie de kop van dat bestand.
 */
import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

export { zonderCommentaar };

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

interface Stapstate {
  readonly naam: string;
  readonly heeftTerug: boolean;
}

/**
 * De stap-states in één bestandstekst, met of er een weg terug is.
 *
 * ⚠️ Geëxporteerd en zonder bestandssysteem: een zeef die je niet kunt voeden,
 *    kun je niet ijken.
 */
export function stappenIn(bron: string): readonly Stapstate[] {
  const schoon = zonderCommentaar(bron);
  const gevonden: Stapstate[] = [];

  for (const m of schoon.matchAll(
    /set([A-Z][A-Za-z0-9]*)\(\s*\(\s*([a-zA-Z0-9]+)\s*\)\s*=>[^)\n]*\2\s*\+\s*1/g,
  )) {
    const groot = m[1] ?? '';
    const naam = groot.charAt(0).toLowerCase() + groot.slice(1);
    if (gevonden.some((s) => s.naam === naam)) continue;

    // Alleen een state waar op vergeleken wordt, stuurt wát er getekend wordt.
    const stuurtWeergave = new RegExp(`\\b${naam}\\b\\s*(===|!==|<|>|<=|>=)\\s*[0-9A-Z]`).test(
      schoon,
    );
    if (!stuurtWeergave) continue;

    const terug = new RegExp(`set${groot}\\(\\s*\\(\\s*[a-zA-Z0-9]+\\s*\\)\\s*=>[^\\n]*-\\s*1`).test(
      schoon,
    );
    gevonden.push({ naam, heeftTerug: terug });
  }

  return gevonden;
}

/** Alle schermen in `app/`, als repo-relatieve paden. */
function schermen(): readonly string[] {
  const uit: string[] = [];
  const loop = (map: string) => {
    for (const naam of readdirSync(join(WORTEL, map))) {
      const pad = `${map}/${naam}`;
      if (statSync(join(WORTEL, pad)).isDirectory()) loop(pad);
      else if (/\.tsx$/.test(naam) && !/^(_layout|\+html|\+not-found)\.tsx$/.test(naam)) {
        uit.push(pad);
      }
    }
  };
  loop('app');
  return uit;
}

// ---------------------------------------------------------------------------

describe('de zeef vindt een stap en laat een teller met rust', () => {
  it('een state die opgehoogd wordt én de weergave stuurt, is een stap', () => {
    const bron = 'const [stap, setStap] = useState(0);\nsetStap((n) => n + 1);\nstap === 2 ? a : b';
    expect(stappenIn(bron)).toEqual([{ naam: 'stap', heeftTerug: false }]);
  });

  it('en met een terugovergang erbij is hij compleet', () => {
    const bron =
      'setStap((n) => n + 1);\nstap === 2 ? a : b\nsetStap((n) => Math.max(0, n - 1));';
    expect(stappenIn(bron)).toEqual([{ naam: 'stap', heeftTerug: true }]);
  });

  /**
   * ⚠️⚠️ **De helft die net zo zwaar weegt.** Een herlaadteller wordt ook
   *    opgehoogd en heeft per definitie geen "terug". Meldt de zeef die, dan
   *    staan er zes valse treffers en leert iedereen hem negeren.
   */
  it('laat een herlaadteller met rust', () => {
    expect(stappenIn('const herlaad = () => setRonde((n) => n + 1);')).toEqual([]);
  });

  it('laat een pagineerteller met rust', () => {
    expect(stappenIn('setPaginaNr((n) => n + 1);')).toEqual([]);
  });

  it('een uitleg óver een terugknop telt niet als terugknop', () => {
    const bron =
      'setStap((n) => n + 1);\nstap === 1 ? a : b\n/* hier stond setStap((n) => n - 1) */';
    expect(stappenIn(bron)).toEqual([{ naam: 'stap', heeftTerug: false }]);
  });
});

describe('de belofte, over de hele map', () => {
  it('elk stapscherm laat je terug', () => {
    const zonderWegTerug: string[] = [];
    let gevonden = 0;

    for (const pad of schermen()) {
      for (const stap of stappenIn(readFileSync(join(WORTEL, pad), 'utf8'))) {
        gevonden += 1;
        if (!stap.heeftTerug) zonderWegTerug.push(`${pad} (${stap.naam})`);
      }
    }

    expect(gevonden, 'geen enkel stapscherm gevonden — dan meet deze zeef niets').toBeGreaterThan(
      0,
    );
    expect(zonderWegTerug).toEqual([]);
  });
});

describe('de labels bestaan in beide catalogi', () => {
  /**
   * ⚠️ Criterium 7: de knoptekst komt uit `shared/i18n` en staat in `nl` én
   *    `en`. Een sleutel die alleen in het Nederlands bestaat, geeft een lege
   *    knop voor de helft van de gebruikers.
   */
  it('elke terug-sleutel van een stapscherm staat in nl en en', async () => {
    const nl = readFileSync(join(WORTEL, 'src/shared/i18n/nl.ts'), 'utf8');
    const en = readFileSync(join(WORTEL, 'src/shared/i18n/en.ts'), 'utf8');

    for (const sleutel of ['onboarding.vorige', 'vragenlijst.vorige']) {
      expect(nl.includes(`'${sleutel}'`), `${sleutel} ontbreekt in nl.ts`).toBe(true);
      expect(en.includes(`'${sleutel}'`), `${sleutel} ontbreekt in en.ts`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **Waarom `uitleg.tsx` géén terugknop in de kóp krijgt, gemeten in plaats
 *    van beweerd.** Criterium 1 van QS8-438 vroeg er wél om. De reden dat hij er
 *    niet komt, is dat hij aantoonbaar niets doet — en dat is hier een proef en
 *    geen argument in een comment.
 *
 *    `useTerug()` doet `canGoBack() ? back() : replace(naar)`. Vanaf de uitleg
 *    kom je met `back()` op het aanmeldscherm dat je net verlaten hebt, en daar
 *    stuurt de routewacht je meteen terug. Een knop die aanvoelt als kapot is
 *    precies wat QS8-211 met een verplichte `naar` kwam wegnemen.
 */
describe('een terugknop in de kop van de uitleg zou bouncen', () => {
  const ingelogdNietOnboarded = {
    sessieLaadt: false,
    profielLaadt: false,
    heeftSessie: true,
    profielFout: null,
    isOnboarded: false,
    tak: '',
  };

  it('het aanmeldscherm stuurt een niet-onboarde sessie terug naar de uitleg', () => {
    expect(bestemmingVoor({ ...ingelogdNietOnboarded, wortel: 'aanmelden' })).toBe(
      '/onboarding/uitleg',
    );
  });

  it('terwijl de uitleg zelf blijft staan — dus de sprong is een rondje', () => {
    expect(bestemmingVoor({ ...ingelogdNietOnboarded, wortel: 'onboarding' })).toBeNull();
  });
});
