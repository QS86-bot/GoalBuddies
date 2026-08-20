import { z } from 'zod';

/**
 * De regels van een mijlpaal, zonder Supabase en zonder React Native — QS8-39.
 *
 * ⚠️ Dit bestand importeert bewust niets uit `mijlpalen.ts`. Zou het dat wel
 *    doen, dan trekt elke test die deze regels wil controleren de
 *    Supabase-client en AsyncStorage mee, en daarmee React Native in een test
 *    die in Node draait. Zelfde reden als `weekly-schemas.ts` en
 *    `buddies/chat-schemas.ts` — en het is precies waar deze module de eerste
 *    keer op stukliep.
 */

export const MIJLPAAL_TITEL_MAX = 200;

export const mijlpaalSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { error: 'Geef je mijlpaal een naam.' })
    .max(MIJLPAAL_TITEL_MAX, { error: `Maximaal ${MIJLPAAL_TITEL_MAX} tekens.` }),
  description: z.string().trim().max(2000, { error: 'Maximaal 2000 tekens.' }).nullable(),
  target_date: z.string().nullable(),
});

export type MijlpaalInvoer = z.infer<typeof mijlpaalSchema>;

/** De status van een mijlpaal, gelijk aan `milestones_status_valid`. */
export type MijlpaalStatus = 'todo' | 'done' | 'dropped';

/**
 * Verplaatst één mijlpaal een plek omhoog of omlaag.
 *
 * Puur: geeft de nieuwe volgorde terug zonder iets op te slaan, zodat het
 * scherm hem meteen kan tonen en `herordenMijlpalen()` daarna het echte werk
 * doet.
 *
 * ⚠️ Voegt nooit iets toe en haalt nooit iets weg. Dat is geen detail:
 *    `herorden_mijlpalen()` weigert een lijst die niet exact de bestaande
 *    verzameling is, dus een schuiffunctie die er eentje laat vallen levert een
 *    geweigerde opslag op in plaats van een zichtbare fout.
 */
export function verplaats(
  ids: readonly string[],
  id: string,
  richting: 'omhoog' | 'omlaag',
): readonly string[] {
  const i = ids.indexOf(id);
  if (i === -1) return ids;

  const j = richting === 'omhoog' ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return ids;

  const kopie = [...ids];
  const hier = kopie[i];
  const daar = kopie[j];
  if (hier === undefined || daar === undefined) return ids;

  kopie[i] = daar;
  kopie[j] = hier;
  return kopie;
}
