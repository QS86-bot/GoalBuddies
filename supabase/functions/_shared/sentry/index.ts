/**
 * De rand waar een fout de Edge Functions verlaat — naar Sentry.
 *
 * ⚠️ Geen npm-SDK maar `fetch`, net als de Anthropic-call in doelcoach en de
 *    Expo-push in notificaties. Sentry's ingest is één POST; `@sentry/deno`
 *    meeslepen zou een dependency én een cold-start kosten voor precies dat ene
 *    verzoek. CLAUDE.md rekent een dependency toevoegen tot een afweging — de
 *    onderbouwing staat in docs/decisions/2026-08-26-sentry-in-edge-functions.md.
 *
 * ⚠️ Deze helper gooit zelf nooit. Een kapotte foutrapportage mag geen tweede
 *    fout stapelen op de eerste; dat is dezelfde regel als in de app
 *    (`src/lib/observability/reportError`). Bij twijfel valt hij terug op de log.
 *
 * ⚠️ Wat er de deur uit gaat is bewust karig: het type, de melding, de stack en
 *    een paar niet-gevoelige tags. **Nooit** `ai_jobs.input`, een doeltitel, een
 *    notitie of iets waaruit domeinregel 7 een gemiste week zou laten aflezen.
 *    De meegegeven `extra` wordt geknepen tot primitieven — objecten en arrays
 *    gaan niet mee, zodat er niet per ongeluk een hele rij naar buiten lekt.
 *
 * ⚠️ Deze map wordt **niet** door `npm run edge:sync` beheerd (die raakt alleen
 *    `_shared/time` en `_shared/notificaties`). Dit is edge-only code: de app
 *    heeft haar eigen weg naar Sentry via `ErrorSink`. Er is dus geen origineel
 *    in `src/` — bewerk dit bestand rechtstreeks.
 */

/** Waar de ingest zit en waarmee we ons legitimeren, uit de DSN gehaald. */
interface OntleedDsn {
  ingestUrl: string;
  publicKey: string;
  dsn: string;
}

/**
 * Haalt de ingest-URL en de publieke sleutel uit een DSN van de vorm
 * `https://<publicKey>@<host>/<projectId>`. Geeft `null` als hij onleesbaar is —
 * dan melden we niets in plaats van te gokken.
 */
function ontleedDsn(dsnRuw: string): OntleedDsn | null {
  try {
    const u = new URL(dsnRuw);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!publicKey || !projectId) return null;
    return {
      ingestUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      publicKey,
      dsn: dsnRuw,
    };
  } catch {
    return null;
  }
}

/** CLAUDE.md coderegel 14: elke externe call heeft een timeout. */
const TIMEOUT_MS = 5_000;

type Primitief = string | number | boolean;

/**
 * Knijpt `extra` tot primitieven. Alles wat een object of array is valt weg —
 * dat is de grendel die voorkomt dat een aanroeper per ongeluk een hele
 * database-rij (met gebruikerstekst erin) meegeeft.
 */
function veiligeExtra(extra: Record<string, unknown>): Record<string, Primitief> {
  const uit: Record<string, Primitief> = {};
  for (const [sleutel, waarde] of Object.entries(extra)) {
    const soort = typeof waarde;
    if (soort === 'string' || soort === 'number' || soort === 'boolean') {
      uit[sleutel] = waarde as Primitief;
    }
  }
  return uit;
}

interface FoutInfo {
  name: string;
  message: string;
  stack?: string;
}

function beschrijf(fout: unknown): FoutInfo {
  if (fout instanceof Error) {
    // De stack draagt bestandsnamen en regelnummers, geen gebruikersdata.
    return { name: fout.name, message: fout.message, stack: fout.stack };
  }
  return { name: 'NonError', message: String(fout) };
}

/**
 * Meld een fout aan Sentry. Geeft `true` als het versturen lukte, `false` als er
 * geen DSN is, hij onleesbaar is, of Sentry hem niet accepteerde — nooit een
 * exception.
 *
 * ⚠️ Bewust `async` en bedoeld om ge-`await`-d te worden vóór de Response terug
 *    gaat. Supabase kan een Edge Function bevriezen zodra het antwoord verstuurd
 *    is; een niet-afgewachte `fetch` wordt dan afgekapt en het event komt nooit
 *    aan. Vandaar: eerst melden, dan antwoorden.
 *
 * @param waar  Waar in de code, bijvoorbeeld `doelcoach` of `rollover.profielen`.
 *              Nooit een gebruikerstekst — dit wordt een tag in Sentry.
 */
export async function meldFout(
  fout: unknown,
  waar: string,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const info = beschrijf(fout);

  try {
    const dsnRuw = Deno.env.get('SENTRY_DSN');
    if (!dsnRuw) {
      // Geen DSN is een keuze, geen storing: val terug op de log zoals de app
      // dat zonder sink doet. Zo draait alles ook lokaal zonder Sentry.
      console.error(`[${waar}] ${info.name}: ${info.message}`);
      return false;
    }

    const dsn = ontleedDsn(dsnRuw);
    if (!dsn) {
      console.error(`SENTRY_DSN is onleesbaar; fout niet gemeld voor ${waar}`);
      return false;
    }

    const eventId = crypto.randomUUID().replace(/-/g, '');
    const nu = new Date().toISOString();

    const event = {
      event_id: eventId,
      timestamp: nu,
      platform: 'javascript',
      level: 'error',
      logger: 'edge',
      server_name: waar,
      environment: Deno.env.get('SENTRY_ENVIRONMENT') ?? 'production',
      tags: { function: waar, runtime: 'deno' },
      exception: {
        values: [{ type: info.name, value: info.message }],
      },
      extra: {
        ...veiligeExtra(extra),
        ...(info.stack ? { stack: info.stack } : {}),
      },
    };

    // Het envelope-formaat: drie door newlines gescheiden JSON-regels —
    // envelope-kop, item-kop, item-inhoud.
    const body =
      `${JSON.stringify({ event_id: eventId, sent_at: nu, dsn: dsn.dsn })}\n` +
      `${JSON.stringify({ type: 'event' })}\n` +
      `${JSON.stringify(event)}\n`;

    const antwoord = await fetch(dsn.ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth':
          `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=goalbuddies-edge/1.0`,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!antwoord.ok) {
      console.error(`Sentry gaf HTTP ${antwoord.status} bij het melden van ${waar}`);
      return false;
    }

    return true;
  } catch (meldfout) {
    // De rapportage zelf ging stuk. Eén logregel, en verder niets — de
    // oorspronkelijke fout is al belangrijker dan deze.
    console.error(`Foutrapportage naar Sentry ging zelf stuk bij ${waar}`, meldfout);
    return false;
  }
}
