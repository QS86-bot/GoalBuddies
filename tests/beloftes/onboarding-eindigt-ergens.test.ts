import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bestemmingVoor, type Routestand } from '../../src/modules/auth/routewacht';

const WORTEL = join(__dirname, '..', '..');

/**
 * Waar de onboarding je heen stuurt — QS8-266.
 *
 * ⚠️ **De belofte is niet "de routewacht klopt" en ook niet "het scherm
 *    navigeert".** Die twee waren allebei waar, elk apart getoetst, en het
 *    resultaat was dat de vragenlijst nooit te zien is geweest. De belofte is de
 *    naad ertussen: *elk scherm waar de onboarding je heen stuurt, bestaat en
 *    wordt door de routewacht met rust gelaten in de stand die er op dat moment
 *    is.*
 *
 * ⚠️ **Regel 18, vraag 1 in zijn zuiverste vorm.** `bestemmingVoor()` had een
 *    eigen suite met acht gevallen, `bewaar()` deed precies wat er stond, en de
 *    knoop ertussen werd door niets bewaakt: `router.replace()` geeft een pad, de
 *    wacht leest segmenten, en niemand legde die twee naast elkaar.
 *
 * ⚠️ **Daarom leest deze test de paden uit de schermen in plaats van ze op te
 *    schrijven.** Een test met `'/onboarding/vragenlijst'` erin getypt blijft
 *    groen als een scherm morgen ergens anders heen stuurt — dan toetst hij de
 *    lijst in de wacht tegen zichzelf. Vraag 3: hij moet rood worden van een
 *    wijziging aan wélke kant dan ook.
 */

/**
 * Elk onboardingscherm met de stand waarin het navigeert.
 *
 * ⚠️ **Het gaat om `isOnboarded` op het moment van navigeren en niet om het
 *    scherm.** `profiel.tsx` staat op `true` terwijl het scherm zelf vóór het
 *    afronden bezocht wordt: zijn `router.replace()` komt ná
 *    `rondOnboardingAf()`, en dat is precies de stand waarin de wacht hem
 *    wegstuurde.
 *
 * ⚠️ **Alleen `router.replace()`, en niet de terugknop.** Terug leidt per
 *    definitie naar een scherm uit een eerdere stand; die naast de huidige stand
 *    leggen is een andere vraag met een ander antwoord.
 */
const ONBOARDINGSCHERMEN: Readonly<Record<string, { readonly isOnboarded: boolean; readonly reden: string }>> = {
  'app/onboarding/uitleg.tsx': {
    isOnboarded: false,
    reden: 'Het eerste scherm van de onboarding; hier staat `onboarded_at` nog niet.',
  },
  'app/onboarding/profiel.tsx': {
    isOnboarded: true,
    reden:
      'De navigatie hier komt ná `rondOnboardingAf()`. ⚠️ Dat is de regel die ' +
      'QS8-266 opleverde: de wacht kende alleen het eerste segment, zag ' +
      '`onboarding`, en stuurde de gebruiker op hetzelfde moment naar `/`.',
  },
  'app/onboarding/vragenlijst.tsx': {
    isOnboarded: true,
    reden:
      'Acceptatiecriterium 2: wie de vragenlijst wegklikt of afmaakt, komt in ' +
      'een werkende app en niet opnieuw in de onboarding.',
  },
};

/** De stand op het moment van navigeren: sessie, profiel geladen, geen fout. */
function bijAankomst(pad: string, isOnboarded: boolean): Routestand {
  const segmenten = pad.split('/').filter((s) => s !== '');

  return {
    heeftSessie: true,
    sessieLaadt: false,
    profielLaadt: false,
    profielFout: null,
    isOnboarded,
    wortel: segmenten[0] ?? '',
    tak: segmenten[1] ?? '',
  };
}

/**
 * Elk letterlijk pad dat aan `router.replace()` wordt meegegeven.
 *
 * ⚠️ Zou iemand hier een variabele neerzetten, dan vindt deze functie er nul en
 *    valt de ondergrens hieronder daarop om — dat is de bedoeling: een naad die
 *    niet meer te lezen is, is een naad die niet meer bewaakt wordt.
 */
export function navigeertNaar(bron: string): readonly string[] {
  return [...bron.matchAll(/router\.replace\(\s*'([^']+)'\s*\)/g)].map((m) => m[1] ?? '');
}

/**
 * Alle routes die `app/` daadwerkelijk aanbiedt.
 *
 * ⚠️ **Groepsmappen tellen niet mee in de URL.** `app/(tabs)/doelen.tsx` is
 *    `/doelen`, en een controle die de map wél meetelt, meldt een bestaand scherm
 *    als ontbrekend — precies het soort valse melding waardoor je een controle
 *    leert negeren.
 */
export function routesIn(map: string, onder = ''): readonly string[] {
  const uit: string[] = [];

  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);

    if (statSync(pad).isDirectory()) {
      const segment = naam.startsWith('(') && naam.endsWith(')') ? onder : `${onder}/${naam}`;
      uit.push(...routesIn(pad, segment));
      continue;
    }

    if (!naam.endsWith('.tsx') || naam.startsWith('_') || naam.startsWith('+')) continue;

    const kaal = naam.slice(0, -'.tsx'.length);
    uit.push(kaal === 'index' ? onder || '/' : `${onder}/${kaal}`);
  }

  return uit;
}

const ROUTES = routesIn(join(WORTEL, 'app'));

/** `/doel/coach/[id]` matcht `/doel/coach/abc`. */
function bestaatAlsRoute(pad: string): boolean {
  const gevraagd = pad.split('/').filter((s) => s !== '');

  return ROUTES.some((route) => {
    const echte = route.split('/').filter((s) => s !== '');
    if (echte.length !== gevraagd.length) return false;
    return echte.every((s, i) => (s.startsWith('[') ? true : s === gevraagd[i]));
  });
}

describe('elke navigatie in de onboarding komt ergens aan', () => {
  it('vindt de routes van de app, anders toetst de rest niets', () => {
    expect(ROUTES).toContain('/doelen');
    expect(ROUTES).toContain('/onboarding/vragenlijst');
  });

  for (const [scherm, { isOnboarded, reden }] of Object.entries(ONBOARDINGSCHERMEN)) {
    const bestemmingen = navigeertNaar(readFileSync(join(WORTEL, scherm), 'utf8'));

    it(`${scherm} navigeert ergens heen`, () => {
      expect(bestemmingen.length, reden).toBeGreaterThan(0);
    });

    it.each(bestemmingen)(`${scherm} stuurt naar %s, en dat scherm bestaat`, (pad) => {
      expect(bestaatAlsRoute(pad), `${scherm} stuurt naar ${pad} en daar staat geen scherm.`).toBe(
        true,
      );
    });

    it.each(bestemmingen)(`${scherm} stuurt naar %s, en dat blijft staan`, (pad) => {
      expect(
        bestemmingVoor(bijAankomst(pad, isOnboarded)),
        `${scherm} stuurt naar ${pad}, maar de routewacht stuurt daar meteen weer ` +
          `vandaan. De gebruiker ziet dat scherm dus nooit. ${reden}`,
      ).toBeNull();
    });
  }
});

/**
 * ⚠️ **De tweede helft: dat de lezers vinden wat ze moeten vinden en niets
 *    anders.** Een controle die alles meldt, leer je negeren; een controle die
 *    niets vindt, laat de ondergrens hierboven omvallen zonder dat iemand weet
 *    waarom. Zelfde vorm als `tests/scripts/tekst-controle.test.ts`.
 */
describe('de twee lezers lezen wat er staat', () => {
  it('navigeertNaar vindt elk letterlijk pad', () => {
    expect(navigeertNaar("router.replace('/a'); router.replace( '/b/c' );")).toEqual(['/a', '/b/c']);
  });

  it('navigeertNaar laat een pad in een variabele met rust in plaats van te gokken', () => {
    expect(navigeertNaar('router.replace(pad);')).toEqual([]);
  });

  it('navigeertNaar verwart push niet met replace', () => {
    expect(navigeertNaar("router.push('/a');")).toEqual([]);
  });

  it('routesIn laat een groepsmap uit de URL en houdt de rest', () => {
    expect(ROUTES).toContain('/doelen');
    expect(ROUTES).not.toContain('/(tabs)/doelen');
    expect(ROUTES).toContain('/');
  });

  it('routesIn slaat layouts en +html over', () => {
    expect(ROUTES.some((r) => r.includes('_layout') || r.includes('+html'))).toBe(false);
  });

  /**
   * ⚠️ `/doel/coach` staat er met opzet níét als tegenvoorbeeld: dat pad matcht
   *    `app/doel/[id].tsx` en is dus een echte route, ook al is het niet het
   *    coachscherm. Een tegenvoorbeeld moet ook echt niet bestaan, anders toetst
   *    hij de matcher tegen mijn aanname over de routetabel.
   */
  it('bestaatAlsRoute vult een dynamisch segment in en verzint er geen bij', () => {
    expect(bestaatAlsRoute('/doel/coach/abc')).toBe(true);
    expect(bestaatAlsRoute('/doel/coach/abc/nog-een')).toBe(false);
    expect(bestaatAlsRoute('/bestaat-niet')).toBe(false);
  });
});
