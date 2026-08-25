-- 0093_een_rem_op_de_reviewpunten.sql — bevinding van 17-08
--
-- ROLLBACK-PAD:
--   drop index if exists public.points_ledger_review_idx;
--   drop function if exists public.reviewpunten_over(uuid);
--   (en `award_points_on_approval()` terug zonder de rem — de versie uit 0021,
--    zoals die vóór deze migratie in pg_get_functiondef() stond)
--
-- ---------------------------------------------------------------------------
-- Wat er open stond
-- ---------------------------------------------------------------------------
--
-- Bevinding van 17-08-2026, op 25-08 nagemeten en ongewijzigd.
-- `award_points_on_approval()` boekt sinds 0021 een punt `review_given` voor de
-- beoordelaar zodra het weekdoel `pending` is — ongeacht `new.status`, dus ook
-- bij "vertel me meer" (6.6).
--
-- De dedupe-index zorgt dat het per voltooiing één keer telt en de CHECK
-- blokkeert zelfgoedkeuring, maar **twee accounts die elkaars weken blijven
-- indienen en beoordelen, kunnen elkaars buddy-bijdrage onbeperkt opblazen.**
-- Er is geen enkele bovengrens.
--
-- ⚠️ **Het schaalt mee met wat er elders al mag.** Sinds 0083 mag een gebruiker
--    tweehonderd weekdoelen per etmaal aanmaken. Twee accounts die elkaar
--    bedienen halen daarmee honderden reviewpunten per dag, en dat is geen
--    theorie maar rekenwerk op twee bestaande limieten.
--
-- Vandaag is dat onschadelijk: het getal staat alleen op je eigen profiel en
-- telt niet mee in de reeks of de doelvoortgang. **Maar het is precies de vorm
-- waar deze codebase steeds voor betaalt** — een gat dat vandaag nergens naartoe
-- leidt, en dat duur wordt zodra er iets bovenop komt. Bij de eerste ranglijst of
-- beloning is dit de eerste route, en dan is het geen migratie maar migratie plus
-- alles wat eraan hangt.
--
-- ---------------------------------------------------------------------------
-- Een rem, en niet het model omgooien
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De scherpere oplossing is bewust níét gekozen.** Eén reviewpunt per
--    beoordelaar per buddy per cyclus zou het misbruik bij de wortel afsnijden:
--    elkaar honderd keer beoordelen levert dan één punt op. Dat is aantoonbaar
--    beter gemodelleerd — het beloont opdagen voor iemand, niet volume.
--
--    Maar het is een wijziging in het puntenmodel, en dat is in dit project geen
--    detail: domeinregel 10 legt vast wat een punt betekent, en `review_given` is
--    daar onderdeel van. Zo'n keuze hoort een besluit te zijn en geen bijvangst
--    van een misbruikbevinding. De vraag staat als rij in
--    `docs/ENGINEER-REVIEW.md`.
--
--    Wat hier wél gebeurt is de conservatieve variant die het werk áf maakt: een
--    bovengrens per etmaal, dezelfde vorm als 0083, 0090 en 0091. Het punt blijft
--    betekenen wat het betekende; het is alleen niet meer onbegrensd.
--
-- ⚠️ **Vijftig per etmaal.** Twaalf leden per groep maal tien groepen is honderd
--    buddies; wie er op één dag vijftig beoordeelt, doet iets uitzonderlijks maar
--    niet verdachts. Een scriptje haalt vijftig in een seconde en loopt daarna
--    vast. Dat is de verhouding die je wilt.
--
-- ---------------------------------------------------------------------------
-- Wat de rem níét mag doen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De goedkeuring zelf gaat altijd door.** Dit is de belangrijkste regel in
--    deze migratie. `award_points_on_approval()` doet twee dingen: het punt voor
--    de beoordelaar, én het goedkeuren van het weekdoel met de punten voor de
--    eigenaar, de weekpassen en de reeks. Zou de rem het tweede blokkeren, dan
--    kan een beoordelaar die te veel gedaan heeft de week van zijn buddy niet
--    meer goedkeuren — en dan is de reparatie erger dan de kwaal, want
--    peer-goedkeuring is de kern van het product.
--
--    De rem slaat dus uitsluitend het insert-statement van `review_given` over,
--    en verandert verder niets aan het verloop van deze trigger. Daar staat een
--    test op die precies dat scheidt.

-- ⚠️ Onwrikbare regel 11. Deze telling draait bij élke goedkeuring, dus hij hoort
--    een eigen index te hebben in plaats van mee te liften op
--    `points_ledger_user_created_idx`, waar `reason` een restfilter is.
create index if not exists points_ledger_review_idx
  on public.points_ledger (user_id, created_at desc)
  where reason = 'review_given';

comment on index public.points_ledger_review_idx is
  'Voor de dagelijkse rem op review_given in award_points_on_approval() (0093).';

/**
 * Hoeveel reviewpunten mag deze beoordelaar vandaag nog verdienen?
 *
 * ⚠️ Neemt de beoordelaar als parameter en leest niet zelf `auth.uid()`. Deze
 *    functie wordt aangeroepen vanuit een trigger die al weet wie de beoordelaar
 *    is (`new.approver_id`); dat is de betrouwbaardere bron, en het maakt de
 *    functie testbaar zonder sessie.
 *
 * ⚠️ Het resterende budget en niet het verbruik, zoals 0090 en 0091. Zo staat het
 *    getal vijftig op precies één plek.
 */
create or replace function public.reviewpunten_over(p_user_id uuid)
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when p_user_id is null then 0
    else greatest(
      0,
      50 - (
        select count(*)::integer
        from points_ledger p
        where p.user_id = p_user_id
          and p.reason  = 'review_given'
          and p.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

comment on function public.reviewpunten_over(uuid) is
  'Het resterende reviewpuntenbudget van een beoordelaar over het laatste etmaal '
  '(bevinding 17-08: twee accounts konden elkaars buddy-bijdrage onbeperkt '
  'opblazen). De grens van 50 staat hier en nergens anders.';

revoke all on function public.reviewpunten_over(uuid) from public, anon;
grant execute on function public.reviewpunten_over(uuid) to authenticated;

/**
 * `award_points_on_approval()` opnieuw, met de rem erin.
 *
 * ⚠️ Uit `pg_get_functiondef()` overgenomen en niet uit 0021 gereconstrueerd —
 *    de les van 0084. De enige wijziging is de `if` om het eerste
 *    insert-statement heen.
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

  -- ⚠️ De enige wijziging: is het budget op, dan wordt het punt niet geboekt.
  --    Alles hieronder loopt ongewijzigd door — de goedkeuring zelf, de punten
  --    voor de eigenaar, de weekpassen en de reeks. Een beoordelaar die zijn
  --    reviewpunten op heeft, kan de week van zijn buddy gewoon goedkeuren.
  if w.status = 'pending' and reviewpunten_over(new.approver_id) > 0 then
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
    values (new.approver_id, null, new.group_id, 1, 'review_given', 'completion', new.completion_id)
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
