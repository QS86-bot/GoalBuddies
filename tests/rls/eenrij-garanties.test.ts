import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { garantiesUit } from '../../scripts/eenrij-controle.mjs';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De garanties die `eenrij:controle` uit de migraties afleest, bestaan echt — QS8-639.
 *
 * ⚠️⚠️ **Dit is de naad tussen twee correcte onderdelen.** `garantiesUit()` speelt
 *    de migratietekst af (create, drop, rename) en is daar op zichzelf geijkt
 *    in `tests/scripts/eenrij-controle.test.ts`. Of dat afspelen óók klopt met wat
 *    Postgres ervan maakt, is een andere vraag, en alleen een database kan haar
 *    beantwoorden. 📏 Zonder deze toets stond het antwoord op 05-10-2026 op
 *    **3 spookgaranties van 71**: twee oude varianten van
 *    `points_ledger_dedupe_idx` en een hernoemde `opslag_dagtellers`.
 *
 * ⚠️ **Eén richting, en dat is met opzet.** Een garantie die het script kent en de
 *    database niet, laat een aanroep als gedekt doorgaan die dat niet is — dat is
 *    het gevaar. Een unieke index die de database kent en het script niet, maakt
 *    hooguit een aanroep tot bevinding die het niet hoeft te zijn: de controle
 *    faalt dicht. Die richting hier ook eisen zou deze toets rood maken op
 *    vormen die het script bewust niet leest (een expressie-index, een
 *    predicaat dat het niet snapt) en hem daarmee leren overslaan.
 *
 * ⚠️ **Een view heeft geen index, en is dus de bekende erfenis.** `goal_dashboard`,
 *    `mijn_profiel` en `mijn_doelvelden` krijgen hun garantie één laag lager. De
 *    toets slaat ze over als de database ze als view kent — en alleen dan. Een
 *    relatie die in de database helemaal niet bestaat, is geen view maar een
 *    spook, en blijft een bevinding.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'points_ledger' and relnamespace = 'public'::regnamespace",
  import.meta.url,
);

const MIGRATIES = join(__dirname, '..', '..', 'supabase', 'migrations');

type Garantie = { kolommen: string[]; predicaat: object | null };

const sleutelVan = (tabel: string, kolommen: string[], partieel: boolean) =>
  `${tabel}|${[...kolommen].sort().join(',')}|${partieel ? 'partieel' : 'heel'}`;

/** Elke unieke, geldige index in `public`, als `tabel|kolommen|partieel`. */
function indexenInDatabase(): Set<string> {
  const uit = psql(`
    select c.relname, coalesce(string_agg(a.attname, ',' order by a.attname), ''), (i.indpred is not null)
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey) and a.attnum > 0
    where c.relnamespace = 'public'::regnamespace and i.indisunique and i.indisvalid
    group by i.indexrelid, c.relname, i.indpred;
  `);
  return new Set(
    uit
      .split('\n')
      .filter((regel) => regel !== '')
      .map((regel) => {
        const [tabel, kolommen, partieel] = regel.split('|');
        return sleutelVan(tabel as string, (kolommen as string).split(','), partieel === 't');
      }),
  );
}

/** De views en materialized views in `public`: daar bestaat een garantie alleen als erfenis. */
function viewsInDatabase(): Set<string> {
  const uit = psql(
    "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('v', 'm');",
  );
  return new Set(uit.split('\n').filter((regel) => regel !== ''));
}

describe('eenrij:controle — de afgespeelde garanties bestaan in de database', () => {
  it.runIf(beschikbaar)('kent geen garantie die de database niet heeft', () => {
    const sql = readdirSync(MIGRATIES)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(MIGRATIES, f), 'utf8'));
    const garanties = garantiesUit(sql) as Map<string, Garantie[]>;
    const indexen = indexenInDatabase();
    const views = viewsInDatabase();

    const spoken: string[] = [];
    let gelezen = 0;
    for (const [tabel, lijst] of garanties) {
      if (views.has(tabel)) continue;
      for (const g of lijst) {
        gelezen += 1;
        const sleutel = sleutelVan(tabel, g.kolommen, g.predicaat !== null);
        if (!indexen.has(sleutel)) spoken.push(sleutel);
      }
    }

    // De kanarie: een lege vergelijking is ook wat je krijgt als beide kanten stuk zijn.
    expect(gelezen).toBeGreaterThan(50);
    expect(indexen.size).toBeGreaterThan(50);
    expect(spoken, 'garanties uit de migratietekst die de database niet heeft').toEqual([]);
  });
});
