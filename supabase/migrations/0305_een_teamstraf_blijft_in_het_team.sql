-- 0305_een_teamstraf_blijft_in_het_team.sql — een commitment op een aandeel
-- heeft alleen de eigen teamgroep of een teamgenoot als begunstigde of getuige,
-- en een teamgroep is alleen begunstigde van een aandeel (QS8-660, epic QS8-650).
--
-- ⚠️ **Voorlopig nummer.** Bouwt op 0304 van QS8-656. De batchsessie hernummert
--    bij het landen, na 0302 van QS8-233 (besluit van Quinten, 18-11-2026).
--
-- ROLLBACK-PAD (voegt alleen een weigering toe; geen gegevens):
--   drop trigger if exists commitments_teamstraf on public.commitments;
--   drop function if exists public.bewaak_teamstraf();
--
-- ---------------------------------------------------------------------------
-- Wat dit doet, en waar het vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit 12 en 29 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- en de ontwerpronde met Quinten van 18-11-2026 (grens 1, reactie op QS8-660):
--
-- 1. Op een **aandeel** is de begunstigde groep leeg of de eigen teamgroep, en
--    de begunstigde persoon leeg of een actief lid van die teamgroep. Geen
--    vriendengroep en geen vriend: een werkaandeel en een vriendenkring zijn
--    twee werelden.
-- 2. Een **teamgroep** is alleen begunstigde van een aandeel. Een privédoel blijft
--    buiten het team, ook als de eigenaar het zelf aan de teamgroep koppelde.
-- 3. Bij verschuldigd zien collega's de naam en de straftekst, zoals bij elke
--    begunstigde groep. `commitment_zichtbaar_voor_groep()` verandert niet.
--
-- ⚠️ **Een eigen trigger en geen tak in `bewaak_begunstigde()`.** Twee
--    herdefinities van één functielichaam verliezen stil elkaars register
--    (QS8-358); een eigen trigger kan dat niet.
--
-- ⚠️ **Een niet-eigenaar krijgt de melding van de policy, woordelijk.** Een
--    `before`-trigger antwoordt vóór de policy, en een eigen melding zou een
--    vreemde laten zien dat een doel een aandeel is. Zwijgen kan niet: dat opent
--    de grendel voor een definer-context zonder policy erachter (securityreview
--    QS8-654, M1). Dezelfde vorm als `aandeel_blijft_in_teamgroep()` (0301).
--
-- ⚠️ **Een lege begunstigde mag altijd.** De foreign keys zetten hem op `null` als
--    de groep of de persoon verdwijnt, en die RI-actie hoort hier niet te botsen.
--
-- ---------------------------------------------------------------------------

create or replace function public.bewaak_teamstraf()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_eigenaar uuid;
  v_team     uuid;
  v_fout     boolean := false;
begin
  select g.owner_id into v_eigenaar from goals g where g.id = new.goal_id;

  -- De teamgroep van dit doel als het een aandeel is, anders leeg.
  select t.group_id into v_team
    from team_goal_shares s
    join team_goals t on t.id = s.team_goal_id
   where s.goal_id = new.goal_id;

  if v_team is not null then
    -- 1. Een aandeel: alleen het eigen team.
    if new.beneficiary_group_id is not null and new.beneficiary_group_id <> v_team then
      v_fout := true;
    end if;
    if new.beneficiary_user_id is not null and not exists (
         select 1 from group_members m
          where m.group_id = v_team
            and m.user_id  = new.beneficiary_user_id
            and m.status  <> 'inactive') then
      v_fout := true;
    end if;
  elsif new.beneficiary_group_id is not null and exists (
          select 1 from groups gr
           where gr.id = new.beneficiary_group_id and gr.organization_id is not null) then
    -- 2. Een teamgroep is alleen begunstigde van een aandeel.
    v_fout := true;
  end if;

  if not v_fout then
    return new;
  end if;

  if v_uid is not null and v_eigenaar is distinct from v_uid then
    raise exception 'new row violates row-level security policy for table "commitments"'
      using errcode = '42501';
  end if;

  raise exception 'Een afspraak op een teamaandeel blijft in het team, en een team is alleen getuige van een teamaandeel'
    using errcode = 'check_violation',
          hint    = 'teamstraf';
end;
$$;
revoke all on function public.bewaak_teamstraf() from public, anon, authenticated;

drop trigger if exists commitments_teamstraf on public.commitments;
create trigger commitments_teamstraf
  before insert or update of goal_id, beneficiary_group_id, beneficiary_user_id on public.commitments
  for each row execute function public.bewaak_teamstraf();
