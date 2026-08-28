-- 0110_streefdatum_na_ontkoppelen.sql — de enige rem op A7 is met drie verzoeken weg te nemen
--
-- ROLLBACK-PAD:
--   drop trigger if exists goal_group_links_ontkoppeld on public.goal_group_links;
--   drop function if exists public.noteer_ontkoppeling();
--   alter table public.goals drop column if exists losgekoppeld_op;
--   Herstel daarna `zet_streefdatum()` uit de vorige migratie: haal de tak
--   `recent_ontkoppeld` weg. De kolom bevat geen gegevens die ergens anders uit
--   af te leiden zijn, dus er gaat bij het terugdraaien alleen bewaking verloren.
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De bevinding van 17-08 noemde precies deze voorwaarde en die is voor de
--    twééde keer ingetreden.** Hij beschreef het patroon — koppeling weg,
--    handeling, koppeling terug — en schreef erbij: *"wordt zwaarder als een
--    beslissing op de koppelstand gaat leunen"*. Dat gebeurde op 22-08 met 0064
--    (gedicht in 0066), en het is opnieuw gebeurd: `zet_streefdatum()` weigert
--    met `needs_group_approval` **als het doel op dát moment gekoppeld is**.
--
-- ⚠️ **En deze keer raakt het de rem die dit project bewust gekozen heeft.**
--    Besluit A43 (24-08) wees een minpunt op verschuiven áf, met als
--    onderbouwing: *"de rem zit ergens anders: verschuiven kán alleen met
--    akkoord van een buddy, en zonder akkoord blijft de datum staan."* Dat is
--    geen bijzaak maar de dragende helft van dat besluit.
--
--    Nagemeten op 28-08-2026, als lid met RLS actief:
--
--      zet_streefdatum(doel, +400 dagen)            -> needs_group_approval
--      ontkoppelen; zet_streefdatum; terugkoppelen  -> ok, changed: true
--
--      datum verschoof van +90 naar +400 dagen, de koppeling stond terug,
--      en `deadline_requests` bleef leeg: **nul verzoeken aan een buddy**.
--
-- ⚠️ **Waarom geen verbod maar een wachttijd.** "Ooit gekoppeld geweest" zou een
--    doel dat een groep verlaten heeft voor altijd vastzetten, want
--    `vraag_deadline_verschuiving()` weigert met `not_linked` zodra de koppeling
--    weg is. Dan is er geen enkele weg meer naar een nieuwe datum — precies de
--    dode keten uit QS8-113, waar een kolom lag die niemand kon vullen.
--
--    Een wachttijd houdt beide paden open en haalt de winst uit de truc: wie
--    zijn doel een week uit de groep haalt, is die week uit het groepsoverzicht
--    verdwenen. Daarmee wordt de handeling zíchtbaar in plaats van onmogelijk,
--    en dat is wat A7 wil — de buddy de kans geven te reageren.
--
-- ⚠️ **Zeven dagen is een aanname en geen besluit, en dat hoort Quinten te
--    bevestigen.** Het is de conservatiefste keuze die het werk áf maakt: lang
--    genoeg dat een ontkoppeling niet meer onder de radar past, kort genoeg dat
--    iemand die zijn doel echt solo voortzet er niet aan vastzit. Wie hem
--    verandert, verandert wat er tegen de buddy beloofd wordt — zie
--    `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ **De stempel wordt bij het óntkoppelen gezet en bij het terugkoppelen niet
--    gewist.** Zou hij gewist worden, dan is de derde stap van de truc meteen de
--    reparatie ervan. Een oude stempel is vanzelf onschadelijk: na zeven dagen
--    telt hij niet meer.
--
-- ⚠️ **De trigger staat op de tabel en niet in een functie.** `verlaat_groep()`
--    ontkoppelt ook, en `verwijder_doel()` en een rechtstreekse DELETE door de
--    eigenaar net zo goed. Drie plekken die hetzelfde moeten doen, is de fout
--    die dit project met de vier routes naar een weggepoetste week (0043–0046)
--    al een keer gemaakt heeft.

alter table public.goals
  add column if not exists losgekoppeld_op timestamptz;

comment on column public.goals.losgekoppeld_op is
  'Wanneer dit doel voor het laatst van een groep werd losgekoppeld. Zie 0110: '
  '`zet_streefdatum()` weigert binnen zeven dagen daarna, zodat de rem van A7 '
  'niet met ontkoppelen-verschuiven-terugkoppelen te omzeilen is.';

create or replace function public.noteer_ontkoppeling()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update goals set losgekoppeld_op = now() where id = old.goal_id;
  return old;
end;
$$;

-- ⚠️ **Een triggerfunctie hoort niet als RPC in de API te staan**, en een kale
--    `create function` zet hem daar wel: `execute` gaat standaard naar `PUBLIC`
--    en `anon` erft dat. Deze is `security definer`, dus dat is een
--    rechtenverhoging voor een niet-ingelogde beller. Drie bestaande tests
--    (`policies`, `schrijfrechten` en de bewaking van 0106) werden hier meteen
--    rood van. Zelfde vorm als `fill_approval_subject()` in 0004.
--
--    Voor de trigger zélf verandert dit niets: die draait via de
--    triggermachinerie en niet via een `execute`-recht.
revoke all on function public.noteer_ontkoppeling() from public, anon, authenticated;

drop trigger if exists goal_group_links_ontkoppeld on public.goal_group_links;
create trigger goal_group_links_ontkoppeld
  after delete on public.goal_group_links
  for each row execute function public.noteer_ontkoppeling();

create or replace function public.zet_streefdatum(p_goal_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  g goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into g from goals where id = p_goal_id;

  if g.id is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if p_date is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  -- ⚠️ Gekoppeld aan een groep? Dan loopt het via een verzoek. Dit is het punt
  --    waar het besluit van A7 wordt afgedwongen, en het is geen UI-regel.
  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'needs_group_approval');
  end if;

  -- ⚠️ En dit is de tak die de omweg dichtzet. Zonder haar is de regel hierboven
  --    een momentopname, en drie verzoeken zijn genoeg om er langs te lopen.
  --    Zie de kop: gemeten, niet vermoed.
  if g.losgekoppeld_op is not null and g.losgekoppeld_op > now() - interval '7 days' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'recent_ontkoppeld',
      'weer_toegestaan_op', (g.losgekoppeld_op + interval '7 days')
    );
  end if;

  if p_date = g.target_date then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update goals set target_date = p_date where id = p_goal_id;

  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value)
  values (p_goal_id, auth.uid(), 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', p_date));

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;
