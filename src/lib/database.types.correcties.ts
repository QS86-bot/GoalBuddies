/**
 * Waar de generator de database verkeerd beschrijft — QS8-569.
 *
 * ⚠️⚠️ **Dit bestand bestaat zodat `src/lib/database.types.ts` gegenereerd kan
 *    blijven.** Dat bestand is een afschrift van productie en `npm run types:db`
 *    overschrijft het in zijn geheel; elke regel die er met de hand in gezet
 *    wordt, is er een die de volgende generatie zonder een woord weggooit.
 *    `src/modules/ai/jobs.ts` schreef dat al sinds 0136 met zoveel woorden op —
 *    *"niet oplossen door `database.types.ts` met de hand bij te werken"* — en
 *    toch stonden er op 21-09-2026 📏 **veertien** handgeschreven correcties in:
 *    acht functies (`meld` 3, `ontdek_groepen` 2, `weekafsluiting_reacties` 2,
 *    `zichtbare_reeksen_van_groep` 2, `zoek_mensen`, `vraag_lidmaatschap_aan`,
 *    `verzoekers_eerder_lid`, `zet_taakzichtbaarheid`) en de view
 *    `mijn_profiel`. Ze zijn bij de hergeneratie van QS8-569 allemaal verdwenen,
 *    zonder een woord en zonder dat er iets rood van werd. **Een regel die alleen
 *    in een comment staat, is geen grendel.**
 *
 * 📏 **Dertien van die veertien staan hieronder terug**, elk met de meting die
 *    hem draagt. De veertiende — `mijn_profiel.Insert.vindbaar` en
 *    `.Update.vindbaar`, waar het handwerk `boolean` schreef en de generator
 *    `boolean | null` — staat er bewust **niet** bij: `mijn_profiel` is een view
 *    waar geen enkele client in schrijft, dus er is niets om te corrigeren. Een
 *    rij zonder gemeten aanleiding is precies wat dit bestand niet mag worden.
 *    Er zijn er twee bijgekomen: `commitments.Insert.tz` (nieuw sinds `0280`,
 *    zie hieronder) en `vraag_ai_job.p_goal_id`, dat hiervoor een cast in
 *    `src/modules/ai/jobs.ts` was — één mechanisme en niet twee.
 *
 * ⚠️ **Dit is geen plek om het schema bij te werken.** Elke rij hieronder
 *    beschrijft iets wat de generator *niet kan weten*, niet iets wat vooruitloopt
 *    op een migratie. Een handtekening die op een migratie wacht hoort hier niet:
 *    die komt vanzelf mee zodra de migratie uitgerold en opnieuw gegenereerd is.
 *
 * ⚠️⚠️ **En dit is géén complete doorlichting van de 199 functies — dat hoort
 *    erbij te staan.** Wat hier ligt is wat een aanroeper vandaag nodig heeft
 *    (klasse 1 en 2, want die breken de build) plús wat gemeten gevaarlijk is
 *    (klasse 3, die breekt niets). 📏 Een voorbeeld van wat er dus *niet* in
 *    staat: `group_overview.p_na_joined_at` en `.p_na_user_id` hebben
 *    `DEFAULT NULL` en zijn dus net zo goed nullable als `weekafsluiting_reacties`
 *    hieronder — alleen stuurt vandaag niemand er `null` heen. Een volledige veeg
 *    over alle `DEFAULT NULL`-argumenten is een eigen ronde met een eigen
 *    ijking; hij staat in `docs/ENGINEER-REVIEW.md`. **Lees deze lijst dus als
 *    "wat er gemeten is", niet als "wat er is".**
 *
 * ⚠️ **Elke rij staat onder toets.** `tests/beloftes/typecorrecties.test.ts` legt per
 *    correctie vast dát de generator hem vandaag nog nodig heeft. Wordt een
 *    correctie overbodig — een `DEFAULT` erbij, een generator die triggers leest —
 *    dan wordt die test rood en gaat de rij eruit. Zonder die kant groeit dit
 *    bestand mee en krimpt het nooit.
 *
 * De drie klassen, alle drie gemeten op productie op 21-09-2026 (stand `0294`):
 *
 *   1. **Een NOT NULL-kolom zonder DEFAULT die een trigger vult.** De generator
 *      leest `is_nullable` en `column_default` en ziet geen triggers, dus zo'n
 *      kolom wordt verplicht in `Insert` — terwijl geen enkele client hem mag
 *      schrijven.
 *   2. **Een functieargument dat NULL aanneemt.** PostgreSQL kent geen
 *      nullability op een argument, dus de generator schrijft overal `string`.
 *   3. **Een `RETURNS TABLE`-kolom die NULL kan zijn.** Ook daar kent de
 *      catalogus geen nullability, en de generator kiest niet-nullable. Dit is de
 *      stille richting: de types beloven een waarde die er niet altijd is.
 */
import type { Database as Gegenereerd } from './database.types';

/**
 * `T`, met de velden uit `V` eroverheen.
 *
 * ⚠️ **Hier stond een stap die de kruising weer platsloeg** (`{ [K in keyof T]: T[K] }`),
 *    met het argument dat `supabase-js` een kruising bij `.insert()` en `.rpc()`
 *    anders zou afleiden dan het platte object dat de generator schrijft. 📏 Dat
 *    is gemeten en het maakt niets uit: mét en zonder die stap geeft
 *    `npm run typecheck` nul fouten, en de ijking van `zet_taakzichtbaarheid`
 *    geeft in béide vormen dezelfde drie fouten — de controle blijft dus even
 *    streng. De stap is eruit, en deze regel staat er zodat niemand hem "voor de
 *    zekerheid" terugzet: een onderbouwing zonder meting leest als een reden om
 *    er niet aan te twijfelen.
 */
type Met<T, V> = Omit<T, keyof V> & V;

type Publiek = Gegenereerd['public'];
type Tabellen = Publiek['Tables'];
type Functies = Publiek['Functions'];

/** De `Args` van functie `N`, met `V` eroverheen. */
type MetArgs<N extends keyof Functies, V> = Met<
  Functies[N],
  { Args: Met<Functies[N] extends { Args: infer A } ? A : never, V> }
>;

/** Eén rij uit de `Returns` van functie `N`, met `V` eroverheen. */
type MetRij<N extends keyof Functies, V> = Met<
  Functies[N],
  {
    Returns: Met<
      Functies[N] extends { Returns: readonly (infer R)[] } ? R : never,
      V
    >[];
  }
>;

/**
 * Klasse 1 — een kolom die de client niet schrijft en de trigger wel.
 *
 * 📏 `commitments.tz` is `not null` en heeft géén `column_default`; de trigger
 *    `commitments_zone` (BEFORE INSERT, `bevries_commitmentzone()`, migratie
 *    `0280`) zet hem uit het profiel van de doeleigenaar. De INSERT-kolomgrant
 *    van `authenticated` is
 *    `beneficiary_group_id, beneficiary_user_id, body, confirmed_at, goal_id, image_url, type`
 *    — `tz` staat er niet in. Een client die hem meestuurt krijgt `42501`.
 *
 * ⚠️ Alleen `Insert`. `Row` en `Update` blijven zoals de generator ze schrijft:
 *    `service_role` leest en schrijft die kolom wél, en dit bestand corrigeert de
 *    database niet — het corrigeert wat de generator niet kan zien.
 */
type GecorrigeerdeTabellen = Met<
  Tabellen,
  {
    commitments: Met<
      Tabellen['commitments'],
      { Insert: Met<Tabellen['commitments']['Insert'], { tz?: string }> }
    >;
  }
>;

/**
 * Klasse 2 en 3 — argumenten die NULL aannemen, en kolommen die NULL teruggeven.
 *
 * Per rij de meting die hem draagt:
 *
 * | functie | veld | gemeten |
 * |---|---|---|
 * | `meld` | `p_subject_id`, `p_message_id`, `p_toelichting` | `DEFAULT NULL::uuid` / `::text` |
 * | `ontdek_groepen` | `p_categorie`, `p_taal` | `DEFAULT NULL::text` |
 * | `vraag_ai_job` | `p_goal_id` | geen default; het lichaam vertakt op `p_goal_id is not null` — `plan` (0136) roept hem zonder doel aan |
 * | `vraag_lidmaatschap_aan` | `p_bericht` | `DEFAULT NULL::text` |
 * | `weekafsluiting_reacties` | `p_na_at`, `p_na_id` | `DEFAULT NULL` — de cursor van de eerste pagina |
 * | `zet_taakzichtbaarheid` | `p_group_id` | geen default, en `null` ís de handeling: `case when p_group_id is null then 'private'` |
 * | `verzoekers_eerder_lid` | `op` | komt uit een `left join lateral`, dus leeg als de gebeurtenis ontbreekt |
 * | `zichtbare_reeksen_van_groep` | `best_streak`, `last_cycle_start` | `case when … then … end` **zonder `else`** — de maskering van `0078` |
 * | `zoek_mensen` | `avatar_url` | `profiles.avatar_url` is `is_nullable = YES` |
 * | `openstaande_meldingen` | `toelichting`, `bericht_kopie` | `reports.toelichting` en `reports.bericht_kopie` zijn `is_nullable = YES` |
 * | `group_overview` | acht kolommen, zie hieronder | drie oorzaken tegelijk |
 *
 * ⚠️⚠️ **`group_overview` is de rij die er bij de eerste ronde niet in stond, en
 *    dat is de leerzame fout van dit bestand.** De correctie landde op
 *    `zichtbare_reeksen_van_groep()` — die de maskering draagt en 📏 **nul**
 *    aanroepers heeft in `src/` en `app/` — terwijl de functie die het
 *    groepsscherm écht voedt ongecorrigeerd bleef. Gevonden door de
 *    security-ronde op deze PR. 📏 Gemeten met `pg_get_functiondef()` op
 *    productie, acht kolommen met drie oorzaken:
 *
 *      - `closed_this_period` — `case when not coalesce(…) then null else exists(…) end`.
 *        `null` is hier met zoveel woorden *"hier geef ik geen antwoord op"*, en
 *        `0208` schrijft erbij waaróm: `false` zou een gemiste week van iemand
 *        anders tonen, zichtbaar voor de groep. **Dit is domeinregel 7 in een
 *        kolom**, en een type dat `boolean` zegt maakt van "geen antwoord"
 *        vanzelf "nee" zodra iemand er een ternair op zet.
 *      - `current_streak`, `best_streak`, `last_cycle_start` — komen via
 *        `left join zichtbare_reeksen_van_groep(…)`, dus leeg door de join én
 *        door de maskering erin.
 *      - `avatar_url` (`profiles.avatar_url` is nullable) en `goal_id`,
 *        `goal_title`, `goal_target_date` (een `left join lateral` op het
 *        actieve doel — een lid zonder doel geeft drie lege kolommen).
 *
 *    De andere acht kolommen blijven niet-nullable en dat is gemeten:
 *    `user_id`, `role`, `member_status`, `joined_at` en `display_name` komen uit
 *    `not null`-kolommen via een `join`, en `milestones_total`,
 *    `milestones_done` en `total_members` zijn `coalesce(…, 0)` of `count(*)`.
 *
 * ⚠️ `RpcRij<>` uit `src/shared/api` dekt deze functie vandaag óók, op één
 *    aanroepplek. Dat is een andere grendel met een andere reden — hij vangt een
 *    kolom die ontbreekt omdat de types achterlopen — en hij werkt alleen waar
 *    iemand eraan denkt. De correctie hier is een eigenschap van het type.
 *
 * ⚠️⚠️ **De rij van `zichtbare_reeksen_van_groep` is de zwaarste, en niet omdat
 *    hij compileert of niet.** Die twee kolommen zijn leeg voor wie ze niet mag
 *    zien — dat is domeinregel 7 in de functie zelf. Een type dat `number` zegt,
 *    vertelt de schermlaag dat er altijd een reeks is, en dan is de maskering iets
 *    wat je pas op een echte database merkt. Geen van de drie klassen faalt luid;
 *    deze faalt van de drie het stilst.
 */
type GecorrigeerdeFuncties = Met<
  Functies,
  {
    meld: MetArgs<
      'meld',
      {
        p_message_id?: string | null;
        p_subject_id?: string | null;
        p_toelichting?: string | null;
      }
    >;
    ontdek_groepen: MetArgs<
      'ontdek_groepen',
      { p_categorie?: string | null; p_taal?: string | null }
    >;
    vraag_ai_job: MetArgs<'vraag_ai_job', { p_goal_id: string | null }>;
    vraag_lidmaatschap_aan: MetArgs<'vraag_lidmaatschap_aan', { p_bericht?: string | null }>;
    weekafsluiting_reacties: MetArgs<
      'weekafsluiting_reacties',
      { p_na_at?: string | null; p_na_id?: string | null }
    >;
    zet_taakzichtbaarheid: MetArgs<'zet_taakzichtbaarheid', { p_group_id: string | null }>;
    group_overview: MetRij<
      'group_overview',
      {
        avatar_url: string | null;
        goal_id: string | null;
        goal_title: string | null;
        goal_target_date: string | null;
        current_streak: number | null;
        best_streak: number | null;
        last_cycle_start: string | null;
        closed_this_period: boolean | null;
      }
    >;
    /**
     * ⚠️ **Klasse 3, en hier is het de tekst die een mens moet lézen.**
     *    `openstaande_meldingen()` (0296) geeft `r.toelichting` en
     *    `r.bericht_kopie` rechtstreeks door, en 📏 allebei staan `is_nullable
     *    = YES` op `public.reports` — een melding zonder toelichting is de
     *    gewone vorm, en `bericht_kopie` is leeg zodra er geen bericht aan hangt.
     *    Een type dat `string` zegt, laat het beheerscherm `"null"` of een lege
     *    aanhaling tonen op de plek waar de aanleiding hoort te staan.
     *
     *    De tien andere kolommen blijven niet-nullable en dat is gemeten:
     *    `id`, `group_id`, `subject_id`, `reden`, `status` en `created_at` zijn
     *    `not null` op `reports`, `groepsnaam` en `onderwerp_naam` komen via een
     *    gewone `join` uit `groups.name` en `profiles.display_name` (allebei
     *    `not null`), en `meldingen_over_onderwerp` en `via_escalatie` zijn een
     *    `count(*)::integer` en een `not (…)`.
     */
    openstaande_meldingen: MetRij<
      'openstaande_meldingen',
      { toelichting: string | null; bericht_kopie: string | null }
    >;
    verzoekers_eerder_lid: MetRij<'verzoekers_eerder_lid', { op: string | null }>;
    zichtbare_reeksen_van_groep: MetRij<
      'zichtbare_reeksen_van_groep',
      { best_streak: number | null; last_cycle_start: string | null }
    >;
    zoek_mensen: MetRij<'zoek_mensen', { avatar_url: string | null }>;
  }
>;

type GecorrigeerdPubliek = Met<
  Publiek,
  { Tables: GecorrigeerdeTabellen; Functions: GecorrigeerdeFuncties }
>;

/**
 * Het schema zoals de database zich gedraagt.
 *
 * ⚠️ **Importeer dit en niet `./database.types` waar je een client bouwt.**
 *    `src/lib/supabase.ts` en `tests/rls/harness.ts` doen dat; wie er een derde
 *    client bij zet, hoort hier langs te komen.
 */
export type Database = Met<Gegenereerd, { public: GecorrigeerdPubliek }>;
