-- 0061_taal_in_het_profiel.sql — QS8-113
--
-- ROLLBACK-PAD:
--   alter table public.profiles drop column locale;
--   revoke update (locale) on public.profiles from authenticated;
--
-- ⚠️ **Waarom een kolom en niet alleen een apparaatinstelling.** De taal van de
--    gebruiker wordt op twéé plekken gebruikt en maar één daarvan is de app:
--
--      1. De schermen — die kunnen het van het apparaat lezen.
--      2. **De Doelcoach en de meldingen** — die draaien server-side, in een Edge
--         Function, zonder apparaat in de buurt. Een nudge om acht uur 's avonds
--         wordt door een job opgesteld, niet door de telefoon van de ontvanger.
--
--    Zonder deze kolom is een Engelse gebruiker dus wél Engels in de app en
--    Nederlands in elke melding die hij binnenkrijgt. Dat is precies de vorm van
--    "half vertaald" die QS8-107 wil voorkomen.
--
-- ⚠️ **`text` met een CHECK en geen enum.** Een enum uitbreiden vraagt in
--    Postgres een migratie met een eigen transactiegrens; een CHECK is één
--    `alter constraint`. Er komen zes tot acht talen bij (QS8-107) en dat is
--    zes tot acht keer dat verschil.
--
-- ⚠️ **NULL betekent "nog niet gekozen"** en niet "Nederlands". Dat verschil is
--    nodig: bij NULL mag de app de taal van het apparaat volgen, en zodra er een
--    waarde staat is dat een bewuste keuze die het apparaat overstemt. Zou de
--    standaard `'nl'` zijn, dan krijgt iemand met een Engelse telefoon bij zijn
--    eerste start Nederlands en moet hij dat handmatig omzetten.

begin;

alter table public.profiles
  add column if not exists locale text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_locale_bekend'
  ) then
    alter table public.profiles
      add constraint profiles_locale_bekend
      check (locale is null or locale in ('nl', 'en'));
  end if;
end $$;

comment on column public.profiles.locale is
  'Taalkeuze van de gebruiker. NULL = nog niet gekozen; dan volgt de app het '
  'apparaat. Gevuld = bewuste keuze, die het apparaat overstemt. De lijst in de '
  'CHECK is een kopie van TALEN in src/shared/i18n/types.ts.';

-- ⚠️ De eigenaar mag zijn eigen taal zetten. `profiles_update` (0003) dekt dat
--    al met `id = auth.uid()`; er is dus geen policy nodig, alleen een
--    kolomrecht — en dat had `authenticated` op deze tabel al, want er is nooit
--    een kolomgrant op `profiles` gezet. Deze regel staat er expliciet zodat het
--    een keuze is en geen erfenis.
grant update (locale) on public.profiles to authenticated;

commit;
