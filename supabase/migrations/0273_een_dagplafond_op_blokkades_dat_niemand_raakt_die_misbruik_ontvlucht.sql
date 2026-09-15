-- 0273_een_dagplafond_op_blokkades_dat_niemand_raakt_die_misbruik_ontvlucht.sql
-- — `user_blocks` krijgt een dagplafond. QS8-496.
--
-- ROLLBACK-PAD:
--   drop trigger if exists blokkades_dagplafond on public.user_blocks;
--   drop trigger if exists blokkades_rem on public.user_blocks;
--   drop function if exists public.rem_blokkades();
--   drop function if exists public.begrens_blokkades();
--   drop function if exists public.blokkades_plafond();
--   ⚠️ Zet `blokkades_plafond()` niet terug op `immutable`: dat is route A uit
--      0254 en `volatiliteit:controle` wordt er rood van.
--
-- ⚠️ Deze migratie raakt geen bestaande rij: ze voegt twee functies en één
--    trigger toe. De trigger vuurt pas bij een nieuwe INSERT.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt: een voorwaarde die intreedt, geen nieuwe bevinding
-- ---------------------------------------------------------------------------
--
-- 0203 gaf tien tabellen een dagteller en liet `user_blocks` er met zoveel
-- woorden buiten:
--
--   **`user_blocks` — bewust geen plafond, en dat is een veiligheidskeuze.**
--     Een rem op blokkeren zit iemand in de weg die misbruik ontvlucht […]
--     **Wordt zwaarder als:** profiel-id's in bulk op te vragen worden.
--
-- `zoek_mensen()` (QS8-476) **is** dat: tot 50 profiel-id's per aanroep, en elk
-- teruggegeven `id` is een geldige `blocked_id`. De begrenzing *"door wie je
-- kent"* is daarmee weg; wat overblijft is *"hoeveel accounts er zijn"*.
--
-- ⚠️ Dit is dus precies de vraag die CLAUDE.md voorschrijft bij een nieuwe
--    beslissing die op een bestaande primitieve handeling leunt: *staat daar een
--    weggelegde bevinding over?* Hier stond die er, mét zijn voorwaarde.
--
-- ---------------------------------------------------------------------------
-- De spanning wordt opgelost en niet weggenomen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De reden dat er géén plafond stond is goed en blijft goed.** Een rem op
--    blokkeren zit iemand in de weg die misbruik ontvlucht, en dat is de
--    verkeerde kant om te falen. Deze migratie draait dat niet om: het plafond
--    ligt zo hoog dat wie in paniek vijf of vijftig mensen blokkeert er nooit
--    tegenaan loopt. Wat het begrenst is uitsluitend de bulkvorm.
--
-- ⚠️ **Twee dingen zorgen ervoor dat een échte gebruiker dit nooit merkt**, en
--    het tweede is er een die je makkelijk over het hoofd ziet:
--
--    1. Het getal (zie hieronder).
--    2. `blokkeer()` (0145) doet `insert … on conflict do nothing`, dus iemand
--       die al geblokkeerd is levert **nul** toegevoegde rijen op. De
--       lege-batchtak hieronder laat zo'n statement ongemoeid, dus herhaald
--       blokkeren van dezelfde persoon verbruikt geen quotum. Zonder die tak
--       zou een app die bij elke start opnieuw blokkeert iemand blijvend
--       vastzetten op een fout die hij zelf niet kan opheffen — dat is de
--       must-allow die 0214 voor pushtokens met zoveel woorden beschrijft.
--
-- ---------------------------------------------------------------------------
-- Het getal: 500, en dat is afgeleid en niet rond
-- ---------------------------------------------------------------------------
--
-- Het huis rekent een plafond uit als *een veelvoud van een zware
-- gebruiksdag* (0203, "De zes plafonds, en waarom ze zo hoog staan"). Voor
-- blokkades:
--
--   📏 **En het ergste echte geval is hier geen schatting maar een afgedwongen
--      bovengrens**, en dat is nagemeten in plaats van aangenomen (0016):
--      een groep is vol bij **twaalf** actieve leden, en een gebruiker zit in
--      hoogstens **tien** groepen.
--
--   het ergste echte iemand vertrekt uit álle tien zijn groepen en blokkeert
--   geval            daar iedereen die hij ooit tegenkwam:
--                    10 × 11 = **110** mensen. Meer kán hij er via groepen niet
--                    kennen.
--   het plafond      **500**, ruim vier en een half keer die harde bovengrens.
--
--   ⚠️ Die bovengrens geldt alleen voor het **legitieme** geval. `zoek_mensen()`
--      laat je juist mensen blokkeren die je nooit ontmoet hebt, en dat is
--      precies waarom er een plafond nodig is: daar is 110 geen grens meer.
--
-- ⚠️ **Het faalt naar de veilige kant, en dat is hier de hele opdracht.** Te
--    laag betekent dat iemand die misbruik ontvlucht tegen een muur loopt; te
--    hoog betekent dat een tabel harder groeit dan nodig. Die tweede is
--    begrensd, omkeerbaar en kost opslag; de eerste kost een mens zijn uitweg.
--    Bij twijfel dus omhoog. 500 zit in dezelfde band als
--    `voltooiingen_plafond()` en `dagzetten_plafond()`.
--
-- ⚠️ **En het bindt de lus wél.** `zoek_mensen()` geeft 50 id's per aanroep, dus
--    de bulkvorm gaat van onbegrensd naar tien aanroepen per etmaal.
--
-- ---------------------------------------------------------------------------

begin;

-- ⚠️⚠️ **`stable` en niet `immutable`, en dat is route A uit 0254.** Een
--    `immutable` functie met nul argumenten wordt bij het plannen uitgerekend;
--    PostgREST hergebruikt dat plan per poolverbinding, en dan komt de
--    EXECUTE-toets er nooit meer aan te pas — één aanroep door een bevoorrechte
--    rol en de grant is weg voor iedereen op die verbinding. `set search_path`
--    helpt daar niet tegen; dat sluit route B. 0214 zette `pushtokens_plafond()`
--    nog op `immutable` en 0254 heeft dat rechtgezet — dit is dezelfde vorm, dus
--    hier meteen goed. `npm run volatiliteit:controle` is de grendel.
create or replace function public.blokkades_plafond()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$ select 500 $$;

comment on function public.blokkades_plafond() is
  'Hoeveel mensen één gebruiker per etmaal kan blokkeren. 500 is ruim vier en '
  'een half keer de afgedwongen bovengrens van het legitieme geval: een groep '
  'is vol bij twaalf en je zit in hoogstens tien groepen, dus via groepen ken '
  'je er hoogstens 110 (0016). Bewust hoog: te laag zit iemand in de weg die '
  'misbruik ontvlucht, en dat is de verkeerde kant om te falen. Zie 0273 en '
  'QS8-496.';

-- ⚠️ Onwrikbare regel 4: `authenticated` staat er met zoveel woorden bij. Deze
--    twee worden alleen vanuit een trigger aangeroepen, dus er komt geen grant
--    terug — zelfde afweging als bij `pushtokens_plafond()`.
revoke execute on function public.blokkades_plafond()
  from public, anon, authenticated;

-- ⚠️ **`for each statement` met een transitietabel**, net als de tien van 0203:
--    één vensterquery per verzoek in plaats van één per rij.
create or replace function public.begrens_blokkades()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_batch integer;
begin
  -- ⚠️ De tak beslist op de aanwezigheid van een sessie en niet op een rolnaam
  --    (0083, en uitgeschreven in 0192). Zonder sessie is er geen gebruiker om
  --    tegen af te rekenen; de rollover en de jobs draaien zo.
  if (select auth.uid()) is null then return null; end if;

  select count(*) into v_batch from nieuw;

  -- ⚠️⚠️ **Dit is de must-allow en niet een optimalisatie.** `blokkeer()` doet
  --    `on conflict do nothing`, dus iemand opnieuw blokkeren voegt nul rijen
  --    toe — en die handeling hoort geen quotum te kosten. Zonder deze regel
  --    telt de trigger de teller ook op bij een statement dat niets deed.
  if v_batch = 0 then return null; end if;

  perform tel_dagteller('user_blocks', 'gebruiker', (select auth.uid())::text,
                        blokkades_plafond(), interval '1 day',
                        'blokkades in één dag', v_batch);

  return null;
end $$;

revoke execute on function public.begrens_blokkades()
  from public, anon, authenticated;

-- ⚠️⚠️ **De rem hóórt bij de teller en is geen tweede feature.** Een
--    dagteller is `after insert … for each statement`, want een transitietabel
--    bestaat alleen in `after` — en dus schrijft Postgres de hele batch fysiek
--    weg vóórdat de trigger nee zegt. 0200 heeft dat gemeten: een geweigerde
--    batch van 20.000 kostte 2,9 MB die pas bij een `vacuum full` terugkomt.
--    Deze rem hakt dat af op rijniveau, bij de noodgrens van twee keer het
--    dagplafond.
--
--    📏 **Op deze tabel nagemeten en niet overgenomen uit 0200**, op de lokale
--       stack met één batch van 3000 rijen in één statement, beide keren vanaf
--       een lege tabel (`vacuum full` ertussen) en beide keren teruggerold:
--
--         mét de rem     `pg_relation_size` gaat van 0 naar **73.728** bytes; de
--                        fout komt uit `rem_blokkades()` bij rij **1001**, de
--                        noodgrens van tweemaal het dagplafond.
--         zónder de rem  (`disable trigger blokkades_rem`) van 0 naar **204.800**
--                        bytes; de fout komt dan pas uit `tel_dagteller()`, via
--                        de statement-trigger, nádat alle 3000 rijen geschreven
--                        zijn.
--
--       Nul rijen blijven er in beide gevallen over, en die ruimte komt pas bij
--       een `vacuum full` terug. ⚠️ Het verschil is een factor 2,8 bij 3000 rijen
--       en het groéit met de batch: de rem kapt af op een vast getal, de
--       statement-trigger op geen enkel.
--
--    📏 **Ik had hem niet gebouwd, en `tests/rls/remdekking.test.ts` vond dat.**
--    Dat is precies waar die test voor bestaat: 0203 landde ooit met zes nieuwe
--    dagtellers en géén rem, een paar uur nadat het dossier er letterlijk voor
--    waarschuwde. De waarschuwing was geen grendel; de test is dat wel.
--
-- ⚠️ **`current_setting` met `is_local = true` en niet een tellertabel.** De
--    instelling leeft in de tránsactie, dus hij telt één verzoek en verdwijnt
--    erna vanzelf — ook bij een rollback. Zelfde vorm als de veertien remmen
--    van 0200 en 0207.
create or replace function public.rem_blokkades() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_blokkades', true), ''), '0')::integer + 1;
  perform set_config('app.rem_blokkades', v_n::text, true);
  if v_n > blokkades_plafond() * 2 then
    raise exception 'Te veel blokkades in één verzoek (% rijen, noodgrens %)',
      v_n, blokkades_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

revoke all on function public.rem_blokkades() from public, anon, authenticated;

-- ⚠️ **De namen zijn een afspraak die `remdekking.test.ts` uitleest**: een teller
--    heet `<domeinwoord>_dagplafond` en zijn rem `<domeinwoord>_rem`, en die rem
--    moet `rem_<domeinwoord>()` aanroepen. De eerste versie hiervan noemde de
--    teller naar de tábel (`user_blocks_dagplafond`) — de enige van achttien die
--    dat deed, en daarmee zou de rem nooit aan zijn teller gekoppeld zijn.
drop trigger if exists user_blocks_dagplafond on public.user_blocks;
drop trigger if exists blokkades_rem on public.user_blocks;
create trigger blokkades_rem before insert on public.user_blocks
  for each row execute function public.rem_blokkades();

drop trigger if exists blokkades_dagplafond on public.user_blocks;
create trigger blokkades_dagplafond
  after insert on public.user_blocks
  referencing new table as nieuw
  for each statement
  execute function public.begrens_blokkades();

commit;
