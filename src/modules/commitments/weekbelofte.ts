import { userCycle, userCycleEndsWithin, userCycleOn, type IsoDate, type UserClock } from '../../shared/time';
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

/** Minder dan zoveel uur over in de lopende week, en de bevestigstap zegt het — QS8-799. */
export const KORTE_WEEK_UREN = 24;

/**
 * Loopt de week van een belofte die nu aangaat nog minder dan één dag? — QS8-799.
 *
 * ⚠️ Dit verandert niets aan wat er mag: "alleen in de lopende week" (0314) blijft
 *    staan, en de belofte gaat ook met een paar uur over gewoon aan. Het is een
 *    waarschuwing in de bevestigstap, zodat niemand op zondagavond een week belooft
 *    waarvan alleen de laatste uren over zijn. De grens rekent `shared/time` uit,
 *    in de tijdzone en op de week-startdag van de gebruiker (regel 7).
 */
export function isKorteWeek(klok: UserClock, nu: Date): boolean {
  return userCycleEndsWithin(klok, nu, KORTE_WEEK_UREN);
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
 * De nieuwste belofte van dit doel, als die beslist is (`due` of `cancelled`) — QS8-815.
 *
 * ⚠️ **Alleen de nieuwste beslissing telt** (besluit Quinten 23-11, V2 = A). Loopt
 *    er een nieuwere belofte (`set`), of is de nieuwste `resolved`, dan is er geen
 *    uitslag om te noemen. `beloftes` is nieuwste eerst (`fetchBelofteStand()`).
 */
export function nieuwsteBeslist<C extends AanbodCommitment>(beloftes: readonly C[]): C | undefined {
  const nieuwste = beloftes.find(isWeekbelofte);
  return nieuwste !== undefined && (nieuwste.status === 'due' || nieuwste.status === 'cancelled')
    ? nieuwste
    : undefined;
}

/**
 * De verschuldigde belofte van een vórige week, of `undefined` — QS8-761, QS8-815.
 *
 * ⚠️ **De eigenaar hoort de uitkomst, niet alleen de getuige** (critical-user). Een
 *    belofte die `due` werd, valt na haar week uit `belofteaanbod()` (dat kijkt naar
 *    `set` en naar deze week), en dan zag de eigenaar een leeg formulier terwijl zijn
 *    getuige een bericht kreeg.
 * ⚠️ **Sinds QS8-815 alleen als zij de nieuwste beslissing is** (V2 = A). Een oudere
 *    `due` achter een nieuwere gehouden of ingetrokken week verdwijnt van het scherm;
 *    die nieuwere week krijgt haar eigen uitslagregel (`belofteuitslag()`).
 */
export function vorigeVerschuldigd<C extends AanbodCommitment>(beloftes: readonly C[], dezeWeek: string): C | undefined {
  const nieuwste = nieuwsteBeslist(beloftes);
  return nieuwste !== undefined &&
    nieuwste.status === 'due' &&
    nieuwste.periode_start !== null &&
    nieuwste.periode_start < dezeWeek
    ? nieuwste
    : undefined;
}

/** Is de week van deze belofte voorbij terwijl ze nog niet beslist is? (0313 beslist één run later.) */
export function wachtOpBeslissing(belofte: AanbodCommitment, dezeWeek: string): boolean {
  return belofte.status === 'set' && belofte.periode_start !== null && belofte.periode_start < dezeWeek;
}

/**
 * De weigering van een **doelstraf** naast een lopende belofte (0314), als eigen zin.
 * Zonder dit las `maak()` "probeer het opnieuw", terwijl opnieuw proberen nooit lukt.
 */
export function strafFoutsleutel(fout: { readonly code?: string; readonly message?: string }): Sleutel {
  if (fout.code === '23514' && (fout.message ?? '').includes(STRAF_NAAST_BELOFTE)) return 'straf.belofte_loopt';
  return 'commitment.fout.vastleggen';
}

/** Fragment van de `raise` in 0314; `tests/beloftes/weekbelofte-fout.test.ts` zoekt het in de migraties. */
export const STRAF_NAAST_BELOFTE = 'loopt een weekbelofte';

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

/** De uitslag van een besliste belofte, zoals de eigenaar haar leest — QS8-815. */
export type Belofteuitslag = 'gehouden' | 'in_werking' | 'ingetrokken';

/** De laatste `cancelled`-regel uit het spoor van één belofte (`commitment_events`). */
export interface Intrekspoor {
  readonly actor_id: string | null;
  readonly payload: unknown;
}

/** Leest `payload.doelstatus` van een spoorregel, of `null` als die er niet (leesbaar) is. */
function doelstatusIn(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const waarde = (payload as Record<string, unknown>)['doelstatus'];
  return typeof waarde === 'string' ? waarde : null;
}

/**
 * Hoe is deze belofte beslist? — QS8-815, besluit Quinten 23-11 (één regel met de uitslag).
 *
 * ⚠️⚠️ **`cancelled` heeft drie wegen, en alleen het spoor onderscheidt ze** (0057,
 *    0220, 0313; de kolom `status` zegt het niet):
 *    1. de rollover beslist de week als gehouden (`beslis_weekbeloftes()`): de
 *       spoorregel heeft **geen actor**, want die draait zonder JWT;
 *    2. het doel wordt binnen de week afgerond (`rond_doel_af()` →
 *       `wikkel_commitments_af()`): de actor is de **eigenaar**, maar de payload
 *       draagt `doelstatus: 'completed'`, want het doel staat al op `completed`
 *       vóór de afwikkeling. Ook dit is gehouden (kop van 0313);
 *    3. de eigenaar trekt in (`commitments_update`): de actor is de eigenaar.
 * ⚠️ **Bij twijfel zegt het scherm niets** (`null`): geen spoorregel, of een actor
 *    die niet de eigenaar is en geen afgerond doel. Een uitslag die niet klopt,
 *    over een commitment device, is erger dan geen uitslag (domeinregel 5).
 * ⚠️ `resolved` en `set` hebben hier geen regel: `set` is nog niet beslist, en
 *    `resolved` is een afgehandelde `due` met een eigen kaarttekst.
 */
export function belofteuitslag(
  belofte: { readonly status: string },
  spoor: Intrekspoor | undefined,
  eigenaar: string,
): Belofteuitslag | null {
  if (belofte.status === 'due') return 'in_werking';
  if (belofte.status !== 'cancelled' || spoor === undefined) return null;
  if (spoor.actor_id === null) return 'gehouden';
  if (doelstatusIn(spoor.payload) === 'completed') return 'gehouden';
  if (spoor.actor_id === eigenaar) return 'ingetrokken';
  return null;
}
