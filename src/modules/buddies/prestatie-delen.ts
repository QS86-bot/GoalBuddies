import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';

/**
 * Een behaalde prestatie delen in één groep — QS8-736, migratie 0309.
 *
 * ⚠️ **Dit bestand kent alleen een groep en een sleutel.** Het Prestatiescherm blijft het
 *    bezit van alles wat een badge verder is (zeldzaamheid, XP, datum) en geeft er één string
 *    van door: de badgesleutel. `tests/beloftes/prestaties-blijven-voor-jezelf.test.ts` houdt
 *    dit bestand vrij van elke verwijzing naar dat scherm of naar `modules/goals`.
 *
 * ⚠️ **De server beslist, niet dit bestand.** `deel_prestatie()` toetst of je de prestatie
 *    echt hebt, of je lid bent, de limiet van vijf per dag in jouw tijdzone en de teampoort.
 *    Deze functie vertaalt alleen het antwoord.
 *
 * ⚠️ **Een weigering is een uitslag en geen fout.** `already_shared` en `rate_limited` zijn
 *    antwoorden die het scherm in gewone woorden moet geven; alleen een netwerk- of
 *    serverfout wordt een worp.
 *
 * ⚠️ De functie staat nog niet in `src/lib/database.types.ts`: de migratie wacht op Quintens
 *    "backup gedaan". Tot `npm run types:db` hem kent loopt de aanroep door één smalle
 *    structurele rand, net als `demping.ts`, en is het bestand niet met de hand bijgewerkt.
 */

export const DEEL_UITSLAGEN = [
  'ok',
  'already_shared',
  'rate_limited',
  'team_off',
  'not_earned',
  'not_shareable',
  'not_member',
  'not_signed_in',
] as const;

export type DeelUitslag = (typeof DEEL_UITSLAGEN)[number];

interface RpcAntwoord {
  readonly data: unknown;
  readonly error: { readonly message: string; readonly code?: string } | null;
}

function rpc(): (naam: string, args: object) => PromiseLike<RpcAntwoord> {
  return (supabase() as unknown as { rpc(n: string, a: object): PromiseLike<RpcAntwoord> }).rpc.bind(
    supabase(),
  );
}

/** De uitslag uit het JSON-antwoord van de functie; alles wat we niet kennen is een fout. */
export function leesDeelUitslag(data: unknown): DeelUitslag | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const rij = data as Record<string, unknown>;
  if (rij.ok === true) return 'ok';
  const reden = rij.reason;
  return typeof reden === 'string' && (DEEL_UITSLAGEN as readonly string[]).includes(reden)
    ? (reden as DeelUitslag)
    : null;
}

/** Deel één behaalde prestatie in één groep. Werpt alleen bij een fout die geen uitslag is. */
export async function deelPrestatie(groupId: string, badge: string): Promise<DeelUitslag> {
  const { data, error } = await rpc()('deel_prestatie', { p_group_id: groupId, p_badge: badge });

  if (error) {
    reportError(new Error('Een prestatie delen mislukte'), 'buddies.deelPrestatie', {
      code: error.code ?? null,
    });
    throw new Error(t('prestaties.deel_fout'));
  }

  const uitslag = leesDeelUitslag(data);
  if (uitslag === null) {
    reportError(new Error('Onbekend antwoord van deel_prestatie'), 'buddies.deelPrestatie');
    throw new Error(t('prestaties.deel_fout'));
  }
  return uitslag;
}
