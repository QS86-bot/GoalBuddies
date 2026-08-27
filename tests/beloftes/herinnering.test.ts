import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * "Uit is uit" heeft één schrijver — QS8-77.
 *
 * ⚠️ **Waarom een test die de repo afzoekt en niet nog een unit-test.** De
 *    belofte is: zet je de dagelijkse herinnering uit, dan wordt `reminder_time`
 *    léég gemaakt en niet bewaard "voor als je hem weer aanzet". Leerpunt uit de
 *    Habit Huddle-analyse — een herinnering die vanzelf terugkomt, is de snelste
 *    manier om een app van iemands telefoon te krijgen.
 *
 *    `herinneringVelden()` in `src/modules/notifications/regels.ts` dwingt dat
 *    af, en `regels.test.ts` toetst dat die functie het goed doet. Maar dat is
 *    een eigenschap van een ónderdeel. De belofte breekt op een andere manier:
 *    een scherm dat de drie velden zélf samenstelt en de functie overslaat. Dan
 *    blijft `regels.test.ts` groen en klopt de app niet meer.
 *
 *    Dat is geen hypothese. Tot 26-08-2026 stond deze regel als één ternary in
 *    `app/onboarding/profiel.tsx`, en dat was juist zolang er één schrijver was.
 *    Op de dag dat het profieltabblad hetzelfde kon, waren het er twee — precies
 *    de vorm die CLAUDE.md regel 18 beschrijft, en de reden dat QS8-115 en
 *    QS8-120/121 hier al een keer op zijn omgevallen: code verhuist, de test
 *    verhuist mee, en de belofte blijft achter.
 *
 * ⚠️ Deze test is met de hand rood gemaakt door in `app/(tabs)/profiel.tsx`
 *    `reminder_time: null` terug te zetten in plaats van de helper aan te
 *    roepen. Dan noemt hij dat bestand met naam.
 */

// ⚠️ `fileURLToPath` en niet `.pathname`: die tweede geeft op Windows `/C:/…`
//    en houdt op élk platform de URL-codering vast. Zelfde vorm B als in
//    `tests/scripts/padvormen.test.ts`.
const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

/** De enige plek die deze drie velden zelf mag samenstellen. */
const SCHRIJVER = 'src/modules/notifications/regels.ts';

/**
 * De datalaag mag ze doorgeven — die kopieert een gevalideerd patch veld voor
 * veld naar PostgREST en neemt geen enkel besluit over de inhoud.
 */
const DOORGEEFLUIKEN = ['src/modules/auth/profile.ts', 'src/modules/auth/schemas.ts'];

/**
 * Gegenereerd, en dus geen schrijver: hier staat `reminder_time` als
 * typedeclaratie van een kolom en niet als waarde die iemand kiest. Met de hand
 * bewerken staat er zelf bovenaan verboden; `npm run types:db` maakt hem.
 */
const GEGENEREERD = ['src/lib/database.types.ts'];

const MAPPEN = ['app', 'src'];

/** Een toewijzing in een objectliteraal: `reminder_time: <iets>`. */
const TOEWIJZING = /\breminder_time\s*:/;

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

export function schrijvers(
  bestandenMetInhoud: readonly { readonly pad: string; readonly inhoud: string }[],
): string[] {
  return bestandenMetInhoud
    .filter((b) => TOEWIJZING.test(b.inhoud))
    .map((b) => b.pad.replace(/\\/g, '/'))
    .filter(
      (pad) =>
        pad !== SCHRIJVER && !DOORGEEFLUIKEN.includes(pad) && !GEGENEREERD.includes(pad),
    );
}

describe('"uit is uit" heeft één schrijver', () => {
  it('geen scherm stelt de herinneringsvelden zelf samen', () => {
    const alles = MAPPEN.flatMap((map) =>
      bestanden(map).map((pad) => ({ pad, inhoud: readFileSync(join(WORTEL, pad), 'utf8') })),
    );

    const overtreders = schrijvers(alles);

    expect(overtreders, overtreders.join(', ')).toEqual([]);
  });

  it('en de schrijver die er wél is, bestaat nog', () => {
    // ⚠️ Zonder deze helft is een repo waarin `herinneringVelden()` helemaal
    //    verdwenen is net zo groen als een repo waarin alles klopt. Dat is
    //    vraag 3 uit regel 18: kan deze test groen blijven terwijl de belofte
    //    breekt?
    const bron = readFileSync(join(WORTEL, SCHRIJVER), 'utf8');

    expect(TOEWIJZING.test(bron)).toBe(true);
    expect(bron).toContain('export function herinneringVelden');
  });

  it.each([
    ['een scherm dat het veld zelf zet', 'app/x.tsx', 'reminder_time: null', ['app/x.tsx']],
    ['spaties voor de dubbele punt', 'app/x.tsx', 'reminder_time : tijd', ['app/x.tsx']],
    ['een doorgeefluik', 'src/modules/auth/profile.ts', 'reminder_time: v', []],
    ['de schrijver zelf', SCHRIJVER, 'reminder_time: null', []],
    ['een bestand dat het alleen leest', 'app/y.tsx', 'p.reminder_time', []],
    ['de gegenereerde types', 'src/lib/database.types.ts', 'reminder_time: string | null', []],
  ])('ijking: %s', (_naam, pad, inhoud, verwacht) => {
    // ⚠️ Beide richtingen. Een controle die alles meldt, leert je hem te
    //    negeren — dus de drie gevallen die met rust gelaten moeten worden
    //    staan er even hard in als de twee die gevonden moeten worden.
    expect(schrijvers([{ pad, inhoud }])).toEqual(verwacht);
  });
});
