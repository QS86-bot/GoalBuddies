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
--    `://`, `www.` en een domeinvorm (letter of cijfer of streepje, een punt of
--    een punt-lookalike, twee letters), en getal-punt-getal (een IP-adres).
--
-- ⚠️ `[[:alpha:]]` hangt van de locale af. 📏 Productie meet `en_US.UTF-8` en
--    daar dekt hij é, ā en кириллица; onder locale `C` (een lokale teststack)
--    zijn dat geen letters en weigert de CHECK minder dan de TS-kant. De
--    pariteitstest toetst dat tegen de draaiende database. Houd de twee gelijk. Regeleinden weert de CHECK hier zelf (CR, LF,
--    NEL, LS, PS), want `schoneNaam()` strijkt ze in de client maar een directe
--    API-aanroep gaat daar niet langs.
-- ---------------------------------------------------------------------------

begin;

create or replace function public.bevat_linkachtige_tekst(p_tekst text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  -- v: NFKC, en dan een whitelist: alleen letters, cijfers, witruimte, `-`, `:`,
  -- `/` en punten blijven. Wat een mens niet als teken ziet (richtingstekens,
  -- accenten, opmaaktekens) verdwijnt, want `evil<LRM>.com` leest als evil.com.
  -- Spiegelt `bevatLinkAchtigeTekst()` in src/shared/tekst.
  select coalesce(
    v ~* '://|www\.'
    -- een domeinvorm: letter/cijfer/streepje, een punt (ook de punten die een
    -- browser tot een punt omzet: U+3002, U+FF0E, U+FF61, U+2024, U+FE52), twee letters
    or v ~* ('[[:alnum:]-][.' || U&'\3002\FF0E\FF61\2024\FE52' || '][[:alpha:]]{2}')
    -- een IP-adres of ander getal-punt-getal (besluit Quinten, 20-11-2026)
    or v ~ ('[0-9][.' || U&'\3002\FF0E\FF61\2024\FE52' || '][0-9]')
    or p_tekst ~ ('[' || chr(10) || chr(13) || chr(133) || chr(8232) || chr(8233) || ']'),
    false
  )
  from (
    select regexp_replace(
      regexp_replace(
        normalize(coalesce(p_tekst, ''), NFKC),
        -- alle combinerende tekens (Unicode-categorie M), gegenereerd uit unicodedata;
        -- glibc telt ze als alnum en dus zouden ze de whitelist passeren
        '[' || U&'\+000300-\+00036F\+000483-\+000489\+000591-\+0005BD\+0005BF\+0005C1-\+0005C2\+0005C4-\+0005C5\+0005C7\+000610-\+00061A\+00064B-\+00065F\+000670' ||
        U&'\+0006D6-\+0006DC\+0006DF-\+0006E4\+0006E7-\+0006E8\+0006EA-\+0006ED\+000711\+000730-\+00074A\+0007A6-\+0007B0\+0007EB-\+0007F3\+0007FD' ||
        U&'\+000816-\+000819\+00081B-\+000823\+000825-\+000827\+000829-\+00082D\+000859-\+00085B\+000898-\+00089F\+0008CA-\+0008E1\+0008E3-\+000903' ||
        U&'\+00093A-\+00093C\+00093E-\+00094F\+000951-\+000957\+000962-\+000963\+000981-\+000983\+0009BC\+0009BE-\+0009C4\+0009C7-\+0009C8\+0009CB-\+0009CD' ||
        U&'\+0009D7\+0009E2-\+0009E3\+0009FE\+000A01-\+000A03\+000A3C\+000A3E-\+000A42\+000A47-\+000A48\+000A4B-\+000A4D\+000A51\+000A70-\+000A71\+000A75' ||
        U&'\+000A81-\+000A83\+000ABC\+000ABE-\+000AC5\+000AC7-\+000AC9\+000ACB-\+000ACD\+000AE2-\+000AE3\+000AFA-\+000AFF\+000B01-\+000B03\+000B3C' ||
        U&'\+000B3E-\+000B44\+000B47-\+000B48\+000B4B-\+000B4D\+000B55-\+000B57\+000B62-\+000B63\+000B82\+000BBE-\+000BC2\+000BC6-\+000BC8\+000BCA-\+000BCD' ||
        U&'\+000BD7\+000C00-\+000C04\+000C3C\+000C3E-\+000C44\+000C46-\+000C48\+000C4A-\+000C4D\+000C55-\+000C56\+000C62-\+000C63\+000C81-\+000C83\+000CBC' ||
        U&'\+000CBE-\+000CC4\+000CC6-\+000CC8\+000CCA-\+000CCD\+000CD5-\+000CD6\+000CE2-\+000CE3\+000CF3\+000D00-\+000D03\+000D3B-\+000D3C\+000D3E-\+000D44' ||
        U&'\+000D46-\+000D48\+000D4A-\+000D4D\+000D57\+000D62-\+000D63\+000D81-\+000D83\+000DCA\+000DCF-\+000DD4\+000DD6\+000DD8-\+000DDF\+000DF2-\+000DF3' ||
        U&'\+000E31\+000E34-\+000E3A\+000E47-\+000E4E\+000EB1\+000EB4-\+000EBC\+000EC8-\+000ECE\+000F18-\+000F19\+000F35\+000F37\+000F39\+000F3E-\+000F3F' ||
        U&'\+000F71-\+000F84\+000F86-\+000F87\+000F8D-\+000F97\+000F99-\+000FBC\+000FC6\+00102B-\+00103E\+001056-\+001059\+00105E-\+001060\+001062-\+001064' ||
        U&'\+001067-\+00106D\+001071-\+001074\+001082-\+00108D\+00108F\+00109A-\+00109D\+00135D-\+00135F\+001712-\+001715\+001732-\+001734\+001752-\+001753' ||
        U&'\+001772-\+001773\+0017B4-\+0017D3\+0017DD\+00180B-\+00180D\+00180F\+001885-\+001886\+0018A9\+001920-\+00192B\+001930-\+00193B\+001A17-\+001A1B' ||
        U&'\+001A55-\+001A5E\+001A60-\+001A7C\+001A7F\+001AB0-\+001ACE\+001B00-\+001B04\+001B34-\+001B44\+001B6B-\+001B73\+001B80-\+001B82\+001BA1-\+001BAD' ||
        U&'\+001BE6-\+001BF3\+001C24-\+001C37\+001CD0-\+001CD2\+001CD4-\+001CE8\+001CED\+001CF4\+001CF7-\+001CF9\+001DC0-\+001DFF\+0020D0-\+0020F0' ||
        U&'\+002CEF-\+002CF1\+002D7F\+002DE0-\+002DFF\+00302A-\+00302F\+003099-\+00309A\+00A66F-\+00A672\+00A674-\+00A67D\+00A69E-\+00A69F\+00A6F0-\+00A6F1' ||
        U&'\+00A802\+00A806\+00A80B\+00A823-\+00A827\+00A82C\+00A880-\+00A881\+00A8B4-\+00A8C5\+00A8E0-\+00A8F1\+00A8FF\+00A926-\+00A92D\+00A947-\+00A953' ||
        U&'\+00A980-\+00A983\+00A9B3-\+00A9C0\+00A9E5\+00AA29-\+00AA36\+00AA43\+00AA4C-\+00AA4D\+00AA7B-\+00AA7D\+00AAB0\+00AAB2-\+00AAB4\+00AAB7-\+00AAB8' ||
        U&'\+00AABE-\+00AABF\+00AAC1\+00AAEB-\+00AAEF\+00AAF5-\+00AAF6\+00ABE3-\+00ABEA\+00ABEC-\+00ABED\+00FB1E\+00FE00-\+00FE0F\+00FE20-\+00FE2F\+0101FD' ||
        U&'\+0102E0\+010376-\+01037A\+010A01-\+010A03\+010A05-\+010A06\+010A0C-\+010A0F\+010A38-\+010A3A\+010A3F\+010AE5-\+010AE6\+010D24-\+010D27' ||
        U&'\+010EAB-\+010EAC\+010EFD-\+010EFF\+010F46-\+010F50\+010F82-\+010F85\+011000-\+011002\+011038-\+011046\+011070\+011073-\+011074\+01107F-\+011082' ||
        U&'\+0110B0-\+0110BA\+0110C2\+011100-\+011102\+011127-\+011134\+011145-\+011146\+011173\+011180-\+011182\+0111B3-\+0111C0\+0111C9-\+0111CC' ||
        U&'\+0111CE-\+0111CF\+01122C-\+011237\+01123E\+011241\+0112DF-\+0112EA\+011300-\+011303\+01133B-\+01133C\+01133E-\+011344\+011347-\+011348' ||
        U&'\+01134B-\+01134D\+011357\+011362-\+011363\+011366-\+01136C\+011370-\+011374\+011435-\+011446\+01145E\+0114B0-\+0114C3\+0115AF-\+0115B5' ||
        U&'\+0115B8-\+0115C0\+0115DC-\+0115DD\+011630-\+011640\+0116AB-\+0116B7\+01171D-\+01172B\+01182C-\+01183A\+011930-\+011935\+011937-\+011938' ||
        U&'\+01193B-\+01193E\+011940\+011942-\+011943\+0119D1-\+0119D7\+0119DA-\+0119E0\+0119E4\+011A01-\+011A0A\+011A33-\+011A39\+011A3B-\+011A3E\+011A47' ||
        U&'\+011A51-\+011A5B\+011A8A-\+011A99\+011C2F-\+011C36\+011C38-\+011C3F\+011C92-\+011CA7\+011CA9-\+011CB6\+011D31-\+011D36\+011D3A\+011D3C-\+011D3D' ||
        U&'\+011D3F-\+011D45\+011D47\+011D8A-\+011D8E\+011D90-\+011D91\+011D93-\+011D97\+011EF3-\+011EF6\+011F00-\+011F01\+011F03\+011F34-\+011F3A' ||
        U&'\+011F3E-\+011F42\+013440\+013447-\+013455\+016AF0-\+016AF4\+016B30-\+016B36\+016F4F\+016F51-\+016F87\+016F8F-\+016F92\+016FE4\+016FF0-\+016FF1' ||
        U&'\+01BC9D-\+01BC9E\+01CF00-\+01CF2D\+01CF30-\+01CF46\+01D165-\+01D169\+01D16D-\+01D172\+01D17B-\+01D182\+01D185-\+01D18B\+01D1AA-\+01D1AD' ||
        U&'\+01D242-\+01D244\+01DA00-\+01DA36\+01DA3B-\+01DA6C\+01DA75\+01DA84\+01DA9B-\+01DA9F\+01DAA1-\+01DAAF\+01E000-\+01E006\+01E008-\+01E018' ||
        U&'\+01E01B-\+01E021\+01E023-\+01E024\+01E026-\+01E02A\+01E08F\+01E130-\+01E136\+01E2AE\+01E2EC-\+01E2EF\+01E4EC-\+01E4EF\+01E8D0-\+01E8D6' ||
        U&'\+01E944-\+01E94A\+0E0100-\+0E01EF' || ']',
        '', 'g'
      ),
      '[^[:alnum:][:space:]:/.' || U&'\3002\FF0E\FF61\2024\FE52' || '-]',
      '', 'g'
    ) as v
  ) s;
$$;

comment on function public.bevat_linkachtige_tekst(text) is
  'Staat er een webadres, domeinvorm of regeleinde in deze tekst — QS8-771. '
  'Spiegelt `bevatLinkAchtigeTekst()` uit `src/shared/tekst`.';

revoke all on function public.bevat_linkachtige_tekst(text) from public, anon, authenticated;
grant execute on function public.bevat_linkachtige_tekst(text) to authenticated, service_role;

alter table public.groups
  drop constraint if exists groups_name_geen_webadres;

alter table public.groups
  add constraint groups_name_geen_webadres
  check (not public.bevat_linkachtige_tekst(name));

comment on constraint groups_name_geen_webadres on public.groups is
  'Een groepsnaam draagt geen webadres, domeinvorm of regeleinde — QS8-771. De '
  'naam staat in het bericht dat een lid onder eigen naam verstuurt.';

commit;
