-- 0305_een_gedempte_groep_zwijgt_voor_jou_en_voor_niemand_anders.sql —
-- `groep_demping`: een groep dempen is een voorkeur van de ontvanger, en
-- `te_beoordelen_voor()` slaat een gedempte groep over (QS8-752).
--
-- ROLLBACK-PAD:
--   -- 1. de functie terug naar de vorm van 0054 (zonder de demping-eis):
--   create or replace function public.te_beoordelen_voor(p_user_id uuid)
--   returns table(completion_id uuid, owner_id uuid, owner_name text)
--   language sql stable security definer set search_path to 'public', 'pg_temp'
--   as $f$
--     select distinct c.id, g.owner_id, p.display_name
--     from completions c
--     join weekly_goals w on w.id = c.weekly_goal_id
--     join goals g        on g.id = w.goal_id
--     join profiles p     on p.id = g.owner_id
--     join goal_group_links l on l.goal_id = g.id
--     join group_members m    on m.group_id = l.group_id
--     where c.superseded_by is null and w.status = 'pending'
--       and m.user_id = p_user_id and m.status = 'active'
--       and g.owner_id <> p_user_id
--       and not exists (select 1 from completion_approvals a
--                       where a.completion_id = c.id and a.approver_id = p_user_id)
--       and exists (select 1 from groups gr
--                   where gr.id = l.group_id and gr.status = 'active')
--     limit 50;
--   $f$;
--   revoke all on function public.te_beoordelen_voor(uuid) from public, anon, authenticated;
--   -- 2. de tabel:
--   drop table if exists public.groep_demping;
--
-- ⚠️ De tabel is nieuw en dus leeg; `drop table` valt hier niet onder grens 2
--    van de beslisbevoegdheid. Wordt dit teruggedraaid nádat er dempingen in
--    staan, dan is dat een andere handeling met een `pg_dump` ervoor — en wat
--    er dan verloren gaat is een meldingsvoorkeur, geen geschiedenis; wie
--    gedempt had, krijgt na het terugdraaien weer alle meldingen (de luide
--    kant, nooit de stille).
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): deze
--    migratie bevat `grant`, `revoke`, `policy` en een herdefinitie van een
--    functie, en wordt dus niet door een bouwsessie op productie gezet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-752 (epic QS8-721, patroon uit scherm s14): het groepsgeluid gaat uit,
-- maar wat over jouw eigen werk gaat blijft binnenkomen.
--
-- 📏 Nagemeten in de code vóór het ontwerp (19-11-2026): er is precies **één**
--    meldingsstroom die per groep verschilt — `approval_request`, "een buddy
--    wacht op jou", gevoed door `te_beoordelen_voor()` (0054, de enige
--    definitie). Reacties en applaus als tabel of als pushsoort bestaan niet;
--    "goed nieuws over jezelf" is `approval_received`, en die leest
--    `completion_approvals` op `subject_id` zonder enige groepstak. Er is geen
--    groepsfeed-melding naast `approval_request`: de chat is een scherm dat je
--    opent en geen stroom die je belt. Wat dit issue dempt is dus wat er is,
--    en een toekomstige groepsmelding gaat door dezelfde deur of faalt de test.
--
-- ---------------------------------------------------------------------------
-- Wat hier met opzet níet staat
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Geen kolom op `group_members`.** `group_members_select` laat elk lid de
--    rijen van zijn groep lezen, en RLS kan geen kolommen beperken: een kolom
--    `gedempt` daar is "veilig" zolang niemand hem in de grant laat staan, en
--    dat is precies de veiligheid die stil verdwijnt. Wie dempt wordt anders
--    aan de groep getoond als iemand die zich terugtrekt (domeinregel 7). Een
--    aparte tabel heeft geen groepstak en dus niets om te vergeten — dezelfde
--    keuze als 0303.
--
-- ⚠️ **Geen systeembericht en geen nieuw event.** Dempen zegt de groep niets;
--    `chat_messages_system_event_bekend` blijft ongemoeid.
--
-- ⚠️ **Dempen raakt geen lidmaatschap, punt, reeks of goedkeuringsrecht.** De
--    tabel is alleen een filter op wie er gebeld wordt. `openstaande_beoordelingen()`
--    (de lijst in de app) en elke goedkeuringsregel blijven zoals ze waren: wie
--    dempt kan nog steeds goedkeuren, hij wordt er alleen niet voor gebeld.
--
-- ⚠️ **Geen realtime.** De tabel komt niet in de publicatie en krijgt geen
--    `REPLICA IDENTITY FULL` (`realtime_bewaking()`, 0027).
--
-- ⚠️ **Geen UPDATE-grant.** Een demping is er of niet; "bewerken" bestaat niet,
--    en `gedempt_op` is dan altijd het moment waarop je hem zette. De
--    UPDATE-policy staat er wel (onwrikbare regel 1: een ontbrekende policy is
--    een ongestelde vraag), maar zonder grant is hij dicht.
--
-- ---------------------------------------------------------------------------
-- 1. groep_demping
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De foreign key loopt naar `group_members (group_id, user_id)` en niet
--    naar `groups` en `profiles` apart.** Dat doet drie dingen tegelijk zonder
--    dat een policy ze hoeft te kennen: je kunt alleen een groep dempen waar je
--    lid van bent (een vreemde krijgt 23503 en leert daarmee niet of de groep
--    bestaat — dezelfde fout als een onbestaande groep), een demping verdwijnt
--    mee met je lidmaatschap (verlaat je de groep en kom je terug, dan begin je
--    ongedempt: de luide kant), en een verwijderd account of een verwijderde
--    groep neemt de rij mee. De FK-controle leest `group_members` als
--    tabeleigenaar en omzeilt dus de RLS van die tabel; er lekt niets.
--
-- ⚠️ **De PK is (user_id, group_id)** — één demping per paar, afgedwongen — en
--    levert de index op de leeskant (`where user_id = …`). De tweede index
--    dekt de FK-kant: een groep die verdwijnt moet zijn dempingen kunnen vinden
--    (onwrikbare regel 11).
create table if not exists public.groep_demping (
  user_id     uuid        not null,
  group_id    uuid        not null,
  gedempt_op  timestamptz not null default now(),

  primary key (user_id, group_id),
  constraint groep_demping_lid_van_groep
    foreign key (group_id, user_id)
    references public.group_members (group_id, user_id)
    on delete cascade
);

create index if not exists groep_demping_groep_idx
  on public.groep_demping (group_id, user_id);

alter table public.groep_demping enable row level security;

-- ⚠️ **Elke policy is `user_id = (select auth.uid())`; de insert eist daarbij
--    lidmaatschap van déze groep (`is_group_member()`).** Dat is geen groepstak
--    die iets zichtbaar maakt maar een schrijfvoorwaarde: een foreign key wordt
--    pas aan het eind van het statement gecontroleerd, dus een bulk met
--    willekeurige `group_id`'s schrijft eerst en weigert daarna (de opzwelling
--    die 0200 mat). De policy weigert per rij vóór het schrijven (42501).
--    Geen groepstak, ook niet voor een beheerder en ook niet in een open groep:
--    "wie dempt" is een eigenschap van de ontvanger en nooit iets dat een ander
--    mag afleiden (acceptatiecriterium 2).
drop policy if exists groep_demping_select on public.groep_demping;
create policy groep_demping_select on public.groep_demping
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists groep_demping_insert on public.groep_demping;
create policy groep_demping_insert on public.groep_demping
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));

drop policy if exists groep_demping_update on public.groep_demping;
create policy groep_demping_update on public.groep_demping
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists groep_demping_delete on public.groep_demping;
create policy groep_demping_delete on public.groep_demping
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ⚠️ **`from public, anon, authenticated` en niet `from public, anon`.** Zie
--    docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md.
revoke all on table public.groep_demping from public, anon, authenticated;
grant select on table public.groep_demping to authenticated;
-- ⚠️ `gedempt_op` staat in geen enkele grant: de database zet het moment.
grant insert (user_id, group_id) on table public.groep_demping to authenticated;
grant delete on table public.groep_demping to authenticated;
-- ⚠️ Geen `grant update`: zie de toelichting bovenaan.

-- ---------------------------------------------------------------------------
-- 2. te_beoordelen_voor(): een gedempte groep belt niet
-- ---------------------------------------------------------------------------
--
-- Dit is de databasekant van het issue ("geen tweede pad naast RLS"): de
-- meldingenjob draait als `service_role`, leest niets van de UI, en krijgt hier
-- al gefilterd terug wie er gebeld mag worden. Een job die vergeet te filteren
-- kan dus niet bellen over een gedempte groep, omdat de functie hem niet geeft.
--
-- ⚠️ **De eis zit in de join en niet achteraf.** Een voltooiing die aan twee
--    groepen hangt waarvan je er één dempt, blijft melden zolang er een
--    ongedempte groep over is: de join levert dan nog een rij, en `distinct`
--    maakt er één van. Demp je beide, dan is er geen rij. Een filter op de
--    uitkomst gaf het omgekeerde: dempen van één groep zou de ander mee
--    stilzetten, en de gebruiker mist een goedkeuringsverzoek dat hij wél wilde.
--
-- ⚠️ **`approval_received` en de getuigemeldingen staan hier niet in.** Wat over
--    jouw eigen werk gaat (`completion_approvals` op `subject_id`) en wat je als
--    persoon is toevertrouwd (`getuigenissen_voor()`) heeft geen groepstak en
--    krijgt er hier geen. Dat is het onderscheid dat dit issue maakt: het
--    groepsgeluid gaat uit, directe steun blijft.
--
-- De rest van het lichaam is woordelijk 0054. Het register-in-functielichaam
-- van CLAUDE.md ("kopieer het lichaam van main") geldt hier: 0054 is nog steeds
-- de enige definitie (📏 gemeten 19-11-2026 met grep op `function public.te_beoordelen_voor`).
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
    and m.user_id = p_user_id
    and m.status = 'active'
    and g.owner_id <> p_user_id
    and not exists (
      select 1 from completion_approvals a
      where a.completion_id = c.id and a.approver_id = p_user_id
    )
    and exists (
      select 1 from groups gr
      where gr.id = l.group_id and gr.status = 'active'
    )
    -- QS8-752: niet via een groep die deze gebruiker gedempt heeft.
    and not exists (
      select 1 from groep_demping d
      where d.user_id = p_user_id and d.group_id = l.group_id
    )
  limit 50;
$$;

revoke all on function public.te_beoordelen_voor(uuid) from public, anon, authenticated;
