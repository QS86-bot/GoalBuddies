-- 0216_een_dagplafond_en_een_rem_op_group_events.sql — de `unchanged`-toets bewaakt de herhaling en niet het aantal, dus heen en weer zetten groeit onbeperkt (QS8-374)
--
-- ROLLBACK-PAD:
--   drop trigger if exists groepsgebeurtenissen_rem on public.group_events;
--   drop trigger if exists groepsgebeurtenissen_dagplafond on public.group_events;
--   drop function if exists public.rem_groepsgebeurtenissen();
--   drop function if exists public.begrens_groepsgebeurtenissen();
--   drop function if exists public.groepsgebeurtenissen_plafond();
--   drop function if exists public.groepsgebeurtenissen_telt_mee(text);
--   drop index if exists public.group_events_actor_vers_idx;
--   -- en `sleutelzetters()` terugzetten op de definitie uit **0214**: die kent
--   -- `app.rem_groepsgebeurtenissen` niet. Lees hem uit de dráaiende database en
--   -- kopieer hem niet uit een migratiebestand — zie QS8-358 en het blok onderaan.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack, 08-09-2026, bij QS8-369: één beheerder, één
-- eigen groep, 200 aanroepen van `zet_groepsontdekbaarheid()` die telkens de
-- ándere kant op zetten.
--
--     flip 1 -> {"ok": true, "ontdekbaar": true}
--     flip 2 -> {"ok": true, "ontdekbaar": false}
--     group_events na 200 flips: 200
--
-- Alle 200 geaccepteerd, alle 200 een rij, in één transactie.
--
-- ⚠️ **Elke schrijver heeft een toets tegen herhaling en die doet precies wat
-- hij belooft.** Dezelfde waarde nóg een keer zetten geeft
-- `{"ok": false, "reason": "unchanged"}` en schrijft niets. Waar die toets niet
-- over gaat is heen en weer: A → B is een verandering, B → A ook, en elke flip
-- is dus een geldige gebeurtenis die terecht geregistreerd wordt. De toets
-- bewaakt de herhaling; het aantal bewaakt hij niet. Onwrikbare regel 18: elk
-- onderdeel klopt en het geheel lekt.
--
-- ⚠️ 📏 **Het zijn er acht en niet zeven.** Het issue noemde de zeven RPC's die
-- `authenticated` mag aanroepen; een scan over `pg_proc.prosrc` geeft er acht.
-- De achtste is `meld_uitzetting()`, een `after update`-trigger op
-- `group_members` die via `guard_group_member_update()` loopt — `authenticated`
-- mag hem niet uitvoeren, maar hij schrijft wél een rij zodra een beheerder een
-- lid op `inactive` zet. Zijn toets is geen `unchanged` maar
-- `new.status = 'inactive' and old.status <> 'inactive'`; dezelfde vorm, andere
-- woorden. Ook hij telt dus mee in dit plafond, en dat hóórt: het is dezelfde
-- beheerder die de handeling doet.
--
-- ⚠️ Eén van de acht hééft er iets tegen, en dat is geen toeval:
-- `zet_groepszichtbaarheid()` draagt een `too_soon`-afkoeling, omdat een
-- omzetting daar met terugwerkende kracht verandert wat er over ándere leden
-- zichtbaar wordt (domeinregel 7, besluit A41). Daar had iemand er al over
-- nagedacht. De andere zes niet.
--
-- ⚠️ **Twee kanten, en de tweede weegt zwaarder dan de bytes.** `group_events`
-- is de auditrij van een groep en is voor de groep leesbaar. Tweehonderd rijen
-- "X zette de groep op ontdekbaar / niet-ontdekbaar" maken elk echt auditspoor
-- onvindbaar. Dat is geen domeinregel-7-lek, maar het is wel een auditspoor dat
-- je met ruis kunt dichtgooien.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Waarom 500, en waar dat getal vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **De zwaarste legitieme dag is gemeten en niet geschat: 110.** Eén
-- beheerder maakt tien groepen aan — het maximum, `create_group()` weigert bij
-- tien per etmaal én bij tien lidmaatschappen — en vult ze alle tien tot de rand
-- van twaalf leden. Dat zijn 10 × 11 = 110 aanroepen van
-- `beslis_lidmaatschapsverzoek()`, en die schrijft onvoorwaardelijk een rij, bij
-- accepteren én bij weigeren. `create_group()` zelf schrijft er geen.
--
-- Bovenop die 110 komen de instellingen (huddledag, zichtbaarheid,
-- ontdekbaarheid, archiveren, heropenen, verlaten) — een handvol per groep — en
-- de weigeringen, want ook een afgewezen verzoek is een rij.
--
-- ⚠️⚠️ **Hier stond dat vijfhonderd weigeringen vijfhonderd verschillende mensen
-- vragen, en dat was een factor tien mis.** 📏 De security-review op deze branch
-- mat het na: `lidmaatschapsverzoeken_over()` begrenst tien verzoeken per
-- **aanvrager** per dag, en ná een weigering mag dezelfde persoon opnieuw
-- aanvragen. Eén account levert dus tien rijen op naam van de beheerder op, en
-- vijftig accounts vullen een plafond van 500.
--
-- Dat is de reden dat `join_request_decided` sinds die review **niet meetelt** —
-- zie het blok hieronder. Weigeringen zijn daarmee geen argument meer voor de
-- hoogte van dit plafond; wat overblijft zijn de vier instellingen die je zelf
-- heen en weer kunt zetten, en daarvoor is 500 ruim.
--
-- 500 past in de bestaande reeks (`berichten` 500, `dagzetten` 500,
-- `voltooiingen` 500) en snijdt de onbegrensde flip-flop terug tot 500 rijen per
-- gebruiker per etmaal.
--
-- ⚠️ **Wat dit plafond niet is: een grens op het totaal.** Het telt het laatste
-- etmaal, net als de vijftien ervoor. Wie elke dag vijfhonderd gebeurtenissen
-- maakt, komt er over een jaar alsnog. Dat is een andere as en die staat als
-- dossierrij.
--
-- ---------------------------------------------------------------------------
-- Twee lagen, dezelfde vorm als 0200/0207/0214
-- ---------------------------------------------------------------------------
--
--   1. `groepsgebeurtenissen_dagplafond` — de grendel. `after insert … for each
--      statement` met een transitietabel, zodat een batch als geheel telt en
--      niet rij voor rij langs een teller glipt (QS8-343, migratie 0192).
--   2. `groepsgebeurtenissen_rem` — de noodstop van 0200. Een transitietabel
--      bestáát alleen in `AFTER`, dus zónder deze `before insert … for each row`
--      schrijft Postgres een geweigerde batch eerst fysiek weg.
--
--      📏 Nagemeten op déze tabel: een geweigerde batch van 20.000 laat hem op
--      **240 kB** staan met de rem, en op **3440 kB** met de rem uit — beide
--      keren met nul overgebleven rijen, en dat verschil komt pas terug bij een
--      `vacuum full`. Op een gratis tier zonder backups is dat het hele punt.
--
--      ⚠️ 240 kB en niet 40: de rem laat er duizend door voordat hij stopt
--      (`plafond * 2`). Dat is met opzet — hij is de noodstop en niet het
--      plafond, en zijn melding hoort die van de grendel niet te overstemmen.
--
-- ⚠️ **Er komt géén derde laag met een `reason`**, en dat is een verschil met
-- 0214. Daar was `registreer_push_token()` één RPC met één duidelijke uitkomst;
-- hier zijn het zeven RPC's die elk hun eigen `reason`-vocabulaire hebben, en
-- `group_events` is bij alle zeven een **neveneffect** en niet de handeling zelf.
-- Een gebruiker die het plafond raakt, raakt het dus tijdens iets anders. Wat
-- daar de nette weigering van is, hangt per RPC af en is een eigen afweging;
-- deze migratie zet de grendel en verzint die zeven teksten niet.

create or replace function public.groepsgebeurtenissen_plafond()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 500 $$;

comment on function public.groepsgebeurtenissen_plafond() is
  'Hoeveel groepsgebeurtenissen één gebruiker per etmaal mag veroorzaken. 500 is '
  'ruim vier keer de gemeten zwaarste legitieme dag (110: tien groepen tot de '
  'rand gevuld). Zie 0216 en QS8-374.';

-- ⚠️ Onwrikbare regel 4: `authenticated` staat er met zoveel woorden bij. Deze
--    drie worden alleen aangeroepen vanuit een trigger, dus er komt geen grant
--    terug — zelfde afweging als bij `pushtokens_plafond()` in 0214.
revoke execute on function public.groepsgebeurtenissen_plafond()
  from public, anon, authenticated;

-- ⚠️⚠️ **Welke gebeurtenissen meetellen, en waarom dat een denylist is.**
--
-- Een nieuw `event_type` telt **wél** mee tenzij het hieronder staat. Dat is met
-- opzet dezelfde kant op als domeinregel 7: beschermd is het antwoord tot iemand
-- het tegendeel besluit. Wie een type vrijstelt, schrijft de reden erbij.
--
-- 📏 De vrijstellingen komen uit de security-review op deze branch, en alle drie
-- de schakels zijn nagemeten:
--
--   1. Eén aanvallersaccount levert **10** rijen op naam van de beheerder per
--      etmaal op: `lidmaatschapsverzoeken_over()` staat tien verzoeken per
--      aanvrager per dag toe, en ná een weigering mag dezelfde persoon opnieuw
--      aanvragen. Tien verzoek/weigering-cycli met één account gaven tien rijen.
--      Vijftig nepaccounts vullen dus een plafond van 500 — niet vijfhonderd
--      mensen, zoals de eerste versie van deze kop beweerde.
--   2. Op het plafond valt `verlaat_groep()` om met een exception die de hele
--      transactie terugdraait, óók voor een gewoon lid:
--      `Te veel groepsgebeurtenissen in één dag (1 erbij, 501 …)`.
--   3. En voor de énige beheerder loopt dat pad via `archiveer_groep()` — zie
--      `verlaat_groep()`, waar de sluitregel `archiveer_groep(p_group_id, true)`
--      aanroept. `group_archived` ligt dus óók op de uitgang.
--
-- ⚠️ **De groep verlaten is in deze app de manier waarop iemand zijn toestemming
-- intrekt.** De onderbouwing van domeinregel 7 noemt met zoveel woorden de
-- leidinggevende die in de groep zit. Iemand die eruit wil en er een etmaal lang
-- niet uit kán, is precies het geval waarvoor die regel bestaat — en dat slot
-- bestond vóór deze migratie niet. Een plafond dat de uitgang meebegrenst, is
-- erger dan het lek dat het dicht.
--
-- ⚠️ En `join_request_decided` is de énige soort waarvan een **ánder** het aantal
-- bepaalt. Meetellen maakt het plafond een wapen in handen van wie de
-- verzoeken stuurt, in plaats van een grens op wie de rijen veroorzaakt.
--
-- ⚠️ `member_removed` is begrensd door de groepsgrootte (twaalf per groep, tien
-- groepen) en een uitgezet lid komt alleen terug via een nieuw verzoek — dat is
-- zíjn quotum. Een beheerder die zijn ledenlijst beheert, hoort daar niet op te
-- stuiten.
--
-- Wat er dus wél meetelt zijn de vier instellingen die je onbeperkt heen en weer
-- kunt zetten — en dat is precies wat de meting van 200 flips deed.

create or replace function public.groepsgebeurtenissen_telt_mee(p_type text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  -- ⚠️ `coalesce` en `<> all`, en niet `is distinct from all` — dat laatste is
  --    geen geldige SQL (`syntax error at or near "all"`). `event_type` is
  --    `not null`, dus de coalesce is defensief: zou hij ooit null kunnen zijn,
  --    dan geeft een kale `<> all` null en telt de rij stil níet mee.
  select coalesce(p_type, '') <> all (array[
    'member_left',           -- de uitgang zelf
    'admin_transferred',     -- de uitgang van de laatste beheerder
    'group_archived',        -- verlaat_groep() loopt hierlangs bij één beheerder
    'join_request_decided',  -- een ánder bepaalt het aantal
    'member_removed'         -- begrensd door de groepsgrootte
  ])
$$;

comment on function public.groepsgebeurtenissen_telt_mee(text) is
  'Of een groepsgebeurtenis meetelt in het dagplafond. Een nieuw type telt mee '
  'tenzij het hier vrijgesteld wordt, met een reden. Zie 0216 en QS8-374.';

revoke execute on function public.groepsgebeurtenissen_telt_mee(text)
  from public, anon, authenticated;

create or replace function public.begrens_groepsgebeurtenissen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;

  -- ⚠️⚠️ **Alleen wat de actor zélf herhaalbaar maakt telt mee.** Zie het blok
  --    "Wat er níet meetelt" in de kop: `groepsgebeurtenissen_telt_mee()` sluit
  --    de uitgang en de lidmaatschapsbeslissing uit. Zonder die filter sluit dit
  --    plafond iemand een etmaal lang op in zijn eigen groepen, en kan een
  --    derde het voor hem volschrijven.
  select count(*) into v_batch from nieuw n
   where groepsgebeurtenissen_telt_mee(n.event_type);

  -- ⚠️ **Een statement dat niets toevoegde, kan het plafond niet doorbroken
  --    hebben** — de les van QS8-369, zie de kop van 0214. Hier is er vandaag
  --    geen `on conflict`-schrijver op deze tabel, dus de tak is defensief; hij
  --    staat er omdat de vólgende schrijver er wél een kan zijn, en dan is dit
  --    het verschil tussen een werkende app en een gebruiker die vastzit.
  if v_batch = 0 then return null; end if;

  -- ⚠️ **Per `actor_id` en niet per groep.** Een beheerder van tien groepen is
  --    één `auth.uid()`; een plafond per groep zou hem tien keer zoveel ruimte
  --    geven en precies de flip-flop uit de kop onbegrensd laten.
  select count(*) into v_totaal from group_events e
   where e.actor_id = (select auth.uid())
     and e.created_at > now() - interval '1 day'
     and groepsgebeurtenissen_telt_mee(e.event_type);

  if v_totaal > groepsgebeurtenissen_plafond() then
    raise exception 'Te veel groepsgebeurtenissen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, groepsgebeurtenissen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker over al je groepen samen, en telt ook de rijen uit dit verzoek.';
  end if;

  return null;
end $$;

revoke execute on function public.begrens_groepsgebeurtenissen()
  from public, anon, authenticated;

create or replace function public.rem_groepsgebeurtenissen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;

  v_n := coalesce(nullif(current_setting('app.rem_groepsgebeurtenissen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_groepsgebeurtenissen', v_n::text, true);

  if v_n > groepsgebeurtenissen_plafond() * 2 then
    raise exception 'Te veel groepsgebeurtenissen in één verzoek (% rijen, noodgrens %)',
      v_n, groepsgebeurtenissen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;

  return new;
end $$;

revoke execute on function public.rem_groepsgebeurtenissen()
  from public, anon, authenticated;

-- ⚠️ **De teller draait deze query bij élk insert-statement, dus hij hoort een
--    index te hebben** — onwrikbare regel 11. 📏 Zonder deze index geeft het plan
--    `Seq Scan on group_events`, en de kop hierboven rekent voor dat één
--    gebruiker er 182.500 per jaar kan opbouwen. De structurele tweelingtabel
--    heeft hem al voor exact dezelfde teller: `goal_events_actor_vers_idx`.
--    Gevonden in de security-review op deze branch.
create index if not exists group_events_actor_vers_idx
  on public.group_events (actor_id, created_at desc);

drop trigger if exists groepsgebeurtenissen_dagplafond on public.group_events;
create trigger groepsgebeurtenissen_dagplafond
  after insert on public.group_events
  referencing new table as nieuw
  for each statement execute function public.begrens_groepsgebeurtenissen();

drop trigger if exists groepsgebeurtenissen_rem on public.group_events;
create trigger groepsgebeurtenissen_rem
  before insert on public.group_events
  for each row execute function public.rem_groepsgebeurtenissen();

-- ---------------------------------------------------------------------------
-- Het register van sleutelzetters(), uit de draaiende database
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Uitgelezen met `pg_get_functiondef()` en niet gekopieerd uit 0214.**
--    Dat is twee keer misgegaan (QS8-358): een register in een
--    `create or replace`-lichaam is een merge-conflict dat git niet ziet, en
--    de laatste replace wint. De teller ving zichzelf beide keren op.

CREATE OR REPLACE FUNCTION public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ Uit 0208 (QS8-360). De huddledag verzetten schuift de start van de
      --    lopende periode, en dan gaat de weekafsluiting die erbij hoort mee —
      --    langs de pin van 0206, die `group_id` en `user_id` onverkort gepind
      --    houdt.
      ('app.huddledag_verzet',    array['zet_huddledag', 'pin_week_review']),
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
      -- ⚠️⚠️ **Deze vijf komen uit 0207 (QS8-361) en waren er bij het samenvoegen
      --    uit gevallen.** Mijn versie kopieerde het register van vóór die
      --    migratie, precies zoals de aantekening bij de drie sleutels van 0199
      --    hierboven beschrijft — de val van een teller die zijn eigen register in
      --    zijn lichaam draagt: twee branches breiden hem uit, de laatste
      --    `replace` wint, en de ander verdwijnt zonder een woord.
      --
      -- 📏 De teller ving zichzelf opnieuw op: `rem_commitments`, `rem_dagzetten`,
      --    `rem_doelinterviews`, `rem_doelkoppelingen` en `rem_voltooiingen`
      --    stonden meteen als ongeregistreerd in de uitslag, en twee RLS-tests
      --    werden er rood van. Dat is de tweede keer op vier dagen; het staat als
      --    QS8-358.
      ('app.rem_commitments',        array['rem_commitments']),
      ('app.rem_voltooiingen',       array['rem_voltooiingen']),
      ('app.rem_dagzetten',          array['rem_dagzetten']),
      ('app.rem_doelkoppelingen',    array['rem_doelkoppelingen']),
      ('app.rem_doelinterviews',     array['rem_doelinterviews']),
      -- ⚠️⚠️ **Uit 0214 (QS8-369), en deze regel is er bijna uit gevallen.**
      --    Die migratie landde op `main` terwijl deze branch openstond en
      --    hernummerde mij van 0214 naar 0215 — dus deze `create or replace`
      --    draait er nu áchteraan. Het register dat ik kopieerde was van vóór hun
      --    migratie, en zonder deze regel had ik `app.rem_pushtokens` er stil
      --    weer uit gehaald.
      --
      --    Dat is exact de val van QS8-358, en de derde keer dat hij toeslaat: een
      --    teller die zijn eigen register in zijn lichaam draagt, twee branches
      --    die hem uitbreiden, en de laatste `replace` wint. 📏 Gevonden door na
      --    het samenvoegen te grepen op wat hún 0214 registreert en dat naast het
      --    mijne te leggen.
      --
      --    ⚠️ **En de teller had zichzelf ook opgevangen**, net als bij 0199 en
      --    0207: `rem_pushtokens()` zet die sleutel nog steeds, dus zonder deze
      --    regel meldt hij hem meteen als ongeregistreerd — 📏 nagemeten, de regel
      --    weghalen geeft `rem_pushtokens: noemt app.rem_pushtokens`. Dat is de
      --    hele reden dat deze grendel bestaat, en het is de derde keer dat hij
      --    zijn eigen register redt.
      ('app.rem_pushtokens',         array['rem_pushtokens']),
      -- ⚠️ Uit 0216 (QS8-374). De zestiende dagteller, en de eerste op een
      --    tabel die niemand rechtstreeks beschrijft: `group_events` is bij
      --    alle zeven schrijvers een neveneffect.
      --
      -- ⚠️⚠️ **En dit register is voor de tweede keer op rij opnieuw uitgelezen
      --    in plaats van gekopieerd.** Toen deze migratie geschreven werd stond
      --    hij op 0215; QS8-376 landde ondertussen op `main` met een 0215 die
      --    déze functie herschrijft — `ilike` in plaats van `like`, en een derde
      --    tak die per sleutel kijkt in plaats van per functie. 📏 Het verschil
      --    is nagemeten met een `diff` tussen wat ik meedroeg en wat er ná hun
      --    migratie in de database stond: mijn kopie had hun hele reparatie
      --    stilzwijgend teruggedraaid. Dat is QS8-358 voor de vierde keer.
      ('app.rem_groepsgebeurtenissen', array['rem_groepsgebeurtenissen'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc ilike '%' || s.instelling || '%'
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
  select distinct p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt ' || m.gevonden[1] || ', een app.-sessiesleutel die in geen '
         'enkel register van deze teller staat; een nieuwe sleutel hoort er '
         'met zijn eigen regel in te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(p.prosrc, 'app\.[A-Za-z0-9_]+', 'g') as m(gevonden)
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and lower(m.gevonden[1]) not in (select s.instelling from sleutel s)

   order by 1;
$function$

;

revoke execute on function public.sleutelzetters()
  from public, anon, authenticated;
