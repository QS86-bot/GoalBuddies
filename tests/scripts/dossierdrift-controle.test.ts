import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `review-controle.test.ts`.
import {
  controleer,
  genoegGeschiedenis,
  eigenMigraties,
  komtInAanmerking,
  objectenInTitel,
  objectenVanMigratie,
} from '../../scripts/dossierdrift-controle.mjs';

/**
 * De ijking van `npm run dossierdrift:controle` (QS8-452).
 *
 * ⚠️ **De helft "moet met rust gelaten worden" is hier de zwaarste.** Vier
 *    eerdere kandidaatregels voor dit issue zijn afgevallen op precies dat punt:
 *    ze vuurden op 87%, 55%, 44% en 39% van de rijen. 📏 Deze haalt 9% (4 van
 *    43) en dat komt door twee verfijningen die elk een eigen toets hieronder
 *    hebben — haal er één weg en de uitslag loopt terug naar 14% respectievelijk
 *    44%. De toetsen in `met rust laten` zíjn dus de controle.
 */

type Migratie = { nummer: string; datum: string; objecten: Set<string> };

const mig = (nummer: string, datum: string, ...objecten: string[]): Migratie => ({
  nummer,
  datum,
  objecten: new Set(objecten),
});

const rij = (datum: string, titel: string, romp: string, risico = 'Middel') =>
  `| ${datum} | ${titel} | ${romp} | ${risico} |`;

/** Een rij die alle poorten haalt, zodat een toets één ding tegelijk meet. */
const gemetenRij = (titel: string, romp = '📏 gemeten') => rij('2026-09-01', titel, romp);

describe('wat de controle moet vinden', () => {
  it('een object uit de titel dat ná de rijdatum herschreven is', () => {
    const b = controleer(
      [gemetenRij('`schone_naam()` strijkt de randen niet aan')],
      [mig('0289', '2026-09-17', 'schone_naam')],
    );

    expect(b).toHaveLength(1);
    expect(b[0]?.treffers).toEqual([{ object: 'schone_naam', nummer: '0289', datum: '2026-09-17' }]);
  });

  it('meldt elke aanrakende migratie, niet alleen de laatste', () => {
    const b = controleer(
      [gemetenRij('De haalbaarheidsberekening (`herbereken_risico`)')],
      [
        mig('0155', '2026-09-04', 'herbereken_risico'),
        mig('0163', '2026-09-05', 'herbereken_risico'),
      ],
    );

    expect(b[0]?.treffers.map((t: { nummer: string }) => t.nummer)).toEqual(['0155', '0163']);
  });

  it('`public.f` en `f()` zijn hetzelfde object', () => {
    const b = controleer(
      [gemetenRij('`public.beslis_deadline_verzoek` doet het verkeerd')],
      [mig('0288', '2026-09-17', 'beslis_deadline_verzoek')],
    );

    expect(b).toHaveLength(1);
  });

  it('een constraint, index, policy of trigger telt net zo goed als een functie', () => {
    for (const soort of ['profiles_display_name_schoon', 'goals_select', 'chatfotos_aantal_begrensd']) {
      const b = controleer([gemetenRij(`\`${soort}\` doet niet wat de kop belooft`)], [
        mig('0290', '2026-09-18', soort),
      ]);
      expect(b, soort).toHaveLength(1);
    }
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een aanraking die vóór de rijdatum viel', () => {
    expect(
      controleer([gemetenRij('`schone_naam()` X')], [mig('0100', '2026-08-01', 'schone_naam')]),
    ).toHaveLength(0);
  });

  /**
   * ⚠️ **Verfijning 1.** Zonder deze poort loopt de uitslag op het echte
   *    dossier van 4 naar 19: de rompkolom noemt objecten in het voorbijgaan
   *    ("de andere drie tellers gebruiken `tel_dagteller`") en die zijn geen
   *    onderwerp van de meting.
   */
  it('een object dat alleen in de ROMP staat en niet in de titel', () => {
    expect(
      controleer(
        [gemetenRij('Een rij zonder object in de kop', '📏 terzijde: `schone_naam()` bestaat')],
        [mig('0289', '2026-09-17', 'schone_naam')],
      ),
    ).toHaveLength(0);
  });

  /**
   * ⚠️ **Verfijning 2.** Het geval dat hem opleverde is r650: de titel eindigt
   *    op *"(QS8-333, 0244)"* en `0244` wás de aanraking. De rij beschrijft die
   *    migratie; hij loopt er niet op achter. 📏 Zonder deze poort: 6 in plaats
   *    van 4.
   */
  it('een migratie die de rij zelf noemt', () => {
    expect(
      controleer(
        [gemetenRij('De poort van `herstel_stuurloze_straf()` (QS8-333, 0244)')],
        [mig('0244', '2026-09-10', 'herstel_stuurloze_straf')],
      ),
    ).toHaveLength(0);
  });

  it('een migratienummer dat alleen in de ROMP van de rij staat telt ook', () => {
    expect(
      controleer(
        [gemetenRij('`schone_naam()` X', '📏 gemeten, gedicht in 0289')],
        [mig('0289', '2026-09-17', 'schone_naam')],
      ),
    ).toHaveLength(0);
  });

  it('een rij zonder 📏 — er is dan geen meting om achterhaald te raken', () => {
    expect(
      controleer(
        [rij('2026-09-01', '`schone_naam()` X', 'een ontwerpvraag, 🗣')],
        [mig('0289', '2026-09-17', 'schone_naam')],
      ),
    ).toHaveLength(0);
  });

  it('een afgehandelde rij (risico doorgestreept)', () => {
    expect(
      controleer(
        [rij('2026-09-01', '`schone_naam()` X', '📏 gemeten', '~~Middel~~')],
        [mig('0289', '2026-09-17', 'schone_naam')],
      ),
    ).toHaveLength(0);
  });

  it('een Laag-rij — die heeft zijn eigen grendel in review:controle', () => {
    expect(
      controleer(
        [rij('2026-09-01', '`schone_naam()` X', '📏 gemeten', 'Laag')],
        [mig('0289', '2026-09-17', 'schone_naam')],
      ),
    ).toHaveLength(0);
  });

  it('een codespan die geen identifier is', () => {
    expect(
      controleer(
        [gemetenRij('`npm run poort` en `select 1` zeggen niets')],
        [mig('0289', '2026-09-17', 'poort')],
      ),
    ).toHaveLength(0);
  });
});

/**
 * ⚠️ `objectenVanMigratie()` leest wat een migratie DEFINIEERT. Een tabelnaam
 *    hoort er niet in: die wordt door tientallen migraties aangeraakt, dus
 *    "sinds je meting aangeraakt" is er altijd waar. 📏 Tabellen meetellen
 *    bracht de uitslag op het echte dossier van 19 naar 24.
 */
describe('objectenVanMigratie', () => {
  it('vindt functies, constraints, policies, triggers en indexen', () => {
    const sql = `
      create or replace function public.schone_naam(p text) returns text as $$ $$;
      alter table public.profiles add constraint profiles_display_name_schoon check (true);
      create policy goals_select on public.goals for select using (true);
      create trigger goals_bewaking before insert on public.goals execute function f();
      create unique index if not exists goals_eigenaar_idx on public.goals (owner_id);
      drop function if exists public.oude_vorm(uuid);
    `;
    expect([...objectenVanMigratie(sql)].sort()).toEqual([
      'goals_bewaking',
      'goals_eigenaar_idx',
      'goals_select',
      'oude_vorm',
      'profiles_display_name_schoon',
      'schone_naam',
    ]);
  });

  it('neemt geen tabelnaam mee', () => {
    const objecten = objectenVanMigratie('alter table public.commitments add column x int;');
    expect(objecten.has('commitments')).toBe(false);
  });

});

describe('de hulpstukken los', () => {
  it('objectenInTitel haalt haakjes en schema weg', () => {
    expect([...objectenInTitel('`public.f()` en `g` en `niet dit`')].sort()).toEqual(['f', 'g']);
  });

  /**
   * ⚠️ **Deze toets zat eerst op `objectenVanMigratie()` en was daar groen om
   *    de verkeerde reden.** De mutatie die hem moest breken — de SCHEMAS-toets
   *    daar weghalen — liet alle 18 tests staan: élk schemavoorvoegsel in die
   *    regexes zit in een niet-vangende groep, dus er belandt nooit een
   *    schemanaam in een capture. De grendel leeft aan de títelkant, en daar
   *    vuurt hij: zonder hem matcht een rij die `public` in zijn kop schrijft
   *    op elke migratie die `public` aanraakt. 📏 Vier rijen in de uitslag die
   *    nergens over gingen, waaronder r393 over de publieke repository.
   */
  it('objectenInTitel laat een kale schemanaam staan', () => {
    for (const schema of ['public', 'storage', 'auth']) {
      expect([...objectenInTitel(`De repository staat \`${schema}\``)], schema).toEqual([]);
    }
  });

  it('eigenMigraties leest vier cijfers met een nul voorop', () => {
    expect([...eigenMigraties({ titel: 'iets (0244)', romp: 'en 0289, maar niet 1234 of 12345' })].sort())
      .toEqual(['0244', '0289']);
  });

  it('komtInAanmerking eist open, zwaar én een meting', () => {
    const basis = { titel: 'x', romp: '📏', risico: 'Middel' };
    expect(komtInAanmerking(basis)).toBe(true);
    expect(komtInAanmerking({ ...basis, risico: '~~Middel~~' })).toBe(false);
    expect(komtInAanmerking({ ...basis, risico: 'Laag' })).toBe(false);
    expect(komtInAanmerking({ ...basis, romp: 'geen meting' })).toBe(false);
  });
});

/**
 * ⚠️⚠️ De grendel die voorkomt dat deze controle gaat raden.
 *
 * 📏 In een `--depth=1` kloon geeft `git log -- <pad>` élke migratie de datum
 *    van die ene commit, en dan meldde de controle **6 rijen** die met volledige
 *    geschiedenis geen van alle vuren.
 *
 * ⚠️ De eerste versie toetste `git rev-parse --is-shallow-repository`, en dat is
 *    het verkeerde signaal: die vlag blijft `true` nadat een kloon verdiept is.
 *    📏 De werkboom hier meldt `true` met 1571 commits en 13 verschillende
 *    migratiedatums — die grendel sloeg de controle dus overál over, en een
 *    controle die nooit meet is erger dan geen controle. Wat wél discrimineert
 *    is de uitkomst: één datum voor alles tegen 13.
 */
describe('genoegGeschiedenis', () => {
  const m = (datum: string) => ({ datum });

  it('één datum voor alle migraties is niet genoeg', () => {
    expect(genoegGeschiedenis([m('2026-09-18'), m('2026-09-18'), m('2026-09-18')])).toBe(false);
  });

  it('twee verschillende datums is genoeg', () => {
    expect(genoegGeschiedenis([m('2026-09-04'), m('2026-09-18')])).toBe(true);
  });

  /** ⚠️ Eén migratie kan per definitie maar één datum hebben; dat is geen
   *    afgekapte geschiedenis en mag de controle niet stilzetten. */
  it('één enkele migratie telt als genoeg', () => {
    expect(genoegGeschiedenis([m('2026-09-18')])).toBe(true);
  });
});
