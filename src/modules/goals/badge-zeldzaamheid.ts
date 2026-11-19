import type { Badge } from './badges';

/**
 * Zeldzaamheid en XP per badge — QS8-735, besluit van Quinten (19-11-2026, QS8-734).
 *
 * ⚠️ **Eén bron in de app, een kopie van één in de database.** `xp_bedrag_badge()`
 *    (migratie 0304) kent de bedragen; de database kent de klassen niet. Deze tabel
 *    is dus de enige plek waar klasse en bedrag naast elkaar staan, en
 *    `badge-zeldzaamheid.test.ts` leest de migratie en wordt rood zodra de twee
 *    bedragen uiteenlopen. Het scherm rekent nooit zelf een bedrag uit.
 *
 * ⚠️ Alleen voor jezelf, net als `badges.ts`: geef dit nooit aan een groepscomponent.
 */
export const ZELDZAAMHEDEN = ['gewoon', 'ongewoon', 'zeldzaam'] as const;
export type Zeldzaamheid = (typeof ZELDZAAMHEDEN)[number];

export interface BadgeWaarde {
  readonly zeldzaamheid: Zeldzaamheid;
  readonly xp: number;
}

export const BADGE_WAARDE: Readonly<Record<Badge, BadgeWaarde>> = {
  first_goal: { zeldzaamheid: 'gewoon', xp: 10 },
  first_milestone: { zeldzaamheid: 'gewoon', xp: 10 },
  first_review: { zeldzaamheid: 'gewoon', xp: 10 },
  streak_4: { zeldzaamheid: 'ongewoon', xp: 25 },
  streak_12: { zeldzaamheid: 'zeldzaam', xp: 50 },
};
