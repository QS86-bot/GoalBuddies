/**
 * De belofte: **`tellerbereik:controle` vindt een schrijfactie op `dagtellers`
 * die buiten haar eigen sleutels reikt, en laat er een die dat niet doet met
 * rust** — QS8-442.
 *
 * ⚠️⚠️ **Die tweede helft is even belangrijk als de eerste.** Een controle die
 *    élke schrijfactie meldt, leert je hem uit te zetten — en dan bewaakt hij
 *    niets meer. De gevallen hieronder komen daarom in twee soorten, en beide
 *    zijn met de hand nagelopen tegen de échte regels uit de testboom.
 *
 * 📏 **De ijking staat in
 *    `docs/decisions/2026-09-13-de-waarschuwing-stond-bij-het-verkeerde-werkwoord.md` §5.**
 */
import { describe, expect, it } from 'vitest';

import {
  heeftEigenBereik,
  klachten,
  schrijfacties,
  zonderCommentaar,
} from '../../scripts/tellerbereik-controle.mjs';

// ---------------------------------------------------------------------------

describe('hij knipt een statement af waar psql dat ook doet', () => {
  it('stopt bij de puntkomma en neemt de `where` van het volgende statement niet mee', () => {
    const bron = [
      'psql(`update dagtellers set venster_start = now();',
      "  update push_tokens set created_at = now() where user_id = '${U}'`);",
    ].join('\n');

    expect(schrijfacties(bron)).toEqual(['update dagtellers set venster_start = now()']);
  });

  it('stopt bij het einde van het sjabloonliteral', () => {
    const bron = "psql(`delete from dagtellers where domein = 'chatdocs'`);";

    expect(schrijfacties(bron)).toEqual([
      "delete from dagtellers where domein = 'chatdocs'",
    ]);
  });

  it('vindt hem ook met een schema ervoor', () => {
    const bron = 'psql(`delete from public.dagtellers where sleutel = ${x}`);';

    expect(schrijfacties(bron)).toHaveLength(1);
  });

  /**
   * ⚠️ De knip die commentaar weghaalt is zelf een grendel (CLAUDE.md, QS8-412).
   *    Een uitleg óver een kale delete is geen kale delete.
   */
  it('telt een schrijfactie in commentaar niet mee', () => {
    const bron = [
      '// Een kale `delete from dagtellers` wist de teller van een andere suite.',
      '/* update dagtellers set venster_start = now(); */',
      "psql(`delete from dagtellers where sleutel similar to '%(${mijne})%'`);",
    ].join('\n');

    expect(schrijfacties(bron)).toHaveLength(1);
  });

  it('en een regel met een url erin overleeft die knip', () => {
    const bron = "const bron = 'https://voorbeeld/x'; psql(`update dagtellers set aantal = 0`);";

    expect(schrijfacties(bron)).toEqual(['update dagtellers set aantal = 0']);
  });

  it('laat een schrijfactie op een ándere tabel met rust', () => {
    const bron = 'psql(`delete from storage.objects where bucket_id = \'chatfotos\'`);';

    expect(schrijfacties(bron)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('wat als eigen bereik telt', () => {
  it.each([
    ['update dagtellers set venster_start = now()', 'geen where'],
    ["delete from dagtellers where domein = 'chatdocs'", 'alleen een domein — drie bestanden delen dat'],
    ["update dagtellers set aantal = 0 where soort = 'groep'", 'alleen een soort'],
  ])('%s is geen eigen bereik (%s)', (statement) => {
    expect(heeftEigenBereik(statement)).toBe(false);
  });

  it.each([
    "delete from dagtellers where sleutel similar to '%(${mijne})%'",
    "update dagtellers set venster_start = now() where domein = 'push_tokens' and sleutel = '${GEBRUIKER}'",
    'delete from dagtellers where sleutel like ${groep}',
  ])('%s is wél eigen bereik', (statement) => {
    expect(heeftEigenBereik(statement)).toBe(true);
  });

  /**
   * ⚠️⚠️ **De grens van dit instrument, en hij staat hier als toets zodat
   *    niemand hem per ongeluk wegpoetst.** Een interpolatie is het signáál dat
   *    er een waarde per run in staat, niet het bewijs — wie er een constante in
   *    zet, komt erlangs. Dat weten en opschrijven is beter dan een controle die
   *    doet alsof hij meer ziet dan hij ziet.
   */
  it('ziet niet dat een interpolatie een constante kan zijn', () => {
    expect(heeftEigenBereik("delete from dagtellers where domein = '${DOMEIN}'")).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('de klacht noemt het bestand en de regel', () => {
  it('meldt de kale update', () => {
    const uit = klachten('psql(`update dagtellers set venster_start = now()`);', 'tests/rls/x.test.ts');

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('tests/rls/x.test.ts');
    expect(uit[0]).toContain('update dagtellers set venster_start = now()');
  });

  it('zwijgt over een schrijfactie die haar bereik noemt', () => {
    expect(
      klachten("psql(`delete from dagtellers where sleutel = '${u}'`);", 'tests/rls/x.test.ts'),
    ).toEqual([]);
  });

  it('zwijgt over een bestand dat de tabel niet aanraakt', () => {
    expect(klachten('const x = 1;', 'tests/rls/x.test.ts')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('zonderCommentaar', () => {
  it('haalt een blok weg', () => {
    expect(zonderCommentaar('a /* weg */ b')).toBe('a   b');
  });

  it('haalt een regel weg die met // begint', () => {
    expect(zonderCommentaar('a\n  // weg\nb')).toBe('a\nb');
  });

  it('laat een url in code staan', () => {
    expect(zonderCommentaar("const u = 'https://x/y';")).toBe("const u = 'https://x/y';");
  });
});
