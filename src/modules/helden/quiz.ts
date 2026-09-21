import type { Sleutel } from '../../shared/i18n';

import { HELDSLEUTELS, type Heldbron, type Heldsleutel } from './helden';

/**
 * De vier heldenvragen — QS8-474, epic QS8-468.
 *
 * ⚠️⚠️ **Dit bestand geeft nooit "de winnaar" terug, en dat is de hele reden
 *    dat het bestaat.** Vier vragen over zes helden geeft maximaal 4 punten, en
 *    een uitslag van 1-1-1-1 over vier verschillende helden is geen randgeval
 *    maar een normale uitkomst. Het brondocument zei "toon de top 2"; dat is bij
 *    vier gelijke koplopers niet gedefinieerd. Besluit 7 van 14-09-2026: toon
 *    álle gedeelde koplopers en laat de gebruiker kiezen.
 *
 *    `koplopers()` geeft daarom een array terug, óók bij één winnaar. Een
 *    functie die soms een held en soms een lijst teruggeeft, is een functie
 *    waarvan elke aanroeper zelf moet raden welke van de twee hij vandaag heeft
 *    — en dan staat de aanname "er is er precies één" alsnog in de aanroeper.
 *    Regel 18, vraag 6.
 *
 * ⚠️ **De zes opties van een vraag zijn de zes helden zelf.** In het
 *    brondocument staan ze als A t/m F met een pijl naar een held; elke vraag
 *    noemt alle zes precies één keer. Die letters zijn een scoringshulp en geen
 *    UI-vorm, dus ze staan hier niet: de identiteit van een optie ís de held
 *    waar hij naar wijst. Dat haalt een hele foutklasse weg — een optie die naar
 *    de verkeerde held telt, kan niet meer bestaan — en het maakt de
 *    gelijkspeltoets hieronder eerlijk in plaats van toevallig.
 */

/**
 * De vier vragen, in de volgorde van het brondocument.
 *
 * ⚠️ De sleutels zijn Nederlands en de kolomwaarden van `hero_profiles` Engels;
 *    dat is hier geen inconsistentie maar dezelfde scheiding als overal in dit
 *    project — de database spreekt Engels, de code die erboven hangt Nederlands.
 *    Deze vier komen nooit in een database terecht: alleen de úítslag doet dat.
 */
export const HELDVRAGEN = ['aantrekking', 'tegenslag', 'motivatie', 'viering'] as const;

export type Heldvraag = (typeof HELDVRAGEN)[number];

/**
 * Per vraag de zes opties, in de volgorde waarin het brondocument ze noemt
 * (A t/m F).
 *
 * ⚠️ **De volgorde verschilt per vraag en dat is met opzet overgenomen.** In het
 *    brondocument staat bij elke vraag een andere held op A. Zou hier overal
 *    dezelfde volgorde staan, dan leest de vragenlijst als vier keer dezelfde
 *    vraag en ligt het antwoord op positie 1 vier keer bij dezelfde held — een
 *    positie-effect dat de uitslag stuurt zonder dat iemand dat besloten heeft.
 *
 * ⚠️ **Elke rij noemt alle zes de helden precies één keer**, en
 *    `quiz.test.ts` toetst dat in beide richtingen. Valt er bij een typefout een
 *    held weg, dan is die held onbereikbaar in die vraag en scoort hij
 *    structureel lager — een fout die niemand aan de uitslag ziet.
 */
export const HELDVRAAGOPTIES: Readonly<Record<Heldvraag, readonly Heldsleutel[]>> = {
  aantrekking: ['meridian', 'forge', 'strix', 'ignis', 'lucerna', 'quip'],
  tegenslag: ['ignis', 'quip', 'forge', 'lucerna', 'strix', 'meridian'],
  motivatie: ['ignis', 'meridian', 'forge', 'strix', 'lucerna', 'quip'],
  viering: ['quip', 'strix', 'meridian', 'lucerna', 'ignis', 'forge'],
};

/**
 * Wat de gebruiker geantwoord heeft.
 *
 * ⚠️ **Een overgeslagen vraag ontbreekt, hij is niet `null`.** Dat is dezelfde
 *    regel als `patchUitVragenlijst()`: overslaan wist niets. Zou een
 *    overgeslagen vraag `null` zijn, dan is "nog niet beantwoord" niet te
 *    onderscheiden van "bewust leeggemaakt", en dat verschil is precies wat
 *    acceptatiecriterium 2 van QS8-37 bewaakt.
 */
export type Heldantwoorden = Readonly<Partial<Record<Heldvraag, Heldsleutel>>>;

/** Een vragenlijst waarin alle vier de heldenvragen zijn overgeslagen. */
export const GEEN_HELDANTWOORDEN: Heldantwoorden = {};

/**
 * Eén punt per gekozen optie naar de held waar hij bij hoort.
 *
 * Geeft altijd alle zes de sleutels terug, ook die op nul staan — een lezer die
 * `scores[held]` opvraagt hoort geen `undefined` te krijgen voor een held die
 * gewoon niet gekozen is.
 */
export function heldScores(antwoorden: Heldantwoorden): Readonly<Record<Heldsleutel, number>> {
  const scores = Object.fromEntries(HELDSLEUTELS.map((s) => [s, 0])) as Record<Heldsleutel, number>;

  for (const vraag of HELDVRAGEN) {
    const gekozen = antwoorden[vraag];
    if (gekozen === undefined) continue;
    scores[gekozen] += 1;
  }

  return scores;
}

/**
 * Alle helden met de hoogste score.
 *
 * Eén antwoord geeft één koploper, 1-1-1-1 geeft er vier, en niets geeft er
 * nul. Dat laatste is acceptatiecriterium 3: wie alle vier de heldenvragen
 * overslaat krijgt géén held en géén foutmelding.
 *
 * ⚠️ **De lege uitslag is een apart geval en geen gevolg van de rekensom.**
 *    Zonder antwoorden staan alle zes op nul, en "alle helden met de hoogste
 *    score" is dan letterlijk alle zes. Dat is precies verkeerd: het scherm zou
 *    zes kaarten tonen aan iemand die net gezegd heeft dat hij dit niet wilde
 *    invullen. Vandaar de vroege uitgang op een maximum van nul.
 *
 * ⚠️ De volgorde is die van `HELDSLEUTELS` — de roostervolgorde van het
 *    brondocument — en niet die van de antwoorden. Anders krijgt de gebruiker
 *    zijn koplopers in de volgorde waarin hij toevallig geklikt heeft, en ziet
 *    dezelfde uitslag er twee keer anders uit.
 */
export function koplopers(antwoorden: Heldantwoorden): readonly Heldsleutel[] {
  const scores = heldScores(antwoorden);
  const hoogste = Math.max(...HELDSLEUTELS.map((s) => scores[s]));

  if (hoogste === 0) return [];

  return HELDSLEUTELS.filter((s) => scores[s] === hoogste);
}

/**
 * Wat de vragenlijst uiteindelijk oplevert: geen held, één held, of een
 * gelijkspel waarin de gebruiker zelf aan zet is.
 */
export type Heldkeuze =
  | { readonly soort: 'geen' }
  | { readonly soort: 'quiz'; readonly held: Heldsleutel }
  | {
      readonly soort: 'gelijkspel';
      readonly koplopers: readonly Heldsleutel[];
      readonly gekozen: Heldsleutel | null;
    };

/**
 * De uitslag, met de keuze van de gebruiker erin verwerkt.
 *
 * ⚠️⚠️ **Een eerdere keuze telt alleen als hij nog koploper ís.** Dit is het
 *    randgeval dat een scherm stilzwijgend fout doet: de gebruiker krijgt een
 *    gelijkspel, kiest Lucerna, gaat terug om vraag 2 te wijzigen, en nu is
 *    Lucerna geen koploper meer. Zou de keuze blijven staan, dan bewaart het
 *    scherm een held die zijn eigen antwoorden tegenspreken — en de gebruiker
 *    ziet dat niet, want hij kijkt naar de vraag die hij net wijzigde.
 *
 *    Daarom staat deze functie hier en niet in het scherm: het is de enige
 *    plek waar het geval te voeden is zonder een scherm te monteren.
 *
 * ⚠️ Bij precies één koploper is `gekozen` niet eens gevraagd — er valt niets te
 *    kiezen. De bron is dan `quiz` en niet `keuze`, ook als de gebruiker eerder
 *    bij een gelijkspel wél iets aanwees.
 */
export function heldkeuze(
  antwoorden: Heldantwoorden,
  gekozen: Heldsleutel | null,
): Heldkeuze {
  const kop = koplopers(antwoorden);

  if (kop.length === 0) return { soort: 'geen' };
  if (kop.length === 1) return { soort: 'quiz', held: kop[0] as Heldsleutel };

  return {
    soort: 'gelijkspel',
    koplopers: kop,
    gekozen: gekozen !== null && kop.includes(gekozen) ? gekozen : null,
  };
}

/**
 * Wat er van een uitslag naar `hero_profiles` gaat, of `null` als er niets te
 * bewaren valt.
 *
 * ⚠️ **Een onbeslist gelijkspel bewaart niets, en dat is geen fout.** De
 *    gebruiker heeft de vragen beantwoord maar nog niet gekozen; "Bewaren"
 *    slaat dan zijn vragenlijst op en laat de held leeg, precies zoals wanneer
 *    hij de heldenvragen had overgeslagen. Een keuze afdwingen zou van
 *    overslaan een doodlopende weg maken, en dat is wat
 *    acceptatiecriterium 2 van QS8-37 verbiedt.
 */
export function teBewarenHeld(keuze: Heldkeuze): { held: Heldsleutel; bron: Heldbron } | null {
  if (keuze.soort === 'quiz') return { held: keuze.held, bron: 'quiz' };
  if (keuze.soort === 'gelijkspel' && keuze.gekozen !== null) {
    return { held: keuze.gekozen, bron: 'keuze' };
  }
  return null;
}

/**
 * De catalogussleutels van de vier vragen, voluit.
 *
 * ⚠️⚠️ **Voluit en niet samengesteld, en dat is een besluit met twee redenen.**
 *
 *    1. **TypeScript toetst ze.** Een samengestelde sleutel moet met
 *       `as Sleutel` de typecontrole in worden gepraat, en dan ziet niets een
 *       typefout: `t()` valt bij een onbekende sleutel terug op de sleutel zelf,
 *       en dan staat `heldvraag.viering.optie.qiup` letterlijk op het scherm.
 *       Hieronder is elke waarde een `Sleutel`-literal, dus een typefout is een
 *       rode `tsc` en geen scherm met een sleutel erop.
 *    2. **`npm run catalogus:controle` ziet ze.** Die controle volgt een
 *       template-literal alleen als hij **direct in `t()`** staat — een helper
 *       die er een teruggeeft, kan hij niet volgen. 📏 Dat is precies waarom er
 *       na QS8-469 tweeënzestig `held.*`-sleutels in `NOG_NIET_AANGESLOTEN`
 *       staan met de reden "nog geen scherm", terwijl de échte reden was dat de
 *       controle de helper niet kan volgen. Een register waarin de reden iets
 *       anders zegt dan wat er aan de hand is, is duurder dan geen register.
 *
 * ⚠️ De prijs is dat de vier vragen hier twee keer staan: als volgorde in
 *    `HELDVRAAGOPTIES` en als sleutel hieronder. `quiz.test.ts` legt ze naast
 *    elkaar — een optie zonder sleutel en een sleutel zonder optie worden
 *    allebei rood.
 */
const VRAAGSLEUTELS: Readonly<
  Record<
    Heldvraag,
    {
      readonly vraag: Sleutel;
      readonly toelichting: Sleutel;
      readonly optie: Readonly<Record<Heldsleutel, Sleutel>>;
    }
  >
> = {
  aantrekking: {
    vraag: 'heldvraag.aantrekking.vraag',
    toelichting: 'heldvraag.aantrekking.toelichting',
    optie: {
      meridian: 'heldvraag.aantrekking.optie.meridian',
      forge: 'heldvraag.aantrekking.optie.forge',
      strix: 'heldvraag.aantrekking.optie.strix',
      ignis: 'heldvraag.aantrekking.optie.ignis',
      lucerna: 'heldvraag.aantrekking.optie.lucerna',
      quip: 'heldvraag.aantrekking.optie.quip',
    },
  },
  tegenslag: {
    vraag: 'heldvraag.tegenslag.vraag',
    toelichting: 'heldvraag.tegenslag.toelichting',
    optie: {
      ignis: 'heldvraag.tegenslag.optie.ignis',
      quip: 'heldvraag.tegenslag.optie.quip',
      forge: 'heldvraag.tegenslag.optie.forge',
      lucerna: 'heldvraag.tegenslag.optie.lucerna',
      strix: 'heldvraag.tegenslag.optie.strix',
      meridian: 'heldvraag.tegenslag.optie.meridian',
    },
  },
  motivatie: {
    vraag: 'heldvraag.motivatie.vraag',
    toelichting: 'heldvraag.motivatie.toelichting',
    optie: {
      ignis: 'heldvraag.motivatie.optie.ignis',
      meridian: 'heldvraag.motivatie.optie.meridian',
      forge: 'heldvraag.motivatie.optie.forge',
      strix: 'heldvraag.motivatie.optie.strix',
      lucerna: 'heldvraag.motivatie.optie.lucerna',
      quip: 'heldvraag.motivatie.optie.quip',
    },
  },
  viering: {
    vraag: 'heldvraag.viering.vraag',
    toelichting: 'heldvraag.viering.toelichting',
    optie: {
      quip: 'heldvraag.viering.optie.quip',
      strix: 'heldvraag.viering.optie.strix',
      meridian: 'heldvraag.viering.optie.meridian',
      lucerna: 'heldvraag.viering.optie.lucerna',
      ignis: 'heldvraag.viering.optie.ignis',
      forge: 'heldvraag.viering.optie.forge',
    },
  },
};

/** De catalogussleutel voor de vraagtekst of de toelichting eronder. */
export function heldvraagTekstSleutel(vraag: Heldvraag, veld: 'vraag' | 'toelichting'): Sleutel {
  return VRAAGSLEUTELS[vraag][veld];
}

/** De catalogussleutel voor één antwoordoptie. */
export function heldoptieTekstSleutel(vraag: Heldvraag, held: Heldsleutel): Sleutel {
  return VRAAGSLEUTELS[vraag].optie[held];
}
