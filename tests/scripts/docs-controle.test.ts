import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  GATGROOTTE,
  beoordeelStand,
  gattabelKlachten,
  nummerVan,
  telWoord,
} from '../../scripts/docs-controle.mjs';

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

/**
 * QS8-404 — de controle die de proza-stand tegen de migratiemap legt.
 *
 * ⚠️ **Waarom deze tests bestaan.** `docs-controle` bewaakte QS8-125 sinds
 *    23-08-2026 en had zelf nooit een test. Daardoor kon niemand zien dat zijn
 *    énige meetbare tak in `WERKVOORRAAD.md` op het gegenereerde `STAND`-blok
 *    landde — het blok dat `npm run stand` per definitie waar houdt. 📏 Op
 *    09-09-2026 stond er "de map telt er 229" en "het gat is vijf bestanden"
 *    terwijl het er 237 en dertien waren, en de controle was groen.
 *
 *    De helft die het zwaarst weegt is de tweede: de vormen die hij met rúst
 *    moet laten. `CLAUDE.md` en `VOLGENDE-SESSIE.md` citeren verouderde getallen
 *    met opzet, als waarschuwend voorbeeld van deze fout. Een controle die die
 *    citaten rood maakt, wist de les die ze dragen — en leert je hem uit te
 *    zetten.
 */

/** Een map van `aantal` bestanden, oplopend genummerd vanaf 0001. */
function map(aantal: number): string[] {
  return Array.from({ length: aantal }, (_, i) =>
    `${String(i + 1).padStart(4, '0')}_iets.sql`,
  );
}

describe('telWoord', () => {
  it('leest cijfers', () => {
    expect(telWoord('13')).toBe(13);
    expect(telWoord('237')).toBe(237);
  });

  it('leest voluit geschreven getallen, want zo staan ze in de documenten', () => {
    expect(telWoord('vijf')).toBe(5);
    expect(telWoord('dertien')).toBe(13);
    expect(telWoord('één')).toBe(1);
  });

  it('laat zich niet van de wijs brengen door opmaak', () => {
    expect(telWoord('**237**')).toBe(237);
    expect(telWoord('`13`')).toBe(13);
    expect(telWoord('  Vijf  ')).toBe(5);
  });

  it('geeft undefined voor alles wat geen getal is', () => {
    expect(telWoord('de')).toBeUndefined();
    expect(telWoord('belangrijkste')).toBeUndefined();
    expect(telWoord(undefined)).toBeUndefined();
  });
});

describe('nummerVan', () => {
  it('leest het viercijferige nummer', () => {
    expect(nummerVan('0234_een_dagteller.sql')).toBe(234);
  });

  it('telt een letterversie mee onder zijn eigen nummer', () => {
    expect(nummerVan('0039a_iets.sql')).toBe(39);
  });

  it('geeft undefined voor een bestand zonder nummer', () => {
    expect(nummerVan('README.md')).toBeUndefined();
  });
});

describe('beoordeelStand — de vormen die hij moet vínden', () => {
  it('ziet een maptelling die achterloopt', () => {
    const fouten = beoordeelStand({
      inhoud: 'De map telt er\n**229**.',
      bestanden: map(237),
    });
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/229 bestanden telt, maar het zijn er 237/);
  });

  it('ziet een gat dat achterloopt, ook voluit geschreven', () => {
    const fouten = beoordeelStand({
      inhoud: '**Productie staat op `0221`.**\n\n**Het gat is daarmee vijf bestanden**',
      bestanden: map(234),
    });
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/\(0221\) 5 bestanden groot is, maar er staan er 13/);
  });

  it('meldt allebei apart als allebei mis zijn — QS8-404 zoals hij stond', () => {
    const fouten = beoordeelStand({
      inhoud:
        '⚠️ **Productie staat op `0221`.** De map telt er\n**229**.\n\n' +
        '**Het gat is daarmee vijf bestanden**, alle vijf uit QS8-71:',
      bestanden: map(237),
    });
    expect(fouten).toHaveLength(2);
  });

  /**
   * ⚠️ **De ijking die het hele issue draagt.** Een correct `STAND`-blok mag een
   *    verkeerde proza-alinea niet afdekken — dát was de bug, en dit is de
   *    mutatie die hem rood maakt.
   */
  it('kijkt langs een kloppend STAND-blok heen naar de proza-alinea', () => {
    const fouten = beoordeelStand({
      inhoud:
        'De map telt er **229**.\n\n' +
        '<!-- STAND:BEGIN -->\nMigraties `0001` t/m `0243` staan in de map: **237 bestanden**.\n<!-- STAND:EINDE -->',
      bestanden: map(237),
    });
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/229 bestanden telt/);
  });
});

describe('beoordeelStand — de vormen die hij met rúst moet laten', () => {
  it('zwijgt als de maptelling klopt', () => {
    expect(beoordeelStand({ inhoud: 'De map telt er **237**.', bestanden: map(237) })).toEqual([]);
  });

  it('zwijgt als het gat klopt', () => {
    const inhoud = '**Productie staat op `0221`.**\n\n**Het gat is daarmee dertien bestanden**';
    expect(beoordeelStand({ inhoud, bestanden: map(234) })).toEqual([]);
  });

  it('zwijgt als er helemaal geen bewering staat', () => {
    expect(beoordeelStand({ inhoud: 'Een gewone alinea.', bestanden: map(237) })).toEqual([]);
  });

  /**
   * 📏 De echte zin uit `CLAUDE.md` onder onwrikbare regel 20 — een zin over
   *    waaróm een gat erg is, geen bewering over een aantal.
   *
   * ⚠️ **Dit geval is met opzet dubbel afgedekt, en dat is gemeten en niet
   *    aangenomen.** Twee eigenschappen houden hem los van elkaar groen: het
   *    getal moet vlák voor "bestanden" staan (`GATGROOTTE` matcht deze zin
   *    daardoor helemaal niet), én `telWoord` strandt een niet-getal op
   *    `undefined`. 📏 Elk van die twee apart kapot gemaakt laat deze test
   *    gewoon groen — het is dus geen ijking van één grendel maar een
   *    regressievanger op een echte zin. Wat de eerste van de twee wél draagt,
   *    staat in de test hieronder.
   */
  it('laat de zin over waarom een gat erg is met rust', () => {
    const inhoud =
      '**Productie staat op `0221`.**\n\n' +
      'Het gat is de belangrijkste: de bestanden zijn de enige manier om dit ' +
      'schema ergens anders op te bouwen.';
    expect(beoordeelStand({ inhoud, bestanden: map(237) })).toEqual([]);
  });

  it('doet niets met een productiestand zonder gatbewering', () => {
    const inhoud = 'Hier stond "productie staat op `0186`, de map op 0216" — verouderd.';
    expect(beoordeelStand({ inhoud, bestanden: map(237) })).toEqual([]);
  });

  it('doet niets met een gatbewering zonder productiestand', () => {
    expect(beoordeelStand({ inhoud: '**Het gat is vijf bestanden**', bestanden: map(237) })).toEqual([]);
  });

  /**
   * ⚠️ **Dit is de grendel die de adjacency-eis draagt** — niet
   *    `beoordeelStand`, maar tak B van de controle. `GATGROOTTE` staat óók in
   *    `FEITEN` als een feit dat alleen `WERKVOORRAAD.md` mag bezitten. Matcht
   *    hij de zin uit `CLAUDE.md`, dan meldt de controle dat het feit "ook in
   *    CLAUDE.md" staat en wordt de hele poort rood om een zin die klopt.
   *
   * 📏 Geijkt: laat `GATGROOTTE` het getal ergens in de zin zoeken in plaats van
   *    vlák voor "bestanden", en `npm run docs:controle` valt om op precies die
   *    valse melding.
   */
  it('laat GATGROOTTE niet op de echte tekst van CLAUDE.md vallen', () => {
    const claude = readFileSync(`${WORTEL}/CLAUDE.md`, 'utf8');
    expect(GATGROOTTE.test(claude)).toBe(false);
  });

  it('telt een letterversie mee in de maptelling', () => {
    const bestanden = [...map(3), '0039a_iets.sql'];
    expect(beoordeelStand({ inhoud: 'De map telt er **4**.', bestanden })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **De gattabel — QS8-445.** `beoordeelStand()` hierboven telt de twee
 *    **proza**-beweringen na. 📏 Precies daardoor bleef hij groen terwijl de
 *    tabel eronder `0255` miste: het getal klopte (34 = 34), de rijen niet.
 *
 * 📏 **De ijking — twee tegen het echte document, vier tegen de zeef, alle zes
 *    met de hand gedraaid op 12-09-2026 met vooraf gemeten 26 groen.**
 *
 *    Tegen `docs/WERKVOORRAAD.md`, via `npm run docs:controle`:
 *
 *    | Mutatie | Wat de controle zei |
 *    |---|---|
 *    | de `0255`-rij weghalen — **de oorspronkelijke fout** | "de gattabel mist een rij voor `0255_…`" |
 *    | een rij naar een niet-bestaand bestand erbij | "de gattabel noemt `0299_…`, maar dat staat niet in het gat" |
 *
 *    Tegen de zeef zelf, één mutatie per grendel:
 *
 *    | Mutatie | Wat er rood werd |
 *    |---|---|
 *    | het `^\|`-anker uit `GATRIJ` | 1 — "laat een migratienaam in lopende tekst met rust" |
 *    | de "ontbrekende rij"-richting eruit | 1 — "meldt een migratie in het gat zonder rij" |
 *    | de "overtollige rij"-richting eruit | 2 — de twee gevallen die een rij te veel melden |
 *    | de productie-grendel eruit | 1 — "zwijgt zonder productienummer" |
 *
 *    ⚠️ De eerste van die vier is de belangrijkste: zonder het anker leest de
 *       zeef élke migratienaam in lopende tekst als tabelrij, en
 *       `WERKVOORRAAD.md` staat er vol mee. Dat hij dáár rood van wordt, is het
 *       bewijs dat het anker draagt.
 */
const GAT = {
  inhoud: [
    'Productie staat op `0221`.',
    '| `0222_een.sql` | QS8-1 | ja |',
    '| `0223_twee.sql` | QS8-2 | nee |',
  ].join('\n'),
  bestanden: ['0220_oud.sql', '0221_grens.sql', '0222_een.sql', '0223_twee.sql'],
};

describe('gattabelKlachten — de vormen die hij moet vínden', () => {
  it('meldt een migratie in het gat zonder rij in de tabel', () => {
    const uit = gattabelKlachten({ ...GAT, bestanden: [...GAT.bestanden, '0224_drie.sql'] });
    expect(uit).toEqual(['de gattabel mist een rij voor `0224_drie.sql`.']);
  });

  /**
   * ⚠️ De ratel slaat twee kanten op: een rij zonder bestand stuurt de lezer
   *    naar een migratie die hernummerd of ingetrokken is.
   */
  it('meldt een rij die naar een bestand wijst dat niet in het gat staat', () => {
    const uit = gattabelKlachten({
      ...GAT,
      inhoud: `${GAT.inhoud}\n| \`0299_weg.sql\` | QS8-9 | nee |`,
    });
    expect(uit).toEqual(['de gattabel noemt `0299_weg.sql`, maar dat staat niet in het gat.']);
  });

  it('meldt een rij voor een migratie die al op productie staat', () => {
    const uit = gattabelKlachten({
      ...GAT,
      inhoud: `${GAT.inhoud}\n| \`0220_oud.sql\` | QS8-8 | nee |`,
    });
    expect(uit).toEqual(['de gattabel noemt `0220_oud.sql`, maar dat staat niet in het gat.']);
  });
});

describe('gattabelKlachten — de vormen die hij met rúst moet laten', () => {
  it('zwijgt als elke migratie in het gat een rij heeft en omgekeerd', () => {
    expect(gattabelKlachten(GAT)).toEqual([]);
  });

  /**
   * ⚠️⚠️ **De belangrijkste helft.** Een migratienaam in een gewone zin is geen
   *    tabelrij. Zou de zeef die pakken, dan meldt hij elke alinea die een
   *    migratie noemt — en `WERKVOORRAAD.md` staat er vol mee.
   */
  it('laat een migratienaam in lopende tekst met rust', () => {
    const uit = gattabelKlachten({
      ...GAT,
      inhoud: `${GAT.inhoud}\n\nZie \`0299_weg.sql\` voor de reden, en ook \`0300_nog.sql\`.`,
    });
    expect(uit).toEqual([]);
  });

  it('zwijgt zonder productienummer — er valt dan geen gat te berekenen', () => {
    expect(gattabelKlachten({ ...GAT, inhoud: GAT.inhoud.replace(/Productie staat op .*/, '') }))
      .toEqual([]);
  });

  it('zwijgt in een document zonder gattabel', () => {
    expect(gattabelKlachten({ ...GAT, inhoud: 'Productie staat op `0221`. Verder niets.' }))
      .toEqual([]);
  });
});
