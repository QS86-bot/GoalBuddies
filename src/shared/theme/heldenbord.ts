import { contrastRatio, WCAG } from './contrast';
import { HELDPALETSLEUTELS, type Heldkleuren, type Heldpalet, type Palette } from './tokens';

/**
 * Het bord — QS8-723 criterium 8, besluit van Quinten (19-11-2026, zesde ronde).
 *
 * ⚠️ **Is een held onleesbaar op een palet, dan krijgt hij een eigen neutraal vlak.** Het palet
 *    verandert niet en vervalt niet. Dit is de hook: hij beslist per held en per palet, en bouwt
 *    geen palet-combinaties uit. Vandaag haalt elke held `WCAG.AA_LARGE` op de achtergrond en het
 *    paneel van A en B, dus `heldVlak()` geeft overal `palet` (`heldenbord.test.ts` meet dat per
 *    palet). Zodra QS8-724 een palet toevoegt waar dat niet geldt, is het bord er al.
 *
 * ⚠️ **Het bord is een uitzondering voor heldenoppervlakken en niets anders.** Het is de
 *    QS8-470-uitzondering, niet een nieuwe: een knop of kaart die geen held draagt, kan hier geen
 *    vlak vandaan halen. `heldenbord.test.ts` legt vast dat geen bestand buiten `HELDENOPPERVLAKKEN`
 *    deze module noemt.
 *
 * ⚠️ **Het vlak is geen nieuwe kleur.** Het is de sleutel uit het palet zelf die de held het best
 *    leesbaar maakt; een bord met een eigen hexwaarde zou een kleur zijn die geen palet kent.
 */

/** De neutrale vlakken van een palet waaruit een bord kiest. */
const BORDVLAKKEN = ['bg', 'panel', 'panelDark', 'text'] as const satisfies readonly (keyof Palette)[];

export type HeldVlak =
  | { readonly soort: 'palet'; readonly kleuren: Heldkleuren }
  | { readonly soort: 'bord'; readonly kleuren: Heldkleuren; readonly vlak: string };

/** Alleen de grond waar een held normaal op staat: het scherm en de kaart. */
function leesbaarOpPalet(accent: string, palet: Palette): boolean {
  return [palet.bg, palet.panel].every((grond) => contrastRatio(accent, grond) >= WCAG.AA_LARGE);
}

/** Welk neutraal vlak van het palet laat dit accent het best zien? */
function besteVlak(accent: string, palet: Palette): string {
  return BORDVLAKKEN.map((s) => palet[s]).reduce((best, kandidaat) =>
    contrastRatio(accent, kandidaat) > contrastRatio(accent, best) ? kandidaat : best,
  );
}

export function heldVlak(helden: Heldpalet, sleutel: (typeof HELDPALETSLEUTELS)[number], palet: Palette): HeldVlak {
  const kleuren = helden[sleutel];
  if (leesbaarOpPalet(kleuren.accent, palet)) return { soort: 'palet', kleuren };
  return { soort: 'bord', kleuren, vlak: besteVlak(kleuren.accent, palet) };
}

/** Wie deze module mag noemen. Leeg tot een heldenoppervlak hem gebruikt; een rij heeft een reden nodig. */
export const HELDENOPPERVLAKKEN: Readonly<Record<string, string>> = {};

/**
 * Welke van deze bronbestanden noemen `heldenbord` zonder in het register te staan?
 * Geëxporteerd zodat de toets hem een kapotte invoer kan voeden (regel 18, vraag 3).
 */
export function onbevoegdeGebruikers(
  bronnen: Readonly<Record<string, string>>,
  register: Readonly<Record<string, string>> = HELDENOPPERVLAKKEN,
): string[] {
  return Object.entries(bronnen)
    .filter(([pad, tekst]) => /heldenbord|heldVlak/.test(tekst) && !(pad in register))
    .map(([pad]) => pad);
}
