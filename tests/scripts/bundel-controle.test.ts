import { describe, expect, it, vi } from 'vitest';

import {
  KANARIES,
  afwijkendeRegels,
  hoofd,
  kanariesDieFalen,
  telTreffers,
} from '../../scripts/bundel-controle.mjs';

/**
 * `npm run bundel:controle` — QS8-382.
 *
 * ⚠️ **De belofte is niet "er zit niets in de bundel".** Die zou vandaag al
 *    onwaar zijn: `decode-uri-component` zit er wél in, via `query-string` via
 *    `expo-router`. De belofte is: *`in_bundel` in NAGEKEKEN strookt met wat er
 *    werkelijk in `dist/` staat*.
 *
 * ⚠️⚠️ **Waarom dat nodig was.** `audit:controle` toetst `ernst`, `advisories`
 *    en `reparatie` tegen `npm audit`, en die drie worden rood zodra ze
 *    verlopen. `in_bundel` en `marker` werden alleen gelézen — terwijl
 *    `in_bundel` precies het veld is dat de **weging** draagt. Een pakket kan
 *    door een Expo-upgrade van bouwtooling naar clientcode verhuizen zónder dat
 *    zijn advisory of ernst verandert, en dan bleef de regel groen staan met een
 *    meting van maanden geleden.
 *
 * ## Waarom dit bestand er is, en niet alleen de ijking met de hand
 *
 * `CLAUDE.md`: *een controle die je niet kunt voeden, kun je niet ijken*. De
 * handmatige ijking mutéért het script en kijkt of het rood wordt; deze tests
 * bieden de gedeelten élke vorm los aan — de vormen die hij moet vinden **én**
 * de vormen die hij met rust moet laten. Die tweede helft is even belangrijk:
 * een controle die alles meldt, leer je negeren.
 */

/** Een nagebootste bundel: twee bestanden met bekende inhoud. */
const BUNDEL = [
  { pad: 'dist/_expo/static/js/web/entry.js', inhoud: Buffer.from('var a=1;// Minified React error\n__esModule') },
  { pad: 'dist/index.html', inhoud: Buffer.from('<!doctype html><title>GoalBuddies</title>') },
];

describe('telTreffers', () => {
  it('telt de bestanden waarin de naald letterlijk staat', () => {
    expect(telTreffers(BUNDEL, 'Minified React error')).toBe(1);
    expect(telTreffers(BUNDEL, '__esModule')).toBe(1);
  });

  it('geeft nul voor een naald die er niet in staat', () => {
    // ⚠️ De must-allow van de zoekfunctie zelf. Vier van de vijf markers hóren
    //    nul te geven; geeft `telTreffers` overal iets terug, dan meldt de
    //    controle vijf afwijkingen en is hij ruis.
    expect(telTreffers(BUNDEL, 'detectImageType')).toBe(0);
  });

  it('telt een naald die in twee bestanden staat ook twee keer', () => {
    const twee = [
      { pad: 'a.js', inhoud: Buffer.from('xx GoalBuddies xx') },
      { pad: 'b.js', inhoud: Buffer.from('yy GoalBuddies yy') },
    ];
    expect(telTreffers(twee, 'GoalBuddies')).toBe(2);
  });

  it('zoekt op bytes en niet op tekst', () => {
    // ⚠️ **`dist/` bevat ook lettertypen en afbeeldingen.** Die als UTF-8
    //    inlezen vervangt ongeldige bytes door U+FFFD, en dan kan een marker
    //    kapotgaan die net over zo'n grens valt. Deze test voedt een buffer met
    //    een byte die geen geldige UTF-8 is, met de naald er direct achter.
    const ruw = [{ pad: 'font.woff2', inhoud: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('maxTotalMergeKeys')]) }];
    expect(telTreffers(ruw, 'maxTotalMergeKeys')).toBe(1);
  });

  it('vindt een marker met regex-tekens erin letterlijk', () => {
    // ⚠️ De marker van `decode-uri-component` ís een reguliere expressie als
    //    tekst: `(%[a-f0-9]{2})|([^%]+?)`. Wie hier `new RegExp()` gebruikt in
    //    plaats van een letterlijke zoekactie, zoekt iets heel anders.
    const marker = '(%[a-f0-9]{2})|([^%]+?)';
    const met = [{ pad: 'a.js', inhoud: Buffer.from(`new RegExp("${marker}",'gi')`) }];
    expect(telTreffers(met, marker)).toBe(1);
    expect(telTreffers([{ pad: 'b.js', inhoud: Buffer.from('%aa') }], marker)).toBe(0);
  });
});

describe('kanariesDieFalen', () => {
  /** Een zoekfunctie die precies de afgesproken kanaries kent. */
  const goed = (naald: string) => (naald.startsWith('zzz-') ? 0 : 1);

  it('meldt niets als de zoekfunctie zich gedraagt', () => {
    expect(kanariesDieFalen(goed)).toEqual([]);
  });

  it('meldt de positieve kanaries zodra de zoekfunctie overal nul geeft', () => {
    // ⚠️⚠️ **Dit is de faalvorm waarvoor de kanaries bestaan.** Vier van de vijf
    //    markers horen nul te geven, dus een kapotte grep meldt opgewekt dat het
    //    register klopt. Zonder deze toets is die uitslag niet te onderscheiden
    //    van een geslaagde meting.
    const stuk = kanariesDieFalen(() => 0);
    expect(stuk.map((k) => k.naald)).toEqual(['Minified React error', '__esModule']);
  });

  it('meldt de negatieve kanarie zodra de zoekfunctie alles vindt', () => {
    // ⚠️ De andere kant op: een grep die overal iets vindt, meldt élke regel als
    //    afwijking. Ook waardeloos, en zonder deze kanarie ziet dat eruit als
    //    een echte bevinding.
    const stuk = kanariesDieFalen(() => 3);
    expect(stuk.map((k) => k.naald)).toEqual(['zzz-deze-string-staat-nergens-qs8382']);
  });

  it('draagt minstens één kanarie in elke richting', () => {
    // ⚠️ Een zelftoets op de lijst zelf: zonder een `verwacht: false` is de
    //    tweede faalvorm hierboven onbewaakt, en zonder `verwacht: true` de
    //    eerste. Dat is met een blik op de lijst te zien en dus precies iets wat
    //    je niet ziet.
    expect(KANARIES.some((k) => k.verwacht)).toBe(true);
    expect(KANARIES.some((k) => !k.verwacht)).toBe(true);
  });
});

describe('afwijkendeRegels', () => {
  const register = {
    erin: { in_bundel: true, marker: 'zit-erin' },
    ernaast: { in_bundel: false, marker: 'zit-er-niet-in' },
  };
  const zoek = (naald: string) => (naald === 'zit-erin' ? 1 : 0);

  it('meldt niets als elke regel strookt met de bundel', () => {
    // ⚠️ De must-allow. Zonder deze helft is "alles wordt gemeld" ook groen.
    expect(afwijkendeRegels(zoek, register)).toEqual({ afwijkend: [], zonderMarker: [] });
  });

  it('meldt een regel die zegt niet in de bundel te zitten maar er wel in staat', () => {
    const uit = afwijkendeRegels(zoek, {
      stiekem: { in_bundel: false, marker: 'zit-erin' },
    });
    expect(uit.afwijkend).toEqual([
      { naam: 'stiekem', marker: 'zit-erin', verwacht: false, treffers: 1 },
    ]);
  });

  it('meldt ook de andere kant op — beweerd in de bundel, niet gevonden', () => {
    // ⚠️ Die kant lijkt onschuldig maar is het niet: een regel die ten onrechte
    //    `true` zegt, staat te zwaar ingeschaald en houdt aandacht vast die
    //    ergens anders hoort.
    const uit = afwijkendeRegels(zoek, {
      overdreven: { in_bundel: true, marker: 'zit-er-niet-in' },
    });
    expect(uit.afwijkend).toEqual([
      { naam: 'overdreven', marker: 'zit-er-niet-in', verwacht: true, treffers: 0 },
    ]);
  });

  it('meldt een regel zonder marker apart in plaats van hem over te slaan', () => {
    // ⚠️ Stil overslaan zou zo'n regel voor altijd onzichtbaar maken — en dat is
    //    exact het gat dat dit hele script dicht: een veld dat niemand toetst.
    const uit = afwijkendeRegels(zoek, {
      leeg: { in_bundel: false, marker: '' },
      weg: { in_bundel: false },
    });
    expect(uit.zonderMarker.sort()).toEqual(['leeg', 'weg']);
    expect(uit.afwijkend).toEqual([]);
  });
});

describe('hoofd', () => {
  it('slaat zichzelf zichtbaar over zonder dist/, met exitcode 0', () => {
    // ⚠️ **Exitcode 0 én het woord OVERGESLAGEN.** De poort leest dat woord uit
    //    de uitvoer en noemt de controle dan *ongemeten* — niet groen. Zou hij
    //    hier 1 teruggeven, dan staat de poort rood op elke machine die niet net
    //    gebouwd heeft, en een controle die altijd rood staat leer je uitzetten.
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(hoofd(() => [], () => false)).toBe(0);
      expect(fout.mock.calls.join('\n')).toMatch(/OVERGESLAGEN/);
    } finally {
      fout.mockRestore();
    }
  });

  it('is rood zodra de kanaries niet kloppen, en zegt dan niets over het register', () => {
    // ⚠️ De volgorde is de belofte: klopt de zoekfunctie niet, dan zegt élke
    //    uitspraak over NAGEKEKEN niets. Deze test voedt een lege bundel — dan
    //    geeft de zoekfunctie overal nul en horen de kanaries af te gaan, niet
    //    de vijf markers.
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(hoofd(() => [], () => true)).toBe(1);
      const uitvoer = fout.mock.calls.join('\n');
      expect(uitvoer).toMatch(/kanarie/);
      expect(uitvoer).not.toMatch(/staat in NAGEKEKEN als in_bundel/);
    } finally {
      fout.mockRestore();
    }
  });
});
