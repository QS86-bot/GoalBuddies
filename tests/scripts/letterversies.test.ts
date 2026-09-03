import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `migratieregister-plan.test.ts`.
import {
  cliMigratiescripts,
  cliTegenspraak,
  letterversies,
} from '../../scripts/letterversies.mjs';

/**
 * IJking van de CLI-tegenspraak — QS8-251.
 *
 * ⚠️ **De belofte staat sinds juli in proza en stond nergens in code.**
 *    `docs/decisions/004-migratieregister.md`: *"Dit project gebruikt de CLI niet
 *    voor het toepassen van migraties."* Reden: drie deelmigraties dragen een
 *    letter (`0039a`, `0041a`, `0052a`), en sommige CLI-versies lezen een
 *    bestandsnaam met `^([0-9]+)_` en slaan die **stilzwijgend** over.
 *
 *    En tóch stond er in `package.json` een `db:push` die `supabase db push`
 *    aanriep, en noemde `docs/DEPLOY.md` §2.2b dat hét pad. Eén vraag, twee
 *    documenten, twee antwoorden — dezelfde vorm als QS8-125.
 *
 * ⚠️ **Regel 18 vraag 4.** Elk onderdeel klopte: het beslisdocument was goed
 *    onderbouwd, `register:controle --streng` werkt, en de CLI doet precies wat
 *    zijn eigen regex zegt. Wat ontbrak was de verbinding. Er was geen test die
 *    groen bleef terwijl de belofte brak — er was geen test die de belofte kón
 *    raken.
 *
 * ⚠️ **Waarom het gat luid was en toch duur.** `register:controle --streng` stond
 *    áchter `supabase db push` in dezelfde keten, dus een half toegepaste set
 *    viel op. Alleen sta je dan wél met die halve set op **productie**, op een
 *    gratis tier zonder automatische backups, met een commando dat het handboek
 *    je net had aangeraden. Dat is de verkeerde plek om het te merken.
 *
 * IJKING — met de hand gedraaid op 01-09-2026:
 *
 *   A  `db:push` terugzetten in `package.json`  → `migraties:controle` rood, met
 *      de scriptnaam, het aantal en de drie letterversies in de melding
 *   B  de letterversie-toets eruit              → 1 rood hier
 *   C  de scripttoets eruit                     → 2 rood hier
 *   D  élke `supabase`-aanroep meetellen        → 4 rood hier (vals alarm)
 */

describe('letterversies', () => {
  it('vindt een deelmigratie met een letter', () => {
    expect(letterversies(['0039_weekpassen.sql', '0039a_weekpas_maximum.sql'])).toEqual([
      '0039a_weekpas_maximum.sql',
    ]);
  });

  /** ⚠️ De must-allow-helft: een gewone migratie is geen deelmigratie. */
  it.each([
    ['een gewone migratie', '0140_een_doel_krijgt_een_ritme.sql'],
    ['een naam zonder nummer', 'README.md'],
    ['drie cijfers', '039a_iets.sql'],
    ['een hoofdletter', '0039A_iets.sql'],
  ])('telt %s niet mee', (_naam, bestand) => {
    expect(letterversies([bestand])).toEqual([]);
  });

  it.each([
    ['leeg', []],
    ['undefined', undefined],
  ])('valt niet om bij %s', (_naam, lijst) => {
    expect(letterversies(lijst)).toEqual([]);
  });
});

describe('cliMigratiescripts', () => {
  it('vindt een script dat db push aanroept', () => {
    const uit = cliMigratiescripts({ 'db:push': 'npm run db:dump && supabase db push' });
    expect(uit.map((s: { naam: string }) => s.naam)).toEqual(['db:push']);
  });

  it('vindt ook migration repair', () => {
    expect(cliMigratiescripts({ herstel: 'supabase migration repair --status applied' })).toHaveLength(
      1,
    );
  });

  /**
   * ⚠️ **De helft die telt, en hier is hij niet theoretisch.**
   *    `supabase functions deploy` is juist het nórmale pad in dit project — dat
   *    meemelden maakt de controle onbruikbaar, en een controle die te veel
   *    meldt leer je uitzetten.
   */
  it.each([
    ['functions deploy', 'npx supabase functions deploy rollover'],
    ['secrets set', 'npx supabase secrets set VAPID_PRIVATE_KEY=x'],
    ['gen types', 'supabase gen types typescript'],
    ['een script zonder supabase', 'node scripts/db-dump.mjs'],
  ])('laat %s met rust', (_naam, commando) => {
    expect(cliMigratiescripts({ iets: commando })).toEqual([]);
  });

  it.each([
    ['leeg', {}],
    ['undefined', undefined],
  ])('valt niet om bij %s', (_naam, scripts) => {
    expect(cliMigratiescripts(scripts)).toEqual([]);
  });
});

describe('cliTegenspraak', () => {
  const scripts = { 'db:push': 'npm run db:dump && supabase db push' };
  const metLetters = ['0039_a.sql', '0039a_b.sql'];

  it('meldt het script als er letterversies staan', () => {
    const uit = cliTegenspraak({ scripts, bestandsnamen: metLetters });

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('db:push');
    expect(uit[0]).toContain('0039a');
  });

  /**
   * ⚠️ **Beide voorwaarden, en dat is geen slap aftreksel.** Zonder letterversies
   *    is `supabase db push` gewoon een geldig pad; dit dan melden is een verbod
   *    op iets dat werkt. De tegenspraak ontstaat pas als de map iets bevat dat
   *    de CLI niet kan lezen.
   */
  it('zwijgt als er geen letterversies zijn', () => {
    expect(cliTegenspraak({ scripts, bestandsnamen: ['0001_a.sql', '0002_b.sql'] })).toEqual([]);
  });

  it('zwijgt als geen enkel script de CLI laat pushen', () => {
    expect(
      cliTegenspraak({ scripts: { deploy: 'npx supabase functions deploy x' }, bestandsnamen: metLetters }),
    ).toEqual([]);
  });

  it('meldt twee scripts allebei', () => {
    const uit = cliTegenspraak({
      scripts: { a: 'supabase db push', b: 'supabase migration repair' },
      bestandsnamen: metLetters,
    });
    expect(uit).toHaveLength(2);
  });
});

/**
 * ⚠️ **De ijking tegen de werkelijkheid, en de reden dat dit issue bestaat.**
 *    Verzonnen voorbeelden zijn groen op alles wat je bedacht hebt. Deze legt de
 *    échte `package.json` naast de échte migratiemap — precies de twee dingen
 *    die maanden uit elkaar liepen zonder dat iets het zag.
 */
describe('het echte project', () => {
  const WORTEL = join(__dirname, '..', '..');
  const bestanden = readdirSync(join(WORTEL, 'supabase', 'migrations')).filter((n) =>
    n.endsWith('.sql'),
  );
  const pkg = JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };

  /**
   * ⚠️ **Zonder deze regel bewaakt de rest hier niets.** Verdwijnen de
   *    letterversies ooit, dan is de tegenspraak weg en is groen terecht — maar
   *    dan hoort deze test te veranderen en niet stilletjes te blijven staan.
   */
  it('heeft nog steeds de drie deelmigraties waar dit over gaat', () => {
    expect(letterversies(bestanden).map((n: string) => n.slice(0, 5))).toEqual([
      '0039a',
      '0041a',
      '0052a',
    ]);
  });

  it('laat geen enkel npm-script de CLI migraties toepassen', () => {
    expect(
      cliTegenspraak({ scripts: pkg.scripts, bestandsnamen: bestanden }),
      'zie docs/DEPLOY.md §2.2b — de psql-route is het pad dat werkt',
    ).toEqual([]);
  });
});
