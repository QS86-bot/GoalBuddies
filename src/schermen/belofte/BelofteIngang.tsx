import { useRouter } from 'expo-router';

import { belofteaanbod, belofteperiode, heeftOpenDoelstraf, type Commitment } from '@/modules/commitments';
import { t } from '@/shared/i18n';
import { now, type UserClock } from '@/shared/time';
import { Button } from '@/shared/ui';

/**
 * De knop naar het beloftescherm, op het doelscherm — QS8-761, criterium 1.
 *
 * ⚠️ **Zonder groep geen knop; mét een lopende belofte altijd een knop.** Het
 *    tweede is de reden dat dit niet alleen naar `groepen` kijkt: wie zijn groep
 *    verliet terwijl zijn belofte loopt, moet haar nog kunnen intrekken (§4 van
 *    de poort QS8-744). Dezelfde `belofteaanbod()` als het scherm zelf.
 * ⚠️ [AANNAME] "Een groep" is hier elke groep, ook een automatisch gevormde; de
 *    lijst van het doelscherm kent die kolom niet. Het scherm toont dan de lege
 *    staat zonder verzendknop.
 */
export function BelofteIngang({
  goalId,
  doelStatus,
  streefdatum,
  vandaag,
  klok,
  commitments,
  heeftGroep,
}: {
  readonly goalId: string;
  readonly doelStatus: string;
  readonly streefdatum: string;
  readonly vandaag: string | null;
  readonly klok: UserClock | null;
  readonly commitments: readonly Commitment[];
  readonly heeftGroep: boolean;
}) {
  const router = useRouter();
  if (klok === null) return null;

  const aanbod = belofteaanbod({
    beloftes: commitments,
    doelstrafOpen: heeftOpenDoelstraf(commitments),
    doelStatus,
    streefdatum,
    vandaag,
    dezeWeek: belofteperiode(klok, now()).start,
    heeftGetuige: heeftGroep,
  });
  if (aanbod.soort !== 'kan' && aanbod.soort !== 'loopt' && aanbod.soort !== 'deze_week_al') return null;

  return (
    <Button variant="stil" onPress={() => router.push(`/doel/belofte/${goalId}`)}>
      {t('belofte.knop')}
    </Button>
  );
}
