/**
 * Welke acties een weekdoel of een doel aanbiedt, en wat elke actie kost.
 *
 * Puur, zonder renderer — zelfde reden als `metrics.ts`: dit is de plek waar
 * "wat mag je hier doen" één keer bedacht wordt, zodat het niet in elk scherm
 * opnieuw gebeurt. Elke actie hier raakt geschiedenis of punten, en dan moet de
 * tekst zeggen wát het kost voordat iemand drukt.
 *
 * ⚠️ **De bedenktijd staat hier niet als getal.** De database kent hem
 *    (`bedenktijd()`, nu 24 uur) en de RPC's geven `te_oud` terug zodra hij
 *    verstreken is. Een kopie in TypeScript zou de tweede plek zijn waar
 *    hetzelfde getal staat, en in dit project zijn twee kopieën al een keer
 *    geruisloos uit elkaar gelopen — vandaar dat `weekpas_maximum()` ook
 *    bewust alleen in de database staat (Q-TODO A32). Verwijderen wordt daarom
 *    aangeboden zolang de stáát het toelaat; of de tijd het toelaat, beslist de
 *    database, en de melding die terugkomt wijst naar afsluiten.
 */

import type { WeeklyGoalStatus } from './metrics';

export interface WeekdoelActies {
  /** Indienen of opnieuw indienen. */
  readonly afronden: boolean;
  /** Bewust afsluiten: je gaat deze week niet halen. Kost een punt na afloop. */
  readonly afsluiten: boolean;
  /** Weggooien binnen de bedenktijd. Alleen voor een vergissing. */
  readonly verwijderen: boolean;
  /** Een gemiste week meenemen naar deze week. */
  readonly doorschuiven: boolean;
}

const GEEN: WeekdoelActies = {
  afronden: false,
  afsluiten: false,
  verwijderen: false,
  doorschuiven: false,
};

/**
 * Wat je met een weekdoel kunt op grond van zijn status.
 *
 * ⚠️ De statussen die hier niets teruggeven, geven niets terug omdat de database
 *    het toch zou weigeren — niet omdat het scherm het onhandig vindt. Een knop
 *    tonen die gegarandeerd faalt is erger dan geen knop: de gebruiker leert dan
 *    dat de app onbetrouwbaar is in plaats van dat deze handeling niet kan.
 *
 * ⚠️ `cancelled` biedt bewust níéts. Het is een week die je zelf hebt afgesloten
 *    en die bij het verstrijken van de cyclus door de rollover op `missed` wordt
 *    gezet. Doorschuiven kan dan alsnog. Zou `cancelled` hier al doorschuiven
 *    aanbieden, dan was afsluiten een gratis manier om onder het minpunt uit te
 *    komen — precies het gat dat A39 en A40 dichtgezet hebben.
 */
export function weekdoelActies(status: WeeklyGoalStatus): WeekdoelActies {
  switch (status) {
    case 'todo':
      return { afronden: true, afsluiten: true, verwijderen: true, doorschuiven: false };

    // Ingediend en wachtend op een buddy. Opnieuw indienen mag — dat is het
    // antwoord op "vertel me meer" — maar afsluiten en verwijderen niet: er
    // hangt een voltooiing aan, en die is append-only (domeinregel 6).
    case 'pending':
      return { ...GEEN, afronden: true };

    // Alleen doorschuiven, en pas nadat de rollover de week als gemist heeft
    // afgestempeld. Dat is de volgorde die A39 afdwingt.
    case 'missed':
      return { ...GEEN, doorschuiven: true };

    // Goedgekeurd, al doorgeschoven, vrijgesteld met een weekpas of adempauze,
    // of zelf afgesloten: klaar. Zie de tweede waarschuwing hierboven voor
    // waarom `cancelled` hier staat en niet bij `missed`.
    case 'approved':
    case 'carried':
    case 'excused':
    case 'cancelled':
      return GEEN;
  }
}

export interface BevestigingsTekst {
  readonly titel: string;
  /** Wat er gebeurt en wat het kost. Nooit alleen "weet je het zeker?". */
  readonly uitleg: string;
  /** Het label van de knop die doorzet. */
  readonly bevestig: string;
}

/**
 * ⚠️ Elke tekst hier noemt de prijs, en dat is de hele reden dat deze constante
 *    bestaat. "Weet je het zeker?" is geen bevestiging maar een drempel: het
 *    voegt een klik toe zonder één feit toe te voegen. Afsluiten kost een punt
 *    zodra de week voorbij is, en dat mag geen verrassing zijn die je pas op je
 *    dashboard ontdekt (Q-TODO A33 beschrijft precies dat probleem bij de
 *    weekpas).
 */
export const BEVESTIGING = {
  weekdoelAfsluiten: {
    titel: 'Deze week afsluiten?',
    uitleg:
      'Het weekdoel blijft staan en telt als een gemiste week zodra je week voorbij is. ' +
      'Dat kost één punt en onderbreekt je reeks — tenzij je er een weekpas op zet. ' +
      'Je kunt hem daarna doorschuiven naar volgende week.',
    bevestig: 'Afsluiten',
  },
  weekdoelVerwijderen: {
    titel: 'Dit weekdoel weggooien?',
    uitleg:
      'Alleen bedoeld voor een vergissing: een dubbele invoer, of een weekdoel onder het ' +
      'verkeerde doel. De rij verdwijnt en er blijft niets van staan. Kan alleen kort na ' +
      'het aanmaken en zolang je nog niets hebt ingediend.',
    bevestig: 'Weggooien',
  },
  weekdoelDoorschuiven: {
    titel: 'Meenemen naar deze week?',
    uitleg:
      'Je krijgt hetzelfde weekdoel opnieuw in de week die nu loopt. ' +
      '⚠️ De gemiste week blijft gemist: het punt is al geboekt en je reeks is al ' +
      'onderbroken. Doorschuiven verhuist het werk, het repareert je reeks niet.',
    bevestig: 'Meenemen',
  },
  doelVerwijderen: {
    titel: 'Dit doel weggooien?',
    uitleg:
      'Alleen bedoeld voor een doel dat je net per ongeluk hebt aangemaakt. Het kan zolang ' +
      'er niets aan hangt: geen weekdoelen, geen punten, niet gedeeld met een groep. ' +
      'Heeft je doel wél geschiedenis, archiveer het dan — dan blijft alles bewaard.',
    bevestig: 'Weggooien',
  },
  doelAfronden: {
    titel: 'Dit doel afronden?',
    uitleg:
      'Elke groep waaraan dit doel hangt, krijgt een bericht dat je het afgerond hebt, en een ' +
      'chatbericht haal je niet meer weg. Je beloning komt vrij en wordt ook gemeld; een straf ' +
      'die je had ingesteld, vervalt. Terugzetten kan niet.',
    bevestig: 'Afronden',
  },
} as const satisfies Record<string, BevestigingsTekst>;
