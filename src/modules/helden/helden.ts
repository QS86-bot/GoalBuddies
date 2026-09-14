import type { Sleutel } from '../../shared/i18n';

/**
 * De zes helden — QS8-469, epic QS8-468.
 *
 * ⚠️ **Dit bestand is het register en de enige plek waar een held ontstaat.**
 *    QS8-471 zet deze sleutels in een CHECK, QS8-475 beeldt er een trigger op
 *    af, QS8-474 telt er punten voor. Geen van die drie definieert ze opnieuw.
 *    Een tweede lijst die uit elkaar loopt zonder dat iets rood wordt is de
 *    fout die dit project met `sleutelzetters()` bijna drie sleutels kostte
 *    (QS8-358) en met 0032/0034 al eens gemaakt heeft.
 *
 * ⚠️ **De namen zijn eigen IP en geen verwijzing — besluit 1 van 14-09-2026.**
 *    De historische figuur blijft zichtbaar als bronvermelding onder een quote,
 *    nooit als naam van het personage. Dat is niet cosmetisch: het haalt de
 *    beeldrechtenvraag rond Ali bij de wortel weg in plaats van hem te omzeilen.
 *    Onderbouwing in
 *    `docs/decisions/2026-09-14-zes-helden-en-de-zeven-besluiten-eronder.md` §1.
 *
 * ⚠️ **De sleutel van het kleurenpaar is de heldsleutel zelf, en er staat hier
 *    daarom géén apart veld voor.** QS8-469's acceptatiecriterium 1 noemde dat
 *    veld wel; het zou een kolom zijn die per definitie gelijk is aan de sleutel
 *    ernaast, en dat is de duplicatie die datzelfde criterium verbiedt
 *    ("verwijs, dupliceer niet"). QS8-470 sleutelt zijn tokenset op
 *    `Heldsleutel`. Wordt een palet ooit gedeeld of losgekoppeld, dán is een
 *    veld hier de goede plek — nu is het er een zonder informatie.
 */

/**
 * De zes sleutels, in de volgorde van het rooster in
 * `docs/superhelden-archetypes.md`.
 *
 * ⚠️ Deze volgorde is die van het brondocument en niet alfabetisch. Zij bepaalt
 *    de volgorde waarin een gebruiker de helden te zien krijgt bij een
 *    gelijkspel in de quiz (QS8-474), en dat is precies waarom hij vastligt: een
 *    lijst die per scherm anders sorteert, leest als zes verschillende lijsten.
 */
export const HELDSLEUTELS = ['strix', 'ignis', 'meridian', 'forge', 'lucerna', 'quip'] as const;

export type Heldsleutel = (typeof HELDSLEUTELS)[number];

/**
 * De zes momenten waarop een held het woord neemt.
 *
 * ⚠️ **Een trigger is geen gebeurtenis uit de app maar een categorie ervan.**
 *    `misser` dekt zowel een gemiste dag als dag 1-2 van een onderbroken reeks;
 *    QS8-475 beslist welke app-gebeurtenis op welke trigger uitkomt. Dat is daar
 *    één gedeelde functie en niet per oproeper — anders rekent elke melding het
 *    zelf uit en lopen ze uit elkaar.
 *
 * ⚠️ **`misser` en `stilte` zijn tegenslagsignalen.** Wie ziet dat Ignis langs
 *    is geweest, weet dat er iets gemist is. In een beschermde groep is dat
 *    precies wat domeinregel 7 buiten de deur houdt; alleen een open groep mag
 *    het zien, en dan via de RPC van QS8-477 en nooit via een policy — RLS kan
 *    geen kolommen beperken.
 */
export const TRIGGERS = [
  'mijlpaal',
  'misser',
  'nieuw_doel',
  'vastlopen',
  'stilte',
  'tussendoor',
] as const;

export type Trigger = (typeof TRIGGERS)[number];

export interface Held {
  readonly sleutel: Heldsleutel;
  readonly trigger: Trigger;
  /** Hoeveel quotes deze held heeft. Zie `quotes.ts` voor waarom dit een getal is. */
  readonly aantalQuotes: number;
}

/**
 * Het rooster.
 *
 * ⚠️ **Precies één held per trigger, en dat is een eigenschap van het gehéél.**
 *    De prioriteitsregel van QS8-475 ("een specifieke trigger gaat vóór de
 *    hoofdheld") gaat er stilzwijgend van uit dat een trigger één antwoord
 *    heeft. Twee helden op `misser` maakt die regel niet fout maar
 *    onbeantwoordbaar. `helden.test.ts` toetst het.
 */
export const HELDEN: readonly Held[] = [
  { sleutel: 'strix', trigger: 'mijlpaal', aantalQuotes: 4 },
  { sleutel: 'ignis', trigger: 'misser', aantalQuotes: 4 },
  { sleutel: 'meridian', trigger: 'nieuw_doel', aantalQuotes: 4 },
  { sleutel: 'forge', trigger: 'vastlopen', aantalQuotes: 3 },
  { sleutel: 'lucerna', trigger: 'stilte', aantalQuotes: 4 },
  { sleutel: 'quip', trigger: 'tussendoor', aantalQuotes: 3 },
] as const;

const OP_SLEUTEL: ReadonlyMap<Heldsleutel, Held> = new Map(HELDEN.map((h) => [h.sleutel, h]));

const OP_TRIGGER: ReadonlyMap<Trigger, Held> = new Map(HELDEN.map((h) => [h.trigger, h]));

export function isHeldsleutel(waarde: unknown): waarde is Heldsleutel {
  return typeof waarde === 'string' && (HELDSLEUTELS as readonly string[]).includes(waarde);
}

export function isTrigger(waarde: unknown): waarde is Trigger {
  return typeof waarde === 'string' && (TRIGGERS as readonly string[]).includes(waarde);
}

export function held(sleutel: Heldsleutel): Held {
  const gevonden = OP_SLEUTEL.get(sleutel);
  if (!gevonden) throw new Error(`onbekende heldsleutel: ${sleutel}`);
  return gevonden;
}

/**
 * De held die bij dit moment hoort.
 *
 * ⚠️ Faalt dicht bij een onbekende trigger, net als `sleutelzetters()`. Een
 *    stille `undefined` hier wordt in QS8-475 een melding zonder stem.
 */
export function heldVoorTrigger(trigger: Trigger): Held {
  const gevonden = OP_TRIGGER.get(trigger);
  if (!gevonden) throw new Error(`onbekende trigger: ${trigger}`);
  return gevonden;
}

/** De drie teksten die elke held zelf draagt, los van zijn quotes. */
export type Heldtekst = 'naam' | 'ondertitel' | 'persoonlijkheid';

/**
 * De catalogussleutel voor een tekst van een held.
 *
 * ⚠️ **Eén functie en geen drie.** Elke geëxporteerde functie zonder aanroeper
 *    is een rij in `BEKENDE_ONBEREIKBAAR`, en dat register mag alleen groeien
 *    met de reden erbij. Drie helpers die verschillen in één woord zijn drie
 *    rijen voor één gat.
 *
 * ⚠️ TypeScript ziet niet of de catalogus deze sleutel kent — hij wordt
 *    samengesteld. `helden.test.ts` legt elke afgeleide sleutel naast beide
 *    catalogi; zonder die toets staat er bij een typefout letterlijk
 *    de sleutel zelf op het scherm, want `t()` valt terug op de sleutel zelf.
 */
export function heldTekstSleutel(sleutel: Heldsleutel, veld: Heldtekst): Sleutel {
  return `held.${sleutel}.${veld}` as Sleutel;
}
