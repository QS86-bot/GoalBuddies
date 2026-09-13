import * as DocumentPicker from 'expo-document-picker';

/**
 * Een document kiezen voor de groepschat — QS8-72.
 *
 * ⚠️⚠️ **Hij staat sinds 11-09-2026 in `shared/kiezers`** (QS8-423), en
 *    daarvóór in `shared/ui`. **De meting die hem uit `modules/buddies` hield
 *    staat nog:** `expo-document-picker` sleept react-native mee, en de barrel
 *    van een module wordt geïmporteerd door tests die geen RN-omgeving hebben.
 *    📏 Bij QS8-71 viel `tests/rls/doorloop.test.ts` precies zo om op
 *    `ReferenceError: __DEV__ is not defined`, met `kiesChatfoto` in
 *    `modules/buddies/index.ts`.
 *
 *    `shared/ui` was alleen het verkeerde antwoord op die juiste meting: een
 *    kiezer rendert niets, draagt geen label en kent geen toon. Zelfde beweging
 *    en zelfde reden als `kiesFoto.ts`; uitleg in
 *    `docs/decisions/2026-09-11-een-kiezer-is-geen-ui.md`.
 *
 * ⚠️ Vier uitgangen — geen toestemming/fout, afgebroken, onbruikbare data, en
 *    gelukt — en dat is de enige vorm waarin ze los te toetsen zijn. Zelfde
 *    reden en zelfde vorm als `kiesFoto.ts`.
 *
 * ⚠️ **De MIME uit de kiezer wordt niet vertrouwd.** Hij gaat mee naar
 *    `keurChatdoc()`, die hem tegen `CHATDOC_TYPES` legt, en `uploadChatdoc()`
 *    declareert bij het uploaden hoe dan ook `application/pdf`. Wat de bucket
 *    bewaart is wat hij terugserveert, en dát is de waarde die bepaalt of een
 *    browser het bestand ooit als HTML behandelt.
 */
/**
 * ⚠️ Een unie en geen `string`, zelfde reden als bij `kiesFoto.ts`: een sleutel
 *    die niet in de catalogus bestaat, is dan een typefout en geen lege melding.
 *
 * ⚠️⚠️ **`chatdoc.te_groot` staat er sinds QS8-431 bij, en dat is met opzet
 *    dezelfde sleutel die `keurChatdoc()` al gaf.** Niet een tweede melding voor
 *    dezelfde zaak: welke van de twee poorten het bestand tegenhoudt, de
 *    gebruiker leest dezelfde zin. Daardoor hoefde de aanroeper geen enkele tak
 *    erbij te krijgen — `setFout(t(keuze.sleutel))` stond er al.
 */
export type Documentfoutsleutel = 'chatdoc.kiezen_mislukt' | 'chatdoc.te_groot';

export type Documentkeuze =
  | { readonly soort: 'afgebroken' }
  | { readonly soort: 'fout'; readonly sleutel: Documentfoutsleutel }
  | {
      readonly soort: 'gekozen';
      readonly data: Uint8Array;
      readonly mime: string;
      readonly naam: string;
    };

/**
 * @param maxBytes De grens waarboven het bestand niet eens gelezen wordt.
 *
 * ⚠️⚠️ **Een parameter en geen constante, en dat is de laag en niet de smaak.**
 *    `CHATDOC_MAX_BYTES` woont in `modules/buddies/chatdoc.ts`, en
 *    `shared/kiezers` mag `modules/**` niet importeren — dat is sinds QS8-423
 *    een lintregel (`import/no-restricted-paths`) en geen gewoonte. Een eigen
 *    constante hier zou een tweede bron voor dezelfde grens zijn, en die twee
 *    lopen uit elkaar. Zelfde vorm als de foutsleutel van `kiesFoto()`: wat het
 *    domein weet, komt van de aanroeper.
 *
 * ⚠️⚠️ **Eén gemeten gedragsverschil, en het staat hier omdat een afwijking die
 *    je vergeet op te schrijven duurder is dan een die opvalt.** `keurChatdoc()`
 *    toetst type vóór omvang; deze poort toetst alleen omvang en staat ervóór.
 *    Een bestand dat én te groot is én een verkeerd type heeft, meldde daardoor
 *    tot QS8-431 `chatdoc.type_niet_toegestaan` en meldt nu `chatdoc.te_groot`.
 *    Allebei waar; de tweede kost geen 500 MB om vast te stellen.
 *
 *    **Bewust niet opgelost door de typetoets hier te herhalen.** Dan staat
 *    dezelfde regel op twee plekken, en dát is de naad die dit project keer op
 *    keer geld kost — erger dan een andere melding in een randgeval dat de
 *    `type`-filter van de kiezer toch al zeldzaam maakt.
 *
 * ⚠️ De naad staat onder test in
 *    `tests/beloftes/een-te-groot-document-wordt-niet-gelezen.test.ts`: die telt
 *    hoe vaak er gelezen is, want een poort die ná de kosten staat is geen
 *    poort. Afweging in
 *    `docs/decisions/2026-09-12-een-poort-die-na-de-kosten-staat-is-geen-poort.md`.
 */
export async function kiesDocument(maxBytes: number): Promise<Documentkeuze> {
  const keuze = await DocumentPicker.getDocumentAsync({
    // ⚠️ Een filter en geen grendel: op sommige platformen is hij te omzeilen.
    //    De grendels zijn `allowed_mime_types` op de bucket (0240), de
    //    pad-CHECK (0242) en `keurChatdoc()`.
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });

  const gekozen = keuze.canceled ? null : (keuze.assets[0] ?? null);
  if (gekozen === null) return { soort: 'afgebroken' };

  // ⚠️ De poort die dit issue oplevert: weigeren vóór `leesBestand()`, want die
  //    trekt het hele bestand in JS-geheugen. Een gekozen bestand van 500 MB
  //    werd eerst volledig geladen om daarna "te groot" te zeggen — op een
  //    telefoon het verschil tussen een melding en een gedode app.
  if (teGroot(gekozen.size, maxBytes)) return { soort: 'fout', sleutel: 'chatdoc.te_groot' };

  const bytes = await leesBestand(gekozen.uri);
  if (bytes === null) return { soort: 'fout', sleutel: 'chatdoc.kiezen_mislukt' };

  return {
    soort: 'gekozen',
    data: bytes,
    mime: gekozen.mimeType ?? 'application/pdf',
    // ⚠️ De rúwe naam. `schoneBestandsnaam()` in de datalaag haalt de
    //    bidi-tekens eruit en kapt op codepunten — dat hoort daar en niet hier,
    //    zodat er één plek is waar die vorm bepaald wordt.
    naam: gekozen.name,
  };
}

/**
 * Of dit bestand te groot is om te lezen — QS8-431.
 *
 * ⚠️⚠️ **`size` is optioneel bij `expo-document-picker`** (`size?: number`,
 *    nagemeten in `node_modules/expo-document-picker/build/types.d.ts`).
 *    Ontbreekt hij, dan is het antwoord `false` en blijft de oude weg volledig
 *    over: lezen en daarna `keurChatdoc()`. **Dit is een extra poort en geen
 *    vervanging** — die keuring is en blijft de grens die telt, want zij ziet de
 *    échte `byteLength` en niet wat het platform beweert.
 *
 * ⚠️ **Strikt groter dan, net als `keurChatdoc()`.** Een bestand van precies
 *    `maxBytes` mag door. Zouden de twee poorten hier verschillen, dan is er een
 *    bestand dat de ene weigert en de andere doorlaat — en dat is precies het
 *    soort naad waar regel 18 over gaat.
 *
 * ⚠️ Geëxporteerd omdat een controle die je niet kunt voeden, niet te ijken is.
 */
export function teGroot(size: number | undefined, maxBytes: number): boolean {
  return size !== undefined && size > maxBytes;
}

/**
 * De tijdgrens op het lezen — QS8-444.
 *
 * ⚠️⚠️ **Dertig seconden, en de keuze is niet „ruim genoeg” maar afgewogen.**
 *
 *    - **Waarom er überhaupt een grens is.** Een `file:`- of `content:`-URI hoeft
 *      geen bestand op schijf te zijn: een iCloud-placeholder of een Drive-map via
 *      SAF laat de lees**actie** de bytes eerst binnenhalen. Zonder grens wacht de
 *      belofte dan oneindig — en een belofte die stilvalt is erger dan een die
 *      dichtslaat, want er komt nooit een melding.
 *    - **Waarom niet de vijftien van `src/lib/supabase.ts`.** Dat is een verzoek aan
 *      een server die óf antwoordt óf niet. Dit is een leeséénheid die er een
 *      download achter kan hebben zitten: 5 MiB (`CHATDOC_MAX_BYTES`) haalt op een
 *      middelmatige mobiele verbinding — zo'n 2 Mbit/s — de twintig seconden. Met
 *      vijftien breekt de app een keuze af die gewoon onderweg was.
 *    - **Waarom niet meer.** `FUNCTIE_TIMEOUT_MS` is 35 seconden en dekt een
 *      AI-call die gemeten twintig nodig heeft. Een bijlage kiezen hoort niet de
 *      langste wachttijd in de app te zijn.
 *
 * ⚠️⚠️ **En deze waarde is alleen verdedigbaar omdat er een laadstand bij hoort.**
 *    Dertig seconden mét een bezette knop is wachten; dertig seconden zonder is een
 *    dode knop. Die twee helften komen uit hetzelfde issue en horen bij elkaar —
 *    haalt iemand `bezig` uit `useChatbijlage()` weg, dan is dit getal te hoog
 *    geworden. Afweging in
 *    `docs/decisions/2026-09-13-een-belofte-die-stilvalt-is-erger-dan-een-die-dichtslaat.md`.
 *
 * ⚠️ **De omvangspoort van QS8-431 vervangt deze grens niet.** Die leunt op
 *    `size`, en die is optioneel: ontbreekt hij, dan is dit het enige dat het lezen
 *    nog beëindigt.
 */
const LEES_TIMEOUT_MS = 30_000;

/**
 * Leest het gekozen bestand als bytes.
 *
 * ⚠️ Via `fetch` op de lokale `file:`-URI, want anders dan `expo-image-picker`
 *    geeft de documentkiezer geen base64 terug. Faalt hij, dan is dat een
 *    onbruikbare keuze en geen storing die de gebruiker kan verhelpen.
 *
 * ⚠️⚠️ **De afbreking krijgt met opzet géén eigen foutsleutel.** `AbortSignal.timeout()`
 *    laat `fetch` afwijzen met een `TimeoutError`, die valt in de `catch` hieronder
 *    en wordt `null` — wat de aanroeper al vertaalde naar `chatdoc.kiezen_mislukt`.
 *    Dat is criterium 3 van QS8-431 en het geldt onverkort: welke van de redenen het
 *    lezen ook deed mislukken, de gebruiker leest één zin. Een tweede melding voor
 *    dezelfde zaak is wat dat criterium verbiedt.
 */
async function leesBestand(uri: string): Promise<Uint8Array | null> {
  try {
    const antwoord = await fetch(uri, { signal: AbortSignal.timeout(LEES_TIMEOUT_MS) });
    const buffer = await antwoord.arrayBuffer();
    return buffer.byteLength === 0 ? null : new Uint8Array(buffer);
  } catch {
    // ⚠️ Geen lege catch: de uitkomst `null` ís de afhandeling, en de aanroeper
    //    vertaalt hem naar `chatdoc.kiezen_mislukt`.
    return null;
  }
}
