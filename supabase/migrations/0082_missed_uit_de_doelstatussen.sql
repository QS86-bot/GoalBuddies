-- 0082_missed_uit_de_doelstatussen.sql — een weggelegde bevinding, vóór hij gevuld wordt
--
-- ROLLBACK-PAD:
--   alter table public.goals drop constraint if exists goals_status_valid;
--   alter table public.goals add constraint goals_status_valid
--     check (status in ('active', 'completed', 'archived', 'missed'));
--   drop function if exists check_waarden(text, text);
--
-- Deze migratie is veilig terug te draaien: er is vandaag geen enkele rij met
-- `status = 'missed'` en er is geen functie die die waarde zet. Nagemeten op
-- 25-08-2026 — `goals` is leeg, en de drie functies die het woord 'missed'
-- bevatten (`markeer_doorgeschoven`, `verbruik_weekpas`, `herbereken_reeks`)
-- gaan alle drie over `weekly_goals.status`.
--
-- ⚠️ Eén plek zette hem wél, en dat was geen productiecode maar een **fixture**:
--    `tests/rls/epic7.test.ts` zette een doel op `missed` om te bewijzen dat daar
--    geen systeembericht van kwam. Die helft is nu `archived` — en dat is
--    sterker dan wat er stond, want `archived` is de enige statusovergang naast
--    `completed` die een gebruiker echt kan bereiken. De test bewees eerst dat
--    een waarde die niemand kon zetten geen bericht gaf.

-- ---------------------------------------------------------------------------
-- Waarom nu, terwijl er niets kapot is
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dit is de bevinding van 21-08-2026 uit `docs/ENGINEER-REVIEW.md`, en die
--    zei zelf al wanneer hij terug moest komen: **"besluit vóór iemand hem vult,
--    niet erna"**. Dat is dezelfde aantekening als bij A17, en die heeft bewezen
--    dat zo'n voorwaarde werkt.
--
-- De stand vandaag:
--
--   * `goals_status_valid` staat `missed` toe.
--   * `goals_select` is `owner_id = auth.uid() or shares_group_with_goal(id)` —
--     een groepsgenoot leest dus de héle rij van een gekoppeld doel, inclusief
--     de statuskolom. RLS kan geen kolommen beperken.
--   * Niets zet die waarde. Het is theorie.
--
-- ⚠️ **Maar het is exact de vorm van de zwaarste bevinding uit EPIC 5**
--    (`weekly_goals.status`), en migratie 0035 §2 schreef het risico al op:
--    *"missed is via goals_select leesbaar voor groepsgenoten"*. 0035 sloot de
--    schrijfweg voor clients; de wáárde bleef bestaan. Dat is een half slot: het
--    houdt een client tegen en niet de volgende definer-functie, en die schrijft
--    iemand die de bevinding niet kent.
--
--    De rollover is de plek waar dat logischerwijs gebeurt, zodra "een doel
--    waarvan de streefdatum verstreek" een eigen weergave krijgt — en dat is
--    precies het soort feature dat er ná EPIC 12 vanzelf aan komt.

-- ---------------------------------------------------------------------------
-- Waarom deze richting en niet de andere
-- ---------------------------------------------------------------------------
--
-- De bevinding noemde er twee: `missed` uit de statuslijst halen zolang niemand
-- hem gebruikt, óf de statuskolom uit `goals_select` houden zoals 0050 met
-- `risk_status` deed.
--
-- ⚠️ De tweede is veel duurder en lost minder op. `goals.status` is geen
--    tegenslagsignaal maar de gewone levensloop van een doel: `active`,
--    `completed`, `archived`. Die kolom afschermen voor groepsgenoten zou het
--    groepsoverzicht en De Ketting raken, en dat voor één waarde die niemand zet.
--
-- ⚠️ **En sinds besluit A41 is de vraag zwaarder geworden, niet lichter.** Zou
--    `missed` ooit gezet worden, dan hoort hij te variëren op
--    `groups.zichtbaarheid` — beschermd dicht, open zichtbaar, zoals 0077 t/m
--    0079 het voor de weekdoelen, de reeks en De Ketting deden. Dat is een
--    ontwerp en geen kolomgrant. Door de waarde nu weg te halen, kán die
--    beslissing niet meer overgeslagen worden: hem terugzetten is een migratie,
--    en dan komt hij langs deze kop.
--
-- Dat is hetzelfde slot als bij `chat_messages_system_event_bekend`: een nieuwe
-- waarde vraagt een migratie, en een migratie vraagt een lezer.

alter table public.goals drop constraint if exists goals_status_valid;

alter table public.goals add constraint goals_status_valid
  check (status in ('active', 'completed', 'archived'));

comment on column public.goals.status is
  'De levensloop van een doel: active, completed, archived. '
  '⚠️ missed is er op 25-08-2026 uit gehaald en dat is een slot, geen opruiming: '
  'groepsgenoten lezen deze kolom via goals_select en RLS kan geen kolommen '
  'beperken, dus een tegenslagwaarde hier is een lek van domeinregel 7. Wil je '
  'hem terug, kies dan eerst hoe hij op groups.zichtbaarheid varieert — '
  'beschermd dicht, open zichtbaar, zoals 0077 t/m 0079.';

-- ---------------------------------------------------------------------------
-- En het slot dat erbij hoort: de app-kopie moet meebewegen
-- ---------------------------------------------------------------------------
--
-- ⚠️ `STATUSSEN` in `src/modules/goals/schemas.ts` is een tweede exemplaar van
--    deze CHECK. Dat is exact de vorm waar 0032/0034 op stukliep: de database
--    kreeg er een waarde bij, de app-lijst bleef staan, en geen enkele test werd
--    rood — want de test vergeleek de app-lijst met **zichzelf**.
--
-- `systeembericht_allowlist()` (0034) loste dat op voor één CHECK, met de
-- constraint-naam ingebakken. Hier is dezelfde behoefte voor een tweede, dus
-- wordt hij algemeen. `realtime_bewaking()` (0027) doet hetzelfde voor de
-- replica identity: een test die via PostgREST praat, kan niet bij
-- `pg_constraint`.

create or replace function check_waarden(p_tabel text, p_constraint text)
  returns text[]
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m[1] order by m[1]), '{}'::text[])
  from pg_constraint c,
       lateral regexp_matches(
         pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g'
       ) as m
  where c.conrelid = ('public.' || p_tabel)::regclass
    and c.conname  = p_constraint;
$$;

comment on function check_waarden(text, text) is
  'De letterlijke waarden uit een CHECK, zodat een test kan bewijzen dat de '
  'database en een app-lijst exact hetzelfde toestaan — in beide richtingen. '
  '⚠️ Een lege uitkomst betekent "geen zo genoemde constraint" én "een '
  'constraint zonder letterlijke waarden"; een test hoort daarom op de inhoud '
  'te toetsen en niet alleen op de lengte. Algemene versie van '
  'systeembericht_allowlist() uit 0034.';

revoke all on function check_waarden(text, text) from public, anon;
grant execute on function check_waarden(text, text) to authenticated, service_role;
