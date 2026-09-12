import { describe, expect, it } from 'vitest';

import {
  alsNummer,
  beeldmelding,
  botsendPerBranch,
  namenPerSleutel,
  nummersUit,
  ontbrekendPerBranch,
  ouderdomInWoorden,
  versheidsmelding,
} from '../../scripts/migratiebranches.mjs';

/**
 * De bovenkant van de migratiereeks — QS8-238.
 *
 * ⚠️ **Waarom dit bestaat.** `migraties:controle` telde de nummers tússen het
 *    laagste en het hoogste bestand. Ontbreekt er iets **boven** het hoogste,
 *    dan is de reeks netjes aaneengesloten tot waar hij ophoudt. Op 31-08-2026
 *    meldde hij letterlijk "De nummering is aaneengesloten" terwijl `0126` t/m
 *    `0130` op productie draaiden en hun bestanden op een branch zonder PR
 *    stonden — waaronder de migratie die het `auth.uid()`-lek in de
 *    uitnodigingslink dichtzette.
 *
 * ⚠️ **Juist de bovenkant is het gevaarlijkst.** Een gat in het midden komt van
 *    een oude fout. Een gat aan de bovenkant komt van de níeuwste migraties, die
 *    net op productie draaien en waarvan de bestanden nog op een branch staan —
 *    de normale gang van zaken in dit project, en dus precies waar het het
 *    vaakst misgaat.
 *
 * ⚠️ De git-scan zelf (`nummersPerBranch`) staat hier niet onder test: die praat
 *    met een echte remote. Wat hier staat is het oordeel, en dat is de helft die
 *    fout kan zijn zonder dat iemand het ziet.
 */

describe('nummersUit', () => {
  it('leest gewone migratienamen', () => {
    expect(nummersUit(['0001_schema.sql', '0131_iets.sql'])).toEqual([1, 131]);
  });

  it('telt een deelmigratie onder zijn eigen nummer', () => {
    // ⚠️ `0052a` is de tweede helft van 0052 — zelfde afspraak als in
    //    migraties-controle.mjs. Zou hij als een eigen nummer tellen, dan zou
    //    elke deelmigratie een vals gat opleveren.
    expect(nummersUit(['0052_a.sql', '0052a_b.sql'])).toEqual([52]);
  });

  it('accepteert volledige paden en losse namen door elkaar', () => {
    expect(nummersUit(['supabase/migrations/0007_x.sql', '0008_y.sql'])).toEqual([7, 8]);
  });

  it.each([
    ['een leeg pad', ''],
    ['een map zonder bestand', 'supabase/migrations/'],
    ['geen sql', '0009_iets.txt'],
    ['te weinig cijfers', '009_iets.sql'],
    ['hoofdletters in de naam', '0009_Iets.sql'],
    ['geen nummer', 'losse_notitie.sql'],
  ])('laat %s met rust', (_naam, invoer) => {
    // ⚠️ Niet meetellen én niet klagen. Een onleesbare naam wordt in stap 1 van
    //    migraties-controle al gemeld; hier nóg een keer klagen levert twee
    //    meldingen op voor één fout, en dat leert je de controle te negeren.
    expect(nummersUit([invoer])).toEqual([]);
  });

  it('ontdubbelt en sorteert', () => {
    expect(nummersUit(['0010_b.sql', '0002_a.sql', '0010_c.sql'])).toEqual([2, 10]);
  });
});

describe('ontbrekendPerBranch — wat er gevonden moet worden', () => {
  it('vindt het geval van QS8-237: vijf migraties boven het hoogste bestand', () => {
    // Dit is main zoals hij op 31-08 om 09:00 werkelijk was.
    const lokaal = Array.from({ length: 125 }, (_, i) => i + 1);
    const perBranch = { 'origin/anders': [...lokaal, 126, 127, 128, 129, 130] };

    const uit = ontbrekendPerBranch({ lokaal, perBranch });

    expect(uit).toEqual([{ branch: 'origin/anders', ontbreekt: [126, 127, 128, 129, 130] }]);
  });

  it('vindt ook een gat in het midden dat elders wél bestaat', () => {
    expect(
      ontbrekendPerBranch({ lokaal: [1, 2, 4], perBranch: { 'origin/x': [1, 2, 3, 4] } }),
    ).toEqual([{ branch: 'origin/x', ontbreekt: [3] }]);
  });

  it('noemt elke branch apart', () => {
    const uit = ontbrekendPerBranch({
      lokaal: [1],
      perBranch: { 'origin/b': [1, 3], 'origin/a': [1, 2] },
    });
    expect(uit.map((r) => r.branch)).toEqual(['origin/a', 'origin/b']);
  });
});

describe('ontbrekendPerBranch — wat er met rust gelaten moet worden', () => {
  it('zwijgt als elke branch precies hetzelfde draagt', () => {
    expect(
      ontbrekendPerBranch({ lokaal: [1, 2, 3], perBranch: { 'origin/main': [1, 2, 3] } }),
    ).toEqual([]);
  });

  it('zwijgt als deze map juist méér draagt dan de branch', () => {
    // De normale toestand op een branch die een nieuwe migratie toevoegt.
    expect(
      ontbrekendPerBranch({ lokaal: [1, 2, 3], perBranch: { 'origin/main': [1, 2] } }),
    ).toEqual([]);
  });

  it('telt een branch zonder migratiemap als nul en niet als "alles ontbreekt"', () => {
    // ⚠️ Zonder deze regel is elke docs-branch rood, en dan is de controle binnen
    //    een week uitgezet.
    expect(
      ontbrekendPerBranch({ lokaal: [1, 2], perBranch: { 'origin/docs': [] } }),
    ).toEqual([]);
  });

  it('zwijgt bij een lege werkkopie', () => {
    // ⚠️ Geen map is een ánder probleem, en dat wordt elders gevonden. Zou dit
    //    "134 migraties ontbreken" melden, dan verdrinkt de echte oorzaak.
    expect(
      ontbrekendPerBranch({ lokaal: [], perBranch: { 'origin/main': [1, 2, 3] } }),
    ).toEqual([]);
  });

  it('zwijgt zonder branches', () => {
    expect(ontbrekendPerBranch({ lokaal: [1, 2], perBranch: {} })).toEqual([]);
  });
});

/**
 * Hetzelfde nummer, een ander bestand — QS8-310.
 *
 * ⚠️ **Waarom dit een tweede oordeel is en geen uitbreiding van het eerste.**
 *    `ontbrekendPerBranch()` vergelijkt nummers. Draagt de zusterbranch 0175 en
 *    draag ik ook een 0175, dan ontbreekt er niets en zwijgt hij — ongeacht of
 *    het hetzelfde bestand is. En zolang mijn map het nummer nog níet had,
 *    meldde hij het wél: als "0175 ontbreekt hier". **De melding verdween dus
 *    precies op het moment dat de botsing ontstond.**
 *
 *    Gemeten op 07-09-2026, met twee branches die allebei een 0175 droegen:
 *
 *      migraties-controle: 178 migraties, aaneengesloten en elk met een
 *      rollback-pad. Geen branch draagt een nummer dat hier ontbreekt.
 *
 * ⚠️ Dit is de fout waar `migratie:nieuw` (QS8-247) en `migratie:hernummer`
 *    (QS8-241) voor gebouwd zijn, en volgens CLAUDE.md al vier keer gebeurd.
 *
 * ⚠️ **Met de hand rood gemaakt, grendel voor grendel:**
 *
 *      1. `hier !== daar` eruit (meldt élke gedeelde migratie)
 *         → 'zwijgt over dezelfde bestandsnaam' rood
 *      2. `hier !== undefined` eruit (meldt een gat als botsing)
 *         → 'zwijgt over een nummer dat hier niet ligt' rood
 *      3. de letter uit de sleutel
 *         → 'ziet een deelmigratie als een eigen nummer' rood
 *
 *    ⚠️ **En een vierde mutatie bleef groen, en dat was de nuttigste.** Er stond
 *    een `lokaal is leeg`-wacht in de functie, overgenomen van
 *    `ontbrekendPerBranch()` waar hij dragend is. Hem eruit halen maakte niets
 *    rood — ook niet de test die beweerde hem te bewaken — want een botsing
 *    vraagt een naam aan béide kanten. De wacht is weg. Twee grendels waarvan
 *    er één niets doet, is er één te veel (QS8-302).
 */
describe('botsendPerBranch — wat er gevonden moet worden', () => {
  const hier = namenPerSleutel(['0174_mijn_migratie.sql', '0175_nog_een.sql']);

  it('meldt een zusterbranch met hetzelfde nummer onder een andere naam', () => {
    const uit = botsendPerBranch({
      lokaal: hier,
      perBranch: { 'origin/zuster': namenPerSleutel(['0175_iets_heel_anders.sql']) },
    });

    expect(uit).toEqual([
      {
        branch: 'origin/zuster',
        botsingen: [
          { nummer: '0175', hier: '0175_nog_een.sql', daar: '0175_iets_heel_anders.sql' },
        ],
      },
    ]);
  });

  it('meldt elke botsing van dezelfde branch, op nummer gesorteerd', () => {
    const uit = botsendPerBranch({
      lokaal: hier,
      perBranch: {
        'origin/zuster': namenPerSleutel(['0175_anders.sql', '0174_ook_anders.sql']),
      },
    });

    expect(uit[0]?.botsingen.map((b) => b.nummer)).toEqual(['0174', '0175']);
  });

  it('ziet een deelmigratie als een eigen nummer', () => {
    // ⚠️ `0052a` is een ander bestand dan `0052` en botst dus niet met zichzelf.
    //    Zou de letter wegvallen, dan meldde elke deelmigratie een botsing met
    //    haar eigen hoofdnummer — een melding die altijd staat en dus niets zegt.
    const uit = botsendPerBranch({
      lokaal: namenPerSleutel(['0052_eerste.sql', '0052a_tweede.sql']),
      perBranch: { 'origin/zuster': namenPerSleutel(['0052_eerste.sql', '0052a_derde.sql']) },
    });

    expect(uit[0]?.botsingen).toEqual([
      { nummer: '0052a', hier: '0052a_tweede.sql', daar: '0052a_derde.sql' },
    ]);
  });
});

describe('botsendPerBranch — wat er met rust gelaten moet worden', () => {
  const hier = namenPerSleutel(['0174_mijn_migratie.sql', '0175_nog_een.sql']);

  it('zwijgt over dezelfde bestandsnaam', () => {
    // ⚠️ **Dit is de helft die de controle bruikbaar houdt.** Elke branch die
    //    van `main` afstamt draagt al zijn migraties; die allemaal melden zou
    //    de controle waardeloos maken. Alleen een ándere naam is een botsing.
    const uit = botsendPerBranch({
      lokaal: hier,
      perBranch: { 'origin/zuster': namenPerSleutel(['0174_mijn_migratie.sql']) },
    });

    expect(uit).toEqual([]);
  });

  it('zwijgt over een nummer dat hier niet ligt', () => {
    // Dat is een gat aan de bovenkant en geen botsing; `ontbrekendPerBranch()`
    // gaat daarover. Twee meldingen voor één toestand is er een te veel.
    const uit = botsendPerBranch({
      lokaal: hier,
      perBranch: { 'origin/zuster': namenPerSleutel(['0176_van_later.sql']) },
    });

    expect(uit).toEqual([]);
  });

  it('zwijgt over een branch zonder migratiemap', () => {
    expect(botsendPerBranch({ lokaal: hier, perBranch: { 'origin/docs': {} } })).toEqual([]);
  });

  it('zwijgt als deze map zelf leeg is', () => {
    // ⚠️ **Dit is een gedragstest en geen grendeltest, en dat verschil is bij
    //    het ijken gebleken.** Er stond een `lokaal is leeg`-wacht in de
    //    functie, overgenomen van `ontbrekendPerBranch()` waar hij dragend is.
    //    Hem eruit halen maakte géén enkele test rood: een botsing vraagt een
    //    naam aan beide kanten, dus bij een lege map valt de lus vanzelf leeg
    //    uit. De wacht is weg; dit geval blijft staan omdat het gedrag klopt en
    //    hoort te blijven kloppen.
    const uit = botsendPerBranch({
      lokaal: {},
      perBranch: { 'origin/zuster': namenPerSleutel(['0175_anders.sql']) },
    });

    expect(uit).toEqual([]);
  });

  it('zwijgt over mijn eigen migratie onder haar oude nummer', () => {
    // ⚠️ **De tweede grendel van QS8-313, en hij vangt een ánder geval dan de
    //    gelande-branchfilter.** Landt mijn migratie en hernummert `main` hem van
    //    0175 naar 0176, dan draagt elke zusterbranch die `main` nog niet
    //    binnengehaald heeft nog steeds `0175_nog_een.sql`. Op nummer én naam is
    //    dat een botsing; in werkelijkheid kijk ik naar mijn eigen bestand onder
    //    zijn oude nummer, en er valt niets te hernummeren.
    //
    // 📏 Het geval deed zich meteen voor op `qs8-317`, die vertakte vóór de
    //    hernummering van 0182 naar 0183.
    const uit = botsendPerBranch({
      lokaal: namenPerSleutel(['0175_van_een_ander.sql', '0176_nog_een.sql']),
      perBranch: { 'origin/zuster': namenPerSleutel(['0175_nog_een.sql']) },
    });

    expect(uit).toEqual([]);
  });

  it('maar meldt een échte botsing die toevallig naast zo\'n verhuizing staat', () => {
    // ⚠️ **Zonder deze regel is de vorige niet van "alles zwijgen" te
    //    onderscheiden.** De zuster draagt hier twee bestanden op genomen
    //    nummers: één dat hier onder een ander nummer staat (mijn verhuizing) en
    //    één dat hier helemaal niet voorkomt. Alleen de tweede is een botsing.
    const uit = botsendPerBranch({
      lokaal: namenPerSleutel(['0175_van_een_ander.sql', '0176_nog_een.sql']),
      perBranch: {
        'origin/zuster': namenPerSleutel(['0175_nog_een.sql', '0176_iets_nieuws.sql']),
      },
    });

    expect(uit).toEqual([
      {
        branch: 'origin/zuster',
        botsingen: [
          { nummer: '0176', hier: '0176_nog_een.sql', daar: '0176_iets_nieuws.sql' },
        ],
      },
    ]);
  });
});

describe('namenPerSleutel', () => {
  it('houdt de letter in de sleutel', () => {
    expect(namenPerSleutel(['0052_a.sql', '0052a_b.sql'])).toEqual({
      '0052': '0052_a.sql',
      '0052a': '0052a_b.sql',
    });
  });

  it('laat een naam die niet aan de vorm voldoet buiten beschouwing', () => {
    // ⚠️ Die wordt elders al als onleesbaar gemeld; hier twee keer klagen
    //    levert twee meldingen op voor één fout.
    expect(namenPerSleutel(['leesmij.md', '17_te_kort.sql', '0180_Goed.sql'])).toEqual({});
  });

  it('accepteert volledige paden', () => {
    expect(namenPerSleutel(['supabase/migrations/0180_iets.sql'])).toEqual({
      '0180': '0180_iets.sql',
    });
  });
});

describe('alsNummer', () => {
  it('schrijft vier cijfers, zoals de bestandsnamen', () => {
    expect(alsNummer(7)).toBe('0007');
    expect(alsNummer(131)).toBe('0131');
  });
});

/**
 * De versheidsmelding — QS8-247.
 *
 * ⚠️ **De belofte is niet "er komt een waarschuwing".** Die stond er al: de scan
 *    zei in zijn eigen commentaar dat het beeld zo oud is als je laatste fetch,
 *    en op 31-08-2026 botste het nummer een **vierde** keer. De belofte is dat
 *    je aan de melding kunt **zien welk van de twee** het is — net opgehaald, of
 *    van gisteren. Eén tekst voor beide gevallen leest als een disclaimer, en
 *    een disclaimer leer je overslaan.
 *
 * ⚠️ Dat "doortellen na een mislukte fetch" mág is een keuze en geen omissie:
 *    zonder netwerk moet je een migratie kunnen beginnen, en weigeren maakt het
 *    werk niet af. Wat de melding dan moet doen is de zekerheid weghalen. Dat
 *    de fetch daadwerkelijk gebeurt, kan hier niet gemeten worden — dat doet
 *    `migratie-fetch.test.ts` met een echte remote op schijf.
 */
describe('ouderdomInWoorden', () => {
  it.each([
    ['van zojuist', 5_000],
    ['1 minuut oud', 61_000],
    ['42 minuten oud', 42 * 60_000],
    ['3 uur oud', 3 * 3_600_000],
    ['1 dag oud', 25 * 3_600_000],
    ['4 dagen oud', 4 * 86_400_000],
  ])('zegt %s', (verwacht, ms) => {
    expect(ouderdomInWoorden(ms)).toBe(verwacht);
  });

  /** Een klok die achteruit loopt is geen reden om "−2 minuten oud" te schrijven. */
  it.each([
    ['negatief', -1],
    ['NaN', Number.NaN],
  ])('houdt zich in bij %s', (_naam, ms) => {
    expect(ouderdomInWoorden(ms)).toBe('onbekend oud');
  });
});

describe('versheidsmelding', () => {
  it('meldt één regel als het beeld nét ververst is', () => {
    const regels = versheidsmelding({ vers: true, sinds: new Date(), fout: null });
    expect(regels).toHaveLength(1);
    expect(regels[0]).toContain('ververst');
  });

  /**
   * ⚠️ **Dit onderscheid ís de bevinding.** Zou hier dezelfde tekst staan als
   *    hierboven, dan bewaakt de melding niets.
   */
  it('noemt bij een mislukte fetch de leeftijd van het beeld', () => {
    const nu = new Date('2026-08-31T20:00:00Z');
    const regels = versheidsmelding({
      vers: false,
      sinds: new Date('2026-08-29T20:00:00Z'),
      nu,
      fout: 'fatal: could not read from remote repository',
    });

    expect(regels.join('\n')).toContain('Kon niet fetchen');
    expect(regels.join('\n')).toContain('2026-08-29 20:00');
    expect(regels.join('\n')).toContain('2 dagen oud');
    expect(regels.join('\n')).toContain('Controleer zelf');
  });

  /**
   * ⚠️ Een verse kloon heeft nog geen `FETCH_HEAD`, en dat is juist de toestand
   *    waarin het beeld het verst achterloopt — daar mag geen lege datum staan.
   */
  it('zegt het met zoveel woorden als er nog nooit gefetcht is', () => {
    const regels = versheidsmelding({ vers: false, sinds: null, fout: 'geen origin' });
    expect(regels.join('\n')).toContain('nog nooit ververst sinds de kloon');
  });

  it('valt niet om zonder foutmelding', () => {
    expect(versheidsmelding({ vers: false, sinds: null }).join('\n')).toContain('onbekende fout');
  });
});

/**
 * De beeldmelding van een **controlerend** script — QS8-435.
 *
 * ⚠️ **De belofte is niet "er staat iets over versheid".** Die stond er al:
 *    `migraties:controle` zette onderaan zijn foutmelding één vaste zin — *dit
 *    beeld is zo oud als je laatste `git fetch`* — en 📏 op 11-09-2026 is er
 *    tóch een branchbevinding op het issue van iemand anders beland die op dat
 *    moment al een uur onwaar was. De zin stond letterlijk in die uitvoer.
 *
 *    De belofte is dat je aan de melding kunt **zien welk van de drie gevallen**
 *    het is: vers, oud, of nooit gefetcht. Dus toetst elke test hieronder niet
 *    alleen wat er staat, maar ook dat de drie teksten van elkaar verschillen —
 *    dát is wat een disclaimer onderscheidt van een waarschuwing.
 *
 * ⚠️ Een testbestand dat alleen `toContain` doet, laat drie identieke teksten
 *    door zolang ze het gezochte woord dragen. Vandaar de laatste test.
 */
describe('beeldmelding', () => {
  const sinds = new Date('2026-09-11T15:03:00Z');

  it('noemt een vers beeld met zijn tijd en zonder voorbehoud', () => {
    const regels = beeldmelding({ sinds, nu: new Date('2026-09-11T15:05:30Z') });

    expect(regels.join('\n')).toContain('2026-09-11 15:03 UTC');
    // Geen ⚠ en geen opdracht: een bevinding op een vers beeld is een bevinding.
    expect(regels.join('\n')).not.toContain('git fetch --all');
    expect(regels.join('\n')).not.toContain('⚠');
  });

  /**
   * ⚠️ **Dit is het geval van 11-09-2026, met de echte getallen erin.** De
   *    branch was om 15:03 UTC hernummerd; de melding is om 16:13 UTC
   *    geschreven.
   */
  it('noemt een oud beeld met zijn tijd, zijn leeftijd én de opdracht', () => {
    const regels = beeldmelding({ sinds, nu: new Date('2026-09-11T16:13:00Z') });

    expect(regels.join('\n')).toContain('2026-09-11 15:03 UTC');
    expect(regels.join('\n')).toContain('1 uur oud');
    expect(regels.join('\n')).toContain('git fetch --all');
  });

  /**
   * ⚠️ De drempel is een grens en geen sfeer: precies erop telt als oud, want
   *    dat is de kant waar een gemiste waarschuwing kost.
   */
  it('kantelt op de drempel', () => {
    const net = beeldmelding({ sinds, nu: new Date(sinds.getTime() + 4 * 60_000) });
    const net2 = beeldmelding({ sinds, nu: new Date(sinds.getTime() + 5 * 60_000) });

    expect(net.join('\n')).not.toContain('git fetch --all');
    expect(net2.join('\n')).toContain('git fetch --all');
  });

  /**
   * ⚠️ Zonder `FETCH_HEAD` is er geen tijdstip, en dat is precies de toestand
   *    van CI en van een verse checkout — waar het beeld juist van net is. Een
   *    lege datum of de oude-beeldtekst zou hier allebei liegen.
   */
  it('zegt het met zoveel woorden als er nooit gefetcht is', () => {
    const regels = beeldmelding({ sinds: null });

    expect(regels.join('\n')).toContain('FETCH_HEAD');
    expect(regels.join('\n')).toContain('verse checkout');
    expect(regels.join('\n')).not.toContain('UTC');
  });

  it('valt terug op dezelfde tekst bij een onleesbare datum', () => {
    expect(beeldmelding({ sinds: new Date('onzin') }).join('\n')).toContain('FETCH_HEAD');
  });

  /**
   * ⚠️⚠️ **De grendel die dit issue eigenlijk vraagt.** Drie gevallen met
   *    dezelfde tekst is exact de toestand van vóór QS8-435, en elke test
   *    hierboven kan daar groen doorheen zolang die ene tekst het gezochte
   *    woord draagt.
   */
  it('geeft drie verschillende teksten', () => {
    /**
     * ⚠️ **Op de vórm vergelijken en niet op de letter, en dat is een gemeten
     *    correctie.** De eerste versie zette de drie uitvoeren zó in een `Set`,
     *    en die telde altijd drie — want de tijd en de leeftijd staan erin, en
     *    die verschillen sowieso. 📏 Met de oude-tak dichtgezet (ijking G) bleef
     *    hij daardoor groen terwijl twee van de drie gevallen dezelfde melding
     *    gaven: precies wat hij hoorde te vinden. Vandaar dat alles wat per
     *    aanroep varieert er eerst uit gaat.
     */
    const vorm = (regels: string[]) =>
      regels
        .join('\n')
        .replace(/van zojuist|\d+ (?:minuut|minuten|uur|dag|dagen) oud/g, 'LEEFTIJD')
        .replace(/\d/g, '#');

    const vormen = [
      vorm(beeldmelding({ sinds, nu: new Date(sinds.getTime() + 1_000) })),
      vorm(beeldmelding({ sinds, nu: new Date(sinds.getTime() + 86_400_000) })),
      vorm(beeldmelding({ sinds: null })),
    ];

    expect(new Set(vormen).size).toBe(3);
  });
});
