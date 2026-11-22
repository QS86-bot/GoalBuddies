import type { Klassementkaart } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import type { Optie, Taakbalkvorm } from '@/shared/ui';

/**
 * Wat het scherm "Alle klassementen" laat zien bij een filter en een breedte — QS8-666 (A57b), 3c-ui.
 *
 * ⚠️ **Niets hier sorteert of telt over groepen heen.** De kaarten staan in de volgorde van de RPC (de datum waarop je lid werd) en een filter
 *    kiest er hoogstens één uit. Een samenvatting als "je beste plek" of een sortering op punten zou de afgewezen lezing B zijn: een ranglijst
 *    over groepen heen.
 */
export const FILTER_ALLE = 'alle';

/** De keuzes van het filter: "Alle (N)" en één per groep, en niets bij minder dan twee kaarten. */
export function filterOpties(kaarten: readonly Klassementkaart[], totaalGroepen: number): readonly Optie<string>[] {
  if (kaarten.length < 2) return [];
  return [
    { waarde: FILTER_ALLE, label: t('klassementen.filter_alle', { n: totaalGroepen }) },
    ...kaarten.map((k) => ({ waarde: k.groupId, label: k.groepnaam })),
  ];
}

/** Alle kaarten, of alleen die ene. */
export function zichtbareKaarten(kaarten: readonly Klassementkaart[], filter: string): readonly Klassementkaart[] {
  return filter === FILTER_ALLE ? kaarten : kaarten.filter((k) => k.groupId === filter);
}

/** Het filter valt terug op "alle" als de gekozen groep na een herlading weg is. */
export function geldigFilter(filter: string, kaarten: readonly Klassementkaart[]): string {
  return filter === FILTER_ALLE || kaarten.some((k) => k.groupId === filter) ? filter : FILTER_ALLE;
}

/** Eén kolom op een smal scherm; op een breed scherm drie, of minder als er minder kaarten zijn (geen lege kolommen). */
export function kolommenVoor(vorm: Taakbalkvorm, aantal: number): 1 | 2 | 3 {
  if (vorm === 'bovenrand') return 1;
  return Math.max(1, Math.min(3, aantal)) as 1 | 2 | 3;
}
