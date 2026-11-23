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
  // ⚠️ **`app/onboarding/profiel.tsx` staat hier niet meer, en dat is QS8-793.**
  //    Het scherm navigeerde na `rondOnboardingAf()` zelf naar de vragenlijst, en
  //    deze test zag dat als in orde: de wacht laat de vragenlijst staan zodra je
  //    er bént. Wat hij niet zag is de render daarvóór, waarin de route nog op
  //    `profiel` stond en de wacht naar `/` stuurde — 📏 3 van 3 keer op de
  //    web-export. Nu navigeert de wacht zelf; zijn bestemming na het afronden
  //    staat in het blok hieronder, en de render-naad in
  //    `src/modules/auth/routewacht-afronden.test.ts`.
  // ⚠️ Sinds QS8-733 staat de navigatie in de hook en niet meer in het routebestand;
  //    het register leest het bestand waar `router.replace()` echt staat.
  'src/schermen/vragenlijst/useVragenlijst.ts': {
    isOnboarded: true,
    reden:
      'Acceptatiecriterium 2: wie de vragenlijst wegklikt of afmaakt, komt in ' +
      'een werkende app en niet opnieuw in de onboarding.',
  },
};

/**
 * De stand op het moment van navigeren: sessie, profiel geladen, geen fout.
 *
 * ⚠️ **De segmenten komen uit de routetabel en niet uit het pad.** In productie
 *    vult `app/_layout.tsx` `wortel` en `tak` met `useSegments()`, en dat zijn
 *    **bestands**segmenten: groepsmappen (`(tabs)`) tellen mee en een dynamisch
 *    segment heet letterlijk `[id]`. Ze met `pad.split('/')` namaken geeft
 *    vandaag hetzelfde antwoord voor alle onboardingroutes — en zou stil ophouden
 *    te kloppen zodra er een groepsmap onder `app/onboarding/` komt: `tak` wordt
 *    dan `'(x)'`, de allowlist matcht niet meer, de vragenlijst is opnieuw
 *    onbereikbaar, en deze test blijft groen omdat hij nog steeds de URL splitst.
 *    Gevonden in de security-review van QS8-266 (L1). Regel 18, vraag 3.
 */
function bijAankomst(pad: string, isOnboarded: boolean): Routestand {
  const segmenten = bestandssegmentenVoor(pad);

  return {
    heeftSessie: true,
    sessieLaadt: false,
    profielLaadt: false,
    profielFout: null,
    isOnboarded,
    wortel: segmenten[0] ?? '',
    tak: segmenten[1] ?? '',
    netAfgerond: false,
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
  const letterlijk = [...bron.matchAll(/router\.replace\(\s*'([^']+)'\s*\)/g)].map((m) => m[1] ?? '');
  return [...letterlijk, ...bestemmingUitParameterbestand(bron)];
}

/**
 * ⚠️ **Eén benoemde vorm naast het letterlijke pad (QS8-762):** `router.replace(
 * doelenNaVragenlijst())`. De vragenlijst stuurt met een parameter door, en een
 * href-object is geen letterlijk pad. Het pad wordt dan **uit het bestand gelezen
 * dat de functie definieert** en niet hier opgeschreven, dus verandert iemand de
 * `pathname` daar, dan valt deze toets om. Een andere functie in `router.replace()`
 * blijft onleesbaar en valt op de ondergrens.
 */
function bestemmingUitParameterbestand(bron: string): readonly string[] {
  if (!/router\.replace\(\s*doelenNaVragenlijst\(\)\s*\)/.test(bron)) return [];
  const definitie = readFileSync(join(WORTEL, 'src/schermen/belofte/verwijzingsparameter.ts'), 'utf8');
  const pad = /pathname:\s*'([^']+)'/.exec(definitie)?.[1];
  return pad === undefined ? [] : [pad];
}

/**
 * Alle routes die `app/` daadwerkelijk aanbiedt.
 *
 * ⚠️ **Groepsmappen tellen niet mee in de URL.** `app/(tabs)/doelen.tsx` is
 *    `/doelen`, en een controle die de map wél meetelt, meldt een bestaand scherm
 *    als ontbrekend — precies het soort valse melding waardoor je een controle
 *    leert negeren.
 */
export interface Route {
  /** Wat er in de adresbalk staat. */
  readonly url: string;
  /** Wat `useSegments()` teruggeeft: mét groepsmappen, met `[id]` als naam. */
  readonly segmenten: readonly string[];
}

export function routesIn(map: string, url = '', segmenten: readonly string[] = []): readonly Route[] {
  const uit: Route[] = [];

  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    const groep = naam.startsWith('(') && naam.endsWith(')');

    if (statSync(pad).isDirectory()) {
      uit.push(...routesIn(pad, groep ? url : `${url}/${naam}`, [...segmenten, naam]));
      continue;
    }

    if (!naam.endsWith('.tsx') || naam.startsWith('_') || naam.startsWith('+')) continue;

    const kaal = naam.slice(0, -'.tsx'.length);
    uit.push({
      url: kaal === 'index' ? url || '/' : `${url}/${kaal}`,
      segmenten: kaal === 'index' ? segmenten : [...segmenten, kaal],
    });
  }

  return uit;
}

const ROUTES = routesIn(join(WORTEL, 'app'));

/** `/doel/coach/[id]` matcht `/doel/coach/abc`. */
function matcht(route: Route, pad: string): boolean {
  const gevraagd = pad.split('/').filter((s) => s !== '');
  const echte = route.url.split('/').filter((s) => s !== '');

  if (echte.length !== gevraagd.length) return false;
  return echte.every((s, i) => (s.startsWith('[') ? true : s === gevraagd[i]));
}

function bestaatAlsRoute(pad: string): boolean {
  return ROUTES.some((route) => matcht(route, pad));
}

/**
 * De segmenten die `useSegments()` voor dit pad zou geven.
 *
 * ⚠️ Kent de app het pad niet, dan valt deze functie terug op de URL. Dat is de
 *    eerlijke uitkomst: `bestaatAlsRoute()` maakt dat geval al rood, en een
 *    stille lege lijst zou de wachttoets erná betekenisloos maken.
 */
function bestandssegmentenVoor(pad: string): readonly string[] {
  return ROUTES.find((route) => matcht(route, pad))?.segmenten ?? pad.split('/').filter((s) => s !== '');
}

describe('elke navigatie in de onboarding komt ergens aan', () => {
  it('vindt de routes van de app, anders toetst de rest niets', () => {
    const urls = ROUTES.map((r) => r.url);
    expect(urls).toContain('/doelen');
    expect(urls).toContain('/onboarding/vragenlijst');
  });

  /**
   * ⚠️ De bestemming van de wacht zelf na Klaar (QS8-793), gelezen uit
   *    `bestemmingVoor()` en niet opgeschreven: verandert hij, dan valt dit om.
   */
  describe('de routewacht na Klaar op het profiel', () => {
    const naKlaar = bestemmingVoor({
      ...bijAankomst('/onboarding/profiel', true),
      netAfgerond: true,
    });

    it('stuurt ergens heen dat niet Vandaag is', () => {
      expect(naKlaar).not.toBeNull();
      expect(naKlaar).not.toBe('/');
    });

    it('stuurt naar een scherm dat bestaat en blijft staan, met en zonder de vlag', () => {
      const pad = naKlaar ?? '';
      expect(bestaatAlsRoute(pad), `de wacht stuurt naar ${pad} en daar staat geen scherm.`).toBe(true);
      expect(bestemmingVoor({ ...bijAankomst(pad, true), netAfgerond: true })).toBeNull();
      expect(bestemmingVoor(bijAankomst(pad, true))).toBeNull();
    });
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

  it('routesIn laat een groepsmap uit de URL en houdt hem in de segmenten', () => {
    const doelen = ROUTES.find((r) => r.url === '/doelen');

    expect(doelen, 'app/(tabs)/doelen.tsx hoort /doelen te zijn').toBeDefined();
    // ⚠️ Dit is het verschil waar L1 over ging: de URL kent `(tabs)` niet en
    //    `useSegments()` wél. Vielen ze samen, dan bewaakte deze test niets.
    expect(doelen?.segmenten).toEqual(['(tabs)', 'doelen']);
    expect(ROUTES.map((r) => r.url)).toContain('/');
  });

  it('routesIn slaat layouts en +html over', () => {
    expect(ROUTES.some((r) => r.url.includes('_layout') || r.url.includes('+html'))).toBe(false);
  });

  it('bestandssegmentenVoor geeft wat useSegments() zou geven', () => {
    expect(bestandssegmentenVoor('/doelen')).toEqual(['(tabs)', 'doelen']);
    expect(bestandssegmentenVoor('/onboarding/vragenlijst')).toEqual(['onboarding', 'vragenlijst']);
    expect(bestandssegmentenVoor('/doel/coach/abc')).toEqual(['doel', 'coach', '[id]']);
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
