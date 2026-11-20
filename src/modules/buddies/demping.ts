import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';

/**
 * De clientkant van `groep_demping` — QS8-752, migratie 0305.
 *
 * Dempen is een voorkeur van de ontvanger en zegt de groep niets: de rij is
 * alleen voor de eigenaar leesbaar (RLS), er is geen systeembericht, en geen
 * enkele andere lezer van `group_members` of de chat ziet het. Wat er dempt is
 * de database zelf — `te_beoordelen_voor()` geeft een gedempte groep niet
 * terug aan de meldingenjob — dus deze module is niet de grens maar de knop.
 *
 * ⚠️ **De tabel is nog niet in `src/lib/database.types.ts` en dat is met opzet
 *    niet met de hand bijgewerkt** (onwrikbaar: een gegenereerd bestand). De
 *    migratie wacht op Quintens "backup gedaan"; tot `npm run types:db` de
 *    tabel kent loopt de naam door één smalle structurele rand.
 *
 * ⚠️ **Een mislukte lezing is geen "niet gedempt".** `fetchGroepGedempt` werpt;
 *    het scherm toont dan een fout en geen schakelaar die uit staat, want een
 *    schakelaar die liegt over een demping is erger dan geen schakelaar.
 */

const AL_AANWEZIG = '23505';

interface FoutRand {
  readonly message: string;
  readonly code?: string;
}
interface Antwoord {
  readonly data: unknown;
  readonly error: FoutRand | null;
}
interface Bouwer extends PromiseLike<Antwoord> {
  eq(kolom: string, waarde: string): Bouwer;
  select(kolommen: string): Bouwer;
  maybeSingle(): Bouwer;
}
interface TabelRand {
  select(kolommen: string): Bouwer;
  insert(rij: object): Bouwer;
  delete(): Bouwer;
}

function db(): { from(naam: string): TabelRand } {
  return supabase() as unknown as { from(naam: string): TabelRand };
}

/** Is deze groep door jou gedempt? Werpt bij een fout. */
export async function fetchGroepGedempt(groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('groep_demping')
    .select('group_id')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (error) {
    reportError(new Error('De demping kon niet gelezen worden'), 'buddies.fetchGroepGedempt', {
      code: error.code ?? null,
      group_id: groupId,
    });
    throw new Error(t('demping.laden_mislukt'));
  }
  return data !== null;
}

/**
 * Zet de demping van één groep aan of uit.
 *
 * ⚠️ **Aanzetten is idempotent en uitzetten ook:** een tweede `insert` krijgt
 *    23505 en telt als gelukt (de gewenste stand is er), een `delete` op een
 *    ontbrekende rij raakt niets. Twee tabbladen die tegelijk schakelen kunnen
 *    elkaar dus nooit een fout geven.
 */
export async function zetGroepGedempt(
  groupId: string,
  userId: string,
  gedempt: boolean,
): Promise<void> {
  const antwoord = gedempt
    ? await db().from('groep_demping').insert({ user_id: userId, group_id: groupId })
    : await db().from('groep_demping').delete().eq('user_id', userId).eq('group_id', groupId);

  const fout = antwoord.error;
  if (fout && !(gedempt && fout.code === AL_AANWEZIG)) {
    reportError(new Error('De demping kon niet gezet worden'), 'buddies.zetGroepGedempt', {
      code: fout.code ?? null,
      group_id: groupId,
    });
    throw new Error(t('demping.zetten_mislukt'));
  }
}
