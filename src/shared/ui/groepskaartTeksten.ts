import { t } from '../i18n';

/**
 * De teksten van de Groepskaart — QS8-751, patroon V6.
 *
 * ⚠️ **Een functie en geen regels in het component**, om dezelfde reden als
 *    `metrics.ts`: er is hier geen renderer, dus wat in een component staat is
 *    alleen te toetsen door in de bron naar een zin te grijpen (regel 18,
 *    vraag 4). Als functie is de belofte toetsbaar.
 *
 * ⚠️ **De invoer is de belofte.** Er komen drie getallen binnen — afgeronde
 *    weken, gehaalde mijlpalen, actieve leden — en niets per persoon, niets per
 *    week, geen status. Wat hier niet binnenkomt kan er niet uit gelekt worden,
 *    en dat is domeinregel 7 en 4 in een typehandtekening: de teller is
 *    `groep_teller()` en telt alleen op, het ledenaantal is een aantal en geen
 *    lijst van wie wat deed.
 *
 * ⚠️ **Geen berekening.** Er wordt hier niets afgeleid dat de database al
 *    antwoordde: de waarden worden alleen op een geheel getal ≥ 0 gezet, zodat
 *    een defect antwoord geen "NaN weken" op het scherm zet.
 */

export interface GroepskaartInvoer {
  /** `groep_teller().weken`: afgeronde weken, alleen optellend. */
  readonly weken: number;
  /** `groep_teller().mijlpalen`: gehaalde mijlpalen, alleen optellend. */
  readonly mijlpalen: number;
  /** `group_overview().total_members`: actieve leden, een aantal. */
  readonly leden: number;
}

export interface GroepskaartTeksten {
  /** De hoofdregel van de teller, of de uitnodigende zin als er nog niets is. */
  readonly teller: string;
  /** De mijlpalenregel; `null` als er geen is. */
  readonly mijlpalen: string | null;
  readonly leden: string;
  /** Alleen bij een groep van één lid: waarom uitnodigen. Anders `null`. */
  readonly uitnodiging: string | null;
  /** Eén samenvattende zin voor een schermlezer. */
  readonly a11y: string;
  /** Is de groep nog leeg qua weken? Bepaalt of `teller` een tellerzin is. */
  readonly nogNiets: boolean;
}

function heelGetal(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function groepskaartTeksten(invoer: GroepskaartInvoer): GroepskaartTeksten {
  const weken = heelGetal(invoer.weken);
  const mijlpalen = heelGetal(invoer.mijlpalen);
  // ⚠️ Een lid kijkt, dus er is er minstens één. Een antwoord van nul leden is
  //    een defect en leest nooit als "uitgestorven groep".
  const leden = Math.max(1, heelGetal(invoer.leden));

  const nogNiets = weken === 0 && mijlpalen === 0;

  const teller = nogNiets
    ? t('groepskaart.nog_niets')
    : weken === 1
      ? t('teller.weken_een')
      : weken === 0
        ? t('groepskaart.nog_geen_weken')
        : t('teller.weken_meer', { n: weken });

  const mijlpalenTekst =
    mijlpalen === 0
      ? null
      : mijlpalen === 1
        ? t('teller.mijlpalen_een')
        : t('teller.mijlpalen_meer', { n: mijlpalen });

  const ledenTekst =
    leden === 1 ? t('groepskaart.leden_een') : t('groepskaart.leden_meer', { n: leden });

  return {
    teller,
    mijlpalen: mijlpalenTekst,
    leden: ledenTekst,
    uitnodiging: leden === 1 ? t('groepskaart.alleen') : null,
    a11y: t('groepskaart.a11y', {
      leden: ledenTekst,
      teller,
    }),
    nogNiets,
  };
}
