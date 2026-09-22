-- 0295_leesroute_bewaking_toetst_elke_bovenste_or-tak_apart.sql — een tweede,
-- zwakkere OR-tak naast een sterke aanroep bleef ongemeld (QS8-461)
--
-- ROLLBACK-PAD:
--   drop function if exists public.leesroute_bewaking();
--   drop function if exists public.bovenste_or_takken(text);
--   `leesroute_bewaking()` terug op de versie van 0259: hetzelfde lichaam met
--   twee takken, maar met de `like`-toetsen op `p.qual` in plaats van op
--   `t.tak`. Verder niets: deze migratie raakt geen tabel, kolom, policy of
--   grant aan.
--
--   ⚠️ Terugdraaien zet het gat terug dat deze migratie sluit — een leespolicy
--      met een sterke aanroep in de ene tak en een eigen kopie in de andere is
--      dan weer onzichtbaar.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten op 22-09-2026**, op een lokaal opgebouwd schema (Postgres 16,
--    297 migraties op een lege database, `scripts/schema-opbouwen.sh`), met de
--    fixture uit QS8-461 in een teruggerolde transactie:
--
--      create policy p459d_ortak on public.p459d for select to authenticated
--        using (shares_group_with_goal(goal_id)
--               or exists (select 1 from goal_group_links l
--                          join group_members m on m.group_id = l.group_id
--                                              and m.user_id = (select auth.uid())
--                          where l.goal_id = p459d.goal_id));
--
--      leesroute_bewaking() ervóór -> 0 rijen
--      leesroute_bewaking() erná   -> 0 rijen        <-- het gat
--
--    De tweede tak doet géén eigenaar-toets en géén archieftoets — precies de
--    verruiming die 0259 hoort te vangen — en de grendel zwijgt omdat de
--    **eerste** tak een gesanctioneerde naam draagt. `not like` kijkt naar de
--    hele `qual`, en die bevat het woord.
--
-- ⚠️ **Waarom dit de realistische vorm is.** Een *vervanging* van de expressie
--    leest in een diff als een herschrijving en valt op. Een *tak erbij* leest
--    als uitbreiding. CLAUDE.md noemt die vorm bij domeinregel 11 als duur
--    betaald: "Een vierde tak op `commitments_select` gaf dat alles wél weg".
--
-- ---------------------------------------------------------------------------
-- Waarom per bovenste OR-tak, en niet een verbod op de tabelnamen
-- ---------------------------------------------------------------------------
--
-- QS8-461 noemt twee richtingen. De tweede — de `qual` mag de
-- lidmaatschapstabellen niet nóemen buiten een gesanctioneerde aanroep — is
-- strenger en korter op te schrijven, maar hij vraagt een uitzonderingsregister
-- zodra één legitieme policy die tabellen om een andere reden noemt.
--
-- 📏 Gemeten op hetzelfde schema: van alle SELECT/ALL-policies in `public` en
--    `storage` noemt er vandaag **nul** `goal_group_links` of `group_members`.
--    Richting 2 zou dus vandaag nul valse meldingen geven — maar een register
--    dat vandaag leeg is, is een register dat de eerste vulling ongemerkt
--    binnenlaat. Deze migratie kiest daarom richting 1 en houdt het register
--    weg.
--
-- ⚠️⚠️ **Waarom de bovenste OR-laag precies de juiste korrel is.** `and`
--    versmalt en `or` verbreedt. Staat er `A and (B or C)`, dan moet `A` óók
--    gelden en is het geheel minstens zo streng als `A`; een zwakke `C` kan daar
--    niets openzetten wat `A` dichthoudt. Staat er `A or C`, dan volstaat `C`
--    alleen, en is de policy zo zwak als zijn zwakste tak. **Alleen de bovenste
--    `or` verbreedt de toegang, dus alleen daar hoort de toets per tak.**
--
-- ⚠️ Postgres vlakt geneste `or` af in de expressieboom, dus `A or (B or C)`
--    komt als één vlakke `A OR B OR C` uit `pg_get_expr()` en valt vanzelf in
--    drie takken uiteen. Een `or` binnen een subquery staat tussen haakjes en
--    blijft dus binnen zijn tak — dat is gemeten, zie proef 3 hieronder.
--
-- ⚠️ **Deze migratie is een verstrenging en geen gedragsverandering op de
--    bestaande vorm.** Een `qual` zonder bovenste `or` levert precies één tak op
--    die gelijk is aan de hele `qual`, en dan doet deze functie letterlijk wat
--    0259 deed. 📏 Nagemeten: nul bevindingen op het kale schema, vóór én ná.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- De splitser
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Waarom geen `string_to_array(qual, ' OR ')`.** Die splitst ook binnen een
--    subquery en binnen een stringliteral, en dan meldt de grendel takken die
--    geen takken zijn. Deze loopt de tekst teken voor teken af met een
--    haakjesdiepte en een vlag voor stringliteralen.
--
-- 📏 Vier proeven, alle vier gemeten vóór deze migratie geschreven werd:
--
--      1. het geval uit QS8-461                     -> 2 takken
--      2. `(shares_group_with_goal(goal_id))`       -> 1 tak, ongewijzigd
--      3. `(EXISTS ( SELECT 1 FROM t WHERE (a OR b)))` -> 1 tak  (niet gesplitst)
--      4. `(naam = 'x OR y')`                       -> 1 tak  (niet gesplitst)
--
-- ⚠️ `immutable` en niet `stable`: deze functie leest niets, hij rekent alleen
--    op zijn argument.
create or replace function public.bovenste_or_takken(p_expr text)
returns setof text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expr     text := btrim(coalesce(p_expr, ''));
  v_i        int;
  v_diepte   int;
  v_in_tekst boolean;
  v_start    int;
  v_teken    text;
  v_gestript boolean;
begin
  if v_expr = '' then
    return;
  end if;

  -- ⚠️ `pg_get_expr()` zet een `qual` altijd tussen buitenste haakjes. Die eraf
  --    halen is nodig, anders staat de hele expressie op diepte 1 en splitst er
  --    nooit iets. De lus is er voor een dubbel omhulsel; hij stopt zodra de
  --    haakjes niet meer het héle lichaam omsluiten (`(a) OR (b)` blijft staan).
  loop
    v_gestript := false;
    if left(v_expr, 1) = '(' then
      v_diepte := 0;
      v_in_tekst := false;
      for v_i in 1 .. length(v_expr) loop
        v_teken := substr(v_expr, v_i, 1);
        if v_in_tekst then
          if v_teken = '''' then v_in_tekst := false; end if;
        elsif v_teken = '''' then
          v_in_tekst := true;
        elsif v_teken = '(' then
          v_diepte := v_diepte + 1;
        elsif v_teken = ')' then
          v_diepte := v_diepte - 1;
          if v_diepte = 0 then
            if v_i = length(v_expr) then
              v_expr := btrim(substr(v_expr, 2, length(v_expr) - 2));
              v_gestript := true;
            end if;
            exit;
          end if;
        end if;
      end loop;
    end if;
    exit when not v_gestript or v_expr = '';
  end loop;

  v_diepte := 0;
  v_in_tekst := false;
  v_start := 1;
  v_i := 1;

  while v_i <= length(v_expr) loop
    v_teken := substr(v_expr, v_i, 1);
    if v_in_tekst then
      if v_teken = '''' then v_in_tekst := false; end if;
    elsif v_teken = '''' then
      v_in_tekst := true;
    elsif v_teken = '(' then
      v_diepte := v_diepte + 1;
    elsif v_teken = ')' then
      v_diepte := v_diepte - 1;
    elsif v_diepte = 0 and upper(substr(v_expr, v_i, 4)) = ' OR ' then
      return next btrim(substr(v_expr, v_start, v_i - v_start));
      v_i := v_i + 3;
      v_start := v_i + 1;
    end if;
    v_i := v_i + 1;
  end loop;

  return next btrim(substr(v_expr, v_start));
end;
$function$;

comment on function public.bovenste_or_takken(text) is
  'Splitst een genormaliseerde expressie op de bovenste OR-laag, zonder in '
  'subquerys of stringliteralen te splitsen — QS8-461. Hulpfunctie van '
  'leesroute_bewaking().';

-- ⚠️ `from public, anon, authenticated` en niet `from public` — in Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie
--    (beveiligingsregel 4). Alleen de suite roept hem aan, als `postgres`.
revoke execute on function public.bovenste_or_takken(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- De grendel, nu per tak
-- ---------------------------------------------------------------------------
--
-- ⚠️ `security definer`, om dezelfde reden als in 0259, `archiefleesgat()` en
--    `alleenlezen_bewaking()`: deze bewakingsfuncties draaien allemaal als
--    eigenaar, zodat de suite ze op één manier kan aanroepen.
--
-- ⚠️ `p.cmd in ('SELECT', 'ALL')` en alleen `p.qual`: de `using`-helft van een
--    `for all` stuurt óók SELECT aan. Dat is de les van QS8-458.
create or replace function public.leesroute_bewaking()
returns table (naam text, bezwaar text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- ⚠️⚠️ **Twee takken, en dat is een correctie die een security-review afdwong
  --    op 0259.** De eerste versie had één platte lijst gesanctioneerde toetsen,
  --    met `mag_groep_lezen` erop. 📏 Gemeten: die toetst alleen de **kijker** en
  --    doet **geen** archieftoets, dus
  --
  --      using (exists (select 1 from goal_group_links l
  --                     where l.goal_id = g.id and mag_groep_lezen(l.group_id)))
  --
  --    noemt netjes een gesanctioneerde naam en laat precies de verruiming door
  --    waar deze grendel voor bestaat. Met echte rijen, als `authenticated`:
  --
  --      gearchiveerde groep -> shares_group_with_goal = false, deze route = true
  --
  --    Een gearchiveerde groep die weer meeleest, ziet ook `missed`-weekdoelen —
  --    het schaamtemoment waar domeinregel 7 voor bestaat.
  --
  -- ⚠️ De splitsing volgt het register in `tests/rls/hulpfunctiemodel.test.ts`:
  --    alleen `shares_group_with_goal` en `deelt_open_groep_met_doel` dragen
  --    `nietInactief: 2` én `archief: true`. Dat zijn de enige twee die een
  --    **doel** mogen ontsluiten. `mag_groep_lezen` is met opzet zwakker (0153):
  --    een groepslezing mag een archief overleven, een doellezing niet.
  --
  -- ⚠️ **Nieuw in 0295: `t.tak` in plaats van `p.qual`.** Elke bovenste OR-tak
  --    wordt apart getoetst, want een policy is zo zwak als zijn zwakste tak
  --    (QS8-461). Op een `qual` zonder bovenste `or` levert dat precies één tak
  --    op en is het gedrag gelijk aan 0259.

  -- Tak 1 — de tak ontsluit een **doel**: alleen de twee sterke routes tellen.
  select distinct (p.tablename || '.' || p.policyname)::text,
         'leespolicy ontsluit een doel maar routeert niet via shares_group_with_goal() '
           || 'of deelt_open_groep_met_doel() — een zwakkere route laat een archief of '
           || 'een uitgetreden eigenaar door (QS8-459, per OR-tak sinds QS8-461)'
  from pg_policies p
       cross join lateral public.bovenste_or_takken(p.qual) as t(tak)
  where p.schemaname in ('public', 'storage')
    and p.cmd in ('SELECT', 'ALL')
    and coalesce(p.qual, '') <> 'false'
    and t.tak like '%goal_group_links%'
    and t.tak not like '%shares_group_with_goal%'
    and t.tak not like '%deelt_open_groep_met_doel%'
    and t.tak <> 'false'

  union

  -- Tak 2 — de tak ontsluit **groepslidmaatschap** zonder doel: de bredere
  -- lijst mag, want hier speelt de eigenaar van een doel geen rol.
  select distinct (p.tablename || '.' || p.policyname)::text,
         'leespolicy schrijft de lidmaatschapstoets zelf uit in plaats van een '
           || 'gedeelde toets aan te roepen — een kopie mist stilzwijgend een '
           || 'voorwaarde (QS8-459, per OR-tak sinds QS8-461)'
  from pg_policies p
       cross join lateral public.bovenste_or_takken(p.qual) as t(tak)
  where p.schemaname in ('public', 'storage')
    and p.cmd in ('SELECT', 'ALL')
    and coalesce(p.qual, '') <> 'false'
    and t.tak like '%group_members%'
    and t.tak not like '%goal_group_links%'
    and t.tak not like '%shares_group_with_goal%'
    and t.tak not like '%deelt_open_groep_met_doel%'
    and t.tak not like '%shares_group_with_user%'
    and t.tak not like '%is_group_member%'
    and t.tak not like '%is_group_admin%'
    and t.tak not like '%lid_van_open_groep%'
    and t.tak not like '%mag_groep_lezen%'
    and t.tak <> 'false'

  order by 1;
$function$;

comment on function public.leesroute_bewaking() is
  'Leespolicies die de lidmaatschapstabellen zelf uitschrijven of via een te zwakke '
  'route ontsluiten — QS8-459, per bovenste OR-tak sinds QS8-461. Nul rijen is de '
  'bedoeling.';

-- ⚠️ **`from public, anon, authenticated` en niet `from public`** — in Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie
--    (beveiligingsregel 4). Alleen de suite roept hem aan, als `postgres`.
revoke execute on function public.leesroute_bewaking() from public, anon, authenticated;
