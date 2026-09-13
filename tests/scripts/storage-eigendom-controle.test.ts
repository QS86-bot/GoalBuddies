/**
 * Wat er op `storage.*` wél en niet voorwaardelijk mag — QS8-439.
 *
 * ⚠️ **Deze suite is herschreven ná de security-review, en dat is de les.** De
 *    eerste versie voerde de controle netjes elke vorm los, en was groen —
 *    terwijl de controle acht vormen miste, waaronder de waarschijnlijkste:
 *    `do $$ begin create index … end $$;` **zonder** `exception`-regel. De
 *    tests toetsten wat de functie deed, niet wat de belofte was. Regel 18,
 *    vraag 2, en hij kostte hier een grendel die niets bewaakte.
 *
 * ⚠️ **Twee richtingen en ze zijn elkaars spiegelbeeld.** Een index móet
 *    afgevangen worden (anders stopt de reeks op productie); een policy of
 *    trigger mag dat juist níet (die gaan wél, dus afvangen verbergt een echte
 *    fout — en bij een trigger valt dat open).
 */
import { describe, expect, it } from 'vitest';

import {
  bevindingen,
  bevindingenIn,
  blokken,
  omhullendBlok,
  zonderCommentaar,
} from '../../scripts/storage-eigendom-controle.mjs';

const soorten = (sql: string): string[] => bevindingenIn(sql).map((b) => b.soort);

const AFGEVANGEN = (lichaam: string, label = ''): string =>
  `do $${label}$\nbegin\n  ${lichaam}\nexception when insufficient_privilege then null;\nend $${label}$;`;

describe('een index moet afgevangen zijn — anders stopt de reeks op productie', () => {
  /**
   * ⚠️ Dit is het geval waar de eerste versie op stukliep: een blok zónder
   *    vangregel. Het ontstaat door de huisstijl uit 0222 te kopiëren en bij het
   *    knippen de `exception`-regel te laten vallen — en dat is precies de vorm
   *    die vier aangrenzende bestanden nu voordoen.
   */
  it('een do-blok zonder exception-regel is even kaal als geen blok', () => {
    expect(soorten('do $$\nbegin\n  create index x on storage.objects (name);\nend $$;')).toEqual(['kaal']);
  });

  it.each([
    ['zonder blok', 'create index x on storage.objects (name);'],
    ['naamloos', 'create index on storage.objects (name);'],
    ['met aanhalingstekens', 'create index "objects_f_idx" on storage.objects (name);'],
    ['met spaties rond de punt', 'create index x on storage . objects (name);'],
    ['met only', 'create index x on only storage.objects (name);'],
    ['schemaloos', 'create index x on objects (name);'],
    ['unique index', 'create unique index x on storage.objects (name);'],
    ['op storage.buckets', 'create index x on storage.buckets (name);'],
  ])('%s', (_naam, sql) => {
    expect(soorten(sql)).toEqual(['kaal']);
  });

  /** Een unieke constraint legt óók een index aan en vraagt dus hetzelfde recht. */
  it('alter table … add constraint … unique telt mee', () => {
    expect(soorten('alter table storage.objects add constraint u unique (bucket_id, name);')).toEqual(['kaal']);
  });

  it('when others vangt het wel, maar slikt ook echte fouten', () => {
    const sql = 'do $$\nbegin\n  create index x on storage.objects (name);\nexception when others then null;\nend $$;';
    expect(soorten(sql)).toEqual(['others']);
  });

  /** 📏 `25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`. */
  it('concurrently krijgt een eigen melding, want een blok is daar geen uitweg', () => {
    expect(soorten('create index concurrently x on storage.objects (name);')).toEqual(['concurrently']);
  });
});

describe('een grendel mag juist níet afgevangen zijn', () => {
  it('een afgevangen policy', () => {
    expect(soorten(AFGEVANGEN('create policy p on storage.objects for select using (true);'))).toEqual([
      'grendel-afgevangen',
    ]);
  });

  /**
   * ⚠️ De gevaarlijkste van de twee. Een policy die wegvalt sluit dicht; een
   *    trigger die wegvalt opent — dan hangt de uploadtelling nergens meer aan.
   */
  it('een afgevangen trigger', () => {
    const sql = AFGEVANGEN('create trigger t before insert on storage.objects execute function f();');
    expect(soorten(sql)).toEqual(['grendel-afgevangen']);
  });

  it('een afgevangen enable row level security', () => {
    expect(soorten(AFGEVANGEN('alter table storage.objects enable row level security;'))).toEqual([
      'grendel-afgevangen',
    ]);
  });
});

describe('wat de controle met rúst moet laten', () => {
  it('een index in de juiste vorm', () => {
    expect(soorten(AFGEVANGEN('create index x on storage.objects (name);'))).toEqual([]);
  });

  /** ⚠️ Deze repo gebruikt ook `$fn$`, `$rb$` en `$migratie$`. */
  it('dezelfde vorm met een ander dollarlabel', () => {
    expect(soorten(AFGEVANGEN('create index x on storage.objects (name);', 'migratie'))).toEqual([]);
  });

  it('een kale policy en een kale trigger — die horen zo', () => {
    expect(soorten('create policy p on storage.objects for select using (true);')).toEqual([]);
    expect(soorten('create trigger t before insert on storage.objects execute function f();')).toEqual([]);
  });

  it('een index op een tabel die we wél bezitten', () => {
    expect(soorten('create index g on public.goals (owner_id);')).toEqual([]);
  });

  it('een rollback-pad in commentaar is geen code', () => {
    expect(soorten('-- create index x on storage.objects (name);\nselect 1;')).toEqual([]);
  });

  it('een drop, want die vraagt geen eigendom als het object er niet is', () => {
    expect(soorten('drop index if exists storage.objects_iets_idx;')).toEqual([]);
  });
});

describe('de hulpstukken, elk los', () => {
  it('zonderCommentaar haalt een regelcommentaar weg en laat code staan', () => {
    expect(zonderCommentaar('select 1; -- weg\nselect 2;')).toBe('select 1; \nselect 2;');
  });

  it('blokken paart per label en negeert een blok van een ander label', () => {
    const sql = 'do $a$ een $a$; do $b$ twee $b$;';
    expect(blokken(sql).map((b) => b.tekst.trim())).toEqual(['een', 'twee']);
  });

  it('omhullendBlok scheidt vangen van slikken', () => {
    const vangend = blokken(AFGEVANGEN('select 1;'));
    const slikkend = blokken('do $$ begin select 1; exception when others then null; end $$;');
    const [eerste] = vangend;
    const [tweede] = slikkend;
    if (eerste === undefined || tweede === undefined) throw new Error('geen blok gevonden');

    expect(omhullendBlok(vangend, eerste.van + 1)).toMatchObject({ vangt: true });
    expect(omhullendBlok(slikkend, tweede.van + 1)).toMatchObject({ vangt: false, slikt: true });
  });

  it('buiten elk blok is er geen omhullend blok', () => {
    expect(omhullendBlok(blokken('do $$ x $$; select 1;'), 20)).toBeNull();
  });
});

/**
 * ⚠️ **De belofte over de repo zelf, en niet over een stukje tekst.** Deze blijft
 *    kloppen als iemand een migratie toevoegt of verplaatst — de blokken
 *    hierboven niet.
 */
describe('de belofte over de repo', () => {
  it('elke index op storage.* wordt afgevangen, en geen enkele grendel', () => {
    expect(bevindingen()).toEqual([]);
  });
});
