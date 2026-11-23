import { useState } from 'react';

import { groepeerKlassementen, uniekeKaarten, type Klassementkaart, type KlassementenRij } from '@/modules/buddies';
import { useBladerlijst, type Bladzijde } from '@/shared/ui';

import { FILTER_ALLE, geldigFilter, zichtbareKaarten } from './weergave';

/** Eén bladzijde met rijen van de RPC; het totaal aantal groepen staat op elke rij (`total_groups`). */
export type KlassementenBladzijde = Bladzijde<KlassementenRij>;

/**
 * De toestand van het scherm "Alle klassementen" — QS8-666 (A57b), 3c-ui: de bladzijden met kaarten en het gekozen filter.
 *
 * ⚠️ **De loader komt van buiten** (`laad`): dit bestand weet niet waar de rijen vandaan komen. Dat is hoe het scherm met een fixture te
 *    tonen en te toetsen is, en hoe de echte aanroep (`fetchMijnKlassementen()`) er pas in 3c-ui-b aan hangt.
 *
 * ⚠️ **Niets wordt hier gesorteerd of opgeteld over groepen heen.** De kaarten staan in de volgorde van de RPC, en bladzijden worden samengevoegd
 *    zonder dubbele groepen (iemand die tussen twee bladzijden ergens lid wordt, verschuift de offset).
 */
export function useKlassementen(mijnId: string, laad: (na: string | null) => Promise<KlassementenBladzijde>) {
  const [filter, kies] = useState<string>(FILTER_ALLE);
  const lijst = useBladerlijst<KlassementenRij>(laad, [mijnId]);

  const kaarten: readonly Klassementkaart[] = uniekeKaarten(groepeerKlassementen(lijst.rijen ?? [], mijnId));
  const gekozen = geldigFilter(filter, kaarten);

  return {
    ...lijst,
    kaarten,
    zichtbaar: zichtbareKaarten(kaarten, gekozen),
    filter: gekozen,
    kies,
    totaalGroepen: Math.max(lijst.rijen?.[0]?.totaalGroepen ?? 0, kaarten.length),
  };
}
