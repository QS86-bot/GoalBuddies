import * as Linking from 'expo-linking';
import { useState } from 'react';

import { reportError } from '../../lib/observability';
import { tekenChatdoc } from './chatdoc';

/**
 * Een document uit de groepschat openen — QS8-72.
 *
 * ⚠️⚠️ **Tekenen en dán openen, in die volgorde, en dat is de hele reden dat
 *    deze hook bestaat.** `attachment_url` is bij een `doc`-bericht een **kaal
 *    opslagpad** — er is met opzet geen `metGetekendeChatdocs()`, want een
 *    document rendert niets tot iemand tikt en per pagina tekenen zou dertig
 *    bearer tokens uitgeven voor bestanden die niemand opent (zie
 *    `tekenChatdoc()`). Dat maakt de app op precies één plek verantwoordelijk
 *    voor het verschil tussen een pad en een URL, en dat is hier.
 *
 * ⚠️⚠️ **Hij staat sinds 11-09-2026 in `modules/buddies/react.ts`** (QS8-423),
 *    en daarvóór in `shared/ui`. **De meting die hem daar hield staat nog, en
 *    het is `react.ts` en niet `index.ts` die haar beantwoordt:** `expo-linking`
 *    sleept react-native mee, en de barrel van een module wordt geïmporteerd
 *    door tests die geen RN-omgeving hebben. 📏 Bij QS8-71 viel
 *    `tests/rls/doorloop.test.ts` precies zo om op `ReferenceError: __DEV__ is
 *    not defined`. `index.ts` blijft daarom platformvrij; `react.ts` is het
 *    tweede toegangspunt waar `expo-*` wél mag, en de barrel re-exporteert hem
 *    niet.
 *
 *    Wat er niet meer geldt is de tweede reden. `eslint.config.js` verbiedt de
 *    datalaag nog steeds élke import uit `shared/ui` (QS8-207), maar dit bestand
 *    importeert daar niets uit — en de kiezers staan er sinds QS8-423 zelf niet
 *    meer. Zelfde beweging als `kiesFoto.ts` en `useBewijsfotokeuze.ts`, elk
 *    naar hun eigen laag. Uitleg in
 *    `docs/decisions/2026-09-11-een-kiezer-is-geen-ui.md`.
 *
 * ⚠️ **De stand hangt aan het pad en niet aan de hook.** Eén gesprek toont
 *    meerdere documenten; een enkele `bezig`-vlag zou bij een tik op het ene
 *    document een spinner onder het andere zetten. `bezigPad` en `foutPad`
 *    zeggen dus *welk* document het betreft, en de rij vergelijkt zelf.
 *
 * ⚠️ De foutmelding zelf komt van de aanroeper (`t('chatdoc.openen_mislukt')`),
 *    zodat deze hook geen tekst kent. Wat hij teruggeeft is het pad waar het
 *    misging.
 */
export interface Documentopener {
  readonly openen: (pad: string) => Promise<void>;
  readonly bezigPad: string | null;
  readonly foutPad: string | null;
}

export function useDocumentOpenen(): Documentopener {
  const [bezigPad, setBezigPad] = useState<string | null>(null);
  const [foutPad, setFoutPad] = useState<string | null>(null);

  async function openen(pad: string) {
    // ⚠️ Twee keer tikken tijdens het tekenen geeft twee handtekeningen en twee
    //    tabbladen. Eén tegelijk.
    if (bezigPad !== null) return;

    setBezigPad(pad);
    setFoutPad(null);

    const url = await tekenChatdoc(pad);

    if (url === null) {
      setBezigPad(null);
      setFoutPad(pad);
      return;
    }

    try {
      await Linking.openURL(url);
      setFoutPad(null);
    } catch (fout: unknown) {
      // ⚠️ Geen lege catch. Openen kan weigeren zonder dat er iets stuk is — een
      //    toestel zonder pdf-lezer, of een browser die het venster blokkeert —
      //    en dan is de melding het antwoord en niet een foutscherm.
      reportError(fout, 'chatdoc.openen');
      setFoutPad(pad);
    } finally {
      setBezigPad(null);
    }
  }

  return { openen, bezigPad, foutPad };
}
