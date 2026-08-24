-- 0075_ketting_mijlpaal_draagt_zijn_getal.sql — QS8-70, de keten die af leek
--
-- ROLLBACK-PAD:
--   De vorige versie van meld_ketting_mijlpaal() staat in migratie 0070, §3.
--   Terugzetten is die functie opnieuw uitvoeren; de trigger blijft staan en de
--   `payload` van reeds geplaatste berichten mag blijven (de app negeert hem dan
--   weer). Geen schemawijziging, dus geen dump nodig — maar zie hieronder: op
--   24-08-2026 stonden er 0 rijen in `chain_links` en `chat_messages`.
--
-- ---------------------------------------------------------------------------
-- Waarom deze migratie bestaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Elk schakeltje was af en de keten was stuk** — de vijfde keer dat dit
--    patroon terugkomt, en de vorm die onwrikbare regel 18 vraag 5 beschrijft:
--    er was niets kápot, dus er kon niets rood worden.
--
--    * Migratie 0059 gaf `chat_messages` de kolom `payload`, "voor alles wat géén
--      persoon is — vandaag niets, straks wel".
--    * `groepschat()` geeft die kolom netjes terug.
--    * Migratie 0070 voegde `chain_milestone` toe: het enige systeembericht met
--      een getal erin. Dat getal ging in `body` en niet in `payload`.
--    * De app maakt de zin sinds 0059 zélf, uit `system_event` plus de namen.
--      Er was geen parameter voor een getal, en er was geen catalogussleutel.
--
--    Gevolg: de groepschat toonde de letterlijke tekst
--    "systeembericht.chain_milestone". `t()` valt bij een onbekende sleutel terug
--    op de sleutel, en dat is een string die niet leeg is — dus de test die
--    "elke toegestane gebeurtenis heeft een zin" heet, kwam er doorheen. Hij
--    toetste een eigenschap van de zin ("niet leeg", "niet de terugval") terwijl
--    de belofte "er ís een vertaling" was.
--
--    Vastgezet met `toont nooit de kale catalogussleutel` in
--    `src/modules/buddies/systeemberichten.test.ts`, met de hand rood gemaakt
--    door de sleutel uit `nl.ts` te halen.
--
-- ⚠️ **Waarom het getal in `payload` hoort en niet in `body`.** `body` is sinds
--    0059 noodterugval: de opgeslagen Nederlandse zin, die niet meevertaalt. Zou
--    de app het getal uit die zin moeten peuteren, dan hangt de weergave aan de
--    formulering van een SQL-functie — en dat is precies de koppeling die 0059
--    heeft doorgesneden.
--
-- ⚠️ **Een persoon hoort nóóit in `payload`** (beslisdocument 002, oppervlak 9).
--    Een uuid in jsonb heeft geen foreign key en overleeft dus een
--    accountverwijdering. Wat hier in gaat is één geheel getal dat de groep als
--    geheel beschrijft: het aantal schakels op het moment van de mijlpaal.
--
-- ⚠️ **De drempel, niet de stand van vandaag.** De trigger telt gemelde mijlpalen
--    in plaats van exact op een drempel te toetsen, zodat een gemiste melding
--    zichzelf herstelt (0070). Een herstelde melding hoort dan het getal van dát
--    moment te dragen — "telt 10 schakels" terwijl het er inmiddels 11 zijn. Een
--    mijlpaal markeert een moment.

begin;

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

    -- ⚠️ `type` en `sender_id` staan er sinds 0071 bij, en dat is het tweede slot
    --    van die migratie: alleen `plaats_systeembericht()` schrijft deze
    --    combinatie, dus een door een lid geplaatste rij met hetzelfde
    --    `system_event` kan de aankondiging niet wegdrukken.
    --
    -- ⚠️ **Deze vier regels zijn bij het schrijven van 0075 één keer verdwenen**,
    --    doordat het functielichaam uit 0070 gekopieerd werd in plaats van uit
    --    0071 — de laatste versie. Dat is de valkuil van `create or replace`: een
    --    migratie die één regel wil veranderen, herschrijft de hele functie, en
    --    alles wat er tussendoor bij is gekomen verdwijnt geruisloos mee. De test
    --    `telt een vervalst bericht niet mee als gemelde mijlpaal` werd rood en
    --    heeft dat gevangen. **Bij elke `create or replace`: haal het lichaam uit
    --    `pg_get_functiondef()` of uit de nieuwste migratie, nooit uit de
    --    migratie waar de functie voor het eerst stond.**
    select count(*) into v_gemeld
    from chat_messages m
    where m.group_id     = new.group_id
      and m.system_event = 'chain_milestone'
      and m.type         = 'system'
      and m.sender_id is null;

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
        -- ⚠️ `body` blijft precies wat het was. Het is de terugval voor een app
        --    die deze gebeurtenis nog niet kent, en die zin veranderen zou de
        --    geschiedenis van twee kanten laten verschillen.
        'De Ketting van deze groep telt ' || v_drempels[i] || ' schakels.',
        p_payload => jsonb_build_object('drempel', v_drempels[i])
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
  'persoon: de mijlpaal is van de groep. De drempel gaat mee in `payload`, want '
  'de app maakt de zin zelf (0059) en `body` is alleen nog terugval. Telt '
  'gemelde mijlpalen in plaats van exact op een drempel te toetsen, zodat een '
  'gemiste of gedubbelde melding zichzelf herstelt.';

revoke all on function meld_ketting_mijlpaal() from public, anon, authenticated;

commit;
