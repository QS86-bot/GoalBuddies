-- 0229_een_bewijsfoto_wijst_naar_zijn_eigen_voltooiing.sql — de kolomgrens, het
-- schrijfrecht terug, en de bijlage in de RPC die de beoordelaar voedt.
--
-- ROLLBACK-PAD:
--   alter table public.completions drop constraint if exists completions_attachment_eigen_pad;
--   revoke insert (attachment_url) on public.completions from public, anon, authenticated;
--   drop function if exists public.openstaande_beoordelingen(integer, timestamptz, uuid);
--   -- daarna de vorm van 0125 opnieuw uitvoeren, mét de revoke/grant eronder.
--
-- ---------------------------------------------------------------------------
-- 1. De kolomgrens is een CHECK en geen policy
-- ---------------------------------------------------------------------------
--
-- 0150 heeft `grant insert (attachment_url)` ingetrokken, met de reden dat er
-- geen uploadpad was en de keuze in het beheerscherm dus loog. 0227 zet dat pad
-- neer, dus het recht komt terug — maar niet kaal.
--
-- Zonder CHECK zet een gebruiker met één PostgREST-verzoek het pad van een
-- ándere voltooiing in dat veld, of een extern adres, en dan laadt elke
-- beoordelaar dat adres uit zijn eigen `<Image>`.
--
-- ⚠️ **RLS beslist over rijen en niet over kolommen.** De eis is hier "wat mag
--    er in deze kolom staan", en dan is een policy per definitie te weinig —
--    dezelfde zin die CLAUDE.md bij domeinregel 7 opschrijft, en dezelfde vorm
--    als 0223 voor de chat.
--
-- ⚠️ **Een vormtoets en geen prefixtoets, en dat is de vierde keer.** 0127 zette
--    deze grendel op `profiles.avatar_url` met een `like`, en 0129 moest
--    erbovenop omdat `<mij>/../<ander>/a.png` daar doorheen liep. De regex is
--    daar overgenomen en niet opnieuw bedacht: verankerd aan beide kanten, geen
--    `/` in het derde segment, en de extensie erin zodat `.svg` nooit geclaimd
--    kan worden ook al weigert de bucket dat MIME-type.
--
-- ⚠️ **Geen null-tak zoals in 0223.** Daar moest `type <> 'system'` erbij omdat
--    een systeembericht geen afzender heeft. Hier zijn `weekly_goal_id` en
--    `user_id` allebei `not null`, dus die tak zou nergens over gaan. Dat staat
--    hier opgeschreven omdat de afwezigheid ervan anders als vergissing leest.
--
-- ---------------------------------------------------------------------------
-- 2. Geen UPDATE-grant
-- ---------------------------------------------------------------------------
--
-- `completions` is append-only (domeinregel 6): een correctie loopt via
-- `dien_opnieuw_in()` en niet via een UPDATE. Het pad gaat dus mee in de INSERT,
-- en die volgorde — eerst uploaden, dan invoegen — is in `rondAf()` geen
-- stijlkeuze maar de enige die werkt. Zelfde vorm als 0193 voor `chat_messages`.
--
-- ---------------------------------------------------------------------------
-- 3. De RPC krijgt de bijlage, en verder verandert er niets
-- ---------------------------------------------------------------------------
--
-- Zonder deze stap is de keten af en nergens verbonden: er is een bucket, een
-- policy, een kolom, een grant en een uploadknop, en niemand kijkt er ooit naar.
-- Dat is onwrikbare regel 18 vraag 5 — de variant zonder kapot onderdeel.
--
-- ⚠️ **`create or replace` kán hier niet**: de returntable krijgt een kolom
--    erbij en dat is een ander returntype. Vandaar de `drop` eerst, met de
--    handtekening zoals die op de database staat — opgehaald met
--    `pg_get_functiondef()` en niet overgetypt uit 0125.
--
-- ⚠️ **Een gedropte functie neemt zijn grants mee** en erft daarna van
--    `alter default privileges`. De revoke/grant onderaan is dus geen opsmuk;
--    `functiegrants.test.ts` wordt rood zonder.
--
-- ⚠️ De projectie, de `where` en de twee laterals zijn **letterlijk
--    ongewijzigd** overgenomen uit de gedeployde functie. Dit is geen
--    autorisatiewijziging, en `tests/rls/beoordelingsgrens.test.ts` hoort er
--    groen op te blijven.

alter table public.completions
  drop constraint if exists completions_attachment_eigen_pad;

alter table public.completions
  add constraint completions_attachment_eigen_pad check (
    attachment_url is null
    or attachment_url ~ (
      '^' || weekly_goal_id::text || '/' || user_id::text
          || '/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$'
    )
  );

-- 0147 heeft de tabelbrede INSERT-grant al ingetrokken, dus dit is een kale
-- kolomgrant en geen verruiming van iets anders.
grant insert (attachment_url) on public.completions to authenticated;

drop function if exists public.openstaande_beoordelingen(integer, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.openstaande_beoordelingen(p_limit integer DEFAULT 20, p_na_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_na_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(completion_id uuid, weekly_goal_id uuid, group_id uuid, owner_id uuid, owner_name text, owner_avatar text, goal_title text, weekly_title text, floor_text text, ceiling_text text, achieved_level text, note text, attachment_url text, submitted_at timestamp with time zone, approvals_done integer, approvals_required integer, total_open bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with wachtrij as materialized (
    select
      c.id             as completion_id,
      w.id             as weekly_goal_id,
      k.group_id       as group_id,
      g.owner_id       as owner_id,
      p.display_name   as owner_name,
      p.avatar_url     as owner_avatar,
      g.title          as goal_title,
      w.title          as weekly_title,
      w.floor_text     as floor_text,
      w.ceiling_text   as ceiling_text,
      c.achieved_level as achieved_level,
      c.note           as note,
      c.attachment_url as attachment_url,
      c.submitted_at   as submitted_at,
      s.gedaan         as approvals_done,
      s.nodig          as approvals_required
    from completions c
    join weekly_goals w on w.id = c.weekly_goal_id
    join goals g on g.id = w.goal_id
    join profiles p on p.id = g.owner_id
    join lateral (
      select l.group_id
      from goal_group_links l
      join group_members m on m.group_id = l.group_id
      where l.goal_id = g.id
        and m.user_id = auth.uid()
        and m.status <> 'inactive'
      order by l.linked_at asc
      limit 1
    ) k on true
    join lateral (
      select
        (select count(*)::int
           from completion_approvals a
          where a.completion_id = c.id
            and a.group_id      = k.group_id
            and a.status        = 'approved'
            and not exists (
              select 1 from approval_withdrawals x where x.approval_id = a.id
            )) as gedaan,
        coalesce(
          (select r.approvals_required::int
             from completion_approval_rules r
            where r.completion_id = c.id
              and r.group_id      = k.group_id),
          vereiste_goedkeuringen(k.group_id, g.owner_id)::int
        ) as nodig
    ) s on true
    where c.superseded_by is null
      and w.status = 'pending'
      and c.user_id <> auth.uid()
      and not exists (
        select 1 from completion_approvals a
        where a.completion_id = c.id
          and a.approver_id = auth.uid()
          -- Een ingetrokken oordeel telt niet als oordeel (Q-TODO A19).
          and not exists (
            select 1 from approval_withdrawals x where x.approval_id = a.id
          )
      )
  )
  select
    q.completion_id,
    q.weekly_goal_id,
    q.group_id,
    q.owner_id,
    q.owner_name,
    q.owner_avatar,
    q.goal_title,
    q.weekly_title,
    q.floor_text,
    q.ceiling_text,
    q.achieved_level,
    q.note,
    q.attachment_url,
    q.submitted_at,
    q.approvals_done,
    q.approvals_required,
    (select count(*) from wachtrij) as total_open
  from wachtrij q
  where
    p_na_at is null
    or p_na_id is null
    or (q.submitted_at, q.completion_id) > (p_na_at, p_na_id)
  order by q.submitted_at asc, q.completion_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50));
$function$;


revoke execute on function public.openstaande_beoordelingen(integer, timestamptz, uuid) from public, anon, authenticated;
grant  execute on function public.openstaande_beoordelingen(integer, timestamptz, uuid) to authenticated;
