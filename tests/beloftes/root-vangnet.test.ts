import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { reportError } from '../../src/lib/observability';
import { beginStand, naFout, naHerstel, naPadwissel } from '../../src/shared/ui/vangnet';

// ⚠️ Een stub en geen echte `react-native`: vitest kan de Flow-bron niet laden
//    (zelfde aanpak als `src/modules/auth/servermelding.test.ts`). De klasse
//    gebruikt alleen deze vier dingen.
vi.mock('react-native', () => ({
  Appearance: { getColorScheme: () => 'dark' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T>(stijlen: T): T => stijlen },
}));
vi.mock('../../src/lib/observability', () => ({ reportError: vi.fn() }));

// ⚠️ Opvangend geladen. Importeert `RootVangnet.tsx` iets wat hier niet te laden is
//    (een echte `Screen`, een barrel), dan hoort de rode toets 'de foutstaat
//    importeert niets wat zelf kan breken' te zijn en niet een suite die bij het
//    verzamelen omvalt — dan is de bedoelde grendel niet degene die rood wordt.
let geladen: typeof import('../../src/shared/ui/RootVangnet') | undefined;
let laadfout: unknown;
try {
  geladen = await import('../../src/shared/ui/RootVangnet');
} catch (fout) {
  laadfout = fout;
}

function klasse(): NonNullable<typeof geladen>['RootVangnet'] {
  if (geladen === undefined) throw new Error(`RootVangnet.tsx laadt niet: ${String(laadfout)}`);
  return geladen.RootVangnet;
}

/**
 * Er is een vangnet boven de hele app, en het kan zelf niet breken — QS8-710.
 *
 * ⚠️ **De belofte is "een fout in `Screen`, `Taakbalk` of het thema laat geen wit
 *    scherm achter".** Dat is een eigenschap van het geheel: de vanger moet boven
 *    alles staan, mag niets van dat alles gebruiken, de klasse moet echt vangen,
 *    en na een padwissel moet de foutstaat weggaan. Elk daarvan heeft hier een
 *    eigen toets. De eerste versie toetste alleen de pure functies en teksten in
 *    de bron; de code-critic liet zien dat een typfout in `getDerivedStateFromError`
 *    alles groen liet terwijl het vangnet niets meer ving. Daarom worden de
 *    levenscyclus-methoden hier zelf aangeroepen, zonder renderer.
 *
 * ⚠️ **Wat dit niet bewijst, staat erbij.** Dat React de klasse echt zo aanroept
 *    is gemeten met Playwright op een lokale webexport (19-11-2026, een
 *    opzettelijke fout in `Taakbalk`) en niet in CI.
 *
 * IJKING — met de hand, 19-11-2026, één mutatie per grendel, vooraf en achteraf
 * 12 groen:
 *
 *   A  `getDerivedStateFromError` hernoemen
 *      -> rood: 'de klasse zet een gegooide fout om in een gevangen stand'
 *   B  de keuze in `render()` omkeren
 *      -> rood: 'zonder fout tekent hij de kinderen, met een fout de foutstaat'
 *   C  `getDerivedStateFromProps` altijd `null`
 *      -> rood: 'een ander pad haalt de foutstaat weg'
 *   D  een meerregelige `import { Screen } from './Screen'`
 *      -> rood: 'de foutstaat importeert niets wat zelf kan breken'
 *   E  een import uit `./index`
 *      -> rood: 'de foutstaat importeert niets wat zelf kan breken'
 *   F  `reportError` uit `componentDidCatch`
 *      -> rood: 'een gevangen fout wordt gemeld'
 *   G  `PadVangnet` binnen `<ThemeProvider>` in `_layout.tsx`
 *      -> rood: 'het vangnet staat boven alle providers'
 *   H  `naPadwissel` reset nooit (en: altijd)
 *      -> rood: 'een ander pad haalt de foutstaat weg' (en: 'hetzelfde pad houdt …')
 */

const WORTEL = join(__dirname, '..', '..');
const bron = (...pad: string[]): string =>
  zonderCommentaar(readFileSync(join(WORTEL, ...pad), 'utf8'));

describe('de beslissingen van het vangnet', () => {
  it('een fout wordt een gevangen stand, ook als er undefined gegooid werd', () => {
    expect(naFout(new Error('boem'))).toMatchObject({ gevangen: true });
    expect(naFout(undefined)).toEqual({ gevangen: true, fout: undefined });
  });

  it('hetzelfde pad houdt de foutstaat vast', () => {
    // Anders verdwijnt hij bij elke render van de ouder en gooit het kind meteen
    // weer: een lus in plaats van een foutstaat.
    const stand = { ...beginStand('/groep'), ...naFout(new Error('boem')) };
    expect(naPadwissel(stand, '/groep')).toBe(stand);
  });

  it('een ander pad haalt de foutstaat weg', () => {
    const stand = { ...beginStand('/groep'), ...naFout(new Error('boem')) };
    const na = naPadwissel(stand, '/doelen');
    expect(na.gevangen).toBe(false);
    expect(na.sleutel).toBe('/doelen');
  });

  it('opnieuw proberen haalt de foutstaat weg en houdt het pad', () => {
    const stand = { ...beginStand('/groep'), ...naFout(new Error('boem')) };
    expect(naHerstel(stand)).toEqual(beginStand('/groep'));
  });
});

describe('de klasse zelf', () => {
  const maak = (sleutel = '/groep') => new (klasse())({ children: 'kind', resetSleutel: sleutel });

  it('de klasse zet een gegooide fout om in een gevangen stand', () => {
    const fout = new Error('boem');
    expect(klasse().getDerivedStateFromError(fout)).toEqual({ gevangen: true, fout });
  });

  it('hetzelfde pad laat de stand met rust, een ander pad haalt de foutstaat weg', () => {
    const gevangen = { ...beginStand('/groep'), ...naFout(new Error('boem')) };
    const props = (resetSleutel: string) => ({ children: 'kind', resetSleutel });

    expect(klasse().getDerivedStateFromProps(props('/groep'), gevangen)).toBeNull();
    expect(klasse().getDerivedStateFromProps(props('/doelen'), gevangen)).toEqual(
      beginStand('/doelen'),
    );
  });

  it('zonder fout tekent hij de kinderen, met een fout de foutstaat', () => {
    const vanger = maak();
    expect(vanger.render()).toBe('kind');

    vanger.state = { ...vanger.state, ...naFout(new Error('boem')) };
    const uit = vanger.render() as { type: { name: string }; props: { onHerstel: () => void } };
    expect(uit.type.name).toBe('RootFoutstaat');
  });

  it('een gevangen fout wordt gemeld, met de bron "root.render"', () => {
    const fout = new Error('boem');
    maak().componentDidCatch(fout, { componentStack: '\n  in Taakbalk' });
    expect(reportError).toHaveBeenCalledWith(fout, 'root.render', {
      componentStack: '\n  in Taakbalk',
    });
  });

  it('de knop haalt de foutstaat weg', () => {
    const vanger = maak();
    vanger.state = { ...vanger.state, ...naFout(new Error('boem')) };
    // `setState` is hier de basisversie van React zonder renderer; een stub die
    // doet wat React doet is genoeg om de verbinding met `naHerstel` te toetsen.
    vanger.setState = ((bijwerken: unknown) => {
      const volgende = typeof bijwerken === 'function' ? bijwerken(vanger.state) : bijwerken;
      vanger.state = { ...vanger.state, ...volgende };
    }) as typeof vanger.setState;

    const uit = vanger.render() as { props: { onHerstel: () => void } };
    uit.props.onHerstel();

    expect(vanger.state.gevangen).toBe(false);
    expect(vanger.render()).toBe('kind');
  });
});

describe('de aansluiting', () => {
  const root = bron('app', '_layout.tsx');
  const klassebron = bron('src', 'shared', 'ui', 'RootVangnet.tsx');

  it('het vangnet staat boven alle providers', () => {
    const vangnet = root.indexOf('<PadVangnet>');
    expect(vangnet).toBeGreaterThan(-1);
    for (const provider of ['<SafeAreaProvider', '<ThemeProvider', '<SessionProvider', '<ProfielProvider']) {
      expect(vangnet, `${provider} hoort binnen het vangnet te staan`).toBeLessThan(root.indexOf(provider));
    }
  });

  it('het pad is de resetsleutel, en staat niet in RootLayout zelf', () => {
    // `usePathname()` in `RootLayout` laat elke navigatie de hele boom opnieuw
    // renderen; in de wrapper blijft `children` hetzelfde element.
    const wrapper = root.slice(root.indexOf('function PadVangnet'));
    expect(wrapper).toMatch(/usePathname\(\)/);
    expect(wrapper).toMatch(/<RootVangnet resetSleutel=\{\w+\}>/);
    const rootLayout = root.slice(root.indexOf('export default function RootLayout'), root.indexOf('function PadVangnet'));
    expect(rootLayout).not.toContain('usePathname');
  });

  it('de foutstaat importeert niets wat zelf kan breken', () => {
    // Op alle `from '…'`-specifiers van het hele bestand, dus ook een import die
    // over meer regels loopt of uit een barrel komt. `../theme/tokens` en
    // `../theme/themes` zijn de pure bestanden; de barrel `../theme` laadt
    // `ThemeProvider` mee en is dus verboden.
    const specifiers = [...klassebron.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(specifiers.length).toBeGreaterThan(3);

    const verboden = [
      '.', './index', './Screen', './Taakbalk', './Text', './Button', './TabFout',
      '../theme', '../theme/index', '../theme/ThemeProvider',
      '@/shared/ui', '@/shared/theme', 'react-native-safe-area-context',
    ];
    for (const specifier of specifiers) {
      expect(verboden, `RootVangnet.tsx mag ${String(specifier)} niet importeren`).not.toContain(specifier);
      expect(String(specifier), 'geen modules/ uit de domeinlaag').not.toMatch(/modules\//);
    }

    for (const hook of ['useTheme(', 'useSafeAreaInsets(', 'useSession(', 'useProfiel(']) {
      expect(klassebron, `RootVangnet.tsx mag ${hook} niet aanroepen`).not.toContain(hook);
    }
  });
});
