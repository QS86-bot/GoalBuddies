-- 0287_create_group_stelt_dezelfde_vraag_als_de_check.sql — `create_group()`
-- normaliseerde de groepsnaam met `btrim()`, en `groups_name_schoon` toetst hem
-- met `schone_naam()` (QS8-515)
--
-- ROLLBACK-PAD:
--   De versie uit 0092, woordelijk. Twee dingen terug:
--     - `schone_naam := btrim(coalesce(group_name, ''));` in plaats van de
--       aanroep van `public.schone_naam()`;
--     - de lokale variabele heet weer `schone_naam` in plaats van `v_naam`
--       (declaratie, de twee lengtetoetsen en de `insert`-waarde).
--   Verder niets: deze migratie raakt geen tabel, geen policy en geen grant aan.
--   `create or replace` behoudt de bestaande grant op `create_group()`.
--
--   ⚠️ Terugdraaien zet het gat terug dat deze migratie sluit: een directe RPC
--      met een niet-ASCII rand loopt dan weer op de CHECK stuk met een kale
--      `23514` in plaats van een gestructureerd antwoord.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Bevindingen L1 en L2 uit de security-ronde op QS8-508, daarna zelf nagemeten
-- tegen `pg_get_functiondef('public.create_group(text,smallint,text,text)')` —
-- en niet tegen 0092, want een migratiebestand is niet de waarheid (de les van
-- 0084). De gedeployde versie bleek woordelijk gelijk aan 0092.
--
-- 0286 (QS8-508) zette `groups_name_schoon` op `groups`: `name =
-- public.schone_naam(name)`. `create_group()` streek de naam met `btrim()`, en
-- die strijkt uitsluitend ASCII-witruimte. De twee stellen dus een verschillende
-- vraag, en precies daartussen zit de fout.
--
-- 📏 Gemeten op de lokale stack, met de gedeployde functie:
--
--     btrim(U&'\00A0Jan\00A0')          ->  ' Jan '   (de NBSP blijft staan)
--     schone_naam(U&'\00A0Jan\00A0')    ->  'Jan'
--
-- De naam met de NBSP haalde de lengtetoets van `create_group()`, ging daarna de
-- `insert` in en viel om op `groups_name_schoon` — een kale `23514` uit
-- PostgREST, waar `src/modules/buddies/api.ts` een gestructureerde
-- `{ok: false, reason: …}` verwacht en naar een leesbare melding vertaalt.
--
-- ⚠️ **De app-route was niet geraakt.** `src/modules/buddies/schemas.ts` doet
--    `.transform(schoneNaam)` vóór de lengtetoets — dezelfde normalisatie,
--    dezelfde volgorde. Deze migratie brengt de database-route op gelijke hoogte
--    met de client-route; ze verruimt niets dat de client niet al deed.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ De tweede bevinding uit QS8-515 klopt níet, en dat is de helft die je
--       moet lezen voordat je hier iets aan verandert
-- ---------------------------------------------------------------------------
--
-- Het issue zegt dat de voor de hand liggende reparatie stukloopt op een
-- naamsbotsing: de lokale variabele heet `schone_naam` en zou de gelijknamige
-- functie binnen dit lichaam afschermen. **Dat is onjuist.**
--
-- 📏 Met de hand nagemeten op PostgreSQL 16.13, vier vormen, elk in een
--    `pg_temp`-functie met een lokale `schone_naam text` in de declaratie en
--    `search_path = public, pg_temp` — alle vier geven `'Jan'` voor
--    `U&'\00A0Jan\00A0'`:
--
--      schone_naam := public.schone_naam(p);          -> 'Jan'
--      schone_naam := schone_naam(p);                 -> 'Jan'
--      select public.schone_naam(p) into schone_naam; -> 'Jan'
--      select schone_naam(p) into schone_naam;        -> 'Jan'
--
--    plpgsql kiest op de vórm en niet op de naam: een identifier mét
--    argumentenlijst is een functieaanroep, een kale identifier is de variabele.
--    Er is hier dus geen botsing, ook niet zonder schema-prefix.
--
-- ⚠️ **En tóch wordt de variabele hernoemd.** Niet omdat het moet, maar omdat
--    `schone_naam := schone_naam(...)` als een zelftoekenning leest en de
--    volgende lezer dezelfde conclusie trekt die dit issue trok. Een regel die
--    je twee keer moet lezen om te weten of hij werkt, is een val die nog niet
--    is toegeslagen.
--
--    De nieuwe naam is `v_naam`. `schone_tz` en `schone_zicht` blijven zoals ze
--    heten: die schermen niets af, ze lezen niet dubbelzinnig, en ze meenemen
--    maakt de diff groter dan de wijziging.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ En `schone_naam()` is niet idempotent — dat is bij deze migratie
--       gemeten, en het bepaalt haar vorm
-- ---------------------------------------------------------------------------
--
-- Eén aanroep van `schone_naam()` is niet genoeg om `groups_name_schoon` te
-- halen. De uitvoer van die functie kan zélf nog geschonden zijn.
--
-- 📏 Gemeten, en met de hand teruggebracht tot één geval:
--
--     ruw              U&'\2001\+00FE05ab'   (EM QUAD, variatieselector, 'ab')
--     schone_naam 1x   U&'\+00FE05ab'        -- de EM QUAD is een randteken en gaat weg
--     schone_naam 2x   'ab'                  -- nú pas gaat de variatieselector weg
--
--    En die uitvoer van één aanroep landt niet: een `insert` ermee weigert op
--    `groups_name_geen_onzichtbaar_tussen_letters`. De randstap haalt het
--    buitenste teken weg en schuift daarmee het volgende teken naar een positie
--    waar een ándere stap er wél iets van vindt — maar die stap is in diezelfde
--    aanroep al geweest.
--
-- 📏 De schaal ervan, want één geval zegt niets over de vorm van de reparatie:
--    de **4.261** codepunten waar `schone_naam()` iets aan doet, elk achtste
--    daarvan genomen (**533**), en alle paren daarvan in vier vormen —
--    **1.136.356** gevallen. Daarvan zijn er **256** niet idempotent, en alle
--    256 zakken op `zonder_onzichtbaar_tussen_letters`. De **maximale diepte
--    tot een vast punt is 2**.
--
-- ⚠️ **Dat is een defect in `schone_naam()` en niet in deze functie**, en het
--    raakt meer dan groepen: `handle_new_user()` normaliseert de naam uit een
--    aanmelding óók met één aanroep, en `profiles_display_name_schoon` stelt
--    dezelfde eis. Het staat als QS8-526 in Linear; hier wordt het niet
--    gerepareerd, want dat vraagt dezelfde wijziging in `schoneNaam()` in
--    `src/shared/tekst` — die twee staan onder een naadtest die het hele
--    codepuntbereik afloopt.
--
-- **Wat deze migratie er wél mee doet**, want de belofte van QS8-515 is dat deze
-- route een reden teruggeeft en geen `23514`:
--
--   1. **Normaliseren tot een vast punt.** `schone_naam()` wordt herhaald tot de
--      uitvoer niet meer verandert, met een plafond van vijf. Gemeten is twee
--      genoeg; vijf is de marge. Dit is bovendien wat de app-route feitelijk al
--      deed — `schemas.ts` strijkt client-side en `create_group()` strijkt
--      daarna nog eens — en het is de enige waarde die de tabel accepteert: de
--      CHECK vraagt om een vast punt, dus daar hoort de schrijver er een van te
--      maken.
--   2. **Een `exception when check_violation` om de `insert`.** Weigert een
--      CHECK op `name` het alsnog, dan komt er `{ok: false, reason:
--      'name_invalid'}` uit en geen kale `23514`. Alleen voor `groups_name%`;
--      elke andere CHECK gaat ongewijzigd door, want die zou een echte fout
--      verbergen.
--
-- ⚠️ **Die handler is geen grendel die nooit vuurt.** Dat was de reden om hem
--    eerst wég te laten, en die reden was gebaseerd op een aanname die de meting
--    hierboven onderuithaalde. Hij is te ijken: zet er een CHECK op `groups.name`
--    bij die `schone_naam()` niet impliceert, en `create_group()` hoort
--    `name_invalid` terug te geven in plaats van om te vallen.
--
-- `groups` draagt zeven CHECKs op `name` — `groups_name_een_regel`,
-- `groups_name_geen_bidi`, `groups_name_geen_losse_tag`,
-- `groups_name_geen_nul_pixels`, `groups_name_geen_onzichtbaar_tussen_letters`,
-- `groups_name_len` en `groups_name_schoon`. De twee stappen hierboven vangen ze
-- alle zeven af, en de achtste die er ooit bij komt ook.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Wat er verandert voor wie de RPC rechtstreeks aanroept
-- ---------------------------------------------------------------------------
--
-- Een naam met een override werd gewéígerd en wordt nu gestreken. Dat is
-- dezelfde uitkomst als de app-route al gaf, en de belofte eronder — *er landt
-- geen groepsnaam die als een andere groep rendert* — is in beide gevallen waar.
-- Blijft er na het strijken minder dan twee tekens over, dan is het antwoord
-- `name_too_short`, en dat is een reden die `api.ts` al vertaalt.
--
-- ⚠️ **De CHECKs blijven onverkort staan, en dat is geen restant.** Ze gelden
--    voor élke schrijver, en de tweede schrijver op deze kolom is een kale
--    PATCH van een beheerder (📏 `has_column_privilege('authenticated',
--    'public.groups', 'name', 'UPDATE')` is `t`, en `guard_group_update()`
--    noemt `name` niet). Die route normaliseert niets en hoort te wéígeren;
--    `tests/rls/de-rand-van-een-naam.test.ts` pint dat per constraintnaam.

/**
 * `create_group()` opnieuw.
 *
 * ⚠️ Uit `pg_get_functiondef()` overgenomen en niet uit 0092 gereconstrueerd —
 *    de les van 0084. Drie wijzigingen: de lokale `schone_naam` heet `v_naam`,
 *    de normalisatie is `public.schone_naam()` tot een vast punt in plaats van
 *    `btrim()`, en de `insert` vertaalt een CHECK op `name` naar een reden.
 */
create or replace function public.create_group(
  group_name text,
  huddle_day smallint default 0,
  tz text default 'Europe/Amsterdam',
  zichtbaarheid text default 'beschermd'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw          groups;
  vandaag        integer;
  lidmaatschap   integer;
  v_naam         text;
  v_vorig        text;
  v_beperking    text;
  schone_tz      text;
  schone_zicht   text;
  pogingen       integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  -- ⚠️ **`public.schone_naam()` en niet `btrim()`** — QS8-515. De lengtetoets
  --    hieronder en `groups_name_schoon` stellen daarmee dezelfde vraag; met
  --    `btrim()` stelden ze er twee, en tussen die twee viel een niet-ASCII rand
  --    door naar een kale `23514`.
  --
  -- ⚠️⚠️ **Tot een vast punt en niet één keer**, want `schone_naam()` is niet
  --    idempotent — 📏 gemeten bij deze migratie, 256 van 1.136.356 paargevallen,
  --    maximale diepte 2. De CHECK vraagt letterlijk om een vast punt
  --    (`name = schone_naam(name)`), dus daar hoort de schrijver er een van te
  --    maken. Het plafond van vijf is de marge op die gemeten twee; wordt het
  --    ooit toch niet gehaald, dan vangt de handler bij de `insert` het af als
  --    `name_invalid`. Uitleg en het gemeten geval staan in de kop.
  --
  -- ⚠️ De prefix `public.` is niet nodig — `search_path` staat erop en plpgsql
  --    kiest een functieaanroep op de vorm — maar hij staat er omdat deze regel
  --    anders als een zelftoekenning leest. Zie de kop.
  -- ⚠️⚠️ **Een grove bovengrens vóór de dure normalisatie, en die staat hier
  --    doordat deze migratie hem duur máákte.** 📏 Gemeten op de lokale stack met
  --    vijf miljoen zero-width spaties: `btrim()` kost **94 ms**,
  --    `public.schone_naam()` kost **1.470 ms** — en de lus draait hem tot twee
  --    keer. Dit werk gebeurde vóór élke limiet, en omdat er geen groep van komt
  --    telt `daily_limit` niet op: één ingelogde gebruiker kon het onbeperkt
  --    herhalen. Op de gratis tier is `max_connections` 60 voor de héle database.
  --
  --    Het ontbreken van deze grens stond er al; de factor vijftien is van deze
  --    migratie, en dus hoort de reparatie hier. Gevonden in de security-ronde op
  --    QS8-515 en zelf nagemeten.
  --
  -- ⚠️ **Duizend en niet zestig**, want de grens ná het strijken is zestig en
  --    onzichtbare tekens tellen daar niet in mee. Dit is een rem op misbruik en
  --    geen tweede naamregel: hij hoort nooit te vuren voor iets dat een naam is.
  --    Een aanroeper die tóch meer stuurt krijgt `name_too_long` — gestructureerd,
  --    en dat is wat deze migratie belooft.
  if char_length(coalesce(group_name, '')) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_long');
  end if;

  v_naam := coalesce(group_name, '');
  for i in 1..5 loop
    v_vorig := v_naam;
    v_naam  := public.schone_naam(v_vorig);
    exit when v_naam = v_vorig;
  end loop;
  if length(v_naam) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_short');
  end if;
  if length(v_naam) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_long');
  end if;

  if huddle_day is null or huddle_day < 0 or huddle_day > 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_huddle_day');
  end if;

  schone_tz := coalesce(tz, 'Europe/Amsterdam');
  if not exists (select 1 from pg_timezone_names where name = schone_tz) then
    schone_tz := 'Europe/Amsterdam';
  end if;

  schone_zicht := coalesce(zichtbaarheid, 'beschermd');
  if schone_zicht not in ('beschermd', 'open') then
    schone_zicht := 'beschermd';
  end if;

  -- ⚠️ **Deze telling wérkt nu pas.** Hij telt `groups`-rijen van het laatste
  --    etmaal, en tot 0092 kon je die rijen zelf weggooien — dus de limiet van
  --    tien gold alleen voor wie hem niet probeerde te omzeilen. Nu er niets meer
  --    verdwijnt, telt hij wat hij altijd al bedoelde te tellen. Er is hier geen
  --    regel veranderd; de grond eronder is gerepareerd.
  select count(*) into vandaag
  from groups
  where created_by = auth.uid()
    and created_at > now() - interval '1 day';

  if vandaag >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  -- ⚠️ Gearchiveerde groepen tellen hier níét mee. Zonder die uitzondering is
  --    archiveren duurder dan weggooien was: je raakt de groep kwijt én je plek
  --    blijft bezet. Dan archiveert niemand, en staat er een slot dat niemand
  --    omdraait. De misbruikrem zit in `daily_limit` hierboven, niet in deze
  --    telling.
  select count(*) into lidmaatschap
  from group_members m
  join groups g on g.id = m.group_id
  where m.user_id = auth.uid()
    and m.status <> 'inactive'
    and g.status <> 'archived';

  if lidmaatschap >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  loop
    pogingen := pogingen + 1;
    begin
      insert into groups (name, created_by, invite_code, huddle_day, tz, zichtbaarheid)
      values (v_naam, auth.uid(), generate_invite_code(), huddle_day, schone_tz,
              schone_zicht)
      returning * into nieuw;
      exit;
    exception
      when unique_violation then
        if pogingen >= 3 then raise; end if;
      -- ⚠️⚠️ **Alleen een CHECK die over `groups.name` gaat; elke andere gaat
      --    ongewijzigd door.** Een handler die élke `check_violation` naar een
      --    nette reden vertaalt, verbergt een echte fout achter een
      --    gebruikersmelding. De naam van de beperking staat in
      --    `GET STACKED DIAGNOSTICS` en niet in de tekst van `sqlerrm`, want die
      --    tekst is vertaalbaar.
      --
      -- ⚠️⚠️ **En de vraag gaat naar `pg_constraint` en niet naar een patroon op
      --    de naam.** Een toets op `groups_name%` leest de naamgeving van
      --    vandaag en niet de eigenschap: een achtste CHECK die `groups_naam_…`
      --    of `groups_titel_schoon` heet valt er stil buiten, en dan is de kale
      --    `23514` terug op precies de plek die deze migratie sluit. Zelfde
      --    keuze als in het naadblok van
      --    `tests/rls/create_group-antwoordt-gestructureerd.test.ts`.
      when check_violation then
        get stacked diagnostics v_beperking = constraint_name;
        if exists (
          select 1
          from pg_constraint c
          join pg_attribute a
            on a.attrelid = c.conrelid and a.attname = 'name'
          where c.conname  = v_beperking
            and c.conrelid = 'public.groups'::regclass
            and c.contype  = 'c'
            and a.attnum   = any (c.conkey)
        ) then
          return jsonb_build_object('ok', false, 'reason', 'name_invalid');
        end if;
        raise;
    end;
  end loop;

  insert into group_members (group_id, user_id, role, status)
  values (nieuw.id, auth.uid(), 'admin', 'active');

  return jsonb_build_object('ok', true, 'group', to_jsonb(nieuw));
end;
$$;

comment on function public.create_group(text, smallint, text, text) is
  'Maakt een groep aan en zet de aanroeper erin als beheerder. Normaliseert de '
  'naam met public.schone_naam() tot een vast punt — dezelfde vraag als '
  'groups_name_schoon — en vertaalt een CHECK op name naar reason = '
  'name_invalid, zodat deze route geen kale 23514 meer kan geven (QS8-515, '
  'migratie 0287).';
