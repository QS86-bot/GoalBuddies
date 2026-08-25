/**
 * De twee vormen die elke module-API teruggeeft.
 *
 * ⚠️ **Ze stonden hiervoor zeven keer woordelijk in de codebase** — `Resultaat`
 *    in `buddies/api`, `commitments/api`, `completions/api`,
 *    `completions/approvals`, `goals/api`, `goals/deadline` en `goals/weekly`;
 *    `Pagina` in `buddies/api` en `goals/api`. De bevinding van 16-08 in
 *    `docs/ENGINEER-REVIEW.md` voorspelde dat het er vier zouden worden "bij
 *    `completions` en `commitments`". Het waren er zeven.
 *
 * ⚠️ **Waarom dat een probleem is en niet alleen lelijk.** Modules mogen elkaars
 *    binnenkant niet importeren (CLAUDE.md, Architectuur), dus dit werden zeven
 *    verschillende nomínale types met dezelfde naam. TypeScript vergelijkt deze
 *    structureel, dus het werkte — maar `app/groep/[id].tsx` importeerde al een
 *    `Pagina` van de ene module en een `Resultaat` van de andere, en bij een
 *    volgende module was dat kopie acht. Eén van de zeven aanpassen zou stil een
 *    verschil opleveren dat nergens rood van wordt.
 *
 * ⚠️ **De paginagroottes zijn bewust níét meeverhuisd**, tegen wat de bevinding
 *    voorstelde. Er zijn er zes — `PER_PAGINA` (20, twee keer),
 *    `LEDEN_PER_PAGINA` (20), `BERICHTEN_PER_PAGINA` (30),
 *    `REACTIES_PER_PAGINA` (100) en `VERZOEKEN_PER_PAGINA` (20) — en dat zijn
 *    geen kopieën maar zes onafhankelijke knoppen die toevallig deels dezelfde
 *    stand hebben. Ze samenvoegen tot één constante zou betekenen dat het
 *    bijstellen van de ledenlijst stilletjes de chat verandert. Dat is geen
 *    opruimen maar een koppeling maken die er niet is. Zie ook
 *    `chat-schemas.test.ts`, dat expliciet toetst dat de chatpagina onder de
 *    vijftig blijft: dat is een eigenschap van díe pagina.
 */

/**
 * De uitkomst van een handeling die kan mislukken op een manier die de gebruiker
 * moet zien.
 *
 * ⚠️ `melding` is altijd tekst die je aan een mens kunt tonen, en komt uit de
 *    catalogus (QS8-115). Nooit een technische fout — die gaat naar
 *    `reportError()`.
 */
export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

/**
 * Eén pagina uit een lijst.
 *
 * ⚠️ `totaal` en `meer` staan er allebei, en dat is geen verdubbeling: `meer`
 *    komt uit de query zelf (kreeg ik een volle pagina terug?) en `totaal` uit
 *    een aparte telling. Een scherm dat "12 van 40" toont heeft ze allebei nodig.
 *
 * Ongepagineerd bestaat niet in dit project — CLAUDE.md, schaalbaarheidsregel 10.
 */
export interface Pagina<T> {
  readonly rijen: readonly T[];
  readonly totaal: number;
  readonly meer: boolean;
}
