-- 0328_een_groepsnaam_is_geen_webadres.sql — een groepsnaam draagt geen webadres,
-- domeinvorm of regeleinde (QS8-771, optie 1 van Quinten, 20-11-2026).
--
-- ROLLBACK-PAD:
--   In één transactie, met ON_ERROR_STOP aan:
--
--     begin;
--     alter table public.groups drop constraint if exists groups_name_geen_webadres;
--     drop function if exists public.bevat_linkachtige_tekst(text);
--     commit;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Sinds QS8-706 staat de groepsnaam in het bericht dat een lid via "Deel de
-- uitnodiging" onder zijn eigen naam verstuurt, naast een echte GoalBuddies-link.
-- Een beheerder die de groep "Account verlopen, log in via evil.example" noemt,
-- laat elk delend lid die tekst versturen. De TS-kant (aanhalingstekens in het
-- bericht en `groepSchema`) is niet genoeg: de regel is pas afgedwongen als de
-- database hem afdwingt, en `groups.name` is met één API-verzoek te schrijven.
--
-- 📏 Nagemeten op productie, alleen lezend (20-11-2026): 2 groepen, 0 met een
-- naam die deze regel zou weigeren. De CHECK is dus meteen gevalideerd; er is
-- geen bestaande naam gewijzigd.
--
-- ⚠️ De regel spiegelt `bevatLinkAchtigeTekst()` in `src/shared/tekst`:
--    `://`, `www.` en een domeinvorm (letter of cijfer of streepje, punt, twee
--    letters). Houd de twee gelijk. Regeleinden weert de CHECK hier zelf (CR, LF,
--    NEL, LS, PS), want `schoneNaam()` strijkt ze in de client maar een directe
--    API-aanroep gaat daar niet langs.
-- ---------------------------------------------------------------------------

create or replace function public.bevat_linkachtige_tekst(p_tekst text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select coalesce(
    p_tekst ~* ('://|www\.|[[:alnum:]-]\.[[:alpha:]]{2}')
    or p_tekst ~ ('[' || chr(10) || chr(13) || chr(133) || chr(8232) || chr(8233) || ']'),
    false
  );
$$;

comment on function public.bevat_linkachtige_tekst(text) is
  'Staat er een webadres, domeinvorm of regeleinde in deze tekst — QS8-771. '
  'Spiegelt `bevatLinkAchtigeTekst()` uit `src/shared/tekst`.';

revoke all on function public.bevat_linkachtige_tekst(text) from public, anon, authenticated;
grant execute on function public.bevat_linkachtige_tekst(text) to authenticated;

alter table public.groups
  drop constraint if exists groups_name_geen_webadres;

alter table public.groups
  add constraint groups_name_geen_webadres
  check (not public.bevat_linkachtige_tekst(name));

comment on constraint groups_name_geen_webadres on public.groups is
  'Een groepsnaam draagt geen webadres, domeinvorm of regeleinde — QS8-771. De '
  'naam staat in het bericht dat een lid onder eigen naam verstuurt.';
