-- 0029_inactief_lid_verliest_toegang.sql — Q-TODO A18
--
-- ROLLBACK-PAD:
--   -- de vier helpers uit 0002_functions_triggers.sql opnieuw uitvoeren
--   -- guard_group_member_update() uit 0006_close_rls_gaps.sql opnieuw uitvoeren
--   -- groups_update, groups_delete, group_members_update en group_members_delete
--   -- uit 0003_rls.sql opnieuw uitvoeren
--
-- Besluit van Quinten (Q-TODO A18, 18-08-2026):
--   "Een inactief lid mag de groep nooit verwijderen. De geschiedenis van een
--    uitgezet lid blijft behouden."
--
-- ⚠️ Toegang intrekken mag, geschiedenis herschrijven niet. Deze migratie raakt
--    daarom geen enkele rij: `chain_links`, `week_reviews`, `completions`,
--    `chat_messages` en `points_ledger` van een uitgezet lid blijven staan, en
--    blijven voor de groep leesbaar. Wat verdwijnt is uitsluitend wat de
--    uitgezette persoon zélf nog kan.
--
-- ⚠️ Alleen `inactive`. `paused` is een zelfgekozen pauze en geen moderatie; wie
--    even niet meedoet, hoort zijn groep gewoon te kunnen lezen. Zou `paused`
--    hier meelopen, dan is een adempauze nemen hetzelfde als eruit gezet worden.
--
-- ⚠️ Er waren drie routes terug naar binnen, niet één. `is_group_member()` die
--    alleen naar het bestaan van de rij keek was de bekende (A18 zelf); de
--    andere twee zijn er tijdens deze migratie bij gevonden en zijn ernstiger,
--    want ze herstellen het lidmaatschap in plaats van het te omzeilen:
--
--      1. `guard_group_member_update()` zette `role`, `group_id`, `user_id` en
--         `joined_at` terug voor een niet-beheerder, maar `status` niet. Eén
--         PATCH op je eigen rij en je stond weer op 'active'.
--      2. `group_members_delete` staat `user_id = auth.uid()` toe. Je eigen rij
--         weggooien en daarna opnieuw toetreden met de code die je nog had,
--         leverde een schone rij op — `join_group_with_code` weigert alleen het
--         heractiveren van een bestaande inactieve rij.
--
--    Dat is dezelfde vorm als de bevinding van 0023: het slot zat op de deur en
--    het raam ernaast stond open.

-- ---------------------------------------------------------------------------
-- 1. De vier helpers: een inactief lidmaatschap telt niet meer als lidmaatschap
-- ---------------------------------------------------------------------------
--
-- ⚠️ Deze vier zitten onder vrijwel elke policy in het schema. Dat is precies de
--    bedoeling: de eis "een uitgezet lid leest niets meer" hoort op één plek te
--    staan en niet in dertig policies overgetypt te worden.
--
-- ⚠️ Alleen de kant van de kíjker wordt afgeknepen. `shares_group_with_goal`
--    kijkt of *jij* een groep deelt met dit doel; of de eigenaar ervan
--    inmiddels uitgezet is, staat daar los van. Zou dat hier ook meelopen, dan
--    verdween het doel van een uitgezet lid uit het overzicht van de groep — en
--    dat is geschiedenis herschrijven.

create or replace function is_group_member(gid uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members
    where group_id = gid
      and user_id  = auth.uid()
      and status  <> 'inactive'
  );
$$;

comment on function is_group_member(uuid) is
  'Is de huidige gebruiker lid van deze groep? Een uitgezet lid (status '
  'inactive) telt niet mee — Q-TODO A18. SECURITY DEFINER tegen RLS-recursie.';

create or replace function is_group_admin(gid uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members
    where group_id = gid
      and user_id  = auth.uid()
      and role     = 'admin'
      and status  <> 'inactive'
  );
$$;

comment on function is_group_admin(uuid) is
  'Beheerder van deze groep? Een uitgezette beheerder is geen beheerder meer, '
  'en kan de groep dus niet verwijderen of de code roteren (Q-TODO A18).';

create or replace function shares_group_with_goal(g uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join group_members    m on m.group_id = l.group_id
    where l.goal_id = g
      and m.user_id = auth.uid()
      and m.status <> 'inactive'
  );
$$;

create or replace function shares_group_with_user(other uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid()
      and mine.status <> 'inactive'
      and theirs.user_id = other
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. De vier policies die het beheerderschap zelf uitschreven
-- ---------------------------------------------------------------------------
--
-- ⚠️ Deze vier deden hun eigen `exists (... role = 'admin')` in plaats van
--    `is_group_admin()` aan te roepen. Daardoor liep de reparatie hierboven er
--    volledig langsheen — en het is precies de policy `groups_delete` waar het
--    besluit met naam over gaat. Eén bron van waarheid, ook als het duurder
--    leest.

drop policy if exists groups_update on groups;
create policy groups_update on groups for update to authenticated
  using (is_group_admin(id))
  with check (is_group_admin(id));

drop policy if exists groups_delete on groups;
create policy groups_delete on groups for delete to authenticated
  using (is_group_admin(id));

drop policy if exists group_members_update on group_members;
create policy group_members_update on group_members for update to authenticated
  using (user_id = auth.uid() or is_group_admin(group_id))
  with check (user_id = auth.uid() or is_group_admin(group_id));

-- ⚠️ `user_id = auth.uid()` blijft staan: je eigen lidmaatschap opzeggen hoort
--    te mogen. Maar niet als je uitgezet bent — dan is het geen vertrek maar het
--    wissen van het bewijs dat je eruit gezet bent, gevolgd door opnieuw
--    toetreden met dezelfde code.
drop policy if exists group_members_delete on group_members;
create policy group_members_delete on group_members for delete to authenticated
  using (
    (user_id = auth.uid() and status <> 'inactive')
    or is_group_admin(group_id)
  );

-- ---------------------------------------------------------------------------
-- 3. `status` is geen kolom die je over jezelf mag zetten
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dezelfde les als 0006, 0010, 0019 en 0023, nu voor de vijfde keer: RLS kan
--    geen kolommen beperken. De policy hierboven zegt "je mag je eigen rij
--    bijwerken" en dat klopt — je mag alleen niet je eigen straf intrekken. Dat
--    onderscheid is een trigger, geen policy.
--
-- ⚠️ Vandaag schrijft geen enkel scherm deze kolom, dus dit breekt niets. Komt
--    er ooit een zelfgekozen pauze ('paused'), dan hoort die via een RPC te
--    lopen die de overgang toetst — niet via een open UPDATE op de kolom.

create or replace function guard_group_member_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- ⚠️ Rechtstreeks op de tabel en niet via `is_group_admin()`: die geeft sinds
  --    deze migratie `false` voor een uitgezette beheerder, en dat is hier ook
  --    precies wat we willen — maar de bedoeling moet leesbaar blijven, dus de
  --    voorwaarde staat er uitgeschreven bij.
  if exists (
    select 1 from group_members m
    where m.group_id = old.group_id
      and m.user_id  = auth.uid()
      and m.role     = 'admin'
      and m.status  <> 'inactive'
  ) then
    new.group_id := old.group_id;
    new.user_id  := old.user_id;
    return new;
  end if;

  new.role      := old.role;
  new.status    := old.status;
  new.group_id  := old.group_id;
  new.user_id   := old.user_id;
  new.joined_at := old.joined_at;

  return new;
end;
$$;

comment on function guard_group_member_update() is
  'Een niet-beheerder mag zijn eigen rij aanraken maar er niets aan veranderen: '
  'rol, status, groep, gebruiker en toetredingsmoment gaan terug naar de oude '
  'waarde. Zonder de regel voor `status` kon een uitgezet lid zichzelf '
  'heractiveren (Q-TODO A18).';

revoke all on function guard_group_member_update() from public, anon, authenticated;
