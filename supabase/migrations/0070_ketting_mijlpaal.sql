-- 0070_ketting_mijlpaal.sql — QS8-70, de achtste en laatste gebeurtenis
--
-- ROLLBACK-PAD:
--   drop trigger  if exists chain_links_mijlpaal on chain_links;
--   drop function if exists meld_ketting_mijlpaal();
--   drop function if exists ketting_drempels();
--   alter table chat_messages drop constraint if exists chat_messages_system_event_bekend;
--   alter table chat_messages add constraint chat_messages_system_event_bekend
--     check (system_event is null or system_event = any (array[
--       'group_sleeping', 'member_joined', 'completion_pending', 'completion_approved',
--       'milestone_done', 'goal_completed', 'commitment_unlocked', 'commitment_due',
--       'deadline_requested'
--     ]));
--   -- Reeds geplaatste `chain_milestone`-berichten moeten dan eerst weg, anders
--   -- weigert de CHECK. Ze zijn geschiedenis, dus dit is geen stap die je
--   -- terloops zet: `delete from chat_messages where system_event = 'chain_milestone';`
--
-- Vooraf: `pg_dump` (onwrikbare regel 20). Op 24-08-2026 stonden er 0 rijen in
-- `chain_links`, `chat_messages` en `groups`, dus deze migratie is op dat moment
-- op een lege database gedraaid.
--
-- ---------------------------------------------------------------------------
-- Waarom deze migratie bestaat
-- ---------------------------------------------------------------------------
--
-- 0025 liet `chain_milestone` bewust van de allowlist af, met deze reden:
--
--     "De Ketting bestaat nog niet (QS8-80, EPIC 8) en niets schrijft
--      `chain_links`. Hem hier alvast toelaten zou de vraag wegnemen op het
--      moment dat hij gesteld moet worden."
--
-- Die vraag wordt hier gesteld. Sinds 0036 en 0037 heeft `chain_links` twee
-- schrijvers, dus de oude blokkade is weg. Wat ontbrak was de definítie:
-- **wanneer is iets een mijlpaal ín de ketting?**
--
-- ⚠️ Besluit (24-08-2026, binnen de beslisbevoegdheid uit `CLAUDE.md`): een
--    mijlpaal is **een rond aantal schakels dat de groep bij elkaar heeft
--    verdiend** — 10, 25, 50, 100, 250, 500, 1000. Cumulatief over de hele
--    geschiedenis van de groep, niet per periode.
--
-- ---------------------------------------------------------------------------
-- Waarom cumulatief, en niet "voltallig" of "N perioden op rij"
-- ---------------------------------------------------------------------------
--
-- Beide voor de hand liggende alternatieven zijn afgevallen op domeinregel 7,
-- en het tweede bovendien op correctheidsregel 7.
--
-- 1. **"Voltallig deze periode"** — een bericht zodra iedereen zijn schakel
--    heeft. Positief geformuleerd, maar het is een *conditioneel* signaal: komt
--    het bericht niet, dan weet de groep aan het eind van de periode dat iemand
--    níét heeft afgesloten. Dat is precies de vorm die domeinregel 7 verbiedt —
--    de afwezigheid van een bericht wordt zelf het bericht. In een groep van
--    twee of drie is dat bovendien meteen herleidbaar tot een persoon.
--
-- 2. **"N perioden op rij voltallig"** — een groepsreeks. Erft het bezwaar van
--    (1) en voegt er een tweede aan toe: het breken van zo'n reeks is een
--    gebeurtenis die niemand aankondigt maar iedereen ziet. En het vraagt
--    aaneengesloten perioden te herkennen, dus SQL zou de periodelengte moeten
--    kennen. Dat mag hier niet (correctheidsregel 7, en 0036 heeft de twee
--    schrijfroutes juist gesplitst om die berekening te vermijden).
--
-- 3. **Een rond cumulatief aantal** heeft geen van beide problemen:
--
--    * De teller is **monotoon**. Hij kan alleen stijgen, dus er bestaat geen
--      gebeurtenis "de mijlpaal is niet gehaald" waaruit iets af te leiden valt.
--      Langzamer groeien betekent niets: het hangt net zo goed af van de
--      groepsgrootte, van wanneer iemand lid werd en van adempauzes.
--    * Er wordt **niets uitgerekend** — het is `count(*)` over bestaande rijen.
--      Geen datum, geen periodelengte, geen tijdzone.
--    * Hij noemt **niemand**. Het bericht gaat over de groep als geheel, en is
--      daarmee het enige systeembericht zonder persoonsnaam. Dat is met opzet:
--      een ketting-mijlpaal is een gedeelde prestatie, en wie de schakel toevallig
--      als laatste plaatste is geen informatie die iemand nodig heeft.
--    * Hij is **zeldzaam**, wat een mijlpaal hoort te zijn. Een groep van drie
--      met volle opkomst haalt 10 in week vier en 25 in week negen.
--
-- ⚠️ De twee vragen uit `CLAUDE.md` bij elk nieuw groepsoppervlak, expliciet
--    beantwoord:
--
--      Kan hieruit iemands gemiste week worden afgeleid?  Nee — de teller is
--      cumulatief, monotoon en zonder naam; hij zegt niets over wie wat wanneer
--      deed, en zijn tempo heeft te veel oorzaken om iets te bewijzen.
--
--      Kan iemand dat met één API-verzoek uitlezen buiten de UI om?  Het bericht
--      staat in `chat_messages` onder de bestaande policy voor groepsleden, en
--      draagt uitsluitend een groepsbreed getal. De trigger hieronder wordt voor
--      élke clientrol ingetrokken (zie 0052a en 0069), dus hij is ook niet als
--      RPC aanroepbaar.

-- ---------------------------------------------------------------------------
-- 1. De allowlist krijgt zijn tiende naam
-- ---------------------------------------------------------------------------
--
-- ⚠️ `SYSTEEM_GEBEURTENISSEN` in `src/modules/buddies/chat-schemas.ts` gaat in
--    dezelfde wijziging mee. Er staat sinds 0034 een test op die de twee
--    verzamelingen gelijkstelt (`systeembericht_allowlist()`), dus één kant
--    veranderen is een rode test — en dat is de bedoeling.

alter table chat_messages
  drop constraint if exists chat_messages_system_event_bekend;
alter table chat_messages
  add constraint chat_messages_system_event_bekend
  check (system_event is null or system_event = any (array[
    'group_sleeping', 'member_joined', 'completion_pending', 'completion_approved',
    'milestone_done', 'goal_completed', 'commitment_unlocked', 'commitment_due',
    'deadline_requested', 'chain_milestone'
  ]));

-- ---------------------------------------------------------------------------
-- 2. De drempels, leesbaar vanuit een test
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dezelfde vorm als `systeembericht_allowlist()` (0034), `realtime_bewaking()`
--    (0027) en `triggerfuncties_in_de_api()` (0052a): wat anders een getal in een
--    functielichaam blijft, wordt zo toetsbaar vanuit de suite. Eén bron: de
--    trigger hieronder leest deze lijst en heeft geen eigen kopie.

create or replace function ketting_drempels()
  returns integer[]
  language sql
  immutable
  set search_path = public, pg_temp
as $$
  select array[10, 25, 50, 100, 250, 500, 1000];
$$;

comment on function ketting_drempels() is
  'De aantallen schakels waarbij De Ketting een mijlpaal viert — QS8-70. '
  'Cumulatief per groep. Bevat geen persoonsgegeven en rekent niets uit.';

revoke all on function ketting_drempels() from public, anon;
grant execute on function ketting_drempels() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. De aankondiging
-- ---------------------------------------------------------------------------
--
-- ⚠️ Geteld wordt hoeveel mijlpalen er al gemeld zijn, en niet of het aantal
--    schakels toevallig exact op een drempel staat. Dat lijkt omslachtig en
--    lost twee echte problemen op:
--
--    1. **Twee gelijktijdige schakels.** Onder READ COMMITTED ziet elk van twee
--       parallelle inserts de ander nog niet. Bij een exacte toets slaan ze
--       samen de drempel over (allebei zien 49) of vieren ze hem dubbel
--       (allebei zien 50). Door te vergelijken hoevéél mijlpalen bereikt zijn met
--       hoevéél er gemeld zijn, herstelt de eerstvolgende schakel dat vanzelf.
--    2. **Een mislukte aankondiging.** `plaats_systeembericht()` slikt een fout
--       bewust in — een bericht mag de handeling nooit laten mislukken. Bij een
--       exacte toets is de mijlpaal daarmee voorgoed weg. Nu komt hij terug.
--
--    Prijs daarvan: een hersteld bericht noemt de drempel en niet de stand van
--    vandaag ("telt 10 schakels" terwijl het er inmiddels 11 zijn). Een mijlpaal
--    markeert een moment, dus dat is het juiste getal om te noemen.
--
-- ⚠️ `new.user_id` wordt niet gebruikt, en dat is het punt. Wie de schakel
--    plaatste die de drempel haalde, hoort niet in het bericht: de mijlpaal is
--    van de groep. Dit is daarmee het enige systeembericht zonder naam.
--
-- ⚠️ Geen `raise exception` en één omhullend exception-blok, net als
--    `ketting_uit_weekafsluiting()` in 0036 (valkuil 8). Gooien zou de
--    weekafsluiting of de goedkeuring terugrollen die de schakel opleverde. Geen
--    lege catch: er gaat een `warning` de logs in (coderegel 14).

create or replace function meld_ketting_mijlpaal()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drempels integer[] := ketting_drempels();
  v_schakels integer;
  v_gemeld   integer;
  v_bereikt  integer := 0;
  i          integer;
begin
  begin
    select count(*) into v_schakels
    from chain_links c
    where c.group_id = new.group_id;

    select count(*) into v_gemeld
    from chat_messages m
    where m.group_id     = new.group_id
      and m.system_event = 'chain_milestone';

    for i in 1 .. coalesce(array_length(v_drempels, 1), 0) loop
      if v_schakels >= v_drempels[i] then
        v_bereikt := i;
      end if;
    end loop;

    -- Draait niet als er niets nieuws bereikt is: plpgsql slaat een FOR met een
    -- ondergrens boven de bovengrens over.
    for i in v_gemeld + 1 .. v_bereikt loop
      perform plaats_systeembericht(
        new.group_id,
        'chain_milestone',
        'De Ketting van deze groep telt ' || v_drempels[i] || ' schakels.'
      );
    end loop;
  exception
    when others then
      raise warning 'Ketting-mijlpaal voor groep % is niet gemeld: %',
        new.group_id, sqlerrm;
  end;

  return new;
end;
$$;

comment on function meld_ketting_mijlpaal() is
  'Meldt een ronde stand van De Ketting in de groepschat — QS8-70. Noemt geen '
  'persoon: de mijlpaal is van de groep. Telt gemelde mijlpalen in plaats van '
  'exact op een drempel te toetsen, zodat een gemiste of gedubbelde melding '
  'zichzelf herstelt.';

revoke all on function meld_ketting_mijlpaal() from public, anon, authenticated;

drop trigger if exists chain_links_mijlpaal on chain_links;
create trigger chain_links_mijlpaal
  after insert on chain_links
  for each row execute function meld_ketting_mijlpaal();
