import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `migratieregister.test.ts`.
import { beoordeel, exitcode, melding } from '../../scripts/hoofdrun-stand.mjs';

/**
 * De ijking van `npm run hoofdrun:stand` — QS8-390.
 *
 * ⚠️⚠️ **De belofte is niet "hij zegt groen als het groen is".** Dat is de helft
 *    die vanzelf klopt. De belofte is dat hij **nooit groen zegt zonder bewijs**:
 *    een run die nog draait, een afgebroken run, een onbereikbare API en een
 *    onbekende conclusie moeten alle vier iets anders opleveren dan groen, en
 *    alle vier een exitcode die niet nul is.
 *
 *    Dat is dezelfde doctrine als het OVERGESLAGEN-onderscheid in de poort, en
 *    om dezelfde reden: wie een niet-meting als geslaagd telt, meldt "alles
 *    groen" over een toestand die niemand heeft aangeraakt.
 *
 * ⚠️ **De tweede helft telt hier extra.** Een script dat áltijd rood zegt, is
 *    net zo waardeloos als een dat altijd groen zegt — het eerste leer je
 *    negeren en dan is de volgende rode `main` weer twintig minuten van
 *    niemand. Daarom staat de geslaagde vorm hier ook.
 */

type Uitslag = { stand: string; sha?: string; titel?: string; reden?: string; url?: string };

/** ⚠️ De JSDoc van het script typeert `run` smal; de test voedt hem bewust ook
 *    vormen die daarbuiten vallen — dat is precies de helft die hij moet vangen. */
type Ruwe = Parameters<typeof beoordeel>[0];

const oordeel = (run: Ruwe): Uitslag => beoordeel(run) as Uitslag;

const RUN = {
  status: 'completed',
  conclusion: 'success',
  head_sha: '9ea80352f09f9bcdb76f6cdd51aa14f3e86f8ed2',
  display_title: 'Merge pull request #339',
  html_url: 'https://github.com/QS86-bot/GoalBuddies/actions/runs/1',
  run_started_at: '2026-09-09T12:35:35Z',
};

describe('wat groen mag heten', () => {
  it('een afgeronde, geslaagde run', () => {
    expect(oordeel(RUN).stand).toBe('groen');
    expect(exitcode('groen')).toBe(0);
  });

  it('en dan staat de commit erbij, want "groen" alleen zegt niet wélke', () => {
    const uit = oordeel(RUN);
    expect(uit.sha).toBe('9ea8035');
    expect(melding(uit)).toContain('9ea8035');
  });
});

describe('wat nooit groen mag heten', () => {
  it('een run die nog draait', () => {
    // ⚠️ Dit is de gevaarlijkste van de vier: vlak ná het mergen is dít de stand
    //    die je krijgt, en hem als groen tellen betekent dat je precies op het
    //    moment van het risico wegloopt.
    const uit = oordeel({ ...RUN, status: 'in_progress', conclusion: null });
    expect(uit.stand).toBe('draait');
    expect(exitcode(uit.stand)).toBe(1);
    expect(melding(uit)).toContain('nog een keer');
  });

  it('een gefaalde run', () => {
    const uit = oordeel({ ...RUN, conclusion: 'failure' });
    expect(uit.stand).toBe('rood');
    expect(exitcode(uit.stand)).toBe(1);
  });

  it('een run die op zijn tijdslimiet stukliep', () => {
    expect(oordeel({ ...RUN, conclusion: 'timed_out' }).stand).toBe('rood');
  });

  it('een afgebroken run — geen uitslag en dus geen groen', () => {
    // ⚠️ Precies het geval van QS8-318: op `main` is elke commit een toestand
    //    die uitgerold wordt, en een afgebroken run laat die zonder uitslag
    //    achter. Niet groen, niet rood, er niet.
    const uit = oordeel({ ...RUN, conclusion: 'cancelled' });
    expect(uit.stand).toBe('ongemeten');
    expect(exitcode(uit.stand)).toBe(1);
  });

  it('een conclusie die we niet kennen', () => {
    expect(oordeel({ ...RUN, conclusion: 'action_required' }).stand).toBe('ongemeten');
    expect(oordeel({ ...RUN, conclusion: 'stale' }).stand).toBe('ongemeten');
    expect(oordeel({ ...RUN, conclusion: 'skipped' }).stand).toBe('ongemeten');
  });

  it('helemaal geen run', () => {
    expect(oordeel(null).stand).toBe('ongemeten');
    expect(oordeel(undefined).stand).toBe('ongemeten');
  });

  it('geen enkele stand behalve groen geeft exitcode nul', () => {
    for (const stand of ['rood', 'draait', 'ongemeten', 'iets onbekends']) {
      expect(exitcode(stand), stand).toBe(1);
    }
  });
});

describe('de melding zegt wat je moet doen', () => {
  it('bij rood dat het werk nu is, en van wie', () => {
    const tekst = melding(oordeel({ ...RUN, conclusion: 'failure' }));
    expect(tekst).toContain('ROOD');
    expect(tekst).toContain('wie als laatste merde');
  });

  it('bij ongemeten de reden, en niet alleen dat het niet lukte', () => {
    // ⚠️ "Het lukte niet" stuurt de lezer naar de verkeerde oorzaak — dat is de
    //    les van QS8-268, waar zes scripts jarenlang "start de lokale stack"
    //    zeiden terwijl die draaide.
    expect(melding({ stand: 'ongemeten', reden: 'GitHub gaf 403' })).toContain('403');
  });
});
