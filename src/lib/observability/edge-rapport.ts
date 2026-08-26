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
 * ⚠️ **Wat er op 26-08-2026 wél en niet geverifieerd is.** Er is sinds die dag
 *    een DSN, en de envelope is met de échte sleutel gebouwd en verstuurd.
 *
 *    | Wat | Stand |
 *    |---|---|
 *    | De DSN wordt goed ontleed, ook een EU-project (`ingest.de.sentry.io`) | ✅ |
 *    | De drie regels, de itemkop en de octetlengte | ✅ op de echte bytes |
 *    | Er gaat niets persoonlijks over de lijn | ✅ op de echte bytes |
 *    | De ingest **accepteert** de envelope | ❌ nog steeds niet bewezen |
 *
 *    Die laatste kon niet: de omgeving waarin dit gebouwd wordt laat het
 *    ingest-adres niet door en gaf 403. Dat is een grens van de werkplek en
 *    niet van Sentry. `npm run sentry:proef` doet precies deze controle vanaf
 *    een machine die er wél bij kan.
 *
 * ⚠️ En juist die 403 legde een gat bloot dat de tests niet konden zien: deze
 *    laag meldde `'verstuurd'`. Zie de kop van `Vervoer` hieronder.
 */
import { scrubContext, scrubMessage, scrubStack } from './scrub';

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

export type Uitkomst =
  | 'verstuurd'
  | 'geen-dsn'
  | 'onbruikbare-dsn'
  /**
   * De ingest antwoordde, maar met een foutcode. Een eigen uitkomst en niet
   * `'mislukt'`, want er is een verschil dat ertoe doet: `'mislukt'` is het
   * netwerk of onze eigen code, `'geweigerd'` is Sentry die zegt dat er iets
   * aan het verzoek niet deugt — een verkeerde sleutel, een verkeerd project,
   * een envelope die hij niet leest.
   */
  | 'geweigerd'
  | 'mislukt';

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
    /**
     * ⚠️ De omgeving waarin dit draait, als hij gezet is. Zonder dit veld gooit
     *    Sentry alles op één hoop en is een fout uit een proefdeploy niet van
     *    een echte te onderscheiden — precies op het moment dat je erop
     *    vertrouwt. Komt uit `SENTRY_ENVIRONMENT`; ontbreekt hij, dan laat deze
     *    laag het veld weg in plaats van iets te verzinnen.
     */
    readonly omgeving?: string | undefined;
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
    ...(gegevens.omgeving === undefined ? {} : { environment: gegevens.omgeving }),
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

/**
 * Waar de verzending heen gaat. Losgetrokken zodat de test hem kan vervangen.
 *
 * ⚠️ **Geeft de HTTP-status terug en niet `void`, en dat was een gat.** `fetch()`
 *    verwerpt alleen bij een netwerkfout; een 400 of 403 van de ingest is een
 *    geslaagde belofte. Deze laag meldde daardoor `'verstuurd'` terwijl er niets
 *    was aangekomen — precies het "stilletjes niet werken" dat de kop hierboven
 *    erger noemt dan geen DSN. Gevonden op 26-08-2026 door de envelope naar de
 *    échte ingest te sturen: de proxy van deze omgeving gaf 403, en deze code
 *    zei tevreden `'verstuurd'`.
 */
export interface Vervoer {
  (verzending: Verzending): Promise<number>;
}

/**
 * Meldt een fout vanuit een Edge Function. Gooit zelf nooit.
 *
 * ⚠️ **De aanroepkant hoort te `await`-en, en dat is geen stijlkeuze.** Supabase
 *    kan een Edge Function bevriezen zodra het antwoord verstuurd is; een
 *    `fetch` die dan nog loopt, wordt afgekapt en de melding komt nooit aan.
 *    Eerst melden, dan antwoorden.
 *
 *    Hier stond tot 26-08-2026 het tegenovergestelde — "geen `await` nodig" —
 *    terwijl alle vijf de aanroepen het wél deden. De code klopte dus, maar het
 *    commentaar nodigde uit tot de fout. Gevonden in de tweede
 *    Sentry-implementatie die dezelfde dag naast deze bleek te bestaan; dat is
 *    het enige goede dat een dubbele implementatie oplevert.
 */
export async function meldEdgeFout(
  fout: unknown,
  waar: string,
  opties: {
    readonly dsn: string | undefined;
    readonly nu: Date;
    readonly id: string;
    readonly extra?: Readonly<Record<string, unknown>>;
    readonly omgeving?: string | undefined;
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
      { id: gebeurtenisId(opties.id), waar, omgeving: opties.omgeving, ...beschrijving },
      opties.nu,
    );

    const vervoer = opties.vervoer ?? standaardVervoer;
    const status = await vervoer(verzending);

    if (status < 200 || status >= 300) {
      // ⚠️ Wel een spoor achterlaten, om dezelfde reden als bij een onbruikbare
      //    DSN: een melding die geweigerd wordt en niets zegt, laat je denken
      //    dat je bewaakt wordt.
      console.error(`Sentry weigerde de melding: HTTP ${status}.`);
      return 'geweigerd';
    }

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
  const antwoord = await fetch(verzending.url, {
    method: 'POST',
    headers: verzending.headers,
    body: verzending.body,
    signal: AbortSignal.timeout(5_000),
  });

  // ⚠️ Het antwoord wordt niet gelezen, alleen de status. De ingest geeft een
  //    `event_id` terug en daar doet deze laag niets mee; de body laten liggen
  //    scheelt een lezing die toch weggegooid wordt.
  return antwoord.status;
};
