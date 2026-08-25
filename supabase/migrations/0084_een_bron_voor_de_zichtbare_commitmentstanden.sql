-- 0084_een_bron_voor_de_zichtbare_commitmentstanden.sql — drie kopieën van één lijst
--
-- ROLLBACK-PAD:
--   drop policy if exists commitments_select on public.commitments;
--   create policy commitments_select on public.commitments
--     for select to authenticated
--     using (
--       exists (select 1 from goals g where g.id = commitments.goal_id and g.owner_id = auth.uid())
--       or (beneficiary_group_id is not null
--           and status in ('unlocked', 'due', 'resolved')
--           and is_group_member(beneficiary_group_id))
--     );
--   -- en verwijder_doel(uuid) opnieuw neerzetten met de literale lijst
--   -- ('unlocked', 'due', 'resolved') op de plek van de functieaanroep.
--   -- ⚠️ Niet het lichaam uit 0058 terugzetten: dat is ouder dan de
--   --    bedenktijd-toets die er sindsdien in staat.
--   drop function if exists commitment_zichtbaar_voor_groep();
--
-- ---------------------------------------------------------------------------
-- Wat er open stond
-- ---------------------------------------------------------------------------
--
-- Migratie 0058 sloot de bevinding "een verschuldigd commitment verdwijnt met het
-- doel", en schreef er zelf een nieuwe onder: **drie kopieën van één lijst; als
-- er een vierde bij komt hoort er een gedeelde bron te zijn.**
--
--   1. `commitments_select` — de stand waarop de begunstigde groep meeleest
--   2. `verwijder_doel()` — de stand die weggooien blokkeert
--   3. `isAfgegaan()` in `src/modules/commitments/stand.ts` — dezelfde voor de UI
--
-- ⚠️ **De eerste twee moeten gelijk zijn, en dat is geen netheid.** Loopt 2
--    achter op 1, dan wist een DELETE op het doel een straf die de groep al
--    gelezen heeft — precies de bevinding die 0058 dichtte, maar dan via een
--    nieuwe stand in plaats van via de cascade. Dat is de vorm van onwrikbare
--    regel 18: elk onderdeel klopt en de naad lekt.
--
-- ⚠️ En het is dezelfde vorm als 0032/0034, waar de app-lijst achterbleef op de
--    CHECK en de test de app-lijst met **zichzelf** vergeleek. Daarom is dit een
--    functie en geen commentaar: één plek die de waarheid draagt, en twee
--    plekken die hem aanroepen in plaats van hem overschrijven.
--
-- ⚠️ De derde kopie kan geen SQL aanroepen — die staat in de client. Die blijft
--    dus een kopie, maar wordt sinds deze migratie tegen de bron getoetst in
--    plaats van tegen zichzelf: zie `tests/rls/epic9.test.ts`.

create or replace function commitment_zichtbaar_voor_groep()
  returns text[]
  language sql
  immutable
  parallel safe
as $$
  select array['unlocked', 'due', 'resolved']::text[];
$$;

comment on function commitment_zichtbaar_voor_groep() is
  'De commitmentstanden waarop de begunstigde groep meeleest — domeinregel 11. '
  'De enige bron: commitments_select gebruikt hem om leesrecht te geven en '
  'verwijder_doel() om weggooien te blokkeren, zodat die twee niet uit elkaar '
  'kunnen lopen. isAfgegaan() in de client is de derde kopie en wordt hiertegen '
  'getoetst. ⚠️ Komt er een stand bij, dan verandert hij hier en nergens anders '
  '— en lees eerst beslisdocument 003 over wat de groep dan te zien krijgt.';

-- ⚠️ Geen `security definer`. Deze functie leest niets en beslist niets; hij
--    geeft een constante lijst terug. `immutable` maakt hem bovendien inlinebaar,
--    zodat de policy er niets van merkt.
revoke all on function commitment_zichtbaar_voor_groep() from public;
grant execute on function commitment_zichtbaar_voor_groep() to anon, authenticated, service_role;

drop policy if exists commitments_select on public.commitments;

create policy commitments_select on public.commitments
  for select to authenticated
  using (
    exists (select 1 from goals g where g.id = commitments.goal_id and g.owner_id = auth.uid())
    or (
      beneficiary_group_id is not null
      and status = any (commitment_zichtbaar_voor_groep())
      and is_group_member(beneficiary_group_id)
    )
  );

-- ---------------------------------------------------------------------------
-- `verwijder_doel()` leest nu dezelfde lijst
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het lichaam is letterlijk overgenomen uit `pg_get_functiondef()` en niet
--    uit migratie 0058**, op de ene regel na waar de lijst stond. Dat is geen
--    omslachtigheid: de gedéployde functie was strenger dan het migratiebestand
--    deed vermoeden — er staat een `bedenktijd()`-toets in en de reden heet
--    `not_logged_in` en niet `not_signed_in`. Uit het bestand overschrijven had
--    die toets stil teruggedraaid, precies zoals 0075 dat deed door van de
--    verkeerde voorganger te kopiëren. `pg_get_functiondef()` is de waarheid.

create or replace function verwijder_doel(p_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  g goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  select g2.* into g from goals g2 where g2.id = p_goal_id and g2.owner_id = auth.uid();

  if g.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if g.created_at < now() - bedenktijd() then
    return jsonb_build_object('ok', false, 'reason', 'te_oud');
  end if;

  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'gedeeld_met_groep');
  end if;

  if exists (select 1 from weekly_goals w where w.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_weekdoelen');
  end if;

  if exists (select 1 from points_ledger p where p.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_punten');
  end if;

  -- 0058, en sinds 0084 uit de gedeelde bron in plaats van een derde kopie.
  if exists (
    select 1 from commitments c
     where c.goal_id = p_goal_id
       and c.status = any (commitment_zichtbaar_voor_groep())
  ) then
    return jsonb_build_object('ok', false, 'reason', 'commitment_in_werking');
  end if;

  delete from goals where id = p_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function verwijder_doel(uuid) is
  'Verwijdert een doel dat nog nergens aan vastzit en binnen de bedenktijd valt. '
  'Weigert zodra er een commitment staat in een stand uit '
  'commitment_zichtbaar_voor_groep(): dan heeft de begunstigde groep het al '
  'gelezen, en geschiedenis blijft staan (domeinregel 6 en 11).';
