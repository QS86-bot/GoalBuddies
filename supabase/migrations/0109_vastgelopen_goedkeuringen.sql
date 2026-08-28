-- 0109_vastgelopen_goedkeuringen.sql — vier routes scheiden een week van zijn beoordelaars, en niets telde ze
--
-- ROLLBACK-PAD:
--   drop function if exists public.vastgelopen_goedkeuringen();
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De bevinding van 27-08 telde er twee en het zijn er vier.** Hij noemde
--    `verlaat_groep()` en `ontkoppelDoelVanGroep()`, en schreef als voorwaarde
--    op: *"wordt zwaarder als er een tweede route bijkomt die een doel van zijn
--    beoordelaars scheidt"*. Die waren er toen al — en één ervan was twee dagen
--    éérder gebouwd.
--
--    Nagemeten op 28-08-2026, elke route als lid uitgevoerd met RLS actief, en
--    gepeild of de enige beoordelaar de wachtende voltooiing nog ziet en nog
--    zou mogen goedkeuren:
--
--      R1  eigenaar ontkoppelt het doel van de groep      -> vastgelopen
--      R2  eigenaar verlaat de groep (0102)               -> vastgelopen
--      R3  beheerder zet de enige beoordelaar op inactive -> vastgelopen
--      R4  beheerder archiveert de groep (0092)           -> vastgelopen
--
--    R3 en R4 stonden in geen enkele rij. R4 kwam met 0092 op 25-08, twee dagen
--    vóór de bevinding werd opgeschreven.
--
-- ⚠️ **Twee metingen waren eerst fout, en dat is het opschrijven waard.** R2 gaf
--    `{"ok": false, "reason": "not_confirmed"}` omdat `verlaat_groep()` drie
--    argumenten heeft, en R3 leek een no-op omdat `guard_group_member_update()`
--    de `status` van een gewóón lid stilzwijgend terugzet — alleen een
--    beheerder kan een ander lid uitzetten. Allebei zagen ze er als "geen
--    route" uit. **Een handeling die niets deed, leest als bewijs dat er niets
--    kan.** Controleer bij elke meting of de handeling zélf gelukt is.
--
-- ⚠️ **Dit repareert de vastloper niet, en met opzet.** De echte oplossing is de
--    goedkeuringstermijn uit beslisdocument 001 §2.6b.3: een `pending` die na N
--    dagen vanzelf een uitkomst krijgt. Wélke uitkomst, en of hij meetelt, is
--    een productbeslissing die het puntenmodel raakt — en `CLAUDE.md` noemt dat
--    "de plek waar dit project bewust traag beslist". Die keuze is niet aan een
--    opruimronde.
--
--    Wat hier wél kan: de toestand **telbaar** maken. Vandaag is de database
--    leeg en kost een bevroren week niemand iets; vanaf de eerste echte
--    gebruiker is het een week die hij gehaald heeft en niet krijgt, en dan is
--    het enige wat je nodig hebt de vraag "hoeveel staan er vast, en waardoor".
--
-- ⚠️ **Geen `*_bewaking()` en dus niet leeg te verwachten.** De bestaande
--    bewakingsfuncties (`realtime_bewaking`, `definer_bewaking`,
--    `schrijfrechten_bewaking`) melden een schémafout en hun test eist nul
--    rijen. Deze meldt een gegévenstoestand die legitiem gaat voorkomen: wie de
--    groep verlaat, laat nu eenmaal iets achter. Een test die hier nul eist,
--    zou de eerste echte gebruiker rood maken. De test toetst daarom beide
--    kanten: een gezonde wachtende voltooiing komt er níét in, en elk van de
--    vier routes zet er precies één in.
--
-- ⚠️ **De reden is de route, en dat is de hele winst.** Zonder reden weet je dat
--    er iets vastligt; met reden weet je of er een vijfde route bij is gekomen.
--    Verschijnt er ooit een rij met een reden die hieronder niet staat, dan
--    bestaat die route nog niet in dit commentaar.

create or replace function public.vastgelopen_goedkeuringen()
returns table (
  completion_id    uuid,
  goal_id          uuid,
  owner_id         uuid,
  cycle_start_date date,
  reden            text
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
    );
$$;

-- ⚠️ Zie 0106: een kale `create function` geeft `execute` aan `PUBLIC`, en `anon`
--    erft dat. Deze functie omzeilt RLS en leest andermans wachtende weken.
revoke all on function public.vastgelopen_goedkeuringen() from public, anon, authenticated;
grant execute on function public.vastgelopen_goedkeuringen() to service_role;
