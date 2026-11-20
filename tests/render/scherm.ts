/**
 * Een scherm renderen in een test — QS8-739.
 *
 * Gebruik: `import { renderScherm } from './scherm'` bovenaan een testbestand met
 * `// @vitest-environment jsdom`, en importeer het scherm zelf **ná** dit bestand
 * (statisch of dynamisch, dat maakt niet uit; de volgorde wel). De mocks hieronder
 * worden geregistreerd op het moment dat dit bestand geladen wordt; een scherm dat
 * al geïmporteerd is, heeft ze niet meer en faalt luid op
 * `SyntaxError: Unexpected token 'typeof'`. Een import-sorteerregel die dit bestand
 * achter het scherm zet, breekt dat dus, ook luid.
 *
 * Wat dit installeert en waarom — gemeten in QS8-738
 * (`docs/decisions/2026-11-19-geen-renderer-was-een-uitspraak-over-een-opstelling.md`):
 *
 *   - `react-native` wordt `react-native-web`. Zonder die ene regel faalt elke
 *     import op de Flow-syntaxis van `react-native/index.js`. Een alias in de
 *     gedeelde vitest-config is niet nodig en is met opzet niet gedaan: dan zou elke
 *     bestaande test die `react-native` raakt, het stil anders gaan doen.
 *   - `expo-router`, `expo-router/react-navigation`, `react-native-safe-area-context`
 *     en `@expo/vector-icons/MaterialCommunityIcons` laden niet in node (Flow of een
 *     native module) en zijn hier vervangen door het kleinste dat een scherm nodig
 *     heeft.
 *   - `react-native-svg` laadt om dezelfde reden niet en is een mock met lege
 *     componenten voor `Svg`, `Circle`, `Path`, `Polyline`, `Defs`, `LinearGradient`
 *     en `Stop` (de huisstijl, `Pictogram` en `Afvinkcirkel`). Een nieuw svg-element
 *     in `src/shared/ui` faalt luid tot het hier bij komt. De lijst van vijf
 *     schermen hieronder is gemeten vóór deze mock en niet opnieuw bekeken.
 *
 * ⚠️ Wat dit niet kan, en dat is gezien en geen aanname. Vijf schermbestanden laden
 *    onder deze mocks niet, dus ze zijn hiermee niet te renderen:
 *    `app/(tabs)/index.tsx`, `app/(tabs)/profiel.tsx`, `app/_layout.tsx`,
 *    `app/groep/chat/[id].tsx` en `app/onboarding/profiel.tsx`. Ze falen eerst op
 *    `__DEV__ is not defined`, en na het zetten daarvan op `Cannot find module
 *    './ImportMetaRegistry'` (expo-runtime) of `Cannot read properties of undefined
 *    (reading 'EventEmitter')`. Niet verder uitgezocht.
 *
 * ⚠️ `react-native-web` onder jsdom is geen apparaat. Het zegt niets over native
 *    gedrag, layout, gestures of of `Platform.OS` het goede pad kiest. Een test hier
 *    bewijst wat een gebruiker op het web te zien krijgt, niet wat hij op een
 *    telefoon doet.
 *
 * ⚠️ De mocks van de modules van dit project (`@/modules/auth`, `@/modules/buddies`)
 *    staan hier niet: wat een scherm uit zijn modules krijgt, is wat een test
 *    wil variëren. Houd daar de echte beslislogica in en vervang alleen de
 *    netwerkgrens, anders toets je de mock.
 */
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';

// ⚠️ Een variabele als specifier, want `react-native-web` levert geen typen mee en een
//    `@types/`-pakket erbij is een dependency voor één regel. Vite laadt hem gewoon.
const RN_WEB = 'react-native-web';
vi.mock('react-native', async () => await import(/* @vite-ignore */ RN_WEB));

/** Wat `useRouter()` teruggeeft. Elke test leest hier uit wat het scherm deed. */
export const router = {
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};

/** Wat `useLocalSearchParams()` teruggeeft. Zet het in `beforeEach`. */
export const routeParams: Record<string, string> = {};

vi.mock('expo-router', () => ({
  useRouter: () => router,
  useLocalSearchParams: () => routeParams,
  usePathname: () => '/',
  useSegments: () => [],
  useFocusEffect: () => {},
  Link: ({ children }: { children?: unknown }) => children ?? null,
  Redirect: () => null,
  Stack: () => null,
  Tabs: () => null,
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: () => {} }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children?: unknown }) => children ?? null,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({ default: () => null }));
// `react-native-svg` laadt onder jsdom niet: het pakket is een Flow-module en de
// loader weigert `import typeof` (`SyntaxError: Unexpected token 'typeof'`). Sinds de
// nieuwe huisstijl importeert `src/shared/ui` (Pictogram, Afvinkcirkel) het, dus elk
// scherm dat die componenten haalt faalt zonder deze mock. Lege componenten volstaan:
// een schermtest toetst gedrag en tekst, geen tekeningen.
vi.mock('react-native-svg', () => {
  const leeg = () => null;
  return { default: leeg, Circle: leeg, Path: leeg, Polyline: leeg, Defs: leeg, LinearGradient: leeg, Stop: leeg };
});

export interface GerenderdScherm {
  /** Alle tekst die op het scherm staat, aan elkaar. */
  readonly tekst: () => string;
  /** De tekst van elke knop (`role="button"`), in schermvolgorde. */
  readonly knoppen: () => readonly string[];
  /**
   * Drukt op de eerste knop met precies deze tekst.
   *
   * ⚠️ Gooit als die er niet is **of uitgeschakeld is**. Een tik op een grijze knop
   *    doet niets, en een test die dat toch doet, bewaakt de grijze knop en niet wat
   *    er achter zit: QS8-739 liet zo een slot onbewaakt. Wil je weten dat een knop
   *    uitgeschakeld is, vraag dat met `isUitgeschakeld()`.
   */
  readonly klik: (tekst: string) => Promise<void>;
  /** Is de eerste knop met precies deze tekst uitgeschakeld (of bezig)? */
  readonly isUitgeschakeld: (tekst: string) => boolean;
  /** Rendert hetzelfde scherm opnieuw, na een wijziging van wat de mocks teruggeven. */
  readonly herrender: () => Promise<void>;
  /** Wacht tot lopende beloftes en effecten klaar zijn. */
  readonly wacht: () => Promise<void>;
}

const gerenderd: Root[] = [];

/**
 * ⚠️ Zet `IS_REACT_ACT_ENVIRONMENT`; `ruimAllesOp()` haalt hem weer weg. Roep dat aan
 *    in een `afterEach`.
 */
export async function renderScherm(scherm: ComponentType): Promise<GerenderdScherm> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const houder = document.createElement('div');
  document.body.appendChild(houder);
  const root = createRoot(houder);
  gerenderd.push(root);

  await act(async () => root.render(createElement(scherm)));
  await act(async () => {});

  const uit = (e: HTMLElement) =>
    e.getAttribute('aria-disabled') === 'true' || (e as HTMLButtonElement).disabled === true;
  const knopEls = () => [...houder.querySelectorAll<HTMLElement>('[role="button"]')];

  return {
    tekst: () => houder.textContent ?? '',
    knoppen: () => knopEls().map((e) => e.textContent ?? ''),
    klik: async (tekst) => {
      const knop = knopEls().find((e) => e.textContent === tekst);
      if (!knop) {
        throw new Error(
          `Geen knop met de tekst "${tekst}". Wel aanwezig: ${JSON.stringify(
            knopEls().map((e) => e.textContent),
          )}`,
        );
      }
      if (uit(knop)) {
        throw new Error(
          `De knop "${tekst}" is uitgeschakeld: een tik doet niets. Toets dat met isUitgeschakeld().`,
        );
      }
      await act(async () => knop.click());
    },
    isUitgeschakeld: (tekst) => {
      const knop = knopEls().find((e) => e.textContent === tekst);
      if (!knop) throw new Error(`Geen knop met de tekst "${tekst}".`);
      return uit(knop);
    },
    herrender: async () => {
      await act(async () => root.render(createElement(scherm)));
      await act(async () => {});
    },
    wacht: async () => {
      await act(async () => {});
    },
  };
}

/**
 * Voor een `afterEach`: ruimt elk scherm van de test op en zet alles terug wat de helper
 * bezit, zodat toestand niet naar de volgende test lekt.
 */
export function ruimAllesOp(): void {
  for (const root of gerenderd.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  router.replace.mockReset();
  router.push.mockReset();
  router.back.mockReset();
  for (const sleutel of Object.keys(routeParams)) delete routeParams[sleutel];
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
}
