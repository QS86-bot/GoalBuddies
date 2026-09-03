import { useEffect, useState } from 'react';

import { fetchBeoordelingen, volgBeoordelingen } from './approvals';

import type { Beoordeelstand } from '../../shared/ui';

/**
 * Hoeveel voltooiingen er op jouw oordeel wachten, live — QS8-148.
 *
 * ⚠️ **Waarom dit een hook in de module is en geen code in het scherm.** De
 *    kaart hangt sinds QS8-148 op twee tabbladen. Zou elk scherm zijn eigen
 *    telling en zijn eigen abonnement opzetten, dan zijn dat twee lijsten die
 *    hetzelfde horen te zeggen — de fout van 0032/0034 — én twee realtime-kanalen
 *    voor dezelfde vraag.
 *
 * ⚠️ **Falen is hier niet stil, en dat is met opzet.** `mislukt` gaat aan in
 *    plaats van dat de telling op nul valt. Nul en onbekend zien er in de UI
 *    identiek uit als je dat verschil weggooit, en dan verdwijnt de kaart precies
 *    wanneer iemand hem nodig heeft. Wat de kaart daar vervolgens mee doet, staat
 *    in `toonBeoordeelkaart()`.
 *
 * ⚠️ Het abonnement staat in een eigen effect met een lege dependency-lijst: het
 *    hoort één keer opgezet te worden en niet bij elke telling opnieuw. Dezelfde
 *    val als bij `useAsync` en `useVertrekwacht` — een verse pijlfunctie in de
 *    lijst registreert elke render opnieuw.
 */
export function useTeBeoordelen(): Beoordeelstand {
  const [aantal, setAantal] = useState(0);
  const [mislukt, setMislukt] = useState(false);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    let levend = true;

    fetchBeoordelingen()
      .then((wachtrij) => {
        if (!levend) return;
        setAantal(wachtrij.totaal);
        setMislukt(false);
      })
      .catch(() => {
        if (levend) setMislukt(true);
      });

    return () => {
      levend = false;
    };
  }, [ronde]);

  useEffect(() => volgBeoordelingen(() => setRonde((n) => n + 1)), []);

  return { aantal, mislukt };
}
