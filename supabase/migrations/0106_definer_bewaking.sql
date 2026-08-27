-- 0106_definer_bewaking.sql — 98 functies omzeilen RLS, en dat is nu telbaar
--
-- ROLLBACK-PAD:
--   drop function if exists public.definer_bewaking();
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ De bevinding van 15-08 over `is_group_member()` en `shares_group_with_goal()`
--    stond op **Hoog** met de aantekening "niet te meten". De vráág die eronder
--    zit — is `SECURITY DEFINER` hier de juiste keuze — is inderdaad een gesprek.
--    Maar de helft die de rij zelf noemt, *waar werkt die keuze nog meer door*,
--    is een getal: **98 van de 118 functies in `public` zijn SECURITY DEFINER**.
--    Die omzeilen allemaal RLS. Nagemeten op 27-08-2026.
--
-- ⚠️ `SECURITY DEFINER` is op zichzelf geen fout — zonder die keuze krijg je
--    RLS-recursie op `group_members`, en dat is precies waarom hij er staat. Wat
--    hem gevaarlijk maakt zijn twee eigenschappen die je per functie kunt
--    vergeten, en die geen enkele test ooit rood maakt:
--
--      1. **Geen `set search_path`.** Dan kiest de áánroeper welke tabellen de
--         functie leest, en is de rechtenverhoging een cadeau. De
--         Supabase-advisor meldt dit, maar een advisor draait niet in `/audit`
--         en zijn uitkomst staat nergens vast.
--      2. **Uitvoerbaar door `anon`.** Een niet-ingelogde beller op een functie
--         die RLS omzeilt is de zwaarste vorm die er is.
--
-- ⚠️ **En punt 2 is de standaard, niet de uitzondering.** Een kale
--    `create function` geeft `execute` aan `PUBLIC`, en `anon` erft dat. Wie een
--    functie toevoegt en de `revoke` vergeet, zet hem dus open — dat is geen
--    exotisch scenario maar wat er gebeurt als je niets doet. Bij het ijken van
--    deze bewaking meldde de testfunctie zónder `revoke` meteen béide bezwaren.
--
-- ⚠️ **Er is precies één uitzondering en die staat hieronder met naam.**
--    `invite_preview(text)` is bewust voor `anon` open: een uitnodigingslink moet
--    te bekijken zijn vóórdat je een account maakt. Dat is verantwoord in 0019
--    en 0080, en de functie is erop gebouwd — zonder account krijg je voornamen
--    in plaats van volledige namen, geen avatars en geen doeltitels, en
--    ingetrokken, verlopen en nooit-bestaan geven hetzelfde antwoord zodat het
--    geen orakel is dat vertelt welke codes bestaan. De codeorde is 30^12
--    (≈ 5,3 × 10^17) met verwerpingsbemonstering tegen modulo-bias, dus
--    aftasten levert niets op.
--
--    **De uitzondering staat in de functie en niet in een document**, want een
--    tweede anon-functie hoort een besluit te zijn en geen bijvangst. Wie er een
--    toevoegt, komt hier langs.
--
-- ⚠️ Zelfde vorm als `realtime_bewaking()` (0027), `viewrechten_bewaking()` en
--    `schrijfrechten_bewaking()` (0101): geeft nul rijen als alles klopt, en een
--    rij per overtreding met de reden erbij. `service_role` en verder niemand.

create or replace function public.definer_bewaking()
returns table (naam text, bezwaar text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.proname::text, 'geen set search_path'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%'
    )

  union all

  select p.proname::text, 'uitvoerbaar door anon'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    -- De enige verantwoorde uitzondering; zie de kop van deze migratie.
    and p.proname <> 'invite_preview'

  order by 1, 2;
$$;

comment on function public.definer_bewaking() is
  'Nul rijen als elke SECURITY DEFINER-functie in public een gepinde search_path '
  'heeft en voor anon gesloten is. `invite_preview` is de enige toegestane '
  'uitzondering op dat tweede, verantwoord in 0019 en 0080. Voor de RLS-suite; '
  'hoort bij de bevinding van 15-08 over de RLS-hulpfuncties.';

revoke all on function public.definer_bewaking() from public, anon, authenticated;
grant execute on function public.definer_bewaking() to service_role;
