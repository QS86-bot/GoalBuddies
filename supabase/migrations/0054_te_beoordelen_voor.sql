-- 0054_te_beoordelen_voor.sql — EPIC 11, nazorg op 0053
--
-- ROLLBACK-PAD:
--   drop function if exists te_beoordelen_voor(uuid);
--
-- ⚠️ Waarom deze functie bestaat, en het is een correctie op mijn eerste opzet.
--    De meldingen-job wilde `openstaande_beoordelingen()` gebruiken om te
--    bepalen wie er een goedkeuringsverzoek krijgt. Dat gaat om twee redenen
--    mis:
--
--    1. Die functie is **geen** SECURITY DEFINER en leunt dus op de RLS van de
--       aanroeper. De job draait als `service_role` en krijgt daarmee élke
--       openstaande voltooiing in het hele project terug — niet alleen die van
--       één groep. Wie daar een melding op baseert, stuurt iedereen een bericht
--       over de week van een wildvreemde.
--    2. Ze geeft geen `approver_id` terug, want in de UI ís de aanroeper de
--       beoordelaar. In een job is dat juist de vraag.
--
--    Dit is de valkuil "een SECURITY DEFINER-functie omzeilt RLS" van de andere
--    kant bekeken: hier is het probleem dat de rol al alles mag, en dat de
--    functie dus zélf moet zeggen wie wat mag zien.
--
-- ⚠️ De autorisatiegrens staat hier expliciet in de WHERE, en het is dezelfde
--    als bij peer-goedkeuring (domeinregel 3): je moet actief lid zijn van een
--    groep waaraan het doel gekoppeld is, je mag niet de eigenaar zijn, en je
--    mag nog niet geoordeeld hebben.

begin;

create or replace function public.te_beoordelen_voor(p_user_id uuid)
returns table(
  completion_id uuid,
  owner_id      uuid,
  owner_name    text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct
    c.id,
    g.owner_id,
    p.display_name
  from completions c
  join weekly_goals w on w.id = c.weekly_goal_id
  join goals g        on g.id = w.goal_id
  join profiles p     on p.id = g.owner_id
  join goal_group_links l on l.goal_id = g.id
  join group_members m    on m.group_id = l.group_id
  where c.superseded_by is null
    and w.status = 'pending'
    -- De beoordelaar is een actief lid van een groep waaraan dit doel hangt.
    and m.user_id = p_user_id
    and m.status = 'active'
    -- ⚠️ Nooit jezelf (domeinregel 3). De CHECK op `completion_approvals`
    --    dekt dit ook af, maar een melding sturen die je daarna niet mag
    --    opvolgen is een doodlopende weg.
    and g.owner_id <> p_user_id
    -- Al geoordeeld? Dan is er niets meer te vragen.
    and not exists (
      select 1 from completion_approvals a
      where a.completion_id = c.id and a.approver_id = p_user_id
    )
    -- ⚠️ Ook niet als de groep slaapt (5.9). Staat hier en niet alleen in de
    --    job, want een tweede plek waar dit vergeten kan worden is er een te
    --    veel.
    and exists (
      select 1 from groups gr
      where gr.id = l.group_id and gr.status = 'active'
    )
  limit 50;
$$;

-- ⚠️ Alleen voor de job. Een gebruiker die dit voor een wíllekeurige `p_user_id`
--    mag aanroepen, leest wie er in andermans groep op een oordeel wacht — en
--    daarmee dat die persoon zijn week nog niet rond heeft. De UI heeft deze
--    functie ook niet nodig: daar doet `openstaande_beoordelingen()` het werk,
--    onder de RLS van de gebruiker zelf.
revoke all on function public.te_beoordelen_voor(uuid) from public, anon, authenticated;

commit;
