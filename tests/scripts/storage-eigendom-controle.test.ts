/**
 * De controle op een kale index op een vreemde tabel — QS8-439.
 *
 * ⚠️ **Twee helften, en de tweede is even belangrijk.** De vormen die hij moet
 *    vinden, én de vormen die hij met rust moet laten. Een controle die alles
 *    meldt, leer je uit te zetten — `CLAUDE.md`, regel 18.
 *
 * ⚠️ **Elke grendel apart gevoed.** `kaleIndexen()` heeft er drie achter elkaar:
 *    de tabelnaam moet vreemd zijn, de treffer mag niet in een dollarblok staan,
 *    en commentaar telt niet mee. Eén mutatie voor de hele controle zou
 *    betekenen dat een geval dat een éérdere grendel al afvangt, de latere niet
 *    toetst.
 */
import { describe, expect, it } from 'vitest';

import {
  binnenDollarBlok,
  kaleIndexen,
  zonderCommentaar,
} from '../../scripts/storage-eigendom-controle.mjs';

const KAAL = `create index if not exists objects_iets_idx
  on storage.objects (bucket_id, created_at)
  where bucket_id = 'chatfotos';`;

const VOORWAARDELIJK = `do $$
begin
  create index if not exists objects_iets_idx
    on storage.objects (bucket_id, created_at)
    where bucket_id = 'chatfotos';
exception when insufficient_privilege then
  raise notice 'overgeslagen';
end $$;`;

describe('wat de controle moet vínden', () => {
  it('een kale create index op storage.objects', () => {
    const uit = kaleIndexen(KAAL);
    expect(uit).toHaveLength(1);
    expect(uit[0]).toMatchObject({ index: 'objects_iets_idx', tabel: 'storage.objects' });
  });

  it('ook op storage.buckets — dezelfde eigenaar, dezelfde fout', () => {
    expect(kaleIndexen('create index b_idx on storage.buckets (name);')).toHaveLength(1);
  });

  it('ook een unique index, en ook met concurrently', () => {
    expect(kaleIndexen('create unique index u_idx on storage.objects (name);')).toHaveLength(1);
    expect(
      kaleIndexen('create index concurrently c_idx on storage.objects (name);'),
    ).toHaveLength(1);
  });

  /**
   * ⚠️ De gevaarlijke variant: een dollarblok élders in het bestand mag een
   *    kale index verderop niet afdekken. Zonder de pariteitstelling zou de
   *    treffer ten onrechte "binnen een blok" heten.
   */
  it('een kale index ná een afgesloten dollarblok', () => {
    const sql = `do $$ begin perform 1; end $$;\n\n${KAAL}`;
    expect(kaleIndexen(sql)).toHaveLength(1);
  });
});

describe('wat de controle met rúst moet laten', () => {
  it('dezelfde index, maar voorwaardelijk', () => {
    expect(kaleIndexen(VOORWAARDELIJK)).toEqual([]);
  });

  /**
   * ⚠️ De belofte is smal met opzet: alleen tabellen die we niet bezitten.
   *    Een index op `public` is geen bevinding, hoe kaal hij ook staat.
   */
  it('een kale index op een tabel die we wél bezitten', () => {
    expect(kaleIndexen('create index g_idx on public.goals (owner_id);')).toEqual([]);
  });

  it('een rollback-pad in de kop, dat commentaar is en geen code', () => {
    const sql = `-- ROLLBACK-PAD:\n--   create index objects_iets_idx on storage.objects (name);\n\nselect 1;`;
    expect(kaleIndexen(sql)).toEqual([]);
  });

  it('een drop, want die vraagt geen eigendom als het object er niet is', () => {
    expect(kaleIndexen('drop index if exists storage.objects_iets_idx;')).toEqual([]);
  });
});

describe('de knip en de pariteit, elk los', () => {
  it('zonderCommentaar haalt een regelcommentaar weg en laat code staan', () => {
    expect(zonderCommentaar('select 1; -- weg\nselect 2;')).toBe('select 1; \nselect 2;');
  });

  it('binnenDollarBlok telt de quotes ervoor', () => {
    const sql = 'aaa $$ bbb $$ ccc';
    expect(binnenDollarBlok(sql, sql.indexOf('bbb'))).toBe(true);
    expect(binnenDollarBlok(sql, sql.indexOf('ccc'))).toBe(false);
    expect(binnenDollarBlok(sql, sql.indexOf('aaa'))).toBe(false);
  });
});

/**
 * ⚠️ **De belofte, en niet een eigenschap van een onderdeel.** De vorige drie
 *    blokken voeden losse tekst aan de functie. Dit blok toetst wat de controle
 *    werkelijk belooft: *in deze repo staat geen kale index op een vreemde
 *    tabel*. Die blijft kloppen als iemand een migratie verplaatst of toevoegt.
 */
describe('de belofte over de repo zelf', () => {
  it('geen enkele migratie draagt een kale index op een vreemde tabel', async () => {
    const { bevindingen } = await import('../../scripts/storage-eigendom-controle.mjs');
    expect(bevindingen()).toEqual([]);
  });
});
