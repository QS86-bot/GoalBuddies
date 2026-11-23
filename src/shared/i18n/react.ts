import { useSyncExternalStore } from 'react';

import { abonneerOpTaal, taal, type Taal } from './index';

/**
 * Laat een route opnieuw renderen zodra de taal wisselt — QS8-796.
 *
 * ⚠️ **Elke route in `app/` roept dit aan, als eerste regel.** De navigator
 *    verpakt elke route in een `StaticContainer`: een render van bovenaf komt
 *    er niet doorheen, alleen iets wat de route zélf leest. Vóór dit issue
 *    renderde een route na een taalwissel alleen opnieuw als hij toevallig
 *    `useProfiel()` las. Daarom bleef de kop van "Taal en tijd" in de oude taal
 *    (F1), en bleef bij direct laden de body in de apparaattaal staan zodra het
 *    profiel een andere taal had (F2). `tests/beloftes/route-volgt-de-taal.test.ts`
 *    wordt rood als een route het vergeet.
 *
 * ⚠️ **Hier en niet in `index.ts`.** `t()` en de rest van `shared/i18n` draaien
 *    ook buiten React (datalaag, schema's); die module importeert React niet.
 *
 * ⚠️ De server-snapshot is dezelfde lezer. Vóór de hydratie tekent `Shell` niets
 *    wat van de taal afhangt (QS8-740), dus deze waarde bepaalt daar geen tekst.
 */
export function useVolgTaal(): Taal {
  return useSyncExternalStore(abonneerOpTaal, taal, taal);
}
