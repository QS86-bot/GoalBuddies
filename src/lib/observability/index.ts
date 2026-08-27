/**
 * De rand waar fouten de app verlaten.
 *
 * ⚠️ Sentry zelf zit hier nog niet in, en waar dat op wacht is veranderd.
 *    Hier stond dat `@sentry/react-native` toevoegen "een keuze van Quinten" is;
 *    dat was de oude regel. Sinds 22-08-2026 is een dependency toevoegen een
 *    afweging die ik zelf maak en in het beslisdocument verantwoord — zie
 *    CLAUDE.md, *Beslisbevoegdheid*.
 *
 *    Wat er wél op Quinten wacht is de DSN: `EXPO_PUBLIC_SENTRY_DSN` is leeg, en
 *    een Sentry-account is een externe vastlegging (grens 1). Een SDK aansluiten
 *    op een bestemming die niet bestaat, levert alleen ongetoetste code op.
 *
 *    Wat er wél staat is het deel dat er hoe dan ook moet zijn en dat het
 *    moeilijkst achteraf goed te krijgen is: één aanroeppunt voor de hele app,
 *    en de garantie dat er geen persoonsgegevens uitgaan. Sentry aansluiten is
 *    daarna één implementatie van `ErrorSink` — geen wijziging in schermen.
 *
 * ⚠️ **De Edge Functions melden sinds 25-08 wél**, via `edge-rapport.ts` hier
 *    ernaast. Die heeft geen SDK nodig — hij bouwt de envelope zelf — en gebruikt
 *    dezelfde `scrub.ts`, zodat de app en de jobs niet uit elkaar kunnen lopen
 *    over wat een persoonsgegeven is. Zie QS8-24 criterium 4.
 */
import { clientEnv } from '../env';

import { scrubContext, scrubMessage, scrubStack } from './scrub';

/** Wat er daadwerkelijk verstuurd wordt. Nooit iets anders dan dit. */
export interface ErrorEvent {
  /** Waar in de app, bijvoorbeeld `goals.create`. Nooit een gebruikerstekst. */
  readonly where: string;
  readonly name: string;
  readonly message: string;
  readonly stack?: string | undefined;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface ErrorSink {
  capture(event: ErrorEvent): void;
}

let sink: ErrorSink | undefined;

/**
 * Koppelt de bestemming. Zonder sink gaat er niets naar buiten en blijft het bij
 * een console-regel — precies wat je in ontwikkeling wilt.
 */
export function setErrorSink(next: ErrorSink | undefined): void {
  sink = next;
}

/** Staat er een DSN klaar? Zo niet, dan is versturen sowieso niet aan de orde. */
export function observabilityConfigured(): boolean {
  return Boolean(clientEnv().sentryDsn);
}

function describe(
  error: unknown,
): { name: string; message: string; stack?: string | undefined } {
  if (error instanceof Error) {
    const message = scrubMessage(error.message);

    return {
      name: error.name,
      message,
      // ⚠️ Niet `error.stack` zelf. De eerste regel daarvan ís de ruwe melding,
      //    dus dat gaf alles terug wat `scrubMessage()` er net uit had gehaald.
      //    Zie de kop van `scrubStack()`.
      stack: scrubStack(error.stack, error.name, message),
    };
  }
  return { name: 'NonError', message: scrubMessage(String(error)) };
}

/**
 * Meld een fout. Gooit zelf nooit: een kapotte foutrapportage mag geen tweede
 * fout veroorzaken bovenop de eerste (CLAUDE.md, coderegel 14 in omgekeerde
 * richting — geen lege catch, maar ook geen catch die zelf ontploft).
 */
export function reportError(
  error: unknown,
  where: string,
  extra: Readonly<Record<string, unknown>> = {},
): void {
  try {
    const event: ErrorEvent = {
      where,
      ...describe(error),
      context: scrubContext(extra),
    };

    if (sink) {
      sink.capture(event);
      return;
    }

    console.error(`[${event.where}] ${event.name}: ${event.message}`, event.context);
  } catch (reportingFailure) {
    console.error('Foutrapportage zelf ging stuk', reportingFailure);
  }
}

export { REDACTED, scrubContext, scrubMessage, scrubStack } from './scrub';

export { maakSentrySink, type SinkOpties } from './sentry-sink';

export { koppelGlobaleFouten, type Luisteraar } from './globale-fouten';

export { releaseVoor } from './release';
