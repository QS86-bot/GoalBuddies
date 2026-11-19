import { useEffect, useRef } from 'react';

import type { Resultaat } from '../../shared/api';
import { t } from '../../shared/i18n';

import { verwerkToetreding, type ToetredenUitvoer } from './uitnodiging-toetreden';

/**
 * Verschijnt er een sessie terwijl het uitnodigingsscherm openstaat, dan kwam die
 * van het aanmeldscherm hiernaast — en dan is toetreden geen extra stap meer.
 * Uit het scherm getrokken in QS8-714, zodat dit effect te renderen en dus te
 * toetsen is.
 *
 * ⚠️⚠️ **Dit effect geeft geen opruimfunctie terug, en dat is de reparatie van
 *    QS8-712 en geen vergetelheid.** Een `levend = false` per effectronde gooide de
 *    uitkomst van een geslaagde toetreding weg zodra een dep wisselde terwijl
 *    `neemDeel` liep: de gebruiker was lid, het scherm zei "Deelnemen" en de
 *    bewaarde code kostte bij de volgende start nog een poging. Of het scherm er
 *    nog is, beantwoordt `uitvoer.gemount()`. `useAutomatischToetreden.test.ts`
 *    wordt rood zodra hier weer zo'n opruimfunctie komt.
 *
 * ⚠️ De ref en niet de state als slot. State is pas bij de volgende render
 *    bijgewerkt, en tot dat moment zou een tweede effectronde nog een keer kunnen
 *    toetreden — en elke toetreding kost een poging uit de dagelijkse twintig.
 *
 * ⚠️ De momentopname "had dit scherm al een sessie" staat in dezelfde effect-body
 *    als de beslissing die hem gebruikt: een ref uitlezen tijdens de render mag
 *    niet, en twee losse effecten geven geen vaste volgorde.
 */
export function useAutomatischToetreden(invoer: {
  readonly sessieLaadt: boolean;
  readonly ingelogd: boolean;
  readonly code: string | undefined;
  /**
   * Zie `magAutomatischToetreden()`: alleen waar als vaststaat dat je geen lid bent.
   *
   * ⚠️ Deze hook leunt erop dat dit ook "er is een uitnodiging" betekent: het oude
   *    effect keek apart naar `uitnodiging === null`, deze niet. Dat klopt zolang
   *    `uitnodigingsStand()` `kan-deelnemen` pas geeft ná de controles op `undefined`
   *    en `null`. Verruim je die functie, kijk dan hier of het nog zo is.
   */
  readonly magToetreden: boolean;
  readonly uitvoer: ToetredenUitvoer;
  /** `neemDeel` uit `api.ts`; meegegeven zodat een test geen Supabase-client nodig heeft. */
  readonly toetreden: (code: string) => Promise<Resultaat<string>>;
}): void {
  const { sessieLaadt, ingelogd, code, magToetreden, uitvoer, toetreden } = invoer;
  const sessieBijBinnenkomst = useRef<boolean | null>(null);
  const geprobeerd = useRef(false);

  useEffect(() => {
    if (sessieLaadt) return;

    if (sessieBijBinnenkomst.current === null) sessieBijBinnenkomst.current = ingelogd;

    if (!ingelogd || !code || !magToetreden) return;
    if (sessieBijBinnenkomst.current !== false) return;
    if (geprobeerd.current) return;

    geprobeerd.current = true;

    toetreden(code)
      .then((uitkomst) => verwerkToetreding(uitkomst, uitvoer))
      .catch(() => {
        if (uitvoer.gemount()) uitvoer.zetFout(t('uitnodiging.deelnemen_mislukt'));
      });
  }, [sessieLaadt, ingelogd, code, magToetreden, uitvoer, toetreden]);
}
