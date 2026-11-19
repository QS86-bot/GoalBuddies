import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ThemeProvider } from '../../shared/theme';

import { loopKeten } from './keten';
import { kiesVoorkeur, leesLokaleStart, verzoenMetAccount } from './opstarten';
import { normaliseerVoorkeur, STANDAARD_VOORKEUR, type Uiterlijkvoorkeur } from './voorkeur';

/**
 * De uiterlijkvoorkeur als React-toestand — QS8-731.
 *
 * ⚠️ **Eerst lokaal, dan de account, en de gebruiker wacht op geen van beide.** De eerste render gebruikt de
 *    lokale kopie (`leesLokaleStart`, nooit het netwerk); zodra er een sessie is, verzoent `useKoppelUiterlijk`
 *    met de account. Een account die niet bereikbaar is — vandaag ook omdat migratie 0303 nog niet op productie
 *    staat — laat de lokale keuze gelden en is geen crash.
 *
 * ⚠️ **Een verzoening die later terugkomt dan een keuze van de gebruiker, verliest.** Zonder die rem zet een
 *    trage accountlezing de zojuist gekozen stijl terug naar die van gisteren.
 *
 * ⚠️ **Zonder gebruiker is er geen lokale kopie.** De kopie draagt een `userId` (een onverzonden keuze van A
 *    gaat nooit naar de account van B), dus voor het aanmelden geldt een keuze alleen in het geheugen. Het scherm
 *    staat in Profiel en heeft altijd een gebruiker.
 */

export type OpslagStand = 'rustig' | 'alleen-lokaal';

interface UiterlijkWaarde {
  readonly voorkeur: Uiterlijkvoorkeur;
  /** Is de lokale kopie gelezen? Tot dan geldt de standaard. */
  readonly ready: boolean;
  /** `alleen-lokaal`: de laatste keuze kwam niet op de account aan; de volgende start probeert het opnieuw. */
  readonly opslag: OpslagStand;
  /** Verandert een of meer onderdelen; het uiterlijk volgt direct. */
  readonly kies: (wijziging: Partial<Uiterlijkvoorkeur>) => void;
  readonly koppelGebruiker: (userId: string | null) => void;
}

const UiterlijkContext = createContext<UiterlijkWaarde | undefined>(undefined);

interface Toestand {
  readonly voorkeur: Uiterlijkvoorkeur;
  readonly zet: (v: Uiterlijkvoorkeur) => void;
  /** Past een wijziging toe op de actuele stand en telt haar als keuze van de gebruiker. */
  readonly kiesNu: (wijziging: Partial<Uiterlijkvoorkeur>) => Uiterlijkvoorkeur;
  /** Hoeveel keuzes de gebruiker tot nu toe maakte; een lezing die over een keuze heen komt, verliest. */
  readonly aantalKeuzes: () => number;
}

function useToestand(): Toestand {
  const [voorkeur, setVoorkeur] = useState<Uiterlijkvoorkeur>(STANDAARD_VOORKEUR);
  const actueelRef = useRef(voorkeur);
  const tellerRef = useRef(0);
  const zet = useCallback((v: Uiterlijkvoorkeur) => {
    actueelRef.current = v;
    setVoorkeur(v);
  }, []);
  const kiesNu = useCallback(
    (wijziging: Partial<Uiterlijkvoorkeur>) => {
      const volgende = normaliseerVoorkeur({ ...actueelRef.current, ...wijziging });
      tellerRef.current += 1;
      zet(volgende);
      return volgende;
    },
    [zet],
  );
  const aantalKeuzes = useCallback(() => tellerRef.current, []);
  return { voorkeur, zet, kiesNu, aantalKeuzes };
}

/**
 * De lokale lezing bij de start, en daarna de verzoening met de account zodra er een gebruiker is.
 *
 * ⚠️ **Eén effect met één vlag**: de twee zijn één keten (eerst lokaal, dan account) en horen niet los te
 *    kunnen annuleren. Een keuze van de gebruiker die tussendoor komt, wint van beide uitslagen; `ready`
 *    wordt pas waar als de lokale lezing gelukt of mislukt is, ook als de verzoening nog loopt.
 */
function useLezingEnVerzoening({ zet, aantalKeuzes }: Toestand, userId: string | null): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let levend = true;
    const teller = aantalKeuzes();
    loopKeten({
      userId,
      leesStart: leesLokaleStart,
      verzoen: verzoenMetAccount,
      zet,
      nogGeldig: () => levend && aantalKeuzes() === teller,
      levend: () => levend,
      klaar: () => setReady(true),
    }).catch(() => console.warn('Uiterlijkvoorkeur kon niet gelezen of verzoend worden.'));
    return () => {
      levend = false;
    };
  }, [userId, zet, aantalKeuzes]);
  return ready;
}

export function UiterlijkProvider({ children }: { readonly children: React.ReactNode }) {
  const toestand = useToestand();
  const [opslag, setOpslag] = useState<OpslagStand>('rustig');
  const [userId, setUserId] = useState<string | null>(null);
  const ready = useLezingEnVerzoening(toestand, userId);
  const { voorkeur, kiesNu } = toestand;

  const kies = useCallback(
    (wijziging: Partial<Uiterlijkvoorkeur>) => {
      const volgende = kiesNu(wijziging);
      if (userId === null) return;
      kiesVoorkeur(userId, volgende)
        .then((uitkomst) => setOpslag(uitkomst.opgeslagen ? 'rustig' : 'alleen-lokaal'))
        .catch(() => setOpslag('alleen-lokaal'));
    },
    [userId, kiesNu],
  );

  const waarde = useMemo<UiterlijkWaarde>(
    () => ({ voorkeur, ready, opslag, kies, koppelGebruiker: setUserId }),
    [voorkeur, ready, opslag, kies],
  );

  return (
    <UiterlijkContext.Provider value={waarde}>
      <ThemeProvider keuze={voorkeur}>{children}</ThemeProvider>
    </UiterlijkContext.Provider>
  );
}

/** De voorkeur en haar schakelaars. Vraagt een provider: een schakelaar zonder aansluiting hoort stuk te gaan. */
export function useUiterlijk(): Omit<UiterlijkWaarde, 'koppelGebruiker'> {
  const waarde = useContext(UiterlijkContext);
  if (!waarde) throw new Error('useUiterlijk() vraagt een <UiterlijkProvider> erboven.');
  const { voorkeur, ready, opslag, kies } = waarde;
  return { voorkeur, ready, opslag, kies };
}

/** Meldt de ingelogde gebruiker aan de provider; `null` zonder sessie. Eén keer, in de wortel van de app. */
export function useKoppelUiterlijk(userId: string | null): void {
  const waarde = useContext(UiterlijkContext);
  const koppel = waarde?.koppelGebruiker;
  useEffect(() => {
    koppel?.(userId);
  }, [koppel, userId]);
}
