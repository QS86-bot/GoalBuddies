import { t } from '../../shared/i18n';

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

  // ⚠️⚠️ **Precies één koppeling is geen keuze; twee of meer wél** — QS8-233,
  //    en het is dezelfde redenering als in `beslissendeGroep()`.
  //
  //    Hier stond `gekoppeld[0]`, en dat was onschuldig zolang élke koppeling een
  //    eigen keuze van de gebruiker was: dan is de eerste de enige. Automatisch
  //    koppelen haalt die aanname weg — een doel kan er een groep bij krijgen die
  //    de gebruiker nooit heeft aangewezen, en dan opent dit scherm op "gedeeld
  //    met <een groep die je niet koos>", bepaald door rijvolgorde.
  //
  //    Bij twee of meer zonder expliciete `?groep=` is het eerlijke antwoord
  //    `kiezen`: het scherm beweert dan niets over wélke groep je bedoelt.
  if (gekoppeld.length === 1) {
    const enige = gekoppeld[0];
    if (enige) return { fase: 'gedeeld', groupId: enige.group_id };
  }

  return { fase: 'kiezen' };
}

/**
 * De tekst die een gedeelde uitnodiging draagt — QS8-706, optie A.
 *
 * ⚠️ **Dit is wat het lid zelf verstuurt**, en alleen dat. De groepsnaam mag
 *    erin (besluit van Quinten, 19-11-2026): het lid drukt zelf op "delen" en
 *    kiest wie het krijgt. Het **linkvoorbeeld** (de metatags die WhatsApp en
 *    mailproviders cachen) is een ander oppervlak en blijft algemeen; zie
 *    `src/shared/web/linkvoorbeeld.ts`. De afzender is de weergavenaam van het
 *    lid, en ontbreekt die, dan staat er een zin zonder afzender.
 *
 * ⚠️ Het onderwerp (mail) noemt de groep niet: een onderwerpregel staat in
 *    lijsten en meldingen, en daar hoort alleen de app en eventueel de afzender.
 *
 * ⚠️ De link komt van `deelbareUitnodiging()`; deze functie bouwt er alleen de
 *    zin omheen en kan een ingetrokken link dus nooit zelf uitdelen.
 */
export function uitnodigingsBericht(
  link: string,
  groepsnaam: string,
  afzender: string | null | undefined,
): { readonly tekst: string; readonly onderwerp: string } {
  const groep = groepsnaam.trim();
  const naam = typeof afzender === 'string' ? afzender.trim() : '';
  if (naam === '') {
    return {
      tekst: t('delen.uitnodiging_tekst_zonder_naam', { groep, link }),
      onderwerp: t('delen.uitnodiging_onderwerp_zonder_naam'),
    };
  }
  return {
    tekst: t('delen.uitnodiging_tekst', { naam, groep, link }),
    onderwerp: t('delen.uitnodiging_onderwerp', { naam }),
  };
}

/** Het bericht voor een groep, of `null` als er geen link is om te delen. */
export function deelbaarBericht(
  groep: Parameters<typeof deelbareUitnodiging>[0] & { readonly name: string },
  appUrl: string,
  afzender: string | null | undefined,
): { readonly tekst: string; readonly onderwerp: string } | null {
  const link = deelbareUitnodiging(groep, appUrl);
  return link === null ? null : uitnodigingsBericht(link, groep.name, afzender);
}
