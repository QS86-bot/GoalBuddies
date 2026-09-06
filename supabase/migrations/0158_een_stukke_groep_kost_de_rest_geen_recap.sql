-- 0158_een_stukke_groep_kost_de_rest_geen_recap.sql — één groep laat de andere staan
--
-- ROLLBACK-PAD:
--   De vorige vorm staat voluit in 0112 (`create or replace function
--   public.maak_seizoensrecaps(timestamptz)`). Dat blok opnieuw uitvoeren zet
--   deze migratie terug; de signatuur verandert hier niet, dus er hoeft niets
--   gedropt te worden en er is geen enkel object dat blijft hangen.
--
--   ⚠️ Terugdraaien betekent wel dat de job weer in zijn geheel afbreekt op één
--      stukke groepsrij, en dat de rollover dat niet ziet — dat is het gedrag
--      dat deze migratie weghaalt, niet een neveneffect ervan.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dossierrij `docs/ENGINEER-REVIEW.md` van 28-08-2026, risico Laag — QS8-171.
--
-- 📏 **Gemeten met één kapotte `groups.tz`: één groep, nul recaps voor iedereen.**
--    De lus in `maak_seizoensrecaps()` loopt over alle groepen zonder per groep
--    af te vangen. Een fout op groep één laat de hele functie afbreken, en omdat
--    alles in één transactie zit rolt ook het werk van de groepen dáárvoor terug.
--    Het maakt dus niet uit waar in de lus de stukke rij staat: de uitkomst is
--    altijd nul recaps.
--
-- ⚠️ **0119 haalde de oorzaak weg die te meten was, niet de breekbaarheid.**
--    Sinds die migratie weigert `bewaak_tijdzone()` een zone die Postgres niet
--    kent, dus dít pad is dicht. Elke andere fout in één groepsrij doet nog
--    precies hetzelfde — en de rij noemt dat met zoveel woorden.
--
-- ---------------------------------------------------------------------------
-- De keuze die het issue openliet: wat er dán gelogd wordt
-- ---------------------------------------------------------------------------
--
-- De rij zegt waarom dit bewust bleef liggen: *"een `exception`-tak per groep
-- verandert de foutafhandeling van een job die geld noch data aanraakt maar wél
-- stil kan gaan falen, en dat vraagt een keuze over wat er dán gelogd wordt."*
-- Dat is de keuze, en ze staat hier zodat de volgende lezer hem niet opnieuw
-- hoeft te maken.
--
-- **Een overgeslagen groep verlaat deze functie langs twee wegen, en met opzet
-- niet dezelfde inhoud:**
--
-- 1. **`raise warning` naar het Postgres-log** — mét `sqlerrm`. Dat is de plek
--    waar de volledige melding vandaag óók al terechtkomt als de job afbreekt,
--    dus daar verandert niets aan wie wat kan lezen.
-- 2. **De teruggave `mislukt` en `fouten`** — mét `group_id` en `sqlstate`, en
--    **zonder `sqlerrm`**. Die teruggave reist door naar de rollover en van daar
--    naar Sentry, en `sqlerrm` draagt bij een CHECK- of constraint-schending de
--    wáárde die de fout veroorzaakte. Dat kan gebruikerstekst zijn. Een uuid en
--    een SQLSTATE zijn genoeg om de rij te vinden en de klasse fout te kennen;
--    de zin zelf staat een `select` verderop in het log.
--
-- ⚠️ **`ok` blijft `true` en dat is geen slordigheid.** De job hééft gedraaid en
--    de gezonde groepen hébben hun recap. Wat een lezer moet zien is niet dat
--    alles mislukte maar dat er iets overgeslagen is, en dat is precies wat
--    `mislukt` zegt. De rollover meldt hem apart aan Sentry zodra hij boven nul
--    staat; zonder dat zou deze migratie het stille falen inbouwen dat ze komt
--    weghalen.
--
-- ---------------------------------------------------------------------------
-- Twee dingen die de `exception`-tak níet mag doen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een afbreking is geen groepsfout.** Wordt de job van buitenaf gestopt,
--    dan is per groep dóórgaan het slechtste wat er kan gebeuren: duizend
--    iteraties die allemaal "overgeslagen" melden en daarna "ok" zeggen. De
--    afsluitcodes van de server worden daarom als eerste opgevangen en meteen
--    doorgegooid.
--
-- 📏 **`query_canceled` staat daar níet bij, en dat is gemeten en geen
--    vergissing.** PL/pgSQL geeft `others` twee codes nooit: `query_canceled`
--    (57014 — een `statement_timeout` of een `pg_cancel_backend`) en
--    `assert_failure` (P0004). Nagemeten op deze database, met een handmatige
--    `raise` van vier codes in een blok met alleen `when others`:
--
--      57014  ontsnapt aan others
--      P0004  ontsnapt aan others
--      22023  gevangen
--      57P01  gevangen
--
--    Een `when query_canceled then raise;` erbij zou dus een tak zijn die nooit
--    draait — en een tak die nooit draait, is een tak waarvan niemand kan zien
--    dat hij stuk is. De belofte staat wél onder test: `57014` hoort deze
--    functie te verlaten, of dat nu door de taal komt of door een tak.
--
-- ⚠️⚠️ **De insert en het bericht blijven bij elkaar, en dat vraagt twee regels
--    die er in de eerste versie van deze migratie niet stonden.** Een blok met
--    een `exception`-tak is een subtransactie, dus een fout dáárbinnen rolt de
--    rij in `season_recaps` mee terug. Dat is geen netheid maar de kern: de
--    primaire sleutel op die tabel ís de belofte "één bericht per seizoen"
--    (0112), en de `continue when exists (…)` erboven leest hem. Een rij zonder
--    bericht sluit die groep dus **voorgoed** buiten voor dat seizoen.
--
-- 📏 **En precies dat gebeurde**, want `plaats_systeembericht()` (0059) heeft een
--    eigen `exception when others then raise warning` en geeft `void` terug: zijn
--    fout bereikt dit blok nooit. Nagemeten met een storing op de chatinsert:
--
--      uur 1        {"ok": true, "recaps": 1, "mislukt": 0}   rijen 1, berichten 0
--      uur 2 (heel) {"ok": true, "recaps": 0, "mislukt": 0}   berichten 0
--
--    Eén groep raakt zijn kwartaalrecap kwijt, de teller zegt "gelukt", en geen
--    enkele test wordt daar rood van. **Dat is het stille falen waar deze
--    migratie voor bestaat, ingebouwd door de reparatie zelf** — gevonden door de
--    security-review van 04-09 en hier nagemeten voordat hij verwerkt is.
--
--    Vandaar de telling om de aanroep heen. `plaats_systeembericht()` blijft
--    ongemoeid: hij heeft veertien aanroepers en zijn slikgedrag is elders juist
--    gewenst — een systeembericht hoort een handeling van een gebruiker niet te
--    laten mislukken. Hier is het andersom, en dat verschil hoort bij de
--    aanroeper te staan en niet in de gedeelde functie.
--
-- ⚠️ **`on conflict do nothing` zegt niet dát de rij landde, en het bericht ging
--    er onvoorwaardelijk achteraan.** Binnen één aanroep kan dat niet botsen — de
--    `continue when exists (…)` zit ervoor — maar twee overlappende aanroepen
--    (een pinger die na een timeout opnieuw prikt, een handmatige run naast de
--    planning) passeren onder READ COMMITTED allebei die toets, waarna de tweede
--    insert niets doet en tóch een bericht plaatst. Twee identieke recaps in de
--    chat, en een chatbericht is een onveranderlijke kopie (beslisdocument 002
--    §3) — dus niet op te ruimen. Stond zo sinds 0112; deze migratie herschrijft
--    die regels en herhaalt de belofte, dus hij hoort hier gerepareerd te worden.
--
-- ⚠️ De prijs is een subtransactie per groep per uur. Bij de honderd groepen van
--    vandaag en de duizenden van het schaaldoel is dat verwaarloosbaar naast de
--    twee `select`s die er in dezelfde iteratie al staan.
--
-- ---------------------------------------------------------------------------

create or replace function public.maak_seizoensrecaps(p_op timestamptz default now())
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  g        record;
  grens    record;
  cijfers  record;
  gemaakt  integer := 0;
  stil     integer := 0;
  mislukt  integer := 0;
  fouten   jsonb   := '[]'::jsonb;
  gezet    integer;
  voor     integer;
  na       integer;
begin
  -- ⚠️ Alleen `service_role`. Deze functie plaatst berichten in groepschats;
  --    een ingelogde gebruiker die hem kan aanroepen, kan de hele boel laten
  --    afgaan wanneer het hem uitkomt.
  if current_setting('request.jwt.claim.role', true) is not null
     and current_setting('request.jwt.claim.role', true) <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  for g in
    select gr.id, gr.tz, gr.season_cadence
    from groups gr
    where gr.status <> 'archived'
  loop
    -- ⚠️ Alles van één groep in één blok — QS8-171. Wat hierbinnen stukgaat,
    --    kost deze groep zijn recap en verder niemand iets.
    begin
      select * into grens
      from seizoensgrens(g.tz, g.season_cadence, p_op);

      -- ⚠️ **Precies op de eerste dag van het nieuwe seizoen, om 08:00 lokaal.**
      --    Dat is acceptatiecriterium 3, en het is bewust strak: de rollover draait
      --    elk uur, dus zonder deze twee toetsen zou de recap op het moment van de
      --    kalenderomslag komen — middenin de nacht.
      continue when not (grens.is_eerste_dag and grens.is_acht_uur);

      continue when exists (
        select 1 from season_recaps r
        where r.group_id = g.id and r.season_start = grens.season_start
      );

      select * into cijfers
      from seizoensrecap_cijfers(g.id, grens.season_start, grens.season_end);

      -- ⚠️ Een recap van nul is een tegenslagbericht met een vrolijke kop erop.
      --    In een stille groep zwijgt hij; zie punt 3 in de kop van 0112.
      if coalesce(cijfers.weken, 0) = 0
         and coalesce(cijfers.mijlpalen, 0) = 0
         and coalesce(cijfers.schakels, 0) = 0 then
        stil := stil + 1;
        continue;
      end if;

      insert into season_recaps (group_id, season_start, season_end, weken, mijlpalen, schakels)
      values (g.id, grens.season_start, grens.season_end,
              cijfers.weken, cijfers.mijlpalen, cijfers.schakels)
      on conflict do nothing
      returning 1 into gezet;

      -- ⚠️ Landde de rij niet, dan was een andere aanroep ons voor en heeft die
      --    het bericht al geplaatst. Doorgaan zou de tweede recap posten.
      continue when gezet is null;

      select count(*) into voor
      from chat_messages
      where group_id = g.id and system_event = 'season_recap';

      perform plaats_systeembericht(
        g.id,
        'season_recap',
        -- ⚠️ Noodterugval, precies zoals 0059 het bedoelde: de app maakt de zin uit
        --    `system_event` plus de payload. Deze tekst is alleen voor een client
        --    die de gebeurtenis nog niet kent.
        'Het seizoen zit erop.',
        null,
        null,
        jsonb_build_object(
          'weken', cijfers.weken,
          'mijlpalen', cijfers.mijlpalen,
          'schakels', cijfers.schakels
        )
      );

      -- ⚠️ **`plaats_systeembericht()` eet zijn eigen fouten op** (0059) en geeft
      --    `void` terug, dus zonder deze telling commit de rij in `season_recaps`
      --    zonder bericht en is de groep dat seizoen kwijt. Zie de kop; gemeten.
      select count(*) into na
      from chat_messages
      where group_id = g.id and system_event = 'season_recap';

      if na = voor then
        raise exception 'season_recap voor groep % is niet in de chat beland', g.id
          using errcode = 'P0001';
      end if;

      gemaakt := gemaakt + 1;

    exception
      -- ⚠️ Eerst, en zonder er iets mee te doen: een afbreking van buiten is
      --    geen fout van deze groep. `query_canceled` staat er niet bij omdat
      --    `others` hem sowieso niet vangt — gemeten, zie de kop.
      when admin_shutdown or crash_shutdown or cannot_connect_now then
        raise;

      when others then
        mislukt := mislukt + 1;
        fouten := fouten || jsonb_build_object('group_id', g.id, 'sqlstate', sqlstate);

        -- ⚠️ De volledige melding gaat naar het log en niet naar de teruggave —
        --    `sqlerrm` kan de waarde bevatten die de fout veroorzaakte.
        raise warning 'seizoensrecap overgeslagen voor groep %: [%] %', g.id, sqlstate, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'recaps', gemaakt,
    'stil', stil,
    -- ⚠️ Deze twee zijn de hele reden dat 0158 bestaat. Een job zonder scherm
    --    heeft alleen zijn uitvoer: wat hij niet teruggeeft, is niet gebeurd
    --    voor wie het log leest.
    'mislukt', mislukt,
    'fouten', fouten
  );
end;
$$;

-- ⚠️ `create or replace` behoudt de ACL, dus de grants van 0112 staan er nog.
--    Ze worden hier tóch herhaald: `revoke ... from public, anon, authenticated`
--    is de vorm uit onwrikbare regel 4, en een definer-functie die zijn grants
--    van een eerdere migratie erft is precies het geval dat
--    `tests/rls/functiegrants.test.ts` een "geërfd en niet besloten" recht noemt.
revoke all on function public.maak_seizoensrecaps(timestamptz) from public, anon, authenticated;
grant execute on function public.maak_seizoensrecaps(timestamptz) to service_role;

comment on function public.maak_seizoensrecaps(timestamptz) is
  'Plaatst één seizoensrecap per groep, op de eerste dag van het nieuwe seizoen '
  'om 08:00 in de tijdzone van de groep. Draait elk uur vanuit de rollover — QS8-79. '
  'Sinds 0158 (QS8-171) staat elke groep in een eigen blok: wat op één groepsrij '
  'stukgaat kost alleen die groep zijn recap, wordt geteld in `mislukt` en '
  'benoemd in `fouten` (group_id en sqlstate, nooit de melding zelf).';
