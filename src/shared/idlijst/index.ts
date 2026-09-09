/**
 * Een id-lijst die over de URL gaat, in brokken — QS8-368.
 *
 * ⚠️ **De klif zit in het antwoord en niet in het verzoek, en dat is de hele
 *    reden dat dit bestand bestaat.** PostgREST echoot bij een GET de volledige
 *    querystring terug in een `Content-Location`-responseheader, percent-gecodeerd.
 *    Undici — de fetch van Node — kapt af zodra álle responseheaders samen boven
 *    16 KB uitkomen, met `UND_ERR_HEADERS_OVERFLOW`.
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
 * 📏 Gemeten op de lokale PostgREST (08-09-2026, `goals` met UUID's van 36
 *    tekens), binair gezocht naar de kantelrand:
 *
 *      200 id's   url= 7445   content-location= 7826    HTTP 200
 *      400 id's   url=14845   content-location=15626    HTTP 200
 *      415 id's                headers samen ~16390      HTTP 200   ← laatste
 *      416 id's                                          UND_ERR_HEADERS_OVERFLOW
 *
 *    16 KB is 16384 bytes; de laatste die lukt zit daar tegenaan. **Dus niet de
 *    URL-lengte is de grens maar de teruggekaatste querystring**, en die is door
 *    het percent-coderen van `(`, `)` en `,` ongeveer 5% lánger dan de URL.
 *
 * ⚠️ **Eén getal is er geen, want de klif schuift met de rest van het verzoek.**
 *    📏 Zelfde tabel, andere `select`: `select=id` → 415, `select=id,title,category`
 *    → 414, met een `neq`, een `order` en een `limit` erbij → 413. Alles wat
 *    mee-echoot in `Content-Location` eet van hetzelfde budget. Reken dus op
 *    "ergens boven de 400" en niet op een grens.
 *
 * ⚠️ **En `.or()` valt eerder om dan `.in()`**: 📏 op `goals?select=id` haalt
 *    `.in()` er 415 en `.or()` er 360 — een `id.eq.` per id is nu eenmaal langer
 *    dan een komma. `scripts/idlijst-controle.mjs` kent alle drie de vormen.
 *
 * ⚠️ **Dat verklaart een verschil dat anders onverklaarbaar is.** Een `.rpc()`
 *    met een even lange URL komt er wél door: dat is een POST, en daar zet
 *    PostgREST die header niet. Een GET van 16455 tekens faalde en een POST van
 *    16506 lukte — de conclusie "de URL is te lang" was daarmee bijna
 *    onvermijdelijk en fout.
 *
 * ⚠️⚠️ **Er zijn twee muren en niet één, en dat is de reden dat hier 100 staat
 *    en niet 200.** De 16 KB hierboven is de héénweg terug; er is ook een
 *    heenweg. Een proxy vóór PostgREST — nginx en Kong staan standaard op
 *    `large_client_header_buffers … 8k` — kapt de **verzoekregel** af, en die is
 *    percent-gecodeerd langer dan hij eruitziet. 📏 Gemeten met de echte
 *    queries van dit project:
 *
 *      100 id's   verzoekregel 3983 – 4061 bytes
 *      200 id's   verzoekregel 7883 – 7961 bytes   ← ~230 bytes onder de 8192
 *
 *    Bij 200 is de marge dus ongeveer zes id's, niet "de helft van het budget"
 *    zoals hier eerst stond. Bij 100 is het op allebei de muren een factor twee.
 *    Gevonden in de security-review op QS8-368.
 *
 * ⚠️⚠️ **Wat hier níét gemeten is, en dat is precies de muur die telt.** Deze
 *    metingen zijn tegen de lokale PostgREST gedaan, met undici. 📏 Nagekeken
 *    welke fetch er in productie draait: `src/lib/supabase.ts` geeft
 *    `fetchMetTimeout` mee, en die roept de globále `fetch` aan — op web is dat
 *    de browser, op native react-native's XHR-implementatie. **Undici draait hier
 *    alleen in tests en scripts.** De grens van de browser, van Hermes en van
 *    de proxy vóór `<ref>.supabase.co` zijn geen van drieën gemeten; een poging
 *    daartoe liep vast op de uitgaande proxy van de bouwomgeving.
 *
 *    Daarom 100 en geen 200: het is niet de grens opzoeken maar er ruim onder
 *    blijven. Wie hem wíl verhogen, meet eerst op een echt toestel én tegen
 *    productie — de dossierrij van 08-09 in `docs/ENGINEER-REVIEW.md` zegt dat
 *    ook.
 */

/**
 * Hoeveel id's er hoogstens in één `.in()` op een GET gaan.
 *
 * ⚠️ Dit is een grens op het protocol en niet op het scherm. Een paginagrootte
 *    zegt hoeveel iemand wil zien; dit zegt hoeveel er in één verzoek pást. Ze
 *    horen niet dezelfde constante te zijn, om dezelfde reden als in de kop van
 *    `shared/api`: dan verandert het bijstellen van de een stilletjes de ander.
 */
export const IDS_PER_VERZOEK = 100;

/**
 * Hakt een lijst in brokken van hoogstens `grootte`.
 *
 * ⚠️ **Een lege lijst geeft nul brokken en niet één lege.** Dat scheelt de
 *    aanroeper een verzoek dat gegarandeerd niets oplevert. (Hier stond erbij
 *    dat PostgREST over `in.()` struikelt; dat is een bewering die ik niet
 *    gemeten heb en hij is eruit. De eerste reden staat op zichzelf.)
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
