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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ⚠️ De gedeelde knip, en niet een eigen kopie: hij staat sinds QS8-446 in
//    `scripts/zonder-commentaar.mjs` en is met opzet `.mjs` zodat beide bomen
//    hem kunnen importeren.
import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

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
  'group_overview.closed_this_period — generator':
    true satisfies Eis<Rij<GenFuncties['group_overview']>['closed_this_period'], boolean>,
  'group_overview.closed_this_period — laag':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['closed_this_period'], boolean | null>,
  'group_overview.best_streak — generator':
    true satisfies Eis<Rij<GenFuncties['group_overview']>['best_streak'], number>,
  'group_overview.best_streak — laag':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['best_streak'], number | null>,
  'group_overview.current_streak — generator':
    true satisfies Eis<Rij<GenFuncties['group_overview']>['current_streak'], number>,
  'group_overview.current_streak — laag':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['current_streak'], number | null>,
  'group_overview.last_cycle_start — generator':
    true satisfies Eis<Rij<GenFuncties['group_overview']>['last_cycle_start'], string>,
  'group_overview.last_cycle_start — laag':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['last_cycle_start'], string | null>,
  'group_overview.avatar_url — generator':
    true satisfies Eis<Rij<GenFuncties['group_overview']>['avatar_url'], string>,
  'group_overview.avatar_url — laag':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['avatar_url'], string | null>,
  'group_overview.goal_id — generator':
    true satisfies Eis<Rij<GenFuncties['group_overview']>['goal_id'], string>,
  'group_overview.goal_id — laag':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['goal_id'], string | null>,
  'group_overview.goal_title — generator':
    true satisfies Eis<Rij<GenFuncties['group_overview']>['goal_title'], string>,
  'group_overview.goal_title — laag':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['goal_title'], string | null>,
  'group_overview.goal_target_date — generator':
    true satisfies Eis<Rij<GenFuncties['group_overview']>['goal_target_date'], string>,
  'group_overview.goal_target_date — laag':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['goal_target_date'], string | null>,

  'openstaande_meldingen.toelichting — generator':
    true satisfies Eis<Rij<GenFuncties['openstaande_meldingen']>['toelichting'], string>,
  'openstaande_meldingen.toelichting — laag':
    true satisfies Eis<Rij<CorFuncties['openstaande_meldingen']>['toelichting'], string | null>,
  'openstaande_meldingen.bericht_kopie — generator':
    true satisfies Eis<Rij<GenFuncties['openstaande_meldingen']>['bericht_kopie'], string>,
  'openstaande_meldingen.bericht_kopie — laag':
    true satisfies Eis<
      Rij<CorFuncties['openstaande_meldingen']>['bericht_kopie'],
      string | null
    >,

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
  'group_overview.display_name blijft niet-nullable':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['display_name'], string>,
  'group_overview.total_members blijft niet-nullable':
    true satisfies Eis<Rij<CorFuncties['group_overview']>['total_members'], number>,
  'openstaande_meldingen.reden blijft niet-nullable':
    true satisfies Eis<Rij<CorFuncties['openstaande_meldingen']>['reden'], string>,

  /**
   * ⚠️ **En de laag laat geen tabel of functie vallen.** Drie steekproeven op
   *    velden zeggen niets over de vorm van het gehéél, en `Omit<T, keyof V> & V`
   *    is precies het soort typemachinerie waar een naam stil uit kan vallen —
   *    één typefout in een sleutel en de correctie landt op een nieuwe naam
   *    terwijl de oude blijft staan. Deze twee regels zijn de vorm van regel 18
   *    vraag 1: ze toetsen de naad en niet de twee kanten ervan.
   */
  'de laag kent dezelfde tabelnamen als de generatie':
    true satisfies Eis<keyof CorTabellen, keyof GenTabellen>,
  'de laag kent dezelfde functienamen als de generatie':
    true satisfies Eis<keyof CorFuncties, keyof GenFuncties>,
} as const;

/**
 * Elke client wordt op de correctielaag gebouwd — QS8-569.
 *
 * ⚠️⚠️ **Deze toets bestaat omdat de laag het in een comment vraagt, en dit hele
 *    issue erover gaat dat een comment geen grendel is.** Zet iemand er een
 *    tweede client bij met `createClient<Database>` uit het gegenereerde bestand,
 *    dan vallen álle correcties daar stil zonder dat er iets rood wordt:
 *    `commitments.Insert.tz` wordt weer verplicht (en elke insert compileert dan
 *    naar een gegarandeerde `42501`), en de drie `Returns`-correcties verdwijnen
 *    zonder een woord.
 *
 * ⚠️ Hij leest de bron met de gedeelde knip uit `scripts/zonder-commentaar.mjs`,
 *    want anders telt de regel in `src/lib/database.types.ts` mee die
 *    `createClient<Database, …>` in een **comment** noemt — 📏 dat is de enige
 *    andere plek in de boom waar die tekenreeks staat.
 */
const CLIENTBOUWERS = /(?:createClient|SupabaseClient)<\s*([A-Za-z_$][\w$]*)/g;
const CORRECTIELAAG = 'database.types.correcties';

/** De bomen waar een client op ons schema gebouwd kan worden. */
const BOMEN = ['src', 'app', 'tests', 'scripts'];

/**
 * Wat de zeef overslaat, met de reden erbij.
 *
 * ⚠️ **Eén rij, en hij is onvermijdelijk: dit bestand zelf.** De ijking hieronder
 *    voedt de zeef een bron waarin `createClient<Database>` uit het gegenereerde
 *    bestand komt — dat is precies de vorm die hij moet vinden, en als
 *    tekenreeks niet te onderscheiden van echte code. Een zeef die zijn eigen
 *    proefmateriaal meldt, leer je uitzetten.
 *
 * ⚠️ **Dit register is smal bedoeld.** Een tweede rij is een besluit: zet erbij
 *    wélke client daar gebouwd wordt en waaróm hij niet op de laag hoort.
 */
const ZONDER_TOETS = new Map<string, string>([
  [
    join('tests', 'beloftes', 'typecorrecties.test.ts'),
    'draagt de ijkingsvormen van deze zeef als tekenreeks',
  ],
]);

/**
 * ⚠️ `supabase/functions/` staat er met reden niet bij: die draaien op Deno,
 *    halen hun client met een `jsr:`-specifier en typeren hem niet op dit
 *    schema. 📏 Nagemeten: geen enkel bestand daar noemt `createClient<` buiten
 *    commentaar.
 */
function bronbestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    if (naam === 'node_modules' || naam.startsWith('.')) continue;
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bronbestanden(pad));
    else if (/\.tsx?$/.test(naam)) uit.push(pad);
  }
  return uit;
}

/** Per bestand: de typeargumenten waarmee er een Supabase-client gebouwd wordt. */
export function clientbouwers(bron: string): string[] {
  const code = zonderCommentaar(bron);
  return [...code.matchAll(CLIENTBOUWERS)].map((m) => m[1] ?? '');
}

/**
 * Waar een naam vandaan geïmporteerd wordt, of `null` als hij in dit bestand
 * zelf gedeclareerd is.
 */
export function herkomst(bron: string, naam: string): string | null {
  const code = zonderCommentaar(bron);
  const re = new RegExp(`import\\s+type\\s*\\{[^}]*\\b${naam}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`);
  return re.exec(code)?.[1] ?? null;
}

describe('de correcties op de gegenereerde types', () => {
  it('telt vijfentwintig correcties, elk twee kanten op', () => {
    expect(Object.keys(CORRECTIES)).toHaveLength(50);
    expect(Object.values(CORRECTIES).every((waarde) => waarde === true)).toBe(true);
  });

  it('laat de velden en de namen die er niet in staan met rust', () => {
    expect(Object.values(ONGEMOEID).every((waarde) => waarde === true)).toBe(true);
  });
});

describe('elke Supabase-client wordt op de correctielaag gebouwd', () => {
  const gevallen = BOMEN.flatMap((map) => bronbestanden(map))
    .filter((pad) => !ZONDER_TOETS.has(pad))
    .map((pad) => ({ pad, bron: readFileSync(pad, 'utf8') }))
    .flatMap(({ pad, bron }) => clientbouwers(bron).map((naam) => ({ pad, bron, naam })));

  it('vindt er minstens vijf — anders meet deze toets niets', () => {
    expect(gevallen.length).toBeGreaterThanOrEqual(5);
  });

  it.each(gevallen.map((g) => [`${g.pad} → ${g.naam}`, g] as const))(
    '%s komt uit de correctielaag',
    (_naam, geval) => {
      const vandaan = herkomst(geval.bron, geval.naam);
      expect(vandaan, `${geval.pad} declareert ${geval.naam} zelf of importeert hem niet als type`)
        .not.toBeNull();
      expect(vandaan).toContain(CORRECTIELAAG);
    },
  );
});

describe('de zeef van die toets', () => {
  it('ziet een client die op het gegenereerde bestand gebouwd is', () => {
    const bron = [
      "import type { Database } from './database.types';",
      'export const db = createClient<Database>(url, key);',
    ].join('\n');
    expect(clientbouwers(bron)).toEqual(['Database']);
    expect(herkomst(bron, 'Database')).toBe('./database.types');
  });

  it('laat een vermelding in commentaar met rust', () => {
    const bron = '// createClient<Database, { PostgrestVersion: "14.5" }>(URL, KEY)\nconst x = 1;';
    expect(clientbouwers(bron)).toEqual([]);
  });

  it('leest een naam die niet `Database` heet', () => {
    const bron = [
      "import type { Schema } from '../../src/lib/database.types.correcties';",
      'export type TestDb = SupabaseClient<Schema>;',
    ].join('\n');
    expect(clientbouwers(bron)).toEqual(['Schema']);
    expect(herkomst(bron, 'Schema')).toContain(CORRECTIELAAG);
  });
});
