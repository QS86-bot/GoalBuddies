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
  it('statisch wordt rood', async () => {
    const bron = "import { Knop } from '../../shared/ui';\nvoid Knop;\n";
    expect(await meldingen(IN_MODULES, bron)).toContain(GRENS_PATROON);
  });

  it('ook als type', async () => {
    const bron = "import type { K } from '../../shared/ui';\nexport type L = K;\n";
    expect(await meldingen(IN_MODULES, bron)).toContain(GRENS_PATROON);
  });

  it('shared/i18n blijft groen', async () => {
    const bron = "import { t } from '../../shared/i18n';\nvoid t;\n";
    expect(await meldingen(IN_MODULES, bron)).not.toContain(GRENS_PATROON);
  });

  // ⚠️ **Deze richting heeft het dynamische gat nog**, en dat is gemeten en niet
  //    aangenomen. Hij staat hier als vastgelegde stand, niet als goedkeuring:
  //    valt deze test om omdat er iemand `import/no-restricted-paths` de andere
  //    kant op heeft gezet, dan is dat goed nieuws en mag de test weg.
  it('dynamisch ontsnapt nog — eigen vervolgissue', async () => {
    const bron = "export const p = () => import('../../shared/ui');\n";
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
    [IN_MODULES, GRENS_PATROON],
  ])('%s draagt %s', async (bestand, regel) => {
    expect(Object.keys(await regelsVoor(bestand))).toContain(regel);
  });

  // ⚠️ De tijdregel is het blok dat de eerste vorm van deze grendel opat. Hij
  //    hoort er nog te staan; wie de twee blokken samenvoegt, moet dit zien.
  it('het tijdblok is er nog, in beide richtingen', async () => {
    expect(Object.keys(await regelsVoor(IN_KIEZERS))).toContain('no-restricted-syntax');
    expect(Object.keys(await regelsVoor(IN_MODULES))).toContain('no-restricted-syntax');
  });
});
