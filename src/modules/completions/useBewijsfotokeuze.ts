import { useState } from 'react';

import { t } from '../../shared/i18n';

import { kiesFoto } from '../../shared/kiezers/kiesFoto';

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
 * ⚠️⚠️ **Hij staat sinds 11-09-2026 in `modules/completions`** (QS8-423), en
 *    daarvóór in `shared/ui`. De oude reden was een laagregel en klopte: de
 *    datalaag mag níets uit `shared/ui` importeren, ook geen type (QS8-207), en
 *    deze hook leunt op `kiesFoto()` — die stond toen in `shared/ui`.
 *
 *    Wat er mis was, is de plek van `kiesFoto()` en niet die van deze hook. Een
 *    kiezer rendert niets, draagt geen label en kent geen toon; hij is een
 *    platformvermogen en staat nu in `shared/kiezers`. Daarmee valt de klem weg
 *    en mag deze hook wonen waar hij hoort: bij zijn domein.
 *
 *    ⚠️ Dit blijft schermtoestand — een gekozen bestand en een melding — en
 *    geen module-communicatie. Hij hoort dáárom in `react.ts` en niet in
 *    `index.ts`: de barrel blijft vrij van `expo-*`, want daar leunen de
 *    RLS-tests op. De datalaag krijgt alleen de bytes.
 *
 *    Uitleg in `docs/decisions/2026-09-11-een-kiezer-is-geen-ui.md`.
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
