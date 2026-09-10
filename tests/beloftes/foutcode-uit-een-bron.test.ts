import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dubbeleFoutcodesIn } from './foutcontext';

const WORTEL = join(__dirname, '..', '..');

/**
 * De foutcode komt uit één bron — QS8-338.
 *
 * ⚠️ **De belofte is niet "er staat geen `code:` in een aanroep".** De belofte is:
 *    *de foutcode van een fout wordt niet twee keer verstuurd.* `reportError()`
 *    haalt élke fout door `beschrijfFout()`, en die zet de code al in de melding
 *    ("Servermelding weggelaten (42501)"). Wie hem dáárnaast in `context.code`
 *    stopt, heeft twee plekken die uit de pas kunnen lopen zodra iemand er één
 *    aanpast.
 *
 * ⚠️ **En de filterbaarheid is geen tegenargument, want die is gemeten.** 📏
 *    `maakVerzending()` zet `context` in Sentry's `extra` en `tags` draagt alleen
 *    `waar` en `runtime`. Sentry indexeert `tags` en niet `extra`, dus op
 *    `context.code` valt niet te groeperen. Wil je dat ooit wél, dan hoort de
 *    code in `tags`, één keer, afgeleid met `foutcodeVan()` — niet 76 keer met de
 *    hand. Zie `docs/decisions/2026-09-07-een-sleutel-die-nergens-aankwam.md`.
 *
 * ⚠️ **Waarom een grendel en niet alleen een opruiming.** Dezelfde duplicatie is
 *    twee keer gegroeid: 57 keer als `pgcode` en 76 keer als `code`. Beide keren
 *    één regel per keer, omdat de vorige regel het ook deed.
 *
 * IJKING — met de hand, 08-09-2026. Eén mutatie per grendel, beide richtingen;
 * de vormen los gevoerd staan hieronder in het tweede blok.
 *
 *   T  `code: error.code` terugzetten in `goals.list`   → 1 rood, met bestand en
 *      regelnummer
 *   U  de must-allow ernaast: 📏 de 15 handgeschreven `{ code: 'iets' }`-regels in
 *      `rollover` en `notificaties` blijven groen. Die staan in `meld()`-aanroepen
 *      die deze zeef wél leest, dus het is een echte must-allow en geen pad dat
 *      hij toch niet langskomt — ze dragen informatie die nergens anders staat
 *   V  `return { code: gelezen.code }` in `pending.ts` (een uitnodigingscode, geen
 *      foutrapportage) blijft groen — een zeef die díé meldt, is een `sed`
 */
function bestanden(map: string, exts: readonly string[]): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad, exts));
    else if (exts.some((e) => naam.endsWith(e))) uit.push(pad);
  }
  return uit;
}

describe('de foutcode gaat één keer de deur uit', () => {
  it('geen enkele reportError-aanroep stuurt de code van zijn eigen fout mee', () => {
    const gevonden: string[] = [];

    for (const map of ['src', 'app', join('supabase', 'functions')]) {
      for (const pad of bestanden(join(WORTEL, map), ['.ts', '.tsx'])) {
        if (pad.endsWith('.test.ts')) continue;
        for (const t of dubbeleFoutcodesIn(readFileSync(pad, 'utf8'))) {
          gevonden.push(`${relative(WORTEL, pad)}:${t}`);
        }
      }
    }

    expect(
      gevonden,
      'de code staat al in de melding die `beschrijfFout()` opbouwt; haal hem uit het derde argument',
    ).toEqual([]);
  });
});

describe('dubbeleFoutcodesIn — de vormen die hij moet raken', () => {
  it('vindt de kale vorm, met het regelnummer', () => {
    const bron = "const a = 1;\nreportError(error, 'goals.list', { code: error.code });";
    expect(dubbeleFoutcodesIn(bron)).toEqual(['2 — code: error.code']);
  });

  it('vindt hem naast een andere sleutel', () => {
    expect(
      dubbeleFoutcodesIn("reportError(error, 'x', { goal_id: id, code: error.code });"),
    ).toEqual(['1 — code: error.code']);
  });

  it('vindt de optionele vorm', () => {
    expect(dubbeleFoutcodesIn("reportError(error, 'x', { code: error?.code });")).toEqual([
      '1 — code: error?.code',
    ]);
  });

  /** ⚠️ Deze vorm stond er vijf keer en overleefde de eerste telling van QS8-338. */
  it('vindt hem met een terugval erachter', () => {
    expect(
      dubbeleFoutcodesIn("reportError(error, 'x', { code: error.code ?? 'onbekend' });"),
    ).toEqual(["1 — code: error.code ?? 'onbekend'"]);
  });

  /** ⚠️ Twee aanroepen ontbraken in de telling van het issue doordat een grep op
   *    `code: <naam>.code` een gepunt pad niet ziet. */
  it('vindt hem bij een gepunt eerste argument', () => {
    expect(
      dubbeleFoutcodesIn("reportError(mijn.error, 'x', { code: mijn.error.code });"),
    ).toEqual(['1 — code: mijn.error.code']);
  });

  /** ⚠️ De Edge Functions gebruiken `meld()`; zelfde vorm, zelfde belofte. */
  it('vindt hem ook in een meld-aanroep uit de Edge Functions', () => {
    expect(dubbeleFoutcodesIn("await meld(fout, 'rollover', { code: fout.code });")).toEqual([
      '1 — code: fout.code',
    ]);
  });

  it('vindt hem in een aanroep over meerdere regels', () => {
    const bron = "reportError(\n  error,\n  'x',\n  { goal_id: id, code: error.code },\n);";
    expect(dubbeleFoutcodesIn(bron)).toEqual(['4 — code: error.code']);
  });
});

describe('dubbeleFoutcodesIn — de vormen die hij met rust moet laten', () => {
  /**
   * ⚠️ **De belangrijkste helft.** Een `code` die de aanroeper zélf schrijft,
   *    draagt informatie die nergens anders staat. 📏 15 regels in `rollover`
   *    en `notificaties` doen dat; een zeef die die meldt, leer je uitzetten.
   */
  it('laat een handgeschreven code met rust', () => {
    expect(dubbeleFoutcodesIn("reportError(error, 'x', { code: 'profielen_mislukt' });")).toEqual(
      [],
    );
    expect(dubbeleFoutcodesIn("await meld(fout, 'rollover', { code: 'recap_rpc_fout' });")).toEqual(
      [],
    );
  });

  it('laat een code uit een ánder object met rust', () => {
    expect(dubbeleFoutcodesIn("reportError(error, 'x', { code: antwoord.code });")).toEqual([]);
  });

  /**
   * ⚠️ **Het geval dat een `sed` fout zou doen, en het staat echt in de bron.**
   *    `src/modules/buddies/pending.ts` geeft `{ code: gelezen.code }` terug — een
   *    uitnodigingscode, geen foutrapportage.
   */
  it('laat een code buiten een reportError-aanroep met rust', () => {
    expect(dubbeleFoutcodesIn('return { code: gelezen.code, automatisch: false };')).toEqual([]);
  });

  it('laat een aanroep zonder derde argument met rust', () => {
    expect(dubbeleFoutcodesIn("reportError(error, 'auth.signOut');")).toEqual([]);
  });

  it('laat een naam in commentaar met rust', () => {
    expect(dubbeleFoutcodesIn("// reportError(error, 'x', { code: error.code })")).toEqual([]);
    expect(dubbeleFoutcodesIn("/**\n * reportError(error, 'x', { code: error.code })\n */")).toEqual(
      [],
    );
  });

  it('laat een langere sleutelnaam met rust', () => {
    expect(dubbeleFoutcodesIn("reportError(error, 'x', { pgcode: error.code });")).toEqual([]);
  });
});
