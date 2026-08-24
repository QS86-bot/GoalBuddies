import { z } from 'zod';

/**
 * Alle configuratie loopt via env vars (CLAUDE.md, beveiligingsregel 4) en wordt
 * hier één keer gevalideerd. Een ontbrekende variabele faalt bij het opstarten,
 * niet halverwege een gebruikersactie.
 *
 * ⚠️ Alles met EXPO_PUBLIC_ ervoor zit in de client-bundle. Secrets horen in
 *    `serverEnv`, dat alleen op de server wordt uitgelezen.
 */

/**
 * Het publieke adres van de app. Zonder dit kan een uitnodigingslink niet
 * gedeeld worden, en een uitnodiging die je niet kunt delen is geen uitnodiging.
 *
 * ⚠️ Een vaste waarde in de code zou hetzelfde adres in elke omgeving opleveren:
 *    een link uit een testomgeving zou dan naar productie wijzen. De standaard
 *    hieronder is het adres uit CLAUDE.md, zodat de app zonder configuratie
 *    werkt; hij hoort in elke andere omgeving overschreven te worden.
 */
const STANDAARD_APP_URL = 'https://goalbuddies.q-projects.tech';

const clientSchema = z.object({
  supabaseUrl: z.url({ error: 'EXPO_PUBLIC_SUPABASE_URL ontbreekt of is geen URL' }),
  supabaseAnonKey: z
    .string()
    .min(1, { error: 'EXPO_PUBLIC_SUPABASE_ANON_KEY ontbreekt' }),
  sentryDsn: z.string().optional(),
  appUrl: z.url({ error: 'EXPO_PUBLIC_APP_URL is geen URL' }),
  /**
   * De publieke VAPID-sleutel voor web push (QS8-114, aangezet in QS8-124).
   *
   * ⚠️ Bewust optioneel. Hij hoort publiek te zijn — daar is het een publieke
   *    sleutel voor — maar zonder hem moet de app gewoon draaien: web push is
   *    dan alleen niet aan te zetten, en het scherm zegt dat ook. Verplicht
   *    maken zou elke omgeving zonder sleutel bij het opstarten laten omvallen,
   *    en dat is een zware straf voor een ontbrekende melding.
   */
  vapidPublicKey: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

let cached: ClientEnv | undefined;

export function clientEnv(): ClientEnv {
  if (cached) return cached;

  const parsed = clientSchema.safeParse({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    appUrl: process.env.EXPO_PUBLIC_APP_URL ?? STANDAARD_APP_URL,
    vapidPublicKey: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY,
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
