-- 0150_bewijseis_zonder_bijlage.sql — `note_and_attachment` bestaat niet meer,
-- want een instelling die niets doet is erger dan een instelling die er niet is.
--
-- ROLLBACK-PAD:
--   alter table public.groups drop constraint groups_evidence_policy_valid;
--   alter table public.groups add constraint groups_evidence_policy_valid
--     check (evidence_policy in ('note_required', 'note_and_attachment', 'optional'));
--   -- plus `enforce_evidence_policy()` terug uit 0021 §2, en
--   -- grant insert (attachment_url) on public.completions to authenticated;
--   ⚠️ Terugdraaien zet de keuze terug zonder de bijlage terug te brengen, dus
--      dan staat de instelling er weer die niets afdwingt. Doe dat alleen samen
--      met het uploadpad.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-261, gevonden bij het versmallen van de INSERT-kolomgrant in 0147. De
-- schrijfkant van `kolomrechten:controle` (QS8-258) meldde `attachment_url` als
-- **grant zonder schrijfpad**, en dat bleek de punt van een halve keten.
--
-- Een groep kon zijn bewijseis op `note_and_attachment` zetten. Die keuze bestond
-- overal: in de CHECK, in `BEWIJSEISEN`, in het beheerscherm, in beide
-- taalcatalogi, in de afleiding van de strengste eis, en `completions.attachment_url`
-- had er een INSERT-kolomgrant voor.
--
-- **En dan hield het op.** `enforce_evidence_policy()` toetst uitsluitend
-- `new.note`; `new.attachment_url` komt in die functie niet voor. Een groep die
-- "Notitie én bijlage" instelde, kreeg exact het gedrag van `note_required`.
--
-- ⚠️ **Er was ook geen scherm dat een bijlage kón toevoegen.** Alleen de trigger
--    strenger maken zou dus élk afronden in zo'n groep blokkeren. Dat is de
--    reden dat dit één van twee richtingen was en geen bugfix.
--
-- ---------------------------------------------------------------------------
-- 1. De keuze: de instelling weg, niet de trigger strenger
-- ---------------------------------------------------------------------------
--
-- **Besloten door Quinten op 02-09-2026**: de instelling gaat weg tot het
-- uploadpad er is. De andere richting — de bijlage afbouwen, dan de trigger
-- strenger — blijft open als feature; QS8-196 draagt dezelfde ontbrekende
-- upload voor de profielfoto.
--
-- ⚠️ **Waarom dit de conservatieve richting is.** Een instelling die niets
--    afdwingt geeft de beheerder een gerustheid die nergens op slaat, en dat is
--    precies de klasse die dit project bij QS8-113 duur betaald heeft: een keten
--    waarvan elk schakeltje af is en die nergens verbonden wordt.
--
-- ⚠️ **Het scherm loog niet stilletjes, en dat hoort er eerlijk bij.** Onder de
--    keuze stond `beheer.bijlagen_nog_niet`: *"Bijlagen kunnen nog niet: er is
--    nog geen opslag."* De knop was dus niet stil — hij was overbodig. Die
--    caption gaat mee weg.
--
-- ⚠️ **En de kop van 0021 beweerde iets anders dan er stond**: *"het scherm zet
--    de optie zichtbaar uit"*. Dat deed het scherm niet; het toonde de optie mét
--    een bijschrift. Rechtgezet hier en niet door 0021 te herschrijven — een
--    migratie is een verslag van wat er toen gebeurde.

-- ---------------------------------------------------------------------------
-- 2. Bestaande groepen, en waarom dit niets aan hun eis verandert
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het acceptatiecriterium is "geen bestaande groep die stilzwijgend van eis
--    verandert".** Dat is hier haalbaar zonder uitzondering: `note_and_attachment`
--    gedroeg zich aantoonbaar als `note_required` — dezelfde trigger, dezelfde
--    toets, dezelfde foutmelding. De omzetting hieronder verandert dus wat er in
--    de kolom staat en niet wat de groep merkt.
--
--    Zonder deze update zou de nieuwe CHECK op bestaande rijen struikelen.

update public.groups
   set evidence_policy = 'note_required'
 where evidence_policy = 'note_and_attachment';

alter table public.groups drop constraint if exists groups_evidence_policy_valid;
alter table public.groups add constraint groups_evidence_policy_valid
  check (evidence_policy in ('note_required', 'optional'));

-- ---------------------------------------------------------------------------
-- 3. De trigger: één tak minder, en verder woordelijk die van 0021
-- ---------------------------------------------------------------------------
--
-- ⚠️ Overtypen zou een tweede lijst maken die uiteenloopt (0032/0034). Alleen de
--    `when bool_or(... = 'note_and_attachment')`-tak is weg; de rest staat er
--    letterlijk zoals hij stond.

create or replace function public.enforce_evidence_policy()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  eis text;
begin
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

-- ---------------------------------------------------------------------------
-- 4. De grant zonder schrijfpad gaat mee
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is het punt waar de controle van QS8-258 op wees, en het hoort in
--    dezelfde migratie.** `completions.attachment_url` had een INSERT-recht dat
--    bestond voor precies de instelling die hierboven verdwijnt. Laat je het
--    staan, dan blijft er een recht zonder pad — en dan moet de uitzondering in
--    `GEEN_SCHRIJFPAD` blijven staan met een reden die niet meer klopt.
--
-- ⚠️ **De kolom blijft wél.** Hij is leeg (er is nooit een schrijfpad geweest),
--    en hem droppen is onomkeerbaar terwijl de feature open blijft staan. Zonder
--    grant is hij geen open deur maar een lege plek die wacht.

revoke insert (attachment_url) on public.completions from authenticated;

comment on column public.completions.attachment_url is
  'Leeg en zonder INSERT-recht sinds 0150 (QS8-261): de bewijseis die hem nodig '
  'had bestaat niet meer tot er een uploadpad is. Kolom blijft staan omdat '
  'droppen onomkeerbaar is en de feature open.';
