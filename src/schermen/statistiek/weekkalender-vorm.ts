import {
  cyclesBetween,
  nextCycle,
  userCycleOn,
  type Gebruikerscyclus,
  type IsoDate,
  type UserClock,
} from '@/shared/time';

/**
 * De kalender van weken — QS8-749.
 *
 * ⚠️ **Er is geen "gemist"-staat, en dat is de vorm van het type.** Een week is `actief` (er is
 *    iets ingediend) of niet. Een week zonder voltooiing is neutraal: een omlijning, geen
 *    kleur van falen, geen woord als "gemist" (domeinregel 7). De component voegt er een
 *    vorm en een woord aan toe, zodat kleur niet het enige onderscheid is.
 *
 * ⚠️ **Geen percentage en geen aantal weken zonder.** Een getal onder 100 maakt gemiste weken
 *    afleidbaar (verbeterplan §6); er wordt alleen geteld wat er wél was.
 *
 * ⚠️ **Een voltooiing hoort bij de week van zijn `cycle_start_date`, gelezen op het raster van
 *    de huidige week-start.** Wie zijn week-start wijzigt, ziet oude weken op het nieuwe raster.
 */
export interface Weekcel {
  readonly start: IsoDate;
  readonly actief: boolean;
  readonly isHuidig: boolean;
}

/** Bovengrens op het aantal cellen, zodat "alles" na tien jaar geen tienduizend views tekent. */
export const MAX_WEKEN = 260;

export function weekkalender(
  klok: UserClock,
  eerste: Gebruikerscyclus,
  huidige: Gebruikerscyclus,
  cyclusDatums: readonly string[],
): readonly Weekcel[] {
  const actief = new Set<string>();
  for (const datum of cyclusDatums) {
    const week = userCycleOn(klok, datum);
    if (week !== null) actief.add(week.startDate);
  }

  const aantal = Math.min(Math.max(cyclesBetween(eerste, huidige) + 1, 1), MAX_WEKEN);
  const cellen: Weekcel[] = [];
  let week = eerste;
  const begin = cyclesBetween(eerste, huidige) + 1 - aantal;
  for (let i = 0; i < begin; i += 1) week = nextCycle(week);
  for (let i = 0; i < aantal; i += 1) {
    cellen.push({
      start: week.startDate,
      actief: actief.has(week.startDate),
      isHuidig: week.startDate === huidige.startDate,
    });
    week = nextCycle(week);
  }
  return cellen;
}

/** De eerste week van "alles": die van de oudste voltooiing, anders de huidige. */
export function oudsteWeek(
  klok: UserClock,
  huidige: Gebruikerscyclus,
  cyclusDatums: readonly string[],
): Gebruikerscyclus {
  let oudste = huidige;
  for (const datum of cyclusDatums) {
    const week = userCycleOn(klok, datum);
    if (week !== null && week.startDate < oudste.startDate) oudste = week;
  }
  return oudste;
}
