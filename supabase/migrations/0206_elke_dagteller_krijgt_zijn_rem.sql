-- 0206_elke_dagteller_krijgt_zijn_rem.sql — de vijf dagtellers uit 0203 kregen
-- geen rem, waardoor het defect van QS8-347 opnieuw op vijf tabellen stond
-- (QS8-363).
--
-- ROLLBACK-PAD:
--   drop trigger if exists commitments_rem on public.commitments;
--   drop trigger if exists voltooiingen_rem on public.completions;
--   drop trigger if exists dagzetten_rem on public.daily_moves;
--   drop trigger if exists doelkoppelingen_rem on public.goal_group_links;
--   drop trigger if exists doelinterviews_rem on public.goal_interviews;
--   drop function if exists public.rem_commitments();
--   drop function if exists public.rem_voltooiingen();
--   drop function if exists public.rem_dagzetten();
--   drop function if exists public.rem_doelkoppelingen();
--   drop function if exists public.rem_doelinterviews();
--   -- en `sleutelzetters()` terugzetten op de definitie uit 0200:
--   -- die versie kent de vijf sleutels en de negen tellers, niet deze vijf.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0200 (QS8-347) mat dat een geweigerde bulk-insert de rijen **eerst schrijft**
-- en daarna terugdraait: de dagteller van 0192 is `AFTER INSERT … FOR EACH
-- STATEMENT`, en een transitietabel bestaat alleen in `AFTER`. Die migratie zette
-- daarom op negen tabellen een `BEFORE INSERT … FOR EACH ROW`-rem.
--
-- 0203 (QS8-344) voegde zes nieuwe dagtellers toe — in dezelfde `AFTER
-- STATEMENT`-vorm, **zonder rem**. Vijf tabellen hadden daarmee weer precies het
-- defect dat 0200 had weggenomen. (De zesde, `completion_approvals`, hield zijn
-- rem uit 0200 omdat de naam toevallig al bezet was.)
--
-- 📏 Gemeten op `daily_moves`, één `authenticated`-sessie, batch van 20.000:
--
--      pg_total_relation_size vooraf   3080 kB
--      insert 20.000 dagzetten    ->   23514 Te veel dagzetten in één dag
--      rijen gebleven                  0
--      pg_total_relation_size erna     6024 kB
--
--    2,9 MB aangroei voor een verzoek dat volledig geweigerd is, en die ruimte
--    komt pas terug bij een `vacuum full`.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Dit was voorspeld, en dat is het eigenlijke onderwerp
-- ---------------------------------------------------------------------------
--
-- De dossierrij van 08-09-2026 in `docs/ENGINEER-REVIEW.md` zei het letterlijk:
-- *"QS8-344 bouwt het defect van QS8-347 opnieuw op tien tabellen als hij zonder
-- rem landt. **Wordt zwaarder als:** QS8-344 landt vóór iemand de rem eraan
-- toevoegt."* Een paar uur later landde hij.
--
-- **Een waarschuwing in een dossier is geen grendel.** Twee branches breidden
-- dezelfde structuur uit, git zag geen conflict, en de enige die het merkte was
-- een mens die toevallig nog wist dat de rij er stond. Daarom zit in deze
-- wijziging niet alleen de reparatie maar ook de grendel eronder:
-- `tests/rls/remdekking.test.ts` wordt rood zodra er een `*_dagplafond`-trigger
-- bestaat zonder bijbehorende `*_rem`.
--
-- ⚠️ Die test leest `pg_trigger` en niet de migratiebestanden. De database is de
--    waarheid: een rem die in een migratie staat maar door een latere `drop`
--    verdwenen is, telt niet — en precies dat verschil is wat de bestanden niet
--    kunnen zien.
--
-- ---------------------------------------------------------------------------
-- De vorm, en de drie dingen die 0200 duur geleerd heeft
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De teller is transactielokaal en telt niet het venster.** PostgREST voert
--    elk verzoek in één transactie uit, dus `set_config(..., true)` telt precies
--    "hoeveel rijen schrijft deze POST". 0200 begon met een vensterteller en dat
--    was op twee manieren fout: het venster is gedeeld met de rollover (dan gaat
--    de noodstop af op een handeling van één rij), en het hertellen is
--    kwadratisch — 1924 ms tegen 11,5 ms voor dezelfde geweigerde batch.
--
-- ⚠️ **De drempel is `plafond * 2` en niet `plafond`.** Een rem die op het
--    plafond zelf afgaat, overstemt de teller, maakt hem dode code en verandert
--    de melding die de app krijgt. Het getal is afgeleid: een legitiem verzoek
--    kan hoogstens `plafond` nieuwe rijen bevatten, en het randgeval
--    `plafond + 1` moet de téller kunnen weigeren met zijn eigen melding.
--
-- ⚠️ **`auth.uid() is null` betekent doorlaten.** De rollover en de
--    notificatiejob draaien als `service_role` en schrijven grote batches.
--
-- ---------------------------------------------------------------------------
-- Idempotent: `create or replace` op zes functies en `drop trigger if exists`
-- vóór elke `create trigger`. De handtekeningen veranderen niet.
-- ---------------------------------------------------------------------------

create or replace function public.rem_commitments() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_commitments', true), ''), '0')::integer + 1;
  perform set_config('app.rem_commitments', v_n::text, true);
  if v_n > commitments_plafond() * 2 then
    raise exception 'Te veel commitments in één verzoek (% rijen, noodgrens %)',
      v_n, commitments_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_voltooiingen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_voltooiingen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_voltooiingen', v_n::text, true);
  if v_n > voltooiingen_plafond() * 2 then
    raise exception 'Te veel voltooiingen in één verzoek (% rijen, noodgrens %)',
      v_n, voltooiingen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_dagzetten() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_dagzetten', true), ''), '0')::integer + 1;
  perform set_config('app.rem_dagzetten', v_n::text, true);
  if v_n > dagzetten_plafond() * 2 then
    raise exception 'Te veel dagzetten in één verzoek (% rijen, noodgrens %)',
      v_n, dagzetten_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_doelkoppelingen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_doelkoppelingen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_doelkoppelingen', v_n::text, true);
  if v_n > doelkoppelingen_plafond() * 2 then
    raise exception 'Te veel doelkoppelingen in één verzoek (% rijen, noodgrens %)',
      v_n, doelkoppelingen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_doelinterviews() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_doelinterviews', true), ''), '0')::integer + 1;
  perform set_config('app.rem_doelinterviews', v_n::text, true);
  if v_n > doelinterviews_plafond() * 2 then
    raise exception 'Te veel doelinterviews in één verzoek (% rijen, noodgrens %)',
      v_n, doelinterviews_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`: in Supabase
--    deelt `alter default privileges` élke nieuwe functie in `public` uit aan
--    alle drie. Beveiligingsregel 4; de grendel eronder is
--    `tests/rls/functiegrants.test.ts`.
revoke all on function public.rem_commitments() from public, anon, authenticated;
revoke all on function public.rem_voltooiingen() from public, anon, authenticated;
revoke all on function public.rem_dagzetten() from public, anon, authenticated;
revoke all on function public.rem_doelkoppelingen() from public, anon, authenticated;
revoke all on function public.rem_doelinterviews() from public, anon, authenticated;

drop trigger if exists commitments_rem on public.commitments;
create trigger commitments_rem before insert on public.commitments
  for each row execute function public.rem_commitments();

drop trigger if exists voltooiingen_rem on public.completions;
create trigger voltooiingen_rem before insert on public.completions
  for each row execute function public.rem_voltooiingen();

drop trigger if exists dagzetten_rem on public.daily_moves;
create trigger dagzetten_rem before insert on public.daily_moves
  for each row execute function public.rem_dagzetten();

drop trigger if exists doelkoppelingen_rem on public.goal_group_links;
create trigger doelkoppelingen_rem before insert on public.goal_group_links
  for each row execute function public.rem_doelkoppelingen();

drop trigger if exists doelinterviews_rem on public.goal_interviews;
create trigger doelinterviews_rem before insert on public.goal_interviews
  for each row execute function public.rem_doelinterviews();


-- ---------------------------------------------------------------------------
-- De vijf tellers aanmelden bij `sleutelzetters()`
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit register is uit de dráaiende database gehaald en niet uit 0200
--    gekopieerd.** `sleutelzetters()` draagt zijn eigen register in zijn
--    `create or replace`-lichaam, en dat is een merge-conflict dat git niet ziet:
--    twee branches breiden de lijst uit, de laatste `replace` wint, en de andere
--    verdwijnt zonder een woord. Dat is op 08-09 al een keer bijna gebeurd en het
--    staat als QS8-358.
--
--    📏 En het was hier geen theorie: `app.hervat_lidmaatschap` stond nog in de
--    versie uit 0200 en is met 0204 (QS8-325) vervallen, omdat `paused` niet meer
--    bestaat. Een kopie uit 0200 had die sleutel dus teruggezet, met een
--    verwijzing naar een functie die er niet meer is.
--
-- ⚠️ Tot QS8-358 gebouwd is, is dit de werkwijze: **lees de gedeployde definitie,
--    voeg toe, en kopieer nooit een oudere versie.**

CREATE OR REPLACE FUNCTION public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ **Deze drie komen uit 0199 (QS8-356) en staan hier omdat een
      --    `create or replace` het hele register vervangt.** Ze zijn er bij het
      --    samenvoegen bijna uit gevallen: de RLS-suite meldde na de merge drie
      --    ongeregistreerde sleutels — `verlaat_groep`,
      --    `beslis_lidmaatschapsverzoek` en `verwijder_lid` — omdat mijn versie
      --    het register van vóór die migratie kopieerde.
      --
      --    Dat is de val van een teller die zijn eigen register in zijn lichaam
      --    draagt: twee branches breiden hem uit, de laatste `replace` wint, en
      --    de ander verdwijnt zonder een woord. Hier ving de teller zichzelf op
      --    doordat hij de weggevallen sleutels meteen als ongeregistreerd meldde.
      ('app.beheer_overgedragen',   array['verlaat_groep', 'guard_group_member_update']),
      ('app.lidmaatschap_besloten', array['beslis_lidmaatschapsverzoek', 'guard_group_member_update']),
      ('app.lid_uitgezet',          array['verwijder_lid', 'guard_group_member_update']),
      -- De tellers van 0200. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen']),
      -- De vijf tellers van 0206, bij de dagtellers die 0203 zonder rem liet.
      ('app.rem_commitments',        array['rem_commitments']),
      ('app.rem_voltooiingen',       array['rem_voltooiingen']),
      ('app.rem_dagzetten',          array['rem_dagzetten']),
      ('app.rem_doelkoppelingen',    array['rem_doelkoppelingen']),
      ('app.rem_doelinterviews',     array['rem_doelinterviews'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc like '%' || s.instelling || '%'
      and p.proname <> 'sleutelzetters'
  )
  select naam,
         'noemt ' || instelling || '; alleen ' ||
         array_to_string(toegestaan, '() en ') || '() horen die sleutel te kennen'
    from bekend
   where naam <> all (toegestaan)

  union all

  -- ⚠️ De derde tak: een `app.`-instelling die in geen enkel register hierboven
  --    staat. Zonder deze tak dekt de teller alleen de sleutels die iemand er al
  --    in heeft gezet, en is de vólgende sleutel weer ongeteld.
  select p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt een app.-sessiesleutel die in geen enkel register van deze '
         'teller staat; een nieuwe sleutel hoort er met zijn eigen regel in '
         'te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and p.prosrc ~ 'app\.[a-z_]+'
     and not exists (
       select 1 from sleutel s where p.prosrc like '%' || s.instelling || '%'
     )

   order by 1;
$function$;
