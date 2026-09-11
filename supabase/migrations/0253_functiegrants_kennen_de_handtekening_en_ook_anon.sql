-- 0253_functiegrants_kennen_de_handtekening_en_ook_anon.sql — de grendel onder
-- onwrikbare regel 4 vergelijkt voortaan handtekeningen in plaats van namen, en
-- kijkt ook naar `anon` (QS8-428).
--
-- ROLLBACK-PAD:
--   drop function if exists public.functies_met_uitvoerrecht();
--   drop function if exists public.kanonieke_handtekeningen(text[]);
--   en herstel `functies_voor_authenticated()` uit **0115** — de vorm met
--   `returns table (naam text)` en `select p.proname::text`, inclusief zijn
--   revoke/grant-blok en zijn comment.
--   En geef de vier constanten hun anon-recht terug:
--     grant execute on function public.intrekvenster_minuten() to anon;
--     grant execute on function public.tegenvaller_woorden() to anon;
--     grant execute on function public.tip_bevat_emoji(text) to anon;
--     grant execute on function public.tip_noemt_tegenvaller(text) to anon;
--   Er verandert geen kolom en geen rij; terugdraaien is dus twee drops, één
--   create en vier grants, en verder niets.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `functies_voor_authenticated()` (0115) gaf `p.proname` kaal terug, en
-- `tests/rls/functiegrants.test.ts` zocht daarmee naar
-- `grant execute on function <naam>([^)]*) to … authenticated`. De
-- argumentlijst was een joker.
--
-- ⚠️ **Die grendel draagt onwrikbare regel 4** — *elke functie die
--    `authenticated` mag uitvoeren, ligt naast de grant-regels; een recht zonder
--    grant-regel is geërfd en niet besloten* — en hij was precies blind voor de
--    beweging waarbij die regel het hardst nodig is: een handtekeningwijziging.
--    Dan staat er een nieuwe functie met dezelfde naam, en
--    `alter default privileges` deelt die in Supabase uit aan `anon`,
--    `authenticated` én `service_role`.
--
-- ⚠️ Dezelfde fout is in QS8-398 al gerepareerd in `scripts/functies-controle.mjs`.
--    Twee instrumenten met dezelfde blindheid, waarvan er één gerepareerd was.
--
-- ---------------------------------------------------------------------------
-- Waarom `anon` erbij hoort
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`functies_voor_anon()` bestond niet.** Het reviewdossier beweerde van wel
--    en dat is bij het bouwen nagemeten: er was alleen de authenticated-variant.
--    Juist `anon` is de rol die telt — `alter default privileges` deelt élke
--    nieuwe functie óók aan hem uit, en een definer-functie die een
--    níet-ingelogde bezoeker mag aanroepen is zwaarder dan dezelfde functie voor
--    een ingelogde gebruiker.
--
-- ---------------------------------------------------------------------------
-- Waarom er een tweede functie bij komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack: de migraties schrijven `timestamptz` (13 keer),
--    Postgres rendert `timestamp with time zone`. Een vergelijking op de
--    rúwe tekst van een handtekening zou op élke functie met zo'n argument
--    afgaan — en `integer`/`int4`, `boolean`/`bool` en `varchar` dragen hetzelfde
--    risico.
--
-- ⚠️ **Een aliastabel in de test zou drift zijn.** Postgres kent die aliassen
--    zelf; `to_regprocedure()` parst een handtekening en geeft de kanonieke vorm
--    terug — of `null` als de functie niet bestaat, wat bij een grant uit een
--    migratie die later gedropt is precies het juiste antwoord is.
--    `kanonieke_handtekeningen()` is dus geen hulpje maar het hele punt: de
--    normalisatie hoort bij de partij die de types definieert.

drop function if exists public.functies_voor_authenticated();
drop function if exists public.functies_met_uitvoerrecht();

create function public.functies_met_uitvoerrecht()
  returns table (rol text, naam text, handtekening text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select r.rol,
         p.proname::text,
         p.oid::regprocedure::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) as r(rol)
  where n.nspname = 'public'
    and has_function_privilege(r.rol, p.oid, 'execute')
  order by r.rol, p.oid::regprocedure::text;
$$;

revoke all on function public.functies_met_uitvoerrecht() from public, anon, authenticated;
grant execute on function public.functies_met_uitvoerrecht() to service_role;

comment on function public.functies_met_uitvoerrecht() is
  'Elke functie in public die anon of authenticated mag uitvoeren, mét '
  'handtekening. Gelezen door tests/rls/functiegrants.test.ts, dat hem naast de '
  'grant-regels in de migraties legt. Vervangt functies_voor_authenticated() uit '
  '0115, die alleen de naam gaf — QS8-428.';

drop function if exists public.kanonieke_handtekeningen(text[]);

create function public.kanonieke_handtekeningen(p_signaturen text[])
  returns table (invoer text, kanoniek text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select s, to_regprocedure(s)::text
  from unnest(p_signaturen) as s;
$$;

revoke all on function public.kanonieke_handtekeningen(text[]) from public, anon, authenticated;
grant execute on function public.kanonieke_handtekeningen(text[]) to service_role;

comment on function public.kanonieke_handtekeningen(text[]) is
  'Zet handtekeningen uit grant-regels om naar de vorm die Postgres zelf '
  'rendert, zodat timestamptz en timestamp with time zone hetzelfde zijn. Geeft '
  'null voor een functie die niet bestaat — een grant uit een migratie die later '
  'gedropt is. QS8-428.';

-- ---------------------------------------------------------------------------
-- Wat de nieuwe grendel meteen vond
-- ---------------------------------------------------------------------------
--
-- 📏 Zes functies mocht `anon` uitvoeren. Twee daarvan zijn besloten en blijven:
--    `invite_preview(text)` (QS8-236, de enige oningelogde ingang) en
--    `commitment_zichtbaar_voor_groep()`, die in `commitments_select` staat —
--    en `anon` heeft SELECT op `commitments` (de Supabase-standaard die 0073
--    bewust liet staan, want RLS is daar de grendel en niet de grant). Dat recht
--    intrekken zou een gefilterde lege uitkomst in een fout veranderen; dat is
--    een eigen besluit en geen bijvangst.
--
--    De andere vier zijn nooit besloten. Alle vier zijn `immutable`, géén
--    `security definer`, en geven een constante terug: `select 15`, een
--    woordenlijst, twee tekstpredicaten. Geen enkele policy, CHECK of
--    anon-bereikbare functie roept ze aan — `invite_preview()` dus ook niet.
--
-- ⚠️⚠️ **`revoke ... from anon` alleen was hier een schijnreparatie geweest.**
--    📏 De ACL van alle vier begint met `=X/postgres`: dat is een grant aan
--    **PUBLIC**. Anon erft het recht daar óók langs, dus een revoke die alleen
--    `anon` noemt haalt niets weg en ziet er wél uit als een fix. Zelfde klasse
--    als QS8-337.
--
-- ⚠️ **En dit is met opzet `from public, anon` en niet de gebruikelijke drie.**
--    CLAUDE.md schrijft `from public, anon, authenticated` voor omdat die vorm
--    anders de rol overhoudt waar iedere ingelogde gebruiker onder draait. Hier
--    is `authenticated` juist wél besloten — 0099 voor `intrekvenster_minuten()`
--    en 0103 voor de drie tipfuncties — en die grant blijft staan. Wie dit leest
--    en de gebruikelijke vorm mist: dat is hier de bedoeling, niet de fout.

revoke all on function public.intrekvenster_minuten() from public, anon;
revoke all on function public.tegenvaller_woorden() from public, anon;
revoke all on function public.tip_bevat_emoji(text) from public, anon;
revoke all on function public.tip_noemt_tegenvaller(text) from public, anon;
