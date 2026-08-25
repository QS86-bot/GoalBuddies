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

/**
 * Een rij zoals PostgREST hem teruggeeft: elke kolom kan er níét in zitten.
 *
 * ⚠️ **Dit patroon stond vijf keer woordelijk in de codebase** — `ChatRij`,
 *    `AntwoordRij`, `ReactieRij`, `OverzichtRij` en `WachtrijRij`, telkens als
 *    `{ readonly [K in keyof RpcX]: RpcX[K] | null }`. Het is de bevinding van
 *    18-08 uit `docs/ENGINEER-REVIEW.md`, en het is dezelfde klasse als
 *    `Resultaat<T>` hierboven: vijf nominale types met dezelfde vorm, die
 *    structureel vergelijken en dus wérken, tot iemand er één aanpast.
 *
 * ⚠️ **Waarom die nullability er überhaupt staat.** De gegenereerde typen in
 *    `database.types.ts` beschrijven wat de fúnctie belooft, niet wat er over de
 *    lijn komt. Een RPC die van vorm verandert terwijl `database.types.ts` nog
 *    niet opnieuw gegenereerd is, levert rijen op waar een kolom ontbreekt — en
 *    dan is `rij.titel` `undefined` terwijl het type `string` zegt. Deze vorm
 *    dwingt de aanroeper die mogelijkheid af te handelen, meestal met een
 *    `?? ''` of een expliciete controle vlak erna.
 *
 * ⚠️ Hij zegt `| null` en niet `| undefined`, en dat is bewust conservatief:
 *    `exactOptionalPropertyTypes` staat aan, dus een optionele sleutel zou een
 *    ander gedrag geven dan een sleutel die `null` mag zijn. Wat er in de
 *    praktijk gebeurt bij een ontbrekende kolom is `undefined`, maar elke
 *    aanroeper controleert met `??` of een nulcheck, en die vangen allebei.
 */
export type RpcRij<T> = { readonly [K in keyof T]: T[K] | null };

/**
 * De eerste validatiefout als tekst voor de gebruiker, of een terugval.
 *
 * ⚠️ **Deze uitdrukking stond negenentwintig keer woordelijk in de codebase** als
 *    `gevalideerd.error.issues[0]?.message ?? t('…')` — de derde helft van de
 *    bevinding van 18-08. Op zichzelf onschuldig, maar het is een besluit dat
 *    negenentwintig keer opnieuw genomen wordt: *welke* fout laat je zien als er
 *    meerdere zijn, en wat doe je als er geen bruikbare tekst is.
 *
 * ⚠️ **De eerste en niet alle, en dat is de keuze die hier vastligt.** Zod geeft
 *    één issue per veld; ze allemaal tonen levert een muur op waarin de
 *    gebruiker de eerste actie niet meer ziet. Het formulier springt naar het
 *    eerste kapotte veld, dus de eerste melding is de melding die bij die plek
 *    hoort.
 *
 * ⚠️ De terugval is verplicht en geen `?? ''`. Een lege melding is erger dan een
 *    algemene: het scherm toont dan een lege foutbalk en de gebruiker weet niet
 *    wat er mis is. Elke aanroeper geeft een zin uit de catalogus mee (QS8-115).
 *
 * ⚠️ Het argument is structureel getypeerd en niet als `ZodError`. Zo hoeft
 *    `shared/api` geen Zod te kennen — deze module draagt de vórm van een
 *    module-API en niet zijn validatiebibliotheek.
 */
export function invoerfout(
  fout: { readonly issues: readonly { readonly message: string }[] },
  terugval: string,
): string {
  // ⚠️ **`??` is hier te weinig, en dat bleek pas toen deze keuze één plek kreeg.**
  //    Alle negenentwintig kopieën schreven `issues[0]?.message ?? t('…')`, en
  //    een lege melding is geen `undefined` — die glipt door de `??` heen en
  //    levert een lege foutbalk op. Zeldzaam (het vraagt een `error: () => ''`
  //    of een `refine` zonder tekst), maar het is precies de situatie waarin de
  //    gebruiker het hardst een zin nodig heeft. Geen regressie van de kopieën
  //    maar een fout die ze allemaal deelden.
  const eerste = fout.issues[0]?.message?.trim();
  return eerste === undefined || eerste === '' ? terugval : eerste;
}
