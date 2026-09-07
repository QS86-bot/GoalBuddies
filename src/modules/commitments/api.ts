import type { Database, Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import { invoerfout, type Resultaat } from '../../shared/api';

import { commitmentSchema, type CommitmentInvoer } from './commitment-schemas';

// ⚠️ Opnieuw geëxporteerd zodat de aanroepers via `modules/<naam>/index.ts`
//    ongemoeid blijven. De definitie staat sinds 25-08-2026 in `shared/api`;
//    hij stond hiervoor zeven keer woordelijk in deze codebase.
export type { Resultaat };

/**
 * Commitment devices: een beloning die vrijkomt als je je doel haalt, en een
 * straf die verschuldigd wordt als je hem mist.
 *
 * ⚠️ Domeinregel 5: alles wat een consequentie oplegt moet expliciet bevestigd
 *    zijn, auditeerbaar, en nooit stilzwijgend geactiveerd. Dat is hier geen
 *    afspraak maar een schema-eigenschap: `confirmed_at` is NOT NULL, dus een
 *    commitment zónder bevestiging kán niet bestaan.
 *
 * ⚠️ Domeinregel 11: een straf treedt alleen in werking bij een verstreken
 *    deadline. Een gemiste week kost een minpunt, meer niet. De database dwingt
 *    dat af sinds migratie 0006: de client mag `status` niet kiezen en komt dus
 *    altijd binnen op `set`.
 *
 * ⚠️ **Het auditspoor staat hier niet meer.** Tot 0057 schreef dit bestand zelf
 *    zijn regels in `commitment_events`, en dat werkte nooit: die tabel heeft
 *    RLS met alleen een SELECT-policy, dus elke insert werd geweigerd met 42501
 *    en door `reportError` opgeslokt. De tabel stond op nul rijen. Sinds 0057
 *    schrijft de trigger `commitments_audit` de regels, met `auth.uid()` als
 *    actor. Dat is ook inhoudelijk beter: een client die zijn eigen audittrail
 *    bijhoudt, kan hem overslaan — en domeinregel 5 vraagt juist dat je dat niet
 *    kunt.
 */

export type Commitment = Tables<'commitments'>;
export type CommitmentGebeurtenis = Tables<'commitment_events'>;


/**
 * Eén straf waarvan jij persoonlijk de getuige bent — QS8-292.
 *
 * ⚠️ **Geen `Tables<'commitments'>`**, en dat is het punt van dit type: de
 *    getuige ziet mínder dan de eigenaar. Geen `goal_id`, geen
 *    `beneficiary_user_id`, geen `image_url` — en wél de naam van de eigenaar,
 *    die in de tabel zelf niet eens staat.
 */
export type Getuigenis = Database['public']['Functions']['getuigenissen']['Returns'][number];

/**
 * De straffen waarvan jij persoonlijk de getuige bent.
 *
 * ⚠️ **Waarom dit een RPC is en niet een `.from('commitments')`.** Het leesrecht
 *    bestaat sinds 0168 — `commitments_select`, derde tak — maar het is niet
 *    genoeg om er een scherm van te maken. 📏 Gemeten met een echte opstelling:
 *    de getuige leest de straf (1 rij, mét `body`) en het dóél niet (0 rijen).
 *    En `commitments` draagt geen `owner_id`, dus **hij kan niet vaststellen van
 *    wie de straf is**. `getuigenissen()` (0169) legt daar precies één veld bij:
 *    de naam.
 *
 * ⚠️ **De functie neemt geen argumenten, en dat is de autorisatie.** `auth.uid()`
 *    staat ín het lichaam, dus er is geen manier om hem voor iemand anders aan
 *    te roepen — de les van `verdien_badges(p_user_id)` (0165) als ontwerpkeuze.
 *
 * ⚠️ **Werpt niet, maar geeft een lege lijst bij een fout.** Dit blok staat naast
 *    je eigen week en hoort die niet mee te slepen; dezelfde afweging die het
 *    stand-blok op *Vandaag* apart laadt na de gebruikersreview op QS8-75.
 */
export async function fetchGetuigenissen(): Promise<readonly Getuigenis[]> {
  const { data, error } = await supabase().rpc('getuigenissen');

  if (error) {
    reportError(error, 'commitments.getuigenissen', { code: error.code });
    return [];
  }

  return data ?? [];
}

export async function fetchCommitments(goalId: string): Promise<readonly Commitment[]> {
  const { data, error } = await supabase()
    .from('commitments')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });

  if (error) {
    reportError(error, 'commitments.list', { goal_id: goalId, code: error.code });
    throw new Error(t('commitment.fout.laden'));
  }

  return data ?? [];
}

/**
 * Legt een beloning vast — QS8-34.
 *
 * Geen begunstigde groep: een beloning is voor jezelf.
 */
export async function zetBeloning(
  goalId: string,
  invoer: CommitmentInvoer,
): Promise<Resultaat<Commitment>> {
  return await maak(goalId, 'reward', invoer);
}

/**
 * De mensen die je als begunstigde van een straf mag kiezen.
 *
 * ⚠️ **Iedereen met wie je een groep deelt, en niemand anders.** Een vreemde
 *    kiezen zou een manier zijn om iemand ongevraagd getuige te maken van je
 *    straf. De grens ligt in `commitments_insert` via
 *    `shares_group_with_user()`; deze lijst is de comfortabele kant ervan.
 *
 * ⚠️ **Twee query's en geen N+1** (regel 12): eerst je eigen lidmaatschappen,
 *    dan in één keer de leden van díe groepen. Per groep vragen zou het
 *    klassieke groepsoverzicht-probleem zijn, op een lijst die niemand ziet.
 *
 * ⚠️ Allebei begrensd (regel 10). Een gebruiker zit in hoogstens tien groepen
 *    (`create_group`, `too_many_groups`), dus de eerste grens is ruim; de tweede
 *    is een dak en geen paginering — bij honderd kandidaten is een keuzelijst
 *    sowieso het verkeerde middel, en dan hoort er een zoekveld te komen.
 */
export interface MogelijkeBegunstigde {
  readonly id: string;
  readonly naam: string;
}

const MAX_GROEPEN = 20;
const MAX_KANDIDATEN = 100;

export async function fetchMogelijkeBegunstigden(): Promise<readonly MogelijkeBegunstigde[]> {
  const db = supabase();

  const { data: sessie } = await db.auth.getUser();
  const ik = sessie.user?.id ?? '';
  if (ik === '') return [];

  const mijn = await db
    .from('group_members')
    .select('group_id')
    .eq('user_id', ik)
    .neq('status', 'inactive')
    .limit(MAX_GROEPEN);

  if (mijn.error) {
    reportError(mijn.error, 'commitments.begunstigden.groepen', { code: mijn.error.code });
    return [];
  }

  const groepIds = (mijn.data ?? []).map((r) => r.group_id);
  if (groepIds.length === 0) return [];

  const leden = await db
    .from('group_members')
    .select('user_id, profiles(display_name)')
    .in('group_id', groepIds)
    .neq('user_id', ik)
    .neq('status', 'inactive')
    .limit(MAX_KANDIDATEN);

  if (leden.error) {
    reportError(leden.error, 'commitments.begunstigden.leden', { code: leden.error.code });
    return [];
  }

  // ⚠️ Ontdubbelen op `user_id`: wie in twee van jouw groepen zit, staat hier
  //    twee keer. Een keuzelijst met dezelfde naam er twee keer in leest als een
  //    fout, en `Choice` gebruikt de waarde als sleutel.
  const gezien = new Map<string, MogelijkeBegunstigde>();
  for (const rij of leden.data ?? []) {
    const id = rij.user_id as string;
    if (gezien.has(id)) continue;
    const profiel = rij.profiles as { display_name?: string | null } | null;
    gezien.set(id, { id, naam: profiel?.display_name ?? t('commitment.begunstigde.naamloos') });
  }

  return [...gezien.values()];
}

/**
 * Wie de getuige van een straf is: een hele groep, of één persoon.
 *
 * ⚠️ **Nooit allebei, en dat is een CHECK en niet een afspraak** — met twee
 *    begunstigden is niet te zeggen wie de getuige is. Zie migratie 0168.
 */
export type Begunstigde =
  | { readonly soort: 'groep'; readonly id: string }
  | { readonly soort: 'persoon'; readonly id: string };

/**
 * Legt een straf vast — QS8-35, uitgebreid in QS8-228.
 *
 * ⚠️ Een begunstigde is verplicht en moet iemand zijn met wie je een band hebt:
 *    een groep waar je lid van bent, of iemand met wie je een groep deelt. Dat
 *    wordt in RLS afgedwongen (`commitments_insert`, 0006 en 0168) en niet in de
 *    UI: een keuzelijst die alleen jouw groepen en groepsgenoten toont is
 *    gebruiksgemak, geen beveiliging.
 *
 * ⚠️ **Waarom er überhaupt een begunstigde moet zijn.** Domeinregel 11: die
 *    krijgt leesrecht op het moment dat de straf verschuldigd wordt. Zonder
 *    getuige ziet niemand hem ooit, en dan is een straf een voornemen in plaats
 *    van een commitment device — de werking komt uit het gezien worden.
 *
 * ⚠️ De begunstigde ziet dit commitment pas als het verschuldigd wordt. Tot die
 *    tijd is het alleen van jou (domeinregel 11, afgedwongen in
 *    `commitments_select`).
 */
export async function zetStraf(
  goalId: string,
  invoer: CommitmentInvoer,
  begunstigde: Begunstigde,
): Promise<Resultaat<Commitment>> {
  if (!begunstigde.id) {
    return { ok: false, melding: t('commitment.fout.geen_begunstigde') };
  }

  return await maak(
    goalId,
    'penalty',
    invoer,
    begunstigde.soort === 'groep' ? begunstigde : null,
    begunstigde.soort === 'persoon' ? begunstigde : null,
  );
}

async function maak(
  goalId: string,
  type: 'reward' | 'penalty',
  invoer: CommitmentInvoer,
  groep: Begunstigde | null = null,
  persoon: Begunstigde | null = null,
): Promise<Resultaat<Commitment>> {
  const gevalideerd = commitmentSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('commitment.fout.invoer')) };
  }

  const { data, error } = await supabase()
    .from('commitments')
    .insert({
      goal_id: goalId,
      type,
      body: gevalideerd.data.body,
      image_url: gevalideerd.data.image_url,
      beneficiary_group_id: groep?.id ?? null,
      beneficiary_user_id: persoon?.id ?? null,
      // ⚠️ De bevestiging is het aanmaken zelf: dit wordt pas aangeroepen ná de
      //    aparte bevestigingsstap in de UI, waar de consequentie letterlijk
      //    uitgeschreven staat. `'now'` laat Postgres de tijd zetten.
      confirmed_at: 'now',
      // `status` staat er bewust niet bij. De database staat alleen 'set' toe
      // bij een insert (0006); meesturen zou suggereren dat er iets te kiezen is.
    })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'commitments.create', { goal_id: goalId, name: type, code: error.code });
    return { ok: false, melding: t('commitment.fout.vastleggen') };
  }

  // Geen logregel hier: de trigger `commitments_audit` heeft er al een
  // geschreven, met `auth.uid()` erin (migratie 0057).
  return { ok: true, waarde: data };
}

/**
 * Trekt een commitment in, zolang het nog niet in werking is getreden.
 *
 * ⚠️ Alleen mogelijk op status `set`. Dat is geen UI-regel maar de
 *    `commitments_update`-policy: een straf die verschuldigd is, kun je niet
 *    wegpoetsen. Anders is een commitment device geen commitment device.
 */
export async function trekIn(commitmentId: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase()
    .from('commitments')
    .update({ status: 'cancelled' })
    .eq('id', commitmentId)
    .select('id');

  if (error) {
    reportError(error, 'commitments.cancel', { code: error.code });
    return { ok: false, melding: t('commitment.fout.intrekken') };
  }

  if ((data ?? []).length === 0) {
    return {
      ok: false,
      melding: t('commitment.fout.al_afgegaan'),
    };
  }

  // Ook hier geen logregel: `commitments_audit` heeft hem al geschreven.
  return { ok: true, waarde: true };
}

/**
 * Het auditspoor van een commitment — QS8-84, acceptatiecriterium 7.
 *
 * Alleen voor de eigenaar leesbaar (`commitment_events_select`). De begunstigde
 * groep ziet het spoor niet, ook niet nadat een straf verschuldigd is geworden:
 * die groep krijgt de straf zélf te lezen en verder niets.
 *
 * ⚠️ **Sorteren op `seq` en niet op `created_at`** — QS8-303. Aan één UPDATE van
 *    een commitment hangen twee triggers die allebei een gebeurtenis schrijven,
 *    en `now()` is binnen een transactie constant. Die twee rijen kregen dus
 *    exact dezelfde `created_at`, en dan mag Postgres de volgorde kiezen: de
 *    eigenaar kon "geplaatst in de groep" bóven "verschuldigd geworden" zien
 *    staan. `seq` is een identity-kolom (migratie 0174) en kan niet knopen.
 */
export async function fetchCommitmentSpoor(
  commitmentId: string,
): Promise<readonly CommitmentGebeurtenis[]> {
  const { data, error } = await supabase()
    .from('commitment_events')
    .select('*')
    .eq('commitment_id', commitmentId)
    // ⚠️ Hier stond .order('created_at', { ascending: true }) tot QS8-303.
    .order('seq', { ascending: true });

  if (error) {
    reportError(error, 'commitments.trail', { code: error.code });
    throw new Error(t('commitment.fout.spoor'));
  }

  return data ?? [];
}
