-- 0118_een_grant_die_niets_geeft_hoort_weg.sql — de generieke vorm van 0101
--
-- ROLLBACK-PAD:
--   grant insert, update, delete on public.ai_jobs, public.approval_withdrawals,
--     public.breathers, public.commitment_events, public.completion_approvals,
--     public.completions, public.daily_moves, public.deadline_requests,
--     public.goal_events, public.goal_group_links, public.goal_interviews,
--     public.group_members, public.invite_events, public.milestones,
--     public.profiles, public.week_review_replies, public.week_reviews to anon;
--   grant update, delete on public.chat_messages to anon;
--   grant insert, delete on public.commitments, public.groups to anon;
--   grant insert on public.goals to anon;
--   grant insert, update, delete on public.ai_jobs, public.commitment_events,
--     public.invite_events to authenticated;
--   grant update, delete on public.completion_approvals, public.completions,
--     public.goal_events to authenticated;
--   grant update on public.goal_group_links to authenticated;
--   grant delete on public.commitments, public.profiles to authenticated;
--   -- en de bewaking terug naar zijn vaste lijst:
--   create or replace function public.schrijfrechten_bewaking() ... (zie 0101)
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0101 trok de schrijfrechten in op vier tabellen die alleen `service_role`
-- schrijft, en zette er `schrijfrechten_bewaking()` naast. Die bewaking draagt
-- **een hardgecodeerde lijst van vier tabelnamen**, en dat is precies de klasse
-- die 0101 kwam voorkomen: `alter default privileges` van Supabase deelt élke
-- nieuwe tabel in `public` de volle set uit aan `anon` en `authenticated`, dus
-- de volgende tabel krijgt ze weer en de bewaking kijkt de andere kant op.
--
-- De controleronde van 28-08 vroeg de vraag daarom generiek: welke schrijfrechten
-- geven vandaag niets, omdat er geen enkele policy bij hoort? Gemeten op de
-- lokale stack én op productie, met exact dezelfde uitkomst:
--
--   * `anon`          — 58 rechten over 21 tabellen
--   * `authenticated` — 18 rechten over  9 tabellen
--
-- ⚠️ **Voor `anon` is het bereik de hele schema, en dat is geen aanname maar een
--    meting: er is geen enkele policy in `public` die `anon` of `public` als rol
--    noemt.** Nul, op beide databases. Elke policy staat op `authenticated` of op
--    `service_role`. Een schrijfrecht voor `anon` kan dus per definitie niets
--    doen — vandaag niet en bij geen enkele rij.
--
-- ⚠️ **De gegevens waren veilig, en dat is niet de reden om het te laten staan.**
--    RLS staat op alle 34 tabellen aan (gemeten), dus de rechten zijn inert. Maar
--    ze zijn inert door een tweede slot, niet door zichzelf: valt er ooit één
--    policy verkeerd om, of komt er een tabel bij waar iemand RLS vergeet, dan is
--    het verschil tussen "dicht" en "open voor een niet-ingelogde beller" precies
--    dit recht. En zoals 0101 al opschreef: voor UPDATE en DELETE is de weigering
--    zonder dit stil — HTTP 204 en een ongewijzigde tabel — dus een test die op
--    een foutcode rekent, wordt er groen van zonder iets te bewijzen.
--
-- ---------------------------------------------------------------------------
-- Wat dit niet raakt, en waarom dat gemeten is en niet aangenomen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Eén van de achttien hield een wérkende knop overeind, en dat is de vondst
--    van deze migratie.** `koppelDoelAanGroep()` deed een `upsert` op
--    `goal_group_links`, en PostgREST vertaalt dat naar `on conflict do update`.
--    Zo'n opdracht eist het UPDATE-tabelrecht **al bij het plannen**, ook als er
--    geen conflict is. Op een echte Postgres 16 nagedaan met een rol zonder
--    UPDATE: `permission denied for table`. Het intrekken zou het koppelen van
--    een doel aan een groep dus in zijn geheel gesloopt hebben — niet alleen het
--    randgeval.
--
-- ⚠️ **En het randgeval was al stuk.** Met het recht maar zonder UPDATE-policy
--    weigert Postgres bij een écht conflict met `new row violates row-level
--    security policy`. Een doel voor de tweede keer aan dezelfde groep koppelen
--    gaf dus "koppelen mislukt" terwijl de koppeling er gewoon stond. Ook dat is
--    nagedaan en niet beredeneerd.
--
--    De reparatie zit in `src/modules/buddies/api.ts`: `ignoreDuplicates: true`,
--    oftewel `on conflict do nothing`. Die vorm heeft het UPDATE-recht niet nodig
--    en gaat over een bestaande koppeling heen zonder fout — ook dat gemeten.
--
-- ⚠️ **Volgorde bij het uitrollen: eerst de nieuwe bundel, dan deze migratie.**
--    De gedeployde webbundel op `goalbuddies.q-projects.tech` doet nog de oude
--    upsert. Draait deze migratie op productie terwijl die bundel er staat, dan
--    is koppelen stuk tot `npm run deploy` gedraaid heeft.
--
-- Voor de overige zeventien rechten is nagelopen wie er schrijft. `ai_jobs`
-- wordt bijgewerkt in de Edge Function `doelcoach` (service-role-sleutel),
-- `goal_events` krijgt een INSERT uit `src/modules/goals/api.ts` — en INSERT
-- blijft staan, want daar hoort een policy bij. Verder staat er in `src/` en
-- `app/` geen enkele schrijfactie op de ingetrokken combinaties.
--
-- ---------------------------------------------------------------------------

-- `anon` schrijft niets, nergens. Er is geen policy die hem noemt.
revoke insert, update, delete on public.ai_jobs              from anon;
revoke insert, update, delete on public.approval_withdrawals from anon;
revoke insert, update, delete on public.breathers            from anon;
revoke insert, update, delete on public.commitment_events    from anon;
revoke insert, update, delete on public.commitments          from anon;
revoke insert, update, delete on public.completion_approvals from anon;
revoke insert, update, delete on public.completions          from anon;
revoke insert, update, delete on public.chat_messages        from anon;
revoke insert, update, delete on public.daily_moves          from anon;
revoke insert, update, delete on public.deadline_requests    from anon;
revoke insert, update, delete on public.goal_events          from anon;
revoke insert, update, delete on public.goal_group_links     from anon;
revoke insert, update, delete on public.goal_interviews      from anon;
revoke insert, update, delete on public.goals                from anon;
revoke insert, update, delete on public.group_members        from anon;
revoke insert, update, delete on public.groups               from anon;
revoke insert, update, delete on public.invite_events        from anon;
revoke insert, update, delete on public.milestones           from anon;
revoke insert, update, delete on public.profiles             from anon;
revoke insert, update, delete on public.week_review_replies  from anon;
revoke insert, update, delete on public.week_reviews         from anon;

-- `authenticated`: alleen de combinaties waar geen policy bij hoort. Wat hier
-- níét staat, staat er bewust niet — `goal_events` houdt zijn INSERT, `profiles`
-- en `commitments` houden hun UPDATE.
revoke insert, update, delete on public.ai_jobs              from authenticated;
revoke insert, update, delete on public.commitment_events    from authenticated;
revoke insert, update, delete on public.invite_events        from authenticated;
revoke        update, delete on public.completion_approvals  from authenticated;
revoke        update, delete on public.completions           from authenticated;
revoke        update, delete on public.goal_events           from authenticated;
revoke        update         on public.goal_group_links      from authenticated;
revoke               delete  on public.commitments           from authenticated;
revoke               delete  on public.profiles              from authenticated;

-- ---------------------------------------------------------------------------
-- De bewaking, nu zonder lijst
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De lijst wás het probleem.** 0101 zette vier tabelnamen in de functie,
--    met als reden dat een besluit in code hoort en niet in data. Dat klopt voor
--    een uitzondering (zoals `invite_preview` in `definer_bewaking()`), maar niet
--    voor een regel: hier is de regel zélf uit te rekenen, en dan is elke lijst
--    een plek waar de volgende tabel ontbreekt.
--
-- De regel: een schrijfrecht voor `anon` of `authenticated` waar geen permissieve
-- policy voor diezelfde rol en opdracht bij hoort, geeft niets — en hoort dus weg.
-- `has_table_privilege()` en niet `information_schema`, want dat eerste telt ook
-- rechten die via een rollidmaatschap binnenkomen.
--
-- ⚠️ Een policy `for all` dekt INSERT, UPDATE én DELETE; een policy `to public`
--    geldt voor elke rol. Allebei tellen mee, anders meldt de bewaking iets dat
--    wél werkt en leert hij je zichzelf te negeren.

create or replace function public.schrijfrechten_bewaking()
returns table (tabel text, rol text, recht text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with rechten as (
    select c.relname::text as tabel, r.rol, p.recht
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    cross join (select unnest(array['anon', 'authenticated']) as rol) r
    cross join (select unnest(array['INSERT', 'UPDATE', 'DELETE']) as recht) p
    where c.relkind in ('r', 'v', 'm', 'p')
      and has_table_privilege(r.rol, c.oid, p.recht)
  ),
  policies as (
    select c.relname::text as tabel,
           case pol.polcmd
             when 'a' then 'INSERT'
             when 'w' then 'UPDATE'
             when 'd' then 'DELETE'
             when 'r' then 'SELECT'
             else 'ALL'
           end as opdracht,
           array(
             select case when o = 0 then 'public'
                         else (select rolname::text from pg_roles where oid = o) end
             from unnest(pol.polroles) o
           ) as rollen
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where pol.polpermissive
  )
  select r.tabel, r.rol, r.recht
  from rechten r
  where not exists (
    select 1
    from policies p
    where p.tabel = r.tabel
      and (p.opdracht = r.recht or p.opdracht = 'ALL')
      and ('public' = any(p.rollen) or r.rol = any(p.rollen))
  )
  order by 1, 2, 3;
$$;

revoke all on function public.schrijfrechten_bewaking() from public, anon, authenticated;
grant execute on function public.schrijfrechten_bewaking() to service_role;
