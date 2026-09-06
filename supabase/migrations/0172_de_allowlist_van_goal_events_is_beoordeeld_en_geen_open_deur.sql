-- 0172_de_allowlist_van_goal_events_is_beoordeeld_en_geen_open_deur.sql — `goal_events_bewaking()` meldt zodra de allowlist afwijkt van de vier die tegen domeinregel 7 gewogen zijn, én zodra hij de CHECK niet herkent (QS8-176).
--
-- ROLLBACK-PAD:
--   drop function if exists public.goal_events_bewaking();
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Oppervlak 24 uit `docs/decisions/002-domeinregel7-oppervlakken.md`.
-- `goal_events_select` is `owner_id = auth.uid() or shares_group_with_goal(g.id)`
-- en volgt daarmee het **doel** en niet de **groep** — de enige uitzondering in
-- deze feature. Sinds een doel in meer dan één groep kan staan (QS8-56) leest een
-- lid van groep A het `deadline_moved`-event dat groep B goedkeurde.
--
-- 📏 **Dat is gemeten en aanvaard, niet over het hoofd gezien.** De vier types in
--    de allowlist dragen geen tegenslag. Deze migratie verandert die policy dan
--    ook **niet**; hij laat de voorwaarde eronder bijten.
--
-- ⚠️ **De voorwaarde staat in de dossierrij zelf:** *"wordt zwaarder als er een
--    vijfde `event_type` bij komt."* Dat is een besluit dat aan een toekomstige
--    feature hangt, en dit project heeft één keer betaald voor precies die vorm —
--    A17, teruggedraaid op 20-08 met migratie 0050. De les die CLAUDE.md eruit
--    trok is: schrijf "herbevestigen vóór X" op zodra een besluit aan een
--    toekomstige feature hangt. Hier is X een vijfde type.
--
-- ---------------------------------------------------------------------------
-- Wat er al stond, en wat deze migratie er wél aan toevoegt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Mijn eerste versie van deze kop beweerde dat `policies.test.ts` alleen de
--    gelíjkheid van twee lijsten bewaakt en dus een vijfde type doorlaat. Dat was
--    onjuist, en de security-review heeft het gemeten.** `policies.test.ts:3381`
--    pint eerst hardgecodeerd op precies vier waarden en vergelijkt daarna pas
--    met `DOELGEBEURTENISSEN`; een vijfde snake_case type wordt daar dus wél
--    rood, met of zonder deze migratie.
--
-- Wat overblijft is smaller en scherper, en dat is wat deze functie toevoegt:
--
--   1. **Een vijfde type dat de bestaande ontleding niet ziet.** `check_waarden()`
--      — waar die test op leunt — haalt de literals met tekstontleding uit de
--      CHECK. Een type met een cijfer of een hoofdletter dat alléén in de CHECK
--      komt, geeft daar ook vier terug en beide asserties slagen. Deze functie
--      meldt dat, en wel omdat hij de **vorm** toetst en niet alleen de inhoud.
--   2. **De grendel woont in de database.** Een test verhuist, wordt hernoemd of
--      overgeslagen; een bewakingsfunctie staat naast het slot dat hij bewaakt.
--      Dat is de reden dat dit project er al twaalf heeft.
--
-- Meer is het niet, en die eerlijkheid staat hier omdat dit project op geschreven
-- redenen stuurt: een migratie die met "deze klasse is nu gedekt" in het dossier
-- landt, laat de volgende lezer stoppen met kijken op de plek waar het gat wél zit.
--
-- ---------------------------------------------------------------------------
-- De vier, en waarom elk van hen door de weging kwam
-- ---------------------------------------------------------------------------
--
--   created         het bestaan van een doel; de groep ziet het doel toch al
--   deadline_moved  vraag je zelf aan, een buddy keurt goed — A7, verruiming §4a
--   archived        een doel afsluiten is geen gemiste week
--   completed       een afronding, en dat is per definitie positief
--
-- ⚠️ `scope_reduced` en `milestone_dropped` stonden hier tot 25-08-2026 in en zijn
--    er met 0087 uit gehaald: dát zijn tegenslagsignalen over iemand anders. Deze
--    bewaking bestaat om te voorkomen dat zoiets terugkomt zonder besluit.
--
-- ⚠️ **Wat deze functie níét dekt**, en dat staat als dossierrij in
--    `docs/ENGINEER-REVIEW.md`: hij kijkt naar de **naam** van een gebeurtenis en
--    niet naar de **inhoud**. `goal_events.old_value` en `new_value` zijn
--    ongevalideerde jsonb die elke gekoppelde groep meeleest; een feature die daar
--    een toelichting in zet, verbreedt oppervlak 24 met deze bewaking op groen.
--    De `using`-expressie van `goal_events_select` is evenmin vastgepind.

drop function if exists public.goal_events_bewaking();

create function public.goal_events_bewaking()
returns table(gebeurtenis text, bezwaar text)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  with beoordeeld(naam) as (
    -- Het register: de vier die op 27-08-2026 gewogen zijn. Een regel hier is
    -- een besluit en geen vrijstelling.
    values ('created'), ('deadline_moved'), ('archived'), ('completed')
  ),
  def(tekst, aantal) as (
    -- ⚠️ **Op `conname` en niet op "elke CHECK die event_type noemt".** Die
    --    bredere vorm pakte bij een tweede CHECK ook de literals uit een ándere
    --    uitdrukking op — gemeten: 'geen', 'opgegeven' en 'reason' werden alle
    --    drie als ongewogen gebeurtenis gemeld. Een controle die meldt wat er
    --    niet is, leer je negeren.
    select max(pg_get_constraintdef(c.oid)), count(*)
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'goal_events'
      and c.contype = 'c'
      and c.conname = 'goal_events_type_valid'
  ),
  herkend(tekst) as (
    select d.tekst
    from def d
    where d.aantal = 1
      and d.tekst ~ '^CHECK \(\(event_type = ANY \(ARRAY\[.*\]\)\)\)$'
  ),
  huidig(naam) as (
    -- ⚠️ **De literals zoals Postgres ze deparset, en niet "tekst tussen
    --    aanhalingstekens die op een naam lijkt".** De eerste versie matchte op
    --    [a-z_]+ en gaf daardoor NUL rijen bij goal_paused_v2 en bij
    --    scopeReduced — hij zweeg precies waar hij belooft te melden. Drie keer
    --    gemeten, drie keer nul. Gevonden door de security-review, niet door mij.
    select (regexp_matches(h.tekst, '''([^'']*)''::text', 'g'))[1]
    from herkend h
  )
  -- ⚠️ **Tak 1: de vorm, en dit is de belangrijkste.** Onparseerbaar leverde in
  --    de eerste versie nul rijen op, en nul rijen betekent in deze functie
  --    "alles in orde". Een bewaking die niet zegt dat hij het niet begreep, is
  --    gevaarlijker dan geen bewaking: je stopt met zelf kijken. Herkent hij de
  --    CHECK niet, dan is dát het alarm.
  select 'goal_events_type_valid'::text,
         case
           when d.aantal = 0
             then 'de CHECK bestaat niet meer. Oppervlak 24 leunt erop dat de allowlist '
                  'begrensd is; zonder CHECK is elke waarde toegestaan.'
           when d.aantal > 1
             then 'meerdere constraints met deze naam gevonden. Deze functie weet dan niet '
                  'welke hij leest, en dat is geen basis om groen op te staan.'
           else 'de CHECK heeft niet de verwachte ANY(ARRAY[...])-vorm. Deze functie kan hem '
                'niet lezen en zou dus zwijgen over iets waar hij juist over moet melden. '
                'Werk de bewaking bij, of zet de CHECK terug in die vorm.'
         end
  from def d
  where not exists (select 1 from herkend)
  union all
  select h.naam,
         'staat in de allowlist maar is nooit tegen domeinregel 7 gewogen. '
         'goal_events_select volgt het doel en niet de groep (oppervlak 24), dus een lid '
         'van elke gekoppelde groep leest dit. Weeg hem in '
         'docs/decisions/002-domeinregel7-oppervlakken.md en zet hem daarna in deze '
         'functie, of haal hem uit de CHECK.'
  from huidig h
  where not exists (select 1 from beoordeeld b where b.naam = h.naam)
  union all
  -- ⚠️ De andere kant van de ratel: een register dat een gebeurtenis noemt die
  --    niet meer bestaat, dekt straks stilzwijgend iets anders af. Zelfde vorm
  --    als de vijfde tak in `definer_bewaking()`.
  select b.naam,
         'staat als beoordeeld geregistreerd maar zit niet meer in de allowlist. '
         'Haal hem uit deze functie; een register dat rot, bewaakt niets.'
  from beoordeeld b
  where exists (select 1 from herkend)
    and not exists (select 1 from huidig h where h.naam = b.naam)
  order by 1;
$$;

comment on function public.goal_events_bewaking() is
  'Nul rijen zolang de CHECK op goal_events.event_type de verwachte vorm heeft én precies '
  'de vier bevat die tegen domeinregel 7 gewogen zijn. Oppervlak 24 volgt het doel en niet '
  'de groep, dus een vijfde type verbreedt wat elke gekoppelde groep leest — QS8-176.';

-- Onwrikbare regel 4 in zijn volledige vorm; een bewakingsfunctie is niets voor
-- een client, en dat is precies wat QS8-289 vandaag voor vier andere sloot.
revoke all on function public.goal_events_bewaking() from public, anon, authenticated;
grant execute on function public.goal_events_bewaking() to service_role;
