import * as DocumentPicker from 'expo-document-picker';

/**
 * Een document kiezen voor de groepschat — QS8-72.
 *
 * ⚠️⚠️ **Hij staat in `shared/ui` en niet in `modules/buddies`, en dat is een
 *    gemeten reparatie en geen plaatsingsvoorkeur.** `expo-document-picker`
 *    sleept react-native mee, en de barrel van een module wordt geïmporteerd
 *    door tests die geen RN-omgeving hebben. 📏 Bij QS8-71 viel
 *    `tests/rls/doorloop.test.ts` precies zo om op `ReferenceError: __DEV__ is
 *    not defined`, met `kiesChatfoto` in `modules/buddies/index.ts`. Zelfde val,
 *    zelfde plaatsing.
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
export type Documentkeuze =
  | { readonly soort: 'afgebroken' }
  | { readonly soort: 'fout'; readonly sleutel: 'chatdoc.kiezen_mislukt' }
  | {
      readonly soort: 'gekozen';
      readonly data: Uint8Array;
      readonly mime: string;
      readonly naam: string;
    };

export async function kiesDocument(): Promise<Documentkeuze> {
  const keuze = await DocumentPicker.getDocumentAsync({
    // ⚠️ Een filter en geen grendel: op sommige platformen is hij te omzeilen.
    //    De grendels zijn `allowed_mime_types` op de bucket (0234), de
    //    pad-CHECK (0236) en `keurChatdoc()`.
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });

  const gekozen = keuze.canceled ? null : (keuze.assets[0] ?? null);
  if (gekozen === null) return { soort: 'afgebroken' };

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
 * Leest het gekozen bestand als bytes.
 *
 * ⚠️ Via `fetch` op de lokale `file:`-URI, want anders dan `expo-image-picker`
 *    geeft de documentkiezer geen base64 terug. Faalt hij, dan is dat een
 *    onbruikbare keuze en geen storing die de gebruiker kan verhelpen.
 */
async function leesBestand(uri: string): Promise<Uint8Array | null> {
  try {
    const antwoord = await fetch(uri);
    const buffer = await antwoord.arrayBuffer();
    return buffer.byteLength === 0 ? null : new Uint8Array(buffer);
  } catch {
    // ⚠️ Geen lege catch: de uitkomst `null` ís de afhandeling, en de aanroeper
    //    vertaalt hem naar `chatdoc.kiezen_mislukt`.
    return null;
  }
}
