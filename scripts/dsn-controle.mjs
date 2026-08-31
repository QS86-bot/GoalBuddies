#!/usr/bin/env node
/**
 * Staat de Sentry-DSN écht in de gebouwde bundel? — QS8-24, stap 3 van 30-08-2026.
 *
 * ⚠️ **Waarom dit bestaat.** Er was tot 30-08 nooit één fout uit de app in
 *    Sentry aangekomen, en niemand kon zien waaróm niet. De keten heeft vier
 *    schakels — DSN in de bundel, `setErrorSink()` aangeroepen, envelope
 *    verstuurd, ingest accepteert — en alleen de laatste was bewezen. Dit
 *    bestand sluit de eerste, en wel op de enige plek waar het gratis is: vlak
 *    vóór het uploaden, als de bundel er al ligt.
 *
 * ⚠️ **Het gevaarlijke geval is niet "geen DSN" maar "wél een DSN en tóch niet
 *    in de bundel".** Dan denk je dat je bewaakt wordt terwijl er niets uitgaat.
 *    Precies de vorm van `setErrorSink()` dat nergens werd aangeroepen, van
 *    `profiles.locale` zonder schrijfpad en van `verwijderPushToken()` zonder
 *    aanroeper: elk schakeltje af, de keten nergens aangesloten. Dáárom breekt
 *    dat geval de deploy af en het andere niet.
 *
 * ⚠️ **Er wordt op de sleutel gezocht en niet op de hele DSN.** De sleutel is
 *    het deel vóór de `@` en is het enige stuk dat letterlijk in de bundel
 *    terechtkomt; host en project-id staan er ook, maar een minifier mag een
 *    URL-string in principe opknippen. De sleutel is één ononderbroken token.
 *
 * Het oordeel staat hier los van het lezen van bestanden, zodat de test hem
 * élke vorm kan voeden — de vormen die hij moet vinden én die hij met rust moet
 * laten. Een controle die je niet kunt voeden, kun je niet ijken (CLAUDE.md
 * regel 18).
 */

/**
 * De standaard-DSN zoals hij in `src/lib/env.ts` staat.
 *
 * ⚠️ **Uit de bron lezen en niet kopiëren.** De waarde staat in TypeScript en
 *    dit is een `.mjs`; een tweede letterlijke kopie hier zou precies de kopie
 *    zijn die in dit project al twee keer geruisloos uit elkaar liep. Liever
 *    één brosse regex met een test eronder dan twee waarheden.
 *
 * ⚠️ Geeft `null` als de constante niet gevonden wordt. De aanroeper moet dat
 *    als een fout behandelen en niet als "geen DSN" — anders verandert een
 *    hernoemde constante deze controle stilletjes in een die niets meet.
 */
export function standaardDsnUit(bron) {
  const m = /const STANDAARD_SENTRY_DSN\s*(?::[^=]*)?=\s*\n?\s*'([^']+)'/.exec(bron);
  return m === null ? null : m[1];
}

/**
 * De publieke sleutel uit een DSN, of `null` als het geen bruikbare DSN is.
 *
 * ⚠️ Bewust losjes: dit is geen validatie van de DSN — dat doet `ontleedDsn()`
 *    in de app al, en twee opvattingen over dezelfde vorm is precies de kopie
 *    die in dit project al een keer uit elkaar liep. Hier is de enige vraag:
 *    welk stuk tekst moet ik in de bundel terugvinden?
 */
export function sleutelUit(dsn) {
  if (typeof dsn !== 'string') return null;
  const m = /^https?:\/\/([^:@/]+)@/.exec(dsn.trim());
  return m === null ? null : m[1];
}

/** De paden waarin de sleutel letterlijk voorkomt. */
export function bestandenMetSleutel(sleutel, bestanden) {
  if (sleutel === null || sleutel === '') return [];
  return bestanden.filter(({ inhoud }) => inhoud.includes(sleutel)).map(({ pad }) => pad);
}

/**
 * Wat de deploy hiermee moet doen.
 *
 * - `uit`        — geen DSN geconfigureerd. Toegestaan, maar luid.
 * - `onbruikbaar`— er staat iets, maar er is geen sleutel uit te halen.
 * - `ontbreekt`  — ⚠️ een geldige DSN die niet in de bundel staat. Dit stopt de deploy.
 * - `aanwezig`   — de sleutel staat in de bundel.
 */
export function oordeel({ dsn, gevonden }) {
  const rauw = (dsn ?? '').trim();
  if (rauw === '') return 'uit';
  if (sleutelUit(rauw) === null) return 'onbruikbaar';
  return gevonden.length > 0 ? 'aanwezig' : 'ontbreekt';
}

/** Alleen `ontbreekt` breekt de deploy af — zie de kop. */
export function isFataal(uitkomst) {
  return uitkomst === 'ontbreekt' || uitkomst === 'onbruikbaar';
}
