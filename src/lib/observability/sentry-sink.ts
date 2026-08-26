/**
 * De bestemming waar fouten uit de app heen gaan — QS8-24, criterium 1.
 *
 * ⚠️ **Wat hier tot 26-08-2026 aan de hand was.** `reportError()` bestond, 34
 *    bestanden riepen hem aan, en `setErrorSink()` werd door **niets** in de
 *    productiecode aangeroepen — alleen in tests. Elke gemelde fout eindigde
 *    dus in `console.error`, op een apparaat dat niemand leest. Elk schakeltje
 *    af, de keten nergens aangesloten: dezelfde vorm als `verwijderPushToken()`
 *    en `profiles.locale`, en de reden dat CLAUDE.md regel 18 vraag 5 bestaat.
 *
 * ⚠️ **Geen SDK, en dat is een afweging die uitleg verdient.**
 *    `@sentry/react-native` zou meer geven: automatische instrumentatie,
 *    breadcrumbs, en — het enige dat je hier écht niet zelf kunt bouwen —
 *    **native crashes**. Maar de app draait vandaag alleen op het web, er is
 *    geen `eas.json` en geen EAS-project, en een native build vraagt een
 *    Apple-developeraccount. Dat is grens 1 uit CLAUDE.md.
 *
 *    De helft van die SDK die vandaag te gebruiken is, zou dus een tweede
 *    envelope-bouwer meebrengen naast de bouwer die op 26-08 met een echte
 *    ingest is gemeten (HTTP 200). Een tweede implementatie van iets dat al
 *    werkt is precies wat dit project die dag vier keer gekost heeft.
 *
 *    Wat we ervoor opgeven staat in
 *    `docs/decisions/2026-08-26-sentry-in-de-app.md`, en het omruilen is één
 *    `setErrorSink()` — daar is deze laag op ontworpen.
 *
 * ⚠️ **Er wordt hier niet nog eens geschoond.** `reportError()` heeft dat al
 *    gedaan: `ErrorEvent` draagt uitsluitend geschoonde velden. Nog een keer
 *    door `scrubMessage()` halen zou een tweede plek zijn die uit elkaar kan
 *    lopen met de eerste, en het zou `[weggelaten]` opnieuw kunnen verminken.
 */
import { now } from '../../shared/time';

import { gebeurtenisId, maakVerzending, ontleedDsn, type Verzending } from './edge-rapport';
import type { ErrorEvent, ErrorSink } from './index';

/** Waar de verzending heen gaat. Losgetrokken zodat de test hem kan vervangen. */
export interface Vervoer {
  (verzending: Verzending): void;
}

export interface SinkOpties {
  /** `EXPO_PUBLIC_SENTRY_DSN`. Ontbreekt hij, dan komt er geen sink. */
  readonly dsn: string | undefined;
  /** `web`, `ios` of `android` — `Platform.OS`. Wordt een tag. */
  readonly runtime: string;
  /** De versie van de app, voor het koppelen van source maps. */
  readonly release?: string | undefined;
  /** `production` of iets anders; weglaten mag. */
  readonly omgeving?: string | undefined;
  /**
   * Levert het moment.
   *
   * ⚠️ Standaard `now()` uit `shared/time` en géén `new Date()` hier.
   *    Correctheidsregel 7 verbiedt dat buiten die module, en de lintregel
   *    `no-restricted-syntax` slaat er ook daadwerkelijk op aan — dat is precies
   *    waarvoor hij bestaat. Het levert bovendien `freezeNow()` op in de test.
   */
  readonly nu?: () => Date;
  /** Levert een uniek id per gebeurtenis. */
  readonly id?: () => string;
  readonly vervoer?: Vervoer;
}

/**
 * Bouwt de sink, of geeft `undefined` als er geen bruikbare DSN is.
 *
 * ⚠️ `undefined` en geen sink-die-niets-doet. `setErrorSink(undefined)` laat
 *    `reportError()` terugvallen op `console.error`, en dat is in ontwikkeling
 *    precies wat je wilt zien. Een stille sink zou de melding laten verdwijnen
 *    zónder dat er iets aankomt — het slechtste van twee werelden.
 */
export function maakSentrySink(opties: SinkOpties): ErrorSink | undefined {
  const dsn = ontleedDsn(opties.dsn);
  if (dsn === null) {
    if (opties.dsn !== undefined && opties.dsn !== '') {
      // ⚠️ Wel een spoor. Een DSN die er staat maar niet deugt, is erger dan
      //    geen DSN: dan denk je dat je bewaakt wordt.
      console.error('EXPO_PUBLIC_SENTRY_DSN is onbruikbaar; er gaat niets naar Sentry.');
    }
    return undefined;
  }

  const nu = opties.nu ?? now;
  const id = opties.id ?? ((): string => crypto.randomUUID());
  const vervoer = opties.vervoer ?? standaardVervoer;

  return {
    capture(gebeurtenis: ErrorEvent): void {
      // ⚠️ Gooit nooit. Deze functie draait in het `try` van `reportError()`,
      //    maar dat vangnet mag niet de enige rem zijn: een sink die ontploft
      //    tijdens het melden van fout A maakt fout B, en die is niemand
      //    behulpzaam.
      try {
        vervoer(
          maakVerzending(
            dsn,
            {
              id: gebeurtenisId(id()),
              waar: gebeurtenis.where,
              naam: gebeurtenis.name,
              melding: gebeurtenis.message,
              stack: gebeurtenis.stack,
              context: gebeurtenis.context,
              runtime: opties.runtime,
              server: 'app',
              omgeving: opties.omgeving,
              release: opties.release,
            },
            nu(),
          ),
        );
      } catch {
        console.error(`[${gebeurtenis.where}] ${gebeurtenis.name}: ${gebeurtenis.message}`);
      }
    },
  };
}

/**
 * Versturen en niet wachten.
 *
 * ⚠️ **Bewust `void` en geen `Promise`.** `ErrorSink.capture()` geeft niets
 *    terug, en dat is met opzet: een scherm dat een fout meldt, mag daar niet op
 *    wachten. In de Edge Functions is dat andersom — daar moet je `await`-en
 *    vóór de Response, want Supabase bevriest de functie erna. Een app heeft dat
 *    probleem niet; hij blijft gewoon draaien.
 *
 * ⚠️ `keepalive` zodat een fout die vlak voor het sluiten van het tabblad
 *    optreedt de deur nog uit komt. Op native negeert `fetch` de optie.
 *
 * ⚠️ De afloop wordt stil ingeslikt. Een mislukte foutmelding een `console.error`
 *    geven zou bij een netwerkstoring een lus opleveren: melden mislukt, dus
 *    melden, dus mislukt.
 */
const standaardVervoer: Vervoer = (verzending) => {
  void fetch(verzending.url, {
    method: 'POST',
    headers: verzending.headers,
    body: verzending.body,
    keepalive: true,
    // CLAUDE.md coderegel 14: elke externe call heeft een timeout.
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
};
