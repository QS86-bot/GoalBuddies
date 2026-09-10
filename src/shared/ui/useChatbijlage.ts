import { useState } from 'react';

import { t } from '../i18n';

import { keurChatdoc, keurChatfoto } from '../../modules/buddies';

import { kiesDocument } from './kiesDocument';
import { kiesFoto } from './kiesFoto';
import type { Gekozenbijlage } from './verzendbijlage';

/**
 * De bijlagekeuze onder de invoerbalk van de groepschat — QS8-71 en QS8-72.
 *
 * ⚠️⚠️ **Eén bijlage tegelijk, en dat is geen vereenvoudiging maar de vorm van
 *    de tabel.** `chat_messages` heeft één `attachment_url` en één `type`, en de
 *    CHECK `chat_messages_attachment_eigen_pad` (migratie 0236) paart die twee.
 *    Twee losse velden hierboven zouden een stand toelaten die de database niet
 *    kan opslaan, en dan komt de weigering pas ná het uploaden — met een
 *    verweesd bestand in de emmer.
 *
 * ⚠️⚠️ **Kiezen betekent vervángen, niet toevoegen.** Wie een foto koos en dan
 *    een document kiest, houdt het document over. Zonder dat is de enige manier
 *    om van soort te wisselen "eerst weghalen", en dat is een stap die niemand
 *    raadt.
 *
 * ⚠️ **Losgetrokken van het scherm**, zelfde reden als `useBewijsfotokeuze.ts`:
 *    `app/` staat onder de ratel van `npm run regel15:controle`, en belangrijker
 *    — de keuze heeft per soort drie uitgangen (afgebroken, mislukt, gekozen) en
 *    dat is de enige vorm waarin ze los te toetsen zijn.
 *
 * ⚠️ Hij staat in `shared/ui` omdat de kiezers dat ook doen: `expo-image-picker`
 *    en `expo-document-picker` slepen react-native mee, en een module-barrel
 *    wordt geïmporteerd door tests die geen RN-omgeving hebben. Zie de kop van
 *    `kiesFoto.ts` voor het gemeten geval.
 */
export interface Chatbijlagekeuze {
  readonly bijlage: Gekozenbijlage | null;
  readonly fout: string | null;
  readonly kiesEenFoto: () => Promise<void>;
  readonly kiesEenDocument: () => Promise<void>;
  readonly haalWeg: () => void;
  readonly wis: () => void;
}

export function useChatbijlage(): Chatbijlagekeuze {
  const [bijlage, setBijlage] = useState<Gekozenbijlage | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function kiesEenFoto() {
    setFout(null);
    const keuze = await kiesFoto('chatfoto.kiezen_mislukt');

    // Afbreken is geen fout: wie de kiezer wegklikt, wil geen melding.
    if (keuze.soort === 'afgebroken') return;
    if (keuze.soort === 'fout') {
      setFout(t(keuze.sleutel));
      return;
    }

    // ⚠️ Keuren vóór het versturen, zodat de gebruiker de reden leest in plaats
    //    van een serverfout. De emmer blijft de grendel (onwrikbare regel 3).
    const bezwaar = keurChatfoto(keuze.data.byteLength, keuze.mime);
    if (bezwaar !== null) {
      setFout(bezwaar);
      return;
    }

    setBijlage({ soort: 'foto', data: keuze.data, mime: keuze.mime });
  }

  async function kiesEenDocument() {
    setFout(null);
    const keuze = await kiesDocument();

    if (keuze.soort === 'afgebroken') return;
    if (keuze.soort === 'fout') {
      setFout(t(keuze.sleutel));
      return;
    }

    // ⚠️ Zelfde keuring als de server: type, omvang én bruikbare naam. Die derde
    //    is nieuw ten opzichte van de foto — een bestand dat alleen uit
    //    stuurtekens bestaat, houdt na `schoneBestandsnaam()` niets over, en de
    //    CHECK `chat_messages_attachment_name_vorm` (0236) weigert dat.
    const bezwaar = keurChatdoc(keuze.data.byteLength, keuze.mime, keuze.naam);
    if (bezwaar !== null) {
      setFout(bezwaar);
      return;
    }

    setBijlage({ soort: 'doc', data: keuze.data, mime: keuze.mime, naam: keuze.naam });
  }

  function haalWeg() {
    setBijlage(null);
    setFout(null);
  }

  /** Na een geslaagde verzending: de balk gaat leeg verder. */
  function wis() {
    setBijlage(null);
    setFout(null);
  }

  return { bijlage, fout, kiesEenFoto, kiesEenDocument, haalWeg, wis };
}
