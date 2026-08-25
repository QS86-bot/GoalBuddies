-- 0094_een_reviewpunt_per_buddy_per_cyclus.sql — besluit A51
--
-- ROLLBACK-PAD:
--   drop index if exists public.points_ledger_review_dedupe_idx;
--   alter table public.points_ledger drop constraint if exists points_ledger_review_volledig;
--   alter table public.points_ledger drop column if exists cycle_start_date;
--   drop index if exists public.points_ledger_dedupe_idx;
--   create unique index points_ledger_dedupe_idx
--     on public.points_ledger (user_id, reason, ref_type, ref_id)
--     where ref_id is not null;
--   (en `award_points_on_approval()` + `reviewpunten_over()` terug uit 0093)
--
-- ⚠️ Terugrollen kan alleen zolang er geen `review_given`-rij met `ref_type =
--    'buddy_cycle'` staat. Die zouden onder de oude dedupe-index één punt per
--    buddy per éver worden in plaats van per cyclus.
--
-- ---------------------------------------------------------------------------
-- Besluit A51 — 25-08-2026
-- ---------------------------------------------------------------------------
--
-- De open helft van de bevinding van 17-08. 0093 zette er een bovengrens van
-- vijftig per etmaal op; dat begrensde het misbruik maar liet de oorzaak staan.
-- Dit is de reparatie zelf: **één reviewpunt per beoordelaar per buddy per
-- cyclus**, in plaats van één per voltooiing.
--
-- ⚠️ **Niet primair vanwege het misbruik.** Punten zijn privé (domeinregel 10,
--    herbevestigd als A42), dus twee accounts die elkaar opblazen bedriegen
--    alleen zichzelf — dezelfde categorie die de rij van 17-08 zelf "zelfbedrog,
--    geen autorisatiegrens" noemde. Was dat het enige argument, dan had dit
--    kunnen wachten.
--
-- ⚠️ **De reden is een modelleerfout, en die staat los van misbruik.** Met een
--    punt per voltooiing hangt je buddy-score af van het gedrag van iemand
--    ánders: wie een productieve buddy heeft die drie weekdoelen per week
--    indient, verdient drie keer zoveel als wie een bescheiden buddy heeft — bij
--    precies evenveel aandacht. Dat meet niet wat het zegt te meten.
--
--    Het is ook structureel af te lezen: `review_given` was de énige reden in
--    `points_ledger` met `goal_id = null`. Elke andere boeking hangt aan een doel
--    van jou; deze hing aan de voortgang van een ander. Dat was geen toeval maar
--    het symptoom.
--
-- ⚠️ **En het sluit aan bij wat het project al gekozen heeft.** De Ketting en de
--    reeks tellen óf je er was, niet hoe vaak. Reviewpunten waren de enige plek
--    waar volume telde.
--
-- ⚠️ **Nu, omdat het nu gratis is.** `points_ledger` staat op nul rijen —
--    nagemeten, niet aangenomen. Na de eerste gebruiker is dit een migratie op
--    een gevuld grootboek dat append-only is (domeinregel 6), en dan moet het met
--    correctie-records in plaats van een herdefinitie.
--
-- ---------------------------------------------------------------------------
-- De sleutel: waarom een kolom en geen verzonnen ref_id
-- ---------------------------------------------------------------------------
--
-- "Eén per buddy per cyclus" heeft geen natuurlijke sleutel in dit grootboek. De
-- dedupe-index stond op `(user_id, reason, ref_type, ref_id)`, en daar past geen
-- cyclus in.
--
-- ⚠️ Het alternatief was een afgeleide `ref_id` — `md5(buddy || cyclusstart)::uuid`
--    — en dat is bewust niet gedaan. Zo'n waarde is deterministisch maar
--    ondoorzichtig: je kunt hem nergens op terugjoinen, en over een jaar staat er
--    een uuid in het grootboek waarvan niemand meer weet hoe hij gemaakt is.
--    `cycle_start_date` als kolom is leesbaar, en per cyclus rapporteren wil je
--    later toch.
--
-- ⚠️ **De kolom is vandaag alleen voor `review_given`**, en de CHECK zegt dat
--    precies. Hem meteen voor élke reden vullen zou een backfill door vier
--    functies vragen en twee betekenissen door elkaar halen — de cyclus van de
--    eigenaar tegenover die van de beoordelaar. Dat mag later, bewust.
--
-- ---------------------------------------------------------------------------
-- Twee dedupe-indexen, en waarom de oude niet mocht blijven zoals hij was
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de naad van deze migratie.** `points_ledger_dedupe_idx` dekte álle
--    redenen. Zou hij zo blijven staan, dan zou hij op de nieuwe vorm
--    (`ref_type = 'buddy_cycle'`, `ref_id = <buddy>`) uniciteit afdwingen op
--    (beoordelaar, buddy) — dus één punt per buddy vóór áltijd in plaats van per
--    cyclus. De tweede cyclus zou stil wegvallen op `on conflict do nothing`, en
--    geen enkele test zou daar rood van worden.
--
--    Hij wordt daarom versmald tot alles behalve `review_given`, en die reden
--    krijgt een eigen index mét de cyclus erin.
--
-- ⚠️ **Een unieke index bijt niet op NULL.** PostgreSQL beschouwt NULL-waarden in
--    een unieke index standaard als verschillend, dus een `review_given`-rij
--    zonder `ref_id` of zonder `cycle_start_date` zou onbeperkt dupliceerbaar
--    zijn — de index zou er zijn en niets doen. De CHECK hieronder maakt die
--    situatie onmogelijk, en dát is wat de index zijn tanden geeft. Een index
--    alleen is hier te weinig, net zoals een policy alleen te weinig is als de
--    eis over kolommen gaat.

alter table public.points_ledger
  add column if not exists cycle_start_date date;

comment on column public.points_ledger.cycle_start_date is
  'De cyclus waar deze boeking bij hoort. Vandaag uitsluitend gevuld voor '
  'review_given (besluit A51, 0094): daar is het de cyclus van het weekdoel dat '
  'beoordeeld werd, dus die van de eigenaar. De CHECK '
  'points_ledger_review_volledig dwingt dat af.';

-- ⚠️ Zonder deze CHECK is de unieke index hieronder decoratief: NULL is in een
--    unieke index niet gelijk aan NULL, dus rijen zonder buddy of zonder cyclus
--    zouden onbeperkt dupliceren.
alter table public.points_ledger
  drop constraint if exists points_ledger_review_volledig;

alter table public.points_ledger
  add constraint points_ledger_review_volledig
  check (
    reason <> 'review_given'
    or (ref_id is not null and cycle_start_date is not null)
  );

drop index if exists public.points_ledger_dedupe_idx;

create unique index points_ledger_dedupe_idx
  on public.points_ledger (user_id, reason, ref_type, ref_id)
  where ref_id is not null and reason <> 'review_given';

comment on index public.points_ledger_dedupe_idx is
  'Eén boeking per (gebruiker, reden, verwijzing). ⚠️ Sinds 0094 zonder '
  'review_given: die reden dedupliceert per cyclus en heeft een eigen index. '
  'Zou review_given hier blijven, dan werd het één punt per buddy vóór altijd.';

create unique index points_ledger_review_dedupe_idx
  on public.points_ledger (user_id, ref_id, cycle_start_date)
  where reason = 'review_given';

comment on index public.points_ledger_review_dedupe_idx is
  'Besluit A51: één reviewpunt per beoordelaar per buddy per cyclus. Dient '
  'tegelijk als opzoekindex — er is geen tweede index voor deze reden nodig.';

/**
 * `award_points_on_approval()` opnieuw.
 *
 * ⚠️ Uit `pg_get_functiondef()` overgenomen — de les van 0084. Twee wijzigingen,
 *    allebei in het eerste insert-statement: de verwijzing wordt de buddy in
 *    plaats van de voltooiing, en de cyclus gaat mee. De rem van 0093 verdwijnt.
 */
create or replace function public.award_points_on_approval()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  c        completions%rowtype;
  w        weekly_goals%rowtype;
  g_owner  uuid;
  punten   integer;
  reden    text;
begin
  select * into c from completions where id = new.completion_id;
  select * into w from weekly_goals where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  if c.superseded_by is not null then
    return new;
  end if;

  -- ⚠️ **Eén punt per buddy per cyclus** (besluit A51). De verwijzing is de
  --    eigenaar van het weekdoel — de buddy voor wie je opdaagt — en niet de
  --    voltooiing. Een tweede weekdoel van dezelfde buddy in dezelfde week
  --    levert daarom niets extra's op; een andere buddy of een andere week wel.
  --
  -- ⚠️ De cyclus komt uit `weekly_goals` en wordt hier niet uitgerekend.
  --    Correctheidsregel 7: de database rekent geen weken uit. Het is de cyclus
  --    van de éigenaar, want dat is de week die beoordeeld wordt.
  --
  -- ⚠️ "Vertel me meer" claimt het punt voor die cyclus, en de goedkeuring die er
  --    later op volgt levert niets extra's op. Dat is bedoeld: een echte vraag
  --    stellen ís de aandacht die dit punt beloont, en het haalt de prikkel weg
  --    om snel af te stempelen.
  if w.status = 'pending' and g_owner is not null and w.cycle_start_date is not null then
    insert into points_ledger (
      user_id, goal_id, group_id, delta, reason, ref_type, ref_id, cycle_start_date
    )
    values (
      new.approver_id, null, new.group_id, 1, 'review_given',
      'buddy_cycle', g_owner, w.cycle_start_date
    )
    on conflict do nothing;
  end if;

  if new.status <> 'approved' then
    return new;
  end if;

  if w.status <> 'pending' then
    return new;
  end if;

  if c.achieved_level = 'ceiling' then
    punten := w.points_ceiling;
    reden  := 'completion_approved_ceiling';
  else
    punten := w.points_floor;
    reden  := 'completion_approved_floor';
  end if;

  update weekly_goals set status = 'approved' where id = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (g_owner, w.goal_id, new.group_id, punten, reden, 'weekly_goal', w.id)
  on conflict do nothing;

  perform verdien_weekpassen(g_owner, w.goal_id);

  perform herbereken_reeks(g_owner, w.goal_id);

  return new;
end;
$$;

-- ⚠️ **De dagrem van 0093 gaat eruit, en dat is geen terugdraaien maar het
--    afmaken.** Die vijftig per etmaal was de interim-maatregel voor precies dit
--    probleem; nu de oorzaak weg is, is hij niet alleen overbodig maar schadelijk:
--    het natuurlijke maximum is nu het aantal buddies (tien groepen maal elf =
--    honderdtien per cyclus), en een grens van vijftig zou een legitieme
--    uitschieter afknijpen die niets fout doet.
--
-- ⚠️ De index van 0093 gaat mee. Hij stond op `(user_id, created_at desc) where
--    reason = 'review_given'` en diende alleen die telling; de nieuwe
--    dedupe-index dekt de opzoeking die er nu nog is.
drop function if exists public.reviewpunten_over(uuid);
drop index if exists public.points_ledger_review_idx;
