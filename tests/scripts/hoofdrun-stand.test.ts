import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `migratieregister.test.ts`.
import {
  beoordeel,
  commitsZonderUitslag,
  exitcode,
  melding,
} from '../../scripts/hoofdrun-stand.mjs';

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
 *
 * ⚠️⚠️ **Sinds 22-09-2026 ijkt dit bestand een tweede belofte — QS8-582.** De
 *    eerste is *"staat `main` nu groen"*; de tweede is *"heeft elke toestand van
 *    `main` een uitslag gekregen"*. Dat zijn niet dezelfde vraag, en het verschil
 *    is gemeten: op 21-09-2026 verloren drie commits hun uitslag in de
 *    concurrency-wachtrij en was de run erna groen. Dit script zei toen groen, en
 *    dat was waar over de nieuwste run en onvolledig over `main`.
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

/**
 * De tweede belofte: een commit op `main` zonder uitslag valt op.
 *
 * ⚠️ De vorm van de gegevens is die van de GitHub-API — nieuwste eerst, en een
 *    sha kan meer dan één run hebben.
 */
describe('commits op main zonder uitslag', () => {
  const run = (over: Record<string, unknown>) => ({ ...RUN, ...over });

  it('vindt de drie van 21-09-2026 — de meting waar dit uit voortkomt', () => {
    const verloren = commitsZonderUitslag([
      run({ head_sha: 'd'.repeat(40), conclusion: 'success' }),
      run({ head_sha: '28542c7cb8f92294c604d5a14cdca5bd854a5617', conclusion: 'cancelled' }),
      run({ head_sha: '339f65307689b43302a1d71beb6741dcdafbed2e', conclusion: 'cancelled' }),
      run({ head_sha: 'e6cc6e2ee0d4a09d1bec3bb54796a8e9527f539b', conclusion: 'cancelled' }),
    ]);
    expect(verloren.map((c: { sha: string }) => c.sha)).toEqual([
      'e6cc6e2',
      '339f653',
      '28542c7',
    ]);
  });

  it('en dan weigert de exitcode nul, ook al is de nieuwste run groen', () => {
    const verloren = commitsZonderUitslag([
      RUN,
      run({ head_sha: 'c'.repeat(40), conclusion: 'cancelled' }),
    ]);
    expect(exitcode('groen', verloren)).toBe(1);
    expect(melding({ ...beoordeel(RUN), verloren })).toContain('zonder uitslag');
  });

  // ⚠️ **Must-allows — en ze dragen hier meer gewicht dan gewoonlijk.** Dit
  //    script draait ná élke merge. Meldt het dan routineus iets, dan is het
  //    binnen een week de regel die je overslaat.
  it('laat een sha met rust die naast een afgebroken run een geslaagde heeft', () => {
    // ⚠️ Dit is de herstart: run-id hetzelfde, poging 2, en die is groen. De
    //    toestand ís dan gemeten, en dat is precies wat een herstart oplevert.
    const verloren = commitsZonderUitslag([
      run({ head_sha: 'c'.repeat(40), conclusion: 'success', run_attempt: 2 }),
      run({ head_sha: 'c'.repeat(40), conclusion: 'cancelled', run_attempt: 1 }),
    ]);
    expect(verloren).toEqual([]);
  });

  it('laat een sha met rust waarvan nog een run draait — die kan nog iets worden', () => {
    const verloren = commitsZonderUitslag([
      run({ head_sha: 'c'.repeat(40), status: 'in_progress', conclusion: null }),
      run({ head_sha: 'c'.repeat(40), conclusion: 'cancelled' }),
    ]);
    expect(verloren).toEqual([]);
  });

  it('laat een rode commit met rust — rood is een uitslag', () => {
    expect(commitsZonderUitslag([run({ conclusion: 'failure' })])).toEqual([]);
    expect(commitsZonderUitslag([run({ conclusion: 'timed_out' })])).toEqual([]);
  });

  it('laat een leeg of ontbrekend venster met rust', () => {
    expect(commitsZonderUitslag([])).toEqual([]);
    expect(commitsZonderUitslag(undefined)).toEqual([]);
  });

  it('zwijgt in de melding zolang er niets verloren is', () => {
    expect(melding({ ...beoordeel(RUN), verloren: [] })).not.toContain('zonder uitslag');
  });
});
