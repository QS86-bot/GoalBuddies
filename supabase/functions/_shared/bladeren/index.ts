// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/bladeren, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

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

/** Wat `verwerkBinnenBudget()` teruggeeft. */
export interface Budgetuitslag {
  /** Hoeveel rijen er aan `werk` zijn aangeboden en afgehandeld. */
  verwerkt: number;
  /** `false` als de bron niet leeg was toen het budget op was. */
  volledig: boolean;
}

/** Hoe `verwerkBinnenBudget()` begrensd is. */
export interface Budget {
  /** Hoeveel rijen er hoogstens tegelijk in `werk` zitten. Minstens 1. */
  gelijktijdig: number;
  /** Het tijdstip (ms, zelfde klok als `klok`) waarna geen nieuwe rij meer begint. */
  stopNa: number;
  /**
   * De klok, in ms. Verplicht en zonder standaard: buiten `src/shared/time`
   * leest niemand zelf de tijd (correctheidsregel 7), en `clock.ts` leest
   * `process.env` en kan dus niet mee naar Deno. De aanroeper geeft zijn eigen
   * klok mee; een test een klok die alleen loopt als er gewerkt wordt.
   */
  klok: () => number;
}

/**
 * Loopt een bron af met hoogstens `gelijktijdig` rijen tegelijk, en begint na
 * `stopNa` geen nieuwe rij meer — QS8-685.
 *
 * ⚠️⚠️ **Waarom een tijdbudget en niet alleen gelijktijdigheid.** De rollover
 *    liep zijn profielen één voor één af, en zijn looptijd groeide daardoor
 *    lineair met het aantal gebruikers. 📏 Op productie werd hij op 16-11-2026
 *    om 20:15 na 192 s en op 17-11 om 03:39 na 162 s afgesloten, midden in de
 *    profielenlus — en dan draait **niets van wat ná de lus staat**: stille
 *    groepen, seizoensrecaps, vastgelopen goedkeuringen, de opruiming van
 *    bijlagen. Gelijktijdigheid schuift die muur op; alleen een budget haalt
 *    hem weg. Met een budget is de looptijd van de lus begrensd, wat de
 *    gebruikersaantallen ook doen, en is het werk erna gegarandeerd.
 *
 * ⚠️ **Het budget breekt geen rij af.** Het besluit alleen of er een níéuwe
 *    begint; wat al loopt, maakt hij af. Een rij halverwege afbreken zou
 *    betekenen: een minpunt zonder weekpas, of een straf zonder de rest. Daarom
 *    is `stopNa` geen deadline maar een laatste starttijd, en hoort de aanroeper
 *    er de duur van één rij boven op te tellen.
 *
 * ⚠️ **Een fout in `werk` stopt het aanbieden, wacht de lopende rijen af en
 *    gooit dan.** Zelfde semantiek als de oude lus, waar een worp de hele ronde
 *    stopte — maar zonder rijen die nog lopen als de aanroeper zijn vangnet in
 *    gaat. Wie zachte fouten wil, vangt ze in `werk` zelf, zoals de rollover dat
 *    per stap doet.
 *
 * ⚠️ **De bron wordt nooit verder gelezen dan nodig.** Er wordt pas een
 *    volgende rij gevraagd als er een plek vrij is én het budget nog niet op is,
 *    dus een bron die pagina's ophaalt, haalt na het budget geen pagina meer op.
 */
export async function verwerkBinnenBudget<T>(
  bron: AsyncIterable<T>,
  werk: (rij: T) => Promise<void>,
  budget: Budget,
): Promise<Budgetuitslag> {
  if (!Number.isInteger(budget.gelijktijdig) || budget.gelijktijdig < 1) {
    throw new RangeError(`gelijktijdig moet een geheel getal ≥ 1 zijn, kreeg ${budget.gelijktijdig}`);
  }
  const { klok } = budget;
  const iterator = bron[Symbol.asyncIterator]();
  const lopend = new Set<Promise<void>>();
  let verwerkt = 0;
  let fout: { waarde: unknown } | null = null;

  const start = (rij: T) => {
    const taak: Promise<void> = werk(rij)
      .then(() => { verwerkt += 1; })
      .catch((e: unknown) => { fout ??= { waarde: e }; })
      .finally(() => { lopend.delete(taak); });
    lopend.add(taak);
  };

  let volledig = false;
  for (;;) {
    if (fout !== null || klok() >= budget.stopNa) break;
    if (lopend.size >= budget.gelijktijdig) {
      await Promise.race(lopend);
      continue;
    }
    const volgende = await iterator.next();
    if (volgende.done === true) {
      volledig = true;
      break;
    }
    start(volgende.value);
  }

  await Promise.all(lopend);
  if (!volledig) await iterator.return?.();
  if (fout !== null) throw (fout as { waarde: unknown }).waarde;
  return { verwerkt, volledig };
}
