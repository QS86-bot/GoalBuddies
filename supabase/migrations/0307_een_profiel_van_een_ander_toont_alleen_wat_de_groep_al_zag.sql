-- 0307_een_profiel_van_een_ander_toont_alleen_wat_de_groep_al_zag.sql — het profiel van een groepsgenoot, met een leesgrens die in de database woont (QS8-750).
--
-- ROLLBACK-PAD:
--   drop function if exists public.profiel_van_lid(uuid);
--   drop function if exists public.profiel_doelen_van_lid(uuid, integer, integer);
--   drop function if exists public.profiel_groepen_van_lid(uuid);
--   -- n.v.t. voor data: er is geen tabel, kolom of grant bij gekomen. Een
--   -- rollback verwijdert alleen de drie leesfuncties; niets wordt gewist.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Fase 4.2 van epic QS8-721: een profiel met tabs voor een ánder. Dit is een
-- nieuw groepszichtbaar oppervlak (rij 57 in
-- `docs/decisions/002-domeinregel7-oppervlakken.md`), dus het antwoord is
-- *beschermd*: de functies hieronder geven een groepsgenoot **niet meer dan
-- `group_overview()` en de ledenlijst hem al geven**, in een ándere vorm.
--
-- ⚠️⚠️ **De grens zit hier en niet in het scherm.** RLS kan geen kolommen
--    beperken, en `goals`/`milestones` dragen kolommen (streefdatum, notities,
--    weekstatus, `best_streak`) die een groepsgenoot van een gekoppeld doel via
--    de tabel wél kan lezen maar die een *profiel* niet hoort te bundelen.
--    Elke functie is `security invoker` met een **expliciete kolomlijst** (alles wat ze geven is voor de kijker al leesbaar via RLS; een invoker kan per constructie niet méér geven), en
--    elke functie begint met dezelfde vraag: *deel ik een actieve groep met
--    deze persoon?* Nee betekent nul rijen — geen fout, want een fout vertelt
--    wie bestaat.
--
-- ⚠️⚠️ **Wat een profiel van een ander níet bevat, en dat is de belofte:**
--    geen punten, geen XP, geen niveau, geen badges (rij 25), geen reeks en
--    geen `best_streak`, geen weekstatus, geen datum van wat dan ook, geen
--    streefdatum, geen "afgerond in week x", geen doelen die `archived` zijn
--    (opgeven is tegenslag), geen doelen die niet in een gedeelde groep staan
--    (rij 24), geen aantal groepen buiten de gedeelde. Statistieken en
--    prestaties bestaan voor een ander niet als tab — dat is een eigenschap van
--    deze functies, want ze geven daar niets over terug; de UI beperkt zich er
--    niet toe.
--
-- ⚠️ **Eén projectie, in beide standen.** Er is geen tak op
--    `groups.zichtbaarheid`: een open groep krijgt hier niets extra's (A41:
--    "open" is nooit "alles open", en voor een níeuw oppervlak is beschermd het
--    antwoord tot iemand het tegendeel besluit). Daarom ook geen
--    voortgangsdatum: een lijst met afrondingen op datum maakt van een gat in
--    de lijst een gemiste week.
--
-- ⚠️ **Mijlpaalaantallen zijn monotoon.** `milestones_done` kan alleen stijgen
--    en `dropped` telt in geen van beide (zoals `group_overview()`). Een
--    afgevallen mijlpaal is een stille bijstelling en geen zichtbaar verlies.
--
-- ⚠️ **Voor jezelf is het dezelfde projectie** ("zo ziet je groep je"): je ziet
--    je eigen profiel zoals een groepsgenoot het ziet, niet rijker. Je eigen
--    cijfers en prestaties staan op hun eigen schermen.
--
-- ⚠️ **Aandeeldoelen (QS8-649, rij 44) bestaan hier nog niet.** Zodra een
--    aandeel aan een teamgroep hangt, hoort het uit `profiel_doelen_van_lid()`
--    te blijven (besluit 21 van de zakelijke-organisatiebeslissing); dat is een
--    voorwaarde voor QS8-649 en staat bij rij 57.

-- ---------------------------------------------------------------------------
-- 1. Is deze persoon een groepsgenoot van de aanroeper? (of de aanroeper zelf)
-- ---------------------------------------------------------------------------
--
-- Geen aparte functie: `shares_group_with_user()` bestaat al en is dezelfde
-- toets als `profiles_select`. Wie dat een tweede keer uitschrijft, maakt twee
-- plekken die uit elkaar kunnen lopen. Hij eist beide kanten `status <>
-- 'inactive'`, dus een uitgezet of vertrokken lid verdwijnt direct.

-- ---------------------------------------------------------------------------
-- 2. De persoon zelf: naam en foto
-- ---------------------------------------------------------------------------

create or replace function public.profiel_van_lid(p_user uuid)
returns table (id uuid, display_name text, avatar_url text, ben_ik boolean)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ik uuid := (select auth.uid());
begin
  if v_ik is null then
    raise exception 'Niet ingelogd' using errcode = 'insufficient_privilege';
  end if;

  -- ⚠️ Nul rijen, geen fout, en dezelfde nul rijen voor "bestaat niet" als voor
  --    "geen groepsgenoot": het verschil zou een bestaanstoets op gebruikers-id's
  --    zijn.
  if p_user is null or (p_user <> v_ik and not public.shares_group_with_user(p_user)) then
    return;
  end if;

  return query
    select p.id, p.display_name, p.avatar_url, (p.id = v_ik)
      from public.profiles p
     where p.id = p_user;
end;
$$;

comment on function public.profiel_van_lid(uuid) is
  'Naam en foto van jezelf of een groepsgenoot; anders nul rijen. Dezelfde '
  'drie kolommen als profiles_select al geeft. QS8-750.';

revoke all on function public.profiel_van_lid(uuid) from public, anon, authenticated;
grant execute on function public.profiel_van_lid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De doelen: alleen wat in een gedeelde groep staat, alleen wat positief is
-- ---------------------------------------------------------------------------

create or replace function public.profiel_doelen_van_lid(
  p_user   uuid,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  goal_id          uuid,
  titel            text,
  categorie        text,
  voltooid         boolean,
  mijlpalen_totaal bigint,
  mijlpalen_klaar  bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ik    uuid := (select auth.uid());
  v_limit integer;
begin
  if v_ik is null then
    raise exception 'Niet ingelogd' using errcode = 'insufficient_privilege';
  end if;

  if p_user is null or (p_user <> v_ik and not public.shares_group_with_user(p_user)) then
    return;
  end if;

  -- Harde randen: een client die 10000 vraagt, krijgt 50.
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  return query
    select d.id,
           d.title,
           d.category,
           (d.status = 'completed'),
           (select count(*) from public.milestones ms
             where ms.goal_id = d.id and ms.status <> 'dropped'),
           (select count(*) from public.milestones ms
             where ms.goal_id = d.id and ms.status = 'done')
      from public.goals d
     where d.owner_id = p_user
       -- ⚠️ `archived` valt af: een doel dat je opgaf is tegenslag, en het zou
       --    alleen als *afwezigheid* zichtbaar zijn (rij 25: een ontbrekende rij
       --    is het signaal). `active` en `completed` zijn de twee positieve
       --    toestanden.
       and d.status in ('active', 'completed')
       -- ⚠️⚠️ **Een gedeelde groep, en niet "een groep van de eigenaar".** Een doel
       --    kan aan meerdere groepen hangen (rij 24). Hangt het aan A (waar de
       --    aanroeper niet in zit) en B (waar hij wel in zit), dan is het doel
       --    zichtbaar *omdat* het in B staat. Hangt het alleen aan A, dan niet.
       and exists (
         select 1
           from public.goal_group_links l
           join public.groups g on g.id = l.group_id and g.status <> 'archived'
           join public.group_members mine
             on mine.group_id = l.group_id
            and mine.user_id = v_ik
            and mine.status <> 'inactive'
           join public.group_members theirs
             on theirs.group_id = l.group_id
            and theirs.user_id = p_user
            and theirs.status <> 'inactive'
          where l.goal_id = d.id
       )
     -- Afgeronde doelen eerst, dan op naam. Geen datum in de volgorde: een
     -- volgorde op "laatst afgerond" is een datum die door de achterdeur komt.
     order by (d.status = 'completed') desc, lower(d.title), d.id
     limit v_limit
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.profiel_doelen_van_lid(uuid, integer, integer) is
  'De actieve en afgeronde doelen van jezelf of een groepsgenoot die aan een '
  'groep hangen die jullie delen: titel, categorie, afgerond ja/nee en twee '
  'mijlpaaltellers. Geen datums, reeks, punten of status van een week. '
  'Gepagineerd (max 50). QS8-750.';

revoke all on function public.profiel_doelen_van_lid(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.profiel_doelen_van_lid(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. De groepen: alleen de gedeelde, met naam
-- ---------------------------------------------------------------------------

create or replace function public.profiel_groepen_van_lid(p_user uuid)
returns table (group_id uuid, naam text, icoon text)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ik uuid := (select auth.uid());
begin
  if v_ik is null then
    raise exception 'Niet ingelogd' using errcode = 'insufficient_privilege';
  end if;

  if p_user is null or (p_user <> v_ik and not public.shares_group_with_user(p_user)) then
    return;
  end if;

  -- ⚠️ **Alleen groepen waar de aanroeper óók in zit.** Een groepsgenoot is niet
  --    verplicht te delen in welke andere groepen hij zit; zijn andere groepen
  --    zijn niet van jou (rij 24). Het plafond van 50 is er alleen omdat een
  --    lijst zonder plafond een regelovertreding is: je zit zelf nooit in meer
  --    dan een paar groepen die je deelt.
  return query
    select g.id, g.name, g.icon
      from public.groups g
      join public.group_members mine
        on mine.group_id = g.id and mine.user_id = v_ik and mine.status <> 'inactive'
      join public.group_members theirs
        on theirs.group_id = g.id and theirs.user_id = p_user and theirs.status <> 'inactive'
     where g.status <> 'archived'
     order by lower(g.name), g.id
     limit 50;
end;
$$;

comment on function public.profiel_groepen_van_lid(uuid) is
  'De actieve groepen die jij en deze persoon delen (of, voor jezelf, je eigen '
  'groepen): id, naam, icoon. Niets over groepen die niet gedeeld zijn. QS8-750.';

revoke all on function public.profiel_groepen_van_lid(uuid) from public, anon, authenticated;
grant execute on function public.profiel_groepen_van_lid(uuid) to authenticated;
