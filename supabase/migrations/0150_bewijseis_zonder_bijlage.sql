-- 0150_bewijseis_zonder_bijlage.sql — `note_and_attachment` bestond overal
-- behalve waar hij afgedwongen moest worden (QS8-261)
--
-- ROLLBACK-PAD:
--   alter table public.groups drop constraint if exists groups_evidence_policy_valid;
--   alter table public.groups add constraint groups_evidence_policy_valid
--     check (evidence_policy in ('note_required', 'note_and_attachment', 'optional'));
--   grant insert (attachment_url) on public.completions to authenticated;
--   drop function if exists public.bewijseis_allowlist();
--   -- `enforce_evidence_policy()` terug uit 0021 (met de dode
--   -- `note_and_attachment`-tak erin).
--
--   ⚠️ Terugdraaien zet de keuze terug die niets deed. Doe dat alleen samen met
--      een uploadpad, want anders staat de knop weer te liegen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gemeten bij QS8-261. `note_and_attachment` — "Notitie én bijlage" — bestond op
-- zes plekken en werd op nul plekken afgedwongen:
--
--   * de CHECK `groups_evidence_policy_valid` liet de waarde toe
--   * `BEWIJSEISEN` in `src/modules/buddies/schemas.ts` bood hem aan
--   * `app/groep/beheer/[id].tsx` liet hem kiezen, zonder filter
--   * beide catalogi vertaalden hem ("Notitie én bijlage" / "Note and attachment")
--   * `bewijseisVoorDoel()` leidde hem af als strengste eis
--   * `completions.attachment_url` bestond, mét INSERT-kolomgrant
--
-- En `enforce_evidence_policy()` toetste alléén `new.note`. Een groep die deze
-- eis aanzette, kreeg exact het gedrag van `note_required`.
--
-- ⚠️ **De kop van 0021 zei dat dit tijdelijk was en dat het scherm de optie
--    zichtbaar uitzette.** Dat eerste klopte, dat tweede niet: `[id].tsx` rendert
--    `BEWIJSEISEN.map(...)` zonder er iets uit te laten. Een afspraak die alleen
--    in een migratiekop staat, is geen grendel — dat is onwrikbare regel 18
--    vraag 3 in zijn kortste vorm.
--
-- ---------------------------------------------------------------------------
-- 1. Waarom weghalen en niet afbouwen
-- ---------------------------------------------------------------------------
--
-- Twee richtingen lagen open (QS8-261): de bijlage afbouwen, of de keuze
-- weghalen tot dat er is. **Gekozen: weghalen**, en dat is de conservatieve
-- kant van `CLAUDE.md`/Beslisbevoegdheid.
--
-- De doorslag: een bijlage afbouwen vraagt het éérste client-side uploadpad van
-- dit project. Zelfs de avatar heeft er geen (QS8-196 — leeskant af, schrijfpad
-- afwezig). Dat pad op de rug van een bugfix bouwen maakt de bugfix een feature
-- en laat de leugen ondertussen staan.
--
-- ⚠️ **Dit is geen afwijzing van de bijlage.** Zodra QS8-196 een uploadpad
--    neerzet, komt `note_and_attachment` terug — mét een trigger die hem
--    afdwingt en een test die rood wordt als die tak verdwijnt. Het rollback-pad
--    hierboven is dan de helft van het werk.
--
-- ---------------------------------------------------------------------------
-- 2. Geen groep verandert stilzwijgend van eis
-- ---------------------------------------------------------------------------
--
-- Acceptatiecriterium uit het issue. Op productie gemeten vóór deze migratie:
-- twee groepen, allebei `note_required`, nul op `note_and_attachment`. Vandaag
-- verandert er dus voor niemand iets.
--
-- ⚠️ **Maar dat is een meting van vandaag en geen eigenschap van de migratie.**
--    Draait dit bestand ooit op een database waar wél zo'n groep staat, dan
--    hoort een mens te kijken — niet een `update` die de eis stil verlaagt. De
--    `raise exception` hieronder is dezelfde vorm die 0132 gebruikt voor
--    `goal_done`: gaat hij af, dan is dat de controle die zijn werk doet.
do $$
declare
  v_aantal integer;
begin
  select count(*) into v_aantal
  from public.groups
  where evidence_policy = 'note_and_attachment';

  if v_aantal > 0 then
    raise exception
      '% groep(en) staan op note_and_attachment. Zet ze met de hand op '
      'note_required of optional en noteer dat, vóór je deze migratie draait '
      '(QS8-261).', v_aantal
      using errcode = 'check_violation';
  end if;
end;
$$;

alter table public.groups drop constraint if exists groups_evidence_policy_valid;
alter table public.groups add constraint groups_evidence_policy_valid
  check (evidence_policy in ('note_required', 'optional'));

-- ---------------------------------------------------------------------------
-- 3. De grant gaat mee, want zijn reden is weg
-- ---------------------------------------------------------------------------
--
-- 0147 versmalde de INSERT-kolomgrant op `completions` en liet `attachment_url`
-- er met zoveel woorden in staan: *"die hoort bij een bewijsregel die in het
-- schema bestaat; zie QS8-261."* Die bewijsregel bestaat na deze migratie niet
-- meer, dus de grant is een recht zonder pad én zonder reden.
--
-- ⚠️ **De kolom blijft staan.** Hij is leeg, hij kost niets, en hem droppen is
--    onomkeerbaar — terwijl de bijlage een uitgestelde feature is en geen
--    afgeschoten idee. Wat weg moet is het recht, niet de ruimte.
--
-- ⚠️ `revoke insert (attachment_url)` alléén zou hier werken omdat 0147 de
--    tabelbrede grant al heeft ingetrokken; stond die er nog, dan impliceerde
--    hij élke kolom en deed dit niets. Zie de kop van 0147 §1.
revoke insert (attachment_url) on public.completions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. De dode tak uit de trigger
-- ---------------------------------------------------------------------------
--
-- `bool_or(g.evidence_policy = 'note_and_attachment')` kan na de CHECK hierboven
-- nooit meer waar zijn. Laten staan zou betekenen dat de functie een regel
-- noemt die ze niet kent — en dat is precies hoe dit issue is ontstaan.

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
           when bool_or(g.evidence_policy = 'note_required') then 'note_required'
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

  if new.note is null or btrim(new.note) = '' then
    raise exception 'Deze groep vraagt om een korte notitie bij het afronden'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_evidence_policy() is
  'De bewijseis van de groep (6.5), afgedwongen bij het invoegen. De strengste '
  'eis van alle gekoppelde groepen wint; zonder groep geldt er geen eis. Sinds '
  '0150 kent hij nog twee waarden: note_and_attachment is weg tot er een '
  'uploadpad is (QS8-261).';

-- ---------------------------------------------------------------------------
-- 5. De naad zelf: de app-lijst en de CHECK, in beide richtingen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de eigenlijke reparatie, en zonder deze functie was 0150 een
--    herhaling van 0032.** Daar kwam `deadline_requested` op de CHECK terwijl
--    `SYSTEEM_GEBEURTENISSEN` op acht bleef staan, en geen enkele test werd
--    rood — want de test vergeleek de app-lijst met zichzelf.
--
--    `BEWIJSEISEN` had precies dat probleem: niets legde hem ooit naast de
--    database. Verruimt iemand morgen de CHECK zonder de app bij te werken, of
--    andersom, dan hoort dat rood te worden ongeacht welke kant het eerst
--    verandert. Een gelijkheidstoets dus, geen insluiting.
--
-- ⚠️ Zelfde vorm als `systeembericht_allowlist()` (0034) en om dezelfde reden:
--    een test die via PostgREST praat kan niet bij `pg_constraint`.

create or replace function public.bewijseis_allowlist()
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
  where c.conrelid = 'public.groups'::regclass
    and c.conname  = 'groups_evidence_policy_valid';
$$;

comment on function public.bewijseis_allowlist() is
  'De waarden uit de CHECK groups_evidence_policy_valid, zodat een test kan '
  'bewijzen dat de database en BEWIJSEISEN in de app exact hetzelfde toestaan — '
  'in beide richtingen. Zie QS8-261 en de les van 0032.';

revoke all on function public.bewijseis_allowlist() from public, anon, authenticated;
grant execute on function public.bewijseis_allowlist() to service_role;
