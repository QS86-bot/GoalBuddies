import { describe, expect, it } from 'vitest';

import { meldingVoor, padOnderbroken } from '../../scripts/rollbackpad.mjs';

/**
 * Het rollback-pad staat heel in de kop — QS8-405, geijkt.
 *
 * ⚠️ **Deze test bestaat omdat de controle over een hele map loopt.** Wil je
 *    weten wát hij vindt, dan moet je hem een bestand kunnen aanbieden — en dat
 *    kan alleen als de regel in een eigen module staat. Zelfde vorm en dezelfde
 *    reden als `tests/scripts/functies-vergelijk.test.ts`.
 *
 * ⚠️ **Tweezijdig geijkt, en die tweede helft is hier het zwaarst.** Het
 *    onderscheid dat deze controle draagt is dun: een uitgecommentarieerde
 *    rollback-stap ziet er bijna uit als proza dat toevallig op een
 *    SQL-sleutelwoord afbreekt. 📏 Over de map schelen die twee lezingen elf
 *    valse meldingen. Bij elk geval dat gemeld moet worden staat daarom het
 *    geval dat met rust gelaten hoort te worden.
 */

/** De vorm die de map draagt: kop met pad, dan lichaam. */
const GEZOND = `-- 0999_iets.sql — wat het doet
--
-- ROLLBACK-PAD:
--   drop trigger if exists iets on public.dingen;
--   drop function if exists public.iets();
--
-- ---------------------------------------------------------------------------

create or replace function public.iets() returns void language sql as $$ select 1 $$;

drop trigger if exists iets on public.dingen;
`;

describe('padOnderbroken — de must-find', () => {
  /**
   * ⚠️ **Dit is 0233 zoals het op `main` stond**, ingekort tot de vorm die het
   *    kapot maakte: een aantekening in het ROLLBACK-blok, dan live SQL, en dan
   *    gaat het pad gewoon verder.
   */
  it('meldt een pad dat onder het lichaam doorloopt', () => {
    const kapot = `-- 0233_iets.sql — wat het doet
--
-- ROLLBACK-PAD:
--   -- ⚠️⚠️ Ook \`bewijsfotos\` krijgt de bredere vorm, al is die emmer er vandaag
--    niet mee te misbruiken.

drop trigger if exists bewijsfotos_verhuisd on storage.objects;

create trigger bewijsfotos_verhuisd before update on storage.objects
  execute function public.bewaak();

drop trigger if exists avatars_verhuisd on storage.objects;
--   drop trigger if exists chatfotos_verhuisd on storage.objects;
--   drop table if exists public.opslag_dagtellers;
`;

    const uit = padOnderbroken(kapot);

    expect(uit).toHaveLength(2);
    expect(uit[0]?.tekst).toContain('chatfotos_verhuisd');
    expect(uit[1]?.tekst).toContain('opslag_dagtellers');
  });

  it('noemt het regelnummer, want anders moet de lezer zoeken', () => {
    const kapot = ['-- ROLLBACK-PAD:', '--   drop table x;', '', 'select 1;', '--   drop table y;'].join(
      '\n',
    );

    expect(padOnderbroken(kapot)).toEqual([{ regel: 5, tekst: '--   drop table y;' }]);
  });

  it('vindt elk sleutelwoord dat een migratie gebruikt, niet alleen drop', () => {
    for (const kw of ['create index i on t (a);', 'alter table t add column c int;', 'grant select on t to r;', 'revoke all on t from r;', 'comment on table t is $$x$$;']) {
      const bron = `-- ROLLBACK-PAD:\n--   drop table x;\n\nselect 1;\n--   ${kw}\n`;
      expect(padOnderbroken(bron), kw).toHaveLength(1);
    }
  });
});

describe('padOnderbroken — de must-allow', () => {
  it('zwijgt bij een gezonde migratie', () => {
    expect(padOnderbroken(GEZOND)).toEqual([]);
  });

  /**
   * ⚠️⚠️ **Dit is de regel die de controle bruikbaar houdt, en hij komt uit de
   *    map.** `0168` citeert een Postgres-fout in zijn lichaam die op `insert`
   *    begint. 📏 Zonder de eis dat de regel op `;` eindigt, meldt de controle
   *    elf van dit soort regels en één echte — en dan is hij er een die je leert
   *    negeren.
   */
  it('laat proza met rust dat toevallig op een sleutelwoord afbreekt', () => {
    const proza = `-- ROLLBACK-PAD:
--   drop table x;

select 1;

-- ⚠️ De fout die je dan krijgt:
--   insert or update on table "commitment_events" violates foreign key
--    constraint — en dat is precies de bedoeling.
-- ⚠️ Een tabelbrede grant kon de eigenaar \`type\` van \`penalty\` naar \`reward\`
--    schrijven, en dat is met 0057 dichtgezet.
`;

    expect(padOnderbroken(proza)).toEqual([]);
  });

  /**
   * ⚠️⚠️ **Dit geval is aangescherpt tijdens de ijking, en dat is het vermelden
   *    waard.** Er stond eerst `-- drop table y; is hier nooit nodig` — met een
   *    staart, dus zónder afsluitende `;`. Die werd al door de `;`-eis
   *    tegengehouden, en dus bleef deze test groen toen de inspringing van
   *    `\s{2,}` naar `\s*` werd gezet: hij voerde zijn geval door een grendel
   *    die er niet over ging. Precies de valkuil die `CLAUDE.md` bij regel 18
   *    noemt — *ijk de grendel die de ijking nóemt*.
   *
   *    Nu is het een echt statement met één spatie ervoor. Alleen de
   *    inspringing houdt hem nog tegen.
   */
  it('laat een uitgecommentarieerd statement met één spatie met rust', () => {
    // Het pad schrijft `--   ` (drie spaties), gewone tekst `-- ` (één). Dat is
    // het enige verschil tussen deze regel en een rollback-stap.
    const bron = `-- ROLLBACK-PAD:\n--   drop table x;\n\nselect 1;\n-- drop table y;\n`;

    expect(padOnderbroken(bron)).toEqual([]);
  });

  /**
   * ⚠️ Een bestand zónder rollback-markering is een ándere fout, en stap 3 van
   *    `migraties-controle.mjs` meldt hem al. Zou deze controle daar óók iets
   *    over zeggen, dan staat er twee keer een melding over één bestand en gaat
   *    de lezer zoeken naar twee problemen.
   */
  it('zwijgt als er helemaal geen rollback-markering is', () => {
    const zonder = `-- 0999_iets.sql\n\nselect 1;\n--   drop table y;\n`;

    expect(padOnderbroken(zonder)).toEqual([]);
  });

  it('zwijgt bij een bestand dat alleen uit commentaar bestaat', () => {
    expect(padOnderbroken('-- ROLLBACK-PAD:\n--   drop table x;\n')).toEqual([]);
  });

  it('leest ook `ROLLBACK:` en `ROLLBACK-PAD (in deze volgorde):`', () => {
    // 0062 t/m 0068 en 0001 schrijven het anders; `migraties-controle` is daar
    // bewust ruim in en deze controle hoort dezelfde bestanden te zien.
    for (const kop of ['-- ROLLBACK:', '-- ROLLBACK-PAD (in deze volgorde, echt):']) {
      const bron = `${kop}\n--   drop table x;\n\nselect 1;\n--   drop table y;\n`;
      expect(padOnderbroken(bron), kop).toHaveLength(1);
    }
  });
});

describe('meldingVoor', () => {
  it('geeft null als er niets aan de hand is', () => {
    expect(meldingVoor('0999_iets.sql', GEZOND)).toBeNull();
  });

  it('noemt het bestand, het aantal en wat er moet gebeuren', () => {
    const kapot = `-- ROLLBACK-PAD:\n--   drop table x;\n\nselect 1;\n--   drop table y;\n`;
    const melding = meldingVoor('0233_iets.sql', kapot);

    expect(melding).toContain('0233_iets.sql');
    expect(melding).toContain('drop table y;');
    // De lezer moet weten welke kant het op moet, niet alleen dát het fout is.
    expect(melding).toContain('in de kop');
    expect(melding).toContain('in het lichaam');
  });

  it('laat een bestand met reden in het register door', () => {
    const kapot = `-- ROLLBACK-PAD:\n--   drop table x;\n\nselect 1;\n--   drop table y;\n`;
    const register = [{ bestand: '0233_iets.sql', reden: 'toont met opzet wat hij niet doet' }];

    expect(meldingVoor('0233_iets.sql', kapot, register)).toBeNull();
    expect(meldingVoor('0234_anders.sql', kapot, register)).not.toBeNull();
  });
});

/**
 * De hele map, want dát is de belofte — niet "de functie werkt op een verzinsel".
 *
 * ⚠️ Regel 18 vraag 3: deze suite zou groen kunnen blijven terwijl `0233` weer
 *    kapot gaat, want alle gevallen hierboven zijn met de hand aangeleverd. Dit
 *    blok vraagt het aan de bestanden zelf.
 */
describe('de map zelf', () => {
  it('heeft geen enkele migratie met een opengebroken rollback-pad', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const map = join(process.cwd(), 'supabase/migrations');

    const gebroken = readdirSync(map)
      .filter((n) => n.endsWith('.sql'))
      .map((n) => meldingVoor(n, readFileSync(join(map, n), 'utf8')))
      .filter((m): m is string => m !== null);

    expect(gebroken, gebroken.join('\n')).toEqual([]);
  });
});
