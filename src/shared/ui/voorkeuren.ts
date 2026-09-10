import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useAsync } from './useAsync';

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

const SLEUTEL_SPRAAK_UITLEG = 'goalbuddies.spraak-uitleg-gezien';

/**
 * Heeft de gebruiker de uitleg over waar zijn stem heen gaat al gezien? —
 * QS8-250, acceptatiecriterium 3.
 *
 * ⚠️ **Eén keer, en dan nooit meer.** De uitleg staat vóór de eerste opname en
 *    niet in een privacyverklaring: wat je inspreekt is in deze app precies het
 *    soort tekst dat domeinregel 7 beschermt — je doel, je tegenslag, je
 *    weekafsluiting — en de browser stuurt dat naar zijn eigen dienst. Dat is
 *    een mededeling die je vóóraf hoort te krijgen, niet achteraf.
 *
 * ⚠️ **De onbekende waarde valt de veilige kant op**, en dat is hier de ándere
 *    kant dan bij de vieringen hierboven: een lege of kapotte opslag betekent
 *    "nog niet gezien", dus de uitleg komt nog een keer. Twee keer uitleg is
 *    hinderlijk; nul keer is een belofte die niet nagekomen is.
 *
 * ⚠️ Ook dit staat op het apparaat en niet in `profiles` — zie de kop. Gevolg
 *    dat je moet weten: op een nieuwe telefoon komt de uitleg opnieuw. Dat is
 *    juist goed, want het is een andere browser met een andere dienst erachter.
 */
export function useSpraakUitlegGezien(actief: boolean): {
  readonly gezien: boolean;
  readonly geladen: boolean;
  readonly onthoud: () => void;
} {
  // ⚠️ **`useAsync` en geen eigen `levend`-vlag**, anders dan de twee voorkeuren
  //    hierboven. Die twee zijn ouder dan die helper; deze is nieuw, en
  //    `levend:controle` telt terecht mee hoeveel handgeschreven vlaggen er nog
  //    staan. Wat hier ontbreekt in `useAsync` — een waarde die je zelf kunt
  //    zetten — staat als losse vlag ernaast en niet als tweede laadbeurt.
  // ⚠️ **`null` zolang er geen microfoon staat, en dat is geen microoptimalisatie.**
  //    `Microfoon` hangt aan élk `Field`, en dat zijn er achtenveertig. Zonder
  //    deze vlag doet elk scherm net zoveel opslaglezingen als het velden heeft —
  //    óók op native en in Firefox, waar de knop nooit verschijnt. `useAsync`
  //    laadt niet bij een `null`-functie; `loading` blijft dan `true` en dus
  //    `geladen` onwaar, precies wat de aanroeper in dat geval al wil.
  const opgeslagen = useAsync(actief ? () => AsyncStorage.getItem(SLEUTEL_SPRAAK_UITLEG) : null, [actief]);
  const [zojuist, setZojuist] = useState(false);

  const onthoud = useCallback(() => {
    setZojuist(true);
    // Zelfde afweging als bij de vieringen: niet awaiten. Mislukt het opslaan,
    // dan krijgt de gebruiker de uitleg de volgende sessie nog een keer — en dat
    // is de kant waar deze voorkeur op hoort te falen.
    void AsyncStorage.setItem(SLEUTEL_SPRAAK_UITLEG, 'ja');
  }, []);

  // ⚠️ Een mislukte lezing laat `data` op `undefined` staan, en dan is `gezien`
  //    onwaar: de uitleg komt nog een keer. Dat is de veilige kant — zie de kop
  //    hierboven.
  return { gezien: zojuist || opgeslagen.data === 'ja', geladen: !opgeslagen.loading, onthoud };
}
