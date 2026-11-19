import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { beginStand, naFout, naHerstel, naPadwissel } from '../../src/shared/ui/vangnet';

/**
 * Er is een vangnet boven de hele app, en het kan zelf niet breken — QS8-710.
 *
 * ⚠️ **De belofte is "een fout in `Screen`, `Taakbalk` of het thema laat geen wit
 *    scherm achter".** Dat is een eigenschap van het geheel: de vanger moet boven
 *    alles staan, mag niets van dat alles gebruiken, en moet na een padwissel
 *    weggaan. Elk van de drie heeft hier een eigen toets; ontbreekt er één, dan
 *    is het vangnet er wel en helpt het niet.
 *
 * ⚠️ **Wat dit niet bewijst, staat erbij.** Er is geen renderer in dit project,
 *    dus dat React de klasse echt zo aanroept is gemeten met Playwright op een
 *    lokale webexport (19-11-2026, een opzettelijke fout in `Taakbalk`) en niet in
 *    CI. Deze toetsen bewaken de beslissingen en de aansluiting.
 *
 * IJKING — met de hand, 19-11-2026, één mutatie per grendel, vooraf en achteraf
 * 8 groen:
 *
 *   A  `naPadwissel` reset nooit
 *      -> rood: 'een ander pad haalt de foutstaat weg'
 *   B  `naPadwissel` reset altijd
 *      -> rood: 'hetzelfde pad houdt de foutstaat vast'
 *   C  `naFout` zet `gevangen` op false
 *      -> rood: 'een fout wordt een gevangen stand'
 *   D  `<RootVangnet>` in `_layout.tsx` binnen `<ThemeProvider>`
 *      -> rood: 'het vangnet staat boven alle providers'
 *   E  `import { Screen } from './Screen'` in `RootVangnet.tsx`
 *      -> rood: 'de foutstaat gebruikt niets wat zelf kan breken'
 *   F  `naPadwissel` uit `RootVangnet.tsx` halen
 *      -> rood: 'de klasse gebruikt de beslissingen uit vangnet.ts'
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

describe('de aansluiting', () => {
  const root = bron('app', '_layout.tsx');
  const klasse = bron('src', 'shared', 'ui', 'RootVangnet.tsx');

  it('het vangnet staat boven alle providers', () => {
    const vangnet = root.indexOf('<RootVangnet');
    expect(vangnet).toBeGreaterThan(-1);
    for (const provider of ['<SafeAreaProvider', '<ThemeProvider', '<SessionProvider', '<ProfielProvider']) {
      expect(vangnet, `${provider} hoort binnen het vangnet te staan`).toBeLessThan(root.indexOf(provider));
    }
  });

  it('het pad is de resetsleutel', () => {
    expect(root).toMatch(/const pad = usePathname\(\)/);
    expect(root).toMatch(/<RootVangnet resetSleutel=\{pad\}>/);
  });

  it('de klasse gebruikt de beslissingen uit vangnet.ts', () => {
    for (const functie of ['beginStand(', 'naFout(', 'naPadwissel(', 'naHerstel(']) {
      expect(klasse, `${functie} hoort in RootVangnet.tsx gebruikt te worden`).toContain(functie);
    }
  });

  it('de foutstaat gebruikt niets wat zelf kan breken', () => {
    // De vanger staat boven de providers: wat hij importeert mag geen provider,
    // `Screen` of `Taakbalk` zijn, en geen hook die er een nodig heeft.
    const imports = klasse
      .split('\n')
      .filter((regel) => regel.startsWith('import '))
      .join('\n');
    for (const verboden of ['./Screen', './Taakbalk', './Text', './Button', '../theme\'', 'safe-area-context', 'modules/']) {
      expect(imports, `RootVangnet.tsx mag ${verboden} niet importeren`).not.toContain(verboden);
    }
    for (const hook of ['useTheme(', 'useSafeAreaInsets(', 'useSession(', 'useProfiel(']) {
      expect(klasse, `RootVangnet.tsx mag ${hook} niet aanroepen`).not.toContain(hook);
    }
  });
});
