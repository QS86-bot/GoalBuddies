import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

/**
 * Het pushtoken van dit apparaat — EPIC 11, QS8-91.
 *
 * ⚠️ **`expo-notifications` is nog niet toegevoegd**, en dat is een dependency
 *    die volgens `CLAUDE.md` eerst Quintens toestemming vraagt (Q-TODO B4).
 *    Zolang die er niet is, kan de app geen token ophalen en blijft
 *    `push_tokens` leeg — de hele keten erachter is gebouwd, getest en
 *    gedeployd, maar er gaat niets uit.
 *
 *    Dit bestand is de rand eromheen, in dezelfde vorm als `reportError` voor
 *    Sentry (Q-TODO B1): één aanroeppunt en één interface. Toestemming krijgen
 *    betekent één implementatie van `PushBron` schrijven en hem hier
 *    inpluggen — geen wijziging in schermen, in de datalaag of in de Edge
 *    Function.
 *
 * ⚠️ Het token is geen geheim maar wel een identificator van een apparaat. Het
 *    hoort daarom niet in logboeken; `reportError` krijgt hieronder alleen de
 *    foutcode mee en nooit de token zelf.
 */

export type Platform = 'ios' | 'android' | 'web';

/**
 * Waar een pushtoken vandaan komt.
 *
 * De echte implementatie vraagt toestemming aan de gebruiker en haalt daarna een
 * Expo-pushtoken op. Zolang die er niet is, geeft `geenPush` netjes `null` —
 * dan slaat `registreerPushToken()` over en gaat er verder niets stuk.
 */
/**
 * Wat een bron over dit apparaat weet.
 *
 * ⚠️ `p256dh` en `auth` horen bij web en alléén bij web. Ze komen uit
 *    `PushSubscription.getKey()` en zijn nodig om een bericht te versleutelen
 *    (RFC 8291) — zonder die twee kun je een browser niets sturen. De database
 *    dwingt dat sinds migratie 0062 af met een CHECK, en sinds 0067 weigert
 *    `registreer_push_token()` een webregistratie zonder sleutels netjes in
 *    plaats van met een ruwe Postgres-fout.
 */
export interface PushBron {
  /** Het token van dit apparaat, of `null` als er geen te krijgen is. */
  haalToken(): Promise<{
    token: string;
    platform: Platform;
    /** Alleen bij `platform === 'web'`. */
    p256dh?: string;
    /** Alleen bij `platform === 'web'`. */
    auth?: string;
  } | null>;
}

/**
 * De bron zolang er geen `expo-notifications` is.
 *
 * ⚠️ Geeft `null` en gooit niet. Een app die bij het opstarten omvalt omdat er
 *    geen pushbibliotheek is, is erger dan een app zonder meldingen.
 */
export const geenPush: PushBron = {
  haalToken: () => Promise.resolve(null),
};

let bron: PushBron = geenPush;

/** Zet de echte bron zodra `expo-notifications` er is. Eén aanroep, in `_layout`. */
export function zetPushBron(nieuw: PushBron): void {
  bron = nieuw;
}

/**
 * Registreert het token van dit apparaat op de ingelogde gebruiker.
 *
 * ⚠️ Bij elke start opnieuw, en dat is geen verspilling. `push_tokens.token` is
 *    uniek: wie zich het laatst registreert, krijgt het token op zijn naam. Dat
 *    is precies wat je wilt op een gedeeld apparaat — zonder dit blijft de
 *    vorige gebruiker meldingen krijgen op een telefoon waar hij niet meer op
 *    zit.
 *
 * ⚠️ Faalt stil op het scherm en luid in de logboeken. Geen enkel scherm hangt
 *    hiervan af, en een foutmelding over pushtokens bij het opstarten is voor de
 *    gebruiker betekenisloos.
 */
export async function registreerPushToken(userId: string): Promise<void> {
  void userId;

  const gevonden = await bron.haalToken();
  if (gevonden === null) return;

  // ⚠️ Via een RPC en niet via een upsert, en dat is een correctie op de eerste
  //    opzet — een test haalde hem eruit. De client had insert- en
  //    updaterechten met `user_id = auth.uid()`, en daardoor kón de nieuwe
  //    gebruiker van een gedeeld apparaat de rij van de vorige niet overnemen:
  //    zijn upsert liep op 42501 stuk. Gevolg: de vórige gebruiker bleef
  //    meldingen krijgen op een telefoon die nu bij iemand anders lag, en de
  //    nieuwe kreeg niets, zonder enig signaal. `registreer_push_token()`
  //    (migratie 0055) doet de overname in één begrensde handeling.
  // ⚠️ **De twee websleutels gaan samen mee of allebei niet.** Dat is geen
  //    stijlkeuze: `push_tokens_websleutels` (migratie 0062) is een CHECK op het
  //    páár — `(platform = 'web') = (p256dh is not null and auth is not null)` —
  //    en `registreer_push_token()` weigert sinds 0067 een webregistratie met
  //    maar één van de twee. Een object bouwen waarin er precies één kan
  //    ontbreken, zou die regel op deze plek opnieuw uitvinden.
  //
  // ⚠️ Hier stond `?? null` bij allebei, met als reden dat een ontbrekende
  //    sleutel afhangt van hoe de serializer met `undefined` omgaat. Dat argument
  //    klopt nog steeds, en deze vorm heeft het niet meer nodig: de sleutels
  //    staan er wél of ze staan er niet, en in het tweede geval doet de
  //    `default null` van de functie precies wat er bedoeld is.
  const websleutels =
    gevonden.p256dh !== undefined && gevonden.auth !== undefined
      ? { p_p256dh: gevonden.p256dh, p_auth: gevonden.auth }
      : {};

  const { data, error } = await supabase().rpc('registreer_push_token', {
    p_token: gevonden.token,
    p_platform: gevonden.platform,
    ...websleutels,
  });

  if (error) {
    reportError(error, 'push.register', { code: error.code });
    return;
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    // ⚠️ De token zelf gaat níét mee de logboeken in. Hij is geen geheim, maar
    //    hij is wel het adres van een apparaat.
    reportError(new Error(`pushtoken registreren geweigerd: ${uitkomst.reason ?? 'onbekend'}`), 'push.register', {});
  }
}

/**
 * Haalt het token van dit apparaat weg. Hoort bij uitloggen.
 *
 * ⚠️ Zonder dit blijft een gedeeld apparaat meldingen krijgen voor iemand die
 *    er niet meer op zit — en die meldingen kunnen over zijn week gaan. Dat is
 *    geen datalek via de database maar wel via het vergrendelscherm.
 */
export async function verwijderPushToken(): Promise<void> {
  const gevonden = await bron.haalToken();
  if (gevonden === null) return;

  const { error } = await supabase().from('push_tokens').delete().eq('token', gevonden.token);

  if (error) reportError(error, 'push.unregister', { code: error.code });
}
