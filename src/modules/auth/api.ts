import { Platform } from 'react-native';

import { t } from '../../shared/i18n';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { invoerfout } from '../../shared/api';

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
    return { melding: t('auth.fout.ongeldig') };
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return { melding: t('auth.fout.bestaat_al'), veld: 'email' };
  }
  if (m.includes('email not confirmed')) {
    return { melding: t('auth.fout.niet_bevestigd'), veld: 'email' };
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return { melding: t('auth.fout.te_vaak') };
  }
  if (m.includes('password')) {
    return { melding: t('auth.fout.zwak_wachtwoord'), veld: 'wachtwoord' };
  }
  if (m.includes('network') || m.includes('fetch')) {
    return { melding: t('auth.fout.geen_verbinding') };
  }
  return { melding: t('auth.fout.algemeen') };
}

export async function signUpWithEmail(invoer: AanmeldenInvoer): Promise<Uitkomst> {
  const gevalideerd = aanmeldenSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    const eerste = gevalideerd.error.issues[0];
    return {
      ok: false,
      melding: eerste?.message ?? t('auth.fout.invoer'),
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
    return { ok: false, melding: invoerfout(gevalideerd.error, t('auth.fout.invoer')) };
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
    return { ok: false, melding: t('auth.fout.uitloggen') };
  }
  return { ok: true };
}

/**
 * ⚠️ **Een functie en geen constante** — QS8-115. Een `const` met `t()` erin
 *    wordt één keer bij het importeren opgebouwd, en dat is vóórdat het profiel
 *    geladen is. De taal staat dan vast op de apparaattaal, ook nadat de
 *    gebruiker een andere heeft gekozen. Zelfde val als bij `BEVESTIGING` in
 *    `shared/ui`, en de reden dat elke meldingentabel in dit project een functie
 *    hoort te zijn.
 */
function verwijderMelding(reden: string | undefined): string {
  const tabel: Readonly<Record<string, string>> = {
    not_signed_in: t('auth.verwijder.verlopen'),
    last_admin: t('auth.verwijder.enige_beheerder'),
  };

  return tabel[reden ?? ''] ?? t('auth.verwijder.mislukt_kort');
}

/**
 * Verwijdert het eigen account — Q-TODO A3, en een AVG-verplichting.
 *
 * ⚠️ Onomkeerbaar. De bevestiging hoort in het scherm, niet hier en niet in de
 *    database: alleen het scherm weet of de gebruiker begrepen heeft wat hij
 *    weggooit.
 *
 * ⚠️ Wat er gebeurt, volgens het besluit "cascade voor je eigen data, maar
 *    anonimiseren bij goedkeuringen" (migratie 0031):
 *
 *      * weg: je doelen, weekdoelen, voltooiingen, Dagzetten, weekafsluitingen,
 *        punten, reeksen, kettingschakels en lidmaatschappen;
 *      * blijft staan zonder je naam: goedkeuringen die jij aan een ander gaf,
 *        en je chatberichten. Die zijn bewijs en gesprek voor iemand anders, en
 *        die raakt hij niet kwijt omdat jij vertrekt.
 *
 * ⚠️ Na afloop is de sessie waardeloos: het account bestaat niet meer. Uitloggen
 *    hoort er daarom direct achteraan, anders blijft het scherm hangen op een
 *    token dat overal een 401 oplevert.
 */
export async function verwijderMijnAccount(): Promise<Uitkomst> {
  const { data, error } = await supabase().rpc('verwijder_mijn_account');

  if (error) {
    reportError(error, 'auth.deleteAccount', { code: error.code ?? 'onbekend' });
    return { ok: false, melding: t('auth.verwijder.mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };

  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding: verwijderMelding(uitkomst.reason),
    };
  }

  // ⚠️ De fout wordt hier bewust geslikt. Het account ís weg; melden dat
  //    uitloggen niet lukte, suggereert dat de verwijdering mislukt is.
  await supabase().auth.signOut();

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
      melding: t('auth.oauth.alleen_browser'),
    };
  }

  const { error } = await supabase().auth.signInWithOAuth({ provider });

  if (error) {
    reportError(error, 'auth.oauth', { name: provider, code: error.code ?? 'onbekend' });
    return { ok: false, melding: t('auth.oauth.mislukt') };
  }

  return { ok: true };
}
