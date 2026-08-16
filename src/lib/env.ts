import { z } from 'zod';

/**
 * Alle configuratie loopt via env vars (CLAUDE.md, beveiligingsregel 4) en wordt
 * hier één keer gevalideerd. Een ontbrekende variabele faalt bij het opstarten,
 * niet halverwege een gebruikersactie.
 *
 * ⚠️ Alles met EXPO_PUBLIC_ ervoor zit in de client-bundle. Secrets horen in
 *    `serverEnv`, dat alleen op de server wordt uitgelezen.
 */

const clientSchema = z.object({
  supabaseUrl: z.url({ error: 'EXPO_PUBLIC_SUPABASE_URL ontbreekt of is geen URL' }),
  supabaseAnonKey: z
    .string()
    .min(1, { error: 'EXPO_PUBLIC_SUPABASE_ANON_KEY ontbreekt' }),
  sentryDsn: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

let cached: ClientEnv | undefined;

export function clientEnv(): ClientEnv {
  if (cached) return cached;

  const parsed = clientSchema.safeParse({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => i.message).join('\n  - ');
    throw new Error(
      `Configuratie klopt niet. Kopieer .env.example naar .env en vul aan:\n  - ${details}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Alleen op de server aanroepen: Edge Functions, scripts en de RLS-testsuite.
 * De service-role-key omzeilt RLS volledig en mag nooit in een bundle belanden.
 */
export function serverServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY ontbreekt. Deze hoort alleen server-side te bestaan.',
    );
  }
  return key;
}
