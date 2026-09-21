/**
 * Welke schermen de taakbalk dragen, en welk tabblad er oplicht — QS8-437.
 *
 * ⚠️ **Waarom dit een pure module is en niet een stuk van het component.** Er is
 *    geen renderer in dit project en geen enkele test in `app/`. Zou de keuze
 *    "krijgt dit scherm een balk" in JSX zitten, dan is ze structureel
 *    onbewaakt — precies de reden dat `bestemmingVoor()` in
 *    `modules/auth/routewacht.ts` ook een losse functie is. Hier staat wát er
 *    beslist wordt; `Taakbalk.tsx` tekent alleen.
 *
 * ⚠️ **De uitzonderingen zijn een register met een reden per rij en geen prop.**
 *    Een `taakbalk={false}` op zes schermen is zes kansen om het bij het zevende
 *    te vergeten, en dan is de uitkomst een balk op een scherm waar hij schade
 *    doet in plaats van een balk die ontbreekt. Een register is bovendien in één
 *    blik te lezen naast de reden — en `tests/beloftes/taakbalk-overal.test.ts`
 *    legt hem naast de échte routes in `app/`, zodat een nieuw scherm dat hier
 *    niet in staat een bewuste keuze is en geen omissie.
 */

import type { Sleutel } from '../i18n';

/** Een tabblad op de balk: waar hij heen gaat en onder welke sleutel hij heet. */
export interface Tabblad {
  readonly pad: string;
  /**
   * ⚠️ `Sleutel` en niet `string`: een tabblad met een sleutel die niet in de
   *    catalogus staat, hoort een typefout te zijn en geen lege knop.
   */
  readonly sleutel: Sleutel;
}

/**
 * De vijf kernschermen, in de volgorde van de balk.
 *
 * ⚠️ Dezelfde volgorde en dezelfde sleutels als de navigator in
 *    `app/(tabs)/_layout.tsx` — en dat is sinds QS8-437 geen afspraak meer maar
 *    één lijst: die navigator tekent zijn eigen balk niet meer. Waarom dat de
 *    kern van dit besluit is, staat in
 *    `docs/decisions/2026-09-12-een-balk-hoort-bij-het-scherm-en-niet-bij-de-navigator.md`.
 */
export const TABBLADEN: readonly Tabblad[] = [
  { pad: '/', sleutel: 'tab.vandaag' },
  { pad: '/doelen', sleutel: 'tab.doelen' },
  { pad: '/groep', sleutel: 'tab.groep' },
  { pad: '/lijst', sleutel: 'tab.lijst' },
  { pad: '/profiel', sleutel: 'tab.profiel' },
];

/** Een scherm dat de balk met reden niet krijgt. */
interface Uitzondering {
  /** Het pad zelf, of een prefix met een `/` erachter. */
  readonly pad: string;
  readonly reden: string;
}

/**
 * De schermen zónder balk — acceptatiecriterium 3 van QS8-437.
 *
 * ⚠️ **Elke rij is een besluit.** Wie hier iets aan toevoegt, zegt dat dat scherm
 *    geen uitstap naar de rest van de app hoort te hebben; wie er iets uit haalt,
 *    zegt dat het dat wél mag. Geen van beide is een vormkwestie.
 */
export const ZONDER_TAAKBALK: readonly Uitzondering[] = [
  {
    pad: '/aanmelden',
    reden:
      'Er is nog geen sessie. Een balk wijst hier naar vijf schermen die de ' +
      'routewacht meteen terugstuurt naar dit scherm; dat zijn vijf knoppen ' +
      'die niets doen.',
  },
  {
    pad: '/onboarding/',
    reden:
      'Een stap in een flow, en de routewacht stuurt je hier terug tot ' +
      '`onboarded_at` staat. Een uitstap tonen die er niet is, is een dode knop.',
  },
  {
    pad: '/uitnodiging/',
    reden:
      'Het eerste dat iemand van dit product ziet, en bereikbaar zónder sessie ' +
      '(zie `bestemmingVoor()`). Zelfde reden als /aanmelden, plus: dit scherm ' +
      'heeft precies één bedoelde volgende stap.',
  },
  {
    pad: '/groep/weekafsluiting/',
    reden:
      'Hier staat een vertrekwacht op onopgeslagen tekst (QS8-192). Vijf ' +
      'linkjes naar elders zijn vijf routes die langs `verlaat()` hadden moeten ' +
      'gaan en dat niet doen. `usePreventRemove` ziet een tik op een link in de ' +
      'balk namelijk niet als een vertrek dat hij mag tegenhouden.',
  },
];

/**
 * Het pad zonder query, fragment en afsluitende schuine streep.
 *
 * ⚠️ `/doelen?x=1` en `/doelen/` zijn hetzelfde scherm. Zonder deze normalisatie
 *    hangt het oplichten van een tabblad af van hoe je er toevallig gekomen bent.
 */
export function normaliseerPad(pad: string): string {
  const kaal = (pad.split('?')[0] ?? '').split('#')[0] ?? '';
  if (kaal === '' || kaal === '/') return '/';
  return kaal.endsWith('/') ? kaal.slice(0, -1) : kaal;
}

/** Of dit scherm de taakbalk draagt. */
export function toontTaakbalk(pad: string): boolean {
  const kaal = normaliseerPad(pad);

  return !ZONDER_TAAKBALK.some(({ pad: uit }) =>
    uit.endsWith('/') ? `${kaal}/`.startsWith(uit) : kaal === uit,
  );
}

/**
 * Welk tabblad oplicht op dit pad, of `null`.
 *
 * ⚠️ **`null` is een geldig antwoord en geen gat.** `/beoordelen` en `/overzicht`
 *    horen bij geen van de vijf: ze komen uit een melding en uit de
 *    groepsafsluiting. Er dan maar één aanwijzen is liegen over waar je bent, en
 *    dat is precies de tweede bron van waarheid die dit besluit wilde vermijden.
 *
 * ⚠️ De langste prefix wint, want `/groep` is een prefix van
 *    `/groep/weekafsluiting` — zou de eerste treffer winnen, dan hangt het
 *    antwoord af van de volgorde van `TABBLADEN` in plaats van van het pad.
 */
export function actiefTabblad(pad: string): string | null {
  const kaal = normaliseerPad(pad);
  if (kaal === '/') return '/';

  const treffers = TABBLADEN.filter(({ pad: tab }) => tab !== '/' && hoortBij(kaal, tab));
  const langste = treffers.sort((a, b) => b.pad.length - a.pad.length)[0];

  return langste?.pad ?? afgeleid(kaal);
}

/** Of `pad` het tabblad `tab` is of eronder hangt. */
function hoortBij(pad: string, tab: string): boolean {
  return pad === tab || pad.startsWith(`${tab}/`);
}

/**
 * De detailroutes die enkelvoud heten waar hun tabblad meervoud heet.
 *
 * ⚠️ Een kaart met twee rijen en geen patroon: `/doel/123` hoort bij *Doelen*,
 *    en dat is niet uit de padnaam af te leiden zonder te gokken. Wie hier iets
 *    aan toevoegt, zegt onder welk tabblad dat scherm valt — en dat is een
 *    ontwerpuitspraak, geen tekstbewerking.
 */
const ONDER: Readonly<Record<string, string>> = {
  '/doel': '/doelen',
};

function afgeleid(pad: string): string | null {
  const wortel = `/${pad.split('/')[1] ?? ''}`;
  return ONDER[wortel] ?? null;
}
