import type { Weekday } from '../time';

import { Choice, type Optie } from './Choice';

/**
 * De week-startdag — QS8-28.
 *
 * ⚠️ Eén component voor de onboarding én de instellingen, en dat is geen luiheid.
 *    Deze keuze voedt `currentUserCycle()` en bepaalt daarmee wanneer weekdoelen
 *    resetten en wanneer punten tellen. Twee plekken die hetzelfde lijstje
 *    opbouwen, is twee plekken waar een 0 en een 7 verward kunnen raken.
 *
 * De nummering is die van Postgres en van `shared/time`: 0 = zondag.
 */

const DAGEN: readonly Optie<Weekday>[] = [
  { waarde: 1, label: 'Maandag' },
  { waarde: 2, label: 'Dinsdag' },
  { waarde: 3, label: 'Woensdag' },
  { waarde: 4, label: 'Donderdag' },
  { waarde: 5, label: 'Vrijdag' },
  { waarde: 6, label: 'Zaterdag' },
  { waarde: 0, label: 'Zondag' },
];

interface Props {
  readonly waarde: Weekday;
  readonly onKies: (dag: Weekday) => void;
  readonly disabled?: boolean;
}

export function WeekStartKeuze({ waarde, onKies, disabled = false }: Props) {
  return (
    <Choice
      label="Mijn week begint op"
      hint={
        'Bepaalt wanneer je weekdoelen opnieuw beginnen en wanneer je punten tellen. ' +
        'Later aanpasbaar; een lopende week telt gewoon uit.'
      }
      opties={DAGEN}
      waarde={waarde}
      onKies={onKies}
      disabled={disabled}
    />
  );
}
