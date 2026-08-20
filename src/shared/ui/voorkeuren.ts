import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Voorkeuren die op dit apparaat horen en niet in je profiel — QS8-76.
 *
 * ⚠️ **Bewust lokaal en niet in `profiles`.** Twee redenen. Een animatie
 *    aan- of uitzetten hoort bij het apparaat waarop je kijkt, net als
 *    `prefers-reduced-motion` zelf — op je telefoon in de trein wil je iets
 *    anders dan op je laptop. En: een kolom toevoegen aan een bestaande tabel
 *    staat in `CLAUDE.md` onder "wat je nooit doet zonder te vragen", en een
 *    puur visuele schakelaar is die vraag niet waard.
 *
 *    Gevolg dat je moet weten: de instelling reist niet mee naar een nieuw
 *    apparaat. Wil Quinten dat wél, dan is het een kolom en dus zijn besluit.
 *
 * ⚠️ Deze module raakt geen enkele domeinregel. Zet hier nooit iets in dat de
 *    app anders laat rékenen — punten, reeksen en zichtbaarheid horen in de
 *    database, niet in de opslag van een apparaat dat de gebruiker zelf kan
 *    bewerken.
 */

const SLEUTEL_VIERINGEN = 'goalbuddies.vieringen';

/**
 * Staan de feestelijke momenten aan?
 *
 * ⚠️ Standaard aan. Een gebruiker die de app voor het eerst opent, hoort zijn
 *    eerste goedgekeurde week gevierd te zien — dat is nu juist het moment
 *    waarop de gewoonte begint te plakken.
 *
 * ⚠️ `prefers-reduced-motion` staat hier los van en wint altijd. Deze schakelaar
 *    gaat over "wil ik dit soort momenten", die voorkeur over "kan ik beweging
 *    aan". Ze door elkaar halen betekent dat iemand die om minder beweging
 *    vraagt, ook zijn felicitatie kwijtraakt.
 */
export function useVieringenAan(): {
  readonly aan: boolean;
  readonly geladen: boolean;
  readonly zet: (aan: boolean) => void;
} {
  const [aan, setAan] = useState(true);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    let levend = true;

    AsyncStorage.getItem(SLEUTEL_VIERINGEN)
      .then((waarde) => {
        if (!levend) return;
        // Alleen een expliciete 'uit' zet hem uit. Een lege of kapotte waarde
        // valt terug op de standaard in plaats van de app stiller te maken op
        // grond van iets dat niemand bewust gekozen heeft.
        setAan(waarde !== 'uit');
        setGeladen(true);
      })
      .catch(() => {
        if (levend) setGeladen(true);
      });

    return () => {
      levend = false;
    };
  }, []);

  const zet = useCallback((nieuw: boolean) => {
    setAan(nieuw);
    // Bewust niet awaiten: de schakelaar moet meteen omgaan. Mislukt het
    // opslaan, dan staat hij deze sessie goed en de volgende weer op de
    // standaard — hinderlijk, maar niets gaat stuk.
    void AsyncStorage.setItem(SLEUTEL_VIERINGEN, nieuw ? 'aan' : 'uit');
  }, []);

  return { aan, geladen, zet };
}
