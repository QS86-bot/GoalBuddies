/**
 * Eén aanroeppunt voor foutmeldingen vanuit een Edge Function — QS8-24, criterium 4.
 *
 * ⚠️ **Dit bestand is met de hand geschreven en wordt niet gegenereerd.** Alles
 *    in `_shared/observability/` komt uit `src/` via `npm run edge:sync` en
 *    draagt daarom een "GEGENEREERD BESTAND"-kop. Dit niet: het is de laag
 *    eromheen die wél Deno-specifiek is.
 *
 *    De scheiding is met opzet. `edge-rapport.ts` is puur en wordt in `src/`
 *    door vitest getoetst; hier staat precies het stukje dat daar niet kán
 *    staan: `Deno.env`, `crypto.randomUUID()` en `new Date()`. Die laatste twee
 *    zijn in `src/` verboden — de lintregel `no-restricted-syntax` slaat aan op
 *    `Date.now()` en correctheidsregel 7 op tijdrekenwerk buiten `shared/time`.
 *
 * ⚠️ **Zonder `SENTRY_DSN` gebeurt er niets**, en dat is vandaag de toestand.
 *    `meldEdgeFout()` doet dan geen enkele netwerkaanroep. Er verandert dus
 *    niets aan het gedrag van de drie functies tot die variabele gezet wordt:
 *
 *      npx supabase secrets set SENTRY_DSN='https://…@….ingest.sentry.io/…'
 *
 * ⚠️ **Waarom dit überhaupt nodig is.** De drie functies vangen hun fouten
 *    netjes af en geven daarna een 200 terug — bewust, want een mislukte job is
 *    geen kapotte functie. Het gevolg is dat niemand het merkt. Op 25-08 bleek
 *    de Doelcoach bij élke aanroep om te vallen met een `ReferenceError`, met
 *    HTTP 200 erop, en niemand weet hoe lang dat al zo was.
 */
import { meldEdgeFout, type Uitkomst } from './observability/edge-rapport.ts';

/**
 * Meldt een fout. Gooit zelf nooit en wacht nergens lang op.
 *
 * @param waar Waar in de app, bijvoorbeeld `rollover.profiel`. Nooit een
 *             gebruikerstekst — dit veld wordt een tag in Sentry.
 */
export function meld(
  fout: unknown,
  waar: string,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<Uitkomst> {
  return meldEdgeFout(fout, waar, {
    dsn: Deno.env.get('SENTRY_DSN'),
    nu: new Date(),
    id: crypto.randomUUID(),
    extra,
  });
}
