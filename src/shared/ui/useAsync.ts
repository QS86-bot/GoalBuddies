import { useCallback, useEffect, useState } from 'react';

/**
 * De bewaakte laadbeurt zelf, los van React.
 *
 * ⚠️ **Dit staat apart zodat de belofte te tóetsen is.** De hook eromheen kan
 *    niet in een node-omgeving draaien zonder een React-testbibliotheek toe te
 *    voegen, en een dependency toevoegen om één vlag te bewijzen is de verkeerde
 *    ruil. Wat er bewezen moet worden is dit: **na `leeft() === false` wordt er
 *    niets meer geschreven** — niet bij succes, niet bij een fout, en ook niet in
 *    de `finally`. Dat is een eigenschap van deze functie en van niets anders.
 *
 * ⚠️ `leeft` is een functie en geen waarde, want hij moet op het móment van
 *    binnenkomen gelezen worden en niet op het moment van aanroepen. Een `boolean`
 *    meegeven zou de vlag bevriezen op `true` en de hele bewaking uitzetten — een
 *    fout die er precies zo uitziet als de goede versie.
 */
export async function laad<T>(
  fn: () => Promise<T>,
  leeft: () => boolean,
  zet: {
    readonly data: (waarde: T) => void;
    readonly fout: (fout: unknown) => void;
    readonly klaar: () => void;
  },
): Promise<void> {
  try {
    const uitkomst = await fn();
    if (!leeft()) return;
    zet.data(uitkomst);
    zet.fout(null);
  } catch (fout: unknown) {
    if (leeft()) zet.fout(fout);
  } finally {
    if (leeft()) zet.klaar();
  }
}

/**
 * Eén asynchrone laadbeurt, met de drie staten die `AsyncView` vraagt.
 *
 * ⚠️ **Waarom dit bestaat.** Ditzelfde blokje stond op 25-08-2026 **32 keer**
 *    woordelijk in `app/` en `src/`, verdeeld over achttien bestanden: een
 *    `levend`-vlag, een `.then()` die hem toetst, een `.catch()` die hem toetst,
 *    een `.finally()` die hem toetst, en een opruimfunctie die hem op `false`
 *    zet. De bevinding van 16-08 zei "negen keer" en de meting van 25-08 zei
 *    "achttien bestanden" — het waren er 32.
 *
 *    Tweeëndertig correcte kopieën lekken niets. Het risico is de drieëndertigste
 *    die één van de vier toetsen vergeet, en dat is een `setState` op een
 *    verdwenen component: een waarschuwing in de console die niemand leest, en
 *    bij een trage verbinding een scherm dat data van het vórige doel toont.
 *
 * ⚠️ **De vlag beschermt twee dingen, en de tweede wordt makkelijk vergeten.**
 *    Niet alleen unmount, maar ook een wisseling van `deps`: navigeert iemand van
 *    doel A naar doel B terwijl het verzoek voor A nog loopt, dan mag het
 *    antwoord van A niet meer landen. React ruimt de vorige effect-run op vóór de
 *    volgende begint, dus dezelfde vlag dekt allebei — mits hij er is.
 *
 * ⚠️ **`fn` mag `null` zijn**, en dat vervangt de `if (!userId) return;` die aan
 *    het begin van al die effecten stond. `loading` blijft dan op `true` staan,
 *    precies zoals nu: er is nog niets te laden en het scherm hoort een
 *    laadindicator te tonen, geen lege staat.
 *
 * ⚠️ **Een fout wist de data niet.** Dat is overgenomen en geen versimpeling:
 *    `AsyncView` toont bij een fout mét oude data nog steeds de fout, maar een
 *    herlaadpoging die opnieuw mislukt laat het scherm niet leeglopen.
 *
 * @param fn de laadfunctie, of `null` zolang de invoer nog niet compleet is
 * @param deps precies zoals bij `useEffect` — bij een wijziging wordt opnieuw
 *   geladen en vervalt het antwoord van de vorige ronde
 */
export function useAsync<T>(
  fn: (() => Promise<T>) | null,
  deps: readonly unknown[],
): {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  /** Voor `onRetry` van `AsyncView`. Laadt opnieuw met dezelfde `deps`. */
  readonly herlaad: () => void;
} {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    if (fn === null) return;
    let levend = true;

    void laad(fn, () => levend, {
      data: setData,
      fout: setError,
      klaar: () => setLoading(false),
    });

    return () => {
      levend = false;
    };
    // ⚠️ `fn` staat met opzet níét in deze lijst. Een aanroeper geeft bijna altijd
    //    een inline pijlfunctie mee, en die is elke render een nieuwe waarde —
    //    dan laadt dit scherm oneindig door. De aanroeper bepaalt met `deps`
    //    wanneer er opnieuw geladen wordt, net als bij het `useEffect` dat hier
    //    stond.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  return { data, loading, error, herlaad };
}

/**
 * De zetters die `useAsyncMetTerugval` aan `laad()` meegeeft — QS8-219.
 *
 * ⚠️ **Apart en geëxporteerd, om dezelfde reden als `laad()` zelf.** De hook
 *    hieronder kan niet in een node-omgeving draaien zonder een
 *    React-testbibliotheek, en er zit precies één beslissing in die je fout kunt
 *    hebben. Die staat hier, en `useAsync.test.ts` voert hem los door `laad()`.
 *
 * ⚠️ **De val zit in `zet.fout(null)`.** `laad()` roept die aan ná een geslaagde
 *    lezing, om een eerdere fout te wissen. Zou deze functie bij élke aanroep de
 *    terugval schrijven, dan overschrijft ze meteen de waarde die er net in
 *    gezet is — en dan toont het scherm altijd de terugval, ook als het ophalen
 *    lukte. Dat is een fout die er precies zo uitziet als de goede versie, want
 *    de terugval is een geldige waarde.
 */
export function terugvalZetters<T>(
  zet: (waarde: T) => void,
  terugval: T,
): {
  readonly data: (waarde: T) => void;
  readonly fout: (fout: unknown) => void;
  readonly klaar: () => void;
} {
  return {
    data: zet,
    fout: (fout) => {
      // ⚠️ `null` is "de fout is voorbij" en geen fout. Zie de kop hierboven.
      if (fout !== null) zet(terugval);
    },
    // Deze vorm kent geen laadstand: het scherm toont de terugval tot er iets
    // beters is, en dat is precies wat de aanroepers hiervan deden.
    klaar: () => {},
  };
}

/**
 * Eén laadbeurt naar één waarde, met een terugval als het misgaat — QS8-219.
 *
 * ⚠️ **Waarom naast `useAsync` en niet erin.** Vijf plekken hadden dezelfde vorm
 *    en géén van drieën wat `useAsync` teruggeeft: geen laadstand, geen
 *    foutstand, en een fout die de wáárde terugzet op een neutrale waarde in
 *    plaats van een melding te worden. Ze door `useAsync` persen zou betekenen
 *    dat `data ?? terugval` de terugval doet, en dat is nét iets anders: dan
 *    houdt een mislukte hérlaadbeurt de oude waarde vast in plaats van terug te
 *    vallen. Dat is een gedragswijziging vermomd als opruimwerk.
 *
 * ⚠️ **De terugval staat niet in `deps`, en dat moet ook niet.** Aanroepers
 *    geven `[]` mee als lege terugval, en dat is elke render een nieuwe array —
 *    in `deps` zou dit oneindig doorladen. Gevolg van die keuze: de terugval
 *    hoort een constante te zijn. Bij alle vijf aanroepers is dat zo.

 * ⚠️ **Een zesde plek lijkt erop en gaat er níét door.** `Adempauzes` in
 *    `app/doel/[id].tsx` zet `pauzes` ook ná het aanmaken en het annuleren van
 *    een pauze; die state is dus niet alleen van de laadbeurt. Door deze hook
 *    persen zou betekenen dat een lokale wijziging nergens meer heen kan — het
 *    soort opruimen dat een koppeling máákt, waar QS8-219 zelf voor waarschuwt.
 *
 * ⚠️ De bewaking is niet gekopieerd maar geleend: `laad()` doet hem, en die
 *    staat onder test.
 */
export function useAsyncMetTerugval<T>(
  fn: (() => Promise<T>) | null,
  terugval: T,
  deps: readonly unknown[],
): T {
  const [waarde, setWaarde] = useState<T>(terugval);

  useEffect(() => {
    if (fn === null) return;
    let levend = true;

    void laad(fn, () => levend, terugvalZetters(setWaarde, terugval));

    return () => {
      levend = false;
    };
    // ⚠️ `fn` en `terugval` staan er met opzet niet in — zie de kop. De
    //    aanroeper bepaalt met `deps` wanneer er opnieuw geladen wordt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return waarde;
}
