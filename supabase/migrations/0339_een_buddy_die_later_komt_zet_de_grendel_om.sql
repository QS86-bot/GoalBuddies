-- 0339 — Een buddy die later bij de groep komt, zet de grendel op het minpunt om
--         (QS8-787, onder QS8-110)
--
-- ---------------------------------------------------------------------------
-- ROLLBACK-PAD
-- ---------------------------------------------------------------------------
--   drop trigger if exists group_members_zet_beoordeelbaar_om on public.group_members;
--   drop function if exists public.lid_zet_beoordeelbaar_om();
--
-- ⚠️ Terugrollen zet het gat hieronder weer open: een gemiste week kost dan
--    niets zolang de buddy pas na het aanmaken van het weekdoel kwam, terwijl
--    die buddy de week wél kan goedkeuren. Weken die deze trigger al op `true`
--    zette, blijven `true`: de grendel gaat niet omlaag
--    (`beoordeelbaar_blijft_staan()`, 0066). Terugrollen wist dus niets.
--
-- Idempotent: `create or replace function` en `drop trigger if exists`. Er
-- verandert geen tabel, kolom of bestaande functie. De migratie raakt geen
-- bestaande rij: ze zet alleen een trigger neer voor wat er vanaf nu gebeurt.
--
-- ---------------------------------------------------------------------------
-- 1. Het gat
-- ---------------------------------------------------------------------------
--
-- `weekly_goals.beoordeelbaar` (0066) beantwoordt de vraag *"stond dit doel
-- tijdens deze cyclus ooit in een groep met een ander niet-inactief lid?"*. Dat
-- zegt het kolomcommentaar letterlijk. Gebouwd waren twee momenten waarop het
-- antwoord `ja` kan worden:
--
--   * het weekdoel wordt aangemaakt   → `zet_beoordeelbaar_bij_insert()`
--   * het doel gaat een groep in      → `koppeling_zet_beoordeelbaar_om()`
--
-- Het derde moment ontbrak: **er komt een lid bij een groep waar het doel al
-- aan hangt.** Dan blijft de grendel `false`, slaat
-- `geen_minpunt_zonder_beoordelaar()` het minpunt over, en kan die nieuwe buddy
-- de week tóch goedkeuren (+2): `completion_approvals_insert` vraagt alleen of
-- de goedkeurder een niet-inactief lid is en of het doel aan de groep hangt.
-- **Halen levert +2 op en missen kost 0.** Dat verbiedt domeinregel 10
-- (*"anders is missen gratis en zegt de score niets"*).
--
-- 📏 Gevonden bij QS8-774 (`docs/research/meetverslag-minpunt-zonder-grootboekrij.md`,
--    § Het gat), lokaal nagespeeld. Op productie 0 keer opgetreden (22-11-2026).
--
-- Twee routes, en de tweede is te herhalen:
--
--   a. groep aanmaken, doel koppelen, week plannen, vriend uitnodigen;
--   b. de buddy vertrekt (`verlaat_groep()` verwijdert de rij), het weekdoel
--      wordt aangemaakt, de buddy komt terug via de code: een nieuwe INSERT.
--
-- Een uitgezet lid dat weer wordt toegelaten (`beslis_lidmaatschapsverzoek()`),
-- is een UPDATE van `inactive` naar `active`. Ook die telt.
--
-- ---------------------------------------------------------------------------
-- 2. De vorm
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het predicaat is dat van `kan_beoordeeld_worden()` (0066, M1), met het
--    nieuwe lid ingevuld:** een niet-inactief lid dat niet de eigenaar van het
--    doel is, in een groep waaraan het doel gekoppeld is. Dat is ook precies
--    wat de goedkeuringspolicy van dat lid vraagt. Eén definitie van "telt mee
--    als medebeoordelaar"; een tweede definitie is hoe 0064 en 0066 uit elkaar
--    liepen.
--
--    **Besluit Quinten 22-11-2026 (optie A, via de hoofdorchestrator van week 48,
--    QS8-785):** precies dit predicaat, zonder extra toets op gearchiveerde
--    groepen. Die toets staat ook niet in `kan_beoordeeld_worden()`, en een
--    gearchiveerde groep kom je niet in: `join_group_with_code()` weigert met
--    `archived`.
--
-- ⚠️ **Alleen onafgewikkelde weken (`todo`, `cancelled`).** Dezelfde grens als
--    `koppeling_zet_beoordeelbaar_om()`: een week op `missed`, `approved`,
--    `excused`, `pending` of `carried` verandert niet met terugwerkende kracht
--    (domeinregel 6).
--
-- ⚠️ **De eigenaar die zichzelf toevoegt, zet niets om.** Zijn eigen
--    lidmaatschap maakt hem geen beoordelaar van zijn eigen week (domeinregel 3).
--    Dat doet de filter op `owner_id`, en niet de volgorde van de handelingen.
--
-- ⚠️ **Een UPDATE telt alleen als hij van `inactive` komt.** Van `paused` naar
--    `active` verandert niets aan de vraag: `paused` telde al mee.
--
-- ⚠️ **Wat dit bewust de gulle kant op laat**, net als 0066 §3 en 0102: komt er
--    een buddy bij en vertrekt hij weer binnen dezelfde week, dan blijft de
--    grendel staan. Dat kan een minpunt opleveren voor een week waarin niemand
--    meer kon goedkeuren. De andere kant is de kant waar missen gratis is.
--
-- ⚠️ **Bekend raam (aanname, niet gedicht):** een weekdoel dat in precies
--    dezelfde transactie-tijd wordt aangemaakt als het lid erbij komt, kan de
--    grendel missen. Onder READ COMMITTED ziet geen van beide de rij van de
--    ander. Hetzelfde raam staat open bij `koppeling_zet_beoordeelbaar_om()`.
--
-- ⚠️ `security definer`: het nieuwe lid schrijft in weekdoelen van een ander.
--    Dat mag alleen deze trigger, en alleen de grendel, en alleen omhoog.
--    `revoke … from public, anon, authenticated`, zie CLAUDE.md regel 4.

create or replace function public.lid_zet_beoordeelbaar_om()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  -- Een inactief lid kan niet goedkeuren, dus het telt niet mee.
  if new.status is not distinct from 'inactive' then
    return new;
  end if;

  -- Een UPDATE telt alleen als het lid vóór de wijziging niet meetelde.
  if tg_op = 'UPDATE' and old.status is distinct from 'inactive' then
    return new;
  end if;

  update weekly_goals w
     set beoordeelbaar = true
    from goal_group_links l
    join goals g on g.id = l.goal_id
   where l.group_id = new.group_id
     and w.goal_id  = l.goal_id
     -- De eigenaar is nooit zijn eigen beoordelaar (domeinregel 3).
     and g.owner_id is distinct from new.user_id
     -- Domeinregel 6: een afgewikkelde week verandert niet.
     and w.status in ('todo', 'cancelled')
     and w.beoordeelbaar is distinct from true;

  return new;
end;
$$;

comment on function public.lid_zet_beoordeelbaar_om() is
  'Grendel (QS8-787): een lid dat bij een groep komt of weer actief wordt, zet '
  '`weekly_goals.beoordeelbaar` om voor de open weken (todo, cancelled) van '
  'doelen van andere leden die aan die groep hangen. Zelfde predicaat als '
  'kan_beoordeeld_worden(). Zonder dit kostte een gemiste week niets terwijl de '
  'nieuwe buddy wel kon goedkeuren.';

revoke all on function public.lid_zet_beoordeelbaar_om() from public, anon, authenticated;

drop trigger if exists group_members_zet_beoordeelbaar_om on public.group_members;
create trigger group_members_zet_beoordeelbaar_om
  after insert or update of status on public.group_members
  for each row execute function public.lid_zet_beoordeelbaar_om();
