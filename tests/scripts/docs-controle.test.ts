import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  GATGROOTTE,
  MAPTELLING,
  beoordeelStand,
  gattabelKlachten,
  leesBewering,
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

/**
 * QS8-482 — de drie uitkomsten van één bewering.
 *
 * ⚠️⚠️ **De derde bestond niet.** Er staat niets, er staat iets leesbaars, of er
 *    staat iets dat geen getal is — en die laatste viel vóór dit issue samen met
 *    de eerste. 📏 `docs/WERKVOORRAAD.md` §0 zei *"Het gat is daarmee
 *    **veertig** bestanden"* bij een werkelijk gat van 37, en `docs:controle`
 *    was groen. Met de juiste waarde voluit óók groen — om dezelfde reden, niet
 *    om de goede.
 */
describe('leesBewering', () => {
  it('meldt dat er niets beweerd is als het patroon niet matcht', () => {
    expect(leesBewering('Een gewone alinea.', MAPTELLING)).toEqual({ staatEr: false });
  });

  it('leest een getal in cijfers', () => {
    expect(leesBewering('De map telt er **270**.', MAPTELLING)).toEqual({
      staatEr: true,
      waarde: 270,
    });
  });

  it('leest een getal voluit, tot en met twintig', () => {
    expect(leesBewering('Het gat is daarmee dertien bestanden', GATGROOTTE)).toEqual({
      staatEr: true,
      waarde: 13,
    });
  });

  /** ⚠️ De vorm die het hele issue draagt: hij stáát er, en hij is niet te lezen. */
  it('houdt een bewering die er staat maar niet te lezen is apart', () => {
    expect(leesBewering('Het gat is daarmee drieënveertig bestanden', GATGROOTTE)).toEqual({
      staatEr: true,
      onleesbaar: 'drieënveertig',
    });
  });

  /**
   * ⚠️⚠️ **De val die deze grendel bijna opnieuw opende.** `String.match()` geeft
   *    met de `g`-vlag de hele treffers terug zónder groepen, dus `gevonden[1]`
   *    is bij één treffer `undefined`. Viel `onleesbaar` daarop terug op
   *    `undefined`, dan toetste `beoordeelStand()` op *"is er een onleesbaar
   *    veld"* en zweeg — precies het gedrag dat QS8-482 wegnam, teruggezet door
   *    een vlag die iemand later toevoegt.
   *
   * 📏 Geijkt, vooraf gemeten op 38 groen: `gevonden[1] ?? gevonden[0]` terug
   *    naar `gevonden[1]` maakt precies deze twee toetsen rood.
   *
   * ⚠️⚠️ **En de andere helft is met opzet níét apart te ijken — gemeten, niet
   *    aangenomen.** `beoordeelStand()` toetst op `staatEr && waarde ===
   *    undefined` en niet op `onleesbaar !== undefined`. 📏 Die helft alléén
   *    terugzetten laat alle 38 groen, want zolang de `??` hierboven staat zijn
   *    de twee vormen gelijkwaardig. Ze is dus een riem naast een bretel en de
   *    suite kan haar niet zien. Ze blijft staan omdat ze de **belofte**
   *    uitdrukt — *"er staat een bewering en ik kon hem niet lezen"* — waar de
   *    andere vorm een eigenschap van de implementatie uitdrukt; regel 18,
   *    vraag 2. Wie de `??` ooit weghaalt, houdt aan deze vorm een controle over
   *    die nog steeds klopt.
   */
  it('houdt een bewering zonder leesbare groep apart, ook met de g-vlag', () => {
    const metG = new RegExp(GATGROOTTE.source, 'gi');
    const uit = leesBewering('Het gat is daarmee 43 bestanden', metG);
    expect(uit.staatEr).toBe(true);
    expect(uit.waarde).toBeUndefined();
    expect(typeof uit.onleesbaar).toBe('string');
  });

  it('houdt ook een woord dat geen getal probeert te zijn apart', () => {
    // ⚠️ `MAPTELLING` eist niets ná het getal, dus hier landt elk woord dat op
    //    "de map telt er" volgt. Dat is een klacht en geen stilte: de bewering
    //    staat er, alleen niet in een vorm die te toetsen is.
    expect(leesBewering('De map telt er inmiddels 270.', MAPTELLING)).toEqual({
      staatEr: true,
      onleesbaar: 'inmiddels',
    });
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

/**
 * QS8-482 — een bewering die er staat maar niet te lezen is.
 *
 * ⚠️ Deze vier gevallen stonden vóór dit issue allemaal in de vórige groep
 *    hierboven te ontbreken: ze waren geen "vorm die hij met rust laat" maar een
 *    vorm die hij *had moeten vinden* en niet vond.
 */
describe('beoordeelStand — de beweringen die hij niet kan lézen', () => {
  /**
   * 📏 **De meting van QS8-482, woordelijk.** `veertig` bij een gat van 37: dit
   *    wás groen. Niet omdat de bewering klopte maar omdat hij niet gelezen kon
   *    worden.
   */
  it('meldt een gatbewering die hij niet kan lézen — QS8-482', () => {
    const fouten = beoordeelStand({
      inhoud: '**Productie staat op `0221`.**\n\n**Het gat is daarmee veertig bestanden**',
      bestanden: map(258),
    });
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/`veertig` is voor deze controle geen getal/);
    expect(fouten[0]).toMatch(/niet getoetst maar overgeslagen/);
  });

  /**
   * ⚠️⚠️ **De scherpste vorm: de júíste waarde, voluit.** Hier is de bewering
   *    waar en de controle tóch rood — want wat hij niet kan lezen, kan hij niet
   *    nakijken, en morgen klopt hij niet meer. Dit geval is groen onder élke
   *    reparatie die alleen `NUMMERWOORDEN` uitbreidt tot onder deze waarde.
   */
  it('meldt ook een gatbewering die toevallig klopt maar onleesbaar is', () => {
    const fouten = beoordeelStand({
      inhoud: '**Productie staat op `0221`.**\n\n**Het gat is daarmee drieënveertig bestanden**',
      bestanden: map(264),
    });
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/`drieënveertig` is voor deze controle geen getal/);
  });

  it('meldt een maptelling die hij niet kan lézen', () => {
    const fouten = beoordeelStand({
      inhoud: 'De map telt er **tweehonderdzeventig**.',
      bestanden: map(270),
    });
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/hoeveel bestanden de migratiemap telt/);
    expect(fouten[0]).toMatch(/`tweehonderdzeventig`/);
  });

  /**
   * ⚠️ De klacht zegt waar de grens ligt, want anders moet de schrijver hem per
   *    keer kiezen — en dat ís hoe deze fout ontstond (acceptatiecriterium 4).
   */
  it('zegt in de klacht wat de schrijver moet doen', () => {
    const fouten = beoordeelStand({
      inhoud: 'De map telt er **tweehonderdzeventig**.',
      bestanden: map(270),
    });
    expect(fouten[0]).toMatch(/Tot en met twintig mag voluit, daarboven hoort een cijfer\./);
  });

  /**
   * ⚠️ Dezelfde val, maar dan waar hij telt: in `beoordeelStand()`. Een patroon
   *    met de `g`-vlag mag geen stilte opleveren.
   */
  it('meldt een bewering waarvan hij de groep niet eens kan lezen', () => {
    const fouten = beoordeelStand({
      inhoud: 'De map telt er 270, en verderop nog eens: de map telt er 270.',
      bestanden: map(270),
    });
    // Zonder `g` leest hij hier gewoon 270 en zwijgt terecht.
    expect(fouten).toEqual([]);

    // Mét een patroon zonder bruikbare groep is er een bewering die hij niet
    // kan nakijken, en dan hoort hij dat te zeggen in plaats van te zwijgen.
    expect(
      leesBewering('De map telt er 270.', /de map telt er \d+/i),
    ).toEqual({ staatEr: true, onleesbaar: 'De map telt er 270' });
  });

  it('meldt een onleesbare maptelling en een onleesbaar gat elk apart', () => {
    const fouten = beoordeelStand({
      inhoud:
        '**Productie staat op `0221`.** De map telt er **tweehonderdzeventig**.\n\n' +
        '**Het gat is daarmee drieënveertig bestanden**',
      bestanden: map(264),
    });
    expect(fouten).toHaveLength(2);
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
