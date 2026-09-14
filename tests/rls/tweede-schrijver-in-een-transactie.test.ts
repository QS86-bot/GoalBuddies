/**
 * De uitzondering van een RPC lekt niet naar een tweede schrijver in dezelfde
 * transactie — QS8-489, en dit is de grendel van 0199 die tot vandaag niet te
 * ijken was.
 *
 * ⚠️ **`set_config(..., true)` is transactie-lokaal en niet functie-lokaal.**
 *    `beslis_lidmaatschapsverzoek()` zet `app.lidmaatschap_besloten` om zichzelf
 *    langs `guard_group_member_update()` te krijgen — een uitgezet lid mag daar
 *    terugkomen en zijn rol mag mee — en zet hem daarna meteen weer leeg. Zonder
 *    dat leegzetten blijft de uitzondering staan zolang de transactie loopt.
 *
 * 📏 **Gemeten op 14-09-2026**, één transactie, als gewone ingelogde beheerder:
 *
 *   | | sleutel ná de RPC | tweede schrijfactie |
 *   |---|---|---|
 *   | zoals het is           | `[]`            | geweigerd — `rol_van_een_ander` |
 *   | met de reset weggehaald| `[<group id>]`  | **gelukt — Carol is admin**     |
 *
 *    Dat is precies de promotie die 0199 afschaft en waarvan
 *    `guard_group_member_update()` in zijn eigen commentaar zegt dat ze niet
 *    bestaat.
 *
 * ⚠️⚠️ **Waarom dit met `psql()` gaat en niet via PostgREST, en waarom dat geen
 *    kunstgreep is.** Juist de eigenschap die dit vandaag onbereikbaar maakt —
 *    PostgREST voert één verzoek als één transactie uit — is de reden dat er
 *    langs de client geen opstelling bestaat waarin dit slot iets doet. Een test
 *    die zo'n wereld niet kan bouwen, bewaakt niets. Zelfde vorm als de
 *    `disable trigger`-opstelling in `lidmaatschapsgrens.test.ts`.
 *
 * ⚠️ **Dit bestand verandert geen gedrag en meldt geen lek.** Vandaag is de
 *    tweede schrijver niet client-bereikbaar (nagemeten in de review op QS8-356
 *    met bulk-PATCH, upsert, DELETE en headerinjectie). Wat het toevoegt is dat
 *    de grendel vanaf nu rood wórdt — de agendarij van 08-09 noemt de
 *    langdraaiende Node-server van de Hostinger-stack als het moment waarop
 *    "één verzoek is één schrijver" van eigenschap naar aanname gaat.
 *
 * 📏 IJKING, gedraaid 14-09-2026:
 *
 *   A  `perform set_config('app.lidmaatschap_besloten', '', true)` uit de RPC
 *      halen -> de belofte-test rood (Carol wordt admin), must-allow groen.
 */
import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';
import { proefId } from './proefid';

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'beslis_lidmaatschapsverzoek'",
  import.meta.url,
);

const ANNA = proefId(1);
const BRAM = proefId(2);
const CAROL = proefId(3);

/**
 * Speelt de hele opstelling af in één transactie en rolt hem terug.
 *
 * ⚠️ De tweede schrijfactie zit in een `exception`-blok, want een `raise` zou de
 *    transactie afbreken en dan is er niets meer uit te lezen — ook de
 *    must-allow niet. Wat eruit komt is dus de uitkomst van de póging, en niet
 *    of psql overleefde.
 */
function speelAf(): { tweede: string; bram: string } {
  const uit = psql(`
    begin;
    create temp table r (gid uuid, vid uuid, tweede text, bram text);
    grant select, insert, update on r to authenticated;
    insert into r (tweede) values ('niet uitgevoerd');

    insert into auth.users (id, email) values
      ('${ANNA}',  '${ANNA}@proef.local'),
      ('${BRAM}',  '${BRAM}@proef.local'),
      ('${CAROL}', '${CAROL}@proef.local')
      on conflict (id) do nothing;

    select set_config('request.jwt.claims',
      json_build_object('sub', '${ANNA}', 'role', 'authenticated')::text, true);
    set local role authenticated;
    update r set gid = ((create_group('Tweeschrijver', 0::smallint) -> 'group' ->> 'id'))::uuid;
    reset role;

    -- ⚠️ Ontdekbaar, anders weigert \`vraag_lidmaatschap_aan()\` met \`not_open\`;
    --    en dat vraagt een categorie (\`groups_ontdekbaar_heeft_categorie\`).
    update groups set categorie = 'fitness', ontdekbaar = true where id = (select gid from r);

    insert into group_members (group_id, user_id, role, status)
      select gid, '${BRAM}', 'member', 'inactive' from r;
    insert into group_members (group_id, user_id, role, status)
      select gid, '${CAROL}', 'member', 'active' from r;

    -- Bram vraagt zélf om terug te komen; dat is de enige route terug.
    select set_config('request.jwt.claims',
      json_build_object('sub', '${BRAM}', 'role', 'authenticated')::text, true);
    set local role authenticated;
    select vraag_lidmaatschap_aan((select gid from r), 'mag ik terug');
    reset role;
    update r set vid = (select id from group_join_requests
                         where group_id = (select gid from r)
                         order by created_at desc limit 1);

    -- Anna keurt goed en probeert daarna, in dezelfde transactie, een promotie.
    select set_config('request.jwt.claims',
      json_build_object('sub', '${ANNA}', 'role', 'authenticated')::text, true);
    set local role authenticated;
    select beslis_lidmaatschapsverzoek((select vid from r), 'accepted');

    do $$
    begin
      update group_members set role = 'admin'
       where group_id = (select gid from r) and user_id = '${CAROL}';
      update r set tweede = 'gelukt';
    exception
      when others then update r set tweede = 'geweigerd: ' || sqlerrm;
    end $$;
    reset role;

    update r set bram = (select status || '/' || role from group_members
                          where group_id = (select gid from r) and user_id = '${BRAM}');

    select 'TWEEDE=' || tweede || ' BRAM=' || coalesce(bram, '?') from r;
    rollback;
  `);

  const regel = uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.startsWith('TWEEDE='))
    .at(-1);
  if (regel === undefined) throw new Error(`geen uitslag uit de opstelling:\n${uit}`);

  const [, tweede, bram] = /^TWEEDE=(.*) BRAM=(.*)$/.exec(regel) ?? [];
  return { tweede: tweede ?? '?', bram: bram ?? '?' };
}

describe.runIf(beschikbaar)('een tweede schrijver in dezelfde transactie', () => {
  /**
   * ⚠️ **De belofte, en hij staat op de uitkomst van de handeling.** Niet op
   *    `current_setting()`: een test die de sleutel uitleest, toetst het
   *    mechanisme en verhuist niet mee als de grendel ooit van vorm verandert.
   *    Wat beloofd is, is dat de promotie niet landt.
   */
  it('erft de uitzondering van de RPC niet — de promotie wordt geweigerd', () => {
    const { tweede } = speelAf();

    expect(tweede, `de tweede schrijfactie kwam erdoor: ${tweede}`).toContain('geweigerd');
    expect(tweede).toContain('rol_van_een_ander');
  }, 120_000);

  /**
   * ⚠️ **De must-allow, en hij is hier geen formaliteit.** "De tweede
   *    schrijfactie wordt geweigerd" is ook waar in een wereld waarin de RPC
   *    helemaal niets doet — dan is er geen uitzondering om te erven en bewaakt
   *    de test hierboven niets. Deze helft is het bewijs dat de opstelling deugt.
   */
  it('MUST-ALLOW: het besluit zelf landt wél — Bram is terug als lid', () => {
    const { bram } = speelAf();

    expect(bram).toBe('active/member');
  }, 120_000);
});
