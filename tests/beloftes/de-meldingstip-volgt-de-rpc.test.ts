import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

/**
 * De stip op de tab Profiel en de kaart bovenaan Profiel — QS8-777.
 *
 * ⚠️ **De belofte is dat de stip dezelfde waarheid draagt als de kaart: wat de RPC zegt, en niets anders.** De stip
 *    (`Meldingwacht` in `app/_layout.tsx`, `Taakbalk`) en de kaart (`MeldingenIngang` in `app/(tabs)/profiel.tsx`)
 *    staan in verschillende bestanden en kennen elkaar alleen via `zetMeldingWacht()`. Elk onderdeel kan kloppen en
 *    de naad kan breken, dus deze test legt de drie plekken naast elkaar. `profiel.tsx` is niet te renderen
 *    (`tests/render/scherm.ts`), dus daar toetst hij de bron.
 *
 * IJKING — met de hand, 20-11-2026:
 *   A  `<Meldingwacht />` uit `Shell` halen -> rood: 'staat in de Shell'
 *   B  de `zetMeldingWacht(false)` aan het begin van het effect weg -> rood: 'gaat uit vóór elke nieuwe gebruiker'
 *   C  `platform_beheerder` in `_layout.tsx` zetten -> rood: 'kent de rol niet'
 *   D  `<MeldingenIngang />` onder de eerste `<Card>` zetten -> rood: 'bovenaan'
 *   E  in het foutpad van `Meldingwacht` `zetMeldingWacht(false)` zetten -> rood: 'een storing laat de stip staan'
 */
const bron = (pad: string) => zonderCommentaar(readFileSync(join(__dirname, '../..', pad), 'utf8'));
const layout = bron('app/_layout.tsx');
const profiel = bron('app/(tabs)/profiel.tsx');
const balk = bron('src/shared/ui/Taakbalk.tsx');
const stand = bron('src/shared/ui/meldingstip.ts');

const wacht = layout.slice(layout.indexOf('function Meldingwacht()'), layout.indexOf('function Pushwacht()'));

describe('Meldingstip: één waarheid voor stip en kaart', () => {
  it('Meldingwacht staat in de Shell en vraagt de RPC om één rij', () => {
    expect(layout).toMatch(/<Meldingwacht \/>/);
    expect(wacht).toMatch(/fetchOpenstaandeMeldingen\(\{ limiet: 1 \}\)/);
  });

  it('gaat uit vóór elke nieuwe gebruiker, zodat een volgend account de stip niet erft', () => {
    const effect = wacht.slice(wacht.indexOf('useEffect('));
    expect(effect.indexOf('zetMeldingWacht(false)')).toBeGreaterThan(-1);
    // Vóór de vroege terugkeer voor `null` én vóór de fetch: ook een directe wissel A -> B valt eronder.
    expect(effect.indexOf('zetMeldingWacht(false)')).toBeLessThan(effect.indexOf('userId === null'));
    expect(effect.indexOf('zetMeldingWacht(false)')).toBeLessThan(effect.indexOf('fetchOpenstaandeMeldingen'));
  });

  it('een storing laat de stip staan zoals hij was', () => {
    const foutpad = wacht.slice(wacht.indexOf('() => {', wacht.indexOf('actueel) zetMeldingWacht')));
    expect(foutpad).not.toMatch(/zetMeldingWacht/);
  });

  it('kent de rol niet: de RPC beslist wie een rij krijgt', () => {
    for (const [naam, tekst] of [['_layout', layout], ['Taakbalk', balk], ['meldingstip', stand]] as const) {
      expect(tekst, naam).not.toMatch(/platform_beheerder|beheerder\b/i);
    }
  });

  it('de kaart staat bovenaan Profiel en zet dezelfde stand', () => {
    const blokken = profiel.slice(profiel.indexOf('<View style={styles.blokken}>'));
    expect(blokken.indexOf('<MeldingenIngang />')).toBeGreaterThan(-1);
    expect(blokken.indexOf('<MeldingenIngang />')).toBeLessThan(blokken.indexOf('<Card>'));
    expect(profiel).toMatch(/zetMeldingWacht\(data\.length > 0\)/);
    expect(profiel.match(/<MeldingenIngang \/>/g)).toHaveLength(1);
  });

  it('alleen een geslaagde lading zet de stand om op Profiel', () => {
    expect(profiel).toMatch(/!loading && error === null && data !== undefined/);
  });
});
