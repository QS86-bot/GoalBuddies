import type { Badge, BadgeWaarde, Zeldzaamheid } from '@/modules/goals';
import type { PictogramNaam } from '@/shared/ui';

/**
 * De indeling van het Prestatiescherm — QS8-735. Alleen voor jezelf (domeinregel 7):
 * geef dit type nooit aan een groepscomponent. Zuiver, zodat elke belofte hier zonder
 * react-native te meten is.
 */

export type Categorie = 'eerste_stappen' | 'reeksen';

export const CATEGORIEEN: readonly Categorie[] = ['eerste_stappen', 'reeksen'];

/**
 * Welke categorie en welk pictogram een badge draagt.
 *
 * ⚠️ Alleen pictogrammen met betekenis `prestatie`: kroon en bliksem (`zeldzame_prestatie`)
 *    wachten op Quintens keuze (QS8-730) en hangen aan geen scherm.
 */
export const BADGE_VORM: Readonly<Record<Badge, { readonly categorie: Categorie; readonly pictogram: PictogramNaam }>> = {
  first_goal: { categorie: 'eerste_stappen', pictogram: 'medaille' },
  first_milestone: { categorie: 'eerste_stappen', pictogram: 'ster' },
  first_review: { categorie: 'eerste_stappen', pictogram: 'schild' },
  streak_4: { categorie: 'reeksen', pictogram: 'vlam' },
  streak_12: { categorie: 'reeksen', pictogram: 'trofee' },
};

export interface Prestatie {
  readonly badge: Badge;
  readonly categorie: Categorie;
  readonly pictogram: PictogramNaam;
  readonly zeldzaamheid: Zeldzaamheid;
  readonly xp: number;
  /** ISO-tijdstip, of `null` als je hem nog niet hebt: dan is het een gedimde versie, geen verwijt. */
  readonly behaaldOp: string | null;
}

/**
 * Elke badge die de app kent, behaald of niet, gegroepeerd per categorie in de volgorde van `badges`.
 *
 * ⚠️ `badges` en `waarde` komen van de aanroeper (`BADGES` en `BADGE_WAARDE` uit `modules/goals`):
 *    deze vorm importeert alleen types, zodat hij zonder react-native te meten blijft.
 */
export function prestatiesPerCategorie(
  verdiend: readonly { readonly badge: Badge; readonly earned_at: string }[],
  badges: readonly Badge[],
  waarde: Readonly<Record<Badge, BadgeWaarde>>,
): readonly { readonly categorie: Categorie; readonly prestaties: readonly Prestatie[] }[] {
  const datum = new Map(verdiend.map((v) => [v.badge, v.earned_at]));
  return CATEGORIEEN.map((categorie) => ({
    categorie,
    prestaties: badges.filter((b) => BADGE_VORM[b].categorie === categorie).map((badge) => ({
      badge,
      categorie,
      pictogram: BADGE_VORM[badge].pictogram,
      zeldzaamheid: waarde[badge].zeldzaamheid,
      xp: waarde[badge].xp,
      behaaldOp: datum.get(badge) ?? null,
    })),
  }));
}

/** Voortgang naar het volgende niveau, 0..1. Op het hoogste niveau (geen volgende drempel) vol. */
export function niveauVoortgang(totaal: number, huidig: number, volgende: number | null): number {
  if (volgende === null) return 1;
  const breedte = volgende - huidig;
  if (breedte <= 0) return 1;
  return Math.min(1, Math.max(0, (totaal - huidig) / breedte));
}
