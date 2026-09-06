/**
 * De standen die de database teruggeeft — QS8-207.
 *
 * ⚠️ **Waarom deze map bestaat.** Deze vijf types stonden in `shared/ui`, en
 *    `modules/goals`, `modules/buddies` en `modules/completions` importeerden ze
 *    daaruit: de datalaag wees naar de presentatielaag. Het waren er twee toen
 *    de bevinding geschreven werd (19-08), vier bij het nameten (28-08) en vijf
 *    bij het bouwen (06-09) — `Beoordeelstand` was erbij gekomen. De
 *    voorwaarde onder die dossierrij, *"wordt zwaarder als er een vijfde type
 *    bijkomt"*, was dus al vervuld.
 *
 * ⚠️ **Waarom hierheen en niet naar de modules.** Dat was de open vraag in
 *    QS8-207: *"één van de twee is verkeerd en het zijn er twee."* Gemeten:
 *    `shared/ui` importeert in productiecode **nergens** uit `modules/`, dus
 *    `shared/` is strikt de onderste laag. De types naar de modules verhuizen en
 *    `shared/ui` ernaar laten wijzen zou de inversie niet opheffen maar omdraaien
 *    — en dat is een zwaardere bewering dan een type dat in de verkeerde
 *    shared-map woont.
 *
 *    Dit project heeft die keuze bovendien al een keer gemaakt: `shared/api`
 *    bestaat omdat `Resultaat` en `Pagina` zeven keer woordelijk in modules
 *    stonden. Zelfde vorm, zelfde antwoord — til de gedeelde vorm naar een
 *    neutrale plek en laat beide lagen omláág wijzen.
 *
 * ⚠️ **Wat hier hoort: de vorm van wat de database teruggeeft.** Wat er *niet*
 *    hoort is hoe die vorm heet op het scherm — `weekpasLabel`,
 *    `kettingLabel`, `risicoLabel` en `risicoToon` blijven in `shared/ui`, want
 *    dat is toon en geen gegeven. De scheiding loopt daar en nergens anders.
 *
 * ⚠️ **De waarschuwingen bij deze types zijn meeverhuisd en niet samengevat.**
 *    Drie ervan dragen domeinregel 7 en dat is precies het soort belofte dat bij
 *    een verhuizing verdampt: de tekst blijft achter in het bestand waar het
 *    type wég is, en niemand wordt daar rood van. Ze staan hieronder woordelijk.
 */
// ---------------------------------------------------------------------------
// De Ketting — QS8-80
// ---------------------------------------------------------------------------

/**
 * De stand van De Ketting in één groepsperiode, zoals `ketting_stand()` hem
 * teruggeeft.
 *
 * ⚠️ Aantallen, nooit namen. Wie er ontbreekt staat er met opzet niet in en mag
 *    er ook nooit bij komen: dat zou van deze teller een presentielijst maken,
 *    en dan is een ontbrekende schakel een publieke gemiste week (domeinregel
 *    7). De databasefunctie geeft die namen niet eens terug.
 */
export interface KettingStand {
  /** Hoeveel leden deze periode een schakel legden. */
  readonly schakels: number;
  /** Hoeveel leden er deze periode meetellen. Zie `kettingLabel`. */
  readonly inAanmerking: number;
  /** Heeft iedereen die meetelt zijn schakel gelegd? */
  readonly voltallig: boolean;
}

// ---------------------------------------------------------------------------
// Weekpassen — QS8-81
// ---------------------------------------------------------------------------

/**
 * De weekpasstand van één doel, zoals `weekpas_stand()` hem teruggeeft.
 *
 * ⚠️ `maximum` komt uit de database mee en staat hier bewust níét als
 *    constante. Zou de app een eigen kopie van dat getal houden, dan zijn er
 *    twee waarheden en gaat er ooit één schuiven zonder dat iets rood wordt.
 *
 * ⚠️ Dit is privégegeven. Een verbruikte pas is het bewijs van een gemiste week
 *    (domeinregel 7), dus deze stand hoort nooit in een groepscomponent. De
 *    database geeft hem alleen aan de eigenaar van het doel.
 */
export interface WeekpasStand {
  /** Hoeveel passen er nu klaarliggen. */
  readonly voorraad: number;
  /** De bovengrens. Boven dit aantal vervalt een verdiende pas. */
  readonly maximum: number;
  /** Voltooide cycli op dit doel. */
  readonly voltooideCycli: number;
  /** Hoeveel voltooide cycli er nog nodig zijn voor de volgende pas. */
  readonly totVolgende: number;
  /** De cyclus die het laatst door een pas gered is, of `null`. */
  readonly laatstVerbruikt: string | null;
}

// ---------------------------------------------------------------------------
// De Risico-radar — QS8-93, QS8-94
// ---------------------------------------------------------------------------

/**
 * ⚠️ **Uitsluitend voor de eigenaar.** QS8-94 zegt het met zoveel woorden en
 *    migratie 0050 dwingt het af: `goal_risk` is eigenaar-only. Kopieer de
 *    labels bij deze standen nooit naar een groepsscherm — een risicostand is
 *    een afgeleide van gemiste weken, en dat is het soort signaal waar
 *    domeinregel 7 over gaat.
 */

/** Zoals `goal_risk.status` in de database. */
export type RisicoStand = 'on_track' | 'at_risk' | 'behind' | 'unreachable';

/**
 * De onderbouwing die `herbereken_risico()` meeschrijft in `goal_risk.reason`.
 *
 * ⚠️ Alles optioneel, en dat is geen slordigheid. De database schrijft `null`
 *    voor een tempo dat niet te berekenen is (geen geschiedenis) en laat het
 *    hele blok weg bij een niet-actief doel. Een scherm dat aanneemt dat de
 *    getallen er zijn, toont "NaN weken" op het moment dat iemand net begint.
 */
export interface RisicoReden {
  readonly weken_over?: number | null;
  readonly open_mijlpalen?: number | null;
  readonly mijlpalen_af?: number | null;
  readonly cycli_bekeken?: number | null;
  readonly cycli_gehaald?: number | null;
  readonly cycli_deels?: number | null;
  readonly tempo?: number | null;
  readonly benodigd_tempo?: number | null;
  readonly vloeraandeel?: number | null;
}

// ---------------------------------------------------------------------------
// De beoordeelkaart — QS8-148
// ---------------------------------------------------------------------------

/**
 * Wat de kaart "er wacht iets op jou" van de buitenwereld weet.
 *
 * ⚠️ `mislukt` is geen detail. Een kaart die bij een storing verdwijnt, líegt:
 *    hij zegt "niets" waar het antwoord "onbekend" is. De regel die dat beslist
 *    staat in `shared/ui/tebeoordelen.ts` bij `toonBeoordeelkaart()`.
 */
export interface Beoordeelstand {
  /** Hoeveel voltooiingen er op jouw oordeel wachten. */
  readonly aantal: number;
  /** Is het tellen mislukt? Dan is `aantal` niets waard. */
  readonly mislukt: boolean;
}
