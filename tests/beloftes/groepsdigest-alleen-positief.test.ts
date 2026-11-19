import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

/**
 * De groepsdagmelding houdt zijn vorm in de job — QS8-755.
 *
 * ⚠️ De databasekant (vlag, demping, plafond, geen tegenslag) staat in
 *    `tests/rls/groepsdigest.test.ts`. Dit bestand bewaakt de naad die daar niet
 *    zichtbaar is: dat de job de RPC aanroept en niets eromheen verzint.
 *
 * IJKING (met de hand): `metHeldenstem(` in de functie zetten → rood op
 * 'geen heldenstem'; `alVerstuurd(` erin zetten → rood op 'geen alVerstuurd';
 * de RPC vóór de opt-in-regel zetten → rood op 'voorpoort'.
 */
const job = readFileSync('supabase/functions/notificaties/index.ts', 'utf8');

function lichaam(naam: string): string {
  const start = job.indexOf(`async function ${naam}(`);
  expect(start, `${naam} bestaat`).toBeGreaterThan(-1);
  const eind = job.indexOf('\n}\n', start);
  return job.slice(start, eind);
}

describe('stuurGroepsdigest', () => {
  const f = zonderCommentaar(lichaam('stuurGroepsdigest'));

  it('kijkt eerst naar de opt-in en het uur, en pas dan naar de database', () => {
    const optIn = f.indexOf('notify_group_digest');
    const uur = f.indexOf('lokaalUur');
    const rpc = f.indexOf('groepenMetNieuws(');
    expect(optIn).toBeGreaterThan(-1);
    expect(optIn).toBeLessThan(rpc);
    expect(uur).toBeLessThan(rpc);
  });

  it('gebruikt geen heldenstem en niet alVerstuurd, en loopt via stuur()', () => {
    expect(f).not.toContain('metHeldenstem(');
    expect(f).not.toContain('alVerstuurd(');
    expect(f).toContain("soort: 'group_digest'");
    expect(f).toContain('stuur(db');
  });

  it('geeft de tekst alleen de groep: geen persoon, aantal of titel', () => {
    expect(f).toMatch(/berichtVoor\(\s*'group_digest',\s*\{ naam: rij\.groepsnaam, groepId: rij\.groupId \}/);
  });

  it('haalt zijn groepen uit de RPC en niet uit een groepstabel', () => {
    const g = lichaam('groepenMetNieuws');
    expect(g).toContain("rpc('groepsdigest_voor'");
    expect(g).not.toMatch(/\.from\('(chat_messages|group_members|groups)'\)/);
  });
});
