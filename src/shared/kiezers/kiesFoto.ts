import * as ImagePicker from 'expo-image-picker';

import { base64NaarBytes, ontdoeVanMetadata } from '../afbeelding';

/**
 * Een foto kiezen — QS8-71 (groepschat) en QS8-391 (bewijs bij een voltooiing).
 *
 * ⚠️ **Losgetrokken van het scherm, en niet alleen om onder de vijftig regels te
 *    blijven.** Dit stuk kent vier uitgangen — geen toestemming, afgebroken,
 *    geen bruikbare data, en gelukt — en dat is de enige vorm waarin ze los te
 *    toetsen zijn. Zelfde reden en zelfde vorm als `kiesAfbeelding()` in
 *    `src/modules/auth/useAvatarKeuze.ts`.
 *
 * ⚠️⚠️ **Hij staat in `shared/kiezers` sinds 11-09-2026** (QS8-423). Hij stond
 *    in `shared/ui`, en de meting hieronder is de reden dat hij niet in
 *    `modules/buddies` kán staan — maar `shared/ui` was het verkeerde antwoord
 *    op een juiste meting: een kiezer rendert niets, draagt geen label en kent
 *    geen toon. De alinea hieronder zegt dat zelf al met zoveel woorden.
 *
 * ⚠️ **De oorspronkelijke meting, en hij staat nog.** `expo-image-picker` sleept react-native mee, en de
 *    barrel van een module wordt door tests geïmporteerd die geen RN-omgeving
 *    hebben. 📏 Met dit bestand in `modules/buddies/index.ts` viel
 *    `tests/rls/doorloop.test.ts` om op `ReferenceError: __DEV__ is not
 *    defined` — die test importeert `modules/buddies` uit de barrel, en
 *    schrijft bij `modules/auth` al met zoveel woorden op dat hij dáár het
 *    bronbestand pakt om precies deze reden. Een fotokiezer is bovendien geen
 *    module-communicatie maar een platformvermogen; hij hoort in de laag die
 *    het platform al kent.
 *
 * ⚠️ De foutsleutels staan in het type en niet als losse strings: een sleutel
 *    die niet in de catalogus bestaat, is dan een typefout en geen lege melding.
 *    Vandaar een **unie** en geen `string`: bij QS8-391 kwam er een tweede
 *    aanroeper bij, en dan is "welke sleutels mogen hier staan" precies de vraag
 *    die het type hoort te beantwoorden.
 */
export type Fotofoutsleutel = 'chatfoto.kiezen_mislukt' | 'bewijsfoto.kiezen_mislukt';

export type Fotokeuze =
  | { readonly soort: 'afgebroken' }
  | { readonly soort: 'fout'; readonly sleutel: Fotofoutsleutel }
  | { readonly soort: 'gekozen'; readonly data: Uint8Array; readonly mime: string };

/**
 * ⚠️ **Geen `aspect` en geen vierkante uitsnede**, anders dan bij de avatar. Een
 *    avatar ís rond; een foto in een gesprek is wat iemand liet zien, en die
 *    bijsnijden verandert wat hij bedoelde.
 *
 * ⚠️ `quality` staat laag omdat beide buckets op 1 MB dicht zitten (migratie
 *    0222 en 0227). Dat is een gemak en geen grendel — de keuring in
 *    `keurChatfoto()` / `keurBewijsfoto()` en de buckets zelf zijn dat wél.
 *
 * ⚠️ **De foutsleutel komt van de aanroeper**, want de melding hoort bij het
 *    scherm waar je staat en niet bij de kiezer. Alleen de sleutel verschilt;
 *    de vier uitgangen zijn identiek, en die zijn de reden dat dit een eigen
 *    bestand is.
 *
 * ⚠️⚠️ **`ontdoeVanMetadata()` staat hier en niet in `uploadChatfoto()`, en dat
 *    is een keuze.** De bytes die deze functie teruggeeft, gaan naar het scherm
 *    (voor de voorvertoning) én naar de upload. Knippen we pas bij het uploaden,
 *    dan bestaat er een moment waarop de app een afbeelding mét coördinaten in
 *    handen heeft en doorgeeft. Hier is de enige plek waar de bytes de app
 *    binnenkomen, en dus de enige plek waar "ze zijn nooit ongeknipt geweest"
 *    een ware zin is.
 *
 * ⚠️⚠️ **En daarom geldt de knip sinds deze samenvoeging voor béide emmers en
 *    niet alleen voor de chat.** Een bewijsfoto gaat naar de groepsgenoten die
 *    hem beoordelen; die draagt dezelfde coördinaten en hetzelfde tijdstip. Dat
 *    de kiezer één functie is, is precies waarom de tweede aanroeper dit gratis
 *    meekreeg — en het is de reden om de knip hier te houden en niet per upload
 *    te herhalen.
 *
 * ⚠️ **Mislukt het knippen, dan is er geen foto.** Niet een foto zonder
 *    voorvertoning, niet een foto die het toch probeert: de faalstand valt dicht
 *    (QS8-395).
 */
export async function kiesFoto(sleutel: Fotofoutsleutel): Promise<Fotokeuze> {
  const toestemming = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!toestemming.granted) return { soort: 'fout', sleutel };

  const keuze = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
  });

  const gekozen = keuze.canceled ? null : (keuze.assets[0] ?? null);
  if (gekozen === null) return { soort: 'afgebroken' };

  const base64 = gekozen.base64 ?? null;
  const bytes = base64 === null ? null : base64NaarBytes(base64);
  if (bytes === null) return { soort: 'fout', sleutel };

  const mime = gekozen.mimeType ?? 'image/jpeg';
  const schoon = ontdoeVanMetadata(bytes, mime);
  if (!schoon.ok) return { soort: 'fout', sleutel };

  return { soort: 'gekozen', data: schoon.data, mime };
}
