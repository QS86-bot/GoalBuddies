import { daysBetween, type IsoDate } from '../../shared/time';

import { heldVoorTrigger, type Heldsleutel, type Trigger } from './helden';

/**
 * Wie er spreekt — QS8-475, epic QS8-468.
 *
 * ⚠️⚠️ **Eén functie, en acceptatiecriterium 1 zegt dat met zoveel woorden: geen
 *    enkele oproeper rekent dit zelf uit.** Dat is geen netheid. De
 *    prioriteitsregel uit het brondocument — *een specifieke trigger gaat altijd
 *    vóór de hoofdheld* — is een eigenschap van het gehéél, en elke oproeper die
 *    hem zelf toepast is een plek waar hij kan gaan afwijken. Precies de klasse
 *    waar onwrikbare regel 18 over gaat.
 *
 * ⚠️ **Dit bestand leunt alleen op `helden.ts` en `shared/time`, en dat is de
 *    voorwaarde om mee te gaan naar Deno.** De meldingenjob draait daar, en
 *    `edge:sync` neemt allebei die mappen al mee. Alles wat een catalogussleutel
 *    of een databaseclient aanraakt, hoort er dus buiten.
 */

/** Vanaf hoeveel dagen stilte Lucerna het overneemt van Ignis. */
export const STILTEDREMPEL_DAGEN = 3;

/**
 * Welke van de twee tegenslagtriggers hier hoort: `misser` of `stilte`.
 *
 * ⚠️⚠️ **Dit is acceptatiecriterium 2 en er is geen uitzondering op.** "Drie
 *    dagen geen activiteit" is een tijdberekening, en correctheidsregel 7 laat
 *    die alleen in `shared/time` toe — vandaar `daysBetween()` en geen eigen
 *    aftrekking op twee datums. Allebei de datums zijn lokale datums van de
 *    gebruiker; wie ze aanlevert, heeft ze met `localDateOf()` uit een timestamp
 *    gehaald.
 *
 * ⚠️ **De reden dat dit ertoe doet, staat in het brondocument zelf:** Lucerna
 *    neemt het over "om te voorkomen dat de app als bestraffend aanvoelt bij een
 *    langere dip". Slaat de grens een dag te vroeg of te laat om, dan krijgt
 *    iemand in een dip precies de stem die het issue daar weg wilde hebben. Een
 *    reeks die om middernacht verkeerd breekt kost je een gebruiker, en dit doet
 *    hetzelfde.
 *
 * ⚠️ Bij gelijke datums is de afstand nul en is het `misser` — dat is dag 1 van
 *    een onderbroken reeks en niet "stilte".
 */
export function tegenslagtrigger(laatsteActiviteit: IsoDate, vandaag: IsoDate): Trigger {
  return daysBetween(laatsteActiviteit, vandaag) >= STILTEDREMPEL_DAGEN ? 'stilte' : 'misser';
}

/**
 * Waarom deze held spreekt.
 *
 * ⚠️ Dit is geen decoratie maar wat `hero_appearances.trigger` moet dragen, en
 *    dat is een kolom met een CHECK. Een verschijning zonder trigger is niet weg
 *    te schrijven, dus de keuze en de reden komen hier samen naar buiten.
 */
export type Stemreden =
  /** Een specifieke gebeurtenis riep deze held op. */
  | 'trigger'
  /** Geen specifieke gebeurtenis; de hoofdheld uit de quiz neemt het woord. */
  | 'hoofdheld';

export type Stem =
  | { readonly soort: 'held'; readonly held: Heldsleutel; readonly reden: Stemreden; readonly trigger: Trigger }
  /** Geen held: de gebruiker sloeg de quiz over en er is geen trigger. */
  | { readonly soort: 'geen' };

/**
 * De held die bij dit moment hoort.
 *
 * `trigger` is de gebeurtenis als er een specifieke is, en `null` voor "al het
 * overige". `hoofdheld` is wat er in `hero_profiles` staat, of `null` als de
 * gebruiker de quiz oversloeg.
 *
 * ⚠️ **De prioriteit staat hier en nergens anders.** Een specifieke trigger
 *    wint van de hoofdheld, altijd. Het brondocument noemt dat de
 *    prioriteitsregel; hieronder is het één `if` die je kunt breken en zien
 *    omvallen.
 *
 * ⚠️ **`geen` is een geldig antwoord en geen fout** — acceptatiecriterium 6.
 *    Wie de quiz oversloeg krijgt bij een trigger gewoon de triggerheld, en bij
 *    "al het overige" niets; de oproeper valt dan terug op de bestaande
 *    neutrale toon. Geen foutmelding, en vooral geen lege naam in een bericht.
 */
export function kiesStem(trigger: Trigger | null, hoofdheld: Heldsleutel | null): Stem {
  if (trigger !== null) {
    return { soort: 'held', held: heldVoorTrigger(trigger).sleutel, reden: 'trigger', trigger };
  }

  if (hoofdheld === null) return { soort: 'geen' };

  // ⚠️ **`tussendoor` als trigger van een hoofdheld-verschijning, en dat is een
  //    keuze met een reden.** `hero_appearances.trigger` draagt een CHECK met
  //    zes waarden; er is er geen voor "gewoon de hoofdheld". `tussendoor` is de
  //    enige die geen gebeurtenis beschrijft maar een moment, en dat is precies
  //    wat dit is.
  //
  //    ⚠️ Het gevolg is dat een verschijning van de hoofdheld in de tabel niet
  //       te onderscheiden is van een Quip-verschijning. Dat is vandaag geen
  //       verlies — de tabel bestaat om "is er vandaag al een held geweest" te
  //       beantwoorden, en dáárvoor telt elke rij gelijk. Wordt er ooit op
  //       trigger gerapporteerd, dan is een zevende CHECK-waarde de reparatie en
  //       niet een tweede betekenis voor deze.
  return { soort: 'held', held: hoofdheld, reden: 'hoofdheld', trigger: 'tussendoor' };
}

/**
 * Mag deze verschijning getoond worden, gegeven wat er vandaag al langs kwam?
 *
 * De regel uit het brondocument: **niet twee helden op dezelfde dag, behalve bij
 * een grote mijlpaal** — dan mag de hoofdheld plus Strix samen.
 *
 * ⚠️ **`alGeweestVandaag` is een getal en geen boolean, want de uitzondering
 *    heeft een bovengrens nodig.** Bij een mijlpaal mogen er twee; bij drie
 *    mijlpalen op één dag niet drie. Met een boolean is "al geweest" waar na de
 *    eerste en is er geen verschil meer tussen twee en vijf.
 *
 * ⚠️ **De dag is de dag van de gebruiker en niet UTC** — acceptatiecriterium 3.
 *    Deze functie krijgt het getal aangereikt; wíe het telt, telt het met
 *    `shared/time`. Dat staat hier bewust niet, want dan zou dit bestand een
 *    tijdberekening doen en correctheidsregel 7 laat dat alleen in `shared/time`
 *    toe.
 */
export function magVerschijnen(stem: Stem, alGeweestVandaag: number): boolean {
  if (stem.soort === 'geen') return false;
  if (alGeweestVandaag === 0) return true;

  // ⚠️ De uitzondering is de mijlpaal en niets anders. Zij bestaat omdat een
  //    behaalde mijlpaal het enige moment is waarop een tweede stem iets
  //    toevoegt in plaats van te storen.
  return stem.trigger === 'mijlpaal' && alGeweestVandaag === 1;
}
