import { uitnodigingsLink } from './schemas';

import type { DoelGroep } from './deling';

/**
 * De twee beslissingen achter de uitnodigingsstap — QS8-229.
 *
 * ⚠️ **Waarom dit geen paar regels in het scherm zijn.** Er is in dit project
 *    geen renderer, dus alles wat in een component staat is alleen te toetsen
 *    door in de broncode naar een letterlijke regel te grijpen — en dat is
 *    precies de testvorm die onwrikbare regel 18 vraag 4 afwijst. Als functie is
 *    de vraag beantwoordbaar: kan deze test groen blijven terwijl de belofte
 *    breekt? Zelfde reden als bij `deling.ts`.
 */

/**
 * De link die je van deze groep kunt delen, of `null` als die er niet is.
 *
 * ⚠️⚠️ **`invite_code` kan ontbreken terwijl het type zegt van niet.**
 *    `fetchMijnGroepen()` selecteert negen kolommen en cast met
 *    `as unknown as Groep[]` naar de volledige rij — `invite_code` staat dus wél
 *    in het type en níét in de gegevens. TypeScript zwijgt, en
 *    `normaliseerCode(undefined)` doet `invoer.trim()` en gooit: een wit scherm,
 *    op precies de handeling die dit issue belooft te leveren. Haal de code
 *    daarom met `fetchGroep()` op, en laat deze functie de rest afvangen.
 *
 * ⚠️ **Een ingetrokken uitnodiging geeft óók `null`.** `invite_revoked` bestaat
 *    sinds migratie 0019 en een link die gegarandeerd niet werkt, is erger dan
 *    geen link: die stuurt de gebruiker naar iemand tóé. Het verschil tussen
 *    "geen code" en "ingetrokken" is een zaak van het scherm, niet van deze
 *    functie — allebei betekenen ze hier: niets te delen.
 *
 * ⚠️ **Nooit een lege string.** Dan is "geen link" niet te onderscheiden van
 *    "link", en dat is exact het onderscheid waar de aanroeper op stuurt.
 */
export function deelbareUitnodiging(
  // ⚠️ `| undefined` staat er met zoveel woorden bij, en dat is geen ruis onder
  //    `exactOptionalPropertyTypes`. Het geval dat deze functie bestaat om af te
  //    vangen ís een aanwezige sleutel met `undefined` erin — een groep uit
  //    `fetchMijnGroepen()`. Een type dat die vorm weigert, weigert precies het
  //    geval waarvoor hij geschreven is.
  groep: {
    readonly invite_code?: string | null | undefined;
    readonly invite_revoked?: boolean | null | undefined;
  },
  appUrl: string,
): string | null {
  if (groep.invite_revoked === true) return null;

  const code = groep.invite_code;
  if (typeof code !== 'string' || code.trim() === '') return null;

  return uitnodigingsLink(appUrl, code);
}

/** In welke stand het uitnodigingsscherm opent. */
export type Beginfase = { readonly fase: 'kiezen' } | { readonly fase: 'gedeeld'; readonly groupId: string };

/**
 * Waar het scherm mee begint, afgeleid uit de werkelijkheid.
 *
 * ⚠️⚠️ **Uit de koppelingen en niet uit de queryparameter.** `?groep=` zegt
 *    alleen wat er geprobeerd is. Is het koppelen halverwege misgegaan — of
 *    heeft iemand de URL zelf getypt — dan zou een scherm dat de parameter
 *    gelooft "gedeeld" melden over een koppeling die niet bestaat. Dat is de
 *    klasse "succes dat er geen is", en die kost hier precies het vertrouwen dat
 *    domeinregel 5 beschermt.
 *
 * ⚠️ **Zonder gevraagde groep telt een bestaande koppeling ook.** Wie hier
 *    terugkomt op een doel dat al gedeeld is, hoeft niet opnieuw te kiezen.
 */
export function beginfase(
  gekoppeld: readonly DoelGroep[],
  gevraagdeGroep: string | null,
): Beginfase {
  if (gevraagdeGroep !== null && gevraagdeGroep !== '') {
    const raak = gekoppeld.find((g) => g.group_id === gevraagdeGroep);
    return raak ? { fase: 'gedeeld', groupId: raak.group_id } : { fase: 'kiezen' };
  }

  const eerste = gekoppeld[0];
  return eerste ? { fase: 'gedeeld', groupId: eerste.group_id } : { fase: 'kiezen' };
}
