import { t } from '../../shared/i18n';

/**
 * Verdiende badges — QS8-78 (PRD 8.4), migratie 0109.
 *
 * ⚠️ **Zuiver, zonder Supabase-client, en dat is een les die dit project al
 *    betaald heeft.** QS8-120/121: een schema dat aan de client vastzat, was niet
 *    te testen zonder React Native mee te trekken — `vitest` valt dan om op
 *    `Flow is not supported` in `react-native/index.js`. Het ophalen staat
 *    daarom in `badges-api.ts`; deze lijst en zijn teksten staan hier.
 *
 * ⚠️ **Alles hierin is privé, en dat is de belangrijkste eigenschap van deze
 *    feature.** `badges_select` is `user_id = auth.uid()`, zonder uitzondering.
 *    Een badgemuur naast een ledenlijst is de zuiverste vorm van het probleem dat
 *    domeinregel 7 beschrijft: **de badge die er níét staat, is het signaal.**
 *    Wie na twaalf weken geen `streak_12` heeft, heeft zichtbaar een week gemist.
 *
 *    Geef dit type dus nooit aan een groepscomponent — dezelfde afspraak als bij
 *    `DoelStand` hiernaast, en om dezelfde reden.
 *
 * ⚠️ **Een badge verdwijnt nooit.** De reeksbadges hangen aan `best_streak` en
 *    niet aan `current_streak`; zou een badge weggaan als je reeks breekt, dan ís
 *    dat verdwijnen zelf de melding dat je een week gemist hebt. Structureel
 *    afgedwongen: `badges` heeft geen UPDATE- en geen DELETE-policy, ook niet
 *    voor `service_role`.
 */

/**
 * ⚠️ Kopie van de CHECK `badges_bekend` (migratie 0109). Loopt hij uiteen, dan
 *    toont het scherm een leeg vakje voor een badge die de database wél kent, of
 *    belooft het er een die nooit verdiend kan worden. `badges.test.ts` legt de
 *    twee naast elkaar.
 */
export const BADGES = [
  'first_goal',
  'first_milestone',
  'first_review',
  'streak_4',
  'streak_12',
] as const;

export type Badge = (typeof BADGES)[number];

export interface VerdiendeBadge {
  readonly badge: Badge;
  readonly earned_at: string;
}

/** Zie `meldingen()` in `api.ts`: een functie, want de taal ligt niet vast op importtijd. */
export function badgeLabels(): Readonly<Record<Badge, string>> {
  return {
    first_goal: t('badge.first_goal'),
    first_milestone: t('badge.first_milestone'),
    first_review: t('badge.first_review'),
    streak_4: t('badge.streak_4'),
    streak_12: t('badge.streak_12'),
  };
}

/**
 * De zin onder de naam: wát je ervoor gedaan hebt.
 *
 * ⚠️ In de verleden tijd en over jóú — "je rondde je eerste doel af", niet "rond
 *    een doel af". Een badge die je al hebt, is geen opdracht meer.
 */
export function badgeUitleg(): Readonly<Record<Badge, string>> {
  return {
    first_goal: t('badge.first_goal_uitleg'),
    first_milestone: t('badge.first_milestone_uitleg'),
    first_review: t('badge.first_review_uitleg'),
    streak_4: t('badge.streak_4_uitleg'),
    streak_12: t('badge.streak_12_uitleg'),
  };
}

/**
 * Kent deze app deze badge?
 *
 * ⚠️ Bestaat zodat een badge die de server wél kent en de app niet, stilzwijgend
 *    wegvalt in plaats van als leeg vakje op het scherm te belanden. Een server
 *    die vooruitloopt op een geïnstalleerde app is een normale toestand.
 */
export function kentBadge(waarde: string): waarde is Badge {
  return (BADGES as readonly string[]).includes(waarde);
}
