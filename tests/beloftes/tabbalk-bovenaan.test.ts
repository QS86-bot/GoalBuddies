import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { veiligeBovenrand } from '../../src/shared/ui/bovenrand';

/**
 * De tabbalk staat bovenaan en de veilige zone wordt één keer geteld — QS8-246.
 *
 * ⚠️ **De fout die hier bewaakt wordt, is er een die je niet ziet.** De balk
 *    neemt sinds deze wijziging `insets.top` zélf — gemeten in
 *    `expo-router/build/react-navigation/bottom-tabs/views/BottomTabBar.js`:
 *    `paddingTop: tabBarPosition === 'top' ? insets.top : 0`. Deed `Screen` dat
 *    ook, dan staat er op een toestel mét notch twee keer een inkeping aan
 *    ruimte, en op een simulator zónder notch precies niets. Dit project heeft
 *    geen toestel met een notch, dus dit is de enige plek waar dat verschil
 *    vastgelegd kan worden.
 *
 * ⚠️ **Er wordt in dit project niets gerenderd in een test** — geen
 *    testing-library, geen `.test.tsx`. Wat er dan overblijft is de rekensom
 *    apart toetsen en de aansluiting los bewaken. Dat is precies de splitsing
 *    die regel 18 vraagt: het ónderdeel (de rekensom) én de naad (staat de
 *    context er wel omheen).
 */

/**
 * Leest een bronbestand zonder commentaar.
 *
 * ⚠️ **Dit staat er omdat het in QS8-199 twee rondes kostte.** Een grendel die
 *    op de bron zoekt, matcht ook de zin waarin het commentaar uitlegt waaróm de
 *    code er zo staat — en dan is de test groen om de verkeerde reden. De
 *    comments hieronder noemen `insets.top` en `tabBarPosition` allebei letterlijk.
 */
function bronZonderCommentaar(pad: string): string {
  return readFileSync(pad, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('de veilige bovenrand wordt één keer geteld', () => {
  it('laat het scherm de rand vrijhouden als er niets boven staat', () => {
    // Een scherm op de stack — geen balk erboven, dus de notch is van hemzelf.
    expect(veiligeBovenrand(47, false)).toBe(47);
    expect(veiligeBovenrand(0, false)).toBe(0);
  });

  it('laat het scherm de rand overslaan als de balk hem al genomen heeft', () => {
    // ⚠️ De must-see. Zonder deze helft is "de rekensom klopt" niet te
    //    onderscheiden van "hij telt altijd mee", en dat is de dubbele marge.
    expect(veiligeBovenrand(47, true)).toBe(0);
    expect(veiligeBovenrand(0, true)).toBe(0);
  });
});

describe('de tabbalk staat bovenaan', () => {
  const layout = bronZonderCommentaar('app/(tabs)/_layout.tsx');

  it('zet de balk boven in plaats van onder', () => {
    expect(layout).toMatch(/tabBarPosition:\s*'top'/);
  });

  it('zet de scheidingslijn aan de kant waar de inhoud begint', () => {
    // Boven met een lijn aan de bovenkant is een streep tegen de statusbalk aan.
    expect(layout).toContain('borderBottomColor');
    expect(layout, 'de oude lijn hoort weg te zijn').not.toContain('borderTopColor');
  });

  it('zegt tegen de schermen eronder dat de bovenrand al verrekend is', () => {
    // ⚠️ **De naad.** De balk kan perfect bovenaan staan en `Screen` kan de
    //    context perfect lezen, en tóch telt de rand dubbel — namelijk als
    //    niemand hem zet. Dit is de variant zonder kapot onderdeel: elk
    //    schakeltje af, de keten nergens aangesloten.
    expect(layout).toContain('BovenrandAlVerrekend');
  });

  it('laat Screen de rand niet meer rechtstreeks optellen', () => {
    const scherm = bronZonderCommentaar('src/shared/ui/Screen.tsx');

    expect(
      scherm,
      'de rekensom hoort via `veiligeBovenrand()` te lopen, want alleen die is te toetsen',
    ).toContain('veiligeBovenrand(');
    expect(
      scherm,
      '`insets.top` rechtstreeks in de opvulling is de dubbele marge terug',
    ).not.toMatch(/paddingTop:\s*insets\.top/);
  });
});
