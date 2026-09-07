-- 0189_een_bevestigde_straf_houdt_zijn_spoor.sql — een doel verwijderen wiste een bevestigde straf én zijn auditspoor (QS8-331)
--
-- ROLLBACK-PAD:
--   `verwijder_doel(uuid)` terugzetten uit
--   `0084_een_bron_voor_de_zichtbare_commitmentstanden.sql` — dat is de laatste
--   definitie vóór deze migratie. 📏 Nagemeten met een grep over
--   `supabase/migrations/`: 0046 maakt hem, 0058 zet de commitmentpoort erin en
--   0084 vervangt de derde kopie door `commitment_zichtbaar_voor_groep()`.
--   `create or replace` zonder handtekeningwijziging, dus geen grants opnieuw.
--   Deze migratie schrijft geen enkele rij.
--
-- ---------------------------------------------------------------------------
-- Wat er verdween
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack, als `authenticated` eigenaar en met de
-- kolommen die de client ook gebruikt:
--
--   straf vooraf              1        auditregels vooraf   1
--   verwijder_doel()          {"ok": true}
--   straf na                  0        auditregels na       0
--
-- Binnen de bedenktijd van 24 uur kon een eigenaar een doel met een straf
-- aanmaken, die straf bevestigen, en daarna het doel verwijderen. Achteraf was
-- er geen enkel spoor dat de straf ooit bestaan had.
--
-- `commitments_goal_id_fkey` is `on delete cascade` en
-- `commitment_events_commitment_id_fkey` óók, dus de hele geschiedenis ging mee.
--
-- Dat botst met twee domeinregels tegelijk. **Domeinregel 5** — een commitment
-- device moet auditeerbaar zijn, en een auditspoor dat met één knop meeverdwijnt
-- is dat niet. **Domeinregel 6** — geschiedenis corrigeer je met een
-- correctie-record en niet door hem te overschrijven; `commitment_events` is
-- dezelfde soort geschiedenis als een voltooiing.
--
-- ---------------------------------------------------------------------------
-- Waarom de poort van 0058 hier te smal was
-- ---------------------------------------------------------------------------
--
-- 0058 blokkeert wat `commitment_zichtbaar_voor_groep()` teruggeeft:
-- `unlocked`, `due`, `resolved`. De redenering daar was dat de groep die
-- standen al gezien heeft, en dat weggooien dan geschiedenis wist die niet meer
-- alleen van jou is.
--
-- ⚠️ **Maar de vraag is niet wie het gezien heeft, maar of het gebeurd is.**
-- Een straf op `set` is bevestigd — 📏 `commitments.confirmed_at` is `NOT NULL`,
-- dus élke rij in die tabel is een bevestigde afspraak, per constructie. De
-- gebruiker heeft hem vastgelegd en `noteer_commitment()` heeft er een regel
-- over geschreven. Dát is de geschiedenis die domeinregel 6 bedoelt, ongeacht
-- of een ander hem al kon lezen.
--
-- De poort gaat daarom van "een stand die de groep ziet" naar "er hangt een
-- commitment aan dit doel".
--
-- ---------------------------------------------------------------------------
-- Waarom weigeren en niet het spoor bewaren
-- ---------------------------------------------------------------------------
--
-- Het issue noemde drie richtingen. De tweede is gebouwd:
--
--   1. `commitment_events` niet mee laten cascaderen.
--   2. weigeren zolang er een commitment aan het doel hangt.   ← gebouwd
--   3. archiveren in plaats van verwijderen.
--
-- ⚠️ **Richting 1 levert een spoor op dat niemand kan lezen.** De enige weg
-- terug van een auditregel naar zijn onderwerp is `commitment_id`; met een
-- nullable kolom en een verwijderde straf staat er een rij zonder context, en
-- `commitment_events_select` hangt aan de straf. Dan is de letter van
-- domeinregel 6 gehaald en de bedoeling niet — bewaren zonder betekenis.
--
-- ⚠️ **Richting 3 is niet nodig, want hij bestaat al.** `verwijder_doel()` is de
-- uitzondering en niet de regel: hij bestaat sinds 0046 voor een doel dat je per
-- ongeluk hebt aangemaakt, en alleen binnen de bedenktijd. Voor alles daarbuiten
-- ís archiveren de weg, en dat is precies wat de bestaande meldingen bij
-- `heeft_weekdoelen` en `heeft_punten` al zeggen. Deze migratie zet er een derde
-- geval naast, in dezelfde vorm en met dezelfde uitweg.
--
-- ⚠️ **De prijs, en die is echt.** Wie binnen de bedenktijd een straf aan een
-- doel hangt, kan dat doel daarna niet meer verwijderen — ook niet na het
-- intrekken van die straf, want een ingetrokken straf is `cancelled` en blijft
-- als rij staan. Dat is met opzet: juist de intrekking is het spoor dat
-- domeinregel 5 wil bewaren. De uitweg is archiveren, en die is omkeerbaar.

create or replace function public.verwijder_doel(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  g goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  select g2.* into g from goals g2 where g2.id = p_goal_id and g2.owner_id = auth.uid();

  if g.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if g.created_at < now() - bedenktijd() then
    return jsonb_build_object('ok', false, 'reason', 'te_oud');
  end if;

  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'gedeeld_met_groep');
  end if;

  if exists (select 1 from weekly_goals w where w.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_weekdoelen');
  end if;

  if exists (select 1 from points_ledger p where p.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_punten');
  end if;

  -- 0058, en sinds 0084 uit de gedeelde bron in plaats van een derde kopie.
  --
  -- ⚠️ **Deze tak blijft staan en gaat vóór de nieuwe**, en dat is geen
  --    volgordekwestie maar een meldingskwestie: een straf die al verschuldigd
  --    is, verdient de melding die dát zegt ("je straf is al in werking
  --    getreden") en niet de algemenere. De eerste versie van deze migratie
  --    verving hem per ongeluk, en `epic9.test.ts` ving dat.
  if exists (
    select 1 from commitments c
     where c.goal_id = p_goal_id
       and c.status = any (commitment_zichtbaar_voor_groep())
  ) then
    return jsonb_build_object('ok', false, 'reason', 'commitment_in_werking');
  end if;

  -- ⚠️⚠️ **Elke commitment, en niet alleen een zichtbare** (QS8-331). Tot 0189
  --    stond hier `c.status = any (commitment_zichtbaar_voor_groep())` — dus
  --    `unlocked`, `due` en `resolved`. Een straf op `set` hield niets tegen, en
  --    die is wél bevestigd: `commitments.confirmed_at` is `NOT NULL`, dus elke
  --    rij is per constructie een vastgelegde afspraak met een auditregel erbij.
  --
  --    📏 Gemeten vóór deze migratie: straf 1 en auditregel 1 vooraf, allebei 0
  --    erna, met `{"ok": true}` als antwoord. Twee `on delete cascade`-ketens
  --    namen de hele geschiedenis mee.
  --
  --    ⚠️ Ook een `cancelled` telt mee, en dat is de kern en geen scherpslijperij:
  --    de intrekking ís het spoor dat domeinregel 5 wil bewaren. Zou hij niet
  --    meetellen, dan is intrekken-dan-verwijderen precies de omweg die deze
  --    migratie sluit.
  if exists (select 1 from commitments c where c.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_commitment');
  end if;

  delete from goals where id = p_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.verwijder_doel(uuid) is
  'Verwijdert een eigen doel binnen de bedenktijd (0046). Weigert bij een groepskoppeling, '
  'weekdoelen, geboekte punten en — sinds 0189 (QS8-331) — bij elke commitment aan het doel, '
  'ongeacht status: die is per constructie bevestigd en draagt een auditspoor dat anders '
  'meecascadeert. Voor alles daarbuiten is archiveren de weg.';
