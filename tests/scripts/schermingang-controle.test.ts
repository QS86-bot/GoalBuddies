import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als
//    `migratieregister.test.ts`. TypeScript leest de JSDoc ernaast.
import {
  routesIn,
  schermenZonderIngang,
  verouderdInRegister,
  verwijstNaar,
  zonderCommentaar,
} from '../../scripts/schermingang-controle.mjs';

/**
 * QS8-383 — de ijking van de controle die schermen zonder ingang vindt.
 *
 * ⚠️ **Waarom die controle bestaat.** `app/doel/plan.tsx` — de kern van epic
 *    QS8-200, een doel uit één zin — stond twee weken af en gemerged in de
 *    codebase zonder dat er ook maar één knop naartoe wees. Elk schakeltje was
 *    klaar en de keten was los. Onwrikbare regel 18, vraag 5: *kan een gebruiker
 *    hier daadwerkelijk bij, en langs welke knop?*
 *
 * ⚠️ **En daarom deze test.** Een controle die nog nooit rood is geweest, is een
 *    aanname. Beide helften staan hier: de vormen die hij móét vinden, en de
 *    vormen die hij met rust moet laten — want een controle die alles meldt,
 *    leer je uitzetten.
 */

let tuin: string | undefined;

/**
 * Bouwt een `app/`- en `src/`-boom op schijf en geeft de argumenten terug
 * waarmee de controle erop kijkt.
 *
 * ⚠️ Op schijf en niet met een zelfgevoerd object: de controle leest zelf de map
 *    en leidt de routes af uit de bestandsnamen. Voer je hem een lijst paden,
 *    dan toets je je eigen aanname over die afleiding mee.
 */
function boom(bestanden: Readonly<Record<string, string>>): {
  wortel: string;
  bronmappen: string[];
} {
  tuin = mkdtempSync(join(tmpdir(), 'schermingang-'));
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    const heel = join(tuin, pad);
    mkdirSync(dirname(heel), { recursive: true });
    writeFileSync(heel, inhoud, 'utf8');
  }
  mkdirSync(join(tuin, 'app'), { recursive: true });
  mkdirSync(join(tuin, 'src'), { recursive: true });
  return { wortel: join(tuin, 'app'), bronmappen: [join(tuin, 'app'), join(tuin, 'src')] };
}

/**
 * De schermen zonder ingang in zo'n boom.
 *
 * ⚠️ Het tabblad dat in de meeste gevallen de ingang lévert, staat zelf in het
 *    register — precies zoals in de echte boom. Zonder dat meldt elk geval hier
 *    ook `/(tabs)/doelen`, en gaat de test over de ruis in plaats van over het
 *    scherm dat hij toetst.
 */
function zonderIngang(
  bestanden: Readonly<Record<string, string>>,
  register: Readonly<Record<string, string>> = { '/(tabs)/doelen': 'de tabbalk is de ingang' },
): readonly string[] {
  return schermenZonderIngang({ ...boom(bestanden), register }) as string[];
}

afterEach(() => {
  if (tuin) rmSync(tuin, { recursive: true, force: true });
  tuin = undefined;
});

describe('wat de controle moet vinden', () => {
  it('een scherm waar niets naar verwijst', () => {
    expect(
      zonderIngang({
        'app/(tabs)/doelen.tsx': 'export default function Doelen() { return null; }',
        'app/doel/plan.tsx': 'export default function Plan() { return null; }',
      }),
    ).toEqual(['/doel/plan']);
  });

  it('het geval van QS8-383 zelf: de ingang wijst naar het buurscherm', () => {
    // ⚠️ De regressie letterlijk nagebouwd. `/doel/nieuw` is bereikbaar,
    //    `/doel/plan` niet — en de twee liggen naast elkaar in dezelfde map. Een
    //    controle die alleen op de mapnaam kijkt, ziet hier niets.
    expect(
      zonderIngang({
        'app/(tabs)/doelen.tsx': "router.push('/doel/nieuw');",
        'app/doel/nieuw.tsx': 'export default function Nieuw() { return null; }',
        'app/doel/plan.tsx': 'export default function Plan() { return null; }',
      }),
    ).toEqual(['/doel/plan']);
  });

  it('een scherm dat alleen in commentaar genoemd wordt', () => {
    // ⚠️⚠️ **De fout waar dit script zelf in liep.** Bij het ijken op de echte
    //    boom zijn beide knoppen naar `/doel/plan` teruggezet naar
    //    `/doel/nieuw` — de belofte dus gebroken — en 📏 bleef de controle
    //    groen: de toelichting bóven de knop noemt de route met zoveel woorden,
    //    en die zin telde als ingang. Een controle die op zijn eigen commentaar
    //    leunt, bewaakt niets.
    expect(
      zonderIngang({
        'app/(tabs)/doelen.tsx': [
          '// ⚠️ Naar /doel/plan en niet naar /doel/nieuw.',
          "router.push('/doel/nieuw');",
          '{/* zie /doel/plan */}',
        ].join('\n'),
        'app/doel/nieuw.tsx': 'export default function Nieuw() { return null; }',
        'app/doel/plan.tsx': 'export default function Plan() { return null; }',
      }),
    ).toEqual(['/doel/plan']);
  });

  it('een scherm waar alleen een testbestand naar verwijst', () => {
    // ⚠️ 📏 Zonder die uitsluiting leek `/(tabs)/profiel` bereikbaar via
    //    `taalkeuze.test.ts`. Een test maakt geen knop.
    expect(
      zonderIngang(
        {
          'app/(tabs)/profiel.tsx': 'export default function Profiel() { return null; }',
          'src/schermen/taalkeuze.test.ts': "render('/(tabs)/profiel');",
        },
        {},
      ),
    ).toEqual(['/(tabs)/profiel']);
  });

  it('een scherm dat alleen naar zichzelf verwijst', () => {
    expect(
      zonderIngang(
        {
          'app/doel/plan.tsx': "function opnieuw() { router.replace('/doel/plan'); }",
        },
        {},
      ),
    ).toEqual(['/doel/plan']);
  });

  it('een dynamische route waarvan alleen een zusje bereikbaar is', () => {
    // ⚠️ **De vorm die een naïeve controle doorlaat.** Zoek je op het stuk vóór
    //    de haak, dan telt `/doel/nieuw` als ingang voor `/doel/[id]` en bewaakt
    //    de controle niets meer voor elke route met een buurman.
    expect(
      zonderIngang({
        'app/(tabs)/doelen.tsx': "router.push('/doel/nieuw');",
        'app/doel/nieuw.tsx': 'export default function Nieuw() { return null; }',
        'app/doel/[id].tsx': 'export default function Doel() { return null; }',
      }),
    ).toEqual(['/doel/[id]']);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een scherm met een gewone push ernaartoe', () => {
    expect(
      zonderIngang({
        'app/(tabs)/doelen.tsx': "router.push('/doel/plan');",
        'app/doel/plan.tsx': 'export default function Plan() { return null; }',
      }),
    ).toEqual([]);
  });

  it('een dynamische route die met een interpolatie wordt opgebouwd', () => {
    expect(
      zonderIngang({
        'app/(tabs)/doelen.tsx': 'router.push(`/doel/${goal.id}`);',
        'app/doel/[id].tsx': 'export default function Doel() { return null; }',
      }),
    ).toEqual([]);
  });

  it('een verwijzing die uit `src/` komt in plaats van uit `app/`', () => {
    expect(
      zonderIngang(
        {
          'app/doel/plan.tsx': 'export default function Plan() { return null; }',
          'src/shared/ui/LegeStaat.tsx': "router.push('/doel/plan');",
        },
        {},
      ),
    ).toEqual([]);
  });

  it('een layout en een `+html` zijn geen schermen', () => {
    expect(
      zonderIngang(
        {
          'app/_layout.tsx': 'export default function Layout() { return null; }',
          'app/+html.tsx': 'export default function Html() { return null; }',
          'app/(tabs)/_layout.tsx': 'export default function TabLayout() { return null; }',
        },
        {},
      ),
    ).toEqual([]);
  });

  it('een route die met reden in het register staat', () => {
    const gebouwd = boom({
      'app/(tabs)/index.tsx': 'export default function Start() { return null; }',
    });
    expect(
      schermenZonderIngang({ ...gebouwd, register: { '/(tabs)': 'de tabbalk is de ingang' } }),
    ).toEqual([]);
  });
});

describe('de routes die Expo Router afleidt', () => {
  it('laat `index` uit het pad vallen', () => {
    const gebouwd = boom({
      'app/(tabs)/index.tsx': 'export default function Start() { return null; }',
      'app/doel/[id].tsx': 'export default function Doel() { return null; }',
    });
    expect((routesIn(gebouwd.wortel) as { pad: string }[]).map((r) => r.pad)).toEqual([
      '/(tabs)',
      '/doel/[id]',
    ]);
  });
});

describe('het register loopt niet stil achter', () => {
  it('meldt een regel die geen bestaande route meer dekt', () => {
    // ⚠️ 📏 Dit was de eerste uitslag van dit script op de echte boom: een regel
    //    op `/(tabs)/index` terwijl de route `/(tabs)` heet.
    const gebouwd = boom({
      'app/(tabs)/index.tsx': 'export default function Start() { return null; }',
    });
    expect(
      verouderdInRegister({
        wortel: gebouwd.wortel,
        register: { '/(tabs)': 'ok', '/(tabs)/index': 'dekt niets' },
      }),
    ).toEqual(['/(tabs)/index']);
  });

  it('laat een regel die wél een route dekt met rust', () => {
    const gebouwd = boom({
      'app/(tabs)/index.tsx': 'export default function Start() { return null; }',
    });
    expect(verouderdInRegister({ wortel: gebouwd.wortel, register: { '/(tabs)': 'ok' } })).toEqual(
      [],
    );
  });
});

describe('zonderCommentaar', () => {
  it('haalt een regelcommentaar weg', () => {
    expect(zonderCommentaar('const a = 1; // naar /doel/plan')).toBe('const a = 1; ');
  });

  it('haalt een blok- en een JSX-commentaar weg', () => {
    expect(zonderCommentaar('a /* naar /doel/plan */ b')).toBe('a   b');
    expect(zonderCommentaar('{/* naar /doel/plan */}')).toBe('{ }');
  });

  it('laat de dubbele schuine streep van een url met rust', () => {
    // ⚠️ Anders sneuvelt de halve regel bij `https://` en meldt de controle een
    //    scherm dat gewoon een knop heeft.
    expect(zonderCommentaar("fetch('https://x.test/a'); router.push('/doel/plan');")).toBe(
      "fetch('https://x.test/a'); router.push('/doel/plan');",
    );
  });

  it('laat gewone code met rust', () => {
    expect(zonderCommentaar("router.push('/doel/plan');")).toBe("router.push('/doel/plan');");
  });
});

describe('verwijstNaar', () => {
  it('telt een langer pad niet mee als verwijzing naar het kortere', () => {
    expect(verwijstNaar("router.push('/doel/nieuw');", '/doel')).toBe(false);
  });

  it('telt een pad met een streepje erachter niet mee', () => {
    expect(verwijstNaar("router.push('/doel-archief');", '/doel')).toBe(false);
  });
});

describe('de echte boom', () => {
  it('heeft geen enkel scherm zonder ingang', () => {
    expect(schermenZonderIngang()).toEqual([]);
  });

  it('bereikt `/doel/plan` — de belofte waar dit issue over gaat', () => {
    // ⚠️ Dit staat los van de test hierboven omdat het de belofte is en niet de
    //    optelsom. Verdwijnt de knop weer, dan is dít de test die zegt waaróm
    //    het erg is.
    expect(schermenZonderIngang() as string[]).not.toContain('/doel/plan');
  });

  it('heeft geen verouderde registerregels', () => {
    expect(verouderdInRegister()).toEqual([]);
  });
});
