import { useState } from 'react';

import { t } from '../i18n';

import { kiesFoto } from './kiesFoto';

/**
 * De fotokeuze bij het afronden van een weekdoel — QS8-391.
 *
 * ⚠️ **Losgetrokken van het scherm, en niet alleen om onder de vijftig regels te
 *    blijven.** `app/` staat onder de ratel van `npm run regel15:controle`: het
 *    aantal functies boven de vijftig mag daar alleen dalen. Deze keuze in
 *    `afronden()` proppen zou dat aantal omhoog duwen, en dan is de ratel een
 *    plafond waar je onder blijft zitten in plaats van een rem.
 *
 *    Belangrijker: de keuze heeft drie uitgangen — afgebroken, mislukt, gekozen
 *    — en dat is de enige vorm waarin ze los te toetsen zijn. Zelfde reden en
 *    zelfde vorm als `useAvatarKeuze.ts`.
 *
 * ⚠️⚠️ **Hij staat in `shared/ui` en niet in `modules/completions`, en dat is
 *    geen plaatsingsvoorkeur maar een laagregel.** `eslint.config.js` verbiedt
 *    de datalaag élke import uit `shared/ui`, ook een type (QS8-207), en deze
 *    hook leunt op `kiesFoto()`. Hij hóórt daar ook: dit is schermtoestand — een
 *    gekozen bestand en een melding — en geen module-communicatie. De datalaag
 *    krijgt straks alleen de bytes.
 */
export interface Bewijsfotokeuze {
  readonly foto: { readonly data: Uint8Array; readonly mime: string } | null;
  readonly fout: string | null;
  readonly kies: () => Promise<void>;
  readonly haalWeg: () => void;
  readonly wis: () => void;
}

export function useBewijsfotokeuze(): Bewijsfotokeuze {
  const [foto, setFoto] = useState<{ data: Uint8Array; mime: string } | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function kies() {
    setFout(null);
    const keuze = await kiesFoto('bewijsfoto.kiezen_mislukt');

    // Afbreken is geen fout: wie de kiezer wegklikt, wil geen melding.
    if (keuze.soort === 'afgebroken') return;
    if (keuze.soort === 'fout') {
      setFout(t(keuze.sleutel));
      return;
    }

    setFoto({ data: keuze.data, mime: keuze.mime });
  }

  function haalWeg() {
    setFoto(null);
    setFout(null);
  }

  /** Na een geslaagde afronding: het formulier gaat dicht en leeg weer open. */
  function wis() {
    setFoto(null);
    setFout(null);
  }

  return { foto, fout, kies, haalWeg, wis };
}
