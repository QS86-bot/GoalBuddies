import { useState } from 'react';

import type { BelofteBegunstigden } from '@/modules/commitments';
import { now, type UserClock } from '@/shared/time';

import { BelofteBevestigen } from './BelofteBevestigen';
import { BelofteFormulier } from './BelofteFormulier';
import { BEGIN, naarBevestigen, type Bevestigstap, type Keuze } from './keuze';

/**
 * Een belofte aangaan: eerst het formulier, dan de aparte bevestigstap.
 *
 * ⚠️ Twee stappen en nooit één knop: de bevestiging is nooit gebundeld met een
 *    andere handeling (§4 van de poort QS8-744). Terug uit de bevestigstap houdt
 *    de keuzes, zodat niemand opnieuw hoeft te typen, maar de stap zelf wordt bij
 *    elke "Verder" opnieuw opgebouwd met de week van dát moment.
 */
export function BelofteMaken({
  goalId,
  lijsten,
  klok,
  onKlaar,
}: {
  readonly goalId: string;
  readonly lijsten: BelofteBegunstigden;
  readonly klok: UserClock;
  readonly onKlaar: () => void;
}) {
  const [keuze, setKeuze] = useState<Keuze>(BEGIN);
  const [stap, setStap] = useState<Bevestigstap | null>(null);

  if (stap !== null) {
    return <BelofteBevestigen goalId={goalId} stap={stap} klok={klok} onTerug={() => setStap(null)} onKlaar={onKlaar} />;
  }

  return (
    <BelofteFormulier
      keuze={keuze}
      lijsten={lijsten}
      onKeuze={setKeuze}
      kanVerder={naarBevestigen(keuze, lijsten, klok, now()) !== null}
      onVerder={() => setStap(naarBevestigen(keuze, lijsten, klok, now()))}
    />
  );
}
