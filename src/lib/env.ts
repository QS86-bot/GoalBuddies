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

/**
 * Waar de app zijn fouten heen stuurt.
 *
 * ⚠️ **Een DSN is geen secret, en dat is niet slordigheid maar het ontwerp.**
 *    Hij is een schrijf-only adres dat per definitie in élke clientbundel staat
 *    die je publiceert; iedereen die de site opent kan hem uitlezen. Hem
 *    behandelen als geheim levert geen bescherming op, alleen een stap die maar
 *    op één machine gezet kan worden.
 *
 * ⚠️ **En juist díe stap was het probleem.** Tot 30-08-2026 stond hij alleen in
 *    een `.env` op Quintens laptop. Gevolg: er was nooit één fout uit de app in
 *    Sentry aangekomen — niet omdat er iets stuk was, maar omdat het bewijs aan
 *    een handeling hing die vier dagen op vijf lijstjes stond en vijf keer niet
 *    gebeurde. Zelfde vorm als `setErrorSink()` dat nergens werd aangeroepen:
 *    elk schakeltje af, de keten nergens aangesloten.
 *
 * ⚠️ Wat het wél kost: wie hem uit de bundel plukt kan de quota volpompen. Dat
 *    gold gisteren ook al — hij stond in elke gedeployde bundel — en op de
 *    gratis tier is dat ruis en geen rekening. Wil je hem in een omgeving
 *    uitzetten, zet `EXPO_PUBLIC_SENTRY_DSN` dan expliciet op leeg; dat wint van
 *    deze standaard en er gaat dan niets naar buiten.
 */
const STANDAARD_SENTRY_DSN =
  'https://ef95b807683ebf76afef7c9184aabbcb@o4511976142274560.ingest.de.sentry.io/4511976458027088';

/**
 * Welke omgeving een gebeurtenis in Sentry krijgt.
 *
 * ⚠️ **Deze functie is de prijs van de standaard hierboven.** Zodra de DSN
 *    overal staat, rapporteert een `npm run dev` net zo hard als productie — en
 *    zonder dit veld zijn die twee in Sentry niet uit elkaar te houden. Dan is
 *    de eerste echte productiefout zoek tussen jouw eigen geknoei.
 *
 * ⚠️ De waarden zijn Engels en dat is met opzet: `environment` is een veld dat
 *    Sentry zelf filtert en groepeert, net als `server_name` en `runtime`
 *    hiernaast. Dit is interop en geen UI-tekst.
 */
export function sentryOmgevingUit(
  expliciet: string | undefined,
  nodeEnv: string | undefined,
): string {
  const gezet = (expliciet ?? '').trim();
  if (gezet !== '') return gezet;
  return nodeEnv === 'production' ? 'production' : (nodeEnv ?? 'development');
}

const clientSchema = z.object({
  supabaseUrl: z.url({ error: 'EXPO_PUBLIC_SUPABASE_URL ontbreekt of is geen URL' }),
  supabaseAnonKey: z
    .string()
    .min(1, { error: 'EXPO_PUBLIC_SUPABASE_ANON_KEY ontbreekt' }),
  sentryDsn: z.string().optional(),
  /** `production`, `development`, `test` — zie `sentryOmgevingUit()`. */
  sentryOmgeving: z.string().min(1),
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
    // ⚠️ `??` en niet `||`: een expliciet lege waarde betekent "uit" en moet
    //    de standaard verslaan. Met `||` zou leeg terugvallen op de standaard
    //    en was Sentry niet uit te zetten.
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? STANDAARD_SENTRY_DSN,
    sentryOmgeving: sentryOmgevingUit(
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
      process.env.NODE_ENV,
    ),
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
