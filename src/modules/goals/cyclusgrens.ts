import { addDays, type Gebruikerscyclus, type IsoDate } from '../../shared/time';

import type { Tables } from '../../lib/database.types';

/**
 * De cyclusgrens overleeft een zonesprong — reviewrij 14-09-2026.
 *
 * ⚠️ **Los van `weekly.ts` en dat is met opzet.** Dat bestand trekt `supabase()`
 *    binnen en daarmee react-native; een test die deze twee functies wil voeden
 *    struikelt dan over Flow-syntax in `react-native/index.js`. Pure logica die
 *    je wilt kunnen ijken, hoort niet achter een I/O-import te zitten.
 */

type Weekdoel = Tables<'weekly_goals'>;

/**
 * De cyclusstarts die bij "nu" kunnen horen: de berekende, en die van een week
 * later.
 *
 * ⚠️⚠️ **Waarom er twee zijn, en waarom het er precies twee zijn.** De cyclus
 *    wordt uit de zone van het apparaat berekend, en sinds QS8-472 verzet die
 *    zone zichzelf. 📏 Gemeten op `2026-09-13T22:30Z` met week-start maandag:
 *    `Europe/Amsterdam` geeft `2026-09-14`, `Pacific/Honolulu` geeft
 *    `2026-09-07`. Valt de sprong over de week-startdag, dan verschuift de grens
 *    niet met één dag maar met **zeven**, en westwaarts gaat hij terúg.
 *
 *    Met een exacte match verdween een weekdoel dat je net had aangemaakt
 *    daardoor uit je lijst, zonder dat er iets verstreken was — de rollover doet
 *    daar niets aan, want er ís niets verlopen.
 *
 * ⚠️ **`+7` wél en `-7` niet, en dat verschil is de hele grendel.** Rijen op
 *    `start + 7` kúnnen alleen bestaan doordat je westwaarts over de grens bent
 *    gegaan: de client schrijft altijd zijn éígen huidige cyclus weg, dus een
 *    weekdoel voor een week die nog moet beginnen is er anders niet. Rijen op
 *    `start - 7` zijn daarentegen gewoon de vórige week, en die horen na een
 *    rollover juist níet meer in deze lijst. Zou je die ook toelaten, dan haalde
 *    je elke maandag de week van ervoor terug.
 */
export function mogelijkeCyclusstarts(cyclus: Gebruikerscyclus): readonly string[] {
  return [cyclus.startDate, addDays(cyclus.startDate as IsoDate, 7)];
}

/**
 * Uit twee mogelijke cycli die ene die de gebruiker nu voert.
 *
 * ⚠️ Filteren en niet sorteren: de aanroeper verwacht de rijen op `created_at`,
 *    en dat is de volgorde waarin het scherm ze toont.
 */
export function kiesLaatsteCyclus(rijen: readonly Weekdoel[]): readonly Weekdoel[] {
  const starts = rijen.map((r) => r.cycle_start_date).filter((d): d is string => d !== null);
  if (starts.length === 0) return rijen;

  const laatste = starts.reduce((a, b) => (a > b ? a : b));
  return rijen.filter((r) => r.cycle_start_date === laatste);
}
