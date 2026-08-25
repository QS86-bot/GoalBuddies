import { getal, t } from '../i18n';

/**
 * De rekenregels achter de visuele componenten.
 *
 * Bewust los van de componenten: dit zijn domeinregels, geen opmaak. Ze horen
 * getest te kunnen worden zonder een renderer, en ze horen op één plek te staan
 * zodat "wat mag de groep zien" niet in elk scherm opnieuw bedacht wordt.
 */

/** Zoals `weekly_goals.status` in de database. */
export type WeeklyGoalStatus =
  | 'todo'
  | 'pending'
  | 'approved'
  | 'missed'
  | 'carried'
  | 'excused'
  /**
   * Zelf afgesloten — A40, migratie 0045. Vervangt het verwijderen van een
   * weekdoel: de rij blijft staan, en de rollover veegt hem bij het verstrijken
   * van de cyclus mee naar `missed`. Binnen de lopende cyclus dus neutraal,
   * daarna een gemiste week.
   */
  | 'cancelled';

/** Wat er gehaald is, zoals `completions.achieved_level`. */
export type Achieved = 'none' | 'floor' | 'ceiling';

/** Wie kijkt er mee. Bepaalt wat er getoond mág worden, niet alleen wat mooi is. */
export type Viewer = 'owner' | 'group';

/** Kleurrollen die een weekdoel mag hebben. Rood zit hier niet bij — zie hieronder. */
export type Tone = 'progress' | 'pending' | 'neutral';

export interface RangeState {
  /**
   * ⚠️ Domeinregel 7. Staat dit op `true`, dan rendert de component níéts.
   *
   * Niet "grijs tonen" en niet "leeg tonen": een lege plek naast drie gevulde
   * plekken is óók een mededeling. Een gemiste week van iemand anders bestaat
   * in de groepsweergave gewoon niet.
   */
  readonly hidden: boolean;
  readonly tone: Tone;
  /** Hoever de balk gevuld staat, 0…1. */
  readonly fill: number;
  readonly label: string;
  /** Wacht dit op een buddy? Dan is het geen tegenslag maar een tussenstand. */
  readonly awaitingApproval: boolean;
}

/**
 * Waar de vloermarkering op de balk staat.
 *
 * 0,55 en niet 0,5: de vloer halen is een echte overwinning en moet er ook zo
 * uitzien. Precies halverwege leest als "half werk", en dat is exact het gevoel
 * dat de vloer moet wegnemen.
 */
export const FLOOR_MARK = 0.55;

/**
 * De stand van een weekdoel als bereik tussen vloer en plafond.
 *
 * ⚠️ Rood komt hier nooit uit. `red` is in dit stelsel uitsluitend
 *    deadline-risico (zie `shared/theme/tokens.ts`). Een gemiste week is geen
 *    alarm maar een week; hem rood maken is precies de schaamteprikkel die
 *    volgens de Habit Huddle-analyse groepen opblaast.
 */
export function rangeState(input: {
  readonly status: WeeklyGoalStatus;
  readonly achieved: Achieved;
  readonly hasFloor: boolean;
  readonly viewer: Viewer;
}): RangeState {
  const { status, achieved, hasFloor, viewer } = input;

  const positive = status === 'approved' || status === 'pending';

  // Voor de groep bestaat alleen wat goed gaat. Alles daarbuiten is onzichtbaar.
  if (viewer === 'group' && !positive) {
    return { hidden: true, tone: 'neutral', fill: 0, label: '', awaitingApproval: false };
  }

  if (status === 'excused') {
    return {
      hidden: false,
      tone: 'neutral',
      fill: 0,
      label: t('weekdoel.adempauze'),
      awaitingApproval: false,
    };
  }

  if (positive) {
    const ceiling = achieved === 'ceiling';
    return {
      hidden: false,
      tone: status === 'pending' ? 'pending' : 'progress',
      fill: ceiling ? 1 : hasFloor ? FLOOR_MARK : 1,
      label: labelFor(ceiling, hasFloor, status === 'pending'),
      awaitingApproval: status === 'pending',
    };
  }

  if (status === 'carried') {
    return {
      hidden: false,
      tone: 'neutral',
      fill: 0,
      label: t('weekdoel.meegenomen'),
      awaitingApproval: false,
    };
  }

  if (status === 'cancelled') {
    // ⚠️ "Afgesloten" en niet "verwijderd" of "opgegeven". Je hebt zelf besloten
    //    dat deze week niet doorgaat; dat is een keuze en geen mislukking. Dat
    //    het als gemiste week gaat tellen zodra de cyclus verstrijkt, hoort in
    //    het scherm dat de knop aanbiedt te staan — niet als verwijt achteraf.
    return {
      hidden: false,
      tone: 'neutral',
      fill: 0,
      label: t('weekdoel.afgesloten'),
      awaitingApproval: false,
    };
  }

  if (status === 'missed') {
    // Alleen de eigenaar komt hier. Zakelijk, niet bestraffend.
    return {
      hidden: false,
      tone: 'neutral',
      fill: 0,
      label: t('weekdoel.niet_afgerond'),
      awaitingApproval: false,
    };
  }

  return {
    hidden: false,
    tone: 'neutral',
    fill: 0,
    label: t('weekdoel.nog_te_doen'),
    awaitingApproval: false,
  };
}

function labelFor(ceiling: boolean, hasFloor: boolean, pending: boolean): string {
  const wat = ceiling
    ? t('weekdoel.plafond_gehaald')
    : hasFloor
      ? t('weekdoel.vloer_gehaald')
      : t('weekdoel.gehaald');

  return pending ? t('weekdoel.wacht_op_buddy', { wat }) : wat;
}

/**
 * Voortgang naar een doel, als deel van 1.
 *
 * ⚠️ Uitsluitend mijlpaalgebaseerd, en daarom uitsluitend stijgend. Score en
 *    voortgang zijn twee dingen (domeinregel 10): de score kan dalen, voortgang
 *    niet. Worden die twee in één balk gepropt, dan lijkt het alsof je doel
 *    achteruitgaat omdat je één week miste — en dat is het gevoel dat mensen
 *    deze app laat verwijderen.
 */
export function milestoneProgress(done: number, total: number): number {
  if (total <= 0) return 0;
  const ratio = done / total;
  return Math.min(1, Math.max(0, ratio));
}

/**
 * Hoe een reeks heet in de UI. Cycli, geen dagen — de week is de enige eenheid
 * die telt (domeinregel 9).
 */
export function streakLabel(cycles: number): string {
  if (cycles <= 0) return t('reeks.geen');
  return cycles === 1 ? t('reeks.een') : t('reeks.meer', { n: cycles });
}

/**
 * De beste reeks, met eenheid.
 *
 * ⚠️ Naast `streakLabel()` — "3 weken op rij" — las "Beste reeks: 7" als zeven
 *    wat. En de meervoudsvorm is een eigen sleutel en geen ternary in de zin:
 *    `t()` kent geen meervoudsregels, en dat is bewust (zie `shared/i18n`).
 */
export function besteReeksLabel(cycles: number): string {
  return cycles === 1 ? t('reeks.beste_een') : t('reeks.beste_meer', { aantal: getal(cycles, 0) });
}

/**
 * Wat een schermlezer van één ledenrij hoort — QS8-80, gesloten 25-08-2026.
 *
 * ⚠️ **Dit is de gevaarlijkste zin in de app, en tot vandaag bestond hij niet.**
 *    `MemberRow` toonde het "afgerond"-signaal als een gekleurd bolletje van tien
 *    bij tien pixels zónder label. Voor wie kleuren niet onderscheidt of een
 *    schermlezer gebruikt was het positieve signaal daarmee onhoorbaar, terwijl
 *    de rij eromheen (naam, reeks) wél voorgelezen werd. De zorgvuldigheid zat in
 *    de kleur en die is de helft van de gebruikers niet gegeven.
 *
 * ⚠️ **De belofte is niet "de rij is voorleesbaar" maar "de afwezigheid blijft
 *    stil".** Alles wat hier bij komt gaat over iemand ánders (domeinregel 7),
 *    dus deze functie voegt uitsluitend toe wat er wél is: de reeks, een
 *    aangekondigde adempauze, en dát iemand deze periode afrondde. Er is geen tak
 *    die iets zegt over niet-afgerond, en die mag er ook nooit bij komen — "nog
 *    niet" per persoon voorgelezen is precies de presentielijst die De Ketting
 *    niet wil zijn.
 *
 * ⚠️ Hij staat hier en niet in het component omdat een zin die een domeinregel
 *    draagt te toetsen moet zijn zonder renderer. Zie `metrics.test.ts`.
 */
export function ledenrijLabel(input: {
  readonly name: string;
  readonly streak: number;
  readonly closedThisPeriod: boolean;
  readonly onBreather?: boolean;
  readonly bestStreak?: number | null;
}): string {
  const delen = [input.name, streakLabel(input.streak)];

  // Zelfde regel als in de rij zelf: gelijk voegt niets toe, lager is data die
  // niet klopt, en dan is zwijgen beter dan een tegenstrijdig getal.
  if (input.bestStreak !== null && input.bestStreak !== undefined && input.bestStreak > input.streak) {
    delen.push(besteReeksLabel(input.bestStreak));
  }

  if (input.onBreather === true) delen.push(t('lid.adempauze'));
  else if (input.closedThisPeriod) delen.push(t('lid.afgerond'));

  return delen.join(', ');
}

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

/**
 * Hoe De Ketting heet in de UI.
 *
 * ⚠️ De toon is het hele punt van dit component. "1 van 3" leest als een
 *    tekortkoming zolang de week loopt; De Ketting telt **opdagen** en is
 *    onderweg per definitie onaf. Daarom staat er wat er wél is en nooit wat er
 *    mist — geen "nog 2 te gaan", want dat is dezelfde mededeling met een
 *    vriendelijk gezicht.
 *
 * ⚠️ Nul schakels is niet "niemand deed iets" maar "de week is net begonnen".
 *    Dat verschil bestaat alleen in de tekst, dus die tekst doet het werk.
 */
export function kettingLabel(stand: KettingStand): string {
  if (stand.inAanmerking <= 0) return t('ketting.niemand');
  if (stand.schakels <= 0) return t('ketting.net_begonnen');
  if (stand.voltallig) {
    return stand.inAanmerking === 1 ? t('ketting.jij_alleen') : t('ketting.voltallig');
  }
  return stand.schakels === 1
    ? t('ketting.schakels_een')
    : t('ketting.schakels_meer', { n: stand.schakels });
}

/**
 * Hoever de ketting gevuld staat, 0…1.
 *
 * ⚠️ Loopt alleen omhoog binnen een periode, net als `milestoneProgress`. Een
 *    lege noemer geeft 0 en niet 1: "voltallig" zonder deelnemers is een
 *    rekenkundige toevalstreffer, geen prestatie.
 */
export function kettingVulling(stand: KettingStand): number {
  if (stand.inAanmerking <= 0) return 0;
  return Math.min(1, Math.max(0, stand.schakels / stand.inAanmerking));
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

/**
 * Hoe de voorraad heet in de UI.
 *
 * ⚠️ Nul is geen mislukking en klinkt hier ook niet zo. "Geen weekpassen" leest
 *    als een tekort; het gaat om iets dat je kúnt verdienen en nog niet hebt.
 *    Dat verschil zit alleen in de tekst, dus die tekst doet het werk.
 */
export function weekpasLabel(stand: WeekpasStand): string {
  if (stand.voorraad <= 0) return t('weekpas.geen');

  const wat =
    stand.voorraad === 1 ? t('weekpas.een') : t('weekpas.meer', { n: stand.voorraad });

  return t('weekpas.van_maximum', { wat, maximum: stand.maximum });
}

/**
 * Het puntenmodel in één regel — domeinregel 10.
 *
 * ⚠️ Staat onder het puntentotaal omdat een kaal getal daar niets zegt. Zonder
 *    deze regel weet niemand dat een gemiste week een minpunt kost, en dan komt
 *    dat minpunt als een verrassing precies op de dag dat het gebeurt.
 */
export function puntenUitleg(): string {
  return t('punten.uitleg');
}

/**
 * De uitleg die precies één keer op het scherm hoort.
 *
 * ⚠️ Eén constante en geen functie, want hij hangt van niets af. Bij vijf doelen
 *    stond deze tekst vijf keer onder elkaar; dat is geen uitleg meer maar
 *    behang, en dan leest niemand hem — ook niet de ene keer dat het uitmaakt.
 *
 * ⚠️ Drie dingen staan er met zoveel woorden in, en alle drie omdat een
 *    gebruiker er anders het verkeerde van maakt:
 *
 *    1. **Het minpunt blijft.** Domeinregel 10. Wie dat niet weet, ziet zijn
 *       puntentotaal dalen terwijl zijn reeks doorloopt en concludeert dat de
 *       app niet kan rekenen.
 *    2. **Je hoeft niets te doen.** "1 weekpas klaar" leest als een knop die je
 *       moet indrukken. Er ís geen knop — inzetten kan alleen de rollover, want
 *       een pas die je zelf mag inzetten kun je op een lopende week zetten en
 *       dan beschermt hij niets.
 *    3. **Per doel.** `week_pass_events` hangt aan (user_id, goal_id), dus bij
 *       drie doelen zie je drie verschillende standen naast elkaar. Zonder deze
 *       zin ziet dat eruit als een fout.
 */
export function weekpasUitleg(): string {
  return t('weekpas.uitleg');
}

/**
 * Hoe ver je bent naar de volgende pas. Verschilt per doel en staat dus wél bij
 * elk doel.
 *
 * ⚠️ Bij een volle voorraad staat erbij wat er met een extra pas gebeurt: die
 *    gaat niet verloren maar komt vrij zodra je er een verbruikt (migratie
 *    0042). Dat is geen detail — wie zes weken doorwerkt, wil weten of dat werk
 *    ergens heen gaat.
 */
export function weekpasVoortgang(stand: WeekpasStand): string {
  if (stand.voorraad >= stand.maximum) {
    return t('weekpas.vol', { voorraad: stand.voorraad });
  }

  const nog =
    stand.totVolgende === 1
      ? t('weekpas.nog_een_week')
      : t('weekpas.nog_weken', { n: stand.totVolgende });

  return stand.voorraad <= 0 ? t('weekpas.eerste', { nog }) : t('weekpas.volgende', { nog });
}

/**
 * Is de laatst geredde cyclus dezelfde als de cyclus die net is afgesloten?
 *
 * Bepaalt of het scherm de melding achteraf toont ("een weekpas heeft je reeks
 * gered"). QS8-81 vraagt om die melding, en dit is de enige plek waar hij
 * hoort: privé, bij de eigenaar.
 *
 * ⚠️ Vergelijkt twee kale datumstrings en rekent zelf niets uit. De cyclus komt
 *    uit `shared/time` (correctheidsregel 7) en `laatstVerbruikt` komt uit de
 *    database; hier wordt alleen gekeken of ze gelijk zijn.
 */
export function weekpasReddeDezeCyclus(
  stand: WeekpasStand,
  cyclusStart: string | null,
): boolean {
  if (stand.laatstVerbruikt === null || cyclusStart === null) return false;
  return stand.laatstVerbruikt === cyclusStart;
}
