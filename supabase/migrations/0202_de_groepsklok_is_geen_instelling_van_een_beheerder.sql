-- 0202_de_groepsklok_is_geen_instelling_van_een_beheerder.sql — `groups.tz` is de
-- tweede klok van domeinregel 1 en niet een veld dat een beheerder met één PATCH
-- verzet (QS8-355).
--
-- ROLLBACK-PAD:
--   grant update (tz) on table public.groups to authenticated;
--   -- en `guard_group_update()` terugzetten op de definitie uit 0193 (QS8-231):
--   -- die versie pint `tz` niet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden in de security-review op QS8-352 bij het nalopen van
-- `GEEN_SCHRIJFPAD` in `scripts/kolomrechten-controle.mjs`, en zelf nagemeten.
--
-- 📏 De waarde was bewaakt, het moment niet:
--
--      has_column_privilege('authenticated','groups','tz','UPDATE')  true
--      groups_update USING                                  is_group_admin(id)
--      trigger groups_tijdzone -> bewaak_tijdzone()   eist een echte zone
--      guard_group_update()                           pinde tz niet
--
-- 📏 En end-to-end, met een echte sessie van de beheerder:
--
--      create_group('Klokgroep')                   -> tz Europe/Amsterdam
--      update groups set tz = 'Pacific/Kiritimati' -> geaccepteerd
--      groepsdatum(gid)                            -> 2026-09-09
--
--    De serverdatum was 2026-09-08. Eén PATCH en de weekgrens van iedereen in de
--    groep staat een dag verder.
--
-- ---------------------------------------------------------------------------
-- Waarom dit dichtgaat en er geen RPC voor in de plaats komt
-- ---------------------------------------------------------------------------
--
-- Het issue laat de keuze open: nee (dichtzetten) of ja-maar-zorgvuldig (een
-- eigen RPC met de zorgvuldigheid van een commitment device). **Het antwoord is
-- nee**, en dat is de conservatiefste optie die het werk áf maakt.
--
-- ⚠️ De grondwet zegt het met zoveel woorden: *voor élk nieuw oppervlak is
--    beschermd het antwoord tot iemand het tegendeel besluit*. Een handeling die
--    de weekgrens van élk lid verschuift, is nooit als handeling ontworpen — er
--    is geen scherm, geen bevestiging, geen systeembericht en geen auditrij. Hem
--    laten staan omdat hij toevallig bestaat, ís stilzwijgend voor "ja" kiezen.
--
-- ⚠️ En een RPC bouwen zou de vraag beantwoorden die niemand gesteld heeft. Zo'n
--    RPC vraagt een nieuw type systeembericht (en dus een migratie op de
--    allowlist `chat_messages_system_event_bekend`), een bevestigingsstap en een
--    besluit over wat er zichtbaar wordt als de weekgrens verspringt terwijl een
--    week nog loopt. Dat is een feature, geen reparatie.
--
-- 📏 Er breekt niets, en deze meting is de tweede versie — de eerste was fout en
--    dat is de moeite van het opschrijven waard.
--
--    `tz` wordt client-zijdig alleen bij het **aanmaken** gezet: `api.ts` geeft
--    `apparaatTijdzone()` mee aan `create_group()`. De updatehelper
--    `wijzigGroep()` schrijft negen kolommen — `name`, `huddle_day`,
--    `evidence_policy`, `approval_rule`, `approval_quorum`, `season_cadence`,
--    `categorie`, `omschrijving`, `voertaal` — en `tz` staat daar niet bij, en
--    ook niet in `groepSchema`.
--
--    ⚠️ **Hier stond eerst "aantoonbaar alleen `huddle_day` en `name`, dat staat
--    zelfs onder test in `wijzigen.test.ts`".** Dat waren er negen, en die twee
--    kwamen uit een **fixture**: `wijzigen.test.ts:54` voert een verzonnen
--    bronstring aan `geschrevenKolommen()` om díe helper te toetsen. Ik las een
--    testvoorbeeld als een meting aan de echte bron. Gevonden in de
--    security-review van 08-09.
--
--    Wat er wél onder test staat is beter dan wat ik beweerde: `wijzigen.test.ts`
--    legt `groepSchema` en de updatelijst in **beide richtingen** naast elkaar
--    ("laat geen veld dood in de update-lijst" en "schrijft geen kolom die het
--    schema niet kent"). Een `tz` die niet in het schema zit, kan dus ook niet
--    stil in de updatelijst verschijnen.
--
-- ---------------------------------------------------------------------------
-- Twee grendels, en de tweede is niet overbodig
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De kolomgrant weigert luid, de pin vangt stil op.** Dat is dezelfde
--    combinatie die `zichtbaarheid` en `ontdekbaar` al dragen, en de volgorde
--    doet ertoe: zonder de `revoke` zou de pin een PATCH stilzwijgend negeren en
--    200 teruggeven — de klasse "succes dat er geen is" waar dit project al drie
--    keer op gestruikeld is (QS8-314, QS8-326, QS8-342). Met de `revoke` krijgt
--    de client 42501 en weet hij dat er niets gebeurd is.
--
--    De pin blijft er wél bij staan, want RLS kan geen kolommen beperken: komt
--    de grant ooit terug (een `alter default privileges`, een migratie die
--    `grant update on groups` schrijft), dan is de pin het net eronder.
--
-- ---------------------------------------------------------------------------
-- Idempotent: een `revoke` en een `create or replace` op één functie. De
-- handtekening verandert niet.
-- ---------------------------------------------------------------------------

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`: in Supabase
--    deelt `alter default privileges` élke nieuwe tabel in `public` uit aan alle
--    drie, en `from public, anon` houdt precies de rol over waaronder iedere
--    ingelogde gebruiker draait. Beveiligingsregel 4.
revoke update (tz) on table public.groups from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_group_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.id               := old.id;
  new.created_at       := old.created_at;
  new.invite_code      := old.invite_code;
  new.invite_revoked   := old.invite_revoked;
  new.status           := old.status;
  new.last_activity_at := old.last_activity_at;
  new.zichtbaarheid    := old.zichtbaarheid;
  -- QS8-231: ontdekbaarheid is een toestemming en geen instelling.
  new.ontdekbaar       := old.ontdekbaar;

  -- ⚠️⚠️ **De groepsklok, sinds QS8-355.** `groups.tz` is de tweede klok van
  --    domeinregel 1: `currentGroupPeriod()` leest hem, en daarmee bepaalt hij de
  --    huddledag, de weekafsluiting, De Ketting en het groepsoverzicht — voor élk
  --    lid. Eén beheerder verschoof daarmee de weekgrens van de hele groep, met
  --    één PATCH, buiten elk scherm om.
  --
  -- 📏 Nagemeten vóór deze migratie, met een echte sessie van de beheerder:
  --
  --      create_group('Klokgroep')                  -> tz Europe/Amsterdam
  --      update groups set tz = 'Pacific/Kiritimati' -> geaccepteerd
  --      groepsdatum(gid)                            -> 2026-09-09
  --
  --    De serverdatum was 2026-09-08. Eén PATCH, en de groep staat een dag verder.
  new.tz               := old.tz;

  -- ⚠️⚠️ **De tak van 0060 is hier weg, en dat is gemeten en niet bedacht.**
  --    Daar stond `if old.created_by is null or new.created_by is not null`, om
  --    de overgang *van een oprichter naar geen oprichter* door te laten — de
  --    `on delete set null` die 0033 en 0060 beschrijven.
  --
  --    Die reden is achterhaald door de reparatie hierboven. Deze regel wordt
  --    **alleen nog bereikt door een client**: elke andere schrijver, de
  --    referentiële actie inbegrepen, komt niet voorbij de vroege uitgang. Dat
  --    is nagemeten — bij `delete from auth.users` draait de RI-actie met
  --    `current_user = postgres`.
  --
  --    De tak liet daarmee precies één ding door dat niemand wil: een
  --    beheerder-client die het oprichterschap van zijn eigen groep leegtrekt.
  --    Gemeten met een tijdelijk `grant update (created_by)`: **NULL**, de pin
  --    hield hem niet tegen. Met deze regel onvoorwaardelijk blijft de oprichter
  --    staan, én loopt het verwijderen van een account nog gewoon door.
  new.created_by := old.created_by;

  return new;
end;
$function$;
