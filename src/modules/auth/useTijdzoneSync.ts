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
 * ⚠️⚠️ **Geen verzetting van lopende weekdoelen — en dat is een keuze met een
 *    gevolg, niet een keuze zonder gevolg.** Hier stond dat een zonesprong
 *    "dezelfde toestand als een gewone weekovergang" oplevert en dat de rollover
 *    hem al behandelt. Dat is onwaar, en de security-review van QS8-472 heeft het
 *    gemeten: valt de sprong over de week-startdag, dan verschuift de cyclusgrens
 *    niet met een dag maar met **zeven**, en westwaarts gaat hij terúg. Op
 *    `2026-09-13T22:30Z` met week-start maandag geeft `Europe/Amsterdam`
 *    `2026-09-14` en `Pacific/Honolulu` `2026-09-07`. `fetchWeekdoelen()` matcht
 *    exact op `cycle_start_date`, dus een weekdoel kan uit je lijst verdwijnen
 *    zonder dat er iets verstreken is — iets wat een gewone weekovergang nooit
 *    doet, en waar de rollover dus ook niets aan doet.
 *
 *    Wat wél blijft staan: de invariant van 0198 (een cyclus begint op de
 *    week-startdag van de eigenaar), want de week-startdág verandert niet, en
 *    `zet_week_startdag()` blijft de enige schrijver van `cycle_start_date`.
 *    Er wordt hier dus niets stukgemaakt dat de database bewaakt — wat er gebeurt
 *    is dat de gebruiker een andere week te zien krijgt. Rij in
 *    `docs/ENGINEER-REVIEW.md`.
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

  /**
   * De zone die we al geprobeerd hebben, mét voor wie.
   *
   * ⚠️⚠️ **De `userId` erbij is een gemeten bevinding uit de security-review van
   *    QS8-472.** Hier stond alleen de zone, met een comment dat beweerde dat het
   *    "voor deze gebruiker" was — en dat was niet zo: `Tijdzonewacht` hangt in
   *    `RootLayout` en demonteert nooit, want `SessionProvider` vervangt alleen de
   *    sessie. 📏 Gevolg op een gedeeld toestel: A logt in, de wacht schrijft zijn
   *    zone en zet de ref; A logt uit, B logt in met een ándere zone in zijn
   *    profiel — en de wacht sloeg over. B zat die sessie vast in A's zone, en er
   *    is geen veld meer om dat recht te zetten.
   */
  const geprobeerd = useRef<{ readonly userId: string; readonly zone: string } | null>(null);

  useEffect(() => {
    if (!userId || profiel === null) return undefined;

    // ⚠️ **Het geladen profiel moet van déze gebruiker zijn.** `ProfielProvider`
    //    laat bij een accountwissel de oude rij staan tot de nieuwe binnen is —
    //    met opzet, zodat de app niet knippert — dus er is een venster waarin
    //    `userId` al B is en `profiel` nog van A. Een besluit dat in dat venster
    //    op `profiel.tz` van A leunt, is een besluit over de verkeerde rij.
    if (profiel.id !== userId) return undefined;

    const apparaat = apparaatTijdzone();
    const eerder = geprobeerd.current;
    const alGeprobeerd = eerder !== null && eerder.userId === userId ? eerder.zone : null;

    if (!moetSynchroniseren({ opgeslagen: profiel.tz, apparaat, geprobeerd: alGeprobeerd })) {
      return undefined;
    }

    geprobeerd.current = { userId, zone: apparaat };
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
