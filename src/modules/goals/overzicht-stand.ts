import { previousCycle, type Cycle } from '../../shared/time';

/**
 * De pure laag van het overzicht — QS8-256.
 *
 * ⚠️ **Los van `overzicht.ts`, en niet uit netheid.** Dat bestand importeert de
 *    Supabase-client en die trekt react-native mee; vitest leest die Flow-syntax
 *    niet. Zonder deze splitsing is de productbeslissing hieronder — welke
 *    databasestatus leest als "die week telde" — niet te testen zonder een
 *    scherm te bouwen. Zelfde reden en zelfde vorm als `tips.ts` en `metrics.ts`.
 *
 * ⚠️ Er wordt hier geen week uitgerekend: `previousCycle()` komt uit
 *    `shared/time` (correctheidsregel 7).
 */

/**
 * Wat een week opleverde.
 *
 * ⚠️ **Vijf standen en geen zes, en de indeling is een productbeslissing.**
 *    `weekly_goals.status` kent er zes (`todo`, `pending`, `approved`, `missed`,
 *    `carried`, `excused`) en het niveau staat ergens ánders — op de voltooiing.
 *    Wat een gebruiker van zijn eigen twaalf weken wil weten is niet de
 *    databasestatus maar: telde die week, en hoeveel.
 */
export type Weekstand =
  /** Afgerond en goedgekeurd op plafond. */
  | 'plafond'
  /** Afgerond en goedgekeurd op de vloer — telt net zo goed als een week. */
  | 'vloer'
  /** Ingediend, wacht op een buddy. Nog geen uitkomst. */
  | 'ingediend'
  /** Niet afgerond. ⚠️ Nooit rood — zie de kop van `Weekbalken`. */
  | 'gemist'
  /** Er stond niets te doen: geen weekdoel, of een adempauze. */
  | 'leeg';

export interface Weekbalk {
  /** De startdatum van de cyclus, als `YYYY-MM-DD`. */
  readonly cyclus: string;
  readonly stand: Weekstand;
  /** Hoeveel weekdoelen er in die week stonden. Nul bij een lege week. */
  readonly aantal: number;
}

/** Hoeveel weken de balkenreeks toont. */
export const WEKEN_IN_OVERZICHT = 12;

/**
 * De laatste twaalf cycli, van oud naar nieuw.
 *
 * ⚠️ Afgeleid met `previousCycle()` en niet door zeven dagen af te trekken: het
 *    verzetten van een week-startdag of een tijdzonegrens zou dat tweede laten
 *    verschuiven, en dan staat er een balk op een dag die geen cyclusgrens is.
 */
export function laatsteCycli(huidige: Cycle, aantal = WEKEN_IN_OVERZICHT): readonly Cycle[] {
  const rij: Cycle[] = [huidige];

  while (rij.length < Math.max(1, aantal)) {
    const eerste = rij[0];
    if (eerste === undefined) break;
    rij.unshift(previousCycle(eerste));
  }

  return rij;
}

/** Eén weekdoel zoals het overzicht het nodig heeft. */
export interface WeekRij {
  readonly status: string;
  /** Het niveau van de niet-vervangen voltooiing, als die er is. */
  readonly niveau: 'floor' | 'ceiling' | null;
}

/**
 * De stand van één week uit de weekdoelen die erin stonden.
 *
 * ⚠️ **De béste uitkomst telt, niet de laatste.** Besluit A37 laat meerdere
 *    weekdoelen in één cyclus toe; wie er twee had en er één op plafond
 *    afrondde, heeft die week zijn plafond gehaald. De omgekeerde keuze zou een
 *    goede week grijzer maken zodra iemand een tweede doel toevoegde, en dat is
 *    precies de prikkel die dit product niet wil.
 *
 * ⚠️ **`excused` en `todo` tellen als leeg en niet als gemist.** Een adempauze
 *    is een aangekondigde eigen keuze (A50) en een `todo` is een week die nog
 *    loopt; allebei als tegenvaller tekenen zou de gebruiker straffen voor iets
 *    wat de app hem juist aanbiedt.
 *
 * ⚠️ **`carried` telt als gemist, en dat is bewust.** Een doorgeschoven week is
 *    een week die de rollover al als gemist had afgeschreven (0045); het
 *    doorschuiven verplaatst het wérk en niet de uitkomst. Hem als leeg tekenen
 *    zou een gemiste week laten verdwijnen uit je eigen terugblik.
 */
export function standUitWeekdoelen(rijen: readonly WeekRij[]): Weekstand {
  if (rijen.length === 0) return 'leeg';

  const goedgekeurd = rijen.filter((rij) => rij.status === 'approved');
  if (goedgekeurd.some((rij) => rij.niveau === 'ceiling')) return 'plafond';
  if (goedgekeurd.length > 0) return 'vloer';

  if (rijen.some((rij) => rij.status === 'pending')) return 'ingediend';
  if (rijen.some((rij) => rij.status === 'missed' || rij.status === 'carried')) return 'gemist';

  return 'leeg';
}
