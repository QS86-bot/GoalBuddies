import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { reportError } from '../../lib/observability';
import { zetTaal } from '../../shared/i18n';

import { fetchProfiel, type Profiel } from './profile';
import { useSession } from './SessionProvider';

/**
 * Het profiel van de ingelogde gebruiker, één keer geladen.
 *
 * ⚠️ Bijna elk scherm heeft dit nodig: de week-startdag en de tijdzone voeden
 *    `currentUserCycle()`, en zonder die twee klopt "deze week" nergens. Zou elk
 *    scherm het zelf ophalen, dan is dat een query per scherm én een kans dat
 *    twee schermen met een verschillende versie rekenen.
 */

interface ProfielContextWaarde {
  readonly profiel: Profiel | null;
  readonly loading: boolean;
  readonly error: unknown;
  /** Na een wijziging: opnieuw laden zodat de hele app meeschuift. */
  readonly herlaad: () => void;
  /** Direct bijwerken na een geslaagde opslag, zonder extra netwerkronde. */
  readonly zetProfiel: (profiel: Profiel) => void;
  /**
   * De onboarding is in deze sessie net afgerond op het profielscherm, en de
   * vragenlijst moet nog volgen — QS8-793. De routewacht leest dit; zie
   * `bestemmingVoor()`.
   */
  readonly netAfgerond: boolean;
  /**
   * Het profiel bijwerken ná `rondOnboardingAf()`, in één stap met `netAfgerond`.
   *
   * ⚠️⚠️ **Gebruik hier niet `zetProfiel()`, en dat is een gemeten fout en geen
   *    smaak (QS8-793).** Op de web-export kwam de navigatie van het profielscherm
   *    één render ná het profiel binnen. In die render zag de routewacht een
   *    afgerond profiel op `/onboarding/profiel`, stuurde naar `/`, en die replace
   *    won: een nieuw account zag de vragenlijst nooit. Hier gaan profiel en vlag
   *    in dezelfde batch, dus er is geen render waarin de wacht het één ziet en
   *    het ander niet. De wacht stuurt daarna zelf naar de vragenlijst.
   *
   * ⚠️ **`vragenlijst: false` zet het profiel zonder vlag — QS8-805.** Wie met een
   *    uitnodiging, een werkcode of een al gedane toetreding afrondt, gaat eerst naar
   *    zijn groep; dat doet `Uitnodigingswacht`. De vlag zou de routewacht daar
   *    tegenin naar de vragenlijst laten sturen (📏 0,1 s in beeld op de web-export).
   */
  readonly zetAfgerondProfiel: (profiel: Profiel, opties: AfrondOpties) => void;
  /** De vragenlijst is in beeld, of de gebruiker is de onboarding uit: de vlag is gedaan. Roept de routewacht aan. */
  readonly afrondenVoorbij: () => void;
}

/** Volgt na het afronden de vragenlijst? `false` bij een instap — zie `zetAfgerondProfiel`. */
export interface AfrondOpties {
  readonly vragenlijst: boolean;
}

const ProfielContext = createContext<ProfielContextWaarde>({
  profiel: null,
  loading: true,
  error: null,
  herlaad: () => undefined,
  zetProfiel: () => undefined,
  netAfgerond: false,
  zetAfgerondProfiel: () => undefined,
  afrondenVoorbij: () => undefined,
});

export function ProfielProvider({ children }: { readonly children: React.ReactNode }) {
  const { userId, loading: sessieLaadt } = useSession();

  const [profiel, setProfiel] = useState<Profiel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [teller, setTeller] = useState(0);
  // ⚠️ Van wie de vlag is, en niet alleen of hij staat: zo lekt hij nooit naar
  //    de volgende gebruiker op dit apparaat, zonder setState bij het uitloggen.
  const [netAfgerondVoor, setNetAfgerondVoor] = useState<string | null>(null);

  // ⚠️ Geen `setProfiel(null)` bij uitloggen. Dat zou een setState in de
  //    effectbody zijn, en React klaagt daar terecht over: het levert een extra
  //    renderronde op voor iets dat gewoon af te leiden is. De uitgelogde stand
  //    wordt hieronder afgeleid, waardoor een oude profielrij nooit kan
  //    doorlekken naar de volgende gebruiker.
  useEffect(() => {
    if (sessieLaadt || !userId) return;

    // Bij een herlaadronde blijft het oude profiel staan tot het nieuwe binnen
    // is. Dat is met opzet: een spinner over data die al klopt, laat de app
    // knipperen bij elke kleine wijziging.
    let levend = true;

    fetchProfiel(userId)
      .then((gevonden) => {
        if (!levend) return;
        setProfiel(gevonden);

        // ⚠️ De taal volgt het profiel zodra dat binnen is — QS8-113.
        //
        //    Alleen als er écht een keuze staat. `locale` is `null` zolang de
        //    gebruiker niets gekozen heeft, en dan blijft de taal gelden die
        //    `_layout` uit het apparaat heeft afgeleid. Zou hier altijd gezet
        //    worden, dan krijgt iemand met een Engelse telefoon bij elke start
        //    Nederlands terug — dat is precies waarom `locale` nullable is.
        if (gevonden?.locale) zetTaal(gevonden.locale);

        setError(null);
      })
      .catch((fout: unknown) => {
        reportError(fout, 'profile.provider', { user_id: userId });
        if (levend) setError(fout);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };
  }, [userId, sessieLaadt, teller]);

  const herlaad = useCallback(() => setTeller((n) => n + 1), []);

  const zetAfgerondProfiel = useCallback((afgerond: Profiel, opties: AfrondOpties) => {
    setProfiel(afgerond);
    if (opties.vragenlijst) setNetAfgerondVoor(afgerond.id);
  }, []);
  const afrondenVoorbij = useCallback(() => setNetAfgerondVoor(null), []);

  const waarde = useMemo<ProfielContextWaarde>(
    () => ({
      // Zonder gebruiker is er geen profiel, en valt er ook niets te laden.
      profiel: userId ? profiel : null,
      loading: sessieLaadt || (userId ? loading : false),
      error: userId ? error : null,
      herlaad,
      zetProfiel: setProfiel,
      netAfgerond: userId !== null && netAfgerondVoor === userId,
      zetAfgerondProfiel,
      afrondenVoorbij,
    }),
    [userId, profiel, loading, sessieLaadt, error, herlaad, netAfgerondVoor, zetAfgerondProfiel, afrondenVoorbij],
  );

  return <ProfielContext.Provider value={waarde}>{children}</ProfielContext.Provider>;
}

export function useProfiel(): ProfielContextWaarde {
  return useContext(ProfielContext);
}
