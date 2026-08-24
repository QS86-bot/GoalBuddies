import { t, TALEN, taalNaam, type Taal } from '../i18n';

import { Choice, type Optie } from './Choice';

/**
 * De taalkeuze — QS8-115, criterium 4.
 *
 * ⚠️ **Dit was het ontbrekende schrijfpad.** De leeskant stond al: migratie 0061
 *    maakte `profiles.locale` met een kolomgrant, en `ProfielProvider` roept
 *    `zetTaal()` aan zodra het profiel binnen is. Alleen kon niemand die kolom
 *    ooit vullen — de hele vertaling was daarmee bereikbaar via de taal van je
 *    telefoon en verder niet. Wie in Nederland woont met een Engelse telefoon
 *    zat vast aan het Engels, en andersom.
 *
 * ⚠️ De namen komen uit `Intl` en niet uit de catalogus, om dezelfde reden als
 *    bij de weekdagen in `WeekStartKeuze`: het is locale-data. En ze staan in de
 *    táál zelf — "Nederlands" en niet "Dutch". Wie de app per ongeluk in een
 *    taal zet die hij niet leest, moet zichzelf eruit kunnen klikken, en dat
 *    lukt alleen als hij zijn eigen taal herkent in de lijst.
 *
 * ⚠️ Een functie en geen constante: een lijst die op importtijd wordt opgebouwd,
 *    legt de taal vast vóórdat het profiel geladen is.
 */
function talen(): readonly Optie<Taal>[] {
  return TALEN.map((waarde) => ({ waarde, label: taalNaam(waarde) }));
}

interface Props {
  readonly waarde: Taal;
  readonly onKies: (taal: Taal) => void;
  readonly disabled?: boolean;
}

export function TaalKeuze({ waarde, onKies, disabled = false }: Props) {
  return (
    <Choice
      label={t('taal.label')}
      hint={t('taal.hint')}
      opties={talen()}
      waarde={waarde}
      onKies={onKies}
      disabled={disabled}
    />
  );
}
