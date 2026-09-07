import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CATEGORIEEN } from '../../src/shared/categorieen';

const WORTEL = join(__dirname, '..', '..');
const DOELCOACH = join(WORTEL, 'supabase', 'functions', 'doelcoach', 'index.ts');

/**
 * De Doelcoach kent dezelfde gebieden als de database — QS8-288.
 *
 * ⚠️ **De lijst met doelgebieden staat op zeven plekken, met opzet.** `shared`,
 *    `modules/goals`, `shared/ui/categoriemerk`, `shared/ui/tips`,
 *    `modules/ai/uitvoer`, deze Edge Function (twee keer) en de drie
 *    CHECK-constraints. Ze mogen elkaar niet importeren — een Edge Function
 *    draait op Deno en kan niets uit `src/` halen — dus de afspraak is dat elke
 *    kopie onder een toets staat die hem naast de andere legt.
 *
 * ⚠️ **Deze twee stonden onder geen enkele toets, en het bestand wist dat.** In
 *    `doelcoach/index.ts` staat het letterlijk: *"dat is de zwakke schakel van de
 *    drie."* Gevonden in de security-review van A58, toen vier gebieden tegelijk
 *    vervielen en één erbij kwam; ze liepen toen gelijk, maar niets zou rood zijn
 *    geworden als dat niet zo was.
 *
 * ⚠️ **Wat het kost als ze uiteenlopen, is geen schoonheidsfout.** Kent de
 *    functie een gebied dat de database niet meer heeft, dan laat `planUit()`
 *    het door en valt de insert om op `23514` — een foutcode waarvan de code zelf
 *    schrijft dat hij de gebruiker niets zegt. Kent de database er een die de
 *    functie niet heeft, dan kiest de AI hem nooit en belandt het doel stil onder
 *    "Overig".
 *
 * ⚠️ **De twee plekken worden apart getoetst en niet samen.** Het `enum` staat
 *    bovenin het JSON-schema en de opsomming staat honderden regels lager in de
 *    prompt; ze zijn los te wijzigen en dus los te vergeten. Eén toets op allebei
 *    tegelijk zou groen blijven als er precies één verschuift.
 */

const BRON = readFileSync(DOELCOACH, 'utf8');

/**
 * De `enum`-lijst uit het JSON-schema.
 *
 * ⚠️ Grijpt naar het `category`-blok en niet naar "de eerste enum in het
 *    bestand": er staan er meer (`ritme` heeft er ook een), en een lezer die de
 *    eerste pakt, toetst straks iets anders zonder dat iemand het merkt.
 */
export function enumCategorieen(bron: string): readonly string[] {
  const blok = /category:\s*\{[\s\S]*?enum:\s*\[([\s\S]*?)\]/.exec(bron);
  if (blok === null) return [];

  return (blok[1] ?? '')
    .split(',')
    .map((deel) => deel.trim().replace(/^'|'$/g, ''))
    .filter((deel) => deel !== '' && !deel.startsWith('//'));
}

/**
 * De gebieden die de prompttekst noemt.
 *
 * ⚠️ Alleen de regels van de `category`-alinea, en die loopt van de regel die
 *    `"category"` introduceert tot de eerstvolgende opsommingsregel. Zou dit de
 *    hele prompt afzoeken op woorden tussen aanhalingstekens, dan telt het ook
 *    `"title"`, `"milestones"` en elk ander veld mee — en dan meldt deze toets
 *    onzin, wat je leert negeren.
 */
export function promptCategorieen(bron: string): readonly string[] {
  const alinea = /- "category":[\s\S]*?(?=\n\s*'- ")/.exec(bron);
  if (alinea === null) return [];

  return [...(alinea[0] ?? '').matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1] ?? '')
    .filter((woord) => woord !== 'category');
}

describe('de Doelcoach kent precies de gebieden die de database kent', () => {
  it('het enum in het JSON-schema loopt gelijk met CATEGORIEEN', () => {
    const gevonden = enumCategorieen(BRON);

    expect(gevonden.length, 'het category-enum niet gevonden in doelcoach/index.ts').toBeGreaterThan(
      0,
    );
    expect([...gevonden].sort()).toEqual([...CATEGORIEEN].sort());
  });

  it('de prompttekst noemt precies dezelfde gebieden', () => {
    const gevonden = promptCategorieen(BRON);

    expect(
      gevonden.length,
      'de category-alinea van de prompt niet gevonden in doelcoach/index.ts',
    ).toBeGreaterThan(0);
    expect([...gevonden].sort()).toEqual([...CATEGORIEEN].sort());
  });
});

/**
 * ⚠️ **De tweede helft: de lezers vinden wat ze moeten vinden en laten de rest
 *    met rust.** Zonder deze vier zou een lezer die niets vindt de toetsen
 *    hierboven op een lege lijst laten draaien — en dan is de ondergrens het
 *    enige dat nog iets zegt.
 */
describe('de twee lezers lezen wat er staat', () => {
  it('enumCategorieen pakt het category-blok en niet een ander enum', () => {
    const bron = `
      ritme: { type: 'string', enum: ['daily', 'weekly'] },
      category: { type: 'string', enum: ['fitness', 'other'] },
    `;
    expect(enumCategorieen(bron)).toEqual(['fitness', 'other']);
  });

  it('enumCategorieen geeft niets terug als het blok er niet is', () => {
    expect(enumCategorieen('geen schema hier')).toEqual([]);
  });

  it('promptCategorieen leest alleen de alinea van category', () => {
    const bron = [
      "    '- \"title\": het doel in een korte titel.',",
      "    '- \"category\": kies er precies één:',",
      "    '  \"fitness\" (sport), \"other\" (de rest).',",
      "    '- \"identity_statement\": één zin in de ik-vorm.',",
    ].join('\n');

    expect(promptCategorieen(bron)).toEqual(['fitness', 'other']);
  });

  it('promptCategorieen geeft niets terug als de alinea er niet is', () => {
    expect(promptCategorieen("'- \"title\": een korte titel.',")).toEqual([]);
  });
});
