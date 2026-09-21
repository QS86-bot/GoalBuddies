/**
 * De Dagzet telt niet mee — domeinregel 9, QS8-184.
 *
 * ⚠️ **De dossierrij vraagt iets dat dit bestand niet beantwoordt.** *"Gaan
 *    gebruikers de Dagzet zien als de check-in die telt?"* blijkt uit gedrag en
 *    niet uit het schema; dat blijft agenda voor november. Wat hier staat is de
 *    ándere helft: de code-kant die het antwoord ongevaarlijk houdt.
 *
 * ⚠️⚠️ **Alle drie de beloftes van domeinregel 9 zijn een afwézigheid, en die is
 *    stil kwijt te raken.** "Levert nooit punten op", "levert nooit goedkeuring
 *    op", "een dag overslaan heeft geen enkel gevolg" — geen van drieën is een
 *    kolom of een constraint die je kunt aanwijzen. Ze zijn waar omdat er
 *    *niets* is dat `daily_moves` leest en er iets mee doet. Dat is precies de
 *    vorm waar `verbindingen:controle` voor bestaat: een regel die klopt omdat
 *    er iets ontbreekt, hoort een grendel te hebben die rood wordt zodra het er
 *    tóch komt.
 *
 * ⚠️ **Vandaar dat de eerste test naar het schema kijkt en niet naar gedrag.**
 *    Een gedragstest ("na een Dagzet is `points_ledger` nog leeg") bewijst één
 *    geval; de vraag is een eigenschap over het hele schema. De dag dat iemand
 *    een trigger schrijft die punten aan een Dagzet hangt, is dát de bevinding —
 *    en dan is de weekcyclus ondermijnd door de codebase zelf en niet door de
 *    gebruiker.
 */
import { describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

const TEST_TIMEOUT = 60_000;
const SETUP_TIMEOUT = 180_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'daily_moves'",
  import.meta.url,
);

/**
 * De enige twee functies die `daily_moves` mogen noemen, en waarom.
 *
 * ⚠️ Allebei zijn het remmen: ze tellen hoeveel Dagzetten er vandaag al staan en
 *    weigeren de volgende. Ze léíden er niets uit af — geen punten, geen
 *    goedkeuring, geen reeks. Komt er een derde naam bij, dan is dat een besluit
 *    over domeinregel 9 en hoort het hier met een reden te staan.
 */
const MAG_DAGZETTEN_NOEMEN: Readonly<Record<string, string>> = {
  begrens_dagzetten:
    'Triggerfunctie op `daily_moves` zelf: het dagplafond. Telt de rijen van vandaag en weigert de volgende; leidt er niets uit af.',
};

describe.skipIf(!rlsTestsConfigured || !beschikbaar)('de Dagzet telt niet mee', () => {
  /**
   * ⚠️ **Dit is de klassetest en niet de gevaltest.** Hij blijft kloppen als er
   *    functies bij komen, en dat is het hele punt: hij bewaakt de afwezigheid
   *    en niet één voorbeeld ervan.
   */
  it(
    'wordt door geen enkele databasefunctie gelezen behalve de rem',
    () => {
      const uit = psql(`
        select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') ~ '\\mdaily_moves\\M'
      `).trim();

      const gevonden = uit === '' ? [] : uit.split(', ');
      const onbekend = gevonden.filter((naam) => !(naam in MAG_DAGZETTEN_NOEMEN));

      expect(
        onbekend,
        'Een functie die `daily_moves` leest, kan er iets uit afleiden — en domeinregel 9 ' +
          'zegt dat de Dagzet nooit punten of goedkeuring oplevert. Is dat bewust, zet hem ' +
          'dan met een reden in MAG_DAGZETTEN_NOEMEN in dit bestand.',
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Een view is net zo goed een lezer, en hij valt buiten `pg_proc`. `pin`-
   *    en `zichtbaarheid`-controles zijn hier al eens langs een view heen
   *    gekeken; dat kost hier de hele belofte.
   */
  it(
    'zit in geen enkele view',
    () => {
      const uit = psql(`
        select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('v', 'm')
          and pg_get_viewdef(c.oid) ~ '\\mdaily_moves\\M'
      `).trim();

      expect(uit).toBe('');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ En geen enkele policy op een ándere tabel mag hem noemen. Zou
   *    `weekly_goals_select` ooit naar een Dagzet kijken, dan bepaalt de Dagzet
   *    wat er van de wéék zichtbaar is — en dan telt hij mee, hoe je het ook
   *    noemt.
   */
  it(
    'komt in geen enkele policy voor buiten zijn eigen tabel',
    () => {
      const uit = psql(`
        select coalesce(string_agg(pol.polrelid::regclass::text || '.' || pol.polname, ', '), '')
        from pg_policy pol
        where pol.polrelid <> 'public.daily_moves'::regclass
          and (
            coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~ '\\mdaily_moves\\M'
            or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ '\\mdaily_moves\\M'
          )
      `).trim();

      expect(uit).toBe('');
    },
    TEST_TIMEOUT,
  );

  describe('en dat is ook echt zo als je er een schrijft', () => {
    let ik: TestUser;
    let weekdoelId = '';

    /**
     * ⚠️ De Dagzet hangt hier bewust **aan een weekdoel**. Een losse Dagzet raakt
     *    de weekcyclus per constructie niet; de vraag is of een gekoppelde het
     *    doet. Dat is het geval waar de dossierrij over gaat.
     */
    it(
      'laat punten, weekstand, voltooiingen en reeks onaangeroerd',
      async () => {
        const admin = adminDb();
        ik = await createTestUser('dagzet-telt-niet');

        const doel = await ik.db
          .from('goals')
          .insert({ owner_id: ik.id, title: 'Doel met Dagzet', target_date: '2027-01-01' })
          .select('id')
          .single();
        if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

        const week = await ik.db
          .from('weekly_goals')
          .insert({ goal_id: doel.data.id, title: 'Week', cycle_start_date: '2026-09-07' })
          .select('id, status')
          .single();
        if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);
        weekdoelId = week.data.id;

        const voor = await stand(ik, weekdoelId);

        const dagzet = await ik.db.from('daily_moves').insert({
          user_id: ik.id,
          weekly_goal_id: weekdoelId,
          body: 'Een halfuur gewerkt.',
          local_date: '2026-09-08',
        });
        expect(dagzet.error).toBeNull();

        const na = await stand(ik, weekdoelId);

        // De belofte in haar kortste vorm: er is niets veranderd aan de week.
        expect(na).toEqual(voor);

        await admin.from('goals').delete().eq('id', doel.data.id);
      },
      SETUP_TIMEOUT,
    );

    /**
     * ⚠️ De eerste helft van domeinregel 9, en de enige die géén afwezigheid is:
     *    de Dagzet is **standaard** privé. Dat is een kolomstandaard, en die is
     *    met één migratie om te zetten zonder dat er iets rood wordt.
     */
    it(
      'staat standaard op privé als de client niets meestuurt',
      async () => {
        const gemaakt = await ik.db
          .from('daily_moves')
          .insert({ user_id: ik.id, body: 'Zonder zichtbaarheid.', local_date: '2026-09-09' })
          .select('visibility')
          .single();

        expect(gemaakt.error).toBeNull();
        expect(gemaakt.data?.visibility).toBe('private');
      },
      TEST_TIMEOUT,
    );

    it('ruimt zijn gebruiker op', async () => {
      await removeTestUsers();
      expect(true).toBe(true);
    }, SETUP_TIMEOUT);
  });
});

/** Alles wat de weekcyclus draagt, in één momentopname. */
async function stand(
  gebruiker: TestUser,
  weekdoelId: string,
): Promise<{ punten: number; weekstand: string | null; voltooiingen: number; reeksen: number }> {
  const [punten, week, voltooiingen, reeksen] = await Promise.all([
    gebruiker.db.from('points_ledger').select('delta').eq('user_id', gebruiker.id),
    gebruiker.db.from('weekly_goals').select('status').eq('id', weekdoelId).single(),
    gebruiker.db.from('completions').select('id').eq('weekly_goal_id', weekdoelId),
    gebruiker.db.from('user_streaks').select('current_streak').eq('user_id', gebruiker.id),
  ]);

  return {
    punten: (punten.data ?? []).reduce((som, r) => som + (r.delta ?? 0), 0),
    weekstand: week.data?.status ?? null,
    voltooiingen: (voltooiingen.data ?? []).length,
    reeksen: (reeksen.data ?? []).reduce((som, r) => som + (r.current_streak ?? 0), 0),
  };
}
