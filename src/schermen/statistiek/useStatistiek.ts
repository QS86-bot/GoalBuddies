import { useProfiel, useSession, userClock } from '@/modules/auth';
import { fetchEigenVoltooiingsmomenten } from '@/modules/completions';
import { huidigeCyclus } from '@/modules/goals';
import { now, type Gebruikerscyclus, type UserClock } from '@/shared/time';
import { useAsync } from '@/shared/ui';

import { eersteWeek, type Periode } from './periode-vorm';
import { oudsteWeek, weekkalender, type Weekcel } from './weekkalender-vorm';
import { tijdstippen, type Dagdeelstand } from './tijdstip-vorm';

export interface Statistiek {
  readonly weken: readonly Weekcel[];
  readonly tijdstippen: readonly Dagdeelstand[];
  readonly aantalVoltooiingen: number;
  readonly afgekapt: boolean;
}

/** Bouwt de pagina uit één ophaalronde; alles daarna is een pure vorm (`*-vorm.ts`). */
function bouw(
  klok: UserClock,
  huidige: Gebruikerscyclus,
  periode: Periode,
  data: Awaited<ReturnType<typeof fetchEigenVoltooiingsmomenten>>,
): Statistiek {
  const datums = data.rijen.map((r) => r.cycle_start_date);
  const eerste = eersteWeek(periode, klok, now()) ?? oudsteWeek(klok, huidige, datums);
  return {
    weken: weekkalender(klok, eerste, huidige, datums),
    tijdstippen: tijdstippen(klok.tz, data.rijen),
    aantalVoltooiingen: data.rijen.length,
    afgekapt: data.afgekapt,
  };
}

/**
 * De gegevens van de statistiekpagina — QS8-749.
 *
 * ⚠️ `userId` komt uit de sessie en nergens anders: de pagina is alleen voor jezelf.
 * ⚠️ De afhankelijkheden zijn strings: een vers cyclusobject per render geeft een oneindige
 *    laadlus (QS8-75). De periode en de startdatum van de week zijn wat er echt verandert.
 */
export function useStatistiek(periode: Periode) {
  const { userId } = useSession();
  const { profiel } = useProfiel();
  const klok = profiel ? userClock(profiel) : null;
  const huidige = klok ? huidigeCyclus(klok) : null;
  const eerste = klok ? eersteWeek(periode, klok, now()) : null;
  const vanaf = eerste?.startsAt.toISOString() ?? null;

  return useAsync<Statistiek>(
    userId && klok && huidige
      ? async () =>
          bouw(
            klok,
            huidige,
            periode,
            await fetchEigenVoltooiingsmomenten(userId, vanaf),
          )
      : null,
    [userId, periode, vanaf, huidige?.startDate, klok?.tz, klok?.weekStartDay],
  );
}
