import { addDays, weekdayOf, type IsoDate, type Weekday } from '@/shared/time';

/**
 * De zeven dagen van de weekstrook — QS8-746.
 *
 * ⚠️ **De week begint op de startdag van de gebruiker en rolt niet.** `startDatum`
 *    is de `startDate` van `huidigeCyclus()` (`shared/time`, domeinregel 1);
 *    deze module kiest zelf geen dag en rekent alleen met `addDays()` en
 *    `weekdayOf()` uit diezelfde module (correctheidsregel 7).
 *
 * ⚠️ **Er is geen "gemist"-staat, en dat is de vorm van het type en geen
 *    conventie.** Een dag is `actief` of niet, en een dag zonder activiteit heet
 *    nergens anders. Een dag in de toekomst en een lege dag in het verleden
 *    zien er hetzelfde uit: wie ze onderscheidt, maakt van de strook een rooster
 *    met verwijten (domeinregel 7).
 *
 * ⚠️ **Vandaag is een eigenschap van de dag**, niet van de kleur: de component
 *    tekent er een vorm en een woord bij, voor kleurenblindheid.
 */
export interface Weekdag {
  readonly datum: IsoDate;
  readonly weekdag: Weekday;
  readonly isVandaag: boolean;
  readonly actief: boolean;
}

export const DAGEN_IN_WEEKSTROOK = 7;

/**
 * @param vandaag `localDateIn(tz, now())` — de datum in de tijdzone van de gebruiker.
 * @param actieveDagen datums met een afvinking of een Dagzet; wat daarbuiten valt telt niet.
 */
export function weekstrook(
  startDatum: IsoDate,
  vandaag: IsoDate | null,
  actieveDagen: ReadonlySet<string>,
): readonly Weekdag[] {
  const dagen: Weekdag[] = [];
  for (let i = 0; i < DAGEN_IN_WEEKSTROOK; i += 1) {
    const datum = addDays(startDatum, i);
    dagen.push({
      datum,
      weekdag: weekdayOf(datum),
      isVandaag: datum === vandaag,
      actief: actieveDagen.has(datum),
    });
  }
  return dagen;
}

/**
 * De dagen met activiteit: alle afvinkingen van de week plus de Dagzetten.
 *
 * ⚠️ **Alleen eigen gegevens.** Beide bronnen zijn eigenaar-only (`day_checkins`
 *    en `daily_moves`, domeinregel 9). Er is bewust geen parameter voor groepsdata.
 */
export function actieveDagen(
  afvinkingen: ReadonlyMap<string, readonly string[]> | undefined,
  dagzetten: readonly { readonly local_date: string }[],
): ReadonlySet<string> {
  const dagen = new Set<string>(dagzetten.map((z) => z.local_date));
  for (const lijst of afvinkingen?.values() ?? []) {
    for (const datum of lijst) dagen.add(datum);
  }
  return dagen;
}
