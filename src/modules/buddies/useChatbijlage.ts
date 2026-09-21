import { useState } from 'react';

import { t } from '../../shared/i18n';

import { kiesDocument, kiesFoto, type Gekozenbijlage } from '../../shared/kiezers';

import { CHATDOC_MAX_BYTES, keurChatdoc } from './chatdoc';
import { keurChatfoto } from './chatfoto';

/**
 * Welke van de twee knoppen bezig is — QS8-444.
 *
 * ⚠️⚠️ **Afgeleid van `Gekozenbijlage` en niet zelf uitgeschreven.** Twee keer
 *    `'foto' | 'doc'` intypen is twee bronnen voor dezelfde opsomming, en die
 *    lopen uit elkaar zodra er ooit een derde soort bij komt. Dit is de klasse
 *    fout die dit project het vaakst geld kost; een afgeleid type kán niet
 *    driften.
 */
export type Bijlagesoort = Gekozenbijlage['soort'];

/**
 * De bijlagekeuze onder de invoerbalk van de groepschat — QS8-71 en QS8-72.
 *
 * ⚠️⚠️ **Eén bijlage tegelijk, en dat is geen vereenvoudiging maar de vorm van
 *    de tabel.** `chat_messages` heeft één `attachment_url` en één `type`, en de
 *    CHECK `chat_messages_attachment_eigen_pad` (migratie 0242) paart die twee.
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
 * ⚠️ Hij staat sinds 11-09-2026 in `modules/buddies/react.ts` (QS8-423), en
 *    daarvóór in `shared/ui` — "omdat de kiezers daar ook stonden". De meting
 *    eronder staat nog: `expo-image-picker` en `expo-document-picker` slepen
 *    react-native mee, en een module-barrel wordt geïmporteerd door tests die
 *    geen RN-omgeving hebben. Zie de kop van `kiesFoto.ts` voor het gemeten
 *    geval.
 *
 *    Wat veranderde is het antwoord op die meting. De kiezers staan nu in
 *    `shared/kiezers` — een kiezer rendert niets en is geen UI — en deze hook
 *    staat bij zijn domein, in `react.ts` en niet in `index.ts`. Die splitsing
 *    houdt de barrel platformvrij; dát is wat de RLS-tests overeind houdt.
 *    Uitleg in `docs/decisions/2026-09-11-een-kiezer-is-geen-ui.md`.
 */
export interface Chatbijlagekeuze {
  readonly bijlage: Gekozenbijlage | null;
  readonly fout: string | null;
  /**
   * ⚠️⚠️ **Wélke knop, en niet of er íets bezig is** — onwrikbare regel 16.
   *    Een enkele `boolean` zou bij een tik op "document" ook een spinner onder
   *    "foto" zetten, en dan wijst de laadstand de verkeerde knop aan. Zelfde
   *    vorm en zelfde reden als `bezigPad` in `useDocumentOpenen.ts`, die het
   *    daar over meerdere documenten in één gesprek heeft.
   *
   * ⚠️ **Hij dekt het systeemvenster mee en dat is geen slordigheid.** De
   *    kiezer staat tijdens `getDocumentAsync()` vóór het scherm, dus daar is
   *    de spinner onzichtbaar; het deel dat ertoe doet is wat er ná het
   *    dichtklappen gebeurt — het lezen van de bytes, dat tot dertig seconden
   *    mag duren (`LEES_TIMEOUT_MS` in `kiesDocument.ts`). Hem pas ná het
   *    venster zetten zou een tweede `setState` vragen voor een verschil dat
   *    niemand ziet.
   */
  readonly bezig: Bijlagesoort | null;
  readonly kiesEenFoto: () => Promise<void>;
  readonly kiesEenDocument: () => Promise<void>;
  readonly haalWeg: () => void;
  readonly wis: () => void;
}

/**
 * Zet de vlag, doe het werk, en geef hem hoe dan ook weer vrij — QS8-444.
 *
 * ⚠️⚠️ **De vorm doet het werk, niet de oplettendheid.** Beide keuzes hieronder
 *    hebben vier uitgangen (afgebroken, fout uit de kiezer, bezwaar uit de
 *    keuring, gelukt), en elk daarvan is een `return` midden in de functie. Wie
 *    de vrijgave met de hand achter elke `return` zet, vergeet er een — en die
 *    vergissing levert een knop op die nooit meer werkt, zonder melding en zonder
 *    spoor. Doordat die `return`s in het meegegeven werk zitten en niet hier,
 *    kúnnen ze de vrijgave niet overslaan.
 *
 * ⚠️ **En de `finally` dekt precies één geval erbij: een worp.** 📏 Bij de ijking
 *    van 13-09-2026 werd mutatie D — de `finally` eruit, `zet(null)` erachter —
 *    rood op één test, en dat was de worptest; de drie andere bleven groen omdat
 *    ze normaal eindigen. Dat is geen zwakke ijking maar de juiste meting: de
 *    `finally` is alleen op dát pad dragend, en de overige paden worden gedekt
 *    door de vorm hierboven.
 *
 * ⚠️ **Geëxporteerd omdat een grendel die je niet kunt voeden, niet te ijken
 *    is** — dezelfde reden als bij `teGroot()` in `kiesDocument.ts`. Deze
 *    repo heeft geen renderer in de testrunner, dus een `useState` binnen een
 *    hook is niet aan te roepen; zó is de eigenschap die ertoe doet wél los te
 *    toetsen, met een gewone functie als zetter.
 */
export async function bezetTijdens<T>(
  zet: (waarde: T | null) => void,
  waarde: T,
  werk: () => Promise<void>,
): Promise<void> {
  zet(waarde);
  try {
    await werk();
  } finally {
    zet(null);
  }
}

/**
 * Wat één keuzeronde oplevert — QS8-444.
 *
 * ⚠️⚠️ **Een uitkomst en geen zetters, en dat is meer dan een regeltelling.** Deze
 *    twee lezers moesten uit `useChatbijlage()` omdat de hook met de laadstand
 *    erbij over de vijftig regels ging (onwrikbare regel 15, en die splits je in
 *    plaats van zijn plafond op te hogen). De voor de hand liggende vorm was ze
 *    `setFout` en `setBijlage` mee te geven — maar dan hangen ze nog steeds aan
 *    React en zijn ze nog steeds niet los aan te roepen. Zo wél: ze kennen de
 *    stand niet, ze kennen alleen hun eigen antwoord.
 *
 * ⚠️ `niets` is afbreken en is met opzet stil: wie de kiezer wegklikt, wil geen
 *    melding. Dat is precies waaróm een mislukte lezing géén `niets` mag worden —
 *    zie de kop van `kiesDocument.ts`.
 */
type Leesuitkomst =
  | { readonly soort: 'niets' }
  | { readonly soort: 'fout'; readonly zin: string }
  | { readonly soort: 'gekozen'; readonly bijlage: Gekozenbijlage };

async function leesEenFoto(): Promise<Leesuitkomst> {
  const keuze = await kiesFoto('chatfoto.kiezen_mislukt');

  // Afbreken is geen fout: wie de kiezer wegklikt, wil geen melding.
  if (keuze.soort === 'afgebroken') return { soort: 'niets' };
  if (keuze.soort === 'fout') return { soort: 'fout', zin: t(keuze.sleutel) };

  // ⚠️ Keuren vóór het versturen, zodat de gebruiker de reden leest in plaats
  //    van een serverfout. De emmer blijft de grendel (onwrikbare regel 3).
  const bezwaar = keurChatfoto(keuze.data.byteLength, keuze.mime);
  if (bezwaar !== null) return { soort: 'fout', zin: bezwaar };

  return { soort: 'gekozen', bijlage: { soort: 'foto', data: keuze.data, mime: keuze.mime } };
}

async function leesEenDocument(): Promise<Leesuitkomst> {
  // ⚠️ **Dezelfde grens als `keurChatdoc()` hieronder, uit dezelfde constante.**
  //    De kiezer weigert ermee vóór hij de bytes leest (QS8-431); de keuring
  //    blijft erachter staan en is de grens die telt — zij ziet de échte
  //    `byteLength` en niet wat het platform over het bestand beweert.
  const keuze = await kiesDocument(CHATDOC_MAX_BYTES);

  if (keuze.soort === 'afgebroken') return { soort: 'niets' };
  if (keuze.soort === 'fout') return { soort: 'fout', zin: t(keuze.sleutel) };

  // ⚠️ Zelfde keuring als de server: type, omvang én bruikbare naam. Die derde
  //    is nieuw ten opzichte van de foto — een bestand dat alleen uit
  //    stuurtekens bestaat, houdt na `schoneBestandsnaam()` niets over, en de
  //    CHECK `chat_messages_attachment_name_vorm` (0242) weigert dat.
  const bezwaar = keurChatdoc(keuze.data.byteLength, keuze.mime, keuze.naam);
  if (bezwaar !== null) return { soort: 'fout', zin: bezwaar };

  return {
    soort: 'gekozen',
    bijlage: { soort: 'doc', data: keuze.data, mime: keuze.mime, naam: keuze.naam },
  };
}

export function useChatbijlage(): Chatbijlagekeuze {
  const [bijlage, setBijlage] = useState<Gekozenbijlage | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<Bijlagesoort | null>(null);

  async function kies(soort: Bijlagesoort, lees: () => Promise<Leesuitkomst>) {
    // ⚠️ Eén tegelijk. De knoppen zijn tijdens het lezen al uitgeschakeld
    //    (`busy` schakelt `Button` uit), dus dit is de tweede grendel en niet
    //    de enige — zelfde vorm als `useDocumentOpenen.ts`.
    if (bezig !== null) return;
    setFout(null);

    await bezetTijdens(setBezig, soort, async () => {
      const uitkomst = await lees();
      if (uitkomst.soort === 'fout') setFout(uitkomst.zin);
      if (uitkomst.soort === 'gekozen') setBijlage(uitkomst.bijlage);
    });
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

  return {
    bijlage,
    fout,
    bezig,
    kiesEenFoto: () => kies('foto', leesEenFoto),
    kiesEenDocument: () => kies('doc', leesEenDocument),
    haalWeg,
    wis,
  };
}
