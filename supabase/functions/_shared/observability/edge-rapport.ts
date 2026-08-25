// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/lib/observability, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

/**
 * Foutrapportage vanuit de Edge Functions — QS8-24, criterium 4.
 *
 * ⚠️ **Waarom dit criterium apart de moeite is.** De drie Edge Functions vangen
 *    hun fouten netjes af en schrijven ze weg: de Doelcoach zet ze in
 *    `ai_jobs.error`, de rollover en de notificatiejob roepen `console.error`.
 *    Alle drie geven daarna een 200 terug. Dat is bewust — een mislukte job is
 *    geen kapotte functie — maar het betekent ook dat **niemand het merkt**.
 *
 *    Dat is geen theorie. In de reviewronde van 25-08 bleek de Doelcoach bij
 *    élke aanroep om te vallen met een `ReferenceError` (`db` waar de client
 *    `alsSysteem` heet), met HTTP 200 erop. Hoe lang dat al zo was, is niet meer
 *    vast te stellen. Dít is de laag die dat had gemeld.
 *
 * ⚠️ **Zonder DSN gebeurt er niets, en dat is de normale toestand vandaag.**
 *    `SENTRY_DSN` staat niet in de Edge-omgeving. `meldEdgeFout()` doet dan geen
 *    enkele netwerkaanroep en geeft `'geen-dsn'` terug. Er verandert dus niets
 *    aan het gedrag tot Quinten een DSN zet — zie docs/DEPLOY.md.
 *
 * ⚠️ **Dezelfde schoonmaak als in de app, en met dezelfde code.** `scrub.ts`
 *    heeft nul imports en gaat via `npm run edge:sync` mee naar
 *    `supabase/functions/_shared/observability/`. Een tweede versie schrijven
 *    zou precies de kopie zijn die in dit project al een keer geruisloos uit
 *    elkaar liep (zie de kop van `sync-edge-shared.mjs`).
 *
 * ⚠️ **`nu` is een verplichte parameter en geen `new Date()` hierbinnen.**
 *    Correctheidsregel 7 verbiedt tijdrekenwerk buiten `shared/time`, en de
 *    lintregel `no-restricted-syntax` slaat aan op `Date.now()`. Zelfde vorm als
 *    `webpush-crypto.ts`. Het maakt de envelope bovendien toetsbaar.
 *
 * ⚠️ **Wat hier níét geverifieerd is:** de exacte draadvorm tegen een échte
 *    Sentry-ingest. Er is geen account, dus er is nooit een envelope aangekomen.
 *    De vorm volgt de gepubliceerde envelope-specificatie en de tests toetsen
 *    hem regel voor regel — maar dat is iets anders dan een 200 van Sentry.
 *    Staat als zodanig in `docs/ENGINEER-REVIEW.md`.
 */
import { scrubContext, scrubMessage, scrubStack } from './scrub.ts';

/** Wat er uit een DSN te halen valt. */
export interface Dsn {
  readonly sleutel: string;
  readonly host: string;
  readonly projectId: string;
}

/** Wat er over de lijn gaat. Losgetrokken zodat de test hem kan lezen. */
export interface Verzending {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type Uitkomst = 'verstuurd' | 'geen-dsn' | 'onbruikbare-dsn' | 'mislukt';

/** De naam waaronder deze code zich bij Sentry meldt. */
const CLIENT = 'goalbuddies-edge/1.0.0';

/**
 * Ontleedt `https://<sleutel>@<host>/<projectId>`.
 *
 * ⚠️ Geeft `null` in plaats van te gooien. Een onbruikbare DSN is een
 *    configuratiefout en mag nooit de functie omvertrekken die hij juist moest
 *    bewaken — dat zou van de foutrapportage de tweede fout maken.
 */
export function ontleedDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;

  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const sleutel = url.username;
  // ⚠️ Het pad is `/<projectId>`, eventueel met een prefix. Sentry zet het
  //    project-id altijd als laatste segment.
  const projectId = url.pathname.split('/').filter(Boolean).pop() ?? '';

  if (sleutel === '' || projectId === '' || url.hostname === '') return null;

  return { sleutel, host: url.host, projectId };
}

/** Het gebeurtenis-id dat Sentry verwacht: 32 hex-tekens, zonder streepjes. */
export function gebeurtenisId(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase().slice(0, 32);
}

/**
 * Bouwt de envelope. Puur, zodat de test kan lezen wat er daadwerkelijk uitgaat.
 *
 * ⚠️ **De stack gaat als losse tekst mee in `extra` en niet als `stacktrace`.**
 *    Sentry verwacht daar een ontlede structuur met frames, en die zou ik hier
 *    moeten verzinnen zonder hem ooit tegen een echte ingest te kunnen houden.
 *    Een veld dat klopt is meer waard dan een veld dat er goed uitziet.
 */
export function maakVerzending(
  dsn: Dsn,
  gegevens: {
    readonly id: string;
    readonly waar: string;
    readonly naam: string;
    readonly melding: string;
    readonly stack?: string | undefined;
    readonly context: Readonly<Record<string, unknown>>;
  },
  nu: Date,
): Verzending {
  const tijd = nu.toISOString();

  const gebeurtenis = {
    event_id: gegevens.id,
    timestamp: tijd,
    platform: 'javascript',
    level: 'error',
    logger: gegevens.waar,
    server_name: 'edge',
    exception: {
      values: [{ type: gegevens.naam, value: gegevens.melding }],
    },
    tags: { waar: gegevens.waar, runtime: 'deno' },
    extra: gegevens.stack === undefined
      ? gegevens.context
      : { ...gegevens.context, stack: gegevens.stack },
  };

  const payload = JSON.stringify(gebeurtenis);
  const lengte = new TextEncoder().encode(payload).length;

  const body = [
    JSON.stringify({ event_id: gegevens.id, sent_at: tijd }),
    JSON.stringify({ type: 'event', length: lengte, content_type: 'application/json' }),
    payload,
  ].join('\n');

  return {
    url: `https://${dsn.host}/api/${dsn.projectId}/envelope/`,
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=${CLIENT}, sentry_key=${dsn.sleutel}`,
    },
    body,
  };
}

/**
 * Zet een gevangen fout om in wat er verstuurd mag worden.
 *
 * ⚠️ Dit is de naad die ertoe doet, en de reden dat `rapport.test.ts` voor de
 *    app bestaat: `scrubMessage()` los toetsen zei niets, want `reportError()`
 *    zette de rúwe stack ernaast en de eerste regel van een stack ís de melding.
 *    Hier gaat de stack daarom door `scrubStack()` met de al geschoonde melding
 *    ernaast, precies zoals in `index.ts`.
 */
export function beschrijf(
  fout: unknown,
  extra: Readonly<Record<string, unknown>>,
): { naam: string; melding: string; stack?: string | undefined; context: Record<string, unknown> } {
  const context = scrubContext(extra);

  if (fout instanceof Error) {
    const melding = scrubMessage(fout.message);
    return {
      naam: fout.name,
      melding,
      stack: scrubStack(fout.stack, fout.name, melding),
      context,
    };
  }

  return { naam: 'NonError', melding: scrubMessage(String(fout)), context };
}

/** Waar de verzending heen gaat. Losgetrokken zodat de test hem kan vervangen. */
export interface Vervoer {
  (verzending: Verzending): Promise<void>;
}

/**
 * Meldt een fout vanuit een Edge Function. Gooit zelf nooit.
 *
 * ⚠️ Geen `await` op de aanroepkant nodig, maar wel mogelijk. De rollover draait
 *    per uur en heeft de tijd; een verzoekpad dat op een gebruiker wacht niet.
 */
export async function meldEdgeFout(
  fout: unknown,
  waar: string,
  opties: {
    readonly dsn: string | undefined;
    readonly nu: Date;
    readonly id: string;
    readonly extra?: Readonly<Record<string, unknown>>;
    readonly vervoer?: Vervoer;
  },
): Promise<Uitkomst> {
  if (!opties.dsn) return 'geen-dsn';

  const ontleed = ontleedDsn(opties.dsn);
  if (ontleed === null) {
    // ⚠️ Wel een spoor achterlaten. Een DSN die stilletjes niet werkt, is erger
    //    dan geen DSN: dan denk je dat je bewaakt wordt.
    console.error('SENTRY_DSN is onbruikbaar; er gaat geen foutmelding uit.');
    return 'onbruikbare-dsn';
  }

  try {
    const beschrijving = beschrijf(fout, opties.extra ?? {});
    const verzending = maakVerzending(
      ontleed,
      { id: gebeurtenisId(opties.id), waar, ...beschrijving },
      opties.nu,
    );

    const vervoer = opties.vervoer ?? standaardVervoer;
    await vervoer(verzending);
    return 'verstuurd';
  } catch (eigen) {
    // ⚠️ Een kapotte foutrapportage mag geen tweede fout veroorzaken bovenop de
    //    eerste. Zelfde regel als in `index.ts`.
    console.error(
      `foutmelding versturen mislukte: ${eigen instanceof Error ? eigen.name : 'onbekend'}`,
    );
    return 'mislukt';
  }
}

/** ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14. */
const standaardVervoer: Vervoer = async (verzending) => {
  await fetch(verzending.url, {
    method: 'POST',
    headers: verzending.headers,
    body: verzending.body,
    signal: AbortSignal.timeout(5_000),
  });
};
