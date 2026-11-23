import {
  belofteperiode,
  COMMITMENT_MIN,
  isKorteWeek,
  type Begunstigde,
  type BelofteBegunstigden,
  type Belofteperiode,
} from '@/modules/commitments';
import { t } from '@/shared/i18n';
import { schoneEneRegel, telTekens } from '@/shared/tekst';
import type { UserClock } from '@/shared/time';

/**
 * De keuzes op het beloftescherm, als pure toestand — QS8-761.
 *
 * ⚠️⚠️ **Niets is voorgeselecteerd (criterium 2), en dat is strenger dan `Straf`.**
 *    `Straf` kiest bij één kandidaat die ene (`enigeOfGekozen`, QS8-651) en begint
 *    op "een groep". Hier begint alles op `null` en kiest de app nooit iemand voor
 *    je: de getuige is wie je gebroken belofte te lezen krijgt (§4 van de poort
 *    QS8-744, *nooit een standaardkeuze*). De enige afleiding is de soort als er
 *    maar één soort bestaat; dat is geen keuze van een persoon of groep.
 *
 * ⚠️ **Zonder bevestigstap is er geen aanroep, en dat is een type en geen
 *    afspraak.** `gaWeekbelofteAan()` wil de week die bevestigd is
 *    (`bevestigdeStart`), en die bestaat alleen in een {@link Bevestigstap}, die
 *    alleen {@link naarBevestigen} maakt met een volledige keuze.
 */

export type Soort = 'groep' | 'persoon';

export interface Keuze {
  readonly tekst: string;
  readonly soort: Soort | null;
  readonly groepId: string | null;
  readonly persoonId: string | null;
}

export const BEGIN: Keuze = { tekst: '', soort: null, groepId: null, persoonId: null };

/** De soort die geldt: gekozen, of de enige die er is. */
export function soortVan(keuze: Keuze, lijsten: BelofteBegunstigden): Soort | null {
  if (keuze.soort !== null) return keuze.soort;
  if (lijsten.groepen.length > 0 && lijsten.getuigen.length === 0) return 'groep';
  if (lijsten.getuigen.length > 0 && lijsten.groepen.length === 0) return 'persoon';
  return null;
}

/** Wie de belofte zou zien, met naam, of `null` zolang dat niet uitdrukkelijk gekozen is. */
export function gekozenGetuige(
  keuze: Keuze,
  lijsten: BelofteBegunstigden,
): { readonly begunstigde: Begunstigde; readonly naam: string } | null {
  const soort = soortVan(keuze, lijsten);
  if (soort === 'groep') {
    const groep = lijsten.groepen.find((g) => g.id === keuze.groepId);
    if (groep === undefined) return null;
    return { begunstigde: { soort, id: groep.id }, naam: t('belofte.iedereen_in', { groep: groep.naam }) };
  }
  if (soort === 'persoon') {
    const persoon = lijsten.getuigen.find((m) => m.id === keuze.persoonId);
    return persoon === undefined ? null : { begunstigde: { soort, id: persoon.id }, naam: persoon.naam };
  }
  return null;
}

/** Wat de bevestigstap toont, en precies dat wordt verstuurd. */
export interface Bevestigstap {
  /** De geschoonde tekst: wat `commitmentSchema` opslaat (QS8-507). */
  readonly tekst: string;
  readonly begunstigde: Begunstigde;
  readonly naam: string;
  readonly periode: Belofteperiode;
  /**
   * Is er van die week minder dan één dag over? Dan zegt de stap dat met zoveel
   * woorden (QS8-799). Vastgelegd op hetzelfde moment als `periode`.
   */
  readonly korteWeek: boolean;
}

/**
 * Naar de bevestigstap, of `null` als de keuze niet af is.
 *
 * ⚠️ De periode wordt hier vastgelegd, bij het openen van de stap, en
 *    `gaWeekbelofteAan()` weigert als de week bij het tikken een andere is.
 */
export function naarBevestigen(
  keuze: Keuze,
  lijsten: BelofteBegunstigden,
  klok: UserClock,
  nu: Date,
): Bevestigstap | null {
  const tekst = schoneEneRegel(keuze.tekst);
  const getuige = gekozenGetuige(keuze, lijsten);
  if (telTekens(tekst) < COMMITMENT_MIN || getuige === null) return null;
  return { tekst, ...getuige, periode: belofteperiode(klok, nu), korteWeek: isKorteWeek(klok, nu) };
}
