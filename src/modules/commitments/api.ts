import { COMMITMENT_KOLOMMEN } from './kolommen';
import type { Database, Tables } from '../../lib/database.types';
import type { Database as GecorrigeerdeDatabase } from '../../lib/database.types.correcties';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import { invoerfout, type Resultaat } from '../../shared/api';
import { now, type UserClock } from '../../shared/time';

import { commitmentSchema, TEAMSTRAF_HINT, type CommitmentInvoer } from './commitment-schemas';
import { belofteFoutsleutel, belofteperiode, strafFoutsleutel } from './weekbelofte';

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

/**
 * ⚠️ **Een `Pick` en niet de hele rij, en dat volgt de kolomgrant.** Sinds
 *    `0280` staat de SELECT-grant op `commitments` per kolom en ligt `tz`
 *    erbuiten — 📏 gemeten op productie: `authenticated` leest precies deze tien
 *    kolommen en verder niets. Elke `.select()` hieronder noemt dezelfde lijst,
 *    want een `*` geeft `42501`.
 *
 * ⚠️ De generator spiegelt kólommen en geen kolomgrants (`ENGINEER-REVIEW.md`,
 *    rij 09-09-2026), dus `Tables<'commitments'>` belooft een veld dat deze
 *    client nooit binnenkrijgt. Dát verschil hoort hier en niet in
 *    `database.types.correcties.ts`: daar staat wat de generator niet kán weten,
 *    hier staat wat déze client mag.
 *
 * ⚠️⚠️ **`Pick` en niet `Omit<…, 'tz'>`, en dat is niet hetzelfde.** Een grant is
 *    een opsomming; `Omit` is een uitsluiting. Komt er ooit een kolom bij
 *    `commitments` die níét in de grant komt, dan krijgt dit type hem er
 *    stilzwijgend bij — niet-optioneel getypeerd, `undefined` op runtime, want de
 *    `.select()` hieronder vraagt hem niet op. Met een `Pick` is die kolom er
 *    gewoon niet. Bevinding van de security-ronde op QS8-569.
 */
export type Commitment = Pick<
  Tables<'commitments'>,
  | 'id'
  | 'goal_id'
  | 'type'
  | 'body'
  | 'image_url'
  | 'beneficiary_group_id'
  | 'beneficiary_user_id'
  | 'status'
  | 'confirmed_at'
  | 'created_at'
  | 'periode_start'
>;

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
    reportError(error, 'commitments.getuigenissen');
    return [];
  }

  return data ?? [];
}

export async function fetchCommitments(goalId: string): Promise<readonly Commitment[]> {
  const { data, error } = await supabase()
    .from('commitments')
    // ⚠️ Geen `select('*')`: sinds 0280 is de SELECT-grant op `commitments`
    //    per kolom en ligt `tz` erbuiten — de begunstigde groep leest deze rij
    //    mee zodra een straf verschuldigd wordt. PostgREST geeft bij een `*`
    //    dan 42501 en niet stilzwijgend minder kolommen.
    .select<string, Commitment>(COMMITMENT_KOLOMMEN)
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });

  if (error) {
    reportError(error, 'commitments.list', { goal_id: goalId });
    throw new Error(t('commitment.fout.laden'));
  }

  return data ?? [];
}

/**
 * De doelen uit deze lijst waar een straf op staat — QS8-370.
 *
 * ⚠️ **Een RPC en geen `.from('commitments')`, en dat is de kern van dit issue.**
 *    De eerste versie zette een vierde tak op `commitments_select`. De
 *    security-ronde van 09-09-2026 wees hem af en de meting droeg dat: een lid
 *    van de gevraagde groep las met één `select *` de `body`, de `image_url` en
 *    het id van de aangewezen getuige — terwijl dit scherm er één generieke zin
 *    van laat zien. **RLS kan geen kolommen beperken** (CLAUDE.md domeinregel
 *    7), dus een policy is hier per constructie te veel.
 *
 *    `straffen_bij_uitstelverzoek()` (migratie 0218) geeft daarom alleen
 *    `goal_id` terug. Zelfde vorm en zelfde reden als `getuigenissen()` uit
 *    0169, waar dit project deze afweging al eens gemaakt heeft.
 *
 * ⚠️ **En daarmee is `due` per constructie onzichtbaar.** Een straf die van
 *    `set` naar `due` gaat, verandert niets aan wat deze functie teruggeeft — hij
 *    stond er al in. Een statuslijst om synchroon te houden is er dus niet, en
 *    er is geen moment waarop dit oppervlak iets nieuws vertelt. Dat is precies
 *    wat de policyversie fout deed: die gaf de rij op `due` gewoon weg, aan een
 *    groep die de begunstigde niet is, en `due` betekent "de streefdatum niet
 *    gehaald".
 *
 * ⚠️ **`null` betekent "we weten het niet" en is niet hetzelfde als leeg.** Een
 *    lege verzameling zegt "er staat op geen van deze doelen een straf", en dat
 *    is precies de mededeling die je niet mag doen als de vraag mislukt is: dan
 *    verdwijnt de waarschuwing en blijft de knop staan. Uit de security-ronde;
 *    het scherm toont bij `null` dat het dit niet heeft kunnen ophalen.
 *
 * ⚠️ Geen filter op eigenaar, groep of verzoek: de functie is `security definer`
 *    en toetst dat zelf. Een `.eq()` erbij zou suggereren dat de beveiliging
 *    hier zit.
 *
 * ⚠️ **Eén aanroep voor de hele lijst en geen N+1** (regel 12) — dit hangt onder
 *    een lijst met verzoeken, precies het groepsoverzicht-patroon. De bovengrens
 *    staat in de functie zelf (100) en niet hier: een grens die in een scherm
 *    woont, is geen grens.
 */
export async function fetchStrafDoelen(
  goalIds: readonly string[],
): Promise<ReadonlySet<string> | null> {
  if (goalIds.length === 0) return new Set();

  const { data, error } = await supabase().rpc('straffen_bij_uitstelverzoek', {
    p_goal_ids: [...goalIds],
  });

  if (error) {
    reportError(error, 'commitments.strafdoelen', { aantal: goalIds.length });
    return null;
  }

  return new Set((data ?? []).map((rij) => rij.goal_id));
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
    reportError(mijn.error, 'commitments.begunstigden.groepen');
    return [];
  }

  const groepIds = (mijn.data ?? []).map((r) => r.group_id);
  if (groepIds.length === 0) return [];

  // ⚠️ **Begrensd door `MAX_GROEPEN` in de vraag erboven** — hoogstens twintig
  //    id's (QS8-368). De klif op een GET ligt boven ~400, in de
  //    `Content-Location`-responseheader; zie `shared/idlijst`.
  const leden = await db
    .from('group_members')
    .select('user_id, profiles(display_name)')
    .in('group_id', groepIds)
    .neq('user_id', ik)
    .neq('status', 'inactive')
    .limit(MAX_KANDIDATEN);

  if (leden.error) {
    reportError(leden.error, 'commitments.begunstigden.leden');
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

/** De beloftestand van één doel — QS8-761. */
export interface BelofteStand {
  /** De recentste weekbeloftes, nieuwste eerst. */
  readonly beloftes: readonly Commitment[];
  /** Staat er een doelstraf op `set` of `due`? Die sluit een belofte uit (0314). */
  readonly doelstrafOpen: boolean;
}

/** Hoeveel weekbeloftes het scherm terugkijkt: de lopende en de vorige weken. */
const BELOFTES_TERUG = 5;

/**
 * De weekbeloftes en de open doelstraf van één doel — QS8-761.
 *
 * ⚠️ **Begrensd, anders dan `fetchCommitments()`** (regel 10): met 52 beloftes
 *    per doel per jaar groeit die lijst onbeperkt (gemeld bij x.3). Het scherm
 *    heeft de lopende belofte en die van deze week nodig; vijf is ruim.
 *
 * ⚠️ Werpt bij een fout: "geen belofte" is een bewering, geen terugval (regel 16).
 */
export async function fetchBelofteStand(goalId: string): Promise<BelofteStand> {
  const db = supabase();

  const [beloftes, doelstraf] = await Promise.all([
    db
      .from('commitments')
      .select<string, Commitment>(COMMITMENT_KOLOMMEN)
      .eq('goal_id', goalId)
      .eq('type', 'penalty')
      .not('periode_start', 'is', null)
      .order('created_at', { ascending: false })
      .limit(BELOFTES_TERUG),
    db
      .from('commitments')
      .select('id')
      .eq('goal_id', goalId)
      .eq('type', 'penalty')
      .is('periode_start', null)
      // Open = `set` of `due`: een doelstraf kent verder alleen `resolved` en `cancelled`.
      .neq('status', 'cancelled')
      .neq('status', 'resolved')
      .limit(1),
  ]);

  const fout = beloftes.error ?? doelstraf.error;
  if (fout) {
    reportError(fout, 'commitments.belofte.stand', { goal_id: goalId });
    throw new Error(t('belofte.fout.laden'));
  }

  return { beloftes: beloftes.data ?? [], doelstrafOpen: (doelstraf.data ?? []).length > 0 };
}

/** Wie je als getuige van een weekbelofte kunt aanwijzen — QS8-761. */
export interface BelofteBegunstigden {
  readonly groepen: readonly { readonly id: string; readonly naam: string }[];
  readonly getuigen: readonly MogelijkeBegunstigde[];
}

/**
 * De groepen en mensen die een weekbelofte mogen zien — QS8-761.
 *
 * ⚠️ **Niet `fetchMogelijkeBegunstigden()`, en dat is de grens van 0314.**
 *    `weekbelofte_begunstigde_bekend()` weigert een automatisch gevormde groep
 *    (onbekenden, QS8-230) en een getuige die je alleen uit zo'n groep kent. De
 *    lijst voor een doelstraf filtert daar niet op; hergebruiken zou mensen
 *    aanbieden die de database weigert. Dezelfde voorwaarden als de functie:
 *    jouw lidmaatschap niet `inactive`, de groep niet `archived` en niet
 *    `automatisch`, het lid niet `inactive`.
 *
 * ⚠️ **Werpt bij een fout, anders dan `fetchMogelijkeBegunstigden()`.** Een
 *    lege lijst betekent op het beloftescherm "je hebt geen getuige", en dat is
 *    een bewering die je bij een mislukte vraag niet mag doen (regel 16).
 *
 * ⚠️ Twee query's en geen N+1 (regel 12), allebei begrensd (regel 10); dezelfde
 *    daken als hierboven. Ongemeten: of honderd kandidaten volstaan.
 */
export async function fetchBelofteBegunstigden(): Promise<BelofteBegunstigden> {
  const db = supabase();

  const { data: sessie } = await db.auth.getUser();
  const ik = sessie.user?.id ?? '';
  if (ik === '') return { groepen: [], getuigen: [] };

  // ⚠️ Vanuit `groups` met één ingebedde kolom, en niet vanuit `group_members`
  //    met `groups!inner(id, name, …)`: `kolomrechten:controle` knipt een
  //    selectie op komma's en las `name` dan als kolom van `group_members`.
  const mijn = await db
    .from('groups')
    .select('id, name, group_members!inner(user_id)')
    .eq('group_members.user_id', ik)
    .neq('group_members.status', 'inactive')
    .eq('automatisch', false)
    .neq('status', 'archived')
    .limit(MAX_GROEPEN);

  if (mijn.error) {
    reportError(mijn.error, 'commitments.belofte.groepen');
    throw new Error(t('belofte.fout.laden'));
  }

  const groepen = (mijn.data ?? []).map((g) => ({ id: g.id, naam: g.name }));
  if (groepen.length === 0) return { groepen: [], getuigen: [] };

  const leden = await db
    .from('group_members')
    .select('group_id, user_id, profiles(display_name)')
    .in('group_id', groepen.map((g) => g.id))
    .neq('user_id', ik)
    .neq('status', 'inactive')
    .limit(MAX_KANDIDATEN);

  if (leden.error) {
    reportError(leden.error, 'commitments.belofte.leden');
    throw new Error(t('belofte.fout.laden'));
  }

  const gezien = new Map<string, MogelijkeBegunstigde>();
  for (const rij of leden.data ?? []) {
    const id = rij.user_id as string;
    if (gezien.has(id)) continue;
    const profiel = rij.profiles as { display_name?: string | null } | null;
    gezien.set(id, { id, naam: profiel?.display_name ?? t('commitment.begunstigde.naamloos') });
  }

  // ⚠️ **Een groep waarin alleen jij zit, is geen getuige** (security-ronde, M1):
  //    de bevestigstap zegt dat de groep je belofte kan lezen, en dan leest er
  //    niemand. De database staat zo'n groep nog toe; zie `docs/ENGINEER-REVIEW.md`.
  const bezet = new Set((leden.data ?? []).map((rij) => rij.group_id as string));
  return { groepen: groepen.filter((g) => bezet.has(g.id)), getuigen: [...gezien.values()] };
}

// ⚠️ Het gecorrigeerde type: `tz` zet een trigger (0280), zie `database.types.correcties.ts`.
type CommitmentInsert = GecorrigeerdeDatabase['public']['Tables']['commitments']['Insert'];

/**
 * De rij van een weekbelofte, opgebouwd en als `Insert` teruggegeven: de vorm van
 * `naarKolommen()` in `modules/auth`.
 * ⚠️ **Staat vóór `gaWeekbelofteAan()`, en dat draagt.** `kolomrechten:controle`
 *    leest de insert-aanroep via de eerste `const rij` in dit bestand
 *    (`velduitLokaal()`), dezelfde vorm als `naarKolommen()` en `const update`.
 */
function belofterij(goalId: string, body: string, begunstigde: Begunstigde, start: string): CommitmentInsert {
  const rij: CommitmentInsert = {
    goal_id: goalId,
    type: 'penalty',
    body,
    image_url: null,
    beneficiary_group_id: begunstigde.soort === 'groep' ? begunstigde.id : null,
    beneficiary_user_id: begunstigde.soort === 'persoon' ? begunstigde.id : null,
    confirmed_at: 'now',
    periode_start: start,
  };
  return rij;
}

/**
 * Gaat een weekbelofte aan — QS8-761 (x.4 van de poort QS8-744).
 *
 * ⚠️⚠️ **`periode_start` komt uit `belofteperiode()` en nergens anders**, en
 *    wordt hier opnieuw uitgerekend in plaats van overgenomen van het scherm. De
 *    gebruiker bevestigde een wéék (`bevestigdeStart`); is die week sinds het
 *    tonen van de bevestigstap verstreken, dan gaat er niets de deur uit. Anders
 *    bevestigt hij week A en legt de app week B vast, en domeinregel 5 eist dat
 *    een consequentie bevestigd is zoals ze vastgelegd wordt (de les van
 *    QS8-507 over de geschoonde tekst, nu voor de periode).
 *
 * ⚠️ **Geen `periode_einde`, geen `status`, geen `tz`.** Het einde zet de
 *    trigger `bevries_belofteperiode()`, de zone `bevries_commitmentzone()`, en
 *    voor geen van drieën heeft een client een INSERT-grant (42501).
 *
 * ⚠️ De bevestiging is het aanroepen zelf: het scherm roept dit alleen aan
 *    vanuit de aparte bevestigstap (`confirmed_at: 'now'`, NOT NULL sinds 0001).
 */
export async function gaWeekbelofteAan(
  goalId: string,
  invoer: CommitmentInvoer,
  begunstigde: Begunstigde,
  klok: UserClock,
  bevestigdeStart: string,
): Promise<Resultaat<Commitment>> {
  const gevalideerd = commitmentSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('commitment.fout.invoer')) };
  }
  if (!begunstigde.id) return { ok: false, melding: t('commitment.fout.geen_begunstigde') };

  const periode = belofteperiode(klok, now());
  if (periode.start !== bevestigdeStart) return { ok: false, melding: t('belofte.fout.week_voorbij') };

  const rij = belofterij(goalId, gevalideerd.data.body, begunstigde, periode.start);

  const { data, error } = await supabase()
    .from('commitments')
    .insert(rij)
    .select<string, Commitment>(COMMITMENT_KOLOMMEN)
    .single();

  if (error) {
    // ⚠️ QS8-660 op de naad met de weekbelofte (0312–0314, gekomen na de basis van
    //    QS8-660; toegevoegd bij het hernummeren op 20-11-2026): ook een belofte
    //    gaat langs `bewaak_teamstraf()`. Dezelfde weigering, dezelfde zin, en
    //    geen melding aan Sentry, net als in `zetStraf()` en `herstel()`.
    if (error.hint === TEAMSTRAF_HINT) return { ok: false, melding: t('commitment.fout.teamstraf') };
    const sleutel = belofteFoutsleutel(error);
    // Een weigering die de gebruiker zelf kan oplossen is geen storing; alleen
    // de terugval gaat naar Sentry (de vorm van `weekbelofte_loopt`, 0313).
    if (sleutel === 'commitment.fout.vastleggen') reportError(error, 'commitments.belofte', { goal_id: goalId });
    return { ok: false, melding: t(sleutel) };
  }

  return { ok: true, waarde: data };
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
    .select<string, Commitment>(COMMITMENT_KOLOMMEN)
    .single();

  if (error) {
    // ⚠️ QS8-660: een afspraak op een teamaandeel blijft in het team, en een
    //    team is alleen getuige van een teamaandeel (`bewaak_teamstraf()`, 0325).
    //    Herkend aan de vaste `hint` en niet aan de zin, zodat een andere
    //    formulering in de database dit niet stil breekt. Geen `reportError`:
    //    dit is een weigering die de gebruiker kan herstellen, geen storing.
    if (error.hint === TEAMSTRAF_HINT) return { ok: false, melding: t('commitment.fout.teamstraf') };
    const sleutel = strafFoutsleutel(error);
    if (sleutel === 'commitment.fout.vastleggen') reportError(error, 'commitments.create', { goal_id: goalId, name: type });
    return { ok: false, melding: t(sleutel) };
  }

  // Geen logregel hier: de trigger `commitments_audit` heeft er al een
  // geschreven, met `auth.uid()` erin (migratie 0057).
  return { ok: true, waarde: data };
}

/** Wat een intrekpoging opleverde: gelukt, een storing, of al beslist (nul rijen). */
type Intrekking = 'ingetrokken' | 'storing' | 'beslist';

/**
 * De ene schrijfactie achter {@link trekBelofteIn} en {@link trekStrafIn}.
 *
 * ⚠️ Er stond hier ook een kale `trekIn()`, met de melding "Dit commitment is al in
 *    werking getreden". Sinds QS8-814 roept de app hem niet meer aan, en is hij
 *    weggehaald: zijn melding was bij nul rijen niet altijd waar.
 *
 * ⚠️ Alleen mogelijk op status `set`. Dat is geen UI-regel maar de
 *    `commitments_update`-policy: nul rijen betekent dus "niet meer op `set`".
 */
async function zetIngetrokken(commitmentId: string): Promise<Intrekking> {
  const { data, error } = await supabase()
    .from('commitments')
    .update({ status: 'cancelled' })
    .eq('id', commitmentId)
    .select('id');

  if (error) {
    reportError(error, 'commitments.cancel');
    return 'storing';
  }
  // Ook hier geen logregel: `commitments_audit` heeft hem al geschreven.
  return (data ?? []).length === 0 ? 'beslist' : 'ingetrokken';
}

/** De uitkomst van {@link trekBelofteIn}: bij een mislukking ook óf opnieuw proberen zin heeft. */
export type BelofteIntrekking =
  | { readonly ok: true }
  | { readonly ok: false; readonly melding: string; readonly beslist: boolean };

/**
 * Een weekbelofte intrekken — QS8-799.
 *
 * De schrijfactie van {@link zetIngetrokken}, met twee bijzonderheden:
 *
 * - Werd de belofte tussen renderen en tikken beslist, dan zegt de melding
 *   "Deze belofte" en niet "Dit commitment". ⚠️ Beslist en niet `due`: nul rijen
 *   betekent "niet meer op `set`", en bij een belofte is `cancelled` door de
 *   rollover (0313, gehouden) een gewoon pad. Een tekst die dan "in werking
 *   getreden" zegt, schrikt iemand af die zijn belofte juist hield.
 * - `beslist` zegt of opnieuw proberen zin heeft. Bij `true` verdwijnt de
 *   intrekknop en komt er "Bekijk de uitslag" (besluit Quinten 23-11-2026); bij
 *   een storing blijft hij staan.
 *
 * ⚠️ Het beloftescherm roept alleen deze aan, en alleen vanuit de tweede
 *    bevestiging (`tests/beloftes/belofte-intrekken.test.ts`).
 */
export async function trekBelofteIn(commitmentId: string): Promise<BelofteIntrekking> {
  const uitkomst = await zetIngetrokken(commitmentId);
  if (uitkomst === 'ingetrokken') return { ok: true };
  if (uitkomst === 'beslist') return { ok: false, melding: t('belofte.fout.al_afgegaan'), beslist: true };
  return { ok: false, melding: t('commitment.fout.intrekken'), beslist: false };
}

/**
 * Een straf op een doel intrekken — QS8-814, in de vorm van {@link trekBelofteIn}.
 *
 * Dezelfde schrijfactie als {@link trekBelofteIn}. ⚠️ Werd de straf tussen renderen en
 * tikken beslist (nul rijen), dan zegt de melding "intussen beslist" en niet "in
 * werking getreden": nul rijen is ook een doel dat op tijd is afgerond, waarna de
 * straf vervallen is (`cancelled` door 0238/0280). Besluit Quinten 23-11-2026.
 *
 * ⚠️ Het doelscherm roept alleen deze aan, en alleen vanuit de tweede bevestiging
 *    (`tests/beloftes/straf-intrekken.test.ts`).
 */
export async function trekStrafIn(commitmentId: string): Promise<BelofteIntrekking> {
  const uitkomst = await zetIngetrokken(commitmentId);
  if (uitkomst === 'ingetrokken') return { ok: true };
  if (uitkomst === 'beslist') return { ok: false, melding: t('straf.fout.al_afgegaan'), beslist: true };
  return { ok: false, melding: t('commitment.fout.intrekken'), beslist: false };
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
 *    staan. `seq` is een identity-kolom (migratie 0176) en kan niet knopen.
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
    reportError(error, 'commitments.trail');
    throw new Error(t('commitment.fout.spoor'));
  }

  return data ?? [];
}

/**
 * Een verschuldigde straf weer bedienbaar maken nadat de getuige verdween —
 * QS8-333, migratie 0244.
 *
 * ⚠️ **Waarom dit een RPC is en geen update.** De getuige staat in
 *    `beneficiary_user_id`, en die kolom zit voor geen enkele client in de
 *    UPDATE-grant: `grant update (body, image_url, status)`. Een policy
 *    verruimen helpt daar niet — RLS kan geen kolommen beperken, dus de grant is
 *    de grendel en niet de policy. En `resolved` valt buiten de `with_check` van
 *    `commitments_update`, dus afwikkelen kon vanaf de client sowieso niet.
 *
 * ⚠️ **`bevestigd` is geen formaliteit.** Afwikkelen laat een commitment device
 *    uitgaan, en domeinregel 5 zegt dat dat nooit stilzwijgend gebeurt. De
 *    server weigert met `niet_bevestigd` als het scherm de bevestiging overslaat.
 *
 * ⚠️ **De server weigert in zes gevallen** en het scherm hoort ze niet na te
 *    bouwen: niet ingelogd, niet van jou, geen straf, niet verschuldigd, er is
 *    nog een begunstigde, en een getuige buiten je groepen of jezelf. De reden
 *    komt terug in `reason`.
 */
export async function herstelStuurlozeStraf(
  commitmentId: string,
  actie: 'nieuwe_getuige' | 'afwikkelen',
  opties: { readonly getuige?: string; readonly bevestigd?: boolean } = {},
): Promise<Resultaat<true>> {
  // ⚠️ `p_getuige` wordt alleen meegestuurd als hij er is. `exactOptionalPropertyTypes`
  //    staat aan, en een expliciete `undefined` is iets anders dan een weggelaten
  //    veld — PostgREST zou er `null` van maken en de servertak `getuige_ontbreekt`
  //    raken in plaats van de default.
  const argumenten = {
    p_commitment_id: commitmentId,
    p_actie: actie,
    p_bevestigd: opties.bevestigd ?? false,
    ...(opties.getuige === undefined ? {} : { p_getuige: opties.getuige }),
  };

  const { data, error } = await supabase().rpc('herstel_stuurloze_straf', argumenten);

  if (error) {
    // ⚠️ **Geen `code: error.code` erbij**, en dat is geen weglating maar de regel
    //    van `tests/beloftes/foutcode-uit-een-bron.test.ts`: `beschrijfFout()`
    //    zet de code al in de melding, en een tweede exemplaar in de context is
    //    dezelfde waarde langs een tweede weg. Deze regel is er tijdens het
    //    bijtrekken op `main` bij gekomen; hij stond hier al vóór die regel.
    // QS8-660 (review L2): een nieuwe getuige buiten het team van een aandeel is
    // een weigering die de gebruiker kan herstellen, geen storing.
    if (error.hint === TEAMSTRAF_HINT) return { ok: false, melding: t('commitment.fout.teamstraf') };
    reportError(error, 'commitments.herstel');
    return { ok: false, melding: t('commitment.fout.herstel') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };

  if (uitkomst.ok !== true) {
    return { ok: false, melding: herstelMelding(uitkomst.reason) };
  }

  return { ok: true, waarde: true };
}

/** De melding per weigering van `herstel_stuurloze_straf()`. */
function herstelMelding(reden: string | undefined): string {
  if (reden === 'heeft_nog_een_begunstigde') return t('commitment.herstel.heeft_getuige');
  if (reden === 'niet_verschuldigd') return t('commitment.herstel.niet_verschuldigd');
  if (reden === 'geen_groepsgenoot') return t('commitment.herstel.geen_groepsgenoot');
  if (reden === 'niet_jezelf') return t('commitment.herstel.niet_jezelf');
  return t('commitment.fout.herstel');
}
