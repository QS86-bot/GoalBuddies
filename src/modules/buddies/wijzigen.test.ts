import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { groepPatchSchema } from './schemas';

/**
 * Elk veld dat `groepPatchSchema` accepteert, wordt door `wijzigGroep()` ook
 * geschreven — QS8-65.
 *
 * ⚠️ **Dit bestand bestaat omdat die twee lijsten op 24-08 uit elkaar liepen.**
 *    `zichtbaarheid` zat in het schema en niet in de update-lijst van
 *    `wijzigGroep()`. Gevolg: `wijzigGroep(id, { zichtbaarheid: 'open' })`
 *    typechecktte, valideerde, gaf `ok: true` terug — en deed niets. Geen lek
 *    (de kolomgrant en `guard_group_update()` staan er ook nog), wél een belofte
 *    die het type deed en de code niet waarmaakte. Gevonden door de
 *    code-critic-ronde, niet door een test.
 *
 *    De reparatie toen was het veld uit het schema halen. Dat werkt zolang
 *    iemand eraan denkt, en QS8-65 voegt er twee velden bij — dus nu staat er
 *    een test onder in plaats van een herinnering.
 *
 * ⚠️ **De update-lijst wordt uit de bron gelezen en niet uit een tweede lijst
 *    hier.** Een kopie hier zou dezelfde fout een niveau hoger maken: dan
 *    vergelijkt de test twee dingen die ik allebei zelf opschrijf, en dat is
 *    precies wat migratie 0032/0034 deed.
 */

const API = fileURLToPath(new URL('./api.ts', import.meta.url));

/** De kolommen die `wijzigGroep()` daadwerkelijk in zijn update zet. */
export function geschrevenKolommen(bron: string): readonly string[] {
  const begin = bron.indexOf('export async function wijzigGroep(');
  if (begin === -1) return [];

  // Tot aan de `.update(` — daarna is het object af en beginnen andere functies.
  const eind = bron.indexOf('.update(update)', begin);
  const blok = bron.slice(begin, eind === -1 ? bron.length : eind);

  return [...new Set([...blok.matchAll(/\bupdate\.([a-z_]+)\s*=/g)].map((m) => m[1] ?? ''))].sort();
}

describe('geschrevenKolommen', () => {
  it('vindt de toewijzingen', () => {
    const bron = `
      export async function wijzigGroep(a, b) {
        const update = {};
        if (x !== undefined) update.name = x;
        if (y !== undefined) update.huddle_day = y;
        const r = await supabase().from('groups').update(update).eq('id', id);
      }
    `;
    expect(geschrevenKolommen(bron)).toEqual(['huddle_day', 'name']);
  });

  it('kijkt niet voorbij de update-aanroep', () => {
    // Anders telt een toewijzing uit een ándere functie mee en meldt de test
    // groen over een kolom die `wijzigGroep()` nooit aanraakt.
    const bron = `
      export async function wijzigGroep() {
        update.name = x;
        await q.update(update).eq('id', id);
      }
      export async function iets() { update.tz = y; }
    `;
    expect(geschrevenKolommen(bron)).toEqual(['name']);
  });

  it('geeft niets terug als de functie er niet is', () => {
    expect(geschrevenKolommen('export const a = 1;')).toEqual([]);
  });
});

/**
 * Welke velden laat het schema door? Behavioureel gemeten en niet uit de vorm
 * van het Zod-object afgeleid — dat laatste breekt zodra er een `refine` bij
 * komt, en dat is bij QS8-65 precies gebeurd.
 */
function velden(): readonly string[] {
  const alles = {
    name: 'Een groep',
    huddle_day: 1,
    evidence_policy: 'optional',
    approval_rule: 'quorum',
    approval_quorum: 3,
    season_cadence: 'monthly',
  };

  const uit = groepPatchSchema.safeParse(alles);
  if (!uit.success) throw new Error(`de proefpatch valideert niet: ${uit.error.message}`);

  return Object.keys(uit.data).sort();
}

describe('wijzigGroep schrijft alles wat het schema accepteert', () => {
  it('laat geen veld dood in de update-lijst', () => {
    // ⚠️ Wordt deze rood, dan is er een veld bijgekomen in `groepPatchSchema`
    //    zonder regel in `wijzigGroep()`. Voeg die regel toe — of haal het veld
    //    uit het schema, zoals bij `zichtbaarheid` de juiste keuze was omdat
    //    `zet_groepszichtbaarheid()` de enige route is.
    const geschreven = geschrevenKolommen(readFileSync(API, 'utf8'));

    for (const veld of velden()) {
      expect(geschreven, `${veld} staat in het schema maar wordt niet geschreven`).toContain(veld);
    }
  });

  /**
   * ⚠️ De andere kant op, en die is even belangrijk. Een kolom die `wijzigGroep()`
   *    schrijft zonder dat het schema hem valideert, is een schrijfpad zonder
   *    controle — en `groepSchema` is de enige plek waar de grenzen staan.
   */
  it('schrijft geen kolom die het schema niet kent', () => {
    const geschreven = geschrevenKolommen(readFileSync(API, 'utf8'));
    const toegestaan = new Set(velden());

    for (const kolom of geschreven) {
      expect(toegestaan.has(kolom), `${kolom} wordt geschreven maar staat niet in het schema`).toBe(
        true,
      );
    }
  });
});
