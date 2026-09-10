import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  alleAsyncExportsIn,
  asyncBeloftesIn,
  awaitTreffersIn,
  beloftefunctiesIn,
  lokaleFunctiesIn,
  optioneleUitkomstenIn,
  uitkomsttypenIn,
  voidTreffersIn,
  type OptioneleUitkomst,
} from './uitkomsttypen';

const WORTEL = join(__dirname, '..', '..');

/**
 * Een functie die een uitkomst teruggeeft, mag niet weggegooid worden — QS8-245.
 *
 * ⚠️ **De belofte is niet "signOut wordt afgehandeld".** Dat is het geval. De
 *    belofte is: *als een handeling faalt, ziet de gebruiker dat.* Op het
 *    profielscherm stond
 *
 *      <Button onPress={() => void signOut()}>
 *
 *    en `void` gooit de uitkomst weg. `signOut()` bouwt netjes
 *    `auth.fout.uitloggen` op, die melding staat in beide catalogi en is op
 *    inhoud getest — en werd door geen enkel scherm getoond. Mislukte het
 *    uitloggen, dan gebeurde er zichtbaar niets.
 *
 * ⚠️ **Regel 18 vraag 5 in zijn zuiverste vorm: er was niets kapot.** De functie
 *    was af, de melding was geschreven, vertaald en getest. Alleen was de keten
 *    nergens verbonden, en daar wordt per definitie geen enkele test rood van.
 *
 * ⚠️ **De lijst wordt uit de bron áfgeleid en niet met de hand bijgehouden.** Dat
 *    is de fout van 0032/0034: twee lijsten die uit elkaar lopen, waarbij de
 *    test de app-lijst met zichzelf vergeleek.
 *
 * ⚠️⚠️ **En die afleiding is één keer stil verlopen — QS8-340.** Ze zocht
 *    letterlijk naar `Promise<Uitkomst`, terwijl de codebase intussen op de
 *    gedeelde alias `Resultaat` uit `src/shared/api` was overgegaan. 📏 Op
 *    07-09-2026 dekte deze grendel daardoor **12 van de 74** functies die een
 *    uitkomst beloven, en de bug die hij daardoor liet lopen stond in
 *    `app/doel/[id].tsx`: `void trekIn(bestaand.id)`, waardoor
 *    `commitment.fout.al_afgegaan` de gebruiker nooit bereikte.
 *
 *    De kop van dit bestand vóórspelde dat woordelijk — *"verandert de signatuur
 *    ooit van vorm, dan vindt de afleiding nul functies"* — en er stónd een
 *    ondergrens tegen dat geval: `toBeGreaterThan(3)`. **Die ving nul en niet
 *    "bijna alles", en op 12 was hij gewoon groen.** Daarom staan er nu twee
 *    grendels op de afleiding zelf, en meet de tweede een fráctie van de bron.
 *
 * IJKING — met de hand gedraaid, A t/m E op 01-09-2026, F t/m J op 08-09-2026.
 * Eén mutatie per grendel, want een ijking die door een éérdere grendel wordt
 * afgevangen, bewaakt niets van wat ze belooft.
 *
 *   A  `void signOut()` terugzetten in het profielscherm   → 1 rood, met naam en regel
 *   B  de afleiding uit de bron leeg maken                 → 1 rood ("vindt geen enkele")
 *   C  het wegknippen van commentaar eruit                 → 1 rood, en de vondst
 *      is het commentaar in `profiel.tsx` dat de oude bug citeert
 *   D  `<Uitloggen />` terug naar plek twaalf              → 1 rood
 *   E  `<AccountVerwijderen />` naar boven halen           → 1 rood
 *   F  `void trekIn(straf.id).then(onKlaar)` terugzetten   → 1 rood: de void-grendel,
 *      met bestand en regelnummer. Alléén die grendel.
 *   G  de must-allow ernaast: 📏 er staan 105 `void`-aanroepen in `app/`, en er
 *      wordt er géén van gemeld — `void lokaleHandler()` is hier het normale patroon
 *   H  de afleiding terug op een `[^;]*`-greep van het typelichaam → 1 rood: de
 *      fractie, op **12 van de 144**. Dat is exact de stand van 07-09-2026, en de
 *      oude ondergrens `toBeGreaterThan(3)` stond daar groen op. De vorm van deze
 *      grendel is dus het hele punt, niet zijn aanwezigheid.
 *   I  de lokale `trekVerzoekIn` terug naar `trekIn`       → 2 rood: de schaduwgrendel
 *      noemt het bestand, én de void-grendel geeft de válse melding op de lokale
 *      aanroep. Dat tweede is waarom de schaduw weg moest en niet weggefilterd.
 *   J  de vormtoets op `ok: true`/`ok: false` uitgezet     → 1 rood: de afleiding zelf,
 *      vóór de fractie erover valt
 *   K  de parameterlezer terug op `\([^)]*\)`               → 1 rood: de leesgrendel,
 *      met `zetMeldingenUit()` en vijf andere bij naam. De fractie blijft daarbij
 *      groen — en dát is waarom die grendel er los naast staat.
 *
 * IJKING — L t/m O op 08-09-2026, bij QS8-350. Zelfde afspraak: één mutatie per
 * grendel, en beide richtingen.
 *
 *   L  `await zetArchief(...)` terugzetten in `Archiveren`  → 1 rood: de
 *      await-grendel, met bestand en regelnummer. Alléén die.
 *   M  `@uitkomst-optioneel` van `werkJobAf` weghalen        → 2 rood, en allebei
 *      horen ze: de lijst (leeg tegen de tripdraad) én de await-grendel, die dan
 *      de vier `await werkJobAf(...)` meldt. Dat is meteen de must-allow bewezen
 *      langs de enige weg die telt — door hem weg te nemen. 📏 Mét markering
 *      blijven die vier groen.
 *   N  de reden achter `@uitkomst-optioneel` leegmaken      → 1 rood: de lijst zelf,
 *      niet de await-grendel. De markering vrijwaart nog steeds; wat rood wordt is
 *      dat er geen reden meer bij staat.
 *   O  `const x = await zetArchief(...)` ervan maken        → groen, en dat is de
 *      helft die telt: een opgevangen uitkomst is geen weggegooide. De vormen los
 *      gevoerd staan in `uitkomsttypen.test.ts`.
 */

function bestanden(map: string, exts: readonly string[]): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad, exts));
    else if (exts.some((e) => naam.endsWith(e))) uit.push(pad);
  }
  return uit;
}

function modulebestanden(): string[] {
  return bestanden(join(WORTEL, 'src', 'modules'), ['.ts']).filter((p) => !p.endsWith('.test.ts'));
}

/** Elk type in `src/` met een `ok: true`- en een `ok: false`-tak. */
function uitkomsttypen(): ReadonlySet<string> {
  const namen = new Set<string>();
  for (const pad of bestanden(join(WORTEL, 'src'), ['.ts'])) {
    if (pad.endsWith('.test.ts')) continue;
    for (const naam of uitkomsttypenIn(readFileSync(pad, 'utf8'))) namen.add(naam);
  }
  return namen;
}

/** Elke geëxporteerde functie in `src/modules/` die een uitkomst belooft. */
function uitkomstFuncties(soorten: ReadonlySet<string>): string[] {
  const namen = new Set<string>();
  for (const pad of modulebestanden()) {
    for (const naam of beloftefunctiesIn(readFileSync(pad, 'utf8'), soorten)) namen.add(naam);
  }
  return [...namen].sort();
}

/**
 * Élke `export async function` in `src/modules/` — de noemer van de fractie.
 *
 * ⚠️ Kaal geteld, met een ándere greep dan de zeef zelf. Zie `alleAsyncExportsIn()`.
 */
function alleAsyncExports(): string[] {
  const uit: string[] = [];
  for (const pad of modulebestanden()) uit.push(...alleAsyncExportsIn(readFileSync(pad, 'utf8')));
  return uit;
}

/** Elke functie waarvan de signatuurlezer de draad kwijtraakte. */
function ongelezen(): string[] {
  const uit: string[] = [];
  for (const pad of modulebestanden()) {
    const bron = readFileSync(pad, 'utf8');
    const gezien = asyncBeloftesIn(bron);

    for (const f of gezien.filter((x) => !x.gelezen)) {
      uit.push(`${relative(WORTEL, pad)} — ${f.naam}() (handtekening niet gelezen)`);
    }
    for (const naam of alleAsyncExportsIn(bron)) {
      if (!gezien.some((f) => f.naam === naam)) uit.push(`${relative(WORTEL, pad)} — ${naam}()`);
    }
  }
  return uit;
}

/** Elke functie in `src/modules/` die met `@uitkomst-optioneel` is vrijgesteld. */
function optioneleUitkomsten(): OptioneleUitkomst[] {
  const uit: OptioneleUitkomst[] = [];
  for (const pad of modulebestanden()) uit.push(...optioneleUitkomstenIn(readFileSync(pad, 'utf8')));
  return uit;
}

/**
 * De vrijstellingen zoals ze hier verwacht worden — de tripdraad, niet de bron.
 *
 * ⚠️ **Dit is een allowlist, en de vraag van QS8-350 was hoe je er een maakt die
 *    niet stilletjes groeit.** Het antwoord is de rolverdeling: wat er
 *    daadwerkelijk vrijgesteld ís, staat als `@uitkomst-optioneel` in de bron bij
 *    de functie, mét reden — de grendels hieronder lezen dat en niets anders.
 *    Deze regel is alleen de tripdraad eromheen. Een markering erbij of eraf is
 *    daarmee altijd een rode test, en de reden staat op de enige plek waar hij
 *    meeverhuist met de functie.
 *
 * ⚠️ **Niet andersom, en dat is het verschil dat telt.** Zou de zeef op déze lijst
 *    draaien, dan bleef een vrijstelling gewoon werken nadat iemand de reden uit
 *    de bron had gehaald. Nu vervalt ze op hetzelfde moment.
 */
const BEWUST_GENEGEERD: readonly string[] = ['werkJobAf'];

describe('geen enkel scherm gooit een uitkomst weg', () => {
  const soorten = uitkomsttypen();
  const functies = uitkomstFuncties(soorten);
  const vrijgesteld = optioneleUitkomsten().map((o) => o.naam);
  const bewaakt = functies.filter((naam) => !vrijgesteld.includes(naam));

  /**
   * ⚠️ **Zonder deze regel is de rest van dit bestand groen om niets.** Vindt de
   *    afleiding geen enkel uitkomsttype, dan vindt ze ook geen enkele functie en
   *    meldt ze vrolijk niets.
   */
  it('vindt de uitkomsttypen in de bron', () => {
    expect(
      [...soorten].sort(),
      'geen enkel type met een ok:true- en een ok:false-tak gevonden in src/',
    ).not.toEqual([]);
  });

  /**
   * ⚠️ **Dit is de grendel die op 07-09-2026 ontbrak, en de vorm ervan is de les.**
   *    Een vaste ondergrens vangt "nul" en niet "een fractie": de oude
   *    `toBeGreaterThan(3)` stond groen op 12 van de 74. Daarom meet deze het
   *    aandeel van de bron dat de zeef daadwerkelijk ziet.
   *
   * 📏 Vandaag 79 van de 150 (53%). De rest is bijna helemaal `fetch*` — lezers,
   *    die per definitie geen uitkomst beloven. Zakt dit onder de 40%, dan is er
   *    een schrijvende laag bijgekomen die de zeef niet ziet, of is de afleiding
   *    zelf iets kwijtgeraakt.
   */
  it('ziet een reëel deel van de bron en niet een restje', () => {
    const totaal = alleAsyncExports().length;
    expect(totaal, 'geen enkele export-async in src/modules').toBeGreaterThan(0);
    expect(
      functies.length / totaal,
      `de zeef ziet ${functies.length} van de ${totaal} async-functies — welk type mist ze?`,
    ).toBeGreaterThan(0.4);
  });

  /**
   * ⚠️ **Een functie die de signatuurlezer niet léést, valt stil buiten alles.**
   *    Hij staat niet in de lijst hierboven, dus de zeef kijkt er nooit naar — en
   *    zolang teller én noemer dezelfde lezer deelden, bewóóg de fractie er ook
   *    niet van. 📏 Dat gold op 08-09-2026 voor zes van de 150 functies, waaronder
   *    `zetMeldingenUit(verwijderRij: () => Promise<void>)`, die wél een
   *    uitkomsttype belooft: zijn pijltype-parameter draagt haakjes, en de lezer
   *    greep tot de eerste `)`. Aangewezen in de security-review op QS8-340.
   *
   *    Vandaar deze grendel én de losse noemer hierboven: een gat in de lezer is
   *    voortaan luid, en niet een percentage dat toevallig gelijk blijft.
   */
  it('leest élke export-async in src/modules, ook met haakjes in de parameters', () => {
    expect(
      ongelezen(),
      'de signatuurlezer slaat deze functies over; ze vallen daarmee buiten élke grendel hierboven',
    ).toEqual([]);
  });

  /**
   * ⚠️ **De must-allow-helft, en hier is de valse melding de duurste faalvorm.**
   *    Declareert een scherm zélf een functie met de naam van een modulefunctie,
   *    dan kan de zeef hierboven niet zien welke van de twee er in de `void`
   *    belandt. 📏 Dat was op 07-09-2026 precies het geval in `app/doel/[id].tsx`:
   *    een lokale `trekIn()` (een deadline-verzoek, die zijn fout wél opving) naast
   *    de geïmporteerde `trekIn()` (een commitment, die hem weggooide). Wie de zeef
   *    alleen verbreedt, maakt van de eerste een valse melding — en een controle
   *    die valse meldingen geeft, leer je uitzetten.
   */
  it('laat geen enkel scherm een modulenaam opnieuw gebruiken', () => {
    const schaduwen: string[] = [];

    for (const pad of bestanden(join(WORTEL, 'app'), ['.tsx', '.ts'])) {
      const eigen = lokaleFunctiesIn(readFileSync(pad, 'utf8'));
      for (const naam of eigen.filter((n) => functies.includes(n))) {
        schaduwen.push(`${relative(WORTEL, pad)} — lokale ${naam}() schaduwt de modulefunctie`);
      }
    }

    expect(
      schaduwen,
      'hernoem de lokale functie; anders kan de grendel hieronder niet zien welke van de twee je aanroept',
    ).toEqual([]);
  });

  it('roept er geen enkele aan met void, want dan is de melding onzichtbaar', () => {
    const gevonden: string[] = [];

    for (const pad of bestanden(join(WORTEL, 'app'), ['.tsx', '.ts'])) {
      const treffers = voidTreffersIn(readFileSync(pad, 'utf8'), bewaakt);
      for (const t of treffers) gevonden.push(`${relative(WORTEL, pad)}:${t}`);
    }

    expect(
      gevonden,
      'vang de uitkomst op en toon de melding; `void` maakt een mislukking onzichtbaar',
    ).toEqual([]);
  });

  /**
   * ⚠️ **De tweede aanroepvorm — QS8-350.** `void f()` en een kaal `await f()`
   *    doen hetzelfde met de uitkomst, en tot 08-09-2026 kende deze grendel
   *    alleen de eerste. 📏 De verbreding van QS8-340 leverde daardoor nul
   *    treffers op terwijl er twee echte weggooiers stonden: het archiveren op
   *    het doelscherm en de mijlpalenlus van de Doelcoach.
   */
  it('roept er geen enkele aan als kaal await-statement — zelfde weggooi', () => {
    const gevonden: string[] = [];

    for (const pad of bestanden(join(WORTEL, 'app'), ['.tsx', '.ts'])) {
      const treffers = awaitTreffersIn(readFileSync(pad, 'utf8'), bewaakt);
      for (const t of treffers) gevonden.push(`${relative(WORTEL, pad)}:${t}`);
    }

    expect(
      gevonden,
      'vang de uitkomst op en toon de melding; een kaal `await` gooit hem net zo hard weg als `void`',
    ).toEqual([]);
  });

  /**
   * ⚠️ **De must-allow-helft van de twee grendels hierboven, en de duurste.**
   *    Zonder vrijstelling meldt de await-grendel de vier `await werkJobAf(...)`,
   *    en een controle die vier bewuste aanroepen als bevinding brengt, leer je
   *    uitzetten. Met een vrijstelling per áánroep zou er niets rood worden als
   *    er een vijfde bij kwam. Vandaar allebei: de reden bij de functie, de
   *    verzameling hier.
   */
  it('somt de bewust genegeerde uitkomsten op, met een reden per stuk', () => {
    const optioneel = optioneleUitkomsten();

    expect(
      [...vrijgesteld].sort(),
      'er is een @uitkomst-optioneel bij gekomen of weggehaald — weeg hem en zet hem in BEWUST_GENEGEERD',
    ).toEqual([...BEWUST_GENEGEERD].sort());

    expect(
      optioneel.filter((o) => o.reden.length < 20).map((o) => o.naam || '(zonder functie eronder)'),
      'een @uitkomst-optioneel zonder reden is geen vrijstelling maar een gat',
    ).toEqual([]);

    expect(
      optioneel.filter((o) => !functies.includes(o.naam)).map((o) => o.naam || '(geen functie eronder)'),
      'deze markering wijst geen functie aan die een uitkomst belooft — hij vrijwaart dus niets',
    ).toEqual([]);
  });
});

/**
 * ⚠️ **De tweede belofte van QS8-245: uitloggen is te vinden zonder te scrollen.**
 *
 *    Dit is een bronbewaking en geen render — er is geen renderer in dit project.
 *    Hij kan dus niet zien hoe ver je moet scrollen; wat hij wél kan zien is de
 *    volgorde waarin de blokken in het scherm staan, en dát was de bug: uitloggen
 *    was blok twaalf, ná taal, tijdzone, meldingen, herinnering, thema en viering.
 */
describe('uitloggen staat vóór de instellingen', () => {
  const SCHERM = join(WORTEL, 'app', '(tabs)', 'profiel.tsx');

  /** Een instelling die je niet zocht toen je wilde uitloggen. */
  const INSTELLINGEN = [
    '<TaalInstelling',
    '<TijdzoneInstelling',
    '<Meldingen',
    '<HerinneringInstelling',
    '<ThemaKeuze',
    '<VieringKeuze',
  ];

  it('vindt het profielscherm — anders bewaakt de rest hier niets', () => {
    expect(
      () => statSync(SCHERM),
      'app/(tabs)/profiel.tsx is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
  });

  it('zet het uitlogblok boven élke instelling', () => {
    const bron = readFileSync(SCHERM, 'utf8');
    const uitloggen = bron.indexOf('<Uitloggen />');

    expect(uitloggen, 'geen <Uitloggen /> in het profielscherm').toBeGreaterThan(-1);

    const teVroeg = INSTELLINGEN.filter((tag) => {
      const plek = bron.indexOf(tag);
      return plek > -1 && plek < uitloggen;
    });

    expect(teVroeg, 'deze instellingen staan vóór de uitlogknop').toEqual([]);
  });

  /**
   * ⚠️ **De must-allow-helft, en die is hier een domeinregel en geen smaak.**
   *    Account verwijderen hóórt moeilijk bereikbaar te zijn. Zou iemand deze
   *    grendel "verbeteren" door ook dat naar boven te halen, dan is dat een
   *    achteruitgang die niemand opmerkt.
   */
  it('laat account verwijderen juist onderaan staan', () => {
    const bron = readFileSync(SCHERM, 'utf8');

    expect(bron.indexOf('<AccountVerwijderen />')).toBeGreaterThan(bron.indexOf('<Uitloggen />'));
    for (const tag of INSTELLINGEN) {
      const plek = bron.indexOf(tag);
      if (plek > -1) expect(bron.indexOf('<AccountVerwijderen />')).toBeGreaterThan(plek);
    }
  });
});
