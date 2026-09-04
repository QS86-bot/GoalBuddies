import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Het model van de lidmaatschapshulpfuncties — QS8-146, migratie 0159.
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
 *    `shares_group_with_user()` bleef tot 0159 in de oude stand staan zonder dat
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
      'Tegenpartijtoets sinds 0159 (QS8-146): uitgezet worden maakte je niet onzichtbaar ' +
      'terwijl zelf vertrekken dat wél deed. Geen archieftoets, want dit is de leeskant — ' +
      'hij draagt profiles_select en de avataremmer.',
  },

  // ── Drie die de persoon als parameter krijgen in plaats van uit het JWT ────
  //
  // ⚠️ Ze staan hier omdat ze een lidmaatschapsoordeel vellen, en dat is waar de
  //    belofte over gaat. Zou de afleiding `auth.uid()` eisen, dan vielen ze
  //    erbuiten — precies het gat dat de security-review op 0159 aanwees.
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
  const functies = gedeployd();

  it('vindt ze daadwerkelijk, en verzint ze niet', () => {
    // ⚠️ Zonder deze regel is alles hieronder groen zodra de afleiding niets meer
    //    vindt — bijvoorbeeld doordat `prosecdef` ooit verandert.
    expect(functies.size, 'de afleiding vond geen enkele hulpfunctie').toBeGreaterThanOrEqual(10);
  });

  it('noemt elke gedeployde hulpfunctie in het register', () => {
    const onbenoemd = [...functies.keys()].filter((naam) => !(naam in REGISTER));

    expect(
      onbenoemd,
      'deze hulpfunctie(s) noemen hun model niet. Zet ze in het register hierboven ' +
        'met een reden — elk verschil tussen deze functies is een autorisatieverschil, ' +
        'en kopiëren van de buurman is precies hoe QS8-146 ontstond.',
    ).toEqual([]);
  });

  it('en het register noemt geen functie die niet bestaat', () => {
    const verdwenen = Object.keys(REGISTER).filter((naam) => !functies.has(naam));
    expect(verdwenen, 'het register loopt achter op de database').toEqual([]);
  });

  for (const [naam, rij] of Object.entries(REGISTER)) {
    it(`${naam} staat zoals besloten`, () => {
      const bron = functies.get(naam);
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
    const vormen = [...functies.entries()].map(([naam, bron]) => {
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
