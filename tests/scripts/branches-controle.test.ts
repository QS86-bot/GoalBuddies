import { describe, expect, it, vi } from 'vitest';

import {
  AANVAARD,
  MAX_LEEFTIJD_UUR,
  beoordeel,
  hoofd,
  prHeadsUit,
} from '../../scripts/branches-controle.mjs';

/**
 * `npm run branches:stand` — QS8-385.
 *
 * ⚠️ **De belofte is niet "er staan geen branches buiten main".** Die is vandaag
 *    onwaar en hoort dat te zijn: er wordt in twee sessies tegelijk gewerkt. De
 *    belofte is: *een branch waarover niemand een besluit genomen heeft, blijft
 *    niet stil staan*.
 *
 * ## Waarom dit bestand er is, en niet alleen de ijking met de hand
 *
 * `CLAUDE.md`: *een controle die je niet kunt voeden, kun je niet ijken*. De
 * handmatige ijking mutéért het script en kijkt of het rood wordt; deze tests
 * bieden de delen élke vorm los aan — de vormen die hij moet vinden **én** de
 * vormen die hij met rust moet laten. Die tweede helft is even belangrijk: een
 * controle die alles meldt, leer je negeren, en dit script kán er twintig melden.
 */

const NU = new Date('2026-09-09T12:00:00Z');

/** Een branch, met alleen wat er in de melding komt. */
function tak(naam: string, urenOud: number, extra: Partial<Record<string, unknown>> = {}) {
  return {
    naam,
    sha: `sha-${naam}`,
    tip: new Date(NU.getTime() - urenOud * 3600_000),
    commits: 2,
    migraties: [] as string[],
    ...extra,
  };
}

describe('prHeadsUit', () => {
  it('leest de SHA en het nummer uit elke regel van ls-remote', () => {
    const uit = prHeadsUit(
      `${'a'.repeat(40)}\trefs/pull/12/head\n${'b'.repeat(40)}\trefs/pull/345/head\n`,
    );
    expect(uit.get('a'.repeat(40))).toBe(12);
    expect(uit.get('b'.repeat(40))).toBe(345);
    expect(uit.size).toBe(2);
  });

  it('laat alles staan wat geen PR-kop is', () => {
    // ⚠️ De must-allow van de lezer zelf. `refs/pull/<n>/merge` is de proefmerge
    //    die GitHub zelf maakt en staat op een commit die op géén branch voorkomt;
    //    zou die meetellen, dan matcht hij nooit iets en is hij enkel ruis in de
    //    Map. En `refs/heads/*` hoort hier per definitie niet.
    const uit = prHeadsUit(
      [
        `${'c'.repeat(40)}\trefs/pull/12/merge`,
        `${'d'.repeat(40)}\trefs/heads/main`,
        `${'e'.repeat(40)}\trefs/tags/v1`,
        'rommel zonder tab',
        '',
      ].join('\n'),
    );
    expect(uit.size).toBe(0);
  });

  it('geeft een lege Map op lege invoer in plaats van te struikelen', () => {
    // ⚠️ Dit is niet hetzelfde geval als "kon niet ophalen". Een repository
    //    zónder pull requests geeft een lege lijst, en dan is elke branch er
    //    terecht een zonder PR. Het onderscheid zit in `leesPrHeads()`, dat
    //    `null` geeft als de aanroep zelf faalt.
    expect(prHeadsUit('').size).toBe(0);
  });
});

describe('beoordeel', () => {
  const leeg = new Map<string, number>();

  it('meldt een branch zonder PR die stil staat', () => {
    const { zonderPr } = beoordeel({
      branches: [tak('origin/blijft-liggen', 20)],
      prHeads: leeg,
      register: [],
      nu: NU,
    });
    expect(zonderPr.map((b: { naam: string }) => b.naam)).toEqual(['origin/blijft-liggen']);
  });

  it('laat een branch met een PR met rust — ook als die oud is', () => {
    // ⚠️⚠️ **De must-allow die het hele script draagt.** Zonder deze helft zou
    //    "meld alles wat niet in main zit" ook groen zijn, en dat is precies de
    //    controle die je leert wegklikken. Open, gesloten of gemerged: over alle
    //    drie is een besluit genomen.
    const b = tak('origin/heeft-een-pr', 200);
    const { zonderPr } = beoordeel({
      branches: [b],
      prHeads: new Map([[b.sha, 77]]),
      register: [],
      nu: NU,
    });
    expect(zonderPr).toEqual([]);
  });

  it('laat een branch met rust die jonger is dan de grens', () => {
    // ⚠️ De tweede must-allow: een sessie die aan het bouwen is, pusht een
    //    claim-commit en werkt uren door. Die melden is de normale gang van zaken
    //    melden.
    const { zonderPr } = beoordeel({
      branches: [tak('origin/net-geclaimd', MAX_LEEFTIJD_UUR - 1)],
      prHeads: leeg,
      register: [],
      nu: NU,
    });
    expect(zonderPr).toEqual([]);
  });

  it('meldt precies op de grens, en niet er net onder', () => {
    // ⚠️ De randwaarde apart, want `>` en `>=` verschillen hier een hele dag aan
    //    stilte. Twee gevallen naast elkaar zeggen wélke kant op de grens valt.
    const roep = (uren: number) =>
      beoordeel({
        branches: [tak('origin/op-de-grens', uren)],
        prHeads: leeg,
        register: [],
        nu: NU,
      }).zonderPr.length;
    expect(roep(MAX_LEEFTIJD_UUR)).toBe(1);
    expect(roep(MAX_LEEFTIJD_UUR - 0.01)).toBe(0);
  });

  it('laat een branch met rust die met een reden in het register staat', () => {
    const { zonderPr } = beoordeel({
      branches: [tak('origin/blijft-met-opzet', 500)],
      prHeads: leeg,
      register: [{ branch: 'origin/blijft-met-opzet', reden: 'naslag' }],
      nu: NU,
    });
    expect(zonderPr).toEqual([]);
  });

  it('meldt een registerrij waarvan de branch weg is', () => {
    // ⚠️ De andere kant van het register. Een uitzondering zonder geval is een
    //    dode uitzondering, en die onderdrukt op een dag een branch die toevallig
    //    dezelfde naam krijgt.
    const { dodeRijen } = beoordeel({
      branches: [tak('origin/bestaat-nog', 1)],
      prHeads: leeg,
      register: [{ branch: 'origin/allang-weg', reden: 'ooit' }],
      nu: NU,
    });
    expect(dodeRijen).toEqual(['origin/allang-weg']);
  });

  it('zet de branches met een migratie bovenaan', () => {
    // ⚠️ Niet cosmetisch: een branch met een migratie kost bij elke dag wachten
    //    een hernummering meer, een zonder migratie niet. Wie de lijst van boven
    //    afwerkt, doet het duurste eerst.
    const { zonderPr } = beoordeel({
      branches: [
        tak('origin/kaal-en-oud', 400),
        tak('origin/met-migratie', 13, { migraties: ['0206_iets.sql'] }),
      ],
      prHeads: leeg,
      register: [],
      nu: NU,
    });
    expect(zonderPr.map((b: { naam: string }) => b.naam)).toEqual(['origin/met-migratie', 'origin/kaal-en-oud']);
  });

  it('meldt niets als er niets te melden valt', () => {
    expect(beoordeel({ branches: [], prHeads: leeg, register: [], nu: NU })).toEqual({
      zonderPr: [],
      dodeRijen: [],
    });
  });
});

describe('AANVAARD', () => {
  it('draagt bij elke rij een reden en noemt elke branch één keer', () => {
    // ⚠️ Een register zonder redenen is een lijst met namen, en dan is niet meer
    //    na te gaan waaróm iets onderdrukt wordt. Een dubbele naam is erger dan
    //    hij lijkt: dan staat er één reden te veel en weet je niet welke geldt.
    for (const rij of AANVAARD) {
      expect(rij.branch, JSON.stringify(rij)).toMatch(/^origin\//);
      expect(rij.reden.trim().length, rij.branch).toBeGreaterThan(20);
    }
    expect(new Set(AANVAARD.map((r) => r.branch)).size).toBe(AANVAARD.length);
  });
});

describe('hoofd', () => {
  const vers = () => ({ vers: true, sinds: new Date(), fout: null });

  it('slaat zichzelf zichtbaar over als de PR-koppen niet op te halen zijn', () => {
    // ⚠️⚠️ **Zonder die lijst is élke branch er een zonder PR.** Dat zou een
    //    melding zijn over de verbinding en niet over de branches — de vorm
    //    waarvan CLAUDE.md zegt dat een uitslag zonder meting geen groen is maar
    //    een ongemeten. Vandaar het woord OVERGESLAGEN en exitcode 0.
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(hoofd(() => [tak('origin/wat-dan-ook', 99)], () => null, vers)).toBe(0);
      expect(fout.mock.calls.join('\n')).toMatch(/OVERGESLAGEN/);
    } finally {
      fout.mockRestore();
    }
  });

  it('slaat zichzelf ook over zonder git', () => {
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(hoofd(() => null, () => new Map(), vers)).toBe(0);
      expect(fout.mock.calls.join('\n')).toMatch(/OVERGESLAGEN/);
    } finally {
      fout.mockRestore();
    }
  });

  it('is rood met de branchnaam erin zodra er een blijft liggen', () => {
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(hoofd(() => [tak('origin/blijft-liggen', 99)], () => new Map(), vers)).toBe(1);
      expect(fout.mock.calls.join('\n')).toMatch(/origin\/blijft-liggen/);
    } finally {
      fout.mockRestore();
    }
  });

  it('is groen en zegt wat hij nagelopen heeft als er niets ligt', () => {
    // ⚠️ De must-allow van `hoofd()` zelf. En de groene regel noemt de aantallen:
    //    "niets gevonden" en "niets gemeten" zien er anders identiek uit.
    const uit = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const branches = AANVAARD.map((r) => tak(r.branch, 500));
      expect(hoofd(() => branches, () => new Map(), vers)).toBe(0);
      expect(uit.mock.calls.join('\n')).toMatch(/branch\(es\) staan buiten main/);
    } finally {
      uit.mockRestore();
      fout.mockRestore();
    }
  });

  it('drukt de versheid van het remote-beeld af, ook als de fetch mislukte', () => {
    // ⚠️ Dit script deelt een antwoord uit — "deze branch staat al 18 uur stil" —
    //    en dat antwoord is verkeerd op een oud beeld. Mislukken is geen reden om
    //    te stoppen, wél om te zeggen hoe oud het beeld dan is.
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      hoofd(
        () => [],
        () => new Map(),
        () => ({ vers: false, sinds: new Date('2026-09-07T00:00:00Z'), fout: 'geen netwerk' }),
      );
      const uitvoer = fout.mock.calls.join('\n');
      expect(uitvoer).toMatch(/Kon niet fetchen: geen netwerk/);
      expect(uitvoer).toMatch(/2026-09-07 00:00 UTC/);
    } finally {
      fout.mockRestore();
    }
  });
});
