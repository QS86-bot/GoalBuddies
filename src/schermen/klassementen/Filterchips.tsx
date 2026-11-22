import type { Klassementkaart } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { Choice } from '@/shared/ui';

import { filterOpties } from './weergave';

/**
 * De filter bovenaan: "Alle (N)" en één keuze per groep — QS8-666 (A57b), 3c-ui. Niets bij minder dan twee kaarten.
 */
export function Filterchips({
  kaarten,
  totaalGroepen,
  filter,
  onKies,
}: {
  readonly kaarten: readonly Klassementkaart[];
  readonly totaalGroepen: number;
  readonly filter: string;
  readonly onKies: (filter: string) => void;
}) {
  const opties = filterOpties(kaarten, totaalGroepen);
  if (opties.length === 0) return null;
  return <Choice subtiel label={t('klassementen.filter_label')} opties={opties} waarde={filter} onKies={onKies} />;
}
