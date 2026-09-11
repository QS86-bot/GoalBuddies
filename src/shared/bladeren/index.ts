/**
 * Een lijst in pagina's aflopen — QS8-206.
 *
 * ⚠️ **Waarom dit hier staat en niet in de Edge Function.** De rollover liep de
 *    profielen af met `.select(...)` zonder meer. PostgREST kent een `max-rows`;
 *    staat die gezet, dan kapt hij de lijst af en slaat die job **stilzwijgend
 *    een deel van de gebruikers over** — geen fout, geen melding, alleen weken
 *    die voor niemand afgesloten worden.
 *
 *    Een reparatie in de functie zelf is niet te toetsen: die draait op Deno en
 *    er is hier geen runtime voor. Zo staat de rekenkunde in `src/`, waar vitest
 *    hem elke vorm los kan aanbieden, en gaat hij via `npm run edge:sync` mee —
 *    dezelfde constructie als `shared/time` en `edge-rapport.ts`.
 *
 * ⚠️ **Wat hier níet in kan.** Dat de query een stabiele `order` draagt. Zonder
 *    sortering mag Postgres rijen in elke volgorde teruggeven en dan overlappen
 *    pagina's elkaar én missen ze rijen — maar dat is een eigenschap van de
 *    query en niet van deze lus. Het staat bij de aanroeper, met een
 *    waarschuwing erbij.
 */

/** Haalt één pagina op. `start` is nul-gebaseerd en `aantal` is de paginagrootte. */
export type Paginahaler<T> = (start: number, aantal: number) => Promise<readonly T[]>;

/**
 * Loopt alle pagina's af, van voren naar achteren.
 *
 * ⚠️ **Stopt op een korte pagina en niet op een lege.** Een volle pagina kost
 *    hooguit één leeg verzoek aan het eind; stoppen op een korte pagina kan niet
 *    liegen. Dezelfde afweging als bij `meer` in `fetchBeoordelingen()` (0125) —
 *    en het scheelt bij een job die elk uur draait één ronde per keer.
 *
 * ⚠️ **Een pagina groter dan gevraagd stopt de lus ook.** Dat kan niet gebeuren
 *    bij een correcte `range()`, en juist daarom: gebeurt het toch, dan klopt de
 *    aanname onder deze lus niet en is doorlopen gevaarlijker dan stoppen.
 */
export async function* paginas<T>(
  haal: Paginahaler<T>,
  grootte: number,
): AsyncGenerator<readonly T[], void, undefined> {
  if (grootte < 1) {
    throw new RangeError(`paginagrootte moet minstens 1 zijn, kreeg ${grootte}`);
  }

  let start = 0;
  for (;;) {
    const pagina = await haal(start, grootte);
    if (pagina.length === 0) return;

    yield pagina;

    if (pagina.length !== grootte) return;
    start += grootte;
  }
}

/**
 * Loopt alle rijen af alsof er geen pagina's zijn.
 *
 * ⚠️ **Waarom dit naast `paginas()` staat en niet in plaats daarvan** —
 *    QS8-422. Bijna elke aanroeper wil de ríjen en niet de pagina's, en schrijft
 *    daarom `for await (const pagina of paginas(…)) { for (const rij of pagina)
 *    { … } }`. Die buitenste lus is dan een laag nesting die niets met het
 *    probleem te maken heeft, en in de twee jobs die elk uur draaien duwde hij
 *    élke vertakking eronder één stap dieper dan de code leest.
 *
 *    📏 Gemeten: de `for await` stond in `rollover/index.ts` en
 *    `notificaties/index.ts` allebei op dezelfde inspringing als de lus
 *    eronder — het lichaam is bij het invoeren van de paginering nooit
 *    herschreven. De nesting was er dus bij gekomen zonder dat iemand hem heeft
 *    zien staan.
 *
 * ⚠️ **`paginas()` blijft bestaan** voor de aanroeper die de pagina zélf nodig
 *    heeft — een blokgewijze `remove()` bijvoorbeeld, waar het hele punt is dat
 *    je honderd paden in één verzoek stuurt.
 */
export async function* rijen<T>(
  haal: Paginahaler<T>,
  grootte: number,
): AsyncGenerator<T, void, undefined> {
  for await (const pagina of paginas(haal, grootte)) {
    for (const rij of pagina) yield rij;
  }
}
