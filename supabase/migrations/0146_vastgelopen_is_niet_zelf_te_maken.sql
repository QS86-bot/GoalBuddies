-- 0146_vastgelopen_is_niet_zelf_te_maken.sql — een week goedgekeurd krijgen
-- zonder buddy, door de toestand te maken die de auto-goedkeuring ontgrendelt
-- (QS8-186)
--
-- ⚠️⚠️ **DEZE MIGRATIE IS NIET AF EN HOORT NIET TE LANDEN ZOALS HIJ NU IS.**
--      De security-review van 01-09 vond vijf routes die hij níet dicht doet, en
--      weerlegde twee zinnen die hier stonden. Wat hij wél doet — `submitted_at`
--      uit de kolomgrant halen — is gemeten en klopt. Zie de blokken hieronder
--      die met deze dubbele waarschuwing beginnen.
--
-- ROLLBACK-PAD:
--   grant insert on public.completions to authenticated;
--
--   create or replace function public.vastgelopen_goedkeuringen() ...
--     -- de versie van 0135, zonder de `losgekoppeld_op`-tak in de where
--
--   ⚠️ Terugdraaien zet twee gaten terug die allebei gemeten zijn. Doe het
--      alleen als er iets kapotgaat dat zwaarder weegt dan een week die
--      zichzelf goedkeurt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dossierrij van 17-08-2026, risico **Laag**, met als voorwaarde: *"wordt
-- zwaarder als een beslissing op de koppelstand gaat leunen."* Die voorwaarde is
-- nu **drie keer** ingetreden.
--
--   1. 0064 liet het minpunt van de koppelstand afhangen — scoregat, gedicht in
--      0066.
--   2. 0110: `zet_streefdatum()` weigerde bij een gekoppeld doel, en
--      ontkoppelen-verschuiven-terugkoppelen liep eromheen. Gedicht met
--      `goals.losgekoppeld_op` plus een afkoeling van zeven dagen.
--   3. Deze migratie, en dit is de zwaarste: de **goedkeuring zelf**.
--
-- Twee routes, allebei nagespeeld op een opgebouwd schema — niet vermoed:
--
-- **Route A — de toestand maken.** `vastgelopen_goedkeuringen()` noemt een
-- voltooiing `geen_koppeling` op grond van de koppelstand van *nu*, en de
-- eigenaar mag `goal_group_links` zelf verwijderen (policy
-- `goal_group_links_delete`). Ontkoppelen, afronden, wachten tot de rollover
-- langskomt:
--
--     vastgelopen_reden           → geen_koppeling
--     keur_vastgelopen_goedkeuringen_goed(7) → 1
--     weekstatus                  → approved
--     punten geboekt              → 2
--     goedkeuringen van een buddy → 0
--
-- **Route B — de klok terugzetten, en die is erger.** `submitted_at` stond in de
-- INSERT-kolomgrant van `authenticated`, en `keur_vastgelopen_goedkeuringen_goed()`
-- meet de termijn daaraan af. Eén insert met `submitted_at = now() - 30 days`
-- levert dus geen wachttijd van zeven dagen op maar **nul**:
--
--     keur_vastgelopen_goedkeuringen_goed(7) → 1   (meteen)
--     weekstatus                  → approved
--     punten                      → 2
--
-- ⚠️ **Route B is geen gevolg van route A en staat er los van.** Ook zonder de
--    ontkoppeltruc bepaalt de client hier hoe lang zijn eigen wachttijd is.
--
-- ---------------------------------------------------------------------------
-- Waarom dit domeinregel 3 raakt en niet alleen het puntenmodel
-- ---------------------------------------------------------------------------
--
-- *"Peer-goedkeuring is een autorisatiegrens. Alleen een lid van dezelfde
-- buddy-groep mag een voltooiing goedkeuren. Nooit jezelf."*
--
-- De auto-goedkeuring van 0135 is de uitzondering daarop, en ze is er met een
-- goede reden: wie geen buddy heeft, moet niet eeuwig op `pending` blijven
-- hangen. Het gat is niet die uitzondering maar dat de eigenaar hem **op
-- afroep kan oproepen**. Daarmee is "nooit jezelf" een formaliteit: je keurt
-- niet zelf goed, je zorgt dat niemand hoeft goed te keuren.
--
-- ---------------------------------------------------------------------------
-- 1. `submitted_at` is geen mededeling van de client
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De kolom houdt zijn default en verliest alleen het recht.** `now()` staat
--    er sinds 0004 op; niets in `src/` of `app/` stuurde hem ooit mee (gemeten
--    met de schrijfkant van `kolomrechten:controle`, QS8-258). Dit recht was
--    dus nooit een pad — het was een deur die niemand gebruikte en die
--    openstond.
--
-- ⚠️ **Eerst de tabelbrede grant intrekken, en dat is geen omslachtigheid maar
--    de enige manier waarop het wérkt.** `completions` had
--    `grant insert on public.completions`, en een tabelrecht impliceert élke
--    kolom — ook een kolom die je er daarna uit probeert te halen. Gemeten: na
--    een kale `revoke insert (submitted_at)` gaf
--    `has_column_privilege('authenticated', …, 'submitted_at', 'INSERT')` nog
--    steeds `true`, en een client kon de kolom gewoon meesturen. Dezelfde vorm
--    als de `revoke ... from public, anon`-val uit beveiligingsregel 4: het zíet
--    eruit als dichtgezet en is het niet. 0043 en 0044 deden dit voor
--    `weekly_goals` al goed; dit is dezelfde beweging.
--
-- ⚠️ **`superseded_by` gaat in dezelfde ronde mee, en die stond er net zo open.**
--    `src/modules/completions/api.ts` schrijft hem nergens en het commentaar in
--    `app/(tabs)/index.tsx` zegt met zoveel woorden dat de client hem niet zelf
--    kan zetten — dat klopte voor UPDATE en niet voor INSERT. `dien_opnieuw_in()`
--    is `security definer` en heeft dit recht niet nodig.

revoke insert on public.completions from public, anon, authenticated;

grant insert (
  weekly_goal_id,
  user_id,
  achieved_level,
  note,
  attachment_url,
  cycle_start_date
) on public.completions to authenticated;

comment on column public.completions.submitted_at is
  'Wanneer deze voltooiing is ingediend. Zet de database, niet de client: '
  '`keur_vastgelopen_goedkeuringen_goed()` meet de termijn hieraan af, en een '
  'client die hem terugdateert keurt zijn eigen week meteen goed. Zie 0146.';

-- ---------------------------------------------------------------------------
-- 2. Een voltooiing die ingediend is vlak na het ontkoppelen, ligt niet vast
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het venster hangt aan twee vaste stempels en niet aan `now()`, en dat is
--    het hele punt.** Zou hier `losgekoppeld_op > now() - interval '7 days'`
--    staan — zoals in `zet_streefdatum()`, waar het klopt omdat de handeling
--    zelf op dat moment plaatsvindt — dan is dit een vertráging en geen slot:
--    de eigenaar wacht zeven dagen en de rollover keurt alsnog goed. Door
--    `submitted_at` tegen `losgekoppeld_op` te leggen, is het oordeel over déze
--    voltooiing voorgoed geveld op het moment dat ze werd ingediend.
--
--    Dezelfde gedachte als `pin_completion_cycle` (0006), het systeembericht
--    (besluit 002 §3) en `weekly_goals.ceiling_days` (0140): **de rij draagt de
--    regel waaronder hij is aangemaakt.**
--
-- ⚠️ **En de eerlijke gebruiker loopt niet vast.** Wie zijn groep echt verlaat,
--    betaalt zeven dagen — dezelfde prijs die `zet_streefdatum()` al rekent — en
--    daarna gedraagt alles zich als vanouds. Een voltooiing die binnen dat
--    venster viel, blijft `pending` tot iemand hem goedkeurt; koppel het doel
--    terug en een buddy kan dat gewoon doen. Nagespeeld: na terugkoppelen staat
--    hij niet meer als vastgelopen en verschijnt hij normaal bij de buddy.
--    Er gaat dus niets verloren (domeinregel 6), er wordt alleen niets
--    weggegeven.
--
-- ⚠️ **HIER STOND EEN ONWARE ZIN, EN DIE IS OP 01-09 GEMETEN WEERLEGD.**
--    Er stond: *"`geen_actieve_groep` en `geen_beoordelaar` blijven ongemoeid:
--    die toestanden kan de eigenaar niet zelf maken."* Dat klopt niet. Wie een
--    groep aanmaakt is er `role = 'admin'`, en dan is `archiveer_groep(g, true)`
--    één RPC — of `update group_members set status = 'inactive'` op de buddy.
--    Allebei gemeten: week `approved`, twee punten, nul goedkeuringen.
--
-- ⚠️ **En deze migratie sluit daarmee één van de zes routes.** De andere vijf:
--      1. eerst indienen, dán ontkoppelen (`submitted_at < losgekoppeld_op`,
--         en dan is er ook geen wachttijd meer) — de natuurlijkere volgorde;
--      2. opnieuw koppelen en meteen weer ontkoppelen schuift `losgekoppeld_op`
--         vooruit en bevrijdt een gebonden voltooiing;
--      3. één extra koppeling aan een zelfgemaakte lege groep laten staan, want
--         dan is `not exists (links)` onwaar en wordt de reden `geen_beoordelaar`;
--      4. `archiveer_groep()` op je eigen groep;
--      5. je enige beoordelaar op `inactive` zetten.
--
--    **De vorm die wél houdt, ligt niet in een venster.** Zolang de toestand van
--    *nu* het oordeel bepaalt, is elke afgedichte route een nieuwe lijst waar de
--    volgende omheen loopt. Wat er nodig is, is een stempel op de voltooiingsrij
--    op het moment van indienen — dezelfde beweging als
--    `completion_approval_rules` die de drempel al bevriest. Dat is een
--    productbeslissing (wat belooft de app iemand wiens énige buddy vertrekt?)
--    en die ligt bij Quinten; zie het beslisdocument §7.

create or replace function public.vastgelopen_goedkeuringen()
returns table (
  completion_id     uuid,
  goal_id           uuid,
  owner_id          uuid,
  cycle_start_date  date,
  reden             text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    c.id,
    g.id,
    g.owner_id,
    c.cycle_start_date,
    case
      when not exists (select 1 from goal_group_links l where l.goal_id = g.id)
        then 'geen_koppeling'
      when not exists (
        select 1 from goal_group_links l
        join groups gr on gr.id = l.group_id
        where l.goal_id = g.id and gr.status = 'active'
      ) then 'geen_actieve_groep'
      else 'geen_beoordelaar'
    end
  from completions  c
  join weekly_goals w on w.id = c.weekly_goal_id
  join goals        g on g.id = w.goal_id
  where c.superseded_by is null
    and w.status = 'pending'
    -- ⚠️ De spiegel van `te_beoordelen_voor()`: bestaat er íémand voor wie die
    --    functie deze voltooiing zou teruggeven? Zo niet, dan ligt hij vast.
    --    Bewust dezelfde vier voorwaarden, want twee lijsten die hetzelfde
    --    horen te zeggen lopen uiteen — dat is de fout die 0032/0034 maakte.
    and not exists (
      select 1
      from goal_group_links l
      join groups        gr on gr.id = l.group_id
      join group_members m  on m.group_id = l.group_id
      where l.goal_id  = g.id
        and gr.status  = 'active'
        and m.status   = 'active'
        and m.user_id <> g.owner_id
        and not exists (
          select 1 from completion_approvals a
          where a.completion_id = c.id and a.approver_id = m.user_id
        )
    )
    -- ⚠️ **En dit is de tak van 0146.** Een voltooiing die is ingediend in de
    --    zeven dagen ná het ontkoppelen van haar doel, ligt niet vast: die
    --    toestand heeft de eigenaar zelf gemaakt. Zie de kop.
    and not (
      g.losgekoppeld_op is not null
      and c.submitted_at is not null
      and c.submitted_at >= g.losgekoppeld_op
      and c.submitted_at <  g.losgekoppeld_op + interval '7 days'
      and not exists (select 1 from goal_group_links l where l.goal_id = g.id)
    );
$$;

comment on function public.vastgelopen_goedkeuringen() is
  'Voltooiingen waar niemand meer op kan reageren. Sluit sinds 0146 een '
  'voltooiing uit die is ingediend binnen zeven dagen na het ontkoppelen van '
  'haar doel: die toestand maakt de eigenaar zelf, en dan is de auto-goedkeuring '
  'een weg om domeinregel 3 heen. Koppel het doel terug en een buddy beoordeelt '
  'hem gewoon.';
