import { t, type Sleutel } from '../i18n';

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
/**
 * De bevestigingsteksten, uit de catalogus — QS8-113.
 *
 * ⚠️ **Een functie en geen constante, en dat is het hele verschil.** De teksten
 *    hangen sinds QS8-113 van de ingestelde taal af, dus een `const` zou de taal
 *    vastleggen op het moment dat deze module voor het eerst geïmporteerd wordt —
 *    en dat is vóórdat het profiel geladen is. Iemand met Engels ingesteld zou
 *    dan Nederlandse bevestigingen krijgen tot hij de app herstart.
 *
 * ⚠️ De sleutels blijven hetzelfde (`weekdoelAfsluiten` en niet
 *    `bevestiging.weekdoel_afsluiten`), zodat de aanroepers ongemoeid blijven.
 *    De catalogus is een implementatiedetail van dit bestand.
 */
export function bevestigingen(): Record<BevestigingsNaam, BevestigingsTekst> {
  const bouw = (sleutel: string): BevestigingsTekst => ({
    titel: t(`${sleutel}.titel` as Sleutel),
    uitleg: t(`${sleutel}.uitleg` as Sleutel),
    bevestig: t(`${sleutel}.knop` as Sleutel),
  });

  return {
    weekdoelAfsluiten: bouw('bevestiging.weekdoel_afsluiten'),
    weekdoelVerwijderen: bouw('bevestiging.weekdoel_verwijderen'),
    weekdoelDoorschuiven: bouw('bevestiging.weekdoel_doorschuiven'),
    doelVerwijderen: bouw('bevestiging.doel_verwijderen'),
    doelAfronden: bouw('bevestiging.doel_afronden'),
    // ⚠️ Besluit A41 (QS8-132). Deze twee zijn de enige bevestigingen in dit
    //    bestand die niet over je eigen geschiedenis of punten gaan maar over die
    //    van ánderen — en dat is precies waarom ze hier horen: de uitleg noemt de
    //    prijs, en de prijs wordt hier door iemand anders betaald.
    groepOpenzetten: bouw('bevestiging.groep_openzetten'),
    groepBeschermen: bouw('bevestiging.groep_beschermen'),
    // ⚠️ Migratie 0092. Archiveren vervangt het verwijderen van een groep, dat
    //    naar zes tabellen cascadeerde. Het is de zwaarste knop in dit scherm:
    //    hij neemt de groep weg bij álle leden, en er is geen weg terug.
    // ⚠️ QS8-231, migratie 0144. Ook deze twee gaan over ánderen: wie zijn groep
    //    vindbaar maakt, doet dat namens iedereen die erin zit. De uitleg noemt
    //    daarom niet alleen wat een vreemde te zien krijgt maar vooral wat níet —
    //    dat tweede is de vraag die een beheerder aan zijn leden moet kunnen
    //    beantwoorden.
    groepOntdekbaarMaken: bouw('bevestiging.groep_ontdekbaar_maken'),
    groepVerbergen: bouw('bevestiging.groep_verbergen'),
    groepArchiveren: bouw('bevestiging.groep_archiveren'),
    // ⚠️ QS8-57, migratie 0098. Vertrekken is niet terug te draaien vanuit de
    //    app — terugkomen vraagt een geldige uitnodigingslink, en die heeft de
    //    vertrekker misschien niet meer. De uitleg noemt daarom niet alleen wat
    //    er weggaat maar ook wat er blijft: dat is hier de helft die iemand
    //    tegenhoudt om uit voorzorg te blijven zitten.
    groepVerlaten: bouw('bevestiging.groep_verlaten'),
    // ⚠️ 28-08. Dit stond er niet, en de hint onder de keuze beloofde het
    //    tegenovergestelde van wat er gebeurt: je weekdoelen van de lópende week
    //    staan op de oude uitlijning en `fetchWeekdoelen()` matcht exact op
    //    `cycle_start_date`, dus ze verdwijnen uit beeld en de rollover
    //    stempelt ze daarna als gemist — een minpunt en een gebroken reeks.
    //    Zolang die weekdoelen niet meeverhuizen (rij van 28-08 in
    //    ENGINEER-REVIEW), is één tik zonder bevestiging te goedkoop voor wat
    //    het kost.
    weekStartVerzetten: bouw('bevestiging.weekstart_verzetten'),
  };
}

export type BevestigingsNaam =
  | 'weekdoelAfsluiten'
  | 'weekdoelVerwijderen'
  | 'weekdoelDoorschuiven'
  | 'groepOpenzetten'
  | 'groepBeschermen'
  | 'groepOntdekbaarMaken'
  | 'groepVerbergen'
  | 'groepArchiveren'
  | 'groepVerlaten'
  | 'doelVerwijderen'
  | 'doelAfronden'
  | 'weekStartVerzetten';
