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
