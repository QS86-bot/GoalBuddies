import { userCycle, userCycleOn, type IsoDate, type UserClock } from '../../shared/time';
import type { Sleutel } from '../../shared/i18n';

import { isDoelstraf, isWeekbelofte } from './stand';

/**
 * De weekbelofte aan de clientkant — QS8-761 (x.4 van de poort QS8-744).
 *
 * ⚠️ **Los van `api.ts`**, zodat dit zonder de Supabase-client te toetsen is,
 *    en zodat `tests/rls/weekbelofte-scherm.test.ts` precies déze functies naast
 *    de database legt (de naad TypeScript ↔ SQL, criterium 4).
 */

/** De week van een belofte die nu aangaat: start (de waarde die de client verstuurt) en laatste dag. */
export interface Belofteperiode {
  /** `periode_start`: de start van de lopende cyclus, op `week_start_day`. */
  readonly start: IsoDate;
  /** De laatste dag van die week (inclusief). `periode_einde` in de database is de dag erna. */
  readonly laatsteDag: IsoDate;
}

/**
 * De lopende week van de gebruiker, en dus de week van een belofte die nu aangaat.
 *
 * ⚠️ **De enige bron van `periode_start`.** De trigger `bevries_belofteperiode()`
 *    (0314) rekent zelf geen cyclus uit (correctheidsregel 7): hij toetst dat
 *    deze ene waarde op `week_start_day` valt en dat `now()` in de zone van de
 *    eigenaar binnen `[start, start + 7)` ligt. Het einde levert de client nooit;
 *    de trigger zet `periode_einde`, en de kolom heeft geen INSERT-grant.
 */
export function belofteperiode(klok: UserClock, nu: Date): Belofteperiode {
  const cyclus = userCycle(klok, nu);
  return { start: cyclus.startDate, laatsteDag: cyclus.endDate };
}

/**
 * De week van een bestaande belofte, voor de tekst "week van … tot en met …".
 *
 * ⚠️ Via `userCycleOn()` en niet `addDays(start, 6)` in een scherm
 *    (correctheidsregel 7). `null` als de kolom onzin bevat.
 */
export function belofteweek(klok: UserClock, periodeStart: string): Belofteperiode | null {
  const cyclus = userCycleOn(klok, periodeStart);
  return cyclus === null ? null : { start: cyclus.startDate, laatsteDag: cyclus.endDate };
}

/**
 * Staat er op dit doel een doelstraf die een belofte uitsluit? De uitsluiting van
 * `bevries_belofteperiode()` (0314): een doelstraf op `set` of `due`.
 */
export function heeftOpenDoelstraf(commitments: readonly AanbodCommitment[]): boolean {
  return commitments.some((c) => isDoelstraf(c) && (c.status === 'set' || c.status === 'due'));
}

/** Wat het beloftescherm voor één doel kan aanbieden. */
export type Belofteaanbod<C> =
  | { readonly soort: 'loopt'; readonly belofte: C }
  | { readonly soort: 'deze_week_al'; readonly belofte: C }
  | { readonly soort: 'doel_niet_actief' }
  | { readonly soort: 'datum_voorbij' }
  | { readonly soort: 'doelstraf' }
  | { readonly soort: 'geen_getuige' }
  | { readonly soort: 'kan' };

interface AanbodCommitment {
  readonly type: string;
  readonly status: string;
  readonly periode_start: string | null;
}

/**
 * Wat er op het beloftescherm staat, in volgorde van voorrang.
 *
 * ⚠️ **Een lopende belofte gaat vóór alles, ook vóór "geen getuige".** Wie een
 *    belofte op `set` heeft, moet haar kunnen intrekken tot ze in werking gaat
 *    (§4 van de poort), ook als zijn groep intussen weg is. Een lege staat die
 *    de intrekknop verbergt, maakt een commitment stilzwijgend strenger.
 *
 * ⚠️ **Daarna de weigeringen van de database, als uitleg in plaats van een knop
 *    die faalt.** `doel_niet_actief` en `datum_voorbij` zijn de straftak van
 *    `commitments_insert` (0170, 0238), `doelstraf` de uitsluiting van
 *    `bevries_belofteperiode()` (0314), `deze_week_al` de unieke index van 0312
 *    op `(goal_id, periode_start)` voor wat niet ingetrokken is. Het plafond van
 *    drie over al je doelen ziet dit scherm niet; dat meldt de server.
 *
 * ⚠️ `vandaag` komt van de aanroeper (correctheidsregel 7); `null` = het profiel
 *    laadt nog, en dan beslist de server, zoals bij `magStrafVastleggen()`.
 */
export function belofteaanbod<C extends AanbodCommitment>(invoer: {
  /** De weekbeloftes van dit doel (de recentste; zie `fetchBelofteStand()`). */
  readonly beloftes: readonly C[];
  readonly doelstrafOpen: boolean;
  readonly doelStatus: string;
  readonly streefdatum: string;
  readonly vandaag: string | null;
  readonly dezeWeek: string;
  readonly heeftGetuige: boolean;
}): Belofteaanbod<C> {
  const beloftes = invoer.beloftes.filter(isWeekbelofte);

  const lopend = beloftes.find((c) => c.status === 'set');
  if (lopend !== undefined) return { soort: 'loopt', belofte: lopend };

  const dezeWeek = beloftes.find((c) => c.periode_start === invoer.dezeWeek && c.status !== 'cancelled');
  if (dezeWeek !== undefined) return { soort: 'deze_week_al', belofte: dezeWeek };

  if (invoer.doelStatus !== 'active') return { soort: 'doel_niet_actief' };
  if (invoer.vandaag !== null && invoer.streefdatum < invoer.vandaag) return { soort: 'datum_voorbij' };
  if (invoer.doelstrafOpen) return { soort: 'doelstraf' };
  if (!invoer.heeftGetuige) return { soort: 'geen_getuige' };
  return { soort: 'kan' };
}

/**
 * De weigeringen van de database bij het aangaan, en de zin die de gebruiker leest.
 *
 * ⚠️ **Herkend aan de tekst van de `raise` in 0314**, want ze delen allemaal de
 *    code 23514. `tests/beloftes/weekbelofte-fout.test.ts` legt elk fragment hier
 *    naast het migratiebestand: verandert de tekst daar, dan valt dit op een
 *    algemene melding terug en wordt die test rood.
 */
//
// ⚠️ **De volgorde draagt:** "lopende weekbeloftes" bevat "lopende week", dus het
//    plafond staat vóór de verlopen week. De eerste treffer wint.
export const BELOFTE_WEIGERINGEN: readonly { readonly fragment: string; readonly sleutel: Sleutel }[] = [
  { fragment: 'lopende weekbeloftes', sleutel: 'belofte.fout.plafond' },
  { fragment: 'week-startdag', sleutel: 'belofte.fout.startdag' },
  { fragment: 'lopende week', sleutel: 'belofte.fout.week_voorbij' },
  { fragment: 'staat een straf', sleutel: 'belofte.fout.doelstraf' },
];

/**
 * De sleutel van de melding bij een mislukte insert.
 *
 * 23505 is de unieke index van 0312 (één lopende belofte per doel, één per
 * week per doel). 42501 is de policy: een begunstigde die je niet (meer) kent,
 * een doel dat niet meer actief is. Al het andere is een storing.
 */
export function belofteFoutsleutel(fout: { readonly code?: string; readonly message?: string }): Sleutel {
  if (fout.code === '23505') return 'belofte.fout.al_deze_week';
  if (fout.code === '42501') return 'belofte.fout.geweigerd';
  if (fout.code === '23514') {
    const bekend = BELOFTE_WEIGERINGEN.find((w) => (fout.message ?? '').includes(w.fragment));
    if (bekend !== undefined) return bekend.sleutel;
  }
  return 'commitment.fout.vastleggen';
}
