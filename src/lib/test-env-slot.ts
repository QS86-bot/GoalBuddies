/**
 * Wat `.env` níet mag zetten voor de testsuite — QS8-703.
 *
 * ⚠️ **Het productieslot van de RLS-suite is een keuze per run, en een bestand
 *    is geen run.** `RLS_DOEL=productie` en `RLS_TEST_ALLOW_PROD=1` zijn de twee
 *    handelingen die de suite naar het echte project laten schrijven (QS8-702).
 *    Laadt `src/lib/test-env.ts` ze uit `.env`, dan staat het slot open voor
 *    élke volgende `npx vitest` op die machine — en precies zo ontstonden de
 *    1.865 testaccounts op productie (QS8-700): `RLS_TEST_ALLOW_PROD=1` stond in
 *    `.env` en in gekopieerde `.env`'s van werkbomen.
 *
 * Daarom twee regels, en ze wegen verschillend:
 *   - **Gevaarlijk** — `RLS_TEST_ALLOW_PROD` met een waarde, of
 *     `RLS_DOEL=productie` — staat in `.env`: de setup **werpt**. Alle tests
 *     worden rood tot de regel eruit is. Dat is bedoeld; een slot dat zich laat
 *     negeren is geen slot.
 *   - **Onschuldig** — `RLS_DOEL=lokaal`, of een lege `RLS_TEST_ALLOW_PROD=` uit
 *     `.env.example` — wordt overgeslagen. Het doel komt uit de procesomgeving,
 *     zoals `npm run rls:lokaal` het zet.
 *
 * Pure functies, zodat ze zonder bestand te voeden zijn.
 */

/** De twee sleutels die alleen uit de procesomgeving mogen komen. */
export const ALLEEN_UIT_DE_PROCESOMGEVING = ['RLS_DOEL', 'RLS_TEST_ALLOW_PROD'] as const;

/** Zet `.env` het productieslot? Dan de melding, anders `null`. */
export function slotInDotenv(bestand: Readonly<Record<string, string>>): string | null {
  const vlag = bestand.RLS_TEST_ALLOW_PROD;
  const doel = bestand.RLS_DOEL;
  const gevonden: string[] = [];

  if (vlag !== undefined && vlag.trim() !== '') gevonden.push(`RLS_TEST_ALLOW_PROD=${vlag}`);
  if (doel !== undefined && doel.trim().toLowerCase() === 'productie') gevonden.push(`RLS_DOEL=${doel}`);
  if (gevonden.length === 0) return null;

  return [
    `.env zet het productieslot van de RLS-suite: ${gevonden.join(' en ')}.`,
    'Die twee horen per run in de opdracht en nooit in een bestand: vanuit .env staat het',
    'slot open voor elke volgende testrun op deze machine (QS8-700, QS8-703).',
    'Haal de regel uit .env en geef het slot per run mee:',
    '  npx cross-env RLS_DOEL=productie RLS_TEST_ALLOW_PROD=1 vitest run tests/rls/<bestand>',
  ].join('\n');
}

/**
 * Wat er uit `.env` in de procesomgeving komt: alles wat er nog niet staat,
 * behalve de twee sleutels van het slot. Zelfde regel als dotenv zelf — een
 * waarde die het proces al heeft, wint.
 */
export function overTeNemen(
  bestand: Readonly<Record<string, string>>,
  omgeving: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const uitgesloten = new Set<string>(ALLEEN_UIT_DE_PROCESOMGEVING);
  return Object.fromEntries(
    Object.entries(bestand).filter(
      ([sleutel]) => !uitgesloten.has(sleutel) && !Object.hasOwn(omgeving, sleutel),
    ),
  );
}
