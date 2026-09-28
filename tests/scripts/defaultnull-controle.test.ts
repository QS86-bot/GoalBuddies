import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  GEEN_AANROEPER_STUURT_NULL,
  argsBlokIn,
  argsBlokInCorrecties,
  beoordeel,
  getyptAlsNullbaar,
  isNullbaar,
  ontleed,
  stuurtNull,
  toetsRij,
} from '../../scripts/defaultnull-controle.mjs';

/**
 * `defaultnull-controle` gevoed — QS8-594.
 *
 * ⚠️ **Elke vorm los, en de must-allows even zwaar als de must-nots.** Een
 *    controle die alles meldt, leer je te negeren; een controle die niets meldt,
 *    bewaakt niets. Beide helften staan hieronder per zeef.
 */

/** Een gegenereerd typebestand met twee functies, in de vorm die de generator schrijft. */
const GENERATIE = `
      openstaande_beoordelingen: {
        Args: { p_limit?: number; p_na_at?: string; p_na_id?: string }
        Returns: {
          id: string
        }[]
      }
      weekafsluiting_reacties: {
        Args: { p_na_at?: string; p_na_id?: string }
        Returns: {
          id: string
        }[]
      }
`;

/** Een correctielaag waarin alléén `weekafsluiting_reacties` gecorrigeerd is. */
const CORRECTIES = `
    weekafsluiting_reacties: MetArgs<
      'weekafsluiting_reacties',
      { p_na_at?: string | null; p_na_id?: string | null }
    >;
`;

describe('de uitvoer van psql lezen', () => {
  it('houdt de regels over die een functie en een parameter noemen', () => {
    expect(ontleed('groepschat.p_before_at\n  meld.p_toelichting  \n\n(2 rows)\n')).toEqual([
      'groepschat.p_before_at',
      'meld.p_toelichting',
    ]);
  });

  it('MUST-ALLOW: ruis eromheen telt niet mee', () => {
    expect(ontleed('ERROR: iets\n---------\n')).toEqual([]);
  });
});

/**
 * ⚠️⚠️ **Dit is de toets die het verschil tussen twaalf en veertien draagt.**
 *    📏 Gemeten op 24-09-2026: een naamgerichte zoektocht door de correctielaag
 *    vindt `p_na_at` in de rij van `weekafsluiting_reacties` en rekent daarmee
 *    ook `openstaande_beoordelingen.p_na_at` als gedekt — 12 in plaats van 14.
 *    De twee blokjes hierboven zijn dat geval, uitgesneden.
 */
describe('een parameter hoort bij zijn eigen functie', () => {
  it('ziet de gecorrigeerde functie als gedekt', () => {
    expect(getyptAlsNullbaar(GENERATIE, CORRECTIES, 'weekafsluiting_reacties.p_na_at')).toBe(true);
  });

  it('MUST-FIND: en de ándere functie met dezelfde parameternaam níet', () => {
    expect(
      getyptAlsNullbaar(GENERATIE, CORRECTIES, 'openstaande_beoordelingen.p_na_at'),
      'een naamgerichte zoektocht zegt hier `true`, en dat is precies de fout die dit script niet mag maken',
    ).toBe(false);
  });

  it('knipt het Args-blok uit de generatie en niet het hele bestand', () => {
    expect(argsBlokIn(GENERATIE, 'weekafsluiting_reacties')).toContain('p_na_at');
    expect(argsBlokIn(GENERATIE, 'weekafsluiting_reacties')).not.toContain('p_limit');
  });

  it('MUST-ALLOW: een functie die er niet in staat geeft een leeg blok en geen treffer', () => {
    expect(argsBlokIn(GENERATIE, 'bestaat_niet')).toBe('');
    expect(argsBlokInCorrecties(CORRECTIES, 'bestaat_niet')).toBe('');
    expect(isNullbaar('', 'p_na_at')).toBe(false);
  });
});

describe('een aanroepplek die `null` stuurt', () => {
  const vormen = {
    kaal: 'rpc("f", { p_x: null })',
    'met ??': 'rpc("f", { p_x: waarde ?? null })',
    'met ||': 'rpc("f", { p_x: waarde || null })',
    undefined: 'rpc("f", { p_x: undefined })',
    'sleutel tussen aanhalingstekens': "rpc('f', { 'p_x': null })",
    'over twee regels': 'const a = {\n  p_x: null,\n};',
  };

  for (const [naam, bron] of Object.entries(vormen)) {
    it(`MUST-FIND: ${naam}`, () => {
      expect(stuurtNull(bron, 'p_x')).toBe(true);
    });
  }

  const metRust = {
    'een gewone waarde': 'rpc("f", { p_x: cursor.at })',
    'de sleutel weggelaten': 'rpc("f", { ...(c === null ? {} : { p_x: c.at }) })',
    'een naam die erop lijkt': 'rpc("f", { p_x_anders: null })',
    'een vergelijking met null': 'rpc("f", { ...(x === null ? {} : { p_x: x }) })',
  };

  for (const [naam, bron] of Object.entries(metRust)) {
    it(`MUST-ALLOW: ${naam}`, () => {
      expect(stuurtNull(bron, 'p_x')).toBe(false);
    });
  }

  /**
   * ⚠️⚠️ **Zonder de knip wordt deze controle rood op zijn eigen documentatie.**
   *    📏 `src/modules/notifications/tokens.ts` legt in zijn kop uit dat er
   *    `?? null` stond en dat het bewust weg is. Dat is de klasse van QS8-568:
   *    bij een tijdelijke uitschakeling blijft de naam juist in het commentaar
   *    staan.
   */
  it('MUST-ALLOW: een commentaarregel die de oude vorm uitlegt', () => {
    expect(stuurtNull('// Hier stond `p_x: waarde ?? null`, en dat is bewust weg.\nconst a = { p_x: w };', 'p_x')).toBe(
      false,
    );
  });

  it('MUST-ALLOW: hetzelfde in een blokcommentaar', () => {
    expect(stuurtNull('/**\n * ⚠️ `p_x: null` mag hier niet.\n */\nconst a = { p_x: w };', 'p_x')).toBe(false);
  });
});

const BRONNEN = [{ pad: 'src/modules/x.ts', inhoud: 'rpc("groepschat", { ...(c ? { p_before_at: c.at } : {}) })' }];
const REGISTER = {
  'groepschat.p_before_at': { bestand: 'src/modules/x.ts', reden: 'de sleutel wordt weggelaten' },
};

describe('het oordeel', () => {
  it('MUST-ALLOW: getypt, of met een reden die nog klopt, is stil', () => {
    const uit = beoordeel({
      argumenten: ['groepschat.p_before_at', 'weekafsluiting_reacties.p_na_at'],
      generatie: GENERATIE,
      correcties: CORRECTIES,
      bronnen: BRONNEN,
      register: REGISTER,
    });

    expect(uit).toEqual({ ongedekt: [], verouderd: [], gebroken: [] });
  });

  it('MUST-FIND: niet getypt en geen registerrij', () => {
    const uit = beoordeel({
      argumenten: ['openstaande_beoordelingen.p_na_at'],
      generatie: GENERATIE,
      correcties: CORRECTIES,
      bronnen: BRONNEN,
      register: REGISTER,
    });

    expect(uit.ongedekt).toEqual(['openstaande_beoordelingen.p_na_at']);
  });

  it('MUST-FIND: een registerrij voor iets dat intussen getypt is', () => {
    const uit = beoordeel({
      argumenten: ['weekafsluiting_reacties.p_na_at'],
      generatie: GENERATIE,
      correcties: CORRECTIES,
      bronnen: BRONNEN,
      register: { 'weekafsluiting_reacties.p_na_at': { bestand: 'src/modules/x.ts', reden: 'oud' } },
    });

    expect(uit.verouderd).toEqual(['weekafsluiting_reacties.p_na_at']);
  });

  /**
   * ⚠️ **Dit onderscheidt een register van een inventaris.** De rij beweert iets
   *    over een plek; gaat die bewering onderuit, dan is het rood en geen
   *    vrijstelling.
   */
  it('MUST-FIND: de rij noemt een bestand dat de functie niet meer aanroept', () => {
    const uit = toetsRij('groepschat.p_before_at', REGISTER['groepschat.p_before_at'], [
      { pad: 'src/modules/y.ts', inhoud: 'rpc("groepschat", {})' },
    ]);

    expect(uit).toHaveLength(1);
    expect(uit[0]?.waarom).toContain('noemt `groepschat` niet meer');
  });

  /**
   * ⚠️⚠️ **De knip in `toetsRij()` — QS8-602.** Mutatie B van QS8-594 (de rij
   *    naar een bestand wijzen dat de functie niet aanroept) bleef de eerste
   *    keer groen, omdat dat bestand de functie in een commentaarregel nóemde.
   *    De knip was de reparatie, en 📏 er stond geen toets op: hem weghalen liet
   *    25 van 25 groen. Met het echte register maakt hij vandaag geen verschil,
   *    dus zonder deze toetsen komt het gat stil terug zodra het dat wel doet.
   */
  it('MUST-FIND: het bestand noemt de functie alleen in een regelcommentaar', () => {
    const uit = toetsRij('groepschat.p_before_at', REGISTER['groepschat.p_before_at'], [
      { pad: 'src/modules/x.ts', inhoud: '// dit roept groepschat() niet meer aan\nexport const x = 1;' },
    ]);

    expect(uit).toHaveLength(1);
    expect(uit[0]?.waarom).toContain('noemt `groepschat` niet meer');
  });

  it('MUST-FIND: en ook alleen in een blokcommentaar', () => {
    const uit = toetsRij('groepschat.p_before_at', REGISTER['groepschat.p_before_at'], [
      { pad: 'src/modules/x.ts', inhoud: '/**\n * Vroeger via `groepschat()`.\n */\nexport const x = 1;' },
    ]);

    expect(uit).toHaveLength(1);
    expect(uit[0]?.waarom).toContain('noemt `groepschat` niet meer');
  });

  it('MUST-ALLOW: een echte aanroep met een commentaar erbij blijft een aanroeper', () => {
    const uit = toetsRij('groepschat.p_before_at', REGISTER['groepschat.p_before_at'], [
      { pad: 'src/modules/x.ts', inhoud: '// groepschat() laat de cursor weg\nrpc("groepschat", {})' },
    ]);

    expect(uit).toEqual([]);
  });

  it('MUST-FIND: het bestand klopt, maar er staat intussen een `null` in', () => {
    const uit = toetsRij('groepschat.p_before_at', REGISTER['groepschat.p_before_at'], [
      { pad: 'src/modules/x.ts', inhoud: 'rpc("groepschat", { p_before_at: null })' },
    ]);

    expect(uit).toHaveLength(1);
    expect(uit[0]?.waarom).toContain('stuurt `null`');
  });
});

describe('het echte register', () => {
  it('draagt zestien rijen, en elke rij wijst naar een bestand dat bestaat', () => {
    const rijen = Object.entries(GEEN_AANROEPER_STUURT_NULL);

    // 📏 Gemeten op 24-09-2026 tegen een lokaal schema op `0298`: 24 argumenten
    //    met `DEFAULT NULL`, waarvan 8 gecorrigeerd en 16 met een reden.
    expect(rijen).toHaveLength(16);

    for (const [sleutel, rij] of rijen) {
      expect(existsSync(rij.bestand), `${sleutel} wijst naar ${rij.bestand}`).toBe(true);
      expect(rij.reden.length, `${sleutel} heeft een reden van betekenis`).toBeGreaterThan(40);
    }
  });

  it('noemt elke sleutel als `functie.parameter`', () => {
    for (const sleutel of Object.keys(GEEN_AANROEPER_STUURT_NULL)) {
      expect(sleutel).toMatch(/^[a-z0-9_]+\.p_[a-z0-9_]+$/);
    }
  });
});
