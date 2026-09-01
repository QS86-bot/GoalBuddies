import { MAX_DAGEN_PER_WEEK, type Ritme } from './schemas';

/**
 * Van een ritmekeuze naar de twee dagvelden van een weekdoel — QS8-260,
 * besluit A53, migratie 0140.
 *
 * ⚠️ **Dit staat hier en niet in het scherm, en dat is niet om de nette reden.**
 *    Een scherm importeert de Supabase-client en die trekt React Native mee; wat
 *    in `app/` staat is met vitest niet te toetsen. De regel die bepaalt of een
 *    week in dagen telt, is precies de regel die getoetst hoort te worden — en
 *    zolang hij in het formulier stond, kon dat niet.
 *
 * ⚠️ **En het is de schakel die drie keer ontbrak.** De kolommen, de CHECK, de
 *    grant, het schema en de dagteller op het dashboard stonden er allemaal; er
 *    kwam alleen nooit een getal in, omdat geen enkel scherm ze meegaf en
 *    `maakWeekdoel()` ze niet doorgaf. Elk onderdeel af, het geheel dood —
 *    CLAUDE.md regel 18, vraag 5. `tests/beloftes/bereikbaar.test.ts` houdt vast
 *    dát een scherm deze functie aanroept; de gevallen hieronder houden vast wát
 *    hij dan teruggeeft.
 */

/**
 * De keuzewaarde voor "geen dagental".
 *
 * ⚠️ Een string en geen `null`, want een keuzelijst kent geen lege keuze. Met
 *    `null` in de state is "nog niet gekozen" niet te onderscheiden van "net
 *    leeggemaakt", en dan blijft een vloer staan die de gebruiker weghaalde.
 */
export const GEEN_DAGEN = 'geen';

export interface Dagvelden {
  readonly floor_days: number | null;
  readonly ceiling_days: number | null;
}

function getal(waarde: string): number | null {
  if (waarde === GEEN_DAGEN) return null;

  const uit = Number(waarde);
  return Number.isInteger(uit) && uit >= 1 && uit <= MAX_DAGEN_PER_WEEK ? uit : null;
}

/**
 * Wat er van dit formulier naar `weekly_goals` gaat.
 *
 * ⚠️ **`daily` is zeven en wordt niet gevraagd.** Elke dag betekent zeven dagen;
 *    een plafondkeuze ernaast zou een vraag met één antwoord zijn. Dat is precies
 *    het verschil tussen `daily` en `times_per_week`, en daarom bestaan het twee
 *    ritmes en niet één met een getal erbij.
 *
 * ⚠️ **`weekly` levert twee keer `null` op**, en dat is het normale geval: een
 *    gewoon weekdoel, dat zich gedraagt zoals vóór A53. Zonder deze tak zou het
 *    omzetten van het ritme een oud weekdoel ineens in dagen laten tellen.
 *
 * ⚠️ **Een vloer zonder plafond bestaat niet**, en dat wordt hier weggegooid in
 *    plaats van doorgegeven. `weekdoelSchema` weigert hem met een zin en
 *    `weekly_goals_dagen_geordend` met een `23514` — maar geen van beide hoort
 *    een gebruiker te bereiken voor een toestand die dit formulier zelf kan
 *    maken door de vloer te laten staan na het terugzetten naar `weekly`.
 *
 * ⚠️ **Een vloer boven het plafond wordt afgekapt en niet geweigerd**, om
 *    dezelfde reden: hij ontstaat door het plafond te verlagen nadat de vloer al
 *    gekozen was, en dat is geen invoerfout maar een tussenstand van het
 *    formulier.
 */
export function dagenUitKeuze(
  ritme: Ritme,
  plafondKeuze: string,
  vloerKeuze: string,
): Dagvelden {
  if (ritme === 'weekly') return { floor_days: null, ceiling_days: null };

  const plafond = ritme === 'daily' ? MAX_DAGEN_PER_WEEK : getal(plafondKeuze);
  if (plafond === null) return { floor_days: null, ceiling_days: null };

  const vloer = getal(vloerKeuze);
  return {
    floor_days: vloer === null ? null : Math.min(vloer, plafond),
    ceiling_days: plafond,
  };
}

export interface Dagoptie {
  readonly waarde: string;
  readonly label: string;
}

/**
 * Eén tot zeven dagen als keuzelijst.
 *
 * ⚠️ **Een keuze en geen invoerveld.** Zeven mogelijke waarden passen in een rij
 *    knoppen, en dan bestaat "vul een heel getal in" als foutmelding niet meer.
 *    `validatie.dagen_heel` en `validatie.dagen_bereik` worden daarmee de
 *    achtervang van het schema in plaats van iets wat een gebruiker leest.
 *
 * ⚠️ De vloerlijst kapt af op het plafond — dezelfde ordening als de CHECK
 *    `weekly_goals_dagen_geordend`, maar hier voorkomt hij de fout in plaats van
 *    hem te melden.
 *
 * @param label vertaalt een aantal; deze module doet zelf geen `t()`, zodat hij
 *   zonder de i18n-catalogus te toetsen is.
 */
export function dagopties(
  label: (aantal: number) => string,
  opties: { readonly tot?: number; readonly metGeen?: boolean; readonly geenLabel?: string } = {},
): readonly Dagoptie[] {
  const tot = Math.min(Math.max(opties.tot ?? MAX_DAGEN_PER_WEEK, 1), MAX_DAGEN_PER_WEEK);
  const dagen = Array.from({ length: tot }, (_, n) => ({
    waarde: String(n + 1),
    label: label(n + 1),
  }));

  return opties.metGeen === true
    ? [{ waarde: GEEN_DAGEN, label: opties.geenLabel ?? GEEN_DAGEN }, ...dagen]
    : dagen;
}
