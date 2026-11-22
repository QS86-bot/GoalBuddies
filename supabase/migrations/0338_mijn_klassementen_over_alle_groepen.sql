-- 0338_mijn_klassementen_over_alle_groepen.sql — QS8-666 (A57), deel 3c-db: alle klassementen in één verzoek
--
-- ROLLBACK-PAD:
--   drop function if exists public.mijn_klassementen(integer, integer);
--   -- Er komt geen tabel, kolom, index of policy bij; de functie heeft geen aanroeper tot 3c-ui, dus het terugdraaien raakt niets.
--
-- ---------------------------------------------------------------------------
-- Wat dit doet
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten (22-11-2026): het scherm "Alle klassementen" (variant A van A57b: een kaart per groep, de bovenste vijf plus je
-- eigen plek) haalt alles op met één RPC en niet met een `groep_klassement()` per groep (regel 12, geen N+1), en een groep zonder
-- klassement komt er niet in voor.
--
-- `mijn_klassementen(p_limit, p_offset)` geeft voor elke groep van de aanroeper die een klassement heeft de bovenste vijf, en de eigen
-- rij als die niet bij de vijf zit. Paginering is op groepen, niet op leden: hoogstens 20 groepen per aanroep (standaard 10), in de
-- volgorde waarin je lid werd, dus hoogstens 6 rijen per groep.
--
-- ⚠️ **De poort is die van `groep_klassement()` uit 0333, letterlijk overgenomen** (de laatste definitie op main; 0336 en 0337
--    herdefiniëren hem niet): actief lid van een levende groep (`lid_van_levende_groep()`), de schakelaar `groups.klassement_aan`,
--    en geen teamgroep (`organization_id`). Erbij komt een expliciete toets op `automatisch`: `groep_klassement()` leunt daar op de CHECK
--    `groups_automatisch_geen_klassement`; deze functie toetst hem zelf, en is dus strenger zonder dat het verschil nu te zien is.
--
-- ⚠️ **Geen eigen foutcodes.** Elke weigering is nul rijen, zoals bij `groep_klassement()`: een buitenstaander ziet niet of een groep een
--    klassement heeft. `anon` krijgt een PostgREST-fout, want er is geen grant.
--
-- ⚠️ **Geen delta, geen datum.** De uitvoer heeft precies deze kolommen en niets over de tijd; `joined_at` staat alleen in de `ORDER BY`.
--    Een gemiste week boekt zonder groep (CHECK `points_ledger_gemist_is_niet_van_een_groep`, 0141) en kan er dus niet in voorkomen.
--
-- ⚠️ **De rangschikking bestaat nu twee keer** (hier en in `groep_klassement()`). Drie grendels dragen dat:
--    `tests/rls/mijn-klassementen.test.ts` (rij voor rij gelijk, en dezelfde groepen in twee richtingen) en
--    `tests/beloftes/klassementpoort.test.ts` (de poortvoorwaarden en de `order by` van beide functies naast elkaar; draait zonder database).
--
-- ---------------------------------------------------------------------------
-- Gemeten
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op een lokale stack (22-11-2026): zie de PR. Niet gemeten: het queryplan op echte datavolumes en de vergelijking met
--    productie; dat kan pas na de uitrol. Er is geen index op `points_ledger (group_id, user_id)` toegevoegd.
--
-- ---------------------------------------------------------------------------

drop function if exists public.mijn_klassementen(integer, integer);

create function public.mijn_klassementen(p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
 RETURNS TABLE(group_id uuid, group_name text, user_id uuid, display_name text, punten integer, positie bigint, total_members bigint, total_groups bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with mijn as (
    select
      g.id                                         as gid,
      g.name                                       as gnaam,
      m.joined_at                                  as sinds,
      count(*) over ()                             as aantal_groepen
    from group_members m
    join groups g on g.id = m.group_id
    where m.user_id = auth.uid()
      and lid_van_levende_groep(g.id)
      -- A57 (QS8-666): het klassement hangt aan een eigen schakelaar op de groep. Dezelfde drie voorwaarden als
      -- `groep_klassement()` (0333): lidmaatschap en archief hierboven, de schakelaar, en de teamgroep.
      and g.klassement_aan
      -- QS8-661, besluit 22 en 25: nooit een klassement in een teamgroep.
      and g.organization_id is null
      -- Hier expliciet, waar `groep_klassement()` op de CHECK leunt: een automatisch gevormde groep heeft nooit een klassement.
      and not g.automatisch
    order by m.joined_at asc, g.id asc
    limit greatest(0, least(coalesce(p_limit, 10), 20))
    offset greatest(0, coalesce(p_offset, 0))
  ),
  sommen as (
    -- Eén aggregaat voor alle paginagroepen, per (groep, lid): alleen de punten die in díe groep verdiend zijn.
    select pl.group_id as gid, pl.user_id as uid, sum(pl.delta) as totaal
    from points_ledger pl
    where pl.group_id in (select gid from mijn)
    group by pl.group_id, pl.user_id
  ),
  standen as (
    select
      mj.gid,
      mj.gnaam,
      mj.sinds,
      mj.aantal_groepen,
      lm.user_id                                    as uid,
      p.display_name                                as naam,
      greatest(coalesce(s.totaal, 0), 0)::integer   as punten
    from mijn mj
    join group_members lm on lm.group_id = mj.gid and lm.status <> 'inactive'
    join profiles p on p.id = lm.user_id
    left join sommen s on s.gid = mj.gid and s.uid = lm.user_id
  ),
  gerangschikt as (
    select
      st.*,
      rank() over (partition by st.gid order by st.punten desc)                                          as positie,
      -- Dezelfde volgorde en tiebreakers als `groep_klassement()`: zonder deterministische volgorde kan één lid op de
      -- vijf staan en een ander met dezelfde stand niet.
      row_number() over (partition by st.gid order by st.punten desc, st.naam asc, st.uid asc)             as volgnr,
      count(*) over (partition by st.gid)                                                                 as ledental
    from standen st
  )
  select
    gr.gid, gr.gnaam, gr.uid, gr.naam, gr.punten, gr.positie, gr.ledental, gr.aantal_groepen
  from gerangschikt gr
  where gr.volgnr <= 5 or gr.uid = auth.uid()
  order by gr.sinds asc, gr.gid asc, gr.volgnr asc;
$function$;

revoke all on function public.mijn_klassementen(integer, integer) from public, anon, authenticated;
grant execute on function public.mijn_klassementen(integer, integer) to authenticated;

comment on function public.mijn_klassementen(integer, integer) is
  'Alle klassementen van de aanroeper in één verzoek (A57b, QS8-666): per groep met een klassement de bovenste vijf plus de eigen plek, '
  'gepagineerd op groepen. Dezelfde poort als groep_klassement() plus een toets op automatisch gevormde groepen; nul rijen voor een '
  'niet-lid, een gearchiveerde groep, een uitgezet klassement, een teamgroep. Geen delta en geen datum.';
