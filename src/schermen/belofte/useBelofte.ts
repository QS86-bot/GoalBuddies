import { useProfiel, useSession, userClock } from '@/modules/auth';
import {
  belofteaanbod,
  belofteperiode,
  fetchBelofteBegunstigden,
  fetchBelofteStand,
  type Belofteaanbod,
  type BelofteBegunstigden,
  type Commitment,
  vorigeVerschuldigd,
} from '@/modules/commitments';
import { fetchDoel } from '@/modules/goals';
import { localDateIn, now, type UserClock } from '@/shared/time';
import { useAsync } from '@/shared/ui';

export interface Beloftegegevens {
  /**
   * `false`: het doel bestaat niet of is niet van jou. ⚠️ RLS geeft een groepsgenoot
   * het doel wél (`goals_select`), dus de eigenaar wordt hier getoetst; de database
   * weigert een belofte op andermans doel toch (42501), maar een formulier dat altijd
   * faalt hoort er niet te staan (security-ronde, L1).
   */
  readonly doelGevonden: boolean;
  /** De laatste verschuldigde belofte van een vorige week: de eigenaar hoort de uitkomst. */
  readonly vorige: Commitment | undefined;
  readonly dezeWeek: string;
  readonly aanbod: Belofteaanbod<Commitment>;
  readonly lijsten: BelofteBegunstigden;
  readonly klok: UserClock;
}

async function laad(goalId: string, klok: UserClock, ik: string): Promise<Beloftegegevens> {
  const [doel, stand, lijsten] = await Promise.all([
    fetchDoel(goalId),
    fetchBelofteStand(goalId),
    fetchBelofteBegunstigden(),
  ]);
  const moment = now();
  const dezeWeek = belofteperiode(klok, moment).start;
  const aanbod = belofteaanbod({
    beloftes: stand.beloftes,
    doelstrafOpen: stand.doelstrafOpen,
    doelStatus: doel?.status ?? '',
    streefdatum: doel?.target_date ?? '',
    vandaag: localDateIn(klok.tz, moment),
    dezeWeek,
    heeftGetuige: lijsten.groepen.length > 0 || lijsten.getuigen.length > 0,
  });
  const vorige = vorigeVerschuldigd(stand.beloftes, dezeWeek);
  return { doelGevonden: doel !== null && doel.owner_id === ik, aanbod, lijsten, klok, vorige, dezeWeek };
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
  const { userId } = useSession();
  const { profiel } = useProfiel();
  const klok = profiel ? userClock(profiel) : null;

  return useAsync<Beloftegegevens>(
    klok && goalId && userId ? () => laad(goalId, klok, userId) : null,
    [goalId, userId, klok?.tz, klok?.weekStartDay],
  );
}
