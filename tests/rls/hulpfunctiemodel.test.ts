import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Het model van de lidmaatschapshulpfuncties — QS8-146, migratie 0159.
 *
 * ⚠️ **De belofte is niet "deze zeven functies zien er hetzelfde uit".** Ze horen
 *    juist te verschillen: de schrijfkant sluit een archief af en de leeskant
 *    niet, en twee ervan kijken alleen naar open groepen. De belofte is: *elk
 *    verschil tussen deze functies is een besluit dat iemand heeft opgeschreven,
 *    en geen restant van de volgorde waarin ze gegroeid zijn.*
 *
 * ⚠️⚠️ **Waarom dat een grendel verdient.** Elk verschil hier is een
 *    autorisatieverschil, en ze zitten alle zeven onder tientallen policies.
 *    0029 schreef op dat alleen de kijkerskant afgeknepen wordt; 0102 draaide dat
 *    om voor `shares_group_with_goal()` met een meting erbij; en
 *    `shares_group_with_user()` bleef tot 0159 in de oude stand staan zonder dat
 *    één document dat zei. Dat is niet met een test te vinden die één functie
 *    toetst — het verschil zít tussen de functies.
 *
 * ⚠️ **De structuur wordt uit de gedeployde bron gelezen** (`pg_proc.prosrc`,
 *    niet de migratiebestanden — `pg_get_functiondef()` is de waarheid) en de
 *    bedóéling staat hieronder in het register, met een reden per rij. De test
 *    legt die twee naast elkaar. Een nieuwe hulpfunctie die niet in het register
 *    staat, maakt hem rood: dat is de bedoeling, want dan hoort er iemand een
 *    besluit te nemen in plaats van de dichtstbijzijnde functie te kopiëren.
 *
 * ⚠️ **De detectoren zijn grof en dat is met opzet.** Ze tellen `<> 'inactive'`
 *    en zoeken naar `<> 'archived'`; ze bewijzen niet dát die toets aan de goede
 *    rij hangt. Dat doen de gedragstests — `uitgezet-lid-is-geen-groepsgenoot`,
 *    `vertrek`, `epic7`. Wat dit bestand bewaakt is dat niemand een van deze
 *    assen stilzwijgend verschuift.
 *
 * IJKING — met de hand gedraaid op 04-09-2026:
 *
 *   A  de tegenpartijtoets uit `shares_group_with_user()`   → 1 rood, met naam
 *   B  de archieftoets uit `is_group_member()`              → 1 rood
 *   C  een achtste hulpfunctie erbij, niet in het register  → 1 rood ("noemt zijn model niet")
 *   D  een registerrij voor een functie die niet bestaat    → 1 rood
 *   E  `<> 'inactive'` naar `= 'active'` in één functie     → 1 rood
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'shares_group_with_user'",
  import.meta.url,
);

/** Wat een hulpfunctie over een lidmaatschap toetst. */
interface Model {
  /** Wordt de kant van de kíjker afgeknepen? Altijd waar — 0029. */
  readonly kijker: boolean;
  /** Wordt óók getoetst of de ánder er nog bij hoort? */
  readonly tegenpartij: boolean;
  /** Sluit hij een gearchiveerde groep af? */
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
    kijker: true,
    tegenpartij: false,
    archief: true,
    open: false,
    reden:
      'De schrijfkant. 0092 zette de archieftoets hier omdat tien schrijfpolicies ' +
      'hierlangs lopen; 0153 splitste de leeskant af als mag_groep_lezen().',
  },
  is_group_admin: {
    kijker: true,
    tegenpartij: false,
    archief: true,
    open: false,
    reden: 'Zelfde kant als is_group_member(); een archief heeft geen beheer nodig (0092).',
  },
  mag_groep_lezen: {
    kijker: true,
    tegenpartij: false,
    archief: false,
    open: false,
    reden:
      'De leeskant (0153, QS8-217): een archief hoort leesbaar te zijn. archiefleesgat() ' +
      'bewaakt dat geen schrijfpolicy hierlangs gaat lopen.',
  },
  lid_van_open_groep: {
    kijker: true,
    tegenpartij: false,
    archief: true,
    open: true,
    reden:
      'De grendel onder het klassement van A54 (0141): in een beschermde groep geeft ' +
      'de RPC nul rijen. Geen tegenpartijtoets, want het klassement gaat over de groep ' +
      'en niet over één ander lid.',
  },
  shares_group_with_goal: {
    kijker: true,
    tegenpartij: true,
    archief: true,
    open: false,
    reden:
      'De eigenaar wordt óók getoetst sinds 0102 (QS8-57): zonder dat bleef een oud-lid ' +
      'zijn doel aan de verlaten groep uitdelen. De archieftoets staat hier wél ondanks ' +
      'de leeskant, want weekly_goals draagt missed en carried (0153).',
  },
  deelt_open_groep_met_doel: {
    kijker: true,
    tegenpartij: true,
    archief: true,
    open: true,
    reden: 'De open-groepvariant van shares_group_with_goal(), zelfde model (0141).',
  },
  shares_group_with_user: {
    kijker: true,
    tegenpartij: true,
    archief: false,
    open: false,
    reden:
      'Tegenpartijtoets sinds 0159 (QS8-146): uitgezet worden maakte je niet onzichtbaar ' +
      'terwijl zelf vertrekken dat wél deed. Geen archieftoets, want dit is de leeskant — ' +
      'hij draagt profiles_select en de avataremmer.',
  },
};

/** Elke `SECURITY DEFINER`-functie die een lidmaatschapsvraag over jóú beantwoordt. */
function gedeployd(): Map<string, string> {
  const uit = psql(`
    select p.proname || E'\\t' || replace(p.prosrc, E'\\n', ' ')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and pg_get_function_result(p.oid) = 'boolean'
      and p.prosrc like '%group_members%'
      and p.prosrc like '%auth.uid()%'
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

const NIET_INACTIEF = /<>\s*'inactive'/g;

function modelVan(bron: string): Model {
  const afgeknepen = (bron.match(NIET_INACTIEF) ?? []).length;
  return {
    kijker: afgeknepen >= 1,
    // ⚠️ Twee keer afknijpen betekent: er is een tweede lidmaatschapsrij in het
    //    spel, en dat is de tegenpartij. Grof, maar het verschuift niet stil.
    tegenpartij: afgeknepen >= 2,
    archief: /status\s*<>\s*'archived'/.test(bron),
    open: /zichtbaarheid\s*=\s*'open'/.test(bron),
  };
}

describe.skipIf(!beschikbaar)('het model van de lidmaatschapshulpfuncties', () => {
  const functies = gedeployd();

  it('vindt ze daadwerkelijk, en verzint ze niet', () => {
    // ⚠️ Zonder deze regel is alles hieronder groen zodra de afleiding niets
    //    meer vindt — bijvoorbeeld doordat `prosecdef` ooit verandert.
    expect(functies.size, 'de afleiding vond geen enkele hulpfunctie').toBeGreaterThanOrEqual(7);
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
    it(`${naam} staat zoals besloten — ${rij.reden.split('.')[0]}`, () => {
      const bron = functies.get(naam);
      if (bron === undefined) return; // de test hierboven meldt dit al

      const { kijker, tegenpartij, archief, open } = modelVan(bron);
      expect({ kijker, tegenpartij, archief, open }).toEqual({
        kijker: rij.kijker,
        tegenpartij: rij.tegenpartij,
        archief: rij.archief,
        open: rij.open,
      });
    });
  }

  it('knijpt overal op `<> inactive` af en nergens op `= active`', () => {
    // ⚠️ De as waar niets aan te repareren viel, en juist daarom een grendel.
    //    `= 'active'` zou een adempauze hetzelfde maken als een uitzetting —
    //    precies wat 0029 met zoveel woorden verbiedt. Het verschil is één woord
    //    en het is in een diff niet te zien zonder dat je de regel kent.
    const scheef = [...functies.entries()]
      .filter(([, bron]) => /status\s*=\s*'active'/.test(bron))
      .map(([naam]) => naam);

    expect(scheef, 'een adempauze telt hier niet meer mee als lidmaatschap').toEqual([]);
  });
});
