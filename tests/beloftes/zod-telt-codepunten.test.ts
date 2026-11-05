import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { version as zodVersie } from 'zod/package.json';

import { berichtSchema } from '../../src/modules/buddies/chat-schemas';
import { oordeelSchema } from '../../src/modules/completions/approval-schemas';
import { interviewSchema } from '../../src/modules/goals/interview-schemas';
import { doelSchema } from '../../src/modules/goals/schemas';
import { afrondSchema } from '../../src/modules/goals/weekly-schemas';
import { telTekens } from '../../src/shared/tekst';

/**
 * Zod telt tekstlengte in codepunten, net als `char_length` in Postgres — en
 * dat is een eigenschap van een dependency, geen eigenschap van deze code.
 *
 * ⚠️ **Waarom dit bestaat — QS8-673.** Onder zod 4.4.3 telden `.max()`,
 *    `.min()` en `.length()` UTF-16-eenheden; sinds 4.6 tellen ze codepunten
 *    (📏 gemeten op QS8-670 met een los script op beide versies). De hele suite
 *    bleef bij die sprong groen: elke grenstest toetste `telTekens()` — het
 *    onderdeel — en geen enkele de telling van Zod zelf. Zakt een volgende
 *    versie terug naar UTF-16, of springt hij naar grafemen, dan wordt er
 *    zonder dit bestand niets rood, terwijl vijf kale `.max()`-grenzen op
 *    gebruikerstekst dan een ander getal weigeren dan de CHECK ernaast.
 *
 * ⚠️ **Dit toetst de naad, niet het onderdeel.** De eerste helft legt Zod's
 *    telling vast naast `telTekens()` (dat codepunten telt zoals `char_length`
 *    — die kant staat onder test in `tests/rls/tekstgrenzen.test.ts`, want
 *    daar is een database voor nodig). De tweede helft neemt de vijf schema's
 *    die een kale `.max(n)` dragen en voert ze precies `n` emoji: dat is wat de
 *    CHECK in de database doorlaat, dus dat hoort het schema ook te doen.
 *
 * ⚠️ **De versie staat hier niet hard.** Een test die `4.6.7` eist, wordt rood
 *    bij elke upgrade en leert je hem bij te werken zonder te kijken. Wat hier
 *    vastligt is de telling; de versie komt alleen in de melding, zodat je
 *    weet onder welke zod hij omviel.
 *
 * IJKING (CLAUDE.md regel 18, vraag 3) — `node_modules/zod` tijdelijk
 * vervangen door zod 4.4.3 uit een scratchmap, zie het beslisdocument
 * `docs/decisions/2026-11-05-zod-telt-codepunten-en-dat-staat-nu-onder-test.md`.
 */

const EMOJI = '\u{1F600}'; // 😀 — één codepunt, twee UTF-16-eenheden
const GEZIN = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'; // 👨‍👩‍👧‍👦 — zeven codepunten, elf eenheden

const WAAROM =
  `zod ${zodVersie} telt hier geen codepunten meer. Postgres' char_length doet dat wél, ` +
  'dus elke kale .max()/.min() op gebruikerstekst weigert nu een ander getal dan de CHECK ' +
  'ernaast. Zie docs/decisions/2026-11-05-zod-telt-codepunten-en-dat-staat-nu-onder-test.md.';

describe('zod telt codepunten, zoals char_length', () => {
  it('de fixtures zijn wat ze beweren te zijn', () => {
    expect(EMOJI.length).toBe(2);
    expect(telTekens(EMOJI)).toBe(1);
    expect(GEZIN.length).toBe(11);
    expect(telTekens(GEZIN)).toBe(7);
  });

  it.each([
    ['.max(1) laat één emoji door', z.string().max(1), EMOJI, true],
    ['.max(1) weigert het gezin (zeven codepunten)', z.string().max(1), GEZIN, false],
    ['.max(7) laat het gezin door', z.string().max(7), GEZIN, true],
    ['.min(2) weigert één emoji', z.string().min(2), EMOJI, false],
    ['.min(7) laat het gezin door', z.string().min(7), GEZIN, true],
    ['.min(8) weigert het gezin', z.string().min(8), GEZIN, false],
    ['.length(1) laat één emoji door', z.string().length(1), EMOJI, true],
    ['.length(7) laat het gezin door', z.string().length(7), GEZIN, true],
  ])('%s', (_wat, schema, invoer, verwacht) => {
    expect(schema.safeParse(invoer).success, WAAROM).toBe(verwacht);
  });

  it('en komt daarmee op hetzelfde getal uit als telTekens()', () => {
    for (const tekst of [EMOJI, GEZIN, EMOJI.repeat(3) + 'abc', GEZIN + EMOJI]) {
      const n = telTekens(tekst);
      expect(z.string().length(n).safeParse(tekst).success, `${WAAROM} (${tekst})`).toBe(true);
    }
  });
});

/**
 * 📏 De getallen hieronder komen uit `pg_get_constraintdef` op productie
 *    (05-11-2026), per kolom; de tabel staat in het beslisdocument. Elk schema
 *    krijgt precies zoveel emoji als de CHECK toelaat, en één meer.
 */
describe('vijf kale .max()-grenzen staan gelijk met de CHECK, ook in emoji', () => {
  const grenzen = [
    {
      wat: 'chat_messages_body_len (4000)',
      n: 4000,
      toets: (tekst: string) => berichtSchema.safeParse({ body: tekst, heeftBijlage: false }),
    },
    {
      wat: 'completion_approvals_comment_length (1000)',
      n: 1000,
      toets: (tekst: string) => oordeelSchema.safeParse({ status: 'approved', comment: tekst }),
    },
    {
      wat: 'completions_note_length (2000)',
      n: 2000,
      toets: (tekst: string) => afrondSchema.safeParse({ achieved_level: 'floor', note: tekst }),
    },
    {
      wat: 'goals_identity_statement_len (200)',
      n: 200,
      toets: (tekst: string) => doelSchema.shape.identity_statement.safeParse(tekst),
    },
    {
      wat: 'goal_interviews.answers, per antwoord ANTWOORD_MAX (1000)',
      n: 1000,
      toets: (tekst: string) => interviewSchema.shape.measurable.safeParse(tekst),
    },
  ] as const;

  for (const { wat, n, toets } of grenzen) {
    it(`${wat}: ${n} emoji passen, ${n + 1} niet`, () => {
      expect(toets(EMOJI.repeat(n)).success, WAAROM).toBe(true);
      expect(toets(EMOJI.repeat(n + 1)).success, 'de grens is losgelaten').toBe(false);
    });
  }
});
