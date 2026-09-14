import { useEffect, useRef } from 'react';

import { reportError } from '../../lib/observability';
import { apparaatTijdzone } from '../../shared/time';

import { useProfiel } from './ProfielProvider';
import { moetSynchroniseren } from './tijdzonesync-regel';
import { updateProfiel } from './profile';
import { useSession } from './SessionProvider';

/**
 * De tijdzone van het profiel volgt het apparaat — QS8-472.
 *
 * ⚠️⚠️ **Dit vervangt een handmatig veld, en dat is een besluit met een prijs.**
 *    `TijdzoneKeuze` bestond sinds QS8-27 precies voor het geval dat het apparaat
 *    het mis heeft: *"wie in Lissabon woont met zijn telefoon op Amsterdam moet
 *    dat kunnen rechtzetten"*. Dat kan na dit issue niet meer. Quinten heeft dat
 *    op 14-09-2026 zo besloten; wat je ervoor terugkrijgt is dat niemand zijn
 *    tijdzone meer hóeft in te vullen. De afweging en de twee gevallen waar het
 *    pijn gaat doen staan in
 *    `docs/decisions/2026-09-14-de-tijdzone-komt-uit-het-apparaat.md`.
 *
 * ⚠️ **Dit is dezelfde schrijfactie als de knop die eruit ging**, en niet een
 *    nieuwe. `updateProfiel()` valideert met `tijdzoneSchema`, de kolom houdt
 *    zijn CHECK, en `shared/time` leest de zone per aanroep uit het profiel. Wat
 *    verandert is wie hem aanstoot: het apparaat in plaats van een veld.
 *
 * ⚠️ **Geen verzetting van lopende weekdoelen, en dat is met opzet.** Een
 *    tijdzone verandert de week-startdág niet, dus de invariant van 0198 — een
 *    cyclus begint op de week-startdag van de eigenaar — blijft staan; alleen
 *    *welke* maandag "vandaag" bevat kan rond middernacht verschuiven. Dat is
 *    dezelfde toestand als een gewone weekovergang en de rollover behandelt hem
 *    al. `zet_week_startdag()` blijft de enige schrijver van `cycle_start_date`.
 *
 * ⚠️⚠️ **De ref is de grendel tegen een schrijflus.** Zou de server de zone
 *    anders terugschrijven dan wij aanboden — een normalisatie, een CHECK die
 *    iets bijstelt — dan blijft de voorwaarde hieronder waar en schrijft dit
 *    effect bij elke render opnieuw. Eén poging per zone, en een mislukte poging
 *    telt óók: anders is een structureel falende schrijfactie een oneindige lus
 *    tegen PostgREST. Zonder deze ref is dit geen hulpmiddel maar een
 *    verkeersgenerator.
 */
export function useTijdzoneSync(): void {
  const { userId } = useSession();
  const { profiel, zetProfiel } = useProfiel();

  /** De zone die we voor deze gebruiker al geprobeerd hebben. */
  const geprobeerd = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || profiel === null) return undefined;

    const apparaat = apparaatTijdzone();
    if (!moetSynchroniseren({ opgeslagen: profiel.tz, apparaat, geprobeerd: geprobeerd.current })) {
      return undefined;
    }

    geprobeerd.current = apparaat;
    let levend = true;

    updateProfiel(userId, { tz: apparaat })
      .then((uitkomst) => {
        if (!levend) return;
        if (uitkomst.ok) {
          zetProfiel(uitkomst.profiel);
          return;
        }
        // ⚠️ Naar Sentry en niet naar het scherm: de gebruiker heeft hier niets
        //    om gevraagd en kan er niets aan verhelpen. Zwijgen mag niet — dan
        //    rekent de hele app stil door in de verkeerde zone.
        reportError(new Error(uitkomst.melding), 'profile.tz_sync', { user_id: userId });
      })
      .catch((fout: unknown) => {
        reportError(fout, 'profile.tz_sync', { user_id: userId });
      });

    return () => {
      levend = false;
    };
  }, [userId, profiel, zetProfiel]);
}
