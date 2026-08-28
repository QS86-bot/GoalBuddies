import { t } from '../../shared/i18n';

import type { Tables, TablesUpdate } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { type UserClock, type Weekday } from '../../shared/time';

import { tekenAvatars } from './avatar';
import { profielPatchSchema, type ProfielPatch } from './schemas';
import { invoerfout } from '../../shared/api';

/**
 * Het profiel: naam, avatar, tijdzone, week-startdag en herinneringen.
 *
 * ⚠️ Dit bestand levert ook `userClock()`. Dat is de enige plek waar een
 *    profielrij verandert in de klok die `shared/time` verwacht — zodat nergens
 *    anders in de app iemand `weekStartDay` uit een losse kolom vist en er zelf
 *    iets mee gaat rekenen (CLAUDE.md, correctheidsregel 7).
 */

export type Profiel = Tables<'profiles'>;

/**
 * Je eigen profiel.
 *
 * ⚠️ **Leest `mijn_profiel` en niet `profiles`, en dat is geen smaak.** Migratie
 *    0089 trok `reminder_time`, `reminder_enabled` en `reminder_tone` in voor de
 *    rol `authenticated`: `profiles_select` geeft groepsgenoten de héle rij en
 *    RLS kan geen kolommen beperken, dus elke buddy kon je dagritme uitlezen. Een
 *    grant kent geen rijen, dus die intrekking trof ook jou — vandaar de view,
 *    die met de rechten van zijn eigenaar draait en precies jouw rij teruggeeft.
 *
 * ⚠️ `userId` blijft in de handtekening staan omdat de aanroeper hem toch heeft en
 *    het de bedoeling expliciet maakt. De view filtert zelf op `auth.uid()`, dus
 *    een andere id meegeven levert niets op in plaats van andermans profiel.
 *
 * ⚠️ **De cast, en waarom hij hier mag.** De gegenereerde typen maken elke kolom
 *    van een view nullable: Postgres draagt `not null` niet door een view heen, dus
 *    dat is een artefact van de typegeneratie en niet van de gegevens. De view is
 *    letterlijk `select p.* from profiles p where p.id = auth.uid()`, dus wat er
 *    uitkomt is één rij van `profiles` met precies dezelfde garanties.
 *
 *    Blijft dat zo? Ja, want het staat onder test: `policies.test.ts` toetst dat
 *    de view precies één rij geeft en die van de aanroeper is. Wordt de view ooit
 *    een projectie in plaats van `p.*`, dan is deze cast fout — en dan hoort
 *    `Profiel` mee te veranderen. Zet dat in de kop van die migratie.
 */
export async function fetchProfiel(userId: string): Promise<Profiel | null> {
  const { data, error } = await supabase()
    .from('mijn_profiel')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    reportError(error, 'profile.fetch', { user_id: userId, code: error.code });
    throw new Error(t('profiel.laden_mislukt'));
  }

  if (data === null) return null;

  // ⚠️ **Het pad wordt hier getekend en niet in het scherm.** Sinds migratie 0124
  //    is de avatar-bucket privé en draagt `avatar_url` een pád; een `<Image>` kan
  //    daar niets mee. Dat tekenen hoort in de datalaag, precies zoals bij de
  //    chat, het groepsoverzicht en de beoordelingswachtrij — anders is er één
  //    scherm dat het vergeet en dan is het een leeg vlak zonder foutmelding.
  //
  //    Wat hier terugkomt is dus een URL die na een uur verloopt. Wie het pád
  //    nodig heeft om iets te verwijderen, leest het opnieuw uit `profiles`
  //    (`verwijderAvatar` doet dat) en niet uit dit object.
  const profiel = data as Profiel;
  if (profiel.avatar_url === null) return profiel;

  const getekend = await tekenAvatars([profiel.avatar_url]);
  return { ...profiel, avatar_url: getekend.get(profiel.avatar_url) ?? null };
}

export type ProfielUitkomst = { ok: true; profiel: Profiel } | { ok: false; melding: string };

export async function updateProfiel(
  userId: string,
  patch: ProfielPatch,
): Promise<ProfielUitkomst> {
  const gevalideerd = profielPatchSchema.safeParse(patch);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('auth.fout.invoer')) };
  }

  // ⚠️ Veld voor veld, en niet `update(gevalideerd.data)`. Zod maakt van een
  //    optioneel veld `string | undefined`, en met `exactOptionalPropertyTypes`
  //    is dat iets anders dan "afwezig". Zou je het toch doorgeven, dan schrijft
  //    PostgREST `null` in kolommen die de gebruiker niet eens heeft aangeraakt.
  const velden = gevalideerd.data;
  const update: TablesUpdate<'profiles'> = {};
  if (velden.display_name !== undefined) update.display_name = velden.display_name;
  if (velden.week_start_day !== undefined) update.week_start_day = velden.week_start_day;
  if (velden.tz !== undefined) update.tz = velden.tz;
  if (velden.reminder_time !== undefined) update.reminder_time = velden.reminder_time;
  if (velden.reminder_enabled !== undefined) update.reminder_enabled = velden.reminder_enabled;
  if (velden.reminder_tone !== undefined) update.reminder_tone = velden.reminder_tone;
  if (velden.share_moves_by_default !== undefined) {
    update.share_moves_by_default = velden.share_moves_by_default;
  }
  if (velden.locale !== undefined) update.locale = velden.locale;

  // ⚠️ **`select('id')` en niet `select('*')`, en dat is geen zuinigheid.**
  //    Migratie 0089 trok de tabelbrede SELECT op `profiles` in: `authenticated`
  //    mag nog maar `id`, `display_name` en `avatar_url` lezen. Een `returning *`
  //    vraagt leesrecht op élke kolom, dus deze schrijfactie viel om met 42501 —
  //    "permission denied for table profiles" — en daarmee élke profielinstelling:
  //    tijdzone, week-startdag, herinneringen, taal.
  //
  //    Het opnieuw lezen gaat via `fetchProfiel()`, dat `mijn_profiel` gebruikt.
  //    Die view draait met de rechten van zijn eigenaar en geeft precies jouw rij.
  const { data, error } = await supabase()
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select('id')
    .single();

  if (error) {
    reportError(error, 'profile.update', { user_id: userId, code: error.code });
    return { ok: false, melding: t('profiel.opslaan_mislukt') };
  }

  const profiel = await teruglezen(data.id);
  if (profiel === null) return { ok: false, melding: t('profiel.opslaan_mislukt') };

  return { ok: true, profiel };
}

/**
 * Leest het zojuist geschreven profiel terug.
 *
 * ⚠️ Een tweede rondje, en dat is de prijs van de kolomgrant uit 0089. Faalt het
 *    lezen, dan is er wél geschreven — vandaar dat de melding hetzelfde is en de
 *    fout gerapporteerd wordt, in plaats van dat er een half profiel teruggaat.
 */
async function teruglezen(userId: string): Promise<Profiel | null> {
  try {
    return await fetchProfiel(userId);
  } catch (fout) {
    reportError(fout, 'profile.reread', { user_id: userId });
    return null;
  }
}

/**
 * Rondt de onboarding af.
 *
 * ⚠️ Een aparte schrijfactie, ná het opslaan van de profielvelden. Wie halverwege
 *    wegklikt, komt de volgende keer gewoon weer op het onboardingscherm — en
 *    niet in een app waarvan de helft nog niet is ingevuld.
 *
 * ⚠️ `onboarded_at` komt van de databaseklok en niet van het toestel. Een
 *    verkeerd gezette telefoonklok mag geen tijdstempel opleveren waar later een
 *    cyclusberekening op leunt (CLAUDE.md, correctheidsregel 7).
 */
export async function rondOnboardingAf(
  userId: string,
  wantsOwnGoal: boolean,
): Promise<ProfielUitkomst> {
  // ⚠️ Zelfde reden als in `updateProfiel()`: `select('*')` viel om op de
  //    kolomgrant van 0089, en dan kon niemand de onboarding afronden.
  const { data, error } = await supabase()
    .from('profiles')
    .update({ onboarded_at: 'now', wants_own_goal: wantsOwnGoal })
    .eq('id', userId)
    .select('id')
    .single();

  if (error) {
    reportError(error, 'profile.onboarded', { user_id: userId, code: error.code });
    return { ok: false, melding: t('profiel.opslaan_mislukt') };
  }

  const profiel = await teruglezen(data.id);
  if (profiel === null) return { ok: false, melding: t('profiel.opslaan_mislukt') };

  return { ok: true, profiel };
}

/** Heeft deze gebruiker de onboarding gehad? */
export function isOnboarded(profiel: Profiel | null): boolean {
  return profiel?.onboarded_at != null;
}

/**
 * De persoonlijke klok van een gebruiker, klaar voor `userCycle()`.
 *
 * ⚠️ Klok 1 van de twee. Deze bepaalt wanneer weekdoelen resetten en wanneer
 *    punten tellen. De huddledag van een groep is een ándere klok en komt uit
 *    de module `buddies` — haal ze nooit door elkaar.
 */
export function userClock(profiel: Pick<Profiel, 'week_start_day' | 'tz'>): UserClock {
  return {
    weekStartDay: profiel.week_start_day as Weekday,
    tz: profiel.tz,
  };
}

