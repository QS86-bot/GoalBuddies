import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * De onboarding schrijft alleen wat ze vraagt — QS8-213.
 *
 * ⚠️ **De naad, en het is er een tussen twee onderdelen die allebei kloppen.**
 *    `updateProfiel()` schrijft elk veld dat het meekrijgt, en dat hoort het te
 *    doen; het onboardingscherm stelt een patch samen, en dat hoort het ook te
 *    doen. Het geheel lekt op de plek waar ze aan elkaar knopen: een veld met een
 *    vaste waarde in die patch is een veld dat iemand met een bestaand profiel
 *    kwijtraakt zodra hij hier belandt.
 *
 *    Dat pad is niet exotisch. De kop van `app/onboarding/profiel.tsx` beschrijft
 *    het: `Routewacht` stuurde bij een mislukte profielophaling naar de
 *    onboarding, en op web is elke diepe route rechtstreeks op te vragen. Het is
 *    één keer echt gebeurd, met de week-startdag.
 *
 * ⚠️ **Waarom niet de wacht op het profiel toetsen.** Die dekt de
 *    initialisatoren — velden die de gebruiker ziet en die uit het profiel komen.
 *    Ze dekt niet het geval waar dit over gaat: een constante in de patch die
 *    nooit langs een `useState` komt en dus ook nooit uit het profiel gelezen is.
 *    `share_moves_by_default: false` stond hier als zo'n constante, en dat is
 *    meteen het nuttige geval om erbij te zetten: die kolom bleek op 03-09 geen
 *    enkele lezer te hebben, dus er ging niets verloren. De vórm is wat telt —
 *    dezelfde regel met een kolom die wél gelezen wordt, is een stille wisser.
 *
 * ⚠️ **Waarom een bronscan.** Er is in dit project geen React-testbibliotheek, en
 *    los ronddraaien van `bewaar()` kan niet zonder er een renderer bij te halen.
 *    Wat je zonder renderer wél kunt vastleggen, is welke sleutels er in die
 *    patch mogen staan. Dat is precies de belofte en niet een eigenschap van een
 *    onderdeel: een nieuwe constante moet er letterlijk bij, en dan is dit rood.
 *
 * ⚠️ **Met de hand rood gemaakt per grendel, en de eerste ronde deugde niet.**
 *    Grendel 2 was geijkt door `herinneringStandaard` te vervangen door
 *    `herinneringVelden` — en dat werd rood op de naamlijst, niet op de belofte.
 *    De security-review van 03-09 mat wat er dan doorheen glipte:
 *    `...herinneringStandaard({ onboarded_at: null })` bleef groen, en dát is
 *    precies de breuk waar deze functie voor bestaat. CLAUDE.md waarschuwt er
 *    letterlijk voor: *breek de grendel die de ijking noemt, anders is de ijking
 *    zelf de aanname.* De grendel toetst nu wat er ín de haakjes staat.
 *
 *    De ijking zoals hij nu staat, mutatie voor mutatie:
 *    1. `share_moves_by_default: false` teruggezet          → grendel 1 rood.
 *    2. `'share_moves_by_default': false` (sleutel gequote) → grendel 4 rood.
 *    3. `...{ share_moves_by_default: false }` (inline)     → grendel 4 rood.
 *    4. `herinneringStandaard({ onboarded_at: null })`      → grendel 2 rood.
 *    5. `...herinneringVelden({ aan: true, … })`            → grendel 2 rood.
 *    6. `<TijdzoneKeuze …/>` uit het scherm gehaald         → grendel 5 rood.
 *    7. de knop "Klopt niet" uit het scherm gehaald         → grendel 5 rood.
 *    8. `supabase().from('profiles')` in het scherm         → grendel 3 rood.
 *    9. een import van `verwijderProfiel` uit `@/modules/auth` → grendel 3 rood.
 */
const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

/**
 * De velden die de onboarding met een vaste waarde mág schrijven, met de reden.
 *
 * ⚠️ **Een lijst met redenen en geen lijst met namen** — zelfde vorm als
 *    `MOET_EEN_SCHERM_HEBBEN` in `bereikbaar.test.ts`. Wie hier iets aan
 *    toevoegt zonder op te schrijven wélke vraag op het scherm die waarde
 *    oplevert, heeft een naam geparkeerd in plaats van een belofte vastgelegd.
 */
const UIT_EEN_VRAAG_OP_HET_SCHERM: Readonly<Record<string, string>> = {
  display_name: 'Het naamveld. De enige vraag die de gebruiker echt invult.',
  tz:
    'De regel "Tijdzone: … van je telefoon", met "Klopt niet" ernaast. De waarde ' +
    'komt uit het apparaat of uit het bestaande profiel, nooit uit een constante.',
};

/**
 * Helpers die een bestaand profiel respecteren en daarom gespreid mogen worden.
 *
 * ⚠️ `herinneringStandaard()` staat hier omdat hij lééés wat er staat: is de
 *    onboarding al gehad, dan geeft hij een leeg object terug. `herinneringVelden()`
 *    staat hier bewust níét — die schrijft altijd, en zou de herinnering van wie
 *    hem uitzette terugzetten op 20:00.
 */
const RESPECTEERT_HET_PROFIEL: Readonly<
  Record<string, { readonly reden: string; readonly leest: RegExp }>
> = {
  herinneringStandaard: {
    reden: 'Geeft {} zodra `onboarded_at` gevuld is, dus schrijft nooit over een keuze heen.',
    // ⚠️ **De naam van de helper is niet de belofte.** Zonder deze eis blijft
    //    `herinneringStandaard({ onboarded_at: null })` groen — één woord korter,
    //    leest als "de onboarding-standaard", en zet vanaf dat moment de
    //    herinnering van iedereen die hem uitzette terug op 20:00. Gemeten in de
    //    security-review van 03-09; het was de enige mutatie die er doorheen kwam.
    leest: /\bprofiel\b/,
  },
  patchUitVragenlijst: {
    reden:
      'Neemt alleen de vier antwoorden op die de gebruiker op de vragenlijst gaf, en ' +
      'laat een onbeantwoorde vraag weg in plaats van hem leeg te schrijven.',
    // De invoer van het formulier, en dus per definitie wat de gebruiker antwoordde.
    leest: /\binvoer\b/,
  },
};

function bestanden(map: string): string[] {
  const pad = join(WORTEL, map);
  const gevonden: string[] = [];

  for (const naam of readdirSync(pad)) {
    const vol = join(pad, naam);
    if (statSync(vol).isDirectory()) {
      gevonden.push(...bestanden(join(map, naam)));
    } else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) {
      gevonden.push(join(map, naam));
    }
  }

  return gevonden;
}

/**
 * Commentaar weg, zodat de accolades erin niet meetellen.
 *
 * ⚠️ **Stringliteralen blijven staan, en dat is een bekende grens.** Stond hier
 *    eerst "en tekst tussen aanhalingstekens" bij, en dat deed deze functie niet.
 *    Zodra er een `'https://…'` in `app/onboarding/**` komt te staan, eet de
 *    regel-commentaarregex de rest van die regel op — inclusief een `}`. Wat dat
 *    vandaag ophoudt, is grendel 4: een stuk dat deze parser niet leest, is een
 *    rode test en geen stilte.
 */
function ontdaanVanCommentaar(bron: string): string {
  return bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Wat er als tweede argument aan `updateProfiel()` meegaat, per aanroep.
 *
 * ⚠️ **De haakjes van de aanroep begrenzen de zoektocht, niet de eerste accolade
 *    die je tegenkomt.** Zonder die grens pakte deze functie bij
 *    `updateProfiel(userId, patchUitVragenlijst(invoer))` het blok van de `if`
 *    dat erná staat, en meldde `setFout` als profielveld. Een controle die
 *    onzin meldt, leer je negeren.
 */
type Argument = { literaal: string } | { helper: string; binnen: string };

function argumenten(bron: string): readonly Argument[] {
  const schoon = ontdaanVanCommentaar(bron);
  const gevonden: Argument[] = [];

  let vanaf = schoon.indexOf('updateProfiel(');
  while (vanaf !== -1) {
    const open = schoon.indexOf('(', vanaf);
    let diepte = 0;
    let sluit = -1;

    for (let i = open; i < schoon.length; i += 1) {
      if (schoon[i] === '(') diepte += 1;
      else if (schoon[i] === ')') {
        diepte -= 1;
        if (diepte === 0) {
          sluit = i;
          break;
        }
      }
    }

    const binnen = sluit === -1 ? '' : schoon.slice(open + 1, sluit);
    const komma = binnen.indexOf(',');
    const tweede = komma === -1 ? '' : binnen.slice(komma + 1).trim();

    if (tweede.startsWith('{')) {
      gevonden.push({ literaal: tweede.slice(1, tweede.lastIndexOf('}')) });
    } else {
      const helper = /^([A-Za-z_$][\w$]*)\s*\(/.exec(tweede);
      // Geen literaal en geen aanroep: dan is dit een vorm die deze controle niet
      // leest, en dat hoort een uitslag te zijn en geen stilte.
      gevonden.push({ helper: helper?.[1] ?? tweede, binnen: tweede });
    }

    vanaf = schoon.indexOf('updateProfiel(', vanaf + 1);
  }

  return gevonden;
}

/**
 * De sleutels en spreads op het bovenste niveau van zo'n literaal.
 *
 * ⚠️ **`onleesbaar` is geen restcategorie maar de belangrijkste uitvoer.** De
 *    eerste versie liet een stuk dat geen van beide regexes matchte stilletjes
 *    vallen, en dan glipten `'share_moves_by_default': false` (gequote sleutel),
 *    `['share_moves_by_default']: false` (berekend) en
 *    `...{ share_moves_by_default: false }` (inline spread) er alle drie
 *    doorheen — gemeten in de security-review van 03-09. Een controle die zwijgt
 *    waar hij zou moeten melden, is erger dan geen controle.
 */
function onderdelen(lichaam: string): {
  sleutels: string[];
  spreads: { naam: string; binnen: string }[];
  onleesbaar: string[];
} {
  const sleutels: string[] = [];
  const spreads: { naam: string; binnen: string }[] = [];
  const onleesbaar: string[] = [];

  let diepte = 0;
  let stuk = '';
  const stukken: string[] = [];

  for (const teken of lichaam) {
    if (teken === '{' || teken === '(' || teken === '[') diepte += 1;
    if (teken === '}' || teken === ')' || teken === ']') diepte -= 1;
    if (teken === ',' && diepte === 0) {
      stukken.push(stuk);
      stuk = '';
      continue;
    }
    stuk += teken;
  }
  stukken.push(stuk);

  for (const rauw of stukken) {
    const deel = rauw.trim();
    if (deel === '') continue;

    const spread = /^\.\.\.\s*([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)\s*$/.exec(deel);
    if (spread !== null) {
      spreads.push({ naam: spread[1] ?? '', binnen: spread[2] ?? '' });
      continue;
    }

    // Een spread zonder aanroep — `...VASTE_STANDAARD` of `...{ … }` — is geen
    // helper die het profiel leest, en hoort dus niet stil door te glippen.
    const kaleSpread = /^\.\.\.\s*([A-Za-z_$][\w$]*)\s*$/.exec(deel)?.[1];
    if (kaleSpread !== undefined) {
      spreads.push({ naam: kaleSpread, binnen: '' });
      continue;
    }

    // `display_name: naam` en de verkorte vorm `tz` zijn allebei een sleutel.
    const sleutel = /^([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(deel)?.[1];
    if (sleutel !== undefined) {
      sleutels.push(sleutel);
      continue;
    }

    onleesbaar.push(deel);
  }

  return { sleutels, spreads, onleesbaar };
}

const ONBOARDINGBESTANDEN = bestanden(join('app', 'onboarding'));

const SCHRIJVERS = ONBOARDINGBESTANDEN.map((pad) => ({
  pad,
  bron: readFileSync(join(WORTEL, pad), 'utf8'),
})).filter((b) => b.bron.includes('updateProfiel('));

describe('de onboarding schrijft alleen wat ze vraagt', () => {
  it('vindt het scherm dat het profiel schrijft', () => {
    // ⚠️ Zonder deze regel is de hele suite hieronder groen zodra het scherm
    //    verhuist of hernoemd wordt — de vorm waar CLAUDE.md regel 18 vraag 4
    //    naar vraagt. Een lege lijst is geen uitslag.
    expect(SCHRIJVERS.length).toBeGreaterThan(0);
  });

  for (const { pad, bron } of SCHRIJVERS) {
    it(`${pad} levert een leesbare patch aan updateProfiel`, () => {
      // Geen enkele aanroep gevonden betekent dat de vorm veranderd is en deze
      // controle niets meer leest. Dat is een uitslag, geen stilte.
      expect(argumenten(bron).length).toBeGreaterThan(0);
    });

    // Grendel 1: geen enkel veld met een vaste waarde erbij.
    it(`${pad} schrijft geen veld dat de gebruiker niet ziet`, () => {
      for (const arg of argumenten(bron)) {
        if (!('literaal' in arg)) continue;

        for (const sleutel of onderdelen(arg.literaal).sleutels) {
          expect(
            Object.keys(UIT_EEN_VRAAG_OP_HET_SCHERM),
            `\`${sleutel}\` staat in de patch van ${pad} zonder vraag op het scherm. ` +
              'Wie hier per ongeluk belandt, raakt die waarde kwijt.',
          ).toContain(sleutel);
        }
      }
    });

    // Grendel 2: elke helper die velden aanlevert, kríjgt het bestaande profiel
    // te zien. De naam alleen is de belofte niet.
    it(`${pad} laat alleen helpers schrijven die het bestaande profiel lezen`, () => {
      for (const arg of argumenten(bron)) {
        const aanroepen =
          'literaal' in arg
            ? onderdelen(arg.literaal).spreads
            : [{ naam: arg.helper, binnen: arg.binnen }];

        for (const { naam, binnen } of aanroepen) {
          const afspraak = RESPECTEERT_HET_PROFIEL[naam];

          expect(
            Object.keys(RESPECTEERT_HET_PROFIEL),
            `\`${naam}()\` schrijft ongevraagd velden in ${pad}. Alleen een helper ` +
              'die alleen aanlevert wat de gebruiker antwoordde, mag hier staan.',
          ).toContain(naam);
          if (afspraak === undefined) continue;

          expect(
            binnen,
            `\`${naam}()\` krijgt in ${pad} niet het bestaande profiel mee. Met een ` +
              'vaste waarde als argument schrijft hij over andermans keuze heen, en ' +
              'dan bewaakt zijn naam op de lijst hierboven niets.',
          ).toMatch(afspraak.leest);
        }
      }
    });

    // Grendel 4: wat deze parser niet leest, is rood en niet stil.
    it(`${pad} schrijft in een vorm die deze controle kan lezen`, () => {
      for (const arg of argumenten(bron)) {
        if (!('literaal' in arg)) continue;

        expect(
          onderdelen(arg.literaal).onleesbaar,
          `Een stuk van de patch in ${pad} is geen kale sleutel en geen spread van ` +
            'een helper. Een gequote of berekende sleutel glipt dan langs grendel 1 ' +
            'en een inline spread langs grendel 2, allebei zonder uitslag.',
        ).toEqual([]);
      }
    });
  }
});

/**
 * Wat een onboardingscherm uit `@/modules/auth` mag halen, met de reden.
 *
 * ⚠️ **Waarom een lijst en niet alleen de patch van `updateProfiel()`.** Dat
 *    scherm schrijft langs twee andere wegen ook naar `profiles`:
 *    `zetWeekStartdag()` zet `week_start_day` en `rondOnboardingAf()` zet
 *    `onboarded_at` en `wants_own_goal`. Wie een veld uit de patch naar één van
 *    die twee verplaatst, of er een derde bij haalt, breekt dezelfde belofte
 *    zonder dat grendel 1 iets ziet. Gevonden in de security-review van 03-09.
 */
const MAG_IN_DE_ONBOARDING: Readonly<Record<string, string>> = {
  updateProfiel: 'De patch die grendel 1 en 2 kort houden.',
  zetWeekStartdag: 'Klok 1, met de lopende weekdoelen mee. Komt uit `WeekStartKeuze`.',
  rondOnboardingAf: 'Zet `onboarded_at` en `wants_own_goal` — de vraag "waarvoor kom je".',
  useProfiel: 'Alleen lezen: het profiel waar de initialisatoren mee vullen.',
  useSession: 'Alleen lezen: het id van de ingelogde gebruiker.',
  userClock: 'Puur rekenwerk over de klok, schrijft niets.',
};

/**
 * Grendel 3: er is geen derde weg van dit scherm naar `profiles`.
 */
describe('de onboarding heeft geen schrijfpad buiten de datalaag om', () => {
  for (const pad of ONBOARDINGBESTANDEN) {
    it(`${pad} gaat niet rechtstreeks naar de tabel`, () => {
      // Een scherm dat zelf `from('profiles')` doet, staat buiten `updateProfiel()`
      // en dus buiten `profielPatchSchema` — en buiten elke grendel hierboven.
      expect(readFileSync(join(WORTEL, pad), 'utf8')).not.toContain("from('profiles')");
    });

    it(`${pad} haalt alleen bekende dingen uit @/modules/auth`, () => {
      const bron = ontdaanVanCommentaar(readFileSync(join(WORTEL, pad), 'utf8'));
      const invoer = /import\s*\{([^}]*)\}\s*from\s*'@\/modules\/auth'/.exec(bron)?.[1];
      if (invoer === undefined) return;

      for (const rauw of invoer.split(',')) {
        const naam = rauw.trim().replace(/^type\s+/, '');
        if (naam === '') continue;

        expect(
          Object.keys(MAG_IN_DE_ONBOARDING),
          `${pad} haalt \`${naam}\` uit de auth-module. Schrijft die naar \`profiles\`? ` +
            'Zet hem dan met een reden op de lijst, of laat hem weg.',
        ).toContain(naam);
      }
    });
  }
});

/**
 * Grendel 5: de tijdzone is een regel tekst geworden, geen doodlopende weg.
 *
 * ⚠️ Dit is de keten uit QS8-27 nog een keer. Daar bestond `tijdzoneSchema`,
 *    nam `updateProfiel()` `tz` al mee, stond `isGeldigeTijdzone()` klaar — en
 *    was er geen scherm. Wie de zone samenvouwt tot één regel en de knop ernaast
 *    weglaat, knipt dezelfde keten door: telefoon verkeerd, en geen weg terug.
 */
describe('de tijdzone blijft corrigeerbaar in de onboarding', () => {
  it('het onboardingscherm heeft de regel, de knop én het zoekveld', () => {
    const schermen = ONBOARDINGBESTANDEN.filter((pad) =>
      readFileSync(join(WORTEL, pad), 'utf8').includes("t('onboarding.tijdzone_van_telefoon'"),
    );

    expect(
      schermen.length,
      'Geen scherm toont de tijdzone van de telefoon. Verhuisd, of weggevallen?',
    ).toBeGreaterThan(0);

    for (const pad of schermen) {
      const bron = readFileSync(join(WORTEL, pad), 'utf8');
      expect(
        bron,
        `${pad} toont de tijdzone maar rendert geen \`TijdzoneKeuze\`. Dan is een ` +
          'verkeerde apparaatzone niet meer recht te zetten.',
      ).toContain('<TijdzoneKeuze');

      // ⚠️ **De component staat achter een vlag, dus zijn aanwezigheid is de
      //    helft van het pad.** Haalt iemand de knop "Klopt niet" weg, dan staat
      //    `<TijdzoneKeuze` er nog letterlijk terwijl niemand hem ooit te zien
      //    krijgt — de keten van QS8-27 opnieuw doorgeknipt, en de vorige versie
      //    van deze grendel bleef daarbij groen.
      expect(
        bron,
        `${pad} toont de tijdzone zonder knop om hem open te klappen. De component ` +
          'staat achter een vlag; zonder zetter is hij onbereikbaar.',
      ).toContain("t('onboarding.tijdzone_klopt_niet')");
    }
  });
});
