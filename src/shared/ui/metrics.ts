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
  | 'excused';

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
      label: 'Adempauze',
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
      label: 'Meegenomen naar deze week',
      awaitingApproval: false,
    };
  }

  if (status === 'missed') {
    // Alleen de eigenaar komt hier. Zakelijk, niet bestraffend.
    return {
      hidden: false,
      tone: 'neutral',
      fill: 0,
      label: 'Niet afgerond',
      awaitingApproval: false,
    };
  }

  return { hidden: false, tone: 'neutral', fill: 0, label: 'Nog te doen', awaitingApproval: false };
}

function labelFor(ceiling: boolean, hasFloor: boolean, pending: boolean): string {
  const wat = ceiling ? 'Plafond gehaald' : hasFloor ? 'Vloer gehaald' : 'Gehaald';
  return pending ? `${wat} — wacht op je buddy` : wat;
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
  if (cycles <= 0) return 'Nog geen reeks';
  return cycles === 1 ? '1 week op rij' : `${cycles} weken op rij`;
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
  if (stand.inAanmerking <= 0) return 'Nog niemand doet mee';
  if (stand.schakels <= 0) return 'De week is net begonnen';
  if (stand.voltallig) {
    return stand.inAanmerking === 1 ? 'Je schakel ligt er' : 'Voltallig — de ketting is rond';
  }
  return stand.schakels === 1
    ? '1 schakel deze week'
    : `${stand.schakels} schakels deze week`;
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
