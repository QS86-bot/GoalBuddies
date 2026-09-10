import { t } from '../../shared/i18n';

import type { Tables, TablesUpdate } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { now, userCycle, type UserClock, type Weekday } from '../../shared/time';

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
 *    geschreven als `select p.* from profiles p where p.id = auth.uid()`, dus wat
 *    er uitkomt is één rij van `profiles` met precies dezelfde garanties.
 *
 *    Blijft dat zo? De rij-garantie wel: `policies.test.ts` toetst dat de view
 *    precies één rij geeft en die van de aanroeper is.
 *
 * ⚠️⚠️ **Maar de kolóm-garantie hangt aan een migratie, en hier stond dat fout.**
 *    Er stond dat deze cast pas fout wordt "wordt de view ooit een projectie in
 *    plaats van `p.*`". Hij ís al een projectie: Postgres expandeert de ster bij
 *    het aanmaken tot een vaste kolomlijst. 📏 Nagemeten op 10-09-2026 met
 *    `pg_get_viewdef()` — achttien kolommen uitgeschreven, terwijl `profiles` er
 *    toen al meer had kunnen hebben.
 *
 *    Gevolg voor wie hierna een kolom toevoegt: **zet `mijn_profiel` opnieuw in
 *    diezelfde migratie**, anders belooft deze cast een waarde waar `undefined`
 *    staat en wordt er niets rood van. Dat bewaakt
 *    `tests/rls/mijn-profiel-is-volledig.test.ts` — als regel en niet als lijst
 *    kolomnamen, dus hij vuurt ook bij de vólgende kolom. Zie QS8-92.
 */
export async function fetchProfiel(userId: string): Promise<Profiel | null> {
  const { data, error } = await supabase()
    .from('mijn_profiel')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    reportError(error, 'profile.fetch', { user_id: userId });
    throw new Error(t('profiel.laden_mislukt'));
  }

  if (data === null) return null;

  // ⚠️ **Het pad wordt hier getekend en niet in het scherm.** Sinds migratie 0126
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

/**
 * De gevalideerde patch omzetten naar de kolommen die PostgREST krijgt.
 *
 * ⚠️ **Veld voor veld, en niet `update(gevalideerd.data)`.** Zod maakt van een
 *    optioneel veld `string | undefined`, en met `exactOptionalPropertyTypes` is
 *    dat iets anders dan "afwezig". Zou je het toch doorgeven, dan schrijft
 *    PostgREST `null` in kolommen die de gebruiker niet eens heeft aangeraakt.
 *
 * ⚠️ **Staat los sinds QS8-92, en niet uit netheid.** Met de vier schakelaars
 *    erbij liep `updateProfiel()` over de vijftig regels van coderegel 15. Deze
 *    functie is bovendien de plek waar een vergeten veld zich verstopt: staat een
 *    kolom hier niet, dan valt hij stil uit elke patch. Zie de aantekening bij de
 *    `notify_*`-velden.
 */
function naarKolommen(velden: ProfielPatch): TablesUpdate<'profiles'> {
  const update: TablesUpdate<'profiles'> = {};
  if (velden.display_name !== undefined) update.display_name = velden.display_name;
  if (velden.tz !== undefined) update.tz = velden.tz;
  if (velden.reminder_time !== undefined) update.reminder_time = velden.reminder_time;
  if (velden.reminder_enabled !== undefined) update.reminder_enabled = velden.reminder_enabled;
  if (velden.reminder_tone !== undefined) update.reminder_tone = velden.reminder_tone;
  if (velden.share_moves_by_default !== undefined) {
    update.share_moves_by_default = velden.share_moves_by_default;
  }
  if (velden.locale !== undefined) update.locale = velden.locale;

  // De vier schakelaars per meldingsoort — QS8-92. Zelfde regel als hierboven.
  //
  // ⚠️ **Deze vier stonden er eerst niet, en dat was stil.** `meldingsoortVelden()`
  //    leverde het veld netjes aan en `profielPatchSchema` liet het door, maar
  //    zonder een regel hier viel het uit de patch — en dan bleef `update` leeg,
  //    nam de "niets gewijzigd"-tak het over, en meldde het scherm succes terwijl
  //    er niets veranderde. Geen foutmelding, geen rode test. 📏 Gevonden door
  //    `npm run kolomrechten:controle`: vier UPDATE-grants "die niets gebruikt".
  if (velden.notify_approval_request !== undefined) {
    update.notify_approval_request = velden.notify_approval_request;
  }
  if (velden.notify_approval_received !== undefined) {
    update.notify_approval_received = velden.notify_approval_received;
  }
  if (velden.notify_cycle_summary !== undefined) {
    update.notify_cycle_summary = velden.notify_cycle_summary;
  }
  if (velden.notify_commitment_witness !== undefined) {
    update.notify_commitment_witness = velden.notify_commitment_witness;
  }

  // Het stille venster — QS8-406. Zelfde regel: alleen wat er echt in de patch
  // zit, want een `undefined` zou hier `null` schrijven — en `null` is hier een
  // betekenisvolle waarde ("geen stille uren"), geen leegte.
  if (velden.quiet_from !== undefined) update.quiet_from = velden.quiet_from;
  if (velden.quiet_to !== undefined) update.quiet_to = velden.quiet_to;

  // De vier uit de vragenlijst — QS8-257. Zelfde regel als hierboven: alleen wat
  // er echt in de patch zit, want een `undefined` zou hier `null` schrijven.
  if (velden.focus_areas !== undefined) update.focus_areas = [...velden.focus_areas];
  if (velden.minutes_per_day !== undefined) update.minutes_per_day = velden.minutes_per_day;
  if (velden.when_i_do_it !== undefined) update.when_i_do_it = velden.when_i_do_it;
  if (velden.what_breaks_it !== undefined) update.what_breaks_it = [...velden.what_breaks_it];

  return update;
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

  const update = naarKolommen(gevalideerd.data);

  // ⚠️ **Een lege patch is een geldige patch, en hij mag het net niet halen.**
  //    `patchUitVragenlijst()` geeft met opzet `{}` terug als de gebruiker alle
  //    vier de vragen overslaat — dat is de regel die voorkomt dat overslaan
  //    bestaande antwoorden wist (acceptatiecriterium 4 van QS8-37). Zonder deze
  //    tak ging dat lege object alsnog naar PostgREST, en die antwoordt op een
  //    `PATCH` zonder velden met nul rijen: `.single()` maakt daar PGRST116 van,
  //    de gebruiker leest "Opslaan mislukt", en `reportError()` schrijft een
  //    Sentry-melding met zijn user-id erbij. Gemeten tegen de lokale stack op
  //    03-09, gevonden in de security-review van QS8-266.
  //
  //    Hier en niet bij de aanroeper: elke aanroeper die het zelf gaat
  //    controleren, is de volgende keten die ergens niet verbonden is.
  if (Object.keys(update).length === 0) {
    const ongewijzigd = await teruglezen(userId);
    if (ongewijzigd === null) return { ok: false, melding: t('profiel.opslaan_mislukt') };
    return { ok: true, profiel: ongewijzigd };
  }

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
    reportError(error, 'profile.update', { user_id: userId });
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
    reportError(error, 'profile.onboarded', { user_id: userId });
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

/**
 * De week-startdag verzetten, mét de lopende weekdoelen — QS8-138, migratie 0139.
 *
 * ⚠️ **Waarom dit niet meer via `updateProfiel()` gaat.** `week_start_day` is
 *    sinds 0139 voor de client niet meer schrijfbaar. Dat is geen omweg maar de
 *    afdwinging: verzet je je startdag midden in een cyclus, dan draagt je
 *    lopende weekdoel nog de oude `cycle_start_date`, valt het uit elke lijst,
 *    en stempelt de rollover het een week later als gemist — een minpunt en een
 *    gebroken reeks voor het wijzigen van een instelling.
 *
 *    Bleef de kolom schrijfbaar, dan zou de volgende schrijver dat stilzwijgend
 *    overslaan. Onwrikbare regel 18, vraag 5: een keten waarvan elk schakeltje
 *    klopt terwijl het geheel niet verbonden is.
 *
 * ⚠️ **De twee cycli worden hier berekend en niet op de server**, want er is
 *    geen SQL-helper die een cyclus uitrekent en een tweede opvatting van "welke
 *    week is het" in de database is precies wat correctheidsregel 7 verbiedt.
 *    Zelfde verdeling als bij `schuifDoor()`. De server toetst wél dat beide
 *    data vandaag bevatten — anders was dit een route naar een weggepoetste week.
 */
export async function zetWeekStartdag(
  userId: string,
  klok: UserClock,
  dag: Weekday,
): Promise<ProfielUitkomst> {
  // ⚠️ `userCycle` uit `shared/time` en niet `huidigeCyclus` uit de
  //    goals-module: module-communicatie loopt via `modules/<naam>/index.ts`, en
  //    auth hoort niet in goals te grijpen voor een berekening die gedeeld is.
  const nu = now();
  const oude = userCycle(klok, nu);
  const nieuwe = userCycle({ ...klok, weekStartDay: dag }, nu);

  const { data, error } = await supabase().rpc('zet_week_startdag', {
    p_dag: dag,
    p_oude_start: oude.startDate,
    p_nieuwe_start: nieuwe.startDate,
  });

  if (error) {
    reportError(error, 'profile.week_start', { user_id: userId });
    return { ok: false, melding: t('profiel.opslaan_mislukt') };
  }

  const uit = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uit.ok !== true) {
    // ⚠️ De reden gaat naar Sentry en niet naar het scherm: `geen_profiel` en
    //    `cyclus_bevat_vandaag_niet` zijn toestanden die een gebruiker niet kan
    //    veroorzaken en ook niet kan verhelpen. Zwijgen mag niet — dan denkt hij
    //    dat het gelukt is.
    reportError(new Error(`zet_week_startdag: ${uit.reason ?? 'onbekend'}`), 'profile.week_start', {
      user_id: userId,
    });
    return { ok: false, melding: t('profiel.opslaan_mislukt') };
  }

  const profiel = await teruglezen(userId);
  if (profiel === null) return { ok: false, melding: t('profiel.opslaan_mislukt') };

  return { ok: true, profiel };
}
