import type { Sleutel } from '@/shared/i18n';
// ⚠️ Rechtstreeks uit `tabbladen` en niet uit de index: dit is een pure module en de index trekt React Native mee.
import { BREED_VANAF } from '@/shared/ui/tabbladen';

/**
 * De onderdelen van Instellingen — QS8-754 (patroon V10: lijst links, paneel rechts).
 *
 * ⚠️ **Een register en geen opsomming in JSX**, zodat "alle bestaande instellingen blijven bereikbaar" een
 *    toetsbare uitspraak is: `tests/beloftes/instellingen-lijst.test.ts` legt deze lijst naast de panelen en naast
 *    de catalogus. Een instelling die uit de lijst valt is dan een rode test en geen stil verdwenen scherm.
 */
export const ONDERDEEL_IDS = [
  'voorkeuren',
  'meldingen',
  'privacy',
  'uiterlijk',
  'account',
] as const;

export type OnderdeelId = (typeof ONDERDEEL_IDS)[number];

export interface Onderdeel {
  readonly id: OnderdeelId;
  readonly titel: Sleutel;
  readonly uitleg: Sleutel;
}

/**
 * ⚠️ Account staat laatst en is dus nooit het standaardpaneel op breed scherm: account verwijderen hoort niet het
 *    eerste te zijn dat je ziet (QS8-245: dat is met opzet moeilijk bereikbaar).
 */
export const ONDERDELEN: readonly Onderdeel[] = [
  {
    id: 'voorkeuren',
    titel: 'instellingen.voorkeuren_titel',
    uitleg: 'instellingen.voorkeuren_uitleg',
  },
  {
    id: 'meldingen',
    titel: 'instellingen.meldingen_titel',
    uitleg: 'instellingen.meldingen_uitleg',
  },
  {
    id: 'privacy',
    titel: 'instellingen.privacy_titel',
    uitleg: 'instellingen.privacy_uitleg',
  },
  {
    id: 'uiterlijk',
    titel: 'instellingen.uiterlijk_titel',
    uitleg: 'instellingen.uiterlijk_uitleg',
  },
  {
    id: 'account',
    titel: 'instellingen.account_titel',
    uitleg: 'instellingen.account_uitleg',
  },
];

/** Het onderdeel bij een routeparameter, of `null` bij een onbekende naam. */
export function vindOnderdeel(id: string | undefined): Onderdeel | null {
  return ONDERDELEN.find((o) => o.id === id) ?? null;
}

/**
 * Lijst en paneel naast elkaar, of de lijst die naar een detailscherm gaat.
 *
 * ⚠️ Zelfde breekpunt als het menu (`BREED_VANAF`, QS8-705): twee eigen drempels naast elkaar geven een
 *    tussenbreedte waar het menu een kolom is en deze lijst nog gestapeld staat.
 */
export function paneelNaastLijst(breedte: number): boolean {
  return breedte >= BREED_VANAF;
}
