import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `letterversies.test.ts`.
import {
  bestandenVoor,
  NIET_PER_HELFT_TE_METEN,
  registersleutel,
  registervormKlachten,
  verzoenRegister,
  kloptDeBestemming,
  faalnamen,
  leesUitkomst,
  magHierDraaien,
  weegDrift,
  weegTegenBaseline,
  verdachtePolicies,
  herstelSql,
  beoordeelHerstel,
  SPOORVERSIE,
  ontleedPolicies,
  oordeel,
  verzwakSql,
  conjunctenVan,
  ontleedEenheid,
  helftenVan,
} from '../../scripts/rls-dekking.mjs';

/**
 * IJking van het dekkingsinstrument — QS8-185.
 *
 * ⚠️ **Dit script beweert iets over de kwaliteit van de testsuite, en dus moet
 *    het zelf onder test.** Een meetinstrument dat "alles is bewaakt" zegt omdat
 *    het de policy nooit echt heeft opengezet, is erger dan geen instrument: het
 *    geeft een gerustheid waar niets onder zit.
 *
 * ⚠️ **De gevaarlijke kant is hier `herstelSql`.** Dit script muteert een échte
 *    database. Zet hij een policy verkeerd terug, dan staat er een gat open dat
 *    niemand ziet — en dat gat lijkt op werk dat af is. Vandaar dat de heen- en
 *    terugweg allebei los onder test staan, inclusief een policy die alleen een
 *    `with check` heeft en een naam met een aanhalingsteken erin.
 *
 * IJKING — met de hand gedraaid op 01-09-2026:
 *
 *   A  `verzwakSql` het `with check`-deel laten weglaten   → 4 rood
 *   B  `herstelSql` `using (true)` laten teruggeven        → 4 rood
 *   C  `bestandenVoor` een lege lijst laten teruggeven     → 1 rood
 *   D  `oordeel` groen als bewaakt lezen                   → 2 rood
 *   E  de veldtoets uit `ontleedPolicies`                  → 1 rood
 *   F  de hosttoets uit `magHierDraaien`                   → 3 rood
 *   G  de databasenaamtoets                                → 1 rood
 *
 * Na de security-review van 01-09 erbij. H tot en met L horen bij bevindingen die
 * met een meting zijn aangetoond, niet met een redenering:
 *
 *   H  de loopback-toets uit `magHierDraaien`               → 4 rood
 *   I  de poorttoets                                        → 1 rood
 *   J  de nameting op het adres (`kloptDeBestemming`)       → 2 rood
 *   K  `verdachtePolicies` alleen naar `using` laten kijken → 1 rood
 *   L  de nul-tests-toets uit `leesUitkomst`                → 2 rood
 *
 * Ronde 9 (10-09-2026) — de reparatie van "een rood is niet vanzelf jouw rood".
 * Elke grendel apart gemuteerd, en elke keer is nagekeken dat het de test is die
 * die grendel bij naam nóemt die rood wordt:
 *
 *   Q  `faalnamen` een lege lijst laten teruggeven          → 4 rood
 *   R  de naamloos-rood-toets uit `leesUitkomst`            → 1 rood
 *   S  `weegTegenBaseline` de uitslag ongemoeid laten       → 2 rood
 *   T  `weegTegenBaseline` áltijd laten terugzetten         → 2 rood
 *   U  `weegDrift` de bevindingen ongemoeid laten           → 2 rood
 *   V  `weegDrift` élke bewaakt-bevinding laten vallen      → 1 rood
 *   Y  de instortingstoets op het rode pad                  → 1 rood
 *   Z  élk gefaald bestand als instorting tellen           → 1 rood (must-allow)
 *
 * ⚠️ Z is geen verzonnen mutatie: dát is precies de fout die op 10-09 gemerged
 *    is. De toets vergeleek `numFailedTestSuites` met een aantal béstanden,
 *    terwijl dat veld `describe`-blokken telt — waardoor élke meting terugkwam
 *    als `onbruikbaar`. Sinds 11-09 staat die kant onder test.
 *
 * En in `tests/rls/halfslot-update.test.ts` staan W en X: de vier `using`-helften
 * die hier eerst als "niet te meten" in het register stonden.
 */

const rij = JSON.stringify([
  {
    tabel: 'goals',
    naam: 'goals_select',
    cmd: 'r',
    // ⚠️ Met een nieuwe regel én een pijp erin: dat is hoe Postgres een policy
    //    opmaakt, en het is precies waar de eerste versie van dit script op
    //    stukliep (`approval_withdrawals_select`).
    qual: '(owner_id = auth.uid())\n  OR is_group_member(group_id)',
    wcheck: '',
    recht: true,
  },
]);

describe('ontleedPolicies', () => {
  it('leest een uitdrukking met nieuwe regels en pijpen heel in', () => {
    const p = ontleedPolicies(rij)[0];

    expect(p.qual).toContain('\n');
    expect(p.naam).toBe('goals_select');
  });

  it('valt niet om op een lege lijst', () => {
    expect(ontleedPolicies('[]')).toEqual([]);
  });

  /** ⚠️ Een halve rij is een fout en geen lege policy — zie `kolomrechten`. */
  it.each([
    ['een veld dat mist', '[{"tabel":"goals","naam":"x","cmd":"r","recht":true}]'],
    ['`recht` dat mist', '[{"tabel":"g","naam":"x","cmd":"r","qual":"a","wcheck":"","recht":null}]'],
    ['geen lijst', '{"tabel":"goals"}'],
  ])('gooit op %s', (_naam, json) => {
    expect(() => ontleedPolicies(json)).toThrow();
  });
});

describe('registervormKlachten met conjuncten', () => {
  const rij = { reden: 'r', wordtToetsbaarAls: 'w', staatIn: 's' };

  it('laat een sleutel met een conjunctnummer toe', () => {
    expect(registervormKlachten({ 't.p.check#2': rij })).toEqual([]);
  });

  /** ⚠️ `check#x` zou anders stil een rij registreren die nooit gevonden wordt. */
  it('klaagt over een conjunctnummer dat geen getal is', () => {
    expect(registervormKlachten({ 't.p.check#x': rij })).toEqual([
      '`t.p.check#x` noemt conjunct `x`, en dat is geen getal',
    ]);
  });

  it('klaagt nog steeds over een helft die niet bestaat', () => {
    expect(registervormKlachten({ 't.p.wat#1': rij })).toEqual([
      '`t.p.wat#1` noemt helft `wat` en niet `using` of `check`',
    ]);
  });
});

describe('conjunctenVan', () => {
  /** ⚠️ De vorm die dit hele issue opleverde — QS8-550. */
  it('splitst een top-level conjunctie', () => {
    expect(conjunctenVan('(sender_id = auth.uid()) AND is_group_member(group_id)')).toEqual([
      '(sender_id = auth.uid())',
      'is_group_member(group_id)',
    ]);
  });

  it('splitst er ook drie', () => {
    expect(conjunctenVan('(a) AND (b) AND (c)')).toEqual(['(a)', '(b)', '(c)']);
  });

  /**
   * ⚠️⚠️ **De helft die hij met rust moet laten, en die is hier de moeilijkste.**
   *    📏 Een naïeve `split(' AND ')` telde in dit schema **50** conjuncties waar
   *    er **35** zijn: elke `exists (… where a AND b)` en elke join-voorwaarde
   *    telde mee. Zo'n `and` is geen aparte grendel maar een deel van één
   *    uitdrukking, en los openzetten zou een SQL-fout geven in plaats van een
   *    meting.
   */
  it('splitst niet binnen een subquery', () => {
    const e = 'EXISTS ( SELECT 1 FROM goals g WHERE ((g.id = c.goal_id) AND (g.owner_id = auth.uid())))';

    expect(conjunctenVan(e)).toEqual([e]);
  });

  /**
   * ⚠️ **Hier stond eerst `((a AND b))` met `['a AND b']` als verwachting, en
   *    die was fout — niet de code.** Na het wegstrijken van het omhulsel ís dat
   *    gewoon een top-level conjunctie. Het geval dat de bedoeling wél dekt is
   *    een `and` binnen een functieaanroep: die is geen aparte grendel.
   */
  it('splitst niet binnen een functieaanroep', () => {
    expect(conjunctenVan('mag_lezen(a AND b)')).toEqual(['mag_lezen(a AND b)']);
  });

  /** ⚠️ Een enkelvoudige uitdrukking is één conjunct, geen nul. */
  it('geeft een enkelvoudige uitdrukking als één deel terug', () => {
    expect(conjunctenVan('is_group_member(group_id)')).toEqual(['is_group_member(group_id)']);
  });

  /**
   * ⚠️ **`(a) AND (b)` begint en eindigt met een haakje, maar die twee horen
   *    niet bij elkaar.** Blind strippen maakt er `a) AND (b` van.
   */
  it('strijkt alleen haakjes weg die de héle uitdrukking omsluiten', () => {
    expect(conjunctenVan('((a) AND (b))')).toEqual(['(a)', '(b)']);
  });

  /** ⚠️ Een `OR` is geen conjunct: daar dekt het geheel niet af wat een deel doet. */
  it('splitst niet op OR', () => {
    expect(conjunctenVan('(a) OR (b)')).toEqual(['(a) OR (b)']);
  });
});

describe('ontleedEenheid', () => {
  it('leest een kale helft', () => {
    expect(ontleedEenheid('using')).toEqual({ helft: 'using', index: null });
  });

  it('leest een helft met conjunctnummer', () => {
    expect(ontleedEenheid('check#2')).toEqual({ helft: 'check', index: 2 });
  });
});

describe('helftenVan met conjuncten', () => {
  /**
   * ⚠️ **Een helft met één conjunct houdt zijn kale naam**, zodat de
   *    registersleutels van zulke rijen niet verschuiven. 📏 Van de negen rijen
   *    in `NIET_PER_HELFT_TE_METEN` is er precies **één** een conjunctie.
   */
  it('laat een enkelvoudige helft ongemoeid', () => {
    expect(helftenVan({ qual: 'owner_id = x', wcheck: '' })).toEqual(['using']);
  });

  it('nummert de conjuncten van een samengestelde helft', () => {
    expect(helftenVan({ qual: '(a) AND (b)', wcheck: '' })).toEqual(['using#0', 'using#1']);
  });

  it('doet dat per helft apart', () => {
    expect(helftenVan({ qual: 'a', wcheck: '(b) AND (c)' })).toEqual([
      'using',
      'check#0',
      'check#1',
    ]);
  });
});

describe('verzwakSql', () => {
  it('zet een using-policy wagenwijd open', () => {
    expect(verzwakSql({ tabel: 'goals', naam: 'g_select', qual: 'owner_id = x', wcheck: '' })).toBe(
      'alter policy "g_select" on public."goals" using (true);',
    );
  });

  /** ⚠️ Een INSERT-policy heeft alléén een `with check` — die tak is de helft. */
  it('zet een with-check-policy open', () => {
    expect(verzwakSql({ tabel: 'goals', naam: 'g_insert', qual: '', wcheck: 'owner_id = x' })).toBe(
      'alter policy "g_insert" on public."goals" with check (true);',
    );
  });

  it('zet ze allebei open als ze er allebei zijn', () => {
    const sql = verzwakSql({ tabel: 'g', naam: 'p', qual: 'a', wcheck: 'b' });

    expect(sql).toContain('using (true)');
    expect(sql).toContain('with check (true)');
  });

  /**
   * ⚠️⚠️ **Dit is de mutatie die QS8-550 blootlegde.** Alleen de eigenaarshelft
   *    op `true`, de rest blijft staan — en dát liet 2094 tests groen terwijl
   *    elk groepslid het bericht van elk ander kon wissen. Wagenwijd openzetten
   *    vond het gat níét, want dan valt ook het archiefdeel weg en dát is wel
   *    getoetst.
   */
  it('vervangt één conjunct en laat de rest staan', () => {
    const policy = { tabel: 'chat_messages', naam: 'cm_delete', qual: '(sender_id = u) AND is_lid(g)', wcheck: '' };

    expect(verzwakSql(policy, 'using#0')).toBe(
      'alter policy "cm_delete" on public."chat_messages" using (true AND is_lid(g));',
    );
    expect(verzwakSql(policy, 'using#1')).toBe(
      'alter policy "cm_delete" on public."chat_messages" using ((sender_id = u) AND true);',
    );
  });

  /** ⚠️ Een nummer dat niet bestaat is een fout in de aanroeper, geen stille no-op. */
  it('werpt op een conjunct die niet bestaat', () => {
    expect(() =>
      verzwakSql({ tabel: 't', naam: 'p', qual: '(a) AND (b)', wcheck: '' }, 'using#5'),
    ).toThrow(/conjunct 5 bestaat niet/);
  });

  /** ⚠️ Een policy zonder uitdrukking valt niet te verzwakken — en dat is geen fout. */
  it('geeft null als er niets open te zetten valt', () => {
    expect(verzwakSql({ tabel: 'g', naam: 'p', qual: '', wcheck: '' })).toBeNull();
  });
});

describe('herstelSql', () => {
  it('zet de oorspronkelijke uitdrukking terug', () => {
    expect(herstelSql({ tabel: 'goals', naam: 'g_select', qual: 'owner_id = x', wcheck: '' })).toBe(
      'alter policy "g_select" on public."goals" using (owner_id = x);',
    );
  });

  it('zet beide helften terug', () => {
    const sql = herstelSql({ tabel: 'g', naam: 'p', qual: 'a', wcheck: 'b' });

    expect(sql).toBe('alter policy "p" on public."g" using (a) with check (b);');
  });

  /**
   * ⚠️ **Heen en terug moeten elkaars spiegel zijn**, anders blijft er een gat
   *    open na een meting. Dit is de eigenschap die het instrument veilig maakt.
   */
  it.each([
    ['alleen using', { tabel: 'g', naam: 'p', qual: 'a = 1', wcheck: '' }],
    ['alleen with check', { tabel: 'g', naam: 'p', qual: '', wcheck: 'b = 2' }],
    ['allebei', { tabel: 'g', naam: 'p', qual: 'a = 1', wcheck: 'b = 2' }],
  ])('%s: de terugweg noemt precies dezelfde helften als de heenweg', (_naam, policy) => {
    const open = verzwakSql(policy) ?? '';
    const terug = herstelSql(policy) ?? '';

    expect(open.includes('using')).toBe(terug.includes('using'));
    expect(open.includes('with check')).toBe(terug.includes('with check'));
    expect(terug).not.toContain('(true)');
  });

  it('kwoot een naam met een aanhalingsteken erin', () => {
    expect(herstelSql({ tabel: 'g', naam: 'raar"naam', qual: 'a', wcheck: '' })).toContain(
      '"raar""naam"',
    );
  });
});

describe('bestandenVoor', () => {
  const bestanden = [
    { naam: 'a.test.ts', inhoud: "from('goals')" },
    { naam: 'b.test.ts', inhoud: "from('groups')" },
  ];

  it('kiest de bestanden die de tabel noemen', () => {
    expect(bestandenVoor('goals', bestanden)).toEqual(['a.test.ts']);
  });

  /**
   * ⚠️ **Noemt niemand de tabel, dan draait álles.** Dat is met opzet de dure
   *    kant: zou dit een lege lijst teruggeven, dan draait er geen enkele test,
   *    wordt er niets rood, en meldt het instrument "onbewaakt" over een policy
   *    die misschien prima gedekt is. Een instrument dat bij twijfel de
   *    beschuldigende kant op valt, leer je te negeren.
   */
  it('draait alles als niemand de tabel noemt', () => {
    expect(bestandenVoor('nergens', bestanden)).toEqual(['a.test.ts', 'b.test.ts']);
  });
});

describe('oordeel', () => {
  const policy = { tabel: 'g', naam: 'p', cmd: 'r', qual: 'a', wcheck: '' };

  it('noemt een policy bewaakt als er iets rood werd', () => {
    expect(oordeel(policy, 'rood').status).toBe('bewaakt');
  });

  /** ⚠️ Groen ná het openzetten betekent: niemand mist deze policy. */
  it('noemt een policy onbewaakt als alles groen bleef', () => {
    const uit = oordeel(policy, 'groen');

    expect(uit.status).toBe('onbewaakt');
    expect(uit.melding).toContain('geen enkele test werd rood');
  });

  it('houdt een policy zonder uitdrukking apart', () => {
    expect(oordeel(policy, 'onverzwakbaar').status).toBe('geen-uitdrukking');
  });
});


/**
 * ⚠️ **Het slot dat er het langst niet was.** Dit script zet elke policy om
 *    beurten wagenwijd open. Op de lokale stack is dat een meting; ergens anders
 *    is het een gat dat blijft staan zolang de run duurt — en langer als hij
 *    afbreekt. De kop van het script waarschuwde daarvoor, en een waarschuwing
 *    is geen slot: `PGHOST` naar het echte project wijzen was genoeg.
 *
 * ⚠️ **Een allowlist en geen blocklist.** "Is dit niet productie" is niet te
 *    beantwoorden; "is dit onmiskenbaar mijn eigen machine" wel. Daarom staan
 *    hier ook de gevallen die er níet doorheen horen te komen zónder dat iemand
 *    ze had bedacht.
 */
describe('magHierDraaien', () => {
  const goed = { host: 'localhost', poort: '5433', db: 'goalbuddies_rls', doel: 'lokaal' };

  it.each([['localhost'], ['127.0.0.1'], ['::1']])('laat %s door', (host) => {
    expect(magHierDraaien({ ...goed, host }).ok).toBe(true);
  });

  /**
   * ⚠️ **Hier stond een tak die de omweg goedkeurde.** De eerste versie liet een
   *    lege of ontbrekende `PGHOST` door "want dat is een unix-socket". Gemeten:
   *    `env -u PGHOST PGHOSTADDR=127.0.0.1 psql …` maakt dan een TCP-verbinding
   *    naar een willekeurig adres. De ijking legde die omweg vast als gewenst
   *    gedrag, dus de mutatie op de hosttoets werd rood terwijl de grendel die
   *    hij beweerde te bewaken er niet was — precies de val die CLAUDE.md
   *    beschrijft. Het script legt de bestemming nu op in plaats van hem af te
   *    leiden, dus `undefined` bestaat hier niet meer.
   */
  it.each([
    ['het echte project', 'db.wehgocadxehottiiyvsc.supabase.co'],
    ['een ip dat erop lijkt', '127.0.0.1.kwaadaardig.nl'],
    ['een lege host', ''],
    ['geen host', undefined],
  ])('weigert %s', (_naam, host) => {
    const uit = magHierDraaien({ ...goed, host });

    expect(uit.ok).toBe(false);
    expect(uit.reden).toContain('loopback');
  });

  it('weigert een andere poort', () => {
    expect(magHierDraaien({ ...goed, poort: '5432' }).reden).toContain('5433');
  });

  it('weigert zonder RLS_DOEL=lokaal', () => {
    expect(magHierDraaien({ ...goed, doel: undefined }).ok).toBe(false);
  });

  it('weigert een andere databasenaam', () => {
    expect(magHierDraaien({ ...goed, db: 'postgres' }).reden).toContain('postgres');
  });
});

/**
 * ⚠️ **De tweede helft van het slot, en zonder haar is de eerste een vrome wens.**
 *    libpq kiest zijn bestemming óók uit `PGHOSTADDR`, `PGSERVICE` en
 *    `PGSERVICEFILE`, en die staan buiten elke lijst die je vooraf opschrijft.
 *    `magHierDraaien` toetst wat we van plan zijn; dit toetst waar we uitkwamen.
 */
describe('kloptDeBestemming', () => {
  const goed = { adres: '127.0.0.1', poort: 5433, database: 'goalbuddies_rls' };

  it('laat de lokale stack door', () => {
    expect(kloptDeBestemming(goed).ok).toBe(true);
  });

  it.each([
    ['een ander adres', { adres: '10.0.0.5' }],
    ['een unix-socket, want dan weten we niet waarheen', { adres: 'unix-socket' }],
    ['een andere poort', { poort: 5432 }],
    ['een andere database', { database: 'postgres' }],
  ])('weigert %s', (_naam, afwijking) => {
    expect(kloptDeBestemming({ ...goed, ...afwijking }).ok).toBe(false);
  });
});

/**
 * ⚠️ **De toets die op dezelfde gegevens werkt als de lus.** De eerste versie las
 *    de policies ín, herstelde daarna pas wat een afgebroken run had laten
 *    liggen, en vroeg de database vervolgens of er nog iets openstond. Dat
 *    antwoord was "nee" terwijl de lijst in het geheugen het gat nog droeg — en
 *    aan het eind van die beurt zette de lus hem "terug" naar `true`.
 */
describe('verdachtePolicies', () => {
  it('vindt een policy die als `true` is ingelezen', () => {
    expect(
      verdachtePolicies([
        { tabel: 'g', naam: 'p', qual: 'owner_id = x', wcheck: '' },
        { tabel: 'g', naam: 'q', qual: '', wcheck: 'true' },
      ]),
    ).toEqual(['g.q']);
  });

  /** ⚠️ Béide helften — een INSERT-policy heeft alléén een `with check`. */
  it('vindt hem ook aan de using-kant', () => {
    expect(verdachtePolicies([{ tabel: 'g', naam: 'p', qual: 'true', wcheck: '' }])).toEqual(['g.p']);
  });

  it('laat een gewone policy met rust', () => {
    expect(verdachtePolicies([{ tabel: 'g', naam: 'p', qual: 'a = 1', wcheck: 'b = 2' }])).toEqual([]);
  });
});

/**
 * Een vitest-uitslag zoals de json-reporter hem opmaakt: een telling én de
 * gefaalde tests bij naam. Sinds ronde 9 hangt het oordeel aan die namen.
 */
const roodInBestand = (
  bestand: string,
  namen: string[],
  extra: Record<string, number> = {},
): string =>
  JSON.stringify({
    numTotalTests: 100,
    numPendingTests: 0,
    numFailedTests: namen.length,
    numFailedTestSuites: 1,
    testResults: [
      {
        name: `/home/user/GoalBuddies/tests/rls/${bestand}`,
        assertionResults: namen.map((fullName) => ({ status: 'failed', fullName })),
      },
    ],
    ...extra,
  });

const rood = (namen: string[], extra: Record<string, number> = {}): string =>
  roodInBestand('avatarbucket.test.ts', namen, extra);

/**
 * Een run waarin `omgevallen` bestanden in `beforeAll` sneuvelden en `namen` de
 * asserties zijn die écht faalden.
 *
 * ⚠️ **De vorm is nagemeten en niet verzonnen** (11-09-2026): een bestand dat in
 *    `beforeAll` werpt komt terug als een `testResults`-entry met
 *    `status: 'failed'` en **nul** gefaalde asserties. Dát is het signaal;
 *    `numFailedTestSuites` is het niet, want dat veld telt `describe`-blokken —
 *    één bestand met zeven blokken geeft er acht.
 */
const metInstorting = (namen: string[], omgevallen: string[]): string =>
  JSON.stringify({
    numTotalTests: 813,
    numPendingTests: 600,
    numFailedTests: namen.length,
    numFailedTestSuites: omgevallen.length + namen.length,
    testResults: [
      {
        name: '/x/tests/rls/avatarbucket.test.ts',
        status: namen.length > 0 ? 'failed' : 'passed',
        assertionResults: namen.map((fullName) => ({ status: 'failed', fullName })),
      },
      ...omgevallen.map((bestand) => ({
        name: `/x/tests/rls/${bestand}`,
        status: 'failed',
        assertionResults: [{ status: 'passed', fullName: 'kwam er nooit aan toe' }],
      })),
    ],
  });

/**
 * ⚠️ **"Bewaakt" mag niet betekenen "er ging íets mis".** De eerste versie las elke
 *    niet-nul exitcode als bewaakt — ook een startup-error, een dichte PostgREST
 *    of geheugen op. Dat schuift een policy van onbewaakt naar bewaakt, en die
 *    richting is de geruststellende.
 */
describe('leesUitkomst', () => {
  const json = (o: object): string => JSON.stringify(o);

  it('noemt een gefaalde assertie rood', () => {
    expect(leesUitkomst(rood(['x'], { numTotalTests: 10 })).uitkomst).toBe('rood');
  });

  it('noemt een volledig groene run groen', () => {
    expect(leesUitkomst(json({ numTotalTests: 10, numFailedTests: 0 })).uitkomst).toBe('groen');
  });

  it.each([
    ['er geen enkele test draaide', json({ numTotalTests: 0, numFailedTests: 0 })],
    ['alles overgeslagen werd', json({ numTotalTests: 5, numPendingTests: 5, numFailedTests: 0 })],
    ['de uitvoer geen JSON is', 'FATAL: kon niet starten'],
    ['er bestanden omvielen zonder één gefaalde assertie', metInstorting([], ['reeks.test.ts'])],
  ])('noemt het onbruikbaar als %s', (_naam, uit) => {
    expect(leesUitkomst(uit).uitkomst).toBe('onbruikbaar');
  });

  /**
   * ⚠️ **De cijfers hierboven zijn geen verzinsel.** 813/687/0/58 is letterlijk
   *    wat vitest teruggaf op 03-09 nadat de omgeving Postgres en PostgREST onder
   *    een lopende meting had weggehaald. Zonder deze toets heette elke policy in
   *    dat deel van de run "onbewaakt" — het instrument verzon gaten.
   *
   * ⚠️ **En de tegenkant hoort erbij**, want een toets die te veel wegstuurt is
   *    net zo stuk: bij een écht onbewaakte policy draait de suite gewoon door en
   *    valt er geen bestand om. Die uitslag moet groen blijven, anders kost deze
   *    reparatie elke geldige meting.
   */
  it('houdt een groene run groen als er geen bestand omviel', () => {
    expect(leesUitkomst(metInstorting([], [])).uitkomst).toBe('groen');
  });

  it('laat een gefaalde assertie rood ook als er bestanden omvielen', () => {
    // Het normale geval bij een bewáákte policy: de tests die hem toetsen falen,
    // en hun bestand telt daarmee als gefaald. Dat mag geen `onbruikbaar` worden.
    //
    // ⚠️ De drie asserties zitten in één bestand en er is één gefaald bestand.
    //    Dat *moet* kloppen sinds grendel Y hieronder: stond er `2`, dan viel er
    //    een bestand om waarin niets getoetst werd, en dan is dit geen bewijs
    //    meer maar een instorting. Hier stond eerst `2`, en die opstelling kon
    //    in werkelijkheid niet bestaan.
    expect(leesUitkomst(metInstorting(['a', 'b', 'c'], [])).uitkomst).toBe('rood');
  });

  /**
   * ⚠️ **Grendel R.** Vanaf ronde 9 is de náám van de gefaalde test het bewijs,
   *    en niet de telling. Komt er een telling zonder namen uit, dan is de vraag
   *    van `weegTegenBaseline()` niet te stellen en is er geen oordeel — dat is
   *    iets anders dan een gunstig oordeel.
   */
  it('noemt een telling zonder namen onbruikbaar', () => {
    expect(leesUitkomst(json({ numTotalTests: 10, numFailedTests: 3 })).uitkomst).toBe(
      'onbruikbaar',
    );
  });

  /**
   * ⚠️⚠️ **Grendel Y — de rode kant van dezelfde instorting.** De toets op
   *    `numFailedTestSuites` stond alleen op het gróéne pad, en dekte dus alleen
   *    de kant waar het instrument gaten verzint. 📏 Gevoerd met het echte geval
   *    van 03-09 — 813 tests, 600 niet gedraaid, 58 bestanden om — plus één
   *    losse gefaalde assertie kwam er `bewaakt` uit. Dat is de geruststellende
   *    kant, en die is de gevaarlijke.
   */
  it('noemt een half ingestorte run onbruikbaar, ook met een gefaalde assertie erin', () => {
    expect(
      leesUitkomst(metInstorting(['de reeks loopt door'], ['epic8.test.ts', 'reeks.test.ts']))
        .uitkomst,
    ).toBe('onbruikbaar');
  });

  /**
   * ⚠️ **De must-allow, en zonder hem kost grendel Y élke geldige meting.** Bij
   *    een écht bewaakte policy is elk gefaald bestand er één mét een gefaalde
   *    assertie — dan zijn de twee getallen gelijk en blijft de uitslag rood.
   */
  it('houdt een rood uit twee bestanden met elk een gefaalde assertie gewoon rood', () => {
    const uit = JSON.stringify({
      numTotalTests: 813,
      numPendingTests: 0,
      numFailedTests: 2,
      numFailedTestSuites: 2,
      testResults: [
        {
          name: '/x/tests/rls/eigenaarschap.test.ts',
          assertionResults: [{ status: 'failed', fullName: 'een ander hernoemt je doel niet' }],
        },
        {
          name: '/x/tests/rls/schrijfgrenzen.test.ts',
          assertionResults: [{ status: 'failed', fullName: 'een ander past je naam niet aan' }],
        },
      ],
    });

    expect(leesUitkomst(uit).uitkomst).toBe('rood');
  });
});

/**
 * ⚠️⚠️ **De reparatie van ronde 9, en de meting die eronder ligt.**
 *
 *    📏 10-09-2026, op één commit, zonder één policy aan te raken:
 *    `rls:dekking -- profiles` gaf `1 van de 3` met beide helften van
 *    `profiles_update` als gat. Daarna is in `dagtellers` de rij
 *    `avatars/uploader/tmp` van 6 op 10 gezet — precies wat vier gewone
 *    suiteruns opleveren, want die sleutel is een lettérlijke `tmp` en een
 *    `delete` haalt hem er niet af — en dezelfde meting gaf **`3 van de 3`**,
 *    mét de eis om de twee registerrijen wég te halen die die gaten vastleggen.
 *
 *    Dat is de fout die ik in ronde 9 zelf gemaakt heb: op grond van zo'n
 *    uitslag twee terechte rijen verwijderd.
 */
describe('faalnamen', () => {
  it('noemt elke gefaalde test met zijn bestand erbij', () => {
    expect(faalnamen(JSON.parse(rood(['valt niet om op een map die geen uuid is'])))).toEqual([
      'avatarbucket.test.ts > valt niet om op een map die geen uuid is',
    ]);
  });

  // ⚠️ De must-allow-helft: een geslaagde test is geen bewijs en hoort er niet in.
  it('laat een geslaagde test buiten de lijst', () => {
    const uit = {
      testResults: [
        {
          name: '/x/tests/rls/eigenaarschap.test.ts',
          assertionResults: [
            { status: 'passed', fullName: 'gaat goed' },
            { status: 'failed', fullName: 'gaat mis' },
          ],
        },
      ],
    };

    expect(faalnamen(uit)).toEqual(['eigenaarschap.test.ts > gaat mis']);
  });

  it('valt niet om op een uitslag zonder bestanden', () => {
    expect(faalnamen({})).toEqual([]);
  });
});

describe('weegTegenBaseline', () => {
  const uitslag = (namen: string[]) => ({ uitkomst: 'rood', gedraaid: 100, rood: namen });

  /**
   * ⚠️ **Grendel S — het geval van 10-09 zelf.** De dagteller stond al vol, dus
   *    dezelfde test was rood vóórdat de policy openging. Dat bewijst niets over
   *    de policy.
   */
  it('gelooft een rood niet als die test vooraf al rood stond', () => {
    const gewogen = weegTegenBaseline(uitslag(['avatarbucket.test.ts > geen uuid']), [
      'avatarbucket.test.ts > geen uuid',
    ]);

    expect(gewogen.uitkomst).toBe('groen');
    expect(gewogen.alRood).toEqual(['avatarbucket.test.ts > geen uuid']);
  });

  /**
   * ⚠️ **Grendel T — de must-allow-helft, en die is hier het zwaarst.** Een
   *    weging die álles wegstreept, meldt elke bewaakte policy als gat: dan
   *    verzint het instrument werk in plaats van het te verzwijgen. Zeventig van
   *    de honderdtwee helften hangen hieraan.
   */
  it('laat een rood staan dat er vooraf niet was', () => {
    const gewogen = weegTegenBaseline(
      uitslag(['eigenaarschap.test.ts > je maakt geen doel op andermans naam']),
      ['avatarbucket.test.ts > geen uuid'],
    );

    expect(gewogen.uitkomst).toBe('rood');
    expect(gewogen.rood).toEqual(['eigenaarschap.test.ts > je maakt geen doel op andermans naam']);
  });

  it('houdt alleen het nieuwe rood over als er van beide iets is', () => {
    const gewogen = weegTegenBaseline(uitslag(['a > oud', 'b > nieuw']), ['a > oud']);

    expect(gewogen.rood).toEqual(['b > nieuw']);
  });

  it('laat een groene uitslag met rust', () => {
    expect(weegTegenBaseline({ uitkomst: 'groen', rood: [] }, ['a > oud']).uitkomst).toBe('groen');
  });
});

describe('weegDrift', () => {
  const bewaakt = (rooi: string[]) => ({
    tabel: 'profiles',
    naam: 'profiles_update',
    helft: 'using',
    status: 'bewaakt',
    rood: rooi,
  });

  /**
   * ⚠️ **Grendel U.** De basislijn wordt vóór de eerste mutatie gemeten, maar
   *    een dagteller loopt tíjdens de run door: bij beurt één stond die test nog
   *    groen en bij beurt zeventien niet meer. Alleen de slotmeting vindt dat.
   */
  it('laat een bevinding vallen die alleen op een omgevallen test leunt', () => {
    const [uit] = weegDrift([bewaakt(['avatarbucket.test.ts > geen uuid'])], [
      'avatarbucket.test.ts > geen uuid',
    ]);

    expect(uit.status).toBe('ongemeten');
  });

  /**
   * ⚠️ **Grendel V — de must-allow-helft.** Wie er nog een ánder rood onder
   *    heeft, blijft bewaakt: dat rood stond bij de start niet aan en aan het
   *    eind ook niet, dus het is wél van deze policy.
   */
  it('houdt een bevinding overeind die nog een ander rood draagt', () => {
    const [uit] = weegDrift(
      [bewaakt(['avatarbucket.test.ts > geen uuid', 'schrijfgrenzen.test.ts > eigenaar'])],
      ['avatarbucket.test.ts > geen uuid'],
    );

    expect(uit.status).toBe('bewaakt');
    expect(uit.rood).toEqual(['schrijfgrenzen.test.ts > eigenaar']);
  });

  it('raakt een onbewaakte bevinding niet aan', () => {
    const onbewaakt = { ...bewaakt([]), status: 'onbewaakt' };

    expect(weegDrift([onbewaakt], ['a > x'])[0].status).toBe('onbewaakt');
  });
});

describe('het register van helften die per helft niet te meten zijn — QS8-262', () => {
  const bevinding = (tabel: string, naam: string, helft: string, status: string) => ({
    tabel,
    naam,
    helft,
    status,
  });

  const register = {
    'a.a_delete.using': { reden: 'r', wordtToetsbaarAls: 'v', staatIn: 'tests/rls/x.test.ts' },
  };
  const alle = [{ tabel: 'a', naam: 'a_delete' }];

  it('houdt een bekende helft uit de bevindingen', () => {
    // ⚠️ **De hele reden dat dit register bestaat.** Zonder deze regel meldt het
    //    instrument élke run dezelfde helft als gat, en een controle die altijd
    //    hetzelfde meldt leer je overslaan.
    const uit = verzoenRegister({
      bevindingen: [bevinding('a', 'a_delete', 'using', 'onbewaakt')],
      register,
      alle,
    });

    expect(uit.onbekend).toEqual([]);
    expect(uit.verklaard.map((b) => b.sleutel)).toEqual(['a.a_delete.using']);
  });

  it('meldt een helft die níet in het register staat gewoon als bevinding', () => {
    // ⚠️ De must-allow. Zonder deze regel is het register niet van "de controle
    //    uitzetten" te onderscheiden.
    const uit = verzoenRegister({
      bevindingen: [bevinding('a', 'a_delete', 'check', 'onbewaakt')],
      register,
      alle,
    });

    expect(uit.onbekend.map((b) => b.sleutel)).toEqual(['a.a_delete.check']);
    expect(uit.verklaard).toEqual([]);
  });

  it('meldt een rij die intussen wél bewaakt wordt', () => {
    // ⚠️ De ratel de andere kant op: een register dat blijft staan terwijl de
    //    helft bewaakt wordt, onderdrukt precies de melding waar hij voor bestond.
    const uit = verzoenRegister({
      bevindingen: [bevinding('a', 'a_delete', 'using', 'bewaakt')],
      register,
      alle,
    });

    expect(uit.verouderd.map((b) => b.sleutel)).toEqual(['a.a_delete.using']);
  });

  it('meldt een rij die naar een verdwenen policy wijst', () => {
    expect(verzoenRegister({ bevindingen: [], register, alle: [] }).verdwenen).toEqual([
      'a.a_delete.using',
    ]);
  });

  it('oordeelt niet over een helft die deze run niet gemeten heeft', () => {
    // ⚠️ **Een gefilterde run mag niets zeggen over wat buiten het filter valt.**
    //    `rls:dekking -- goals` zegt niets over `user_blocks`, en zou hij die rij
    //    als verouderd melden, dan haalde je een terechte aantekening weg op
    //    grond van een meting die nooit gedaan is.
    const uit = verzoenRegister({ bevindingen: [], register, alle });

    expect(uit.verouderd).toEqual([]);
    expect(uit.verdwenen).toEqual([]);
  });

  it('eist een terugkeervoorwaarde bij elke rij', () => {
    // Zelfde eis als `review:controle` aan een Laag-bevinding stelt, en om
    // dezelfde reden: wat je wegzet, zegt wanneer het terugkomt.
    const klachten = registervormKlachten({
      'a.a_delete.using': { reden: 'r', staatIn: 'tests/rls/x.test.ts' },
    });

    expect(klachten).toEqual(['`a.a_delete.using` mist `wordtToetsbaarAls`']);
  });

  it('weigert een sleutel die geen helft noemt', () => {
    expect(registervormKlachten({ 'a.a_delete': {} })).toContain(
      '`a.a_delete` is geen `tabel.policy.helft`',
    );
  });

  it('en het echte register klopt van vorm', () => {
    // ⚠️ Deze staat er zodat een nieuwe rij die een veld vergeet meteen opvalt,
    //    en niet pas bij de volgende run van een script dat minuten kost.
    expect(registervormKlachten(NIET_PER_HELFT_TE_METEN)).toEqual([]);
  });

  it('bouwt de sleutel uit tabel, policy en helft', () => {
    expect(registersleutel({ tabel: 'a', naam: 'a_delete', helft: 'using' })).toBe(
      'a.a_delete.using',
    );
  });
});

/**
 * De ijking van het herstelspoor — QS8-588.
 *
 * ⚠️⚠️ **De belofte is niet "hij zet terug" maar "hij zet niets terug wat
 *    intussen veranderd is".** `herstelWatOpenstond()` deed het eerste altijd en
 *    het tweede nooit: het spoor werd onvoorwaardelijk afgespeeld, dus wijzigde
 *    een migratie de policy tussen de afgebroken run en de volgende, dan schreef
 *    het herstel de pre-migratiedefinitie terug — bij `group_visible_streaks`
 *    een besluit onder A41, stilzwijgend.
 *
 * ⚠️ **De must-allows tellen hier zwaar.** Een beoordeling die alles weigert,
 *    maakt van elk afgebroken run een handmatige klus, en dan gooit de volgende
 *    persoon het spoor ongelezen weg — precies de handeling die dit moet
 *    voorkomen.
 */
describe('beoordeelHerstel — mag dit spoor afgespeeld worden?', () => {
  /** Een policy met twee conjuncten in `using` en een eigen `check`. */
  const POLICY = {
    tabel: 'goals',
    naam: 'goals_update',
    cmd: 'w',
    qual: '(owner_id = auth.uid()) AND (status <> \'archived\'::text)',
    wcheck: '(owner_id = auth.uid())',
    recht: true,
  };

  const spoor = (helft: string) => ({ versie: SPOORVERSIE, policy: POLICY, helft });

  describe('terugzetten — de gewone gang van zaken', () => {
    it('een conjunct staat nog open en de rest is ongemoeid', () => {
      const huidig = { qual: 'true AND (status <> \'archived\'::text)', wcheck: POLICY.wcheck };
      expect(beoordeelHerstel(spoor('using#0'), huidig).actie).toBe('terugzetten');
    });

    it('de tweede conjunct, want een index die niet nul is telt ook', () => {
      const huidig = { qual: '(owner_id = auth.uid()) AND true', wcheck: POLICY.wcheck };
      expect(beoordeelHerstel(spoor('using#1'), huidig).actie).toBe('terugzetten');
    });

    it('een hele helft die wagenwijd openstaat', () => {
      const huidig = { qual: POLICY.qual, wcheck: 'true' };
      expect(beoordeelHerstel(spoor('check'), huidig).actie).toBe('terugzetten');
    });
  });

  describe('weg — er valt niets terug te zetten', () => {
    it('de policy bestaat niet meer, en dan crasht de volgende run niet meer', () => {
      // ⚠️ Hiervóór wierp `psql` hierop, bleef het spoor liggen, en crashte élke
      //    volgende run tot iemand het bestand met de hand weggooide.
      const uitslag = beoordeelHerstel(spoor('using#0'), null);
      expect(uitslag.actie).toBe('weg');
      expect(uitslag.reden).toContain('bestaat niet meer');
    });

    it('de policy staat al terug zoals hij was', () => {
      const huidig = { qual: POLICY.qual, wcheck: POLICY.wcheck };
      expect(beoordeelHerstel(spoor('using#0'), huidig).actie).toBe('weg');
    });
  });

  describe('weigeren — en dan blijft het spoor liggen', () => {
    // ⚠️⚠️ **De scherpste van de reeks, en de reden dat dit issue bestaat.** Een
    //    migratie heeft de ándere helft gewijzigd; het spoor kent hem nog in zijn
    //    oude vorm. Terugzetten zou die migratie ongedaan maken.
    it('de onaangeraakte helft is veranderd — dat is een migratie geweest', () => {
      const huidig = {
        qual: 'true AND (status <> \'archived\'::text)',
        wcheck: '(owner_id = auth.uid()) AND (zichtbaarheid = \'open\'::text)',
      };
      const uitslag = beoordeelHerstel(spoor('using#0'), huidig);
      expect(uitslag.actie).toBe('weiger');
      expect(uitslag.reden).toContain('check');
    });

    it('de aangeraakte helft telt nu een conjunct meer', () => {
      const huidig = {
        qual: 'true AND (status <> \'archived\'::text) AND (deleted_at IS NULL)',
        wcheck: POLICY.wcheck,
      };
      expect(beoordeelHerstel(spoor('using#0'), huidig).actie).toBe('weiger');
    });

    it('een ándere conjunct is gewijzigd dan de conjunct die openstond', () => {
      const huidig = { qual: 'true AND (status <> \'draft\'::text)', wcheck: POLICY.wcheck };
      expect(beoordeelHerstel(spoor('using#0'), huidig).actie).toBe('weiger');
    });

    it('de conjunct die open hoorde te staan, staat dat niet', () => {
      const huidig = { qual: '(owner_id = auth.jwt()) AND (status <> \'archived\'::text)', wcheck: POLICY.wcheck };
      expect(beoordeelHerstel(spoor('using#0'), huidig).actie).toBe('weiger');
    });

    it('een hele helft die noch open noch de oude vorm is', () => {
      const huidig = { qual: POLICY.qual, wcheck: '(owner_id = auth.jwt())' };
      expect(beoordeelHerstel(spoor('check'), huidig).actie).toBe('weiger');
    });

    // ⚠️ Faalt dicht. Een spoor van vóór QS8-588 was de kale policy: geen
    //    versie, geen helft. Hij valt sinds QS8-604 op de versie, en daarvóór op
    //    de helft — deze toets droeg dus nooit de versietoets, zie hieronder.
    it('een spoor uit een oudere versie — de vorm die vandaag op schijf kan staan', () => {
      const uitslag = beoordeelHerstel(POLICY as never, { qual: 'true', wcheck: POLICY.wcheck });
      expect(uitslag.actie).toBe('weiger');
      expect(uitslag.reden).toContain('versie geen');
    });

    it('een spoor met de juiste versie maar zonder helft', () => {
      const kaal = { versie: SPOORVERSIE, policy: POLICY };
      expect(beoordeelHerstel(kaal as never, { qual: 'true', wcheck: POLICY.wcheck }).actie).toBe(
        'weiger',
      );
    });

    it('een spoor met de juiste versie en een helft, maar zonder policy', () => {
      const zonder = { versie: SPOORVERSIE, helft: 'using#0' };
      expect(beoordeelHerstel(zonder as never, { qual: 'true', wcheck: POLICY.wcheck }).actie).toBe(
        'weiger',
      );
    });

    it("een spoor dat 'beide' noemt — daar is geen onaangeraakte helft", () => {
      expect(beoordeelHerstel(spoor('beide'), { qual: 'true', wcheck: 'true' }).actie).toBe(
        'weiger',
      );
    });
  });

  /**
   * De versie draagt zelf een belofte — QS8-604.
   *
   * ⚠️⚠️ **Elk spoor hierboven dat de versie mist, mist óók zijn helft**, en
   *    daarom liet 📏 de versievergelijking weghalen 99 van 99 toetsen groen.
   *    `SPOORVERSIE` bestaat voor het geval dat de vorm gelijk blijft en de
   *    betekenis niet: een spoor met een geldige helft en een geldige policy,
   *    geschreven door een lezer die er iets anders mee bedoelde. Alleen dat
   *    geval raakt de versietoets en niets anders.
   *
   * ⚠️ **Elk geval hier heeft zijn tegenhanger met de juiste versie**, en die
   *    moet `terugzetten` geven. Anders kan de toets groen worden op iets anders
   *    dan de versie — de database-toestand, de helft — en bewaakt hij niets
   *    (regel 18, vraag 3).
   */
  describe('de versie — een geldige vorm met een andere versie', () => {
    const openstaand = { qual: 'true AND (status <> \'archived\'::text)', wcheck: POLICY.wcheck };
    const metVersie = (versie: unknown) => ({ versie, policy: POLICY, helft: 'using#0' });

    it('de tegenhanger: met de juiste versie is dit gewoon terugzetten', () => {
      expect(beoordeelHerstel(metVersie(SPOORVERSIE), openstaand).actie).toBe('terugzetten');
    });

    it('MUST-FIND: een oudere versie weigert, en zegt dat het de versie is', () => {
      const uitslag = beoordeelHerstel(metVersie(SPOORVERSIE - 1) as never, openstaand);
      expect(uitslag.actie).toBe('weiger');
      expect(uitslag.reden).toContain(`versie ${SPOORVERSIE - 1}`);
    });

    it('MUST-FIND: een nieuwere versie weigert ook — een spoor dat deze lezer niet kent', () => {
      const uitslag = beoordeelHerstel(metVersie(SPOORVERSIE + 1) as never, openstaand);
      expect(uitslag.actie).toBe('weiger');
      expect(uitslag.reden).toContain(`versie ${SPOORVERSIE + 1}`);
    });

    it('MUST-FIND: een versie als tekst is een andere versie, en de reden laat dat zien', () => {
      const uitslag = beoordeelHerstel(metVersie(String(SPOORVERSIE)) as never, openstaand);
      expect(uitslag.actie).toBe('weiger');
      // ⚠️ Anders leest de melding als "draagt versie 2 en kent alleen versie 2".
      expect(uitslag.reden).toContain(`versie "${SPOORVERSIE}"`);
    });

    it('weigert ook als de policy al weg is — de versie gaat vóór alles', () => {
      // ⚠️ Anders zou een onbekend spoor bij een verdwenen policy stil worden
      //    weggegooid (`weg`), en dat is een spoor dat niemand gelezen heeft.
      expect(beoordeelHerstel(metVersie(SPOORVERSIE - 1) as never, null).actie).toBe('weiger');
    });
  });

  // ⚠️⚠️ **De grens van de meting, opgeschreven in plaats van weggelaten.**
  //    Postgres deparseert een uitdrukking bij het teruglezen, dus de tekst die
  //    wij schreven komt anders opgemaakt terug. Daarom gaat de vergelijking per
  //    conjunct: die komen uit dezelfde deparser op dezelfde knoop. Wat dit
  //    níet vangt is een migratie die precies de geopende conjunct vervangt door
  //    iets dat óók `true` deparseert — dan is er geen verschil meer te zien, en
  //    dat is geen tekortkoming van deze toets maar van wat een tekst kan dragen.
  it('vergelijkt per conjunct en niet over de hele helft', () => {
    const huidig = {
      qual: 'true AND (status <> \'archived\'::text)',
      wcheck: POLICY.wcheck,
    };
    expect(beoordeelHerstel(spoor('using#0'), huidig).actie).toBe('terugzetten');
    expect(beoordeelHerstel(spoor('using#1'), huidig).actie).toBe('weiger');
  });
});
