import * as ImagePicker from 'expo-image-picker';

import { base64NaarBytes } from '../auth';

/**
 * Een foto kiezen voor de groepschat — QS8-71.
 *
 * ⚠️ **Losgetrokken van het scherm, en niet alleen om onder de vijftig regels te
 *    blijven.** Dit stuk kent vier uitgangen — geen toestemming, afgebroken,
 *    geen bruikbare data, en gelukt — en dat is de enige vorm waarin ze los te
 *    toetsen zijn. Zelfde reden en zelfde vorm als `kiesAfbeelding()` in
 *    `src/modules/auth/useAvatarKeuze.ts`.
 *
 * ⚠️ De foutsleutels staan in het type en niet als losse strings: een sleutel
 *    die niet in de catalogus bestaat, is dan een typefout en geen lege melding.
 */
export type Chatfotokeuze =
  | { readonly soort: 'afgebroken' }
  | { readonly soort: 'fout'; readonly sleutel: 'chatfoto.kiezen_mislukt' }
  | { readonly soort: 'gekozen'; readonly data: Uint8Array; readonly mime: string };

/**
 * ⚠️ **Geen `aspect` en geen vierkante uitsnede**, anders dan bij de avatar. Een
 *    avatar ís rond; een foto in een gesprek is wat iemand liet zien, en die
 *    bijsnijden verandert wat hij bedoelde.
 *
 * ⚠️ `quality` staat laag omdat de bucket op 1 MB dicht zit (migratie 0221). Dat
 *    is een gemak en geen grendel — de keuring in `keurChatfoto()` en de bucket
 *    zelf zijn dat wél.
 */
export async function kiesChatfoto(): Promise<Chatfotokeuze> {
  const toestemming = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!toestemming.granted) return { soort: 'fout', sleutel: 'chatfoto.kiezen_mislukt' };

  const keuze = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
  });

  const gekozen = keuze.canceled ? null : (keuze.assets[0] ?? null);
  if (gekozen === null) return { soort: 'afgebroken' };

  const base64 = gekozen.base64 ?? null;
  const bytes = base64 === null ? null : base64NaarBytes(base64);
  if (bytes === null) return { soort: 'fout', sleutel: 'chatfoto.kiezen_mislukt' };

  return { soort: 'gekozen', data: bytes, mime: gekozen.mimeType ?? 'image/jpeg' };
}
