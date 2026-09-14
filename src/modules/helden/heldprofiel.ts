import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';

import { isHeldsleutel, isTrigger, type Heldbron, type Heldsleutel, type Trigger } from './helden';

/**
 * Welke held van wie is — de clientkant van `hero_profiles` (migratie 0264,
 * QS8-471). QS8-474.
 *
 * ⚠️⚠️ **`.upsert()` werkt hier niet, en dat is gemeten en niet beredeneerd.**
 *    📏 Op 14-09-2026 tegen de lokale PostgREST, als een echte `authenticated`:
 *    een kale insert geeft 201, een kale PATCH geeft 204, en
 *    `Prefer: resolution=merge-duplicates` geeft **403 met 42501, "permission
 *    denied for table hero_profiles"**.
 *
 *    De reden is de vorm van de grants van 0264: `insert (user_id, hero_key,
 *    source)` maar `update (hero_key, source)` — `user_id` mág je zetten bij het
 *    aanmaken en daarna nooit meer. PostgREST zet bij `merge-duplicates` élke
 *    payload-kolom in de `on conflict do update set`-lijst, en `user_id` moet in
 *    die payload staan want het is de conflictkolom. Postgres eist dan
 *    UPDATE-recht op `user_id`, dat er niet is, en weigert de héle rij.
 *
 *    Vandaar insert-en-dan-update. Dat is één aanroep in het gewone geval (de
 *    eerste keer) en twee bij het opnieuw doen van de quiz.
 *
 * ⚠️ **Niet "kijken of hij er al is en dan kiezen".** Dat leest natuurlijker en
 *    het is een race: tussen de leesactie en de schrijfactie kan een tweede
 *    tabblad de rij aanmaken, en dan valt de insert alsnog om op 23505 — maar
 *    dan zónder dat er iets is dat hem opvangt. De sleutel is hier de
 *    scheidsrechter, en 23505 is zijn antwoord.
 */

export interface Heldprofiel {
  readonly held: Heldsleutel;
  readonly bron: Heldbron;
}

export type HeldUitkomst = { ok: true } | { ok: false; melding: string };

/** Postgres' code voor een schending van een unieke sleutel. */
const AL_AANWEZIG = '23505';

/**
 * De held van deze gebruiker, of `null` als hij er geen heeft.
 *
 * ⚠️ **`null` is een geldig antwoord en geen fout.** Wie alle vier de
 *    heldenvragen overslaat, krijgt geen rij — acceptatiecriterium 3 van
 *    QS8-474. Elke aanroeper hoort dat geval te tekenen en niet te melden.
 *
 * ⚠️ `maybeSingle()` en niet `single()`: die tweede maakt van nul rijen een
 *    PGRST116-fout, en dan meldt de app een storing waar "je hebt nog geen held"
 *    hoort te staan.
 */
export async function heldprofiel(userId: string): Promise<Heldprofiel | null> {
  const { data, error } = await supabase()
    .from('hero_profiles')
    .select('hero_key, source')
    .eq('user_id', userId)
    .maybeSingle();

  // ⚠️⚠️ **Werpt, en geeft géén `null` terug bij een fout.** Dat stond hier
  //    eerst wel, en het maakte twee heel verschillende dingen ononderscheidbaar:
  //    *je hebt geen held* en *ik kon het niet ophalen*. Het scherm tekent het
  //    eerste als "je hebt de heldenvragen overgeslagen" — een ware zin met een
  //    onware strekking tegen iemand die gewoon een held hééft.
  //
  //    Door te werpen zet `useAsync()` zijn `error`, en heeft de schermlaag de
  //    drie staten die onwrikbare regel 16 eist. `null` blijft over voor wat het
  //    hoort te betekenen: er is geen rij.
  if (error) {
    reportError(error, 'helden.heldprofiel', { user_id: userId });
    throw error;
  }

  if (data === null || !isHeldsleutel(data.hero_key)) return null;

  return {
    held: data.hero_key,
    bron: data.source === 'keuze' ? 'keuze' : 'quiz',
  };
}

/**
 * Legt de held van deze gebruiker vast, of vervangt de held die er al stond.
 *
 * `bron` is `quiz` als de vragenlijst één koploper aanwees en `keuze` als de
 * gebruiker bij gelijkspel zelf koos. Dat onderscheid staat in de database en
 * niet in de app, omdat het de enige plek is waar later te zien is welke van de
 * twee het was.
 *
 * ⚠️ `chosen_at` gaat hier met opzet niet mee. Die kolom staat in geen enkele
 *    grant, en een payload die hem tóch noemt wordt door Postgres geweigerd op
 *    de héle rij — niet stil gecorrigeerd. De trigger `hero_profiles_tijd` zet
 *    hem, bij de insert én bij de update.
 */
export async function bewaarHeld(
  userId: string,
  held: Heldsleutel,
  bron: Heldbron,
): Promise<HeldUitkomst> {
  const nieuw = await supabase()
    .from('hero_profiles')
    .insert({ user_id: userId, hero_key: held, source: bron });

  if (!nieuw.error) return { ok: true };

  if (nieuw.error.code !== AL_AANWEZIG) {
    reportError(nieuw.error, 'helden.bewaarHeld.insert', { user_id: userId });
    return { ok: false, melding: t('vragenlijst.held.opslaan_mislukt') };
  }

  // ⚠️⚠️ **`.select()` erbij, en dat is geen luxe maar de reparatie van een
  //    stille succesmelding.** 📏 Gemeten tegen de lokale PostgREST: een PATCH
  //    die nul rijen raakt geeft **204 met een lege body** en dus `error === null`.
  //    Zonder deze regel gaf `bewaarHeld()` dan `{ ok: true }`, navigeerde het
  //    scherm door naar `/doelen`, en geloofde de gebruiker dat zijn held bewaard
  //    was terwijl er niets stond.
  //
  //    Het pad ernaartoe is smal maar echt: de insert botst op 23505 (de rij
  //    bestond), en tussen die twee aanroepen verdwijnt de rij — een tweede
  //    tabblad, of straks een knop om je held te wissen. De DELETE-grant en
  //    -policy staan lévend op de tabel, dus dat is geen hypothese.
  //
  //    📏 Mét `Prefer: return=representation` — wat `.select()` stuurt — geeft
  //    dezelfde PATCH **200 met `[]`**, en dát is wel te onderscheiden.
  //
  // ⚠️ `select('user_id')` en niet `select('*')`: meer kolommen vragen betekent
  //    leesrecht op meer kolommen, en dat is precies hoe 0089 een schrijfactie op
  //    `profiles` omver haalde met 42501.
  const bestaand = await supabase()
    .from('hero_profiles')
    .update({ hero_key: held, source: bron })
    .eq('user_id', userId)
    .select('user_id');

  if (bestaand.error) {
    reportError(bestaand.error, 'helden.bewaarHeld.update', { user_id: userId });
    return { ok: false, melding: t('vragenlijst.held.opslaan_mislukt') };
  }

  if ((bestaand.data ?? []).length === 0) {
    reportError(
      new Error('hero_profiles: insert gaf 23505 en de update raakte nul rijen'),
      'helden.bewaarHeld.verdwenen',
      { user_id: userId },
    );
    return { ok: false, melding: t('vragenlijst.held.opslaan_mislukt') };
  }

  return { ok: true };
}

export interface Verschijning {
  readonly held: Heldsleutel;
  readonly trigger: Trigger;
  /** Wanneer hij sprak, als ISO-timestamp. */
  readonly wanneer: string;
}

/**
 * De held die het laatst gesproken heeft, of `null` als er nog nooit een was.
 *
 * ⚠️⚠️ **Dit is een leesactie en geen dagbepaling.** Of die verschijning van
 *    vandáág is, hoort de aanroeper met `shared/time` uit te rekenen —
 *    correctheidsregel 7 laat geen tweede plek toe waar een dag begint, en een
 *    `gte('shown_at', middernacht)` hier zou dat wél zijn.
 *
 * ⚠️ `limit(1)` op een aflopende sortering, en niet de hele tabel. Deze tabel
 *    groeit per gebruiker door en onwrikbare regel 10 laat geen ongepagineerde
 *    lijstquery toe.
 *
 * ⚠️ **Werpt bij een fout, net als `heldprofiel()`.** Een `null` zou "er is nog
 *    nooit een held geweest" betekenen, en dat is iets anders dan "ik kon het
 *    niet ophalen", en `reportError()` hoort het te melden.
 *
 * ⚠️⚠️ **Maar de énige aanroeper doet er niets mee, en dat is hier juist.** Het
 *    `HeldBlok` op het Vandaag-scherm tekent bij een fout niets — precies wat
 *    het ook doet als er geen verschijning is. Dat is geen gemiste foutstaat
 *    maar de goede: dit blok is de quote ónder een melding die al aangekomen is,
 *    en "je quote kon niet geladen worden" is een storingsmelding over iets wat
 *    niemand gevraagd heeft. De fout gaat naar Sentry en de kaart blijft weg.
 *
 *    Hier stond eerst *"het scherm heeft dat verschil nodig voor zijn
 *    foutstaat"*, en dat was onwaar zodra je keek — gevonden in de
 *    security-review op QS8-475. ⚠️ Komt er ooit een tweede aanroeper die de
 *    fout wél moet tonen, dan is het werpen er al; dan is dit comment de
 *    plek die meeverandert.
 */
export async function laatsteVerschijning(userId: string): Promise<Verschijning | null> {
  const { data, error } = await supabase()
    .from('hero_appearances')
    .select('hero_key, trigger, shown_at')
    .eq('user_id', userId)
    .order('shown_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    reportError(error, 'helden.laatsteVerschijning', { user_id: userId });
    throw error;
  }

  if (data === null) return null;

  const rij = data as { hero_key: string; trigger: string; shown_at: string };
  if (!isHeldsleutel(rij.hero_key) || !isTrigger(rij.trigger)) return null;

  return { held: rij.hero_key, trigger: rij.trigger, wanneer: rij.shown_at };
}
