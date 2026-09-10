import { describe, expect, it } from 'vitest';

import { proefId } from './proefid';
import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

const TEST_TIMEOUT = 30_000;

/**
 * De tweede helft van domeinregel 3 — QS8-182, migratie 0252.
 *
 * ⚠️ **CLAUDE.md, domeinregel 3:** *"Alleen een lid van dezelfde buddy-groep mag
 *    een voltooiing goedkeuren. Nooit jezelf. Afgedwongen in RLS **én** met een
 *    database-constraint."* De constraint-helft droeg maar de hélft van wat die
 *    zin belooft, en dat is precies wat een tweede grendel niet hoort te doen —
 *    hij bestaat voor het geval de eerste wegvalt.
 *
 * 📏 **Gemeten op 10-09-2026**, met `completion_approvals_subject` uitgezet (de
 *    trigger die `subject_id` onvoorwaardelijk op de eigenaar zet), want de vraag
 *    is wat het schéma zelf tegenhoudt:
 *
 *    | wat er gelogen wordt | vóór 0252 | ná 0252 |
 *    |---|---|---|
 *    | subject_id naar de goedkeurder zelf | 23514 | 23514 |
 *    | subject_id naar een **derde** | **toegelaten** | **23503** |
 *    | de eerlijke rij | toegelaten | toegelaten |
 *
 *    De CHECK `completion_approvals_not_self` is `approver_id <> subject_id` en
 *    vraagt nergens of dat subject de eigenaar van de voltooiing ís — een CHECK
 *    mag geen subquery doen, en dat is juist de reden dat `subject_id` hier
 *    gedenormaliseerd staat.
 *
 * ⚠️ **Daarom psql en niet de harness.** Deze test moet een trigger uitzetten, en
 *    dat vraagt eigenaarsrechten op de tabel. Alles draait in één transactie die
 *    terugrolt — de `disable trigger` overleeft de test dus niet.
 *
 * ⚠️ **De trigger uitzetten is de hele opzet en geen truc.** Met de trigger áán
 *    komt een client hier nooit langs, en dan meet deze test niets. De vraag is
 *    juist: wat blijft er over als die ene functie wegvalt of iemand er een
 *    `security definer`-pad omheen legt?
 *
 * IJKING — met de hand, 10-09-2026:
 *
 *   A  `completion_approvals_subject_is_eigenaar` droppen binnen de transactie
 *      -> de derde-partij-insert wordt TOEGELATEN, en de test hieronder rood.
 *         Dat is de stand van vóór 0252, met de hand nagespeeld.
 *
 *   B  Dezelfde constraint **buiten** de transactie droppen — dus de grendel die
 *      dit bestand bewaakt echt weghalen — en dan meten wat de suite doet. De
 *      vraag komt uit de security-ronde op deze branch, die vermoedde dat de
 *      test stil met de grendel meeverdwijnt (de vorm van QS8-270). 📏 Gemeten,
 *      en dat is **niet** zo:
 *
 *        met RLS_DOEL=lokaal   -> 1 bestand ROOD, "de proef gaf 0 in plaats van 1"
 *        zonder RLS_DOEL       -> 4 tests overgeslagen
 *
 *      Dat tweede is geen gat maar de regel van QS8-270 zelf: zwijgen mag alleen
 *      als niemand beweerde te meten. De poort en CI zetten `RLS_DOEL`, dus daar
 *      is het rood. `stackOordeel()` werpt op alles behalve die ene stand.
 *
 * ⚠️ **Deze test doet `disable trigger` én (in ijking A) `drop constraint`,
 *    allebei ACCESS EXCLUSIVE.** Dat is vandaag alleen veilig doordat de
 *    rls-groep op `fileParallelism: false` draait — en `vitest.config.mts` zegt
 *    er met zoveel woorden bij dat die vlag *de indamming en niet de genezing*
 *    is. Wordt hij ooit versoepeld, dan zijn deze twee statements een blokkeer-
 *    en deadlockbron en hoort deze opzet eerst herzien te worden.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_constraint where conname = 'completion_approvals_subject_is_eigenaar'",
  import.meta.url,
);

/**
 * ⚠️ **`proefId()` en geen vaste uuid.** Deze opzet interpoleert zijn id's
 *    rechtstreeks in `psql`-regels, dus ze moeten vóór de insert al bekend zijn —
 *    de geldige reden om ze zelf te kiezen. Maar *vast* mogen ze niet zijn: twee
 *    suites tegen dezelfde lokale stack dragen dan allebei dezelfde uuid en
 *    ruimt de één de rij van de ánder op (QS8-336). `gedeelde-identiteit:controle`
 *    ving dit hier op de poort.
 */
const EIGENAAR = proefId(1);
const BEOORDELAAR = proefId(2);
const DERDE = proefId(3);
const GROEP = proefId(4);
const DOEL = proefId(5);
const WEEKDOEL = proefId(6);
const VOLTOOIING = proefId(7);

/**
 * ⚠️ **Ook de invite-code moet per run verschillen.** `groups.invite_code` staat
 *    onder `groups_invite_code_key` (UNIQUE), dus een vaste code botst tussen
 *    twee gelijktijdige runs op precies dezelfde manier als een vaste uuid —
 *    alleen ziet `gedeelde-identiteit:controle` hem niet, want die zoekt uuid's.
 *    Afgeleid van de groeps-id, zodat er één bron van toeval is.
 */
const INVITE = GROEP.replaceAll('-', '').slice(0, 8).toUpperCase();

/** De opbouw die elk geval deelt. Draait binnen een transactie die terugrolt. */
const OPZET = `
begin;
insert into auth.users (id, email) values
  ('${EIGENAAR}','qs8182-eigenaar@proef.test'),
  ('${BEOORDELAAR}','qs8182-beoordelaar@proef.test'),
  ('${DERDE}','qs8182-derde@proef.test');
insert into public.groups (id, name, created_by, invite_code)
  values ('${GROEP}','QS8-182 proefgroep','${EIGENAAR}','${INVITE}');
insert into public.goals (id, owner_id, title, category, target_date)
  values ('${DOEL}','${EIGENAAR}','Doel','other', current_date + 60);
insert into public.weekly_goals (id, goal_id, title, cycle_start_date)
  values ('${WEEKDOEL}','${DOEL}','Weekdoel', current_date);
insert into public.completions (id, user_id, weekly_goal_id, achieved_level, cycle_start_date)
  values ('${VOLTOOIING}','${EIGENAAR}','${WEEKDOEL}','ceiling', current_date);
alter table public.completion_approvals disable trigger completion_approvals_subject;
create temporary table qs8182_uitkomst (waarde text) on commit drop;
`;

/**
 * Probeert één goedkeuring te plaatsen en geeft terug wat de database ervan
 * vond: `'toegelaten'` of de SQLSTATE.
 *
 * ⚠️ **De uitkomst komt uit een `exception`-blok en niet uit een exitcode.** Een
 *    geweigerde insert moet hier een méting zijn en geen kapotte test; alleen zo
 *    kan één aanroep zowel de must-deny als de must-allow beantwoorden.
 *
 * ⚠️ **En via een tijdelijke tabel en niet via `raise notice`.** Een NOTICE gaat
 *    naar stderr, en `execFileSync` geeft alleen stdout terug — dan meet je een
 *    lege string en denkt de test dat de opzet stuk is. Gemeten toen de eerste
 *    versie van dit bestand op alle vier de gevallen 'geen uitkomst' gaf.
 */
function plaatsGoedkeuring(subjectId: string, extra = ''): string {
  const sql =
    OPZET +
    extra +
    `
do $$ begin
  insert into public.completion_approvals (completion_id, approver_id, subject_id, group_id, status)
  values ('${VOLTOOIING}','${BEOORDELAAR}','${subjectId}','${GROEP}','approved');
  insert into qs8182_uitkomst values ('toegelaten');
exception when others then insert into qs8182_uitkomst values (sqlstate);
end $$;
select 'UITKOMST ' || waarde from qs8182_uitkomst;
rollback;
`;

  const uit = psqlMetInvoer(sql);

  const regel = uit.split('\n').find((r) => r.includes('UITKOMST '));
  if (regel === undefined) throw new Error(`geen uitkomst gemeten:\n${uit}`);
  return regel.slice(regel.indexOf('UITKOMST ') + 'UITKOMST '.length).trim();
}

describe.skipIf(!beschikbaar)('een goedkeuring wijst naar de eigenaar van de voltooiing', () => {
  it(
    'MUST-DENY: een subject dat naar de goedkeurder zelf wijst',
    () => {
      expect(plaatsGoedkeuring(BEOORDELAAR)).toBe('23514');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Dit is het geval dat vóór 0252 doorglipte**, en het is de reden dat deze
   *    migratie bestaat. Een goedkeuring die zegt over iemand te gaan die de
   *    voltooiing niet bezit, is geen goedkeuring — hij hangt een oordeel aan een
   *    naam die er niets mee te maken heeft.
   */
  it(
    'MUST-DENY: een subject dat naar een willekeurige derde wijst',
    () => {
      expect(
        plaatsGoedkeuring(DERDE),
        'zonder de samengestelde foreign key wordt dit toegelaten — zie de kop',
      ).toBe('23503');
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: de eerlijke rij komt er gewoon doorheen',
    () => {
      expect(plaatsGoedkeuring(EIGENAAR)).toBe('toegelaten');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De tegenproef, en die hoort in de suite en niet alleen in een
   *    commit-bericht.** Zonder deze test bewijst de must-deny hierboven niet dat
   *    0252 hem tegenhoudt — hij zou ook groen zijn als een héél andere grendel
   *    het geval afving. Dit voert het geval langs de stand van vóór 0252.
   */
  it(
    'en zonder die foreign key glipt hij er wél doorheen',
    () => {
      const zonder =
        'alter table public.completion_approvals ' +
        'drop constraint completion_approvals_subject_is_eigenaar;\n';

      expect(
        plaatsGoedkeuring(DERDE, zonder),
        'de must-deny hierboven leunt op een andere grendel dan 0252',
      ).toBe('toegelaten');
    },
    TEST_TIMEOUT,
  );
});
