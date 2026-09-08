-- 0203_een_opruimactie_is_geen_nieuwe_weekafsluiting.sql — een `on delete set
-- null` is een UPDATE, en die vuurde de periodetoets opnieuw af op een
-- historische rij; daardoor was een account na 35 dagen niet meer te verwijderen
-- (QS8-359).
--
-- ROLLBACK-PAD:
--   -- `bewaak_week_review_periode()` terugzetten op de definitie uit 0108
--   -- (`0108_weekafsluiting_op_de_huddledag.sql`, regel 77):
--   -- die versie heeft de vroege uitgang hieronder niet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden in de security-review op QS8-355, daarna zelf nagemeten op de echte
-- RPC met een `authenticated`-sessie.
--
-- 📏 Een gebruiker met één weekafsluiting van 65 dagen oud:
--
--      select verwijder_mijn_account()
--      ERROR:  group_period_start 2026-07-05 ligt buiten het toegestane venster
--      CONTEXT: UPDATE ONLY "public"."week_reviews" SET "user_id" = NULL
--               SQL statement "delete from auth.users where id = mij"
--               PL/pgSQL function verwijder_mijn_account() line 68
--
--    De hele verwijdering valt om. De gebruiker ziet `auth.verwijder.mislukt`,
--    probeert het morgen weer, en het lukt nooit meer.
--
-- ⚠️⚠️ **Er is geen aanvaller en geen beheerder nodig. Alleen tijd.** Elke
--    gebruiker die vijf weken geleden een weekafsluiting schreef, zit nu al
--    vast. Dat is een AVG-verplichting die stukgaat door enkel tijdsverloop.
--
-- ---------------------------------------------------------------------------
-- Waarom
-- ---------------------------------------------------------------------------
--
--      week_reviews_user_id_fkey        confdeltype = 'n'  (on delete set null)
--      week_reviews_periode_grens       BEFORE INSERT OR UPDATE
--
-- Een `on delete set null` is geen verwijdering maar een **UPDATE**
-- (`UPDATE ONLY week_reviews SET user_id = NULL`), en die vuurt de
-- BEFORE-trigger opnieuw af. Die legt dan de **historische**
-- `group_period_start` naast de **huidige** toestand: het venster van
-- `current_date - 35`, en de huidige `groups.huddle_day`.
--
-- Een rij die geldig wás toen hij geschreven werd, is dat 36 dagen later niet
-- meer — en juist op dat moment wordt hij opnieuw beoordeeld, door een actie die
-- die kolom niet eens aanraakt.
--
-- 📏 Er is een tweede variant met dezelfde oorzaak, en die heeft wél een
--    veroorzaker: na een `huddle_day`-PATCH van een beheerder faalt dezelfde
--    verwijdering met `is geen periodestart van deze groep`. Dat deel van het
--    probleem ligt bij QS8-360; deze migratie repareert de oorzaak die ze delen.
--
-- ---------------------------------------------------------------------------
-- De reparatie: een UPDATE die de periode niet verandert, wordt niet opnieuw
-- beoordeeld
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De vroege uitgang kijkt naar de gewijzigde waarden en niet naar `user_id`,
--    en dat is met opzet.** Een uitgang op "`user_id` werd NULL" zou precies één
--    opruimactie kennen en de volgende missen. Wat deze toets moet bewaken is de
--    periodestart; verandert die niet, dan is er niets nieuws te beoordelen —
--    wie de UPDATE ook doet en om welke reden dan ook.
--
-- ⚠️ **Hier stond een rechtvaardiging van `is not distinct from` die niet
--    dragend was:** `group_id` en `group_period_start` zijn allebei `not null`,
--    dus `=` en `is not distinct from` konden daar nooit verschillen. De
--    vergelijking op `to_jsonb` heeft dat probleem sowieso niet — `-` op een
--    jsonb-object vergelijkt NULL's gewoon als gelijk.
--
-- ---------------------------------------------------------------------------
-- Wat er niet verandert
-- ---------------------------------------------------------------------------
--
-- 📏 Nagemeten wat er nog wél geweigerd wordt:
--
--      een nieuwe weekafsluiting buiten het venster       -> 22007, ongewijzigd
--      een nieuwe op de verkeerde weekdag                 -> 22023, ongewijzigd
--      een UPDATE die de periodestart wél verzet          -> 22007/22023
--      een UPDATE die hem naar een andere groep verzet    -> beoordeeld
--
--    De uitgang laat alleen door wat hij belooft door te laten: een UPDATE die
--    aan de beoordeelde kolommen niets verandert.
--
-- ---------------------------------------------------------------------------
-- ⚠️ De vierde keer voor deze bugklasse
-- ---------------------------------------------------------------------------
--
-- `tests/rls/epic7.test.ts:700` beschrijft hem als de derde keer (0033,
-- 0059/0060, WERKVOORRAAD §8 punt 8) en schrijft er zelf bij: *"Deze suite zou
-- dat niet gevangen hebben… De opruiming verbergt de bug."*
--
-- 📏 Daarom is er deze keer geen losse toets maar een **veegtest**. Gemeten met
--    `pg_trigger` welke tabellen doelwit zijn van een `set null`-FK én een
--    BEFORE UPDATE-rijtrigger dragen — dat zijn er zes:
--
--      chat_messages        stamp_chat_message           al gedekt (epic7)
--      commitments          bewaak_begunstigde           kent de RI-tak zelf
--      completion_approvals fill_approval_subject
--      groups               guard_group_update / archief_blijft_archief /
--                           bewaak_tijdzone
--      week_reviews         bewaak_week_review_periode   ← dit geval
--      weekly_goals         beoordeelbaar_blijft_staan
--
--    `tests/rls/opruiming.test.ts` bouwt één gebruiker met een **verouderde**
--    rij in elk van die tabellen en verwijdert dan zijn account. Dat is de
--    belofte waar het om gaat — *een account is te verwijderen* — en niet
--    "deze ene trigger doet het goed".
--
-- ⚠️⚠️ **En die veeg vond meteen een tweede breuk, met een andere oorzaak.** Een
--    gebruiker met een goedgekeurde voltooiing én een bevestigde straf krijgt
--    `commitment_events_commitment_id_fkey`: twee FK-acties raken dezelfde
--    auditrij — `actor_id` gaat op NULL (de vertrekkende gebruiker ís de actor)
--    terwijl `commitments` via `goals` al weggecascadeerd is, en die UPDATE
--    hervalideert de FK van een ouder die er niet meer is. 📏 Nagemeten dat er
--    géén trigger op `commitments` bij betrokken is; dit is de referentiële
--    integriteit zelf.
--
--    Dat is een andere belofte (*een auditspoor overleeft zijn onderwerp niet*),
--    het raakt domeinregel 5, en het staat als **QS8-361**. `commitments` staat
--    daarom buiten de veeg hierboven, met die verwijzing erbij — meenemen zou de
--    test rood houden op iets dat deze migratie niet repareert.
--
-- ---------------------------------------------------------------------------
-- Idempotent: één `create or replace`. De handtekening verandert niet.
-- ---------------------------------------------------------------------------

create or replace function public.bewaak_week_review_periode()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_huddledag smallint;
begin
  -- ⚠️⚠️ **Een opruimactie is geen nieuwe weekafsluiting.** `on delete set null`
  --    op `week_reviews.user_id` is een UPDATE, dus deze trigger vuurt opnieuw
  --    op een rij die jaren oud kan zijn. Zie de kop voor de meting.
  --
  -- ⚠️⚠️ **De uitgang eist dat er níets anders veranderd is dan `user_id`, en
  --    dat is een gerepareerde versie.** Er stond eerst alleen dat de periode en
  --    de groep gelijk moesten blijven — en dat haalde ongemerkt een slot weg:
  --    📏 gemeten dat de eigenaar daarmee de tekst van een weekafsluiting van 69
  --    dagen oud kon herschrijven, waar het venster dat eerder weigerde. In een
  --    accountability-app is dat de rij waar je buddies onder gereageerd hebben.
  --
  --    `to_jsonb(new) - 'user_id'` vergelijkt de hele rij op één kolom na. Dat is
  --    exact wat er bedoeld wordt — *er is niets gebeurd behalve dat de eigenaar
  --    losgekoppeld is* — en het blijft kloppen als er een kolom bij komt, waar
  --    een lijstje van kolomvergelijkingen die stil zou doorlaten.
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'user_id' = to_jsonb(old) - 'user_id' then
    return new;
  end if;

  if new.group_period_start > current_date + 1
     or new.group_period_start < current_date - 35 then
    raise exception 'group_period_start % ligt buiten het toegestane venster',
      new.group_period_start
      using errcode = '22007';
  end if;

  -- ⚠️ Zie de kop: een periode begint op de huddledag van de groep. Zonder deze
  --    toets is elke dag in het venster een geldige "periodestart" en telt De
  --    Ketting zesendertig weken waar er zes waren.
  select g.huddle_day into v_huddledag from groups g where g.id = new.group_id;

  -- Geen groep gevonden betekent dat de foreign key zo meteen afgaat; die
  -- foutmelding is duidelijker dan een zelfbedachte.
  if v_huddledag is not null
     and extract(dow from new.group_period_start)::smallint <> v_huddledag then
    raise exception 'group_period_start % is geen periodestart van deze groep',
      new.group_period_start
      using errcode = '22023';
  end if;

  return new;
end;
$$;
