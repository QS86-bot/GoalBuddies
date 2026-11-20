import { useProfiel, userClock } from '@/modules/auth';
import {
  belofteaanbod,
  belofteperiode,
  fetchBelofteBegunstigden,
  fetchBelofteStand,
  type Belofteaanbod,
  type BelofteBegunstigden,
  type Commitment,
} from '@/modules/commitments';
import { fetchDoel } from '@/modules/goals';
import { localDateIn, now, type UserClock } from '@/shared/time';
import { useAsync } from '@/shared/ui';

export interface Beloftegegevens {
  /** `null`: het doel bestaat niet of is niet van jou; RLS geeft dan nul rijen. */
  readonly doelGevonden: boolean;
  readonly aanbod: Belofteaanbod<Commitment>;
  readonly lijsten: BelofteBegunstigden;
  readonly klok: UserClock;
}

async function laad(goalId: string, klok: UserClock): Promise<Beloftegegevens> {
  const [doel, stand, lijsten] = await Promise.all([
    fetchDoel(goalId),
    fetchBelofteStand(goalId),
    fetchBelofteBegunstigden(),
  ]);
  const moment = now();
  const aanbod = belofteaanbod({
    beloftes: stand.beloftes,
    doelstrafOpen: stand.doelstrafOpen,
    doelStatus: doel?.status ?? '',
    streefdatum: doel?.target_date ?? '',
    vandaag: localDateIn(klok.tz, moment),
    dezeWeek: belofteperiode(klok, moment).start,
    heeftGetuige: lijsten.groepen.length > 0 || lijsten.getuigen.length > 0,
  });
  return { doelGevonden: doel !== null, aanbod, lijsten, klok };
}

/**
 * De gegevens van het beloftescherm — QS8-761.
 *
 * ⚠️ Eén ophaalronde, en elk deel werpt bij een fout: "geen getuige" en "geen
 *    belofte" zijn beweringen, en de foutstaat hoort er niet als leeg uit te
 *    zien (regel 16). Zolang het profiel laadt, laadt het scherm: zonder klok is
 *    er geen week (domeinregel 1).
 * ⚠️ De afhankelijkheden zijn strings, geen klokobject (de laadlus van QS8-75).
 */
export function useBelofte(goalId: string) {
  const { profiel } = useProfiel();
  const klok = profiel ? userClock(profiel) : null;

  return useAsync<Beloftegegevens>(
    klok && goalId ? () => laad(goalId, klok) : null,
    [goalId, klok?.tz, klok?.weekStartDay],
  );
}
