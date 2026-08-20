-- 0046_per_ongeluk_aangemaakt.sql — de bedenktijd (EPIC 8)
--
-- ROLLBACK-PAD:
--   drop function if exists verwijder_weekdoel(uuid);
--   drop function if exists verwijder_doel(uuid);
--   drop function if exists bedenktijd();
--   create policy goals_delete on public.goals for delete to authenticated
--     using (owner_id = auth.uid());
--   grant delete on public.goals to authenticated;
--   grant insert on public.goals to authenticated;
--
-- ⚠️ Waarom deze migratie bestaat. 0045 verving het verwijderen van een weekdoel
--    door afsluiten, en dat was voor het gat waar het om ging de juiste keuze —
--    maar het gooide ook de gewone reden om iets weg te gooien overboord. Je
--    typt een weekdoel dubbel, of je maakt hem aan onder het verkeerde doel. Dat
--    kostte je sinds 0045 een minpunt en waarschijnlijk je reeks, zonder weg
--    terug. Besluit van Quinten (19-08): **een per ongeluk aangemaakt weekdoel
--    moet je kunnen verwijderen, en datzelfde geldt voor een doel.**
--
-- ⚠️ De regel die "per ongeluk" van "ontsnappen" scheidt, is niet de status maar
--    de **leeftijd**. Een vergissing merk je meteen; een ontsnapping bedenk je
--    aan het eind van de week. Vandaar één gedeelde bedenktijd, en daarbovenop
--    de eis dat er nog niets met de rij gebeurd is.
--
--    Dat sluit de route die A40 dichtte netjes af: wie zondagavond weet dat hij
--    zijn week niet haalt, kijkt naar een weekdoel dat hij maandag heeft
--    aangemaakt — ruim buiten de bedenktijd. Hij kan hem afsluiten (`cancelled`,
--    telt als gemist) maar niet meer wegpoetsen.
--
-- ⚠️ Waarom een RPC en geen policy. Een DELETE-policy weigert **stil**: RLS
--    filtert de rij weg en een DELETE die niets raakt is geen fout, dus de app
--    krijgt "gelukt" terug terwijl er niets gebeurde. Bij een handeling die de
--    gebruiker bewust doet en waarvan hij het resultaat verwacht te zien, is dat
--    het verkeerde faalgedrag. Een RPC geeft een reden terug die het scherm kan
--    tonen: "dit weekdoel is te oud om te verwijderen — sluit hem af".
--
-- ⚠️ En daarom gaat `goals_delete` óók weg. Die policy stond wagenwijd open
--    (`owner_id = auth.uid()`, zonder enige voorwaarde) en werd door geen enkel
--    scherm gebruikt. Eén verzoek wiste daarmee een doel mét al zijn weekdoelen,
--    mijlpalen, reeks, weekpassen en groepskoppelingen — inclusief weken die
--    buddy's hadden goedgekeurd. Dat is domeinregel 6 (append-only) en het is
--    dezelfde vorm als `groups_delete`, dat al als aandachtspunt in
--    `docs/ENGINEER-REVIEW.md` staat. Voor een doel met geschiedenis is
--    **archiveren** de weg (`zet_doelstatus`), en die bestond al.

-- ---------------------------------------------------------------------------
-- 1. De bedenktijd — één bron van waarheid
-- ---------------------------------------------------------------------------
--
-- ⚠️ Vierentwintig uur, en dat is een keuze. Kort genoeg dat het geen
--    ontsnappingsluik is (een cyclus duurt zeven dagen, dus het venster is
--    hooguit een zevende deel ervan en ligt altijd aan het begin), lang genoeg
--    dat je een dubbele invoer van gisteravond vanochtend nog weg kunt halen.
--    Eén uur klonk netter maar is in de praktijk te kort: mensen zetten hun week
--    's ochtends op en kijken 's avonds pas terug.
--
-- ⚠️ Als functie en niet als constante in twee talen, om dezelfde reden als
--    `weekpas_maximum()`: de app leest dit getal niet zelf, hij krijgt van de
--    RPC te horen of het mag.
create or replace function public.bedenktijd()
  returns interval
  language sql
  immutable
  set search_path to 'public', 'pg_temp'
as $$ select interval '24 hours' $$;

revoke all on function public.bedenktijd() from public, anon;
grant execute on function public.bedenktijd() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Een weekdoel dat je net verkeerd hebt aangemaakt
-- ---------------------------------------------------------------------------

create or replace function public.verwijder_weekdoel(p_weekly_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  w weekly_goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- Er mag nog niets mee gebeurd zijn. `cancelled` hoort hier bewust níét bij:
  -- afsluiten is een besluit, en een besluit draai je niet terug met een
  -- verwijdering.
  if w.status <> 'todo' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  -- ⚠️ Ook geen ingediende voltooiing. De status zou dan geen `todo` meer moeten
  --    zijn, maar `completions` kán rijen dragen op een weekdoel dat om een
  --    andere reden op `todo` bleef staan — en die rij is bewijs dat iemand
  --    ermee bezig is geweest.
  if exists (select 1 from completions c where c.weekly_goal_id = p_weekly_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_voltooiing');
  end if;

  if w.created_at < now() - bedenktijd() then
    return jsonb_build_object('ok', false, 'reason', 'te_oud');
  end if;

  delete from weekly_goals where id = p_weekly_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.verwijder_weekdoel(uuid) from public, anon;
grant execute on function public.verwijder_weekdoel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Een doel dat je net verkeerd hebt aangemaakt
-- ---------------------------------------------------------------------------
--
-- ⚠️ Strenger dan bij een weekdoel, want een doel sleept veel meer mee: alle
--    cascades op `goals` (weekdoelen, mijlpalen, reeks, weekpassen,
--    groepskoppelingen, adempauzes, commitments) gaan in één keer weg. Daarom
--    mag het alleen als er werkelijk niets aan hangt.
create or replace function public.verwijder_doel(p_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
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

  -- Gedeeld met een groep? Dan is het niet meer alleen van jou: anderen zien het
  -- op hun groepsoverzicht en er kunnen schakels aan hangen.
  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'gedeeld_met_groep');
  end if;

  -- Er is al een week aan gewerkt.
  if exists (select 1 from weekly_goals w where w.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_weekdoelen');
  end if;

  -- Er zijn al punten op geboekt. Kan in theorie zonder weekdoel (een correctie),
  -- en dan is het geen vers doel meer.
  if exists (select 1 from points_ledger p where p.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_punten');
  end if;

  delete from goals where id = p_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.verwijder_doel(uuid) from public, anon;
grant execute on function public.verwijder_doel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rechtstreeks verwijderen kan niet meer — het loopt via de RPC's
-- ---------------------------------------------------------------------------

drop policy if exists goals_delete on public.goals;

revoke delete on public.goals from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. `goals.status` en `goals.created_at` horen niet bij de client
-- ---------------------------------------------------------------------------
--
-- ⚠️ Twee vliegen. `created_at` moest weg omdat de bedenktijd hierboven eraan
--    hangt: een client die zijn eigen `created_at` in de toekomst zet, houdt het
--    venster oneindig open. (Bij `weekly_goals` was dat recht al ingetrokken.)
--
-- ⚠️ En `status` is dezelfde vondst als A35, één niveau hoger. 0035 trok het
--    UPDATE-recht op `goals.status` in omdat `completed` de melding
--    "X heeft een doel afgerond" in elke gekoppelde groep zette zonder dat er
--    iets afgerond was — maar INSERT bleef open. Een doel meteen áls `completed`
--    aanmaken kon dus gewoon, en `goals_select` laat groepsgenoten die kolom
--    lezen. `doelSchema` stuurt de kolom niet mee, dus dit breekt niets.
revoke insert on public.goals from authenticated;

grant insert (
  owner_id,
  title,
  description,
  category,
  identity_statement,
  target_date,
  available_hours_per_week
) on public.goals to authenticated;
