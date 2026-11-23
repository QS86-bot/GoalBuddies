import { en } from '../i18n/en';
import { nl } from '../i18n/nl';

/**
 * De metatags voor het linkvoorbeeld — QS8-706.
 *
 * ⚠️⚠️ **Wat hier staat, is publiek en onherroepelijk.** Een crawler van
 *    WhatsApp of een mailprovider haalt de pagina op, leest deze tags en
 *    cachet het resultaat. Wie de uitnodigingslink ontvangt, óók wie er nooit
 *    op klikt en dus nooit lid wordt, ziet wat hier staat. Daarom is de
 *    functie een functie van het **adres van de app** en van niets anders: geen
 *    groepsnaam, geen ledental, geen code, geen afzender. Er is geen parameter
 *    waar een groepsgegeven doorheen kan (domeinregel 7 en 4).
 *
 * ⚠️ De export is statisch: elke route krijgt dezelfde tags. Dat is hier een
 *    voordeel en geen beperking — een voorbeeld dat per groep verschilt, zou
 *    precies de uitlek zijn die dit bestand uitsluit.
 *
 * ⚠️ De tekst komt uit de catalogi (nl én en), rechtstreeks en niet via
 *    `t()`: dit draait tijdens `expo export` zonder profiel, en de pagina is
 *    één bestand voor alle talen (`<html lang="nl">`).
 */

interface Metatag {
  /** `property` voor Open Graph, `name` voor de rest. */
  readonly soort: 'property' | 'name';
  readonly sleutel: string;
  readonly inhoud: string;
}

/** Het logo: het 512-pixel-icoon uit `public/`, vierkant en dus als `summary`-kaart. */
export const LOGO_PAD = '/icon-512.png';
const LOGO_MAAT = 512;

/**
 * ⚠️ QS8-797: de pagina is één bestand voor alle talen, dus de beschrijving draagt
 *    beide: de Nederlandse zin en de Engelse erachter. Een ontvanger die één van de
 *    twee niet leest, ziet toch een zin die hij begrijpt. Titel is de merknaam.
 */
export function linkvoorbeeldBeschrijving(): string {
  return `${nl['linkvoorbeeld.beschrijving']} ${en['linkvoorbeeld.beschrijving']}`;
}

export function linkvoorbeeldTags(appUrl: string): readonly Metatag[] {
  const basis = appUrl.replace(/\/+$/, '');
  const titel = nl['linkvoorbeeld.titel'];
  const beschrijving = linkvoorbeeldBeschrijving();
  const logo = `${basis}${LOGO_PAD}`;

  return [
    { soort: 'property', sleutel: 'og:type', inhoud: 'website' },
    { soort: 'property', sleutel: 'og:site_name', inhoud: titel },
    { soort: 'property', sleutel: 'og:title', inhoud: titel },
    { soort: 'property', sleutel: 'og:description', inhoud: beschrijving },
    { soort: 'property', sleutel: 'og:image', inhoud: logo },
    { soort: 'property', sleutel: 'og:image:width', inhoud: String(LOGO_MAAT) },
    { soort: 'property', sleutel: 'og:image:height', inhoud: String(LOGO_MAAT) },
    { soort: 'name', sleutel: 'description', inhoud: beschrijving },
    { soort: 'name', sleutel: 'twitter:card', inhoud: 'summary' },
    { soort: 'name', sleutel: 'twitter:title', inhoud: titel },
    { soort: 'name', sleutel: 'twitter:description', inhoud: beschrijving },
    { soort: 'name', sleutel: 'twitter:image', inhoud: logo },
  ];
}
