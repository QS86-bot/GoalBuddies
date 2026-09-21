/**
 * Elke correctie op de gegenereerde types is vandaag nog nodig — QS8-569.
 *
 * ⚠️⚠️ **Dit is een tsc-toets en geen vitest-toets, en dat is met opzet.** De
 *    belofte van `src/lib/database.types.correcties.ts` is een uitspraak over
 *    *types*, en die is niet op runtime te lezen: bij het bouwen van de bundel
 *    is er van `Args` en `Returns` niets meer over. Elke regel hieronder staat
 *    daarom onder `satisfies`, en de grendel is `npm run typecheck` — die draait
 *    in de poort én in CI (`ci-controles.mjs`, baan `repo`). De `it()` eronder is
 *    er zodat vitest dit bestand niet leeg noemt; hij bewijst niets.
 *
 * ⚠️ **Twee kanten per correctie, en de eerste is de belangrijkste.**
 *
 *    - de **generatorkant** legt vast dat de generator het vandaag nog fout doet.
 *      Wordt die rood, dan is de correctie overbodig geworden — een `DEFAULT` in
 *      de database, een generator die triggers leest, een hernoemd argument — en
 *      dan hoort de rij uit het correctiebestand te verdwijnen. Zonder deze kant
 *      groeit dat bestand alleen maar en krimpt het nooit, en dan is het over een
 *      jaar een lijst waarvan niemand meer weet welke rijen er nog toe doen.
 *    - de **correctiekant** legt vast dat de laag doet wat hij belooft.
 *
 *    ⚠️⚠️ **De generatorkant is óók de grendel op handwerk in het gegenereerde
 *    bestand.** Zet iemand het `| null` met de hand terug in
 *    `src/lib/database.types.ts`, dan wordt die kant rood. 📏 Dat is precies wat
 *    er tussen `0170` en `0294` gebeurd is en wat niemand zag: **veertien**
 *    handgeschreven correcties in een bestand dat `npm run types:db` in zijn
 *    geheel overschrijft, terwijl `src/modules/ai/jobs.ts` sinds `0136` met
 *    zoveel woorden opschrijft dat dat niet de manier is.
 *
 * ⚠️ De toetsen hieronder grijpen naar het **type** en niet naar een regel in een
 *    bestand. Een tekstzoektocht zou hier niet werken ook al zou je hem willen:
 *    📏 `avatar_url: string` staat op drie plekken in de generatie en
 *    `p_group_id: string` op meer dan tien.
 */
import type { Database as Gegenereerd } from '../../src/lib/database.types';
import type { Database as Gecorrigeerd } from '../../src/lib/database.types.correcties';

/**
 * `true` als `A` en `B` exact hetzelfde type zijn, en anders een objecttype —
 * waardoor `true satisfies Eis<A, B>` een compileerfout geeft die allebei de
 * types noemt.
 *
 * ⚠️ De dubbele functievorm is geen omhaal: `A extends B ? … : …` zegt
 *    *toewijsbaar* en niet *gelijk*, en dan is `string` gelijk aan
 *    `string | null` zodra je hem één kant op leest. Precies de helft die hier
 *    telt zou dan ongemeten blijven.
 */
type Eis<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : { verwacht: B; gekregen: A };

type GenTabellen = Gegenereerd['public']['Tables'];
type GenFuncties = Gegenereerd['public']['Functions'];
type CorTabellen = Gecorrigeerd['public']['Tables'];
type CorFuncties = Gecorrigeerd['public']['Functions'];

/** Eén rij uit de `Returns` van een functie. */
type Rij<T> = T extends { Returns: readonly (infer R)[] } ? R : never;

/**
 * De vijftien correcties, elk twee kanten op.
 *
 * ⚠️ Elke sleutel noemt de meting die de rij draagt; de onderbouwing staat bij
 *    de rij zelf in `src/lib/database.types.correcties.ts`.
 */
const CORRECTIES = {
  // ── Klasse 1: een NOT NULL-kolom zonder DEFAULT die een trigger vult ──────
  'commitments.Insert.tz — de generator maakt hem verplicht':
    true satisfies Eis<GenTabellen['commitments']['Insert']['tz'], string>,
  'commitments.Insert.tz — de laag maakt hem optioneel':
    true satisfies Eis<CorTabellen['commitments']['Insert']['tz'], string | undefined>,

  // ── Klasse 2: een functieargument dat NULL aanneemt ───────────────────────
  'meld.p_message_id — generator':
    true satisfies Eis<GenFuncties['meld']['Args']['p_message_id'], string | undefined>,
  'meld.p_message_id — laag':
    true satisfies Eis<CorFuncties['meld']['Args']['p_message_id'], string | null | undefined>,
  'meld.p_subject_id — generator':
    true satisfies Eis<GenFuncties['meld']['Args']['p_subject_id'], string | undefined>,
  'meld.p_subject_id — laag':
    true satisfies Eis<CorFuncties['meld']['Args']['p_subject_id'], string | null | undefined>,
  'meld.p_toelichting — generator':
    true satisfies Eis<GenFuncties['meld']['Args']['p_toelichting'], string | undefined>,
  'meld.p_toelichting — laag':
    true satisfies Eis<CorFuncties['meld']['Args']['p_toelichting'], string | null | undefined>,

  'ontdek_groepen.p_categorie — generator':
    true satisfies Eis<GenFuncties['ontdek_groepen']['Args']['p_categorie'], string | undefined>,
  'ontdek_groepen.p_categorie — laag':
    true satisfies Eis<
      CorFuncties['ontdek_groepen']['Args']['p_categorie'],
      string | null | undefined
    >,
  'ontdek_groepen.p_taal — generator':
    true satisfies Eis<GenFuncties['ontdek_groepen']['Args']['p_taal'], string | undefined>,
  'ontdek_groepen.p_taal — laag':
    true satisfies Eis<CorFuncties['ontdek_groepen']['Args']['p_taal'], string | null | undefined>,

  'vraag_ai_job.p_goal_id — generator':
    true satisfies Eis<GenFuncties['vraag_ai_job']['Args']['p_goal_id'], string>,
  'vraag_ai_job.p_goal_id — laag':
    true satisfies Eis<CorFuncties['vraag_ai_job']['Args']['p_goal_id'], string | null>,

  'vraag_lidmaatschap_aan.p_bericht — generator':
    true satisfies Eis<
      GenFuncties['vraag_lidmaatschap_aan']['Args']['p_bericht'],
      string | undefined
    >,
  'vraag_lidmaatschap_aan.p_bericht — laag':
    true satisfies Eis<
      CorFuncties['vraag_lidmaatschap_aan']['Args']['p_bericht'],
      string | null | undefined
    >,

  'weekafsluiting_reacties.p_na_at — generator':
    true satisfies Eis<
      GenFuncties['weekafsluiting_reacties']['Args']['p_na_at'],
      string | undefined
    >,
  'weekafsluiting_reacties.p_na_at — laag':
    true satisfies Eis<
      CorFuncties['weekafsluiting_reacties']['Args']['p_na_at'],
      string | null | undefined
    >,
  'weekafsluiting_reacties.p_na_id — generator':
    true satisfies Eis<
      GenFuncties['weekafsluiting_reacties']['Args']['p_na_id'],
      string | undefined
    >,
  'weekafsluiting_reacties.p_na_id — laag':
    true satisfies Eis<
      CorFuncties['weekafsluiting_reacties']['Args']['p_na_id'],
      string | null | undefined
    >,

  'zet_taakzichtbaarheid.p_group_id — generator':
    true satisfies Eis<GenFuncties['zet_taakzichtbaarheid']['Args']['p_group_id'], string>,
  'zet_taakzichtbaarheid.p_group_id — laag':
    true satisfies Eis<CorFuncties['zet_taakzichtbaarheid']['Args']['p_group_id'], string | null>,

  // ── Klasse 3: een RETURNS TABLE-kolom die NULL kan zijn ───────────────────
  'verzoekers_eerder_lid.op — generator':
    true satisfies Eis<Rij<GenFuncties['verzoekers_eerder_lid']>['op'], string>,
  'verzoekers_eerder_lid.op — laag':
    true satisfies Eis<Rij<CorFuncties['verzoekers_eerder_lid']>['op'], string | null>,

  'zichtbare_reeksen_van_groep.best_streak — generator':
    true satisfies Eis<Rij<GenFuncties['zichtbare_reeksen_van_groep']>['best_streak'], number>,
  'zichtbare_reeksen_van_groep.best_streak — laag':
    true satisfies Eis<
      Rij<CorFuncties['zichtbare_reeksen_van_groep']>['best_streak'],
      number | null
    >,
  'zichtbare_reeksen_van_groep.last_cycle_start — generator':
    true satisfies Eis<
      Rij<GenFuncties['zichtbare_reeksen_van_groep']>['last_cycle_start'],
      string
    >,
  'zichtbare_reeksen_van_groep.last_cycle_start — laag':
    true satisfies Eis<
      Rij<CorFuncties['zichtbare_reeksen_van_groep']>['last_cycle_start'],
      string | null
    >,

  'zoek_mensen.avatar_url — generator':
    true satisfies Eis<Rij<GenFuncties['zoek_mensen']>['avatar_url'], string>,
  'zoek_mensen.avatar_url — laag':
    true satisfies Eis<Rij<CorFuncties['zoek_mensen']>['avatar_url'], string | null>,
} as const;

/**
 * ⚠️ **De correctielaag raakt verder niets aan**, en dat is de kant die een
 *    lijst met uitzonderingen nodig heeft: een laag die stilletjes méér
 *    verandert dan zijn tabel noemt, is geen correctie meer maar een tweede
 *    schema. Drie steekproeven op velden die er niet in staan.
 */
const ONGEMOEID = {
  'commitments.Insert.body blijft verplicht':
    true satisfies Eis<CorTabellen['commitments']['Insert']['body'], string>,
  'meld.p_group_id blijft niet-nullable':
    true satisfies Eis<CorFuncties['meld']['Args']['p_group_id'], string>,
  'zoek_mensen.display_name blijft niet-nullable':
    true satisfies Eis<Rij<CorFuncties['zoek_mensen']>['display_name'], string>,
} as const;

describe('de correcties op de gegenereerde types', () => {
  it('telt vijftien correcties, elk twee kanten op', () => {
    expect(Object.keys(CORRECTIES)).toHaveLength(30);
    expect(Object.values(CORRECTIES).every((waarde) => waarde === true)).toBe(true);
  });

  it('laat de velden die er niet in staan met rust', () => {
    expect(Object.values(ONGEMOEID).every((waarde) => waarde === true)).toBe(true);
  });
});
