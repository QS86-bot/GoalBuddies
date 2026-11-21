import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * De afspraak "een lokale sessie krijgt een eigen worktree" staat waar een nieuwe sessie hem leest — QS8-717 AC5.
 *
 * ⚠️ **De belofte is dat een sessie de afspraak leest vóór ze een tak aanmaakt.** `npm run claim` doet het werk
 *    (`tests/scripts/claim.test.ts` bewaakt dat), maar een sessie die de startprompt of een commando leest en
 *    nergens `git worktree` of `PROMPT-SESSIE §1` ziet, weet niet waarom haar claim een map naast de repo maakt, en
 *    zet misschien zelf een tak om in de gedeelde werkmap: het incident van 18-11-2026. De afspraak (§1) en de
 *    claim kunnen kloppen terwijl de plek waar een sessie begint hem niet noemt.
 *
 * ⚠️ **De bestanden worden gelezen, niet aangeraakt.** `docs/VOLGENDE-SESSIE.md` is van de batchsessie (§12); deze
 *    test legt alleen vast dat de verwijzing erin staat en wordt rood als ze verdwijnt.
 *
 * IJKING — met de hand, 20-11-2026 (de functie krijgt de tekst zonder de verwijzing, de bestanden blijven
 * onaangeroerd): de tekst zonder `worktree` -> rood; de tekst met `worktree` maar zonder wijzing naar §1 of
 * het pad -> rood; een hoofdletter-variant telt.
 */
const BESTANDEN = [
  'docs/VOLGENDE-SESSIE.md',
  '.claude/commands/verder.md',
  '.claude/commands/orkestrator.md',
  '.claude/commands/batch.md',
] as const;

/** Noemt de tekst de afspraak én waar hij staat? Eén van de twee is te weinig. */
export function draagtWorktreeAfspraak(tekst: string): boolean {
  const noemtHem = /git worktree|eigen worktree|worktree in/i.test(tekst);
  const wijstNaarHem = /PROMPT-SESSIE(?:\.md)?`?\s*§\s*1\b|<repo>-werk\//.test(tekst);
  return noemtHem && wijstNaarHem;
}

const lees = (pad: string) => readFileSync(join(__dirname, '../..', pad), 'utf8');

describe('Worktreeafspraak: elke plek waar een sessie begint verwijst ernaar', () => {
  it.each(BESTANDEN)('%s noemt de afspraak en wijst naar PROMPT-SESSIE §1', (pad) => {
    expect(draagtWorktreeAfspraak(lees(pad)), pad).toBe(true);
  });

  it('PROMPT-SESSIE §1 en CLAUDE.md dragen hem zelf', () => {
    expect(lees('docs/PROMPT-SESSIE.md')).toMatch(/eigen `git worktree`/);
    expect(lees('CLAUDE.md')).toMatch(/eigen `git worktree`/);
  });

  it('de functie vindt hem alleen als beide helften er staan (ijking)', () => {
    const goed = 'Lokaal maakt `npm run claim` een eigen `git worktree` aan; zie `docs/PROMPT-SESSIE.md` §1.';
    expect(draagtWorktreeAfspraak(goed)).toBe(true);
    // Zonder het woord: de afspraak is verdwenen.
    expect(draagtWorktreeAfspraak(goed.replace(/worktree/g, 'map'))).toBe(false);
    // Zonder de verwijzing: een sessie weet niet waar hij uitgelegd staat.
    expect(draagtWorktreeAfspraak('Lokaal maakt de claim een eigen `git worktree` aan.')).toBe(false);
    expect(draagtWorktreeAfspraak('')).toBe(false);
  });
});
