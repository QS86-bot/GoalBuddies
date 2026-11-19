import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { paginas } from '../../shared/bladeren';
import { t } from '../../shared/i18n';

/**
 * De voltooiingsmomenten van jezelf, voor de statistiekpagina — QS8-749.
 *
 * ⚠️ **Alleen eigen rijen, maar de grens is RLS en niet dit filter.** `completions_select` laat ook een
 *    groepsgenoot deze rijen lezen (hij moet kunnen goedkeuren); het `user_id`-filter kiest wat de pagina vraagt
 *    en `userId` komt uit de sessie, nooit uit een route. Dat `user_id` van een rij de indiener is, dwingt de
 *    insert-policy af. `tests/rls/statistiek-eigen-voltooiingen.test.ts` legt beide vast.
 *
 * ⚠️ Alleen drie kolommen: geen notitie, geen bewijs, geen oordeel. De Dagzet is geen bron
 *    (domeinregel 9).
 */
export interface Voltooiingsmoment {
  readonly cycle_start_date: string;
  readonly submitted_at: string;
  readonly superseded_by: string | null;
}

export const STATISTIEK_PAGINA = 500;
export const STATISTIEK_MAX_PAGINAS = 10;

export interface Voltooiingsmomenten {
  readonly rijen: readonly Voltooiingsmoment[];
  /** `true` als er meer rijen waren dan de grens; "alles" is dan onvolledig. */
  readonly afgekapt: boolean;
}

/** @param vanaf UTC-moment (ISO-tekst) waar de periode begint, of `null` voor alles. */
export async function fetchEigenVoltooiingsmomenten(
  userId: string,
  vanaf: string | null,
): Promise<Voltooiingsmomenten> {
  const rijen: Voltooiingsmoment[] = [];
  let afgekapt = false;
  let pagina = 0;

  try {
    for await (const blok of paginas(
      async (start, aantal) => {
        let q = supabase()
          .from('completions')
          .select('cycle_start_date,submitted_at,superseded_by')
          .eq('user_id', userId);
        if (vanaf !== null) q = q.gte('submitted_at', vanaf);
        const { data, error } = await q
          .order('submitted_at', { ascending: false })
          .range(start, start + aantal - 1);
        if (error) throw error;
        return data ?? [];
      },
      STATISTIEK_PAGINA,
    )) {
      rijen.push(...blok);
      pagina += 1;
      if (pagina >= STATISTIEK_MAX_PAGINAS && blok.length === STATISTIEK_PAGINA) {
        afgekapt = true;
        break;
      }
    }
  } catch (error) {
    reportError(error, 'statistiek.voltooiingen', { user_id: userId });
    throw new Error(t('statistiek.laden_mislukt'));
  }

  return { rijen, afgekapt };
}
