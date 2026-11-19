import type { Badge } from '@/modules/goals';

/**
 * De emoji op de prestatiekaart — QS8-732, een benoemde uitzondering op de emoji-regel (QS8-111).
 *
 * ⚠️ **Dit is het enige bestand in `src/` en `app/` waar de app zelf emoji in schrijft** (naast de
 *    reacties, A24). `npm run emoji:controle` kent dit bestand mét reden en met deze vijf tekens; een
 *    zesde teken hier of een emoji in een ander bestand maakt hem rood. De uitzondering geldt voor één
 *    bestand en nooit voor een map.
 * ⚠️ **Een vaste lijst, geen vrije invoer:** de gebruiker typt hier niets, dus geen `telTekens()`-vraag.
 * ⚠️ **Alleen positieve tekens** (domeinregel 7): medaille, ster, schild, vlam, trofee. Geen teken voor
 *    gemist, gebroken of achterstand, en geen prestatie die een gemiste week zou verraden.
 * ⚠️ **Alleen voor wat je behaald hebt.** Een vergrendelde prestatie toont het gedimde vectorpictogram en
 *    geen emoji; de vector blijft altijd staan, ook bij `emoji: aan`.
 */
export const BADGE_EMOJI: Readonly<Record<Badge, string>> = {
  first_goal: '🏅',
  first_milestone: '⭐',
  first_review: '🛡️',
  streak_4: '🔥',
  streak_12: '🏆',
};

/**
 * Welke emoji de kaart toont, of `null`. De ene plek waar "aan, en behaald" beslist wordt, zodat de
 * schakelaar uit het scherm Uiterlijk (`emoji`) niet in elk component opnieuw gelezen hoeft te worden.
 */
export function emojiVoorPrestatie(badge: Badge, behaald: boolean, emojiAan: boolean): string | null {
  return emojiAan && behaald ? BADGE_EMOJI[badge] : null;
}
