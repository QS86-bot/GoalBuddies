-- 0089_je_dagritme_is_niet_van_de_groep.sql — drie kolommen die niemand had moeten delen
--
-- ROLLBACK-PAD:
--   drop view if exists mijn_profiel;
--   grant select on public.profiles to authenticated, anon;
--
-- ---------------------------------------------------------------------------
-- Wat er lekte
-- ---------------------------------------------------------------------------
--
-- Bevinding van 16-08-2026: `profiles_select` is
-- `id = auth.uid() or shares_group_with_user(id)`, en RLS kan geen kolommen
-- beperken. Elke buddy kon dus `reminder_time`, `reminder_enabled` en
-- `reminder_tone` van elk ander lid uitlezen.
--
-- ⚠️ **Dat is geen tegenslagsignaal maar iets persoonlijkers: je dagritme.** Wanneer
--    je herinnering afgaat en of hij aanstaat, zegt samen hoe laat je aan je doel
--    werkt — en of je dat überhaupt nog wilt weten. Domeinregel 7 gaat hier niet
--    eens over; dit is gewoon niemands zaak.
--
-- ⚠️ En anders dan bij de meeste bevindingen heeft niemand dit ooit besloten. Het
--    volgde uit het feit dat de policy op rijen werkt en de kolommen toevallig in
--    dezelfde tabel staan.
--
-- ---------------------------------------------------------------------------
-- Waarom een kolomintrekking en niet een tweede tabel
-- ---------------------------------------------------------------------------
--
-- 0050 loste hetzelfde probleem op door `risk_status` en `risk_reason` naar
-- `goal_risk` te verhuizen, en dat is hier ook overwogen. Het is duurder en
-- riskanter:
--
-- ⚠️ **`supabase/functions/notificaties/` leest deze drie kolommen, en die code
--    valt buiten typecheck, lint én CI** — een bevinding die op deze lijst staat en
--    die zichzelf al een keer heeft bewezen. Kolommen verplaatsen betekent daar een
--    gelijktijdige deploy, en gaat die mis, dan sturen we geen herinneringen meer
--    zonder dat iets rood wordt.
--
-- Een kolomintrekking raakt die functie niet: **grants zijn per rol**, en de Edge
-- Function draait als `service_role`. Die houdt zijn rechten en blijft draaien
-- zonder één regel te wijzigen.
--
-- ⚠️ Maar een intrekking treft ook de eigenaar zelf, want een grant kent geen
--    rijen. Vandaar de view: `mijn_profiel` draait met de rechten van zijn
--    eigenaar (`security_invoker = false`) en geeft precies één rij terug — die van
--    de aanroeper. Zelfde vorm als `group_visible_streaks`.

-- ⚠️ **Eerst de tabelbrede grant weg, en dán per kolom teruggeven.** Dit is de
--    val waar de eerste versie van deze migratie in liep, en hij is stil: een
--    `revoke select (kolom)` haalt niets af van een grant die op de héle tabel
--    staat. Postgres houdt het tabelrecht, de intrekking doet niets, en de
--    migratie draait zonder één waarschuwing. De test die een groepsgenoot die
--    kolommen liet opvragen, was het enige dat het liet zien.
--
-- ⚠️ En dus staat hier een expliciete kolomlijst. Komt er een kolom bij
--    `profiles`, dan is hij **niet** leesbaar voor groepsgenoten tot iemand hem
--    hier toevoegt — en dat is precies de goede kant om op te falen. Zie de
--    regel in CLAUDE.md: voor elk nieuw oppervlak is beschermd het antwoord tot
--    iemand het tegendeel besluit.

revoke select on public.profiles from authenticated, anon;

grant select (id, display_name, avatar_url) on public.profiles to authenticated;

comment on column public.profiles.reminder_time is
  'Wanneer de dagelijkse herinnering afgaat. ⚠️ Sinds 0089 niet leesbaar voor de '
  'rol authenticated: profiles_select geeft groepsgenoten de rij, en RLS kan geen '
  'kolommen beperken. De eigenaar leest hem via de view mijn_profiel; de '
  'notificatiejob leest hem als service_role.';

comment on table public.profiles is
  'Profielen. ⚠️ authenticated heeft geen tabelbrede SELECT meer maar een '
  'expliciete kolomlijst (0089): id, display_name en avatar_url. Alles daarbuiten '
  'is alleen voor de eigenaar, via de view mijn_profiel. Een nieuwe kolom is dus '
  'standaard dicht — zet hem er bewust bij als de groep hem hoort te zien.';

create or replace view public.mijn_profiel
  with (security_invoker = false, security_barrier = true)
as
  select p.*
  from public.profiles p
  where p.id = auth.uid();

comment on view public.mijn_profiel is
  'Je eigen profiel, met alle kolommen — ook de drie die 0089 voor andere leden '
  'heeft dichtgezet. ⚠️ security_invoker = false is hier de hele werking: de view '
  'draait met de rechten van zijn eigenaar en omzeilt daarmee de kolomintrekking, '
  'terwijl de where-clausule hem tot precies één rij beperkt. security_barrier '
  'voorkomt dat een slimme where-clausule van de aanroeper eerder wordt '
  'uitgevoerd dan die filter.';

alter view public.mijn_profiel owner to postgres;

revoke all on public.mijn_profiel from public, anon;
grant select on public.mijn_profiel to authenticated;
