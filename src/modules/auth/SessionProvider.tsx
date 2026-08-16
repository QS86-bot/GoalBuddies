import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

/**
 * Wie is er ingelogd. Eén bron van waarheid voor de hele app.
 *
 * ⚠️ `loading` is geen detail. Bij het opstarten is er heel even geen sessie
 *    terwijl er misschien wél een is — die staat nog in AsyncStorage of
 *    localStorage. Kijkt een routewacht in dat moment naar `session`, dan gooit
 *    hij een ingelogde gebruiker bij elke koude start terug naar het inlogscherm.
 */

interface SessionContextWaarde {
  readonly session: Session | null;
  readonly userId: string | null;
  readonly loading: boolean;
}

const SessionContext = createContext<SessionContextWaarde>({
  session: null,
  userId: null,
  loading: true,
});

export function SessionProvider({ children }: { readonly children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let levend = true;

    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (levend) setSession(data.session);
      })
      .catch((fout: unknown) => {
        reportError(fout, 'auth.getSession');
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    // Vangt inloggen, uitloggen, tokenvernieuwing én de OAuth-callback op web op.
    const { data: abonnement } = supabase().auth.onAuthStateChange((_gebeurtenis, nieuw) => {
      setSession(nieuw);
      setLoading(false);
    });

    return () => {
      levend = false;
      abonnement.subscription.unsubscribe();
    };
  }, []);

  const waarde = useMemo<SessionContextWaarde>(
    () => ({ session, userId: session?.user.id ?? null, loading }),
    [session, loading],
  );

  return <SessionContext.Provider value={waarde}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextWaarde {
  return useContext(SessionContext);
}

/**
 * De id van de ingelogde gebruiker, of een fout.
 *
 * Voor code die zonder gebruiker niets te doen heeft. Beter hier stukgaan dan
 * verderop een query bouwen met `undefined` erin — die levert namelijk gewoon
 * nul rijen op, en dan zoek je een uur naar een lege lijst.
 */
export function useRequiredUserId(): string {
  const { userId, loading } = useSession();
  if (loading) throw new Error('useRequiredUserId() aangeroepen terwijl de sessie nog laadt.');
  if (!userId) throw new Error('useRequiredUserId() aangeroepen zonder ingelogde gebruiker.');
  return userId;
}
