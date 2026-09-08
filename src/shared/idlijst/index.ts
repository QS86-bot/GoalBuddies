/**
 * Een id-lijst die over de URL gaat, in brokken — QS8-368.
 *
 * ⚠️ **De klif zit in het antwoord en niet in het verzoek, en dat is de hele
 *    reden dat dit bestand bestaat.** PostgREST echoot bij een GET de volledige
 *    querystring terug in een `Content-Location`-responseheader, percent-gecodeerd.
 *    Undici — de fetch van Node en van de webbundel — kapt af zodra álle
 *    responseheaders samen boven 16 KB uitkomen, met `UND_ERR_HEADERS_OVERFLOW`.
 *
 * ⚠️ **Wat er dan terugkomt is een gewoon `{ error }` en geen uitzondering**, en
 *    dat is nagemeten toen een test die het tegendeel aannam rood werd.
 *    `postgrest-js` 2.112.3 vangt die code af (`PostgrestBuilder.ts:431`):
 *    `status: 0`, `code: ''`, `message: 'TypeError: fetch failed'`, en een
 *    `hint` die de oorzaak bij naam noemt. Een `if (error)`-tak vángt dit dus —
 *    het gevolg is geen scherm dat omvalt maar een lijst die stílzwijgend leeg
 *    blijft. Bij de Risico-radar leest dat als "nog niet berekend", en dat is een
 *    betekenisvolle stand.
 *
 * 📏 Gemeten op de lokale PostgREST (08-09-2026, `goal_risk` met UUID's van 36
 *    tekens), binair gezocht naar de kantelrand:
 *
 *      200 id's   url= 7445   content-location= 7826    HTTP 200
 *      400 id's   url=14845   content-location=15626    HTTP 200
 *      415 id's                headers samen ~16390      HTTP 200   ← laatste
 *      416 id's                                          UND_ERR_HEADERS_OVERFLOW
 *      500 id's   url=18545                              UND_ERR_HEADERS_OVERFLOW
 *
 *    16 KB is 16384 bytes; de laatste die lukt zit daar tegenaan. **Dus niet de
 *    URL-lengte is de grens maar de teruggekaatste querystring**, en die is door
 *    het percent-coderen van `(`, `)` en `,` ongeveer 5% lánger dan de URL.
 *
 * ⚠️ **Dat verklaart een verschil dat anders onverklaarbaar is.** Een `.rpc()`
 *    met een even lange URL komt er wél door: dat is een POST, en daar zet
 *    PostgREST die header niet. Een GET van 16455 tekens faalde en een POST van
 *    16506 lukte — de conclusie "de URL is te lang" was daarmee bijna
 *    onvermijdelijk en fout.
 *
 * ⚠️ **Waarom 200 en niet 400.** De klif is een budget over álle headers samen,
 *    dus hij verschuift met wat er verder nog in het antwoord staat: een langere
 *    `select`, een extra filter, een `Preference-Applied`. 200 laat de helft van
 *    het budget vrij, en het is hetzelfde getal als `STAP` in `goals/api.ts`,
 *    dat om dezelfde reden bestaat.
 *
 * ⚠️ **Wat hier niet in zit.** Of Hermes' fetch op een echt toestel dezelfde
 *    16 KB kent. Deze meting is in Node gedaan; op een toestel kan de klif hoger
 *    of lager liggen. 200 is ruim genoeg dat dat verschil niet uitmaakt — maar
 *    wie het getal verhoogt, meet eerst dáár.
 */

/**
 * Hoeveel id's er hoogstens in één `.in()` op een GET gaan.
 *
 * ⚠️ Dit is een grens op het protocol en niet op het scherm. Een paginagrootte
 *    zegt hoeveel iemand wil zien; dit zegt hoeveel er in één verzoek pást. Ze
 *    horen niet dezelfde constante te zijn, om dezelfde reden als in de kop van
 *    `shared/api`: dan verandert het bijstellen van de een stilletjes de ander.
 */
export const IDS_PER_VERZOEK = 200;

/**
 * Hakt een lijst in brokken van hoogstens `grootte`.
 *
 * ⚠️ **Een lege lijst geeft nul brokken en niet één lege.** Dat scheelt de
 *    aanroeper een verzoek dat gegarandeerd niets oplevert — en `.in('x', [])`
 *    is bovendien een vorm waar PostgREST zelf over struikelt.
 *
 * ⚠️ **Ontdubbelt niet.** Dat is een keuze van de aanroeper: `fetchDoelnamen()`
 *    doet het wél (`[...new Set(ids)]`) omdat zijn lijst uit twee bronnen komt,
 *    en een helper die het stilzwijgend voor iedereen doet, verbergt dat daar
 *    een reden achter zat.
 */
export function brokken<T>(
  lijst: readonly T[],
  grootte: number = IDS_PER_VERZOEK,
): readonly (readonly T[])[] {
  if (grootte < 1) {
    throw new RangeError(`brokgrootte moet minstens 1 zijn, kreeg ${grootte}`);
  }

  const uit: (readonly T[])[] = [];
  for (let i = 0; i < lijst.length; i += grootte) {
    uit.push(lijst.slice(i, i + grootte));
  }
  return uit;
}
