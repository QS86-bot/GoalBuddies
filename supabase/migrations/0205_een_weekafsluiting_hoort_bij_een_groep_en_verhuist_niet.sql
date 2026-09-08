-- 0205_een_weekafsluiting_hoort_bij_een_groep_en_verhuist_niet.sql — één PATCH
-- van `group_id` nam de reacties van andere leden mee naar een groep waar de
-- schrijvers ervan nooit in gezeten hebben (QS8-362)
--
-- ROLLBACK-PAD:
--   drop trigger if exists week_reviews_pin on public.week_reviews;
--   drop function if exists public.pin_week_review();
--
--   ⚠️ Deze migratie voegt alléén toe: geen policy, grant of constraint van vóór
--      0205 wordt gewijzigd. Er is dus niets terug te zetten.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- Alice zit in groep A (met Bob) en in B (met Carol). Bob schrijft een reactie
-- onder Alice' weekafsluiting in A. Alice doet één verzoek:
--
--   PATCH /week_reviews?id=eq.<id>   {"group_id": "<B>"}
--
-- 📏 Gemeten end-to-end via de lokale PostgREST met drie echte JWT's, vóór deze
--    migratie:
--
--      verhuizing naar groep B          -> toegelaten
--      Carol leest week_review_replies  -> 1 rij: "Bob zijn prive reactie in groep A"
--
-- `week_review_replies_select` leidt de zichtbaarheid af uit de `group_id` van de
-- óuder, dus de reacties verhuizen mee. Wat er lekt is de tekst van een ánder
-- lid, geschreven in een groep waar de lezer niet in zit.
--
-- ⚠️ **Beide helften van `week_reviews_write` blijven waar bij zo'n verhuizing.**
--    `using` en `with check` zijn allebei
--    `user_id = auth.uid() and is_group_member(group_id)`, en Alice ís lid van B.
--    De policy is hier dus niet de grens — de kolom is dat. Dat is de les die
--    CLAUDE.md bij domeinregel 7 al opschrijft: **RLS kan geen kolommen
--    beperken.**
--
-- ---------------------------------------------------------------------------
-- Waarom een pin en géén `revoke` — en dat is een correctie op het issue
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ QS8-362 stelt voor de kolomgrant weg te halen en noemt dat *"de goedkoopste
--    en de meest volledige"*, met de onderbouwing dat er niets breekt omdat
--    `bewaarWeekafsluiting()` die drie kolommen nooit verándert. **Dat klopt niet,
--    en het is twee keer nagemeten.**
--
--    `bewaarWeekafsluiting()` is een `upsert` op de natuurlijke sleutel. PostgREST
--    maakt daar `insert ... on conflict (…) do update set …` van, met álle
--    kolommen uit de body in de `set`-lijst — de conflictkolommen incluis, want
--    zonder die kolommen in de body is de rij niet te vinden. Postgres toetst het
--    UPDATE-recht op die kolommen dan ook, en wel meteen: niet pas als de
--    conflicttak gekozen wordt.
--
--    📏 Gemeten met `revoke update (group_id, group_period_start, user_id)` erop,
--       via de echte PostgREST:
--
--         opslaan van een weekafsluiting  -> geweigerd 42501
--
--       Niet alleen het bijwerken: ook de éérste keer opslaan. De reparatie zou
--       de feature volledig uitzetten.
--
--    ⚠️ "Verandert de kolom nooit" en "schrijft de kolom nooit" zijn twee
--       verschillende dingen, en een rechtentoets kijkt naar het tweede. Dat
--       verschil is precies waarom dit nagemeten hoorde te worden en niet
--       overgenomen.
--
-- Vandaar een **pin** in de vorm van `stamp_chat_message()` (0188) en
-- `guard_group_update()`: hij vergelijkt met `is distinct from`, dus dezelfde
-- waarde terugschrijven mag — dat is wat de upsert doet — en een échte
-- verandering wordt geweigerd.
--
-- ⚠️ **Eerst melden, dan pas pinnen** (QS8-314, QS8-326). Deze werpt en zet niet
--    stil terug: een beller die een verhuizing probeert hoort een fout te krijgen
--    en geen HTTP 200 over iets dat niet gebeurd is.
--
-- ⚠️⚠️ **`user_id` draagt een uitzondering, en zonder die uitzondering breekt het
--    verwijderen van een account.** `week_reviews_user_id_fkey` is
--    `on delete set null`, dus Postgres doet zélf een UPDATE die `user_id` op
--    NULL zet zodra een profiel verdwijnt. Gevuld → NULL is dus de foreign key en
--    geen client, en die tak moet erlangs. Exact dezelfde uitzondering als in
--    `stamp_chat_message()`, en dezelfde reden. QS8-359 gaat over precies dat
--    opruimpad; deze migratie mag het niet opnieuw dichtzetten.
--
-- ⚠️ `group_id` heeft `on delete cascade` en `group_period_start` heeft geen FK,
--    dus die twee kennen zo'n uitzondering niet en liggen onvoorwaardelijk vast.

create or replace function public.pin_week_review() returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp' as $$
begin
  if new.group_id is distinct from old.group_id
     or new.group_period_start is distinct from old.group_period_start
     or (new.user_id is distinct from old.user_id and new.user_id is not null)
  then
    raise exception 'Een weekafsluiting hoort bij één groep, één lid en één periode'
      using errcode = 'check_violation',
            hint = 'group_id, user_id en group_period_start liggen vast zodra de weekafsluiting er staat; de tekstvelden zijn wel te wijzigen.';
  end if;

  new.group_id := old.group_id;
  new.group_period_start := old.group_period_start;

  -- ⚠️ **Deze vorm is de vorm die `onveranderlijkheid_bewaking()` herkent, en dat
  --    is geen toeval maar een gemeten reparatie.** Mijn eerste versie stond er
  --    als `if new.user_id is not null then …` — semantisch hetzelfde voor dit
  --    geval, en tóch rood: die bewaking eist letterlijk
  --    `old.<kolom> is null or new.<kolom> is not null`, precies zodat er één
  --    herkenbare vorm is voor de val die 0031, 0033 en 0059 alle drie maakten.
  --    Een eigen variant is hier dus een variant te veel.
  if old.user_id is null or new.user_id is not null then
    new.user_id := old.user_id;
  end if;

  return new;
end $$;

comment on function public.pin_week_review() is
  'Pint groep, lid en periode van een weekafsluiting (QS8-362). Een verhuizing '
  'naar een andere groep nam de reacties van andere leden mee. Geen revoke: '
  'de upsert van bewaarWeekafsluiting() schrijft die kolommen wél, met dezelfde '
  'waarde — 42501 zou de hele feature uitzetten.';

revoke all on function public.pin_week_review() from public, anon, authenticated;

drop trigger if exists week_reviews_pin on public.week_reviews;
create trigger week_reviews_pin before update on public.week_reviews
  for each row execute function public.pin_week_review();
