import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

const WORTEL = join(__dirname, '..', '..');
const lees = (pad: string) => readFileSync(join(WORTEL, pad), 'utf8');

/** Commentaar eruit met de gedeelde knip; een JSX-commentaar laat dan een leeg `{ }` achter. */
const zonderJsxCommentaar = (bron: string) => zonderCommentaar(bron).replace(/\{\s*\}/g, ' ');

/**
 * De vaste ingang naar de vragenlijst staat op Profiel, direct onder Instellingen — QS8-817.
 *
 * ⚠️ **Besluit Quinten (23-11-2026, 17:06 UTC, variant B).** De kaart staat er **voor iedereen en
 *    altijd**: ook na "Niet nu" op Vandaag en ook na invullen (criterium 2). Een voorwaarde voor
 *    de kaart in het scherm (`cond ? <VragenlijstIngang …/> : null`, `cond && …`) breekt dat, en
 *    deze toets vraagt daarom dat de kaart als kaal element direct na `<InstellingenIngang />` staat.
 *
 * ⚠️ Dit is een brontoets, en dat is een grens: `app/(tabs)/profiel.tsx` laadt niet onder de
 *    rendermocks (zie de kop van `tests/render/scherm.ts`). Wat de kaart dóét, en dat de
 *    vragenlijst de parameter leest, toetst `tests/render/vragenlijst-ingang.test.ts` met de echte
 *    componenten.
 */
describe('de vaste ingang naar de vragenlijst op Profiel', () => {
  const profiel = zonderJsxCommentaar(lees('app/(tabs)/profiel.tsx'));

  it('staat direct onder Instellingen, zonder voorwaarde', () => {
    expect(profiel).toMatch(/<InstellingenIngang\s*\/>\s*<VragenlijstIngang\s+profiel=\{p\}\s*\/>/);
  });

  it('is het echte kaartcomponent uit de vragenlijst, en geen kopie in het scherm', () => {
    expect(profiel).toMatch(
      /import\s*\{\s*VragenlijstIngang\s*\}\s*from\s*'@\/schermen\/vragenlijst'/,
    );
    expect(profiel).not.toMatch(/function\s+VragenlijstIngang\b/);
  });
});
