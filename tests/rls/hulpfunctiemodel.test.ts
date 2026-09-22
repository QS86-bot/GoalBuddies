import { describe, expect, it } from 'vitest';

import { psql, psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Het model van de lidmaatschapshulpfuncties — QS8-146, migratie 0160.
 *
 * ⚠️ **De belofte is niet "deze functies zien er hetzelfde uit".** Ze horen juist
 *    te verschillen: de schrijfkant sluit een archief af en de leeskant niet, en
 *    twee ervan kijken alleen naar open groepen. De belofte is: *elk verschil
 *    tussen deze functies is een besluit dat iemand heeft opgeschreven, en geen
 *    restant van de volgorde waarin ze gegroeid zijn.*
 *
 * ⚠️⚠️ **Waarom dat een grendel verdient.** Elk verschil hier is een
 *    autorisatieverschil, en ze zitten samen onder tientallen policies. 0029
 *    schreef op dat alleen de kijkerskant afgeknepen wordt; 0102 draaide dat om
 *    voor `shares_group_with_goal()` met een meting erbij; en
 *    `shares_group_with_user()` bleef tot 0160 in de oude stand staan zonder dat
 *    één document dat zei. Dat is niet te vinden met een test die één functie
 *    toetst — het verschil zít tussen de functies.
 *
 * ⚠️ **De structuur wordt uit de gedeployde bron gelezen** (`pg_proc.prosrc`,
 *    niet de migratiebestanden — `pg_get_functiondef()` is de waarheid) en de
 *    bedóéling staat hieronder in het register, met een reden per rij. Een
 *    functie die niet in het register staat, maakt de test rood: dan hoort er
 *    iemand een besluit te nemen in plaats van de dichtstbijzijnde functie te
 *    kopiëren.
 *
 * ⚠️ **De detectoren tellen en beoordelen niet.** Ze zeggen hóéveel
 *    lidmaatschapsrijen op status worden afgeknepen en in welke vorm, niet dat
 *    die toets aan de goede rij hangt. Dat doen de gedragstests —
 *    `uitgezet-lid-is-geen-groepsgenoot`, `vertrek`, `hulpfuncties`, `epic7`.
 *    Wat dit bestand bewaakt is dat niemand een van deze assen stilzwijgend
 *    verschuift.
 *
 * IJKING — met de hand gedraaid op 04-09-2026:
 *
 *   A  de tegenpartijtoets uit `shares_group_with_user()`      → 1 rood, met naam
 *   A' idem, mét een commentaarregel die het predicaat citeert → 1 rood
 *   B  de archieftoets uit `is_group_member()`                 → 1 rood
 *   C  een elfde hulpfunctie erbij, niet in het register       → 1 rood
 *   D  een registerrij voor een functie die niet bestaat       → 1 rood
 *   E  `<> 'inactive'` naar `= 'active'` in één functie        → 1 rood
 *
 * ⚠️ **A' is er pas na de security-review op deze branch, en A alléén bewaakte
 *    te weinig.** `prosrc` is de kale body inclusief `--`-regels, en dit project
 *    schrijft veel toelichting ín een functie. 📏 Gemeten: haal het echte
 *    `and theirs.status <> 'inactive'` weg en laat een rollback-notitie staan die
 *    het citeert, en de teller stond nog steeds op twee — de mutant overleefde.
 *    Twee functies in `public` dragen vandaag al zo'n regel. Vandaar dat
 *    `gedeployd()` het commentaar in SQL wegknipt.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'shares_group_with_user'",
  import.meta.url,
);

/** Wat een functie over lidmaatschap toetst, geteld en niet beoordeeld. */
interface Model {
  /** Hoeveel lidmaatschapsrijen worden afgeknepen met `<> 'inactive'`. */
  readonly nietInactief: number;
  /** Hoeveel statustoetsen de strengere vorm `= 'active'` gebruiken. */
  readonly alleenActief: number;
  /** Sluit hij een gearchiveerde groep af met `<> 'archived'`? */
  readonly archief: boolean;
  /** Kijkt hij alleen naar open groepen? */
  readonly open: boolean;
}

interface Rij extends Model {
  readonly reden: string;
}

/**
 * Het besluit per functie. **Elke rij draagt een reden**, want een tabel zonder
 * redenen is een tweede kopie van de bron en bewaakt dan niets.
 */
const REGISTER: Readonly<Record<string, Rij>> = {
  is_group_member: {
    nietInactief: 1,
    alleenActief: 0,
    archief: true,
    open: false,
    reden:
      'De schrijfkant. 0092 zette de archieftoets hier omdat tien schrijfpolicies ' +
      'hierlangs lopen; 0153 splitste de leeskant af als mag_groep_lezen().',
  },
  is_group_admin: {
    nietInactief: 1,
    alleenActief: 0,
    archief: true,
    open: false,
    reden: 'Zelfde kant als is_group_member(); een archief heeft geen beheer nodig (0092).',
  },
  mag_groep_lezen: {
    nietInactief: 1,
    alleenActief: 0,
    archief: false,
    open: false,
    reden:
      'De leeskant (0153, QS8-217): een archief hoort leesbaar te zijn. archiefleesgat() ' +
      'bewaakt dat geen schrijfpolicy hierlangs gaat lopen.',
  },
  lid_van_open_groep: {
    nietInactief: 1,
    alleenActief: 0,
    archief: true,
    open: true,
    reden:
      'De grendel onder het klassement van A54 (0141): in een beschermde groep geeft ' +
      'de RPC nul rijen. Eén afknijping, want het klassement gaat over de groep en ' +
      'niet over één ander lid.',
  },
  shares_group_with_goal: {
    nietInactief: 2,
    alleenActief: 0,
    archief: true,
    open: false,
    reden:
      'De eigenaar wordt óók getoetst sinds 0102 (QS8-57): zonder dat bleef een oud-lid ' +
      'zijn doel aan de verlaten groep uitdelen. De archieftoets staat hier wél ondanks ' +
      'de leeskant, want weekly_goals draagt missed en carried (0153).',
  },
  deelt_open_groep_met_doel: {
    nietInactief: 2,
    alleenActief: 0,
    archief: true,
    open: true,
    reden: 'De open-groepvariant van shares_group_with_goal(), zelfde model (0141).',
  },
  shares_group_with_user: {
    nietInactief: 2,
    alleenActief: 0,
    archief: false,
    open: false,
    reden:
      'Tegenpartijtoets sinds 0160 (QS8-146): uitgezet worden maakte je niet onzichtbaar ' +
      'terwijl zelf vertrekken dat wél deed. Geen archieftoets, want dit is de leeskant — ' +
      'hij draagt profiles_select en de avataremmer.',
  },

  // ── Drie die de persoon als parameter krijgen in plaats van uit het JWT ────
  //
  // ⚠️ Ze staan hier omdat ze een lidmaatschapsoordeel vellen, en dat is waar de
  //    belofte over gaat. Zou de afleiding `auth.uid()` eisen, dan vielen ze
  //    erbuiten — precies het gat dat de security-review op 0160 aanwees.
  kan_beoordeeld_worden: {
    nietInactief: 1,
    alleenActief: 0,
    archief: false,
    open: false,
    reden:
      'Vraagt of er in een gekoppelde groep íemand anders zit die mag beoordelen (0023). ' +
      'Schrijft `is distinct from` in plaats van `<>`; geen archieftoets, want de ' +
      'goedkeuringspolicy die hij spiegelt heeft er ook geen.',
  },
  blokkade_met_groep: {
    nietInactief: 1,
    alleenActief: 0,
    archief: false,
    open: false,
    reden:
      'Vraagt of iemand in deze groep een blokkade heeft met de aangeboden gebruiker ' +
      '(0145). Geen archieftoets: een blokkade geldt ook in een archief.',
  },
  heeft_nog_beoordelaar: {
    nietInactief: 0,
    alleenActief: 2,
    archief: false,
    open: false,
    reden:
      '⚠️ De enige die `= active` schrijft, en dat is een gepaard besluit en geen slip: ' +
      'hij is de spiegel van vastgelopen_goedkeuringen() (0147) en moet exact dezelfde ' +
      'verzameling opleveren. Gevolg is wél dat een adempauze niet als beoordelaar telt, ' +
      'anders dan overal elders. Staat als open vraag in docs/ENGINEER-REVIEW.md (04-09).',
  },
};

/**
 * Elke `SECURITY DEFINER`-functie die een lidmaatschapsoordeel velt.
 *
 * ⚠️⚠️ **Het commentaar gaat er in SQL af, en dat is geen netheid maar de grendel
 *    zelf** — zie ijking A' in de kop.
 *
 * ⚠️ **En de afleiding vraagt niet naar `auth.uid()`.** Deed ze dat wel, dan
 *    vielen de laatste drie registerrijen erbuiten: die krijgen de persoon als
 *    parameter in plaats van hem uit het JWT te halen, maar vellen wél een
 *    lidmaatschapsoordeel. De belofte gaat over dat oordeel en niet over waar de
 *    persoon vandaan komt.
 */
let gelezen: Map<string, string> | null = null;

/**
 * ⚠️ **Lui, en dat is geen optimalisatie.** Stond de aanroep in de body van de
 *    `describe`, dan draaide hij óók als de suite overgeslagen wordt: vitest
 *    voert een `describe.skipIf`-callback gewoon uit om de tests te verzamelen.
 *    📏 Zo ging deze suite in CI onderuit — `psql: connection refused` op de
 *    machine zonder stack, terwijl de 73 andere RLS-bestanden netjes zwegen.
 */
function functies(): Map<string, string> {
  gelezen ??= gedeployd();
  return gelezen;
}

function gedeployd(): Map<string, string> {
  const uit = psql(`
    select p.proname || E'\\t'
        || replace(regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g'), chr(10), ' ')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and pg_get_function_result(p.oid) = 'boolean'
      and p.prosrc like '%group_members%'
    order by 1
  `);

  return new Map(
    uit
      .split('\n')
      .filter((r) => r.includes('\t'))
      .map((r) => {
        const [naam, ...rest] = r.split('\t');
        return [naam as string, rest.join('\t')];
      }),
  );
}

/**
 * ⚠️ Twee schrijfwijzen voor hetzelfde, want `kan_beoordeeld_worden()` gebruikt
 *    `is distinct from`. Eén ervan missen laat een functie eruitzien alsof hij
 *    zijn model heeft laten vallen terwijl hij het gewoon anders spelt.
 */
const NIET_INACTIEF = /(?:<>|is\s+distinct\s+from)\s*'inactive'/g;
const ALLEEN_ACTIEF = /\.status\s*=\s*'active'/g;

export function modelVan(bron: string): Model {
  return {
    nietInactief: (bron.match(NIET_INACTIEF) ?? []).length,
    alleenActief: (bron.match(ALLEEN_ACTIEF) ?? []).length,
    archief: /status\s*<>\s*'archived'/.test(bron),
    open: /zichtbaarheid\s*=\s*'open'/.test(bron),
  };
}

describe.skipIf(!beschikbaar)('het model van de lidmaatschapshulpfuncties', () => {
  it('vindt ze daadwerkelijk, en verzint ze niet', () => {
    // ⚠️ Zonder deze regel is alles hieronder groen zodra de afleiding niets meer
    //    vindt — bijvoorbeeld doordat `prosecdef` ooit verandert.
    expect(functies().size, 'de afleiding vond geen enkele hulpfunctie').toBeGreaterThanOrEqual(10);
  });

  it('noemt elke gedeployde hulpfunctie in het register', () => {
    const onbenoemd = [...functies().keys()].filter((naam) => !(naam in REGISTER));

    expect(
      onbenoemd,
      'deze hulpfunctie(s) noemen hun model niet. Zet ze in het register hierboven ' +
        'met een reden — elk verschil tussen deze functies is een autorisatieverschil, ' +
        'en kopiëren van de buurman is precies hoe QS8-146 ontstond.',
    ).toEqual([]);
  });

  it('en het register noemt geen functie die niet bestaat', () => {
    const verdwenen = Object.keys(REGISTER).filter((naam) => !functies().has(naam));
    expect(verdwenen, 'het register loopt achter op de database').toEqual([]);
  });

  for (const [naam, rij] of Object.entries(REGISTER)) {
    it(`${naam} staat zoals besloten`, () => {
      const bron = functies().get(naam);
      if (bron === undefined) return; // de test hierboven meldt dit al

      expect(modelVan(bron), rij.reden).toEqual({
        nietInactief: rij.nietInactief,
        alleenActief: rij.alleenActief,
        archief: rij.archief,
        open: rij.open,
      });
    });
  }

  /**
   * ⚠️ **Dit stond eerst als een kale regel "nergens `= active`", en dat was te
   *    breed.** Het weerde één functie die het met reden anders doet
   *    (`heeft_nog_beoordelaar`, de spiegel van `vastgelopen_goedkeuringen()`),
   *    en een grendel die een terecht geval afkeurt, leer je uitzetten. De vorm
   *    staat nu per rij in het register en het verschil is één woord dat je in
   *    een diff niet ziet zonder de regel te kennen.
   */
  it('houdt de twee afknijpvormen uit elkaar in plaats van er één te verbieden', () => {
    const vormen = [...functies().entries()].map(([naam, bron]) => {
      const m = modelVan(bron);
      return { naam, streng: m.alleenActief > 0, mild: m.nietInactief > 0 };
    });

    // Geen enkele functie hoort ze te míschen: dan is per rij niet meer te zien
    // welke regel geldt, en dat is precies het soort verschil waar QS8-146 over gaat.
    const gemengd = vormen.filter((v) => v.streng && v.mild).map((v) => v.naam);
    expect(gemengd, 'deze functie gebruikt beide afknijpvormen door elkaar').toEqual([]);

    // En er is er ook echt één van elk, anders bewaakt de regel hierboven niets.
    expect(vormen.some((v) => v.streng), 'geen enkele functie is streng').toBe(true);
    expect(vormen.some((v) => v.mild), 'geen enkele functie is mild').toBe(true);
  });
});

// ---------------------------------------------------------------------------

/**
 * De belofte: **een leespolicy die groepsgenoten iets laat zien, routeert via de
 * gedeelde toets** — QS8-459, migratie 0259.
 *
 * ⚠️⚠️ **Dit is de naad die de hele suite niet zag.** 📏 Gemeten op 13-09-2026:
 *    alle vijf de voorwaarden in `shares_group_with_goal()` zijn los weggehaald
 *    en de RLS-suite werd elke keer rood (3, 4, 4, 4 en 20 tests). Ook
 *    `goal_events_select` op `using (true)` geeft een rode test.
 *
 *    Maar vervang je in die policy de aanroep `shares_group_with_goal(g.id)` door
 *    een eigen `exists` over `goal_group_links` + `group_members` — dezelfde vorm,
 *    maar zónder de eis dat de **eigenaar** nog lid is en zónder de archieftoets —
 *    dan blijft de suite **volledig groen**: 1796 passed, 0 failed. Een
 *    uitgetreden lid en een gearchiveerde groep kunnen er dan weer bij.
 *
 *    Dat is de verruiming die er in een diff uitziet als een refactor, en het is
 *    precies de vorm waar regel 18 over gaat: elk onderdeel klopt, en de vraag
 *    *"loopt deze policy nog langs de gedeelde toets"* was van niemand.
 *
 * ⚠️ **De route en niet de expressie.** Een letterlijke vergelijking op
 *    `pg_get_expr()` is bros — commentaar, witruimte en een hernoemd alias
 *    veranderen legitiem, en een controle die daarop rood wordt leer je uitzetten.
 *    Wat wél hard te stellen is: wie de lidmaatschapstabellen noemt, doet dat via
 *    een gedeelde toets en niet via een eigen kopie.
 *
 * ⚠️ Zelfde vorm als de derde tak van `archiefleesgat()` (0164), die dat voor
 *    **schrijvende** policies doet. Deze dekt de leeskant — de helft die er niet
 *    was.
 */
describe.skipIf(!beschikbaar)('een leespolicy routeert via de gedeelde groepstoets', () => {
  it('meldt vandaag niets — geen enkele leespolicy schrijft de toets zelf uit', () => {
    // ⚠️ 📏 Bij invoering nul. De enige policy in `public` die de
    //    lidmaatschapstabellen rechtstreeks noemt is `goal_group_links_delete`,
    //    en dat is een DELETE — buiten bereik, en al een benoemde uitzondering
    //    in `archiefleesgat()`.
    expect(psql('select coalesce(string_agg(naam, \', \' order by naam), \'\') from leesroute_bewaking()')).toBe(
      '',
    );
  }, 30_000);

  /**
   * ⚠️⚠️ **Gevoed, want de grendel is met de bestaande data niet rood te krijgen.**
   *    *"Een controle die je niet kunt voeden, kun je niet ijken."* Beide helften
   *    staan hieronder: de vorm die hij moet melden én de vorm die hij met rust
   *    moet laten. Zonder die tweede helft is een controle die álles meldt ook
   *    groen te noemen, en die leer je negeren.
   */
  it('meldt een eigen kopie, en laat een policy die de gedeelde toets aanroept met rust', () => {
    const uit = psqlMetInvoer(
      [
        'begin;',
        'create table public.proef_leesroute_459 (id uuid primary key default gen_random_uuid(), goal_id uuid);',
        'alter table public.proef_leesroute_459 enable row level security;',
        // A — de eigen kopie: noemt de lidmaatschapstabellen zonder gedeelde toets.
        'create policy proef_459_kopie on public.proef_leesroute_459 for select to authenticated',
        '  using (exists (select 1 from goal_group_links l',
        '                 join group_members m on m.group_id = l.group_id',
        '                                     and m.user_id = (select auth.uid())',
        '                 where l.goal_id = proef_leesroute_459.goal_id));',
        // B — de must-allow: noemt group_members én roept de gedeelde toets aan.
        'create policy proef_459_route on public.proef_leesroute_459 for select to authenticated',
        '  using (shares_group_with_goal(goal_id)',
        '         and exists (select 1 from group_members m where m.user_id = (select auth.uid())));',
        // C — de zwakke route: noemt een gesanctioneerde naam, maar `mag_groep_lezen()`
        //     toetst alleen de kijker en doet géén archieftoets. 📏 Gemeten met echte
        //     rijen: bij een gearchiveerde groep geeft `shares_group_with_goal()` false
        //     en deze route true. Dit geval kwam er in de eerste versie doorheen.
        'create policy proef_459_zwak on public.proef_leesroute_459 for select to authenticated',
        '  using (exists (select 1 from goal_group_links l',
        '                 where l.goal_id = proef_leesroute_459.goal_id',
        '                   and mag_groep_lezen(l.group_id)));',
        "select 'GEMELD=' || coalesce(string_agg(naam, ',' order by naam), '') from leesroute_bewaking()",
        "  where naam like '%proef_leesroute_459%';",
        'rollback;',
      ].join('\n'),
    );

    const gemeld = uit
      .split('\n')
      .map((r) => r.trim())
      .find((r) => r.startsWith('GEMELD='))
      ?.slice('GEMELD='.length);

    expect(
      gemeld,
      'de eigen kopie én de zwakke route horen gemeld te worden, en de policy die de ' +
        'sterke gedeelde toets aanroept niet — ' +
        'meldt hij beide, dan is het een controle die je leert negeren; meldt hij geen ' +
        'van beide, dan vangt hij de verruiming niet die de hele suite groen liet',
    ).toBe('proef_leesroute_459.proef_459_kopie,proef_leesroute_459.proef_459_zwak');
  }, 30_000);

  /**
   * ⚠️⚠️ **De tak erbij — QS8-461, migratie 0295.**
   *
   * De vorm hierboven toetst een `qual` die in zijn gehéél te zwak is. Deze
   * toetst de vorm die daar doorheen kwam: **een sterke aanroep in de ene tak en
   * een eigen kopie in de andere.** 📏 Gemeten op 22-09-2026, met 0259 nog van
   * kracht: `leesroute_bewaking()` gaf **0 rijen** — vóór én ná het aanmaken van
   * de policy. De grendel zweeg omdat `not like` naar de héle `qual` keek en de
   * eerste tak het gesanctioneerde woord droeg.
   *
   * ⚠️ **Waarom juist deze vorm.** Een *vervanging* van de expressie leest in een
   *    diff als een herschrijving en valt op; een *tak erbij* leest als
   *    uitbreiding. CLAUDE.md noemt die vorm bij domeinregel 11 als duur betaald.
   *
   * ⚠️ **En de must-allow hieronder is de helft die ertoe doet.** `and` versmalt
   *    en `or` verbreedt: staat er `sterk and <kopie>`, dan moet de sterke toets
   *    óók gelden en kan de kopie niets openzetten. Meldt de grendel die tóch,
   *    dan is hij te streng geworden en leert iemand hem uitzetten — precies het
   *    tegenovergestelde van wat 0295 wil.
   */
  it('meldt een zwakke tweede OR-tak naast een sterke aanroep, en laat dezelfde kopie achter een `and` met rust', () => {
    const uit = psqlMetInvoer(
      [
        'begin;',
        'create table public.proef_leesroute_461 (id uuid primary key default gen_random_uuid(), goal_id uuid);',
        'alter table public.proef_leesroute_461 enable row level security;',
        // A — MOET GEMELD: tak 1 is sterk, tak 2 is een eigen kopie zonder
        //     eigenaar-toets en zonder archieftoets. Dit is het geval van QS8-461.
        'create policy proef_461_ortak on public.proef_leesroute_461 for select to authenticated',
        '  using (shares_group_with_goal(goal_id)',
        '         or exists (select 1 from goal_group_links l',
        '                    join group_members m on m.group_id = l.group_id',
        '                                        and m.user_id = (select auth.uid())',
        '                    where l.goal_id = proef_leesroute_461.goal_id));',
        // B — MOET MET RUST: dezelfde kopie, maar achter een `and`. Versmalt.
        'create policy proef_461_andtak on public.proef_leesroute_461 for select to authenticated',
        '  using (shares_group_with_goal(goal_id)',
        '         and exists (select 1 from goal_group_links l',
        '                     where l.goal_id = proef_leesroute_461.goal_id));',
        // C — MOET MET RUST: een `or` binnen een subquery is geen bovenste tak.
        'create policy proef_461_subquery on public.proef_leesroute_461 for select to authenticated',
        '  using (shares_group_with_goal(goal_id)',
        '         and exists (select 1 from goal_group_links l',
        '                     where l.goal_id = proef_leesroute_461.goal_id',
        '                       or l.goal_id is null));',
        "select 'GEMELD=' || coalesce(string_agg(naam, ',' order by naam), '') from leesroute_bewaking()",
        "  where naam like '%proef_leesroute_461%';",
        'rollback;',
      ].join('\n'),
    );

    const gemeld = uit
      .split('\n')
      .map((r) => r.trim())
      .find((r) => r.startsWith('GEMELD='))
      ?.slice('GEMELD='.length);

    expect(
      gemeld,
      'alleen de policy met de zwakke tweede OR-tak hoort gemeld te worden. Meldt hij ' +
        'er nul, dan staat het gat van QS8-461 weer open — een sterke naam in tak 1 ' +
        'dekt dan opnieuw een kopie in tak 2 af. Meldt hij er meer dan één, dan telt ' +
        'hij een `and` als verbreding en is hij te streng: dat is een controle die ' +
        'iemand gaat uitzetten',
    ).toBe('proef_leesroute_461.proef_461_ortak');
  }, 30_000);

  /**
   * ⚠️ **De splitser is zelf een grendel, dus hij staat los onder toets** —
   *    regel 18, de knip die een controle scherp houdt. Splitst hij binnen een
   *    subquery of binnen een stringliteral, dan meldt `leesroute_bewaking()`
   *    takken die geen takken zijn, en dat is een controle die alles meldt.
   */
  it('splitst alleen op de bovenste OR-laag, niet in een subquery of een stringliteral', () => {
    const uit = psqlMetInvoer(
      [
        "select 'N1=' || (select count(*) from bovenste_or_takken('(a(x) OR (EXISTS (SELECT 1 FROM t WHERE (p OR q))))'));",
        "select 'N2=' || (select count(*) from bovenste_or_takken('(shares_group_with_goal(goal_id))'));",
        "select 'N3=' || (select count(*) from bovenste_or_takken('(naam = ''x OR y'')'));",
        "select 'N4=' || (select count(*) from bovenste_or_takken('(a OR b OR c)'));",
      ].join('\n'),
    );

    const lees = (sleutel: string): string | undefined =>
      uit
        .split('\n')
        .map((r) => r.trim())
        .find((r) => r.startsWith(sleutel))
        ?.slice(sleutel.length);

    expect(lees('N1='), 'een OR binnen een subquery is geen bovenste tak').toBe('2');
    expect(lees('N2='), 'zonder bovenste OR is er precies één tak — gelijk aan 0259').toBe('1');
    expect(lees('N3='), 'een OR in een stringliteral is geen bovenste tak').toBe('1');
    expect(lees('N4='), 'Postgres vlakt geneste OR af; drie takken horen er drie te zijn').toBe(
      '3',
    );
  }, 30_000);
});
