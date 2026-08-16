/**
 * De rand waar fouten de app verlaten.
 *
 * ⚠️ Sentry zelf zit hier nog niet in. `@sentry/react-native` toevoegen is een
 *    nieuwe dependency, en die keuze ligt bij Quinten (CLAUDE.md); bovendien is
 *    `EXPO_PUBLIC_SENTRY_DSN` nog leeg. Zie docs/Q-TODO.md.
 *
 *    Wat er wél staat is het deel dat er hoe dan ook moet zijn en dat het
 *    moeilijkst achteraf goed te krijgen is: één aanroeppunt voor de hele app,
 *    en de garantie dat er geen persoonsgegevens uitgaan. Sentry aansluiten is
 *    daarna één implementatie van `ErrorSink` — geen wijziging in schermen.
 */
import { clientEnv } from '../env';

import { scrubContext, scrubMessage } from './scrub';

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
    return {
      name: error.name,
      message: scrubMessage(error.message),
      // De stack draagt bestandsnamen en regelnummers, geen gebruikersdata.
      stack: error.stack,
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

export { REDACTED, scrubContext, scrubMessage } from './scrub';
