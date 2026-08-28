import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIES = join(__dirname, '..', '..', 'supabase', 'migrations');

/**
 * Een bewaking die een lijst met tabelnamen draagt, bewaakt die lijst — niet de regel.
 *
 * ⚠️ **Dit is de fout van 0101, letterlijk.** Die migratie trok schrijfrechten in
 *    op vier tabellen en zette er `schrijfrechten_bewaking()` naast met precies
 *    die vier namen in de `where`. De reden die erbij stond klopte op zichzelf —
 *    een besluit hoort in code en niet in data — maar hier was het geen besluit:
 *    de regel was uit te rekenen. Op 28-08 bleken er 58 schrijfrechten voor `anon`
 *    over 21 tabellen en 18 voor `authenticated` over 9, en de bewaking meldde
 *    nul, want geen ervan stond in de lijst.
 *
 * ⚠️ **Waarom dit een statische test is en geen RLS-test.** De gedragskant —
 *    "geef een recht terug op een tabel buiten de vier en de bewaking meldt hem" —
 *    is met de hand geijkt op de lokale stack en staat opgeschreven in
 *    `tests/rls/schrijfrechten.test.ts`. Herhalen kan de suite niet: die praat
 *    via PostgREST en kan geen `grant` uitvoeren, en een functie bouwen die dat
 *    wél kan is een gat dat je niet wilt om een test te kunnen schrijven.
 *
 *    Wat hier overblijft is de vorm die de terugval veroorzaakt, en die is
 *    statisch te zien: een tabelnaam in de definitie.
 *
 * ⚠️ **De tweede helft weegt even zwaar.** Een controle die elke tabelnaam in elk
 *    SQL-bestand meldt, is onbruikbaar. Hij kijkt daarom alleen in de definitie
 *    van de bewakingsfuncties, en alleen naar namen van tabellen die het schema
 *    ook echt heeft.
 */

/** De laatste `create [or replace] function`-definitie van `naam` in de migraties. */
export function laatsteDefinitie(bestanden: readonly string[], naam: string): string | null {
  let gevonden: string | null = null;

  for (const sql of bestanden) {
    const begin = new RegExp(
      `create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${naam}\\s*\\(`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = begin.exec(sql)) !== null) {
      // Tot het einde van het body-blok: `$$;` sluit een dollar-quoted functie af.
      const rest = sql.slice(m.index);
      const einde = rest.indexOf('$$;');
      gevonden = einde === -1 ? rest : rest.slice(0, einde + 3);
    }
  }

  return gevonden;
}

/** De tabelnamen die de migraties aanmaken. */
export function tabelnamen(bestanden: readonly string[]): readonly string[] {
  const namen = new Set<string>();
  for (const sql of bestanden) {
    for (const m of sql.matchAll(
      /create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      namen.add(m[3]!.toLowerCase());
    }
  }
  return [...namen].sort();
}

/** De tabelnamen die letterlijk in `bron` staan. */
export function genoemdeTabellen(bron: string, tabellen: readonly string[]): readonly string[] {
  // Commentaar telt niet mee: de uitleg boven de functie mág namen noemen, en
  // dat is juist waar de meting van 28-08 in hoort te staan.
  const zonderCommentaar = bron
    .split('\n')
    .map((regel) => regel.split('--')[0] ?? '')
    .join('\n');

  return tabellen.filter((t) => new RegExp(`\\b${t}\\b`).test(zonderCommentaar));
}

describe('een bewaking rekent de regel uit en draagt geen lijst', () => {
  const bestanden = readdirSync(MIGRATIES)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((n) => readFileSync(join(MIGRATIES, n), 'utf8'));

  const tabellen = tabelnamen(bestanden);

  it('kent het schema, anders toetst de rest niets', () => {
    // Ondergrens en geen exact getal: het schema groeit, en dan hoort deze test
    // niet rood te worden om iets dat er niets mee te maken heeft.
    expect(tabellen.length).toBeGreaterThan(25);
    expect(tabellen).toContain('goal_group_links');
    expect(tabellen).toContain('points_ledger');
  });

  it('vindt de laatste definitie van schrijfrechten_bewaking', () => {
    const bron = laatsteDefinitie(bestanden, 'schrijfrechten_bewaking');

    expect(bron).not.toBeNull();
    // De generieke vorm rekent met `has_table_privilege` en `pg_policy`; de
    // versie van 0101 deed dat geen van beide.
    expect(bron!).toContain('has_table_privilege');
    expect(bron!).toContain('pg_policy');
  });

  it('en die definitie noemt geen enkele tabel bij naam', () => {
    const bron = laatsteDefinitie(bestanden, 'schrijfrechten_bewaking')!;
    const genoemd = genoemdeTabellen(bron, tabellen);

    expect(genoemd, `hardgecodeerde tabelnamen: ${genoemd.join(', ')}`).toEqual([]);
  });

  /**
   * ⚠️ De ijking van de zeef zelf. Zonder deze twee is niet te zien of
   *    `genoemdeTabellen()` überhaupt iets kán vinden — en een controle die nooit
   *    rood is geweest, is een aanname.
   */
  describe('de zeef is geijkt', () => {
    it('vindt een naam die er wél in staat', () => {
      const nep = "select 1 where t in ('points_ledger', 'user_streaks')";
      expect(genoemdeTabellen(nep, tabellen)).toEqual(['points_ledger', 'user_streaks']);
    });

    it('laat een naam in commentaar met rust', () => {
      const nep = '-- ooit stond hier points_ledger\nselect 1;';
      expect(genoemdeTabellen(nep, tabellen)).toEqual([]);
    });

    it('trapt niet in een langere naam die een kortere bevat', () => {
      // `goals` zit in `goal_group_links` noch in `goal_events` als los woord.
      const nep = 'select 1 from goal_group_links';
      expect(genoemdeTabellen(nep, tabellen)).toEqual(['goal_group_links']);
    });
  });
});
