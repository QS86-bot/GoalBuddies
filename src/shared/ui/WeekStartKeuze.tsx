import { t, weekdagNaam } from '../i18n';

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

/**
 * De zeven dagen, met maandag voorop en zondag achteraan.
 *
 * ⚠️ **De namen komen uit `Intl` en niet uit de catalogus** (QS8-115). Zeven
 *    sleutels per taal overtypen levert alleen de kans op een tikfout in een taal
 *    die hier niemand spreekt; `weekdagNaam()` doet het goed voor élke taal die
 *    er ooit bij komt, inclusief de hoofdletterconventie — het Frans schrijft
 *    "lundi" met kleine letter en het Duits "Montag" met hoofdletter.
 *
 * ⚠️ **De vólgorde blijft wél hier staan**, en dat is bewust. Welke dag bovenaan
 *    staat is een productkeuze en geen locale-data: maandag eerst omdat dat de
 *    meest gekozen week-start is, zondag onderaan omdat 0 in `shared/time`
 *    weliswaar zondag is maar niemand zijn lijstje daarmee begint.
 *
 * ⚠️ Een functie en geen constante: de namen hangen van de taal af, en een
 *    module-constante zou die vastleggen vóórdat het profiel geladen is.
 */
function dagen(): readonly Optie<Weekday>[] {
  return ([1, 2, 3, 4, 5, 6, 0] as const).map((waarde) => ({
    waarde,
    label: weekdagNaam(waarde),
  }));
}

interface Props {
  readonly waarde: Weekday;
  readonly onKies: (dag: Weekday) => void;
  readonly disabled?: boolean;
}

export function WeekStartKeuze({ waarde, onKies, disabled = false }: Props) {
  return (
    <Choice
      label={t('weekstart.label')}
      hint={t('weekstart.hint')}
      opties={dagen()}
      waarde={waarde}
      onKies={onKies}
      disabled={disabled}
    />
  );
}
