import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * QS8-423 — de twee laaggrenzen in `eslint.config.js`, geijkt.
 *
 * ⚠️⚠️ **Deze tests bestaan omdat de eerste vorm van de nieuwe grendel stil
 *    dood was.** Hij stond er, las goed, en deed niets: het was een
 *    `no-restricted-syntax`-selector, en het tijdblok verderop in
 *    `eslint.config.js` zet diezelfde regelnaam, staat láter en dekt `src/**` —
 *    en flat config **vervangt** de opties van een regel in plaats van ze samen
 *    te voegen. 📏 `--print-config` gaf alleen de tijdselectors terug.
 *
 *    Dat is precies de klasse die CLAUDE.md *"een grendel die alleen in een
 *    comment staat"* noemt, en de klasse die geen enkele controle in dit project
 *    vandaag ziet: `npm run lint` wordt groen van een regel die er niet meer is.
 *    Er bestond geen test die `eslint.config.js` iets vóérde — 📏 `grep -rl
 *    "eslint.config" tests/` gaf niets.
 *
 * ⚠️ De tweede helft is even belangrijk als de eerste. Elke vorm die de grens
 *    met rust moet laten staat hier ook: een controle die álles meldt, leert je
 *    hem te negeren.
 *
 * ⚠️ **Waarom `lintText` en niet `--print-config`.** De aanwezigheid van een
 *    regel in de opgeloste config is niet de belofte; de belofte is dat een
 *    import rood wordt. `configBevat()` hieronder toetst de eerste als aparte
 *    grendel op de stille dood, maar de gevallen toetsen de tweede.
 */

const eslint = new ESLint({ cwd: process.cwd() });

/** De regel-id's die bij dit fragment afgaan, als dit bestand zo zou heten. */
async function meldingen(bestand: string, bron: string): Promise<readonly string[]> {
  const uitslag = await eslint.lintText(bron, { filePath: bestand, warnIgnored: false });
  return (uitslag[0]?.messages ?? [])
    .filter((m) => m.severity === 2)
    .map((m) => m.ruleId ?? '(geen regel)');
}

const GRENS_SHARED = 'import/no-restricted-paths';
const GRENS_PATROON = '@typescript-eslint/no-restricted-imports';

const IN_KIEZERS = 'src/shared/kiezers/proef.ts';
const IN_MODULES = 'src/modules/buddies/proef.ts';

describe('de gedeelde laag importeert de datalaag niet (QS8-423)', () => {
  // ⚠️ Vier vormen, en dat is geen volledigheid maar wat er met gereedschap te
  //    vangen is — zie de test over een variabele bron onderaan.
  it.each([
    ['relatief, statisch', "import { x } from '../../modules/goals/schemas';\nvoid x;\n"],
    ['via de @/-alias', "import { x } from '@/modules/goals/schemas';\nvoid x;\n"],
    ['relatief, dynamisch', "export const p = () => import('../../modules/goals/schemas');\n"],
    ['dynamisch via @/', "export const p = () => import('@/modules/goals/schemas');\n"],
    ['als type', "import type { X } from '../../modules/goals/schemas';\nexport type Y = X;\n"],
    ['doorgeëxporteerd', "export { x } from '../../modules/goals/schemas';\n"],
    ['alles doorgeëxporteerd', "export * from '../../modules/goals/schemas';\n"],
  ])('%s wordt rood', async (_naam, bron) => {
    expect(await meldingen(IN_KIEZERS, bron)).toContain(GRENS_SHARED);
  });

  // ⚠️ `lib/supabase` is de datalaag één deur verder: een shared-bestand dat de
  //    client rechtstreeks pakt, legt dezelfde knoop zonder ooit langs
  //    `modules/` te komen.
  it.each([
    ['statisch', "import { supabase } from '../../lib/supabase';\nvoid supabase;\n"],
    ['dynamisch', "export const p = () => import('../../lib/supabase');\n"],
  ])('lib/supabase %s wordt rood', async (_naam, bron) => {
    expect(await meldingen(IN_KIEZERS, bron)).toContain(GRENS_SHARED);
  });

  it.each([
    ['een expo-kiezer', "import * as P from 'expo-image-picker';\nvoid P;\n"],
    ['een andere shared-map', "import { t } from '../i18n';\nvoid t;\n"],
    ['lib/observability', "import { reportError } from '../../lib/observability';\nvoid reportError;\n"],
    ['lib/env', "import { env } from '../../lib/env';\nvoid env;\n"],
  ])('%s blijft groen', async (_naam, bron) => {
    expect(await meldingen(IN_KIEZERS, bron)).not.toContain(GRENS_SHARED);
  });

  // ⚠️ Dit is de grens van het gereedschap en geen fout: beide regels lezen de
  //    bronstring, en een variabele heeft er geen. Hij staat hier zodat §4a van
  //    het beslisdocument niet de enige plek is waar dat opgeschreven staat, en
  //    zodat het opvalt als een toekomstige ESLint het wél ziet.
  it('een import() met een variabele bron ontsnapt — bekende grens', async () => {
    const bron = "const p = '../../modules/goals/schemas';\nexport const f = () => import(p);\n";
    expect(await meldingen(IN_KIEZERS, bron)).not.toContain(GRENS_SHARED);
  });

  // ⚠️ Testbestanden staan in `ignores`, en dat is vandaag niet leeg: twee
  //    bestanden in `src/shared/ui` lenen `CATEGORIEEN` uit `modules/goals`. De
  //    grens is dus "shared kent de datalaag niet búíten tests", en dat hoort
  //    getoetst te zijn in plaats van alleen bedoeld.
  it('een testbestand valt er bewust buiten', async () => {
    const bron = "import { x } from '../../modules/goals/schemas';\nvoid x;\n";
    expect(await meldingen('src/shared/kiezers/proef.test.ts', bron)).not.toContain(GRENS_SHARED);
  });
});

describe('de datalaag importeert shared/ui niet (QS8-207)', () => {
  // ⚠️ De statische vormen vangt de patroonregel; de dynamische vangt sinds
  //    QS8-425 `import/no-restricted-paths`. Elke vorm hoort door mínstens één
  //    van de twee gezien te worden, en dat is wat hier getoetst wordt — niet
  //    welke van de twee het doet, want dat is een implementatiekeuze.
  it.each([
    ['relatief, statisch', "import { Knop } from '../../shared/ui';\nvoid Knop;\n"],
    ['via de @/-alias', "import { Knop } from '@/shared/ui';\nvoid Knop;\n"],
    ['als type', "import type { K } from '../../shared/ui';\nexport type L = K;\n"],
    ['relatief, dynamisch', "export const p = () => import('../../shared/ui');\n"],
    ['dynamisch via @/', "export const p = () => import('@/shared/ui');\n"],
    ['doorgeëxporteerd', "export { Knop } from '../../shared/ui';\n"],
    ['alles doorgeëxporteerd', "export * from '../../shared/ui';\n"],
  ])('%s wordt rood', async (_naam, bron) => {
    const m = await meldingen(IN_MODULES, bron);
    expect(m.some((r) => r === GRENS_PATROON || r === GRENS_SHARED)).toBe(true);
  });

  // ⚠️ De dynamische vorm was tot QS8-425 groen. Dit geval staat er apart bij,
  //    en niet alleen in de lijst hierboven, omdat het de reden van dat issue
  //    is: valt hij weg, dan is de reparatie weg.
  it('de dynamische vorm gaat langs de padregel en niet langs het patroon', async () => {
    const m = await meldingen(IN_MODULES, "export const p = () => import('../../shared/ui');\n");
    expect(m).toContain(GRENS_SHARED);
    expect(m).not.toContain(GRENS_PATROON);
  });

  it.each([
    ['shared/i18n', "import { t } from '../../shared/i18n';\nvoid t;\n"],
    ['shared/theme', "import { space } from '../../shared/theme';\nvoid space;\n"],
    ['shared/time', "import { userClock } from '../../shared/time';\nvoid userClock;\n"],
    ['shared/standen', "import type { S } from '../../shared/standen';\nexport type T = S;\n"],
    ['de eigen module', "import { keurChatfoto } from './chatfoto';\nvoid keurChatfoto;\n"],
  ])('%s blijft groen', async (_naam, bron) => {
    const m = await meldingen(IN_MODULES, bron);
    expect(m).not.toContain(GRENS_PATROON);
    expect(m).not.toContain(GRENS_SHARED);
  });

  it('een import() met een variabele bron ontsnapt ook hier — bekende grens', async () => {
    const bron = "const p = '../../shared/ui';\nexport const f = () => import(p);\n";
    const m = await meldingen(IN_MODULES, bron);
    expect(m).not.toContain(GRENS_PATROON);
    expect(m).not.toContain(GRENS_SHARED);
  });
});

describe('de grendels overleven de opgeloste config', () => {
  /**
   * ⚠️⚠️ **De stille dood is een andere fout dan een gemiste vorm**, en de
   *    gevallen hierboven vinden hem alleen bij toeval. Twee blokken die
   *    dezelfde regelnaam zetten en elkaar in `files` overlappen zijn niet
   *    allebei van kracht — de laatste wint volledig. Dit toetst dat de regel
   *    die de grens draagt er ná dat samenvoegen nog ís.
   */
  async function regelsVoor(bestand: string): Promise<Record<string, unknown>> {
    const config = (await eslint.calculateConfigForFile(bestand)) as {
      rules?: Record<string, unknown>;
    };
    return config.rules ?? {};
  }

  it.each([
    [IN_KIEZERS, GRENS_SHARED],
    ['src/shared/ui/proef.ts', GRENS_SHARED],
    ['src/shared/afbeelding/proef.ts', GRENS_SHARED],
    [IN_MODULES, GRENS_SHARED],
    [IN_MODULES, GRENS_PATROON],
  ])('%s draagt %s', async (bestand, regel) => {
    expect(Object.keys(await regelsVoor(bestand))).toContain(regel);
  });

  /**
   * ⚠️⚠️ **Sinds QS8-425 dragen alle drie de grenzen één regelnaam**, en
   *    daarmee bewijst "de regel staat er" niet meer dat jóúw richting er nog
   *    is. Een zone die uit de lijst valt, laat de regelnaam ongemoeid: hij
   *    blijft aanwezig, blijft rood worden voor de andere richtingen, en de
   *    controle hierboven blijft groen.
   *
   *    Dat is precies de vorm van de stille dood die QS8-423 een ronde kostte,
   *    één laag dieper. Vandaar de zones zelf.
   */
  /**
   * ⚠️⚠️ **Hetzelfde geldt voor de patroonregel, en dat is hier met een mutatie
   *    gevonden en niet bedacht.** 📏 Het `group`-patroon vervangen door een
   *    pad dat niet bestaat liet **alle 36 tests groen**: de regelnaam blijft
   *    staan, dus de controle hierboven merkt niets, en de gevallen zelf worden
   *    nog steeds rood — door de padregel, die sinds QS8-425 dezelfde grens
   *    dekt. Twee netten boven elkaar verbergen elkaars gaten.
   */
  it('het patroon van QS8-207 staat er, en niet alleen de regelnaam', async () => {
    const regel = (await regelsVoor(IN_MODULES))[GRENS_PATROON] as
      | [unknown, { patterns: readonly { group: readonly string[] }[] }]
      | undefined;
    expect((regel?.[1].patterns ?? []).flatMap((pat) => [...pat.group])).toEqual([
      '**/shared/ui',
      '**/shared/ui/*',
    ]);
  });

  it('en dat van QS8-423 ook', async () => {
    const regel = (await regelsVoor(IN_KIEZERS))[GRENS_PATROON] as
      | [unknown, { patterns: readonly { group: readonly string[] }[] }]
      | undefined;
    expect((regel?.[1].patterns ?? []).flatMap((pat) => [...pat.group])).toEqual(['**/modules/**']);
  });

  it('alle drie de zones staan er, en niet alleen de regelnaam', async () => {
    const regel = (await regelsVoor(IN_MODULES))[GRENS_SHARED] as
      | [unknown, { zones: readonly { target: string; from: string }[] }]
      | undefined;
    const zones = (regel?.[1].zones ?? []).map((z) => `${z.target} <- ${z.from}`);
    expect(zones).toEqual([
      './src/shared <- ./src/modules',
      './src/shared <- ./src/lib/supabase.ts',
      './src/modules <- ./src/shared/ui',
    ]);
  });

  // ⚠️ De tijdregel is het blok dat de eerste vorm van deze grendel opat. Hij
  //    hoort er nog te staan; wie de twee blokken samenvoegt, moet dit zien.
  it('het tijdblok is er nog, in beide richtingen', async () => {
    expect(Object.keys(await regelsVoor(IN_KIEZERS))).toContain('no-restricted-syntax');
    expect(Object.keys(await regelsVoor(IN_MODULES))).toContain('no-restricted-syntax');
  });
});
