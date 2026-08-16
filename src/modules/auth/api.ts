import { Platform } from 'react-native';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

import {
  aanmeldenSchema,
  inloggenSchema,
  type AanmeldenInvoer,
  type InloggenInvoer,
} from './schemas';

/**
 * Aanmelden, inloggen en uitloggen.
 *
 * ⚠️ Geen enkele functie hier gooit. Ze geven een `Uitkomst` terug met een
 *    Nederlandse melding. Reden: een onbehandelde fout in een inlogscherm is een
 *    wit scherm, en een wit scherm bij het inloggen is het einde van die
 *    gebruiker. Een formulier hoort te vertellen wat er mis is.
 */

export type Uitkomst = { ok: true } | { ok: false; melding: string; veld?: 'email' | 'wachtwoord' };

/**
 * Supabase antwoordt in het Engels en soms met details die je niet wilt tonen.
 * Deze vertaling is dus geen cosmetica maar ook een filter.
 *
 * ⚠️ De onbekende gevallen krijgen bewust een vage melding. Een letterlijke
 *    doorgifte kan de waarde bevatten die een constraint brak — bij Postgres
 *    staat die in de tekst.
 */
function vertaal(melding: string): { melding: string; veld?: 'email' | 'wachtwoord' } {
  const m = melding.toLowerCase();

  if (m.includes('invalid login credentials')) {
    // ⚠️ Eén melding voor "onbekend adres" én "verkeerd wachtwoord". Twee aparte
    //    meldingen vertellen een aanvaller welke adressen een account hebben.
    return { melding: 'Dit e-mailadres en wachtwoord horen niet bij elkaar.' };
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return { melding: 'Er bestaat al een account met dit adres. Log in of herstel je wachtwoord.', veld: 'email' };
  }
  if (m.includes('email not confirmed')) {
    return { melding: 'Bevestig eerst je e-mailadres. Check je inbox.', veld: 'email' };
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return { melding: 'Te veel pogingen. Wacht even en probeer het opnieuw.' };
  }
  if (m.includes('password')) {
    return { melding: 'Dit wachtwoord voldoet niet. Gebruik een langere zin.', veld: 'wachtwoord' };
  }
  if (m.includes('network') || m.includes('fetch')) {
    return { melding: 'Geen verbinding. Controleer je internet en probeer opnieuw.' };
  }
  return { melding: 'Er ging iets mis. Probeer het opnieuw.' };
}

export async function signUpWithEmail(invoer: AanmeldenInvoer): Promise<Uitkomst> {
  const gevalideerd = aanmeldenSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    const eerste = gevalideerd.error.issues[0];
    return {
      ok: false,
      melding: eerste?.message ?? 'Controleer je invoer.',
      ...(eerste?.path[0] === 'email' ? { veld: 'email' as const } : {}),
      ...(eerste?.path[0] === 'wachtwoord' ? { veld: 'wachtwoord' as const } : {}),
    };
  }

  const { error } = await supabase().auth.signUp({
    email: gevalideerd.data.email,
    password: gevalideerd.data.wachtwoord,
  });

  if (error) {
    reportError(error, 'auth.signUp', { code: error.code ?? 'onbekend' });
    return { ok: false, ...vertaal(error.message) };
  }

  // Het profiel wordt niet hier aangemaakt maar door de trigger
  // `handle_new_user` op `auth.users` (migratie 0002). Dat is met opzet: een
  // account zonder profiel mag niet kunnen bestaan, ook niet als de client
  // halverwege wegvalt.
  return { ok: true };
}

export async function signInWithEmail(invoer: InloggenInvoer): Promise<Uitkomst> {
  const gevalideerd = inloggenSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
  }

  const { error } = await supabase().auth.signInWithPassword({
    email: gevalideerd.data.email,
    password: gevalideerd.data.wachtwoord,
  });

  if (error) {
    reportError(error, 'auth.signIn', { code: error.code ?? 'onbekend' });
    return { ok: false, ...vertaal(error.message) };
  }

  return { ok: true };
}

export async function signOut(): Promise<Uitkomst> {
  const { error } = await supabase().auth.signOut();
  if (error) {
    reportError(error, 'auth.signOut', { code: error.code ?? 'onbekend' });
    return { ok: false, melding: 'Uitloggen lukte niet. Probeer het opnieuw.' };
  }
  return { ok: true };
}

export type OAuthProvider = 'apple' | 'google';

/**
 * Inloggen met Apple of Google.
 *
 * ⚠️ Werkt op dit moment alleen op web, en alleen als de provider in het
 *    Supabase-dashboard aanstaat. Op native heeft dit `expo-web-browser` en
 *    `expo-auth-session` nodig — dat zijn dependencies, en die keuze ligt bij
 *    Quinten (CLAUDE.md). Zie docs/Q-TODO.docx.
 *
 *    Het geeft daarom een nette melding terug in plaats van een halve
 *    inlogpoging die stilvalt op een leeg scherm.
 */
export async function signInWithOAuth(provider: OAuthProvider): Promise<Uitkomst> {
  if (Platform.OS !== 'web') {
    return {
      ok: false,
      melding: 'Inloggen met Apple of Google werkt nu alleen in de browser. Gebruik voorlopig je e-mailadres.',
    };
  }

  const { error } = await supabase().auth.signInWithOAuth({ provider });

  if (error) {
    reportError(error, 'auth.oauth', { name: provider, code: error.code ?? 'onbekend' });
    return { ok: false, melding: 'Inloggen via deze aanbieder lukte niet. Probeer je e-mailadres.' };
  }

  return { ok: true };
}
