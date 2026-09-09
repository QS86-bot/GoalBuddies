import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { telTekens } from '../../shared/tekst';

import {
  TAAK_MAX,
  TAAK_MIN,
  VOLGORDE_MAX,
  taakInvoerSchema,
  taakPatchSchema,
} from './todo-schemas';

/**
 * De invoerregels van De Lijst — QS8-379.
 *
 * ⚠️ **De belofte is niet "het schema weigert lege tekst".** Die is: *wat dit
 *    schema doorlaat, laat de database ook door, en wat het weigert weigert zij
 *    om dezelfde reden.* Dat is een eigenschap van de naad tussen twee correcte
 *    onderdelen (onwrikbare regel 18, vraag 1), en de enige manier om hem te
 *    toetsen is de twee naast elkaar te leggen in plaats van het schema met
 *    zichzelf te vergelijken.
 *
 * ⚠️ **Daarom komen de grenzen hieronder uit het migratiebestand en niet uit een
 *    getal dat hier is overgetypt.** Verandert de CHECK, dan wordt deze test
 *    rood — een overgetypt getal blijft groen en de gebruiker krijgt een
 *    Postgres-fout in plaats van een zin. Zelfde vorm als
 *    `tests/beloftes/avatar.test.ts`.
 */
/**
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel, telkens
 * teruggezet:
 *
 *   L  `telTekens(tekst) <= TAAK_MAX` -> `tekst.length <= TAAK_MAX`
 *      -> 1 rood: 'laat een taak van precies TAAK_MAX codepunten door, ook als
 *         het emoji zijn'  — dit is QS8-118 in zijn zuiverste vorm
 *   M  `.trim()` uit `taakTekst`
 *      -> 2 rood: 'weigert wat na trimmen niets overhoudt' en de must-allow, die
 *         de getrimde tekst terugleest
 *   N  `TAAK_MAX` op 400
 *      -> 1 rood: 'TAAK_MIN en TAAK_MAX komen letterlijk uit de CHECK van 0227'
 *   O  de schema's op `loose()` in plaats van strippend
 *      -> 1 rood: 'laat visibility niet door'
 *   P  de `refine` op een lege patch weg
 *      -> 2 rood: 'weigert een patch zonder één veld' en de visibility-patch,
 *         die op diezelfde weigering leunt
 *   Q  `VOLGORDE_MAX` op 999_999
 *      -> 1 rood: 'VOLGORDE_MAX komt letterlijk uit de CHECK van 0227'
 *   R  `.max(VOLGORDE_MAX)` van `order_index` af
 *      -> 1 rood: 'weigert een volgordenummer boven de grens en laat de grens
 *         zelf door'
 */
const MIGRATIE = readFileSync(
  'supabase/migrations/0227_de_lijst_krijgt_een_tabel_die_dicht_staat.sql',
  'utf8',
);

/** Een string van precies `n` codepunten, gebouwd uit tekens die er twéé kosten. */
function emoji(n: number): string {
  return '😀'.repeat(n);
}

describe('de grenzen staan in de database én in het schema, en ze zijn gelijk', () => {
  it('TAAK_MIN en TAAK_MAX komen letterlijk uit de CHECK van 0227', () => {
    const uitMigratie =
      /char_length\(btrim\(body\)\)\s*between\s*(\d+)\s*and\s*(\d+)/i.exec(MIGRATIE);
    expect(uitMigratie, 'geen todo_items_body_len in 0227').not.toBeNull();

    expect(Number(uitMigratie?.[1])).toBe(TAAK_MIN);
    expect(Number(uitMigratie?.[2])).toBe(TAAK_MAX);
  });

  /**
   * ⚠️⚠️ **Dit is het geval waar QS8-118 over gaat, en het is met emoji te
   *    zien en met gewone letters niet.** `char_length` telt codepunten en
   *    `String.prototype.length` telt UTF-16-eenheden. Een taak van 500 emoji
   *    heeft `char_length` 500 — de database laat hem door — maar `.length`
   *    1000. Een schema met `.max(500)` weigert hem, en dan stelt de app een
   *    grens die niemand besloten heeft.
   */
  it('laat een taak van precies TAAK_MAX codepunten door, ook als het emoji zijn', () => {
    const taak = emoji(TAAK_MAX);
    expect(telTekens(taak), 'de opbouw klopt niet').toBe(TAAK_MAX);
    expect(taak.length, 'zonder dit verschil bewijst deze test niets').toBe(TAAK_MAX * 2);

    expect(taakInvoerSchema.safeParse({ body: taak }).success).toBe(true);
  });

  it('weigert er eentje van TAAK_MAX + 1 codepunten', () => {
    expect(taakInvoerSchema.safeParse({ body: emoji(TAAK_MAX + 1) }).success).toBe(false);
  });

  /**
   * ⚠️ De CHECK doet `btrim(body)`. Zonder `.trim()` in het schema is een taak
   *    van vijf spaties hier geldig en in de database niet — en dan krijgt de
   *    gebruiker een `23514` te zien voor een lege regel.
   */
  it('weigert wat na trimmen niets overhoudt, net als btrim in de CHECK', () => {
    expect(taakInvoerSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(taakInvoerSchema.safeParse({ body: '' }).success).toBe(false);
  });

  /**
   * ⚠️ **Ook een bovengrens op `order_index`, en om dezelfde reden als de
   *    tekstgrens: wat het schema doorlaat, hoort de database ook door te
   *    laten.** 📏 De security-review op dit issue mat dat een client hier
   *    `2147483647` in kon zetten, waarna "achteraan toevoegen" (`max + 1`)
   *    omvalt met `22003 integer out of range`.
   */
  it('VOLGORDE_MAX komt letterlijk uit de CHECK van 0227', () => {
    const uitMigratie = /order_index\s+between\s+(\d+)\s+and\s+(\d+)/i.exec(MIGRATIE);
    expect(uitMigratie, 'geen todo_items_order_bereik in 0227').not.toBeNull();

    expect(Number(uitMigratie?.[1])).toBe(0);
    expect(Number(uitMigratie?.[2])).toBe(VOLGORDE_MAX);
  });

  it('weigert een volgordenummer boven de grens en laat de grens zelf door', () => {
    expect(
      taakInvoerSchema.safeParse({ body: 'Taak', order_index: VOLGORDE_MAX }).success,
    ).toBe(true);
    expect(
      taakInvoerSchema.safeParse({ body: 'Taak', order_index: VOLGORDE_MAX + 1 }).success,
    ).toBe(false);
    expect(taakPatchSchema.safeParse({ order_index: 2_147_483_647 }).success).toBe(false);
  });

  it('MUST-ALLOW: een gewone taak komt er gewoon door', () => {
    const uit = taakInvoerSchema.safeParse({ body: '  Bellen met de tandarts  ' });

    expect(uit.success).toBe(true);
    expect(uit.data?.body, 'de tekst hoort getrimd de database in te gaan').toBe(
      'Bellen met de tandarts',
    );
  });
});

describe('het schema biedt geen pad dat de database niet heeft', () => {
  /**
   * ⚠️ **`visibility` is de kolom waar dit issue om draait.** Hij is voor geen
   *    enkele client schrijfbaar (0227, kolomgrant én policy). Zou hij hier wél
   *    door het schema komen, dan bouwt het scherm van QS8-380 er een veld voor
   *    en loopt de eerste gebruiker op een `42501`.
   */
  it('laat visibility niet door — niet bij een nieuwe taak en niet bij een patch', () => {
    const nieuw = taakInvoerSchema.safeParse({ body: 'Taak', visibility: 'group' });
    expect(nieuw.success).toBe(true);
    expect(
      Object.keys(nieuw.data ?? {}),
      'visibility hoort uit de invoer te vallen; de kolomgrant kent hem niet',
    ).not.toContain('visibility');

    const patch = taakPatchSchema.safeParse({ visibility: 'group' });
    expect(patch.success, 'een patch die alleen visibility zet, hoort niets te doen').toBe(false);
  });

  /**
   * ⚠️ De drie velden hieronder zijn precies de UPDATE-kolomgrant van 0227. Komt
   *    er een vierde bij in het schema zonder dat de grant meebeweegt, dan is de
   *    melding die de gebruiker krijgt een Postgres-fout.
   */
  it('kent in een patch precies de kolommen uit de UPDATE-grant van 0227', () => {
    const uitMigratie = /grant update \(([^)]+)\)\s+on table public\.todo_items/i.exec(MIGRATIE);
    expect(uitMigratie, 'geen UPDATE-kolomgrant in 0227').not.toBeNull();

    const uitGrant = (uitMigratie?.[1] ?? '')
      .split(',')
      .map((k) => k.trim())
      .sort();

    const uitSchema = Object.keys(
      taakPatchSchema.safeParse({
        body: 'Nieuw',
        done_at: '2026-09-09T10:00:00.000Z',
        order_index: 3,
      }).data ?? {},
    ).sort();

    expect(uitSchema).toEqual(uitGrant);
  });

  it('MUST-ALLOW: afvinken en terugzetten kan allebei', () => {
    expect(taakPatchSchema.safeParse({ done_at: '2026-09-09T10:00:00.000Z' }).success).toBe(true);
    expect(taakPatchSchema.safeParse({ done_at: null }).success).toBe(true);
  });

  /**
   * ⚠️ Een lege patch is een verzoek dat niets doet en toch een ronde naar de
   *    server kost. `tests/beloftes/lege-patch.test.ts` beschrijft die klasse.
   */
  it('weigert een patch zonder één veld', () => {
    expect(taakPatchSchema.safeParse({}).success).toBe(false);
  });
});
