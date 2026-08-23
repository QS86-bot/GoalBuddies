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

const SLEUTEL_HULPVRAAG = 'goalbuddies.hulpvraag-weg';

/**
 * Heeft de gebruiker de hulpvraag-kaart voor dit doel weggeklikt? — QS8-95,
 * acceptatiecriterium 5: "wegklikken kan, en het signaal komt niet dagelijks
 * terug zeuren".
 *
 * ⚠️ Per doel, niet per gebruiker. Achterlopen op je scriptie zegt niets over je
 *    hardloopdoel, en één keer wegklikken hoort niet elke andere hulpvraag te
 *    smoren.
 *
 * ⚠️ Ook dit staat op het apparaat en niet in `profiles`. Zie de kop van dit
 *    bestand: een kolom toevoegen aan een bestaande tabel vraagt eerst
 *    toestemming, en dit is een schermvoorkeur. Gevolg dat je moet weten: op een
 *    nieuwe telefoon komt de kaart één keer terug. Dat is mild — de kaart
 *    verschijnt alleen bij achterstand en doet uit zichzelf niets.
 */
export function useHulpvraagVerborgen(goalId: string): {
  readonly weg: boolean;
  readonly geladen: boolean;
  readonly verberg: () => void;
} {
  const [weg, setWeg] = useState(false);
  /**
   * Het doel waarvoor de voorkeur gelezen is.
   *
   * ⚠️ Bewust dít en niet een losse `geladen`-vlag die het effect op `false`
   *    zet. Synchroon `setState` aanroepen in een effect veroorzaakt een
   *    cascade van renders en de lint-regel vangt het af; hieruit is `geladen`
   *    gewoon af te leiden. Het lost meteen het echte probleem op: bij het
   *    wisselen van doel is de vorige waarde niet meer "geladen".
   */
  const [geladenVoor, setGeladenVoor] = useState<string | null>(null);

  useEffect(() => {
    let levend = true;

    AsyncStorage.getItem(`${SLEUTEL_HULPVRAAG}.${goalId}`)
      .then((waarde) => {
        if (!levend) return;
        setWeg(waarde === 'ja');
        setGeladenVoor(goalId);
      })
      .catch(() => {
        if (levend) setGeladenVoor(goalId);
      });

    return () => {
      levend = false;
    };
  }, [goalId]);

  const geladen = geladenVoor === goalId;

  const verberg = useCallback(() => {
    setWeg(true);
    void AsyncStorage.setItem(`${SLEUTEL_HULPVRAAG}.${goalId}`, 'ja');
  }, [goalId]);

  return { weg, geladen, verberg };
}
