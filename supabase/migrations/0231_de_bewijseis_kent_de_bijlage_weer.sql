-- 0231_de_bewijseis_kent_de_bijlage_weer.sql — `note_and_attachment` terug, en
-- deze keer met de handhaving erbij.
--
-- ROLLBACK-PAD:
--   alter table public.groups drop constraint if exists groups_evidence_policy_valid;
--   alter table public.groups add constraint groups_evidence_policy_valid
--     check (evidence_policy in ('note_required', 'optional'));
--   -- `enforce_evidence_policy()` terug in de vorm van 0150 (alleen `note`).
--   drop function if exists public.dien_opnieuw_in(uuid, text, text, text);
--   -- daarna de vorm van 0021 opnieuw uitvoeren, mét de revoke/grant eronder.
--
--   ⚠️ Terugdraaien met groepen die de eis al aan hebben staan, laat die groepen
--      op een waarde staan die de CHECK niet meer toelaat. Zet ze eerst terug op
--      `note_required` — dat is de strengste die overblijft, dus niemand krijgt
--      stilzwijgend mínder bewijs dan hij had.
--
-- ---------------------------------------------------------------------------
-- Dit is de opdracht die 0150 zelf heeft opgeschreven
-- ---------------------------------------------------------------------------
--
-- `note_and_attachment` bestond op zes plekken en werd op nul plekken
-- afgedwongen. 0150 haalde hem daarom weg, met deze zin in de kop:
--
--   *"Dit is geen afwijzing van de bijlage. Zodra er een uploadpad neerstaat,
--   komt `note_and_attachment` terug — mét een trigger die hem afdwingt en een
--   test die rood wordt als die tak verdwijnt."*
--
-- 0227 t/m 0229 zetten dat pad neer. Dit is de tweede helft.
--
-- ⚠️ **De les van 0150 is niet "de keuze was verkeerd" maar "een afspraak die
--    alleen in een migratiekop staat, is geen grendel".** Vandaar dat deze
--    migratie niet landt zonder `tests/rls/bewijseis.test.ts`, en zonder de
--    mutatie die aantoont dat er iets rood wordt als de bijlagetak verdwijnt.
--
-- ---------------------------------------------------------------------------
-- De strengste eis wint, en dat is nu een ladder van drie
-- ---------------------------------------------------------------------------
--
-- Een doel kan aan meerdere groepen hangen (5.5), en dan bepaalt de strengste
-- hoeveel bewijs alle andere krijgen — anders bepaalt de losste groep het voor
-- iedereen. Die ladder had twee sporten en krijgt er een derde bovenop:
--
--     note_and_attachment  >  note_required  >  optional
--
-- ⚠️ `bewijseis_allowlist()` leest de CHECK met een regex en geeft de waarden
--    terug die erin staan. Die functie blijft ongewijzigd en gaat vanzelf drie
--    waarden melden; `tests/rls/bewijseis.test.ts` legt hem naast `BEWIJSEISEN`
--    in `src/modules/buddies/schemas.ts`, in **beide** richtingen. Dat is de
--    grendel die 0150 heeft achtergelaten en hij doet hier zijn werk: verruim je
--    de CHECK zonder de client bij te werken, dan wordt hij rood.
--
-- ---------------------------------------------------------------------------
-- ⚠️ `dien_opnieuw_in()` was de vergeten schrijver
-- ---------------------------------------------------------------------------
--
-- Hij voegt zelf een `completions`-rij in en gaf `attachment_url` niet mee. Zet
-- een groep de nieuwe eis aan, dan kan een gebruiker na *"vertel me meer"* nooit
-- meer opnieuw indienen — de trigger weigert elke poging, en er is geen
-- parameter om er bewijs bij te doen.
--
-- ⚠️ En zijn `exception when check_violation` vertaalde **élke** 23514 naar
--    `note_required`. Dat was waar zolang er één eis was; met twee is het een
--    verkeerde diagnose, en die is erger dan een vage. De handler onderscheidt
--    nu op `sqlerrm`, en valt bij iets onbekends terug op de vage.
--
--    Dat is onwrikbare regel 18 vraag 6 in zijn zuiverste vorm: deze migratie
--    tilt "er is er altijd precies één" naar "er kunnen er meer zijn", en dan
--    staat de fout er al zonder dat iemand hem heeft kunnen zien.
--
-- ⚠️ `create or replace` kán niet: de functie krijgt een vierde parameter en dat
--    is een andere functie. De `drop` noemt daarom de **handtekening** en niet
--    alleen de naam — een drop van `f(uuid, text, text)` dekt geen nieuwe `f`
--    met vier argumenten, en een controle die op naam vergelijkt laat precies
--    die bug door (CLAUDE.md, onwrikbare regel 20).

alter table public.groups
  drop constraint if exists groups_evidence_policy_valid;

alter table public.groups
  add constraint groups_evidence_policy_valid
  check (evidence_policy in ('note_required', 'note_and_attachment', 'optional'));

-- ---------------------------------------------------------------------------

create or replace function public.enforce_evidence_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  eis text;
begin
  -- De strengste eis van alle gekoppelde groepen wint. Een doel kan aan
  -- meerdere groepen hangen (5.5); anders bepaalt de losste groep hoeveel
  -- bewijs alle andere krijgen.
  select case
           when bool_or(g.evidence_policy = 'note_and_attachment') then 'note_and_attachment'
           when bool_or(g.evidence_policy = 'note_required')       then 'note_required'
           else 'optional'
         end
    into eis
  from weekly_goals w
  join goal_group_links l on l.goal_id = w.goal_id
  join groups g on g.id = l.group_id
  where w.id = new.weekly_goal_id;

  -- Geen groep, geen eis. Solo werken mag, en dan is er niemand die bewijs
  -- vraagt (er is ook niemand die goedkeurt).
  if eis is null or eis = 'optional' then
    return new;
  end if;

  -- Beide eisen vragen een notitie; alleen de strengste vraagt er een bijlage
  -- bovenop. De notitietoets staat daarom vóór de vertakking en niet erin.
  if new.note is null or btrim(new.note) = '' then
    raise exception 'Deze groep vraagt om een korte notitie bij het afronden'
      using errcode = 'check_violation';
  end if;

  -- ⚠️ Dit is de tak die 0150 heeft weggehaald omdat hij niets deed. Hij toetst
  --    nu écht, en `tests/rls/bewijseis.test.ts` wordt rood als hij verdwijnt.
  --    Let op de vorm: `attachment_url` is `not null`-loos én kan leeg zijn, en
  --    een lege string is geen bijlage.
  if eis = 'note_and_attachment'
     and (new.attachment_url is null or btrim(new.attachment_url) = '') then
    raise exception 'Deze groep vraagt om een foto als bewijs bij het afronden'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_evidence_policy() from public, anon, authenticated;

-- ---------------------------------------------------------------------------

drop function if exists public.dien_opnieuw_in(uuid, text, text);

create or replace function public.dien_opnieuw_in(
  p_weekly_goal_id uuid,
  p_achieved_level text,
  p_note text default null,
  p_attachment_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w      weekly_goals%rowtype;
  oud    completions%rowtype;
  nieuw  completions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_achieved_level not in ('floor', 'ceiling') then
    return jsonb_build_object('ok', false, 'reason', 'bad_level');
  end if;

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if w.status = 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'already_approved');
  end if;

  -- ⚠️ Alleen een week die nog loopt. `missed`, `carried` en `excused` zijn
  --    uitspraken van de rollover of van een adempauze, en die hoort niemand met
  --    een tweede indiening ongedaan te maken.
  if w.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'week_gesloten');
  end if;

  select * into oud
  from completions
  where weekly_goal_id = p_weekly_goal_id and superseded_by is null;

  if oud.id is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_replace');
  end if;

  begin
    insert into completions
      (weekly_goal_id, user_id, achieved_level, note, attachment_url,
       cycle_start_date, superseded_by)
    values
      (p_weekly_goal_id, auth.uid(), p_achieved_level,
       nullif(btrim(coalesce(p_note, '')), ''),
       nullif(btrim(coalesce(p_attachment_url, '')), ''),
       w.cycle_start_date, oud.id)
    returning * into nieuw;
  exception when check_violation then
    -- ⚠️ Onderscheiden en niet raden. Tot 0231 gaf deze handler altijd
    --    `note_required` terug, en dat was waar zolang er één eis bestond. Met
    --    twee eisen én een kolomgrens (0229) is dat een verkeerde diagnose, en
    --    die is erger dan een vage: de gebruiker gaat een notitie schrijven
    --    terwijl er een foto ontbreekt.
    if sqlerrm like '%foto als bewijs%' then
      return jsonb_build_object('ok', false, 'reason', 'attachment_required');
    elsif sqlerrm like '%korte notitie%' then
      return jsonb_build_object('ok', false, 'reason', 'note_required');
    end if;
    -- Onbekend: de kolomgrens van 0229, of iets dat later bijkomt. Vaag is hier
    -- het eerlijke antwoord.
    return jsonb_build_object('ok', false, 'reason', 'geweigerd');
  end;

  update completions set superseded_by = nieuw.id where id = oud.id;
  update completions set superseded_by = null where id = nieuw.id;

  return jsonb_build_object('ok', true, 'completion_id', nieuw.id);
end;
$$;

revoke execute on function public.dien_opnieuw_in(uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.dien_opnieuw_in(uuid, text, text, text) to authenticated;
