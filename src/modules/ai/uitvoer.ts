/**
 * De uitvoer van de Doelcoach lezen — QS8-38.
 *
 * ⚠️ Dit bestand importeert bewust niets uit `jobs.ts`. Zou het dat wel doen,
 *    dan trekt elke test die deze regels controleert de Supabase-client en
 *    AsyncStorage mee, en daarmee React Native in een test die in Node draait.
 *    Zelfde reden als `weekly-schemas.ts`, `mijlpaal-schemas.ts` en
 *    `notifications/regels.ts` — en het is de derde keer in deze codebase dat
 *    precies dit misging. **Pure logica die je wilt testen, hoort in een bestand
 *    dat de client niet importeert.**
 */

/**
 * Eén voorgestelde mijlpaal, zoals de Doelcoach hem teruggeeft.
 *
 * ⚠️ Alles gecontroleerd. Dit is modeluitvoer: hij is server-side al met Zod
 *    gevalideerd vóór opslag, maar een scherm dat erop vertrouwt dat er een
 *    `title` staat, toont `undefined` op de dag dat het formaat verschuift.
 */
export interface VoorstelMijlpaal {
  readonly title: string;
  readonly description: string | null;
  readonly target_date: string | null;
}

/**
 * Haalt de mijlpalen uit de uitvoer van een afgeronde job.
 *
 * ⚠️ Accepteert `milestones` én `mijlpalen` én een kale array. Dit is de laatste
 *    plek vóór het scherm, en een lege lijst is hier een beter antwoord dan een
 *    crash.
 */
export function mijlpalenUit(output: unknown): readonly VoorstelMijlpaal[] {
  const bron = Array.isArray(output)
    ? output
    : typeof output === 'object' && output !== null
      ? ((output as Record<string, unknown>).milestones ??
        (output as Record<string, unknown>).mijlpalen)
      : null;

  if (!Array.isArray(bron)) return [];

  return bron
    .filter((rij): rij is Record<string, unknown> => typeof rij === 'object' && rij !== null)
    .map((rij) => ({
      title: typeof rij.title === 'string' ? rij.title : String(rij.titel ?? ''),
      description:
        typeof rij.description === 'string'
          ? rij.description
          : typeof rij.omschrijving === 'string'
            ? rij.omschrijving
            : null,
      target_date:
        typeof rij.target_date === 'string'
          ? rij.target_date
          : typeof rij.streefdatum === 'string'
            ? rij.streefdatum
            : null,
    }))
    .filter((m) => m.title.trim() !== '');
}

/**
 * De tegenspraak van de coach — QS8-38, laatste acceptatiecriterium.
 *
 * Leeg betekent: de deadline past bij de opgegeven uren. Staat er tekst, dan
 * zegt de coach dát het niet past, waarom, en welke uitweg er is.
 *
 * ⚠️ Geeft `null` bij een leeg of ontbrekend veld, en niet een lege string. Het
 *    scherm moet "geen bezwaar" kunnen onderscheiden van "een bezwaar zonder
 *    tekst" — dat laatste is een modelfout en hoort niet als lege waarschuwing
 *    in beeld te komen.
 */
export function haalbaarheidUit(output: unknown): string | null {
  if (typeof output !== 'object' || output === null) return null;

  const waarde = (output as Record<string, unknown>).haalbaarheid;
  if (typeof waarde !== 'string') return null;

  const schoon = waarde.trim();
  return schoon === '' ? null : schoon;
}
