import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `dsn-controle.test.ts`.
import {
  basisUit,
  beoordeelHernummering,
  kiesBron,
  herschrijfKop,
  kopKlopt,
  kopNummer,
  herschrijfVerwijzingen,
} from '../../scripts/migratie-hernummer.mjs';

/**
 * IJking van `migratie:hernummer` en van stap 5 van `migraties:controle` — QS8-241.
 *
 * ⚠️ **De belofte is niet "het script vervangt een getal".** Die is triviaal. De
 *    belofte is: *na een hernummering liegt geen enkele regel meer over welk
 *    nummer dit is.* Dat is precies wat er op 31-08 misging, met een reparatie
 *    die er goed uitzag:
 *
 *      sed -i 's/\\b0134\\b/0136/g' …
 *
 *    `_` is in GNU sed een woordteken, dus in `0134_een_plan` staat er geen
 *    woordgrens achter de `4`. Het bestand heette daarna `0136_…` terwijl zijn
 *    kop `0134_…` zei. **Dat geval staat hieronder als eerste test**, want het
 *    is het enige dat aantoonbaar is doorgeglipt.
 *
 * ⚠️ **De tegenhelft telt even zwaar**, en die is hier niet theoretisch. De
 *    eerste versie van `kopNummer()` eiste de volledige vorm `NNNN_naam.sql` en
 *    meldde daarmee **vijftien gezonde migraties** — er zijn twee legitieme
 *    kopstijlen in deze repo. Een controle die vijftien correcte bestanden
 *    meldt, leer je uitzetten. Vandaar `de echte migratiemap` onderaan: die
 *    voedt de controle met alles wat er is, en dat is de test die de
 *    miskalibratie ving.
 */

describe('kopNummer', () => {
  it('leest de sjabloonstijl met bestandsnaam en al', () => {
    expect(kopNummer('-- 0998_een_verzonnen_migratie.sql — waarom dit bestaat\n--\n')).toBe('0998');
  });

  /** De oudere stijl. Vijftien migraties gebruiken hem; hij is niet fout. */
  it('leest de oudere stijl met alleen een nummer', () => {
    expect(kopNummer('-- 0062 — Web push: de twee sleutels\n--\n')).toBe('0062');
  });

  /** Sommige migraties openen met een scheidingslijn en noemen zich op regel twee. */
  it('kijkt voorbij een scheidingslijn', () => {
    expect(kopNummer('-- -------------------\n-- 0112 — Seizoenen per groep\n')).toBe('0112');
  });

  it('stopt bij de eerste regel die geen commentaar is', () => {
    expect(kopNummer('create table x ();\n-- 0099 hoort hier niet\n')).toBeNull();
  });

  it('geeft null als de kop geen nummer noemt', () => {
    expect(kopNummer('-- Deze migratie doet iets\n--\n')).toBeNull();
  });

  it.each([
    ['leeg', ''],
    ['undefined', undefined],
  ])('geeft null bij %s', (_naam, inhoud) => {
    expect(kopNummer(inhoud)).toBeNull();
  });
});

describe('kopKlopt', () => {
  it('is waar als de kop het bestand noemt', () => {
    expect(kopKlopt('0998_verzonnen.sql', '-- 0998_verzonnen.sql — iets\n')).toBe(true);
  });

  /**
   * ⚠️ **De assertie waar stap 5 van `migraties:controle` om bestaat.** Dit is
   *    letterlijk de toestand waarin de repo op 31-08 verkeerde.
   */
  it('is onwaar als de kop een ander nummer noemt dan het bestand', () => {
    expect(kopKlopt('0136_een_plan.sql', '-- 0134_een_plan.sql — iets\n')).toBe(false);
  });

  it('is onwaar als er helemaal geen nummer in de kop staat', () => {
    expect(kopKlopt('0136_een_plan.sql', '-- Een plan uit een zin\n')).toBe(false);
  });

  /** Een onleesbare bestandsnaam is een ándere fout, met een eigen melding. */
  it('laat een onleesbare bestandsnaam met rust', () => {
    expect(kopKlopt('losse-notitie.sql', '-- niets\n')).toBe(true);
  });
});

describe('herschrijfKop', () => {
  /**
   * ⚠️ **Het geval dat op 31-08 doorglipte.** Met `\\b` blijft deze regel staan,
   *    want `_` is een woordteken. Wordt deze test rood gemaakt door de
   *    kop-herschrijving uit het script te halen, dan is dat exact de bug terug.
   */
  it('herschrijft de kop ook al staat er een underscore achter het nummer', () => {
    const uit = herschrijfKop('-- 0134_een_plan.sql — iets\n--\n', '0136_een_plan');
    expect(uit.split('\n')[0]).toBe('-- 0136_een_plan.sql — iets');
  });

  it('herschrijft ook de oudere stijl zonder bestandsnaam', () => {
    expect(herschrijfKop('-- 0062 — Web push\n', '0064_web_push').split('\n')[0]).toBe(
      '-- 0064 — Web push',
    );
  });

  it('raakt alleen de kop en niet de rest', () => {
    const uit = herschrijfKop('-- 0134_x.sql — iets\n--\nselect 0134;\n', '0136_x');
    expect(uit).toContain('select 0134;');
  });

  it('laat een bestand zonder kop met rust', () => {
    expect(herschrijfKop('select 1;\n', '0136_x')).toBe('select 1;\n');
  });
});

/**
 * ⚠️ **Dit heette `vervangIn` en die zocht alleen op nummer.** QS8-277 liet zien
 *    dat dat één ding te weinig is zodra twee migraties hetzelfde nummer dragen:
 *    het script schreef toen de kopregel van de ánder bij, plus twee regels in
 *    een dossier die bij het issue van die ander hoorden. De oude tests staan
 *    hieronder ongewijzigd — dezelfde vormen, dezelfde beloftes — plus de gevallen
 *    die er niet waren.
 */
describe('herschrijfVerwijzingen — een uniek nummer, zoals het altijd ging', () => {
  const uniek = (tekst: string, nummer: string, oudeBasis: string, nieuweBasis: string) =>
    herschrijfVerwijzingen(tekst, { nummer, oudeBasis, nieuweBasis, gedeeld: false });

  it('vervangt een verwijzing midden in een zin', () => {
    expect(uniek('sinds 0134 gebruikt', '0134', '0134_x', '0136_x').tekst).toBe(
      'sinds 0136 gebruikt',
    );
  });

  it('vervangt de vorm met een underscore erachter', () => {
    expect(uniek('zie 0134_een_plan.sql', '0134', '0134_een_plan', '0136_een_plan').tekst).toBe(
      'zie 0136_een_plan.sql',
    );
  });

  it('telt hoeveel het er waren', () => {
    expect(uniek('0134 en 0134 en 0135', '0134', '0134_x', '0136_x').treffers).toBe(2);
  });

  it('zegt op welke regels het gebeurde', () => {
    expect(uniek('niets\n0134 hier\nniets\n0134 daar', '0134', '0134_x', '0136_x').regels).toEqual(
      [2, 4],
    );
  });

  /**
   * ⚠️ **De helft die telt.** Een controle die alles vervangt, leer je uit te
   *    zetten — en hier zou het bovendien geschiedenis vervalsen.
   */
  it.each([
    ['een deelmigratie', '0039a blijft', '0039'],
    ['een langer getal', 'nummer 20134 hier', '0134'],
    ['een nummer met een letter erachter', '0052b', '0052'],
  ])('laat %s met rust', (_naam, tekst, van) => {
    expect(uniek(tekst, van, `${van}_x`, '9999_x').tekst).toBe(tekst);
  });

  /** Een jaartal heeft geen voorloopnul en botst dus per definitie niet. */
  it('raakt een jaartal niet', () => {
    expect(uniek('op 2026 gemeten', '0026', '0026_x', '0136_x').tekst).toBe('op 2026 gemeten');
  });

  /** De staart-lookahead: een langere slug is een ánder bestand. */
  it('herschrijft geen basis die alleen maar met de onze begint', () => {
    const uit = uniek('zie 0134_een_plan_b.sql', '0134', '0134_een_plan', '0136_een_plan');
    expect(uit.tekst).toBe('zie 0136_een_plan_b.sql');
  });
});

/**
 * ⚠️⚠️ **Het hoofdgeval, en het geval waar het script op misging.** Bij twee
 *    migraties op hetzelfde nummer is een kaal nummer niet toe te wijzen. De
 *    volledige naam wél — die kan maar naar één bestand wijzen.
 */
describe('herschrijfVerwijzingen — een gedeeld nummer', () => {
  const ONS = '0159_een_uitgezet_lid';
  const ANDER = '0159_een_adempauze';
  const NIEUW = '0160_een_uitgezet_lid';

  const gedeeld = (tekst: string) =>
    herschrijfVerwijzingen(tekst, {
      nummer: '0159',
      oudeBasis: ONS,
      nieuweBasis: NIEUW,
      gedeeld: true,
      bekendeBases: [ONS, ANDER],
    });

  it('herschrijft een verwijzing die de volle naam noemt', () => {
    const uit = gedeeld(`zie ${ONS}.sql voor de reden`);
    expect(uit.tekst).toBe(`zie ${NIEUW}.sql voor de reden`);
    expect(uit.treffers).toBe(1);
    expect(uit.gemeld).toEqual([]);
  });

  it('laat een kaal nummer staan en meldt het met regel en tekst', () => {
    const uit = gedeeld('regel een\nOpgelost met migratie 0159 (van de ander).');

    expect(uit.tekst).toBe('regel een\nOpgelost met migratie 0159 (van de ander).');
    expect(uit.treffers).toBe(0);
    expect(uit.gemeld).toEqual([
      { regel: 2, fragment: 'Opgelost met migratie 0159 (van de ander).' },
    ]);
  });

  it('raakt de naam van de ándere migratie niet aan en meldt hem ook niet', () => {
    // ⚠️ Dít is de kopregel die op 05-09 werd bijgeschreven. Hij is geen
    //    verwijzing naar ons en ook geen twijfelgeval: dat bestand staat in de map.
    const kop = `-- ${ANDER}.sql — de migratie van de andere sessie`;
    const uit = gedeeld(kop);

    expect(uit.tekst).toBe(kop);
    expect(uit.treffers).toBe(0);
    expect(uit.gemeld).toEqual([]);
  });

  it('doet allebei in één tekst, en houdt ze uit elkaar', () => {
    const uit = gedeeld(
      [`1. ${ONS}.sql — de onze`, '2. migratie 0159 — van de ander', `3. ${ANDER}.sql`].join('\n'),
    );

    expect(uit.tekst.split('\n')[0]).toBe(`1. ${NIEUW}.sql — de onze`);
    expect(uit.tekst.split('\n')[1]).toBe('2. migratie 0159 — van de ander');
    expect(uit.tekst.split('\n')[2]).toBe(`3. ${ANDER}.sql`);
    expect(uit.gemeld.map((g) => g.regel)).toEqual([2]);
  });

  /**
   * ⚠️ **De tegenhelft.** Zonder dit geval zou "meldt en vervangt niet" ook
   *    kloppen bij een functie die bij een gedeeld nummer helemáál niets doet —
   *    en dan is de hernummering van de volle namen stil weg.
   */
  it('is niet stiller dan nodig: de volle naam gaat wél mee', () => {
    const uit = gedeeld(`${ONS}.sql en nog eens ${ONS}.sql`);
    expect(uit.treffers).toBe(2);
    expect(uit.tekst).not.toContain(ONS);
  });
});

describe('kiesBron', () => {
  const twee = ['0146_geland.sql', '0146_van_mij.sql', '0147_iets.sql'];

  it('weigert bij twee bestanden met hetzelfde nummer en noemt ze allebei', () => {
    const uit = kiesBron('0146', twee);
    expect(uit.ok).toBe(false);
    expect(uit.reden).toBe('bron_dubbel');
    expect(uit.uitleg).toContain('0146_geland.sql');
    expect(uit.uitleg).toContain('0146_van_mij.sql');
  });

  it('kiest wél zodra er maar één bestand met dat nummer is', () => {
    const uit = kiesBron('0147', twee);
    expect(uit.ok).toBe(true);
    expect(uit.bestand).toBe('0147_iets.sql');
    expect(uit.nummer).toBe('0147');
  });

  /** De weg terug: een bestandsnaam wijst zichzelf aan, dus er valt niets te raden. */
  it('accepteert een bestandsnaam en leidt het nummer eruit af', () => {
    const uit = kiesBron('0146_van_mij.sql', twee);
    expect(uit.ok).toBe(true);
    expect(uit.bestand).toBe('0146_van_mij.sql');
    expect(uit.nummer).toBe('0146');
  });

  it('accepteert ook een pad, want dat is wat je uit je shell plakt', () => {
    const uit = kiesBron('supabase/migrations/0146_geland.sql', twee);
    expect(uit.ok).toBe(true);
    expect(uit.bestand).toBe('0146_geland.sql');
  });

  it('weigert een bestandsnaam die niet in de map staat', () => {
    const uit = kiesBron('0146_verzonnen.sql', twee);
    expect(uit.ok).toBe(false);
    expect(uit.reden).toBe('bestand_ontbreekt');
  });

  /**
   * ⚠️ **Gekozen is niet hetzelfde als veilig.** De verwijzingsvervanging gaat op
   *    **nummer** — hij zoekt overal naar `0146` — en kan niet weten of zo'n
   *    vermelding bij dít bestand hoort of bij de ander met hetzelfde nummer.
   *    Bij een botsing is de hernoeming dus wél de goede, maar de verwijzingen
   *    zijn dat niet noodzakelijk. De CLI waarschuwt daarvoor; deze vlag draagt
   *    hem.
   */
  it('meldt dat het nummer gedeeld is wanneer je met een bestandsnaam kiest', () => {
    expect(kiesBron('0146_van_mij.sql', twee).gedeeld).toBe(true);
  });

  it('meldt niets gedeelds wanneer het nummer uniek is', () => {
    expect(kiesBron('0147_iets.sql', twee).gedeeld).toBe(false);
  });

  it('weigert een nummer dat er niet is', () => {
    const uit = kiesBron('0199', twee);
    expect(uit.ok).toBe(false);
    expect(uit.reden).toBe('bron_ontbreekt');
  });
});

describe('beoordeelHernummering', () => {
  /**
   * ⚠️ **De nummers hier liggen met opzet boven alles wat ooit bestaat, en dat
   *    is een gerepareerde fout.** In de eerste versie droegen deze regels een
   *    nummer dat óók een echte migratie was. Toen ik dit script heen en terug
   *    draaide om het geheel te bewijzen, herschreef het ze — terecht, want een
   *    viercijferig nummer is van een verwijzing niet te onderscheiden.
   *
   *    ⚠️ **En daarmee is een eigenschap van het gereedschap zichtbaar geworden
   *    die het vermelden waard is: heen en terug is niet symmetrisch zodra de
   *    tekst het doelnummer zélf al noemt.** De heenweg maakt er dan twee van
   *    dezelfde soort, en de terugweg kan ze niet meer uit elkaar houden. Dat is
   *    geen defect maar de grens van wat een tekstvervanging kan weten — en
   *    precies waarom de CLI elke vervanging met bestand en regelnummer afdrukt.
   *
   *    Een verzonnen voorbeeld hoort dus een nummer te dragen dat nooit een
   *    echte migratie wordt. `099x` is dat.
   */
  const basis = {
    van: '0134',
    naar: '0998',
    aanwezig: ['0134', '0135'],
    perBranch: {},
    register: ['0131'],
  };

  it('laat een geldige hernummering door', () => {
    expect(beoordeelHernummering(basis).ok).toBe(true);
  });

  it.each([
    ['vorm', { van: '134', naar: '0998' }],
    ['gelijk', { van: '0134', naar: '0134' }],
    ['bron_ontbreekt', { van: '0997', naar: '0998' }],
    ['doel_bezet', { van: '0134', naar: '0135' }],
  ])('weigert met reden %s', (reden, patch) => {
    const uit = beoordeelHernummering({ ...basis, ...patch });
    expect(uit.ok).toBe(false);
    expect(uit.reden).toBe(reden);
  });

  /** Een doel dat elders al vergeven is, botst opnieuw zodra die branch landt. */
  it('weigert een doelnummer dat een andere branch al draagt', () => {
    const uit = beoordeelHernummering({
      ...basis,
      perBranch: { 'origin/iets-anders': 998 },
    });
    expect(uit.ok).toBe(false);
    expect(uit.reden).toBe('doel_bezet_elders');
    expect(uit.uitleg).toContain('origin/iets-anders');
  });

  /**
   * ⚠️ **De enige toets die schade voorkomt in plaats van gedoe.** Staat de
   *    migratie al op productie, dan maakt `git mv` de map onverenigbaar met wat
   *    er draait — QS8-122 en QS8-237.
   */
  it('weigert een bron die al op productie staat', () => {
    const uit = beoordeelHernummering({ ...basis, register: ['0131', '0134'] });
    expect(uit.ok).toBe(false);
    expect(uit.reden).toBe('bron_toegepast');
  });

  /**
   * ⚠️ **Ongemeten is hier niet hetzelfde als veilig.** Zou dit doorlaten, dan is
   *    de grendel hierboven precies uit in de omgeving waar hij het hardst nodig
   *    is: een cloudsessie zonder credentials.
   */
  it('weigert als het register niet gelezen kon worden', () => {
    const uit = beoordeelHernummering({ ...basis, register: null });
    expect(uit.ok).toBe(false);
    expect(uit.reden).toBe('register_ongemeten');
  });
});

/**
 * ⚠️ **De ijking tegen de werkelijkheid, en de test die een miskalibratie ving.**
 *
 * De eerste versie van `kopNummer()` eiste de volledige vorm `NNNN_naam.sql`.
 * Die is groen op elk verzonnen voorbeeld hierboven — en meldde **vijftien**
 * gezonde migraties zodra hij de echte map zag, want er zijn twee legitieme
 * kopstijlen.
 *
 * CLAUDE.md: een controle die je niet kunt voeden, kun je niet ijken. Deze test
 * voedt hem alles wat er is.
 */
describe('de echte migratiemap', () => {
  const MAP = join(process.cwd(), 'supabase', 'migrations');
  const bestanden = readdirSync(MAP).filter((n) => n.endsWith('.sql'));

  it('bevat migraties om te toetsen', () => {
    expect(bestanden.length).toBeGreaterThan(100);
  });

  it('heeft in élke migratie een kop die zijn eigen nummer noemt', () => {
    const fout = bestanden.filter(
      (naam) => !kopKlopt(naam, readFileSync(join(MAP, naam), 'utf8')),
    );

    expect(fout, `deze koppen noemen hun eigen nummer niet: ${fout.join(', ')}`).toEqual([]);
  });

  it('heeft in élke migratie een leesbare bestandsnaam', () => {
    expect(bestanden.filter((n) => basisUit(n) === null)).toEqual([]);
  });
});
