-- 0295_leesroute_bewaking_toetst_elke_or_tak_apart.sql — een tweede, zwakkere
-- OR-tak naast een sterke aanroep bleef ongemeld (QS8-461)
--
-- ROLLBACK-PAD:
--   drop function if exists public.leesroute_bewaking();
--   drop function if exists public.or_takken(text, int, boolean);
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
--    298 migraties op een lege database, `scripts/schema-opbouwen.sh`), met de
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
-- ⚠️⚠️ De eerste versie van deze migratie splitste alleen de bovenste OR-laag,
--      en dat was niet genoeg — met de meting erbij
-- ---------------------------------------------------------------------------
--
-- Die versie ging uit van: `and` versmalt, `or` verbreedt, dus alleen de
-- bovenste `or` hoeft per tak getoetst. **Dat klopt als bewering over strengheid
-- en het meet het verkeerde**, en een security-review op deze migratie vond het.
--
-- 📏 `goal_events_select` — de policy waarmee 0259 zijn eigen meting deed — ziet
--    er vandaag zo uit:
--
--      (EXISTS ( SELECT 1 FROM goals g
--        WHERE ((g.id = goal_events.goal_id)
--           AND ((g.owner_id = ( SELECT auth.uid() AS uid)) OR shares_group_with_goal(g.id)))))
--
--    De gesanctioneerde aanroep staat **binnen** de subquery. De natuurlijke
--    plek voor "een tak erbij" is dus náást hém, één laag dieper — en daar keek
--    de bovenste-laag-versie niet. 📏 Gemeten met precies die vorm plus een
--    derde OR-tak: **0 rijen, het gat volledig open.**
--
-- 📏 En de prevalentie: van de **48** SELECT/ALL-policies in `public`+`storage`
--    hebben er **35** één bovenste tak, waarvan er **8** tóch een ` OR ` dragen
--    (dieper genest). Vier van de acht policies die een gesanctioneerde
--    doeltoets noemen, staan in die blinde vlek.
--
-- ⚠️⚠️ **De reden die er stond, was bovendien gemeten onwaar.** De eerste versie
--    schreef dat dieper splitsen "meldingen zou opleveren over takken die door
--    een omsluitende `and` al afgedekt zijn". 📏 Nagemeten op de 48 echte
--    policies: dieper splitsen geeft **nul** meldingen. De gestelde prijs
--    bestaat vandaag niet.
--
--    En de logica meet het verkeerde: in `g.id = goal_events.goal_id AND (eigenaar
--    OR sterk OR zwak)` is de omsluitende `and` een **join**conditie en geen
--    autorisatietoets. Die versmalt de rijen, niet de rechten; een extra `or`
--    verbreedt daar onverkort.
--
--    Dat is precies de klasse die CLAUDE.md het duurst noemt: *"een afwijking
--    die je onderbouwt is duurder dan een die je vergeet"*. De onderbouwing
--    stond er, en hij was fout.
--
-- ---------------------------------------------------------------------------
-- Waarom élke OR-tak, op elke diepte
-- ---------------------------------------------------------------------------
--
-- `or_takken()` geeft twee dingen terug en niets anders:
--
--   1. de hele expressie, en
--   2. elke disjunct die door een `or` ontstaat, op welke diepte dan ook.
--
-- **Een omhulsel is geen tak.** Het lichaam van een `exists` dat geen `or`
-- draagt, komt er niet uit; er wordt wél doorheen gekeken om een `or` te vinden
-- die dieper ligt. Dat onderscheid is precies waar een naïeve afdaling op stukloopt
-- — zie de ⚠️⚠️ in het lichaam hieronder, met de meting.
--
-- Dit werkt om één reden: **de tak die een doel ontsluit draagt zijn eigen
-- `from`**. De aanvalsvorm is `or exists (select 1 from goal_group_links l join
-- group_members m …)`, en die hele `exists` ís de disjunct — inclusief de
-- tabelnamen waarop tak 1 en tak 2 matchen.
--
-- ⚠️ **En daarom blijven de must-allows stil.** Bij
--    `shares_group_with_goal(goal_id) and exists (select 1 from goal_group_links
--    l where …)` is er geen enkele `or`, dus is er precies één tak: de hele
--    expressie, en die draagt de sterke aanroep. Draagt de `where` binnen dat
--    `exists` wél een `or`, dan zijn de takken de twee helften van díe `or`, en
--    die noemen de tabel niet — de tabelnaam blijft in het omhulsel.
--    📏 Gemeten: nul valse meldingen op alle 48 echte policies.
--
-- ⚠️ `p_diepte > 12` is een rem en geen grens die ooit geraakt hoort te worden;
--    de diepste `qual` in dit schema is 560 tekens. Een onbegrensde recursie op
--    een expressie die door iemand anders geschreven is, is een DoS-oppervlak.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- De splitser
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Waarom geen `string_to_array(qual, ' OR ')`.** Die splitst ook binnen een
--    subquery, binnen een stringliteral én binnen een aanhalingstekennaam, en
--    dan meldt `leesroute_bewaking()` takken die geen takken zijn. Deze loopt de
--    tekst teken voor teken af met een haakjesdiepte, een vlag voor
--    stringliteralen (`'…'`) en een vlag voor aanhalingstekennamen (`"…"`).
--
-- ⚠️⚠️ **Die tweede vlag is geen netheid maar een grendel, en hij ontbrak in de
--    eerste versie.** 📏 Gemeten met een kolom `"it's"`: één apostrof in een
--    aanhalingstekennaam zette de stringliteraalvlag permanent verkeerd, de hele
--    `qual` werd één tak, en een zwakke kopie erachter bleef **ongemeld** —
--    QS8-461 volledig terug via een andere deur. Een kolomnaam volstond om deze
--    grendel uit te zetten. Spiegelbeeld gemeten met `"vlag or niet"`: daar
--    splitste hij *binnen* de naam en meldde hij een volstrekt veilige policy.
--
-- ⚠️ `immutable` en niet `stable`: deze functie leest niets, hij rekent alleen
--    op zijn argument. En bewust **geen** `security definer` — er valt niets te
--    ontsluiten.
create or replace function public.or_takken(
  p_expr          text,
  p_diepte        int default 0,
  p_alleen_dieper boolean default false
)
returns setof text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expr        text := btrim(coalesce(p_expr, ''));
  v_i           int;
  v_diepte      int;
  v_in_tekst    boolean;
  v_in_naam     boolean;
  v_start       int;
  v_teken       text;
  v_gestript    boolean;
  v_gesplitst   boolean := false;
  v_groep_start int;
begin
  if v_expr = '' or p_diepte > 12 then
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
      v_in_naam := false;
      for v_i in 1 .. length(v_expr) loop
        v_teken := substr(v_expr, v_i, 1);
        if v_in_tekst then
          if v_teken = '''' then v_in_tekst := false; end if;
        elsif v_in_naam then
          if v_teken = '"' then v_in_naam := false; end if;
        elsif v_teken = '''' then
          v_in_tekst := true;
        elsif v_teken = '"' then
          v_in_naam := true;
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

  -- 1. Splitsen op ` OR ` op diepte 0, en elke helft opnieuw aanbieden.
  v_diepte := 0;
  v_in_tekst := false;
  v_in_naam := false;
  v_start := 1;
  v_i := 1;

  while v_i <= length(v_expr) loop
    v_teken := substr(v_expr, v_i, 1);
    if v_in_tekst then
      if v_teken = '''' then v_in_tekst := false; end if;
    elsif v_in_naam then
      if v_teken = '"' then v_in_naam := false; end if;
    elsif v_teken = '''' then
      v_in_tekst := true;
    elsif v_teken = '"' then
      v_in_naam := true;
    elsif v_teken = '(' then
      v_diepte := v_diepte + 1;
    elsif v_teken = ')' then
      v_diepte := v_diepte - 1;
    elsif v_diepte = 0 and upper(substr(v_expr, v_i, 4)) = ' OR ' then
      v_gesplitst := true;
      return query select * from public.or_takken(
        substr(v_expr, v_start, v_i - v_start), p_diepte + 1, false);
      v_i := v_i + 3;
      v_start := v_i + 1;
    end if;
    v_i := v_i + 1;
  end loop;

  if v_gesplitst then
    return query select * from public.or_takken(substr(v_expr, v_start), p_diepte + 1, false);
    return;
  end if;

  -- 2. Geen bovenste `or`. Dit is een blad, en of het een **tak** is hangt
  --    ervan af hoe we hier gekomen zijn.
  --
  -- ⚠️⚠️ **Dit onderscheid is de tweede correctie op deze migratie, en zonder
  --    hem meldt de grendel veilige policies.** 📏 Gemeten: een versie die élk
  --    blad teruggaf, meldde `shares_group_with_goal(goal_id) and exists (select
  --    1 from goal_group_links l where …)` — een must-allow — omdat het afdalen
  --    het `exists`-lichaam losweekte van de sterke aanroep ernaast. De tabel
  --    reisde mee, de aanroep niet.
  --
  --    Een blad is dus alleen een tak als het **door een `or` is ontstaan** (of
  --    de hele expressie is). Afdalen doen we nog steeds, maar uitsluitend om
  --    een `or` te vínden die dieper ligt — niet om het omhulsel zelf als tak
  --    aan te bieden. Daarom `p_alleen_dieper`.
  if not p_alleen_dieper then
    return next v_expr;
  end if;

  v_diepte := 0;
  v_in_tekst := false;
  v_in_naam := false;
  v_groep_start := 0;
  v_i := 1;

  while v_i <= length(v_expr) loop
    v_teken := substr(v_expr, v_i, 1);
    if v_in_tekst then
      if v_teken = '''' then v_in_tekst := false; end if;
    elsif v_in_naam then
      if v_teken = '"' then v_in_naam := false; end if;
    elsif v_teken = '''' then
      v_in_tekst := true;
    elsif v_teken = '"' then
      v_in_naam := true;
    elsif v_teken = '(' then
      v_diepte := v_diepte + 1;
      if v_diepte = 1 then v_groep_start := v_i + 1; end if;
    elsif v_teken = ')' then
      if v_diepte = 1 and v_groep_start > 0 then
        return query select * from public.or_takken(
          substr(v_expr, v_groep_start, v_i - v_groep_start), p_diepte + 1, true);
      end if;
      v_diepte := v_diepte - 1;
    end if;
    v_i := v_i + 1;
  end loop;
end;
$function$;

comment on function public.or_takken(text, int, boolean) is
  'Splitst een genormaliseerde expressie in elke OR-disjunct op elke diepte, '
  'zonder in subquerys, stringliteralen of aanhalingstekennamen te splitsen — '
  'QS8-461. Hulpfunctie van leesroute_bewaking().';

-- ⚠️ `from public, anon, authenticated` en niet `from public` — in Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie
--    (beveiligingsregel 4). Alleen de suite roept hem aan, als `postgres`.
revoke execute on function public.or_takken(text, int, boolean) from public, anon, authenticated;

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
  -- ⚠️ **Nieuw in 0295: `t.tak` in plaats van `p.qual`.** Elke OR-disjunct op
  --    elke diepte wordt apart getoetst, want een policy is zo zwak als zijn
  --    zwakste tak (QS8-461). Op een `qual` zonder enige `or` levert dat precies
  --    één tak op en is het gedrag gelijk aan 0259.
  --
  -- ⚠️ `union` en niet `union all`: dezelfde policy kan meer dan één zwakke tak
  --    dragen en hoort één keer in de lijst te staan. Een policy die béide takken
  --    raakt geeft nog steeds twee rijen, want `bezwaar` verschilt. Het aantal
  --    rijen telt dus policies en geen takken.

  -- Tak 1 — de tak ontsluit een **doel**: alleen de twee sterke routes tellen.
  select (p.tablename || '.' || p.policyname)::text,
         'leespolicy ontsluit een doel maar routeert niet via shares_group_with_goal() '
           || 'of deelt_open_groep_met_doel() — een zwakkere route laat een archief of '
           || 'een uitgetreden eigenaar door (QS8-459, per OR-tak sinds QS8-461)'
  from pg_policies p
       cross join lateral public.or_takken(p.qual) as t(tak)
  where p.schemaname in ('public', 'storage')
    and p.cmd in ('SELECT', 'ALL')
    and coalesce(p.qual, '') <> 'false'
    and t.tak like '%goal_group_links%'
    and t.tak not like '%shares_group_with_goal%'
    and t.tak not like '%deelt_open_groep_met_doel%'

  union

  -- Tak 2 — de tak ontsluit **groepslidmaatschap** zonder doel: de bredere
  -- lijst mag, want hier speelt de eigenaar van een doel geen rol.
  select (p.tablename || '.' || p.policyname)::text,
         'leespolicy schrijft de lidmaatschapstoets zelf uit in plaats van een '
           || 'gedeelde toets aan te roepen — een kopie mist stilzwijgend een '
           || 'voorwaarde (QS8-459, per OR-tak sinds QS8-461)'
  from pg_policies p
       cross join lateral public.or_takken(p.qual) as t(tak)
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

  order by 1;
$function$;

comment on function public.leesroute_bewaking() is
  'Leespolicies die de lidmaatschapstabellen zelf uitschrijven of via een te zwakke '
  'route ontsluiten — QS8-459, per OR-tak op elke diepte sinds QS8-461. Nul rijen is '
  'de bedoeling.';

-- ⚠️ **`from public, anon, authenticated` en niet `from public`** — in Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie
--    (beveiligingsregel 4). Alleen de suite roept hem aan, als `postgres`.
revoke execute on function public.leesroute_bewaking() from public, anon, authenticated;
