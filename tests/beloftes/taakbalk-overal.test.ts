import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { actiefTabblad, TABBLADEN, toontTaakbalk, ZONDER_TAAKBALK } from '../../src/shared/ui/taakbalk';
import { ZONDER_PUSH } from '../../scripts/schermingang-controle.mjs';

/**
 * Elk scherm dat een taakbalk hoort te hebben, heeft er één — QS8-437.
 *
 * ⚠️⚠️ **De belofte is "elk", en dat is precies wat een test per scherm niet kan
 *    zien.** 📏 De aanleiding: de balk hoorde bij de navigator in
 *    `app/(tabs)/_layout.tsx` en bestond dus alleen binnen die map — **24 van de
 *    29 schermen** lagen erbuiten. Elk van die schermen was op zichzelf in orde;
 *    wat ontbrak was een uitspraak over het gehéél.
 *
 *    Deze test doet die uitspraak: hij leest de échte routes uit `app/` en eist
 *    dat elke route óf een balk krijgt, óf met een reden in `ZONDER_TAAKBALK`
 *    staat. Een nieuw scherm is daarmee automatisch een besluit en nooit een
 *    omissie — de vorm die CLAUDE.md vraagt bij een nieuw oppervlak.
 *
 * ⚠️ **Hij toetst de belofte en niet de plek.** Er staat nergens een lijst met
 *    schermnamen die met de hand bijgehouden moet worden; de lijst *is* de
 *    inhoud van `app/`. Verhuist een scherm, dan verhuist de eis mee.
 *
 * IJKING — met de hand gedraaid op 12-09-2026, één mutatie per grendel, vooraf
 * en achteraf 10 groen:
 *
 *   een uitzondering met een te korte reden
 *      -> 1 rood: 'zegt elke uitzondering waaróm'
 *   een registerrij voor een scherm dat niet bestaat
 *      -> 1 rood: 'draagt elke rij in het register een bestaand scherm'
 *   `/beoordelen` uitsluiten mét een volwaardige reden
 *      -> 1 rood: 'MUST-ALLOW: de schermen buiten de tabbladen krijgen er wél een'
 *   de vertrekwachtrij uit `ZONDER_TAAKBALK` halen
 *      -> 1 rood: 'houdt het scherm met een vertrekwacht buiten de balk'
 *   `/doel` uit de kaart `ONDER` halen
 *      -> 1 rood: 'wijst een detailscherm zijn eigen tabblad aan'
 *
 * ⚠️⚠️ **De derde mutatie is de reden dat deze tabel er anders uitziet dan
 *    gepland.** De eerste poging sloot een scherm uit mét een te korte reden, en
 *    toen viel de rédencontrole om — een éérdere grendel op hetzelfde pad. Dat
 *    is precies waar CLAUDE.md voor waarschuwt: *een ijking die zijn geval door
 *    een pad voert dat een eerdere grendel al afvangt, bewaakt niets van wat hij
 *    belooft.* Met een volwaardige reden erbij kwam de mutatie verder — en
 *    toonde dat de grendel die hém hoorde te vangen een tautologie was. Zie de
 *    test hieronder.
 */

const APP = join(__dirname, '..', '..', 'app');

/**
 * De routes die `app/` daadwerkelijk draagt, als URL-pad.
 *
 * ⚠️ Groepen (`(tabs)`) vallen weg — dat is wat expo-router met een map tussen
 *    haakjes doet, en het is de reden dat dit besluit geen enkele route hoefde
 *    te verplaatsen. `index` wordt de map zelf.
 */
function routes(map: string, prefix = ''): string[] {
  const uit: string[] = [];

  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) {
      const stuk = naam.startsWith('(') && naam.endsWith(')') ? '' : `/${naam}`;
      uit.push(...routes(pad, `${prefix}${stuk}`));
      continue;
    }
    if (!naam.endsWith('.tsx') || naam.startsWith('_') || naam.startsWith('+')) continue;
    const kaal = naam.replace(/\.tsx$/, '');
    uit.push(kaal === 'index' ? prefix || '/' : `${prefix}/${kaal}`);
  }

  return uit;
}

describe('elk scherm dat een balk hoort te hebben, heeft er één', () => {
  const alle = routes(APP);

  /** ⚠️ Een test die nul routes leest, bewijst niets en is altijd groen. */
  it('vindt de routes van de app', () => {
    expect(alle.length).toBeGreaterThan(20);
    expect(alle).toContain('/');
    expect(alle).toContain('/doel/[id]');
  });

  /**
   * ⚠️⚠️ **Hier stond een tautologie, en de ijking heeft hem gevonden.** De
   *    eerste versie filterde de routes op `!toontTaakbalk(pad)` en toetste
   *    daarna of elk van die routes in `ZONDER_TAAKBALK` stond. Maar
   *    `toontTaakbalk()` léést dat register: die twee kúnnen het niet oneens
   *    zijn, dus de test was altijd groen. Regel 18 vraag 3 in zijn zuiverste
   *    vorm — hij kon groen blijven terwijl de belofte brak, want hij kon de
   *    belofte niet raken.
   *
   *    Wat er wél te toetsen valt, is de andere kant op: **draagt elke rij in
   *    het register nog een bestaand scherm?** Een rij die zijn scherm overleeft
   *    is een stille verruiming — hij sluit vanaf dat moment een route uit die
   *    ooit nog eens onder die naam terugkomt, en niemand die dat merkt.
   *
   * ⚠️ Dat een níeuw scherm vanzelf een balk krijgt, is geen test maar een
   *    eigenschap van de vorm: `toontTaakbalk()` zegt standaard ja. Dat is de
   *    veilige kant — een balk te veel valt op, een balk te weinig merkt alleen
   *    de gebruiker. Het staat hier opgeschreven omdat het anders nergens staat.
   */
  it('draagt elke rij in het register een bestaand scherm', () => {
    const dood = ZONDER_TAAKBALK.filter(
      ({ pad: uit }) =>
        !alle.some((pad) => (uit.endsWith('/') ? `${pad}/`.startsWith(uit) : pad === uit)),
    ).map(({ pad }) => pad);

    expect(
      dood,
      'deze rijen sluiten een scherm uit dat niet meer bestaat; haal ze weg of ' +
        'zet erbij waarom ze blijven staan',
    ).toEqual([]);
  });

  it('zegt elke uitzondering waaróm', () => {
    for (const rij of ZONDER_TAAKBALK) {
      expect(rij.reden.length, `${rij.pad} heeft geen reden`).toBeGreaterThan(40);
    }
  });

  /**
   * ⚠️ **De must-allow, en zonder haar is de grendel hierboven gratis.** Een
   *    register dat élke route uitsluit haalt hem ook. Dit zegt dat de schermen
   *    die de klacht van Quinten veroorzaakten er nu daadwerkelijk één hebben.
   */
  it('MUST-ALLOW: de schermen buiten de tabbladen krijgen er wél een', () => {
    for (const pad of ['/doel/[id]', '/groep/[id]', '/groep/chat/[id]', '/beoordelen', '/overzicht']) {
      expect(toontTaakbalk(pad), `${pad} hoort een balk te hebben`).toBe(true);
    }
  });

  /**
   * ⚠️ **De duurste uitzondering.** `usePreventRemove` ziet een tik op een link
   *    in de balk niet als een vertrek dat hij mag tegenhouden — vijf linkjes
   *    zijn dus vijf routes langs de vertrekwacht heen, en dan is onopgeslagen
   *    tekst weg (QS8-192).
   */
  it('houdt het scherm met een vertrekwacht buiten de balk', () => {
    expect(toontTaakbalk('/groep/weekafsluiting/42')).toBe(false);
  });

  it('houdt de schermen zonder sessie buiten de balk', () => {
    expect(toontTaakbalk('/aanmelden')).toBe(false);
    expect(toontTaakbalk('/uitnodiging/ABC123')).toBe(false);
    expect(toontTaakbalk('/onboarding/uitleg')).toBe(false);
  });
});

describe('het actieve tabblad volgt de route', () => {
  it('licht het tabblad zelf op', () => {
    for (const { pad } of TABBLADEN) expect(actiefTabblad(pad)).toBe(pad);
  });

  it('wijst een detailscherm zijn eigen tabblad aan', () => {
    expect(actiefTabblad('/doel/123')).toBe('/doelen');
    expect(actiefTabblad('/doel/bewerk/123')).toBe('/doelen');
    expect(actiefTabblad('/groep/chat/7')).toBe('/groep');
  });

  /**
   * ⚠️ **`null` is een geldig antwoord.** Er maar één aanwijzen is liegen over
   *    waar je bent, en dat is de tweede bron van waarheid die dit besluit
   *    juist wilde vermijden.
   */
  it('wijst niets aan waar niets hoort', () => {
    expect(actiefTabblad('/beoordelen')).toBeNull();
    expect(actiefTabblad('/overzicht')).toBeNull();
  });

  it('trekt zich niets aan van een query of een slotstreep', () => {
    expect(actiefTabblad('/doelen/')).toBe('/doelen');
    expect(actiefTabblad('/doelen?filter=open')).toBe('/doelen');
  });
});

// ---------------------------------------------------------------------------

/**
 * De naad tussen de twee registers — QS8-441.
 *
 * ⚠️⚠️ **`schermingang:controle` verontschuldigt vijf routes omdat "de taakbalk
 *    de ingang is". Niets toetste of die balk ze ooit aanwijst.** 📏 Gemeten op
 *    12-09-2026: `/lijst` had **nul** andere ingangen — geen `router.push`, geen
 *    `href`, geen `terug={{naar}}` in heel `app/` en `src/`. Eén rij uit
 *    `TABBLADEN` halen maakte het vijfde tabblad dus onbereikbaar, terwijl de
 *    controle meldde dat alle 27 routes een ingang hebben.
 *
 * ⚠️ **Waarom dit geen tautologie is** — punt U uit QS8-440, dat precies over
 *    dít bestand ging. De verwachting komt hier **niet** uit `TABBLADEN` maar
 *    uit `ZONDER_PUSH`: een ander register, in een ander bestand, met een andere
 *    padvorm (`/(tabs)/lijst` tegen `/lijst`), dat onafhankelijk onderhouden
 *    wordt. De twee kunnen het dus wél oneens zijn, en dat is het hele punt.
 *
 * ⚠️ Expo Router laat de groep uit het pad vallen: `/(tabs)/doelen` is `/doelen`
 *    en `/(tabs)` is `/`. Die vertaling staat hier één keer.
 */
function alsApppad(route: string): string {
  return route === '/(tabs)' ? '/' : route.replace('/(tabs)', '');
}

describe('wat schermingang:controle verontschuldigt, wijst de taakbalk ook echt aan', () => {
  const verontschuldigd = Object.keys(ZONDER_PUSH as Record<string, string>).map(alsApppad);
  const inBalk = TABBLADEN.map((t) => t.pad as string);

  it('elke route die op de taakbalk leunt, staat in TABBLADEN', () => {
    expect(verontschuldigd.length).toBeGreaterThan(0);
    for (const pad of verontschuldigd) {
      expect(inBalk, `${pad} leunt op de taakbalk maar staat niet in TABBLADEN`).toContain(pad);
    }
  });

  /**
   * ⚠️ De andere kant op, want de ratel slaat twee kanten op: een tabblad dat
   *    nérgens op leunt is geen fout, maar een tabblad dat uit `ZONDER_PUSH`
   *    verdwijnt terwijl het in de balk blijft staan, betekent dat de twee
   *    registers uit elkaar gelopen zijn — en dan klopt één van beide niet.
   */
  it('en elk tabblad wordt door die controle ook als zodanig verontschuldigd', () => {
    for (const pad of inBalk) {
      expect(verontschuldigd, `${pad} staat in de balk maar niet in ZONDER_PUSH`).toContain(pad);
    }
  });
});
