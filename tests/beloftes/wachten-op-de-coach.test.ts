import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Een scherm dat op de coach wacht, laat zien dát het wacht — QS8-208.
 *
 * ⚠️ **De naad, en het waren er letterlijk twee.** Het coachscherm en het
 *    weekdoelenscherm hadden allebei dezelfde vier regels JSX voor de fase
 *    `bezig`: een kop, een zin, en verder niets. Twee kopieën van dezelfde
 *    belofte is de vorm uit onwrikbare regel 18 — allebei kloppen ze, en zodra
 *    iemand er één aanpast lopen ze uit elkaar zonder dat er iets rood wordt.
 *    Dat is geen hypothese: precies dat gebeurde met `'error'` tegen `'failed'`,
 *    waar de ene tak gerepareerd werd en de andere de kop van de reparatie
 *    citeerde.
 *
 * ⚠️ **Waarom de lijst uit `fetchJob(` komt en niet uit twee bestandsnamen.**
 *    Een derde scherm dat op een AI-job gaat wachten, is de gebeurtenis die deze
 *    belofte breekt — en een test met twee namen erin ziet dat per definitie
 *    niet. Wie hier gaat pollen, moet ook laten zien dat hij wacht.
 *
 * ⚠️ Met de hand rood gemaakt, per grendel apart:
 *    1. `<Wachtbalk` uit het coachscherm gehaald   → grendel 1 rood.
 *    2. de `uitweg`-prop weggelaten                → grendel 2 rood.
 *    3. `voortgangsweergave()` uit `Wachtbalk.tsx` → grendel 3 rood.
 *    4. `wachtstand()` uit `Wachtbalk.tsx`         → grendel 3 rood.
 */
const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

/** Het component waar de belofte in zit. */
const WACHTBALK = 'src/shared/ui/Wachtbalk.tsx';

function bestanden(map: string): string[] {
  const pad = join(WORTEL, map);
  const gevonden: string[] = [];

  for (const naam of readdirSync(pad)) {
    const vol = join(pad, naam);
    if (statSync(vol).isDirectory()) {
      gevonden.push(...bestanden(join(map, naam)));
    } else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) {
      gevonden.push(join(map, naam));
    }
  }

  return gevonden;
}

/** Elk scherm dat op een AI-job staat te wachten. */
const WACHTERS = bestanden('app')
  .map((pad) => ({ pad, bron: readFileSync(join(WORTEL, pad), 'utf8') }))
  .filter((s) => s.bron.includes('fetchJob('));

describe('een scherm dat op de coach wacht, laat dat zien', () => {
  it('vindt de schermen die op een job wachten', () => {
    // Een lege lijst is geen uitslag. Verhuist `fetchJob` of heet hij anders, dan
    // bewaakt alles hieronder niets meer — en dat moet je merken.
    expect(WACHTERS.map((s) => s.pad).length).toBeGreaterThan(0);
  });

  for (const { pad, bron } of WACHTERS) {
    // Grendel 1: geen twee regels stilstaande tekst meer.
    it(`${pad} toont een Wachtbalk tijdens het wachten`, () => {
      expect(
        bron,
        `${pad} pollt een AI-job maar toont geen \`Wachtbalk\`. Twintig seconden ` +
          'naar stilstaande tekst kijken leest als een app die vastloopt, en dat ' +
          'is precies de bevinding van de doorloop van 30-08.',
      ).toContain('<Wachtbalk');
    });

    // Grendel 2: er is een uitweg tijdens het wachten.
    it(`${pad} geeft de Wachtbalk een uitweg mee`, () => {
      expect(
        bron,
        `De \`Wachtbalk\` in ${pad} heeft geen \`uitweg\`. Zonder knop zit je twintig ` +
          'seconden vast aan een scherm waar je niets kunt.',
      ).toMatch(/<Wachtbalk[\s\S]*?uitweg=/);
    });
  }
});

/**
 * Grendel 3: de beslissingen zijn geen versiering.
 *
 * ⚠️ **Dit is regel 18 vraag 3 in zijn scherpste vorm.** `wachtvoortgang.test.ts`
 *    toetst dat `voortgangsweergave(true).teller` waar is, en die test blijft
 *    groen als `Wachtbalk.tsx` die functie nooit aanroept en zelf een balk
 *    hardcodeert. Dan is er voor wie om minder beweging vraagt geen enkele
 *    zichtbare voortgang — precies de belofte waar de pure module voor bestaat —
 *    en meldt geen enkele test iets.
 */
describe('de Wachtbalk leunt op de beslissingen en niet op zichzelf', () => {
  const bron = readFileSync(join(WORTEL, WACHTBALK), 'utf8');

  it('vraagt aan voortgangsweergave() wat er zichtbaar moet zijn', () => {
    expect(
      bron,
      `${WACHTBALK} roept \`voortgangsweergave()\` niet aan. Dan is de terugval op ` +
        'een tekstuele teller bij "verminder beweging" een belofte in een testbestand ' +
        'en niet iets dat op het scherm staat.',
    ).toContain('voortgangsweergave(');
    expect(bron).toContain('weergave.teller');
  });

  it('vraagt aan wachtstand() hoe ver het is', () => {
    expect(
      bron,
      `${WACHTBALK} roept \`wachtstand()\` niet aan. Dan zegt niets meer dat de balk ` +
        'naar de verwachte twintig seconden loopt en voorbij die tijd overgaat in ' +
        '"dit duurt langer dan gewoonlijk".',
    ).toContain('wachtstand(');
    expect(bron).toContain("'duurt_langer'");
  });
});
