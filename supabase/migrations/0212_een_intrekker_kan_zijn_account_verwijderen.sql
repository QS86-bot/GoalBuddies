-- 0212_een_intrekker_kan_zijn_account_verwijderen.sql — `approval_withdrawals
-- .approver_id` stond op NO ACTION en hield het profiel van de intrekker vast
-- (QS8-371)
--
-- ROLLBACK-PAD:
--   alter table public.approval_withdrawals
--     drop constraint approval_withdrawals_approver_id_fkey;
--   update public.approval_withdrawals set approver_id = '<een uuid>'
--    where approver_id is null;   -- alleen nodig als er al een leeg spoor staat
--   alter table public.approval_withdrawals alter column approver_id set not null;
--   alter table public.approval_withdrawals
--     add constraint approval_withdrawals_approver_id_fkey
--     foreign key (approver_id) references public.profiles (id);
--
--   ⚠️ Die middelste regel is het bewijs dat dit geen vrije terugweg is: zodra
--      één intrekker zijn account verwijderd heeft, staat er een `null` waar
--      `not null` weer op moet. Er is dan geen waarde om terug te zetten — de
--      persoon bestaat niet meer. Terugdraaien kan alleen zolang dat niet
--      gebeurd is.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-ronde op de branch van QS8-335 en daarna zelf
-- nagespeeld op `main`. **Ouder dan die branch** en er niet door veroorzaakt:
-- migratie 0030 declareert `approver_id uuid not null references profiles (id)`
-- zonder `on delete`-clausule, en dat is NO ACTION.
--
-- 📏 Gemeten, end-to-end tegen het schema van `main`: Alice keurt de week van Bob
--    goed, trekt dat weer in, en verwijdert daarna haar eigen account.
--
--      intrekken:   {"ok": true, "reverted": true}
--      verwijderen: ERROR: update or delete on table "profiles" violates foreign
--                   key constraint "approval_withdrawals_approver_id_fkey"
--                   CONTEXT: SQL statement "delete from auth.users where id = mij"
--
-- De twee andere foreign keys van die tabel cascaderen wél, maar ze wijzen naar
-- de voltooiing van **Bob** — die rijen blijven staan. Alleen de verwijzing naar
-- Alice als *intrekker* blokkeert. Wie ooit `trek_goedkeuring_in()` gebruikt
-- heeft, houdt dus een rij die zijn eigen profiel vasthoudt.
--
-- ⚠️ **Dat is een AVG-verplichting (art. 17) en dit is de enige route naar
--    accountverwijdering in de app.** `verwijderMijnAccount()` vangt de fout en
--    toont `auth.verwijder.mislukt`; er is geen tweede poging die wél werkt.
--
-- ---------------------------------------------------------------------------
-- Waarom `set null` en niet cascade of opruimen in de functie
-- ---------------------------------------------------------------------------
--
-- Het issue noemde drie richtingen.
--
-- **`on delete cascade`** haalt met de intrekker ook het bewijs weg *dát* er
-- ingetrokken is. Dat botst met domeinregel 6 — voltooiingen en hun correcties
-- zijn append-only — en het raakt Bob, die niets verkeerd deed.
--
-- **Opruimen in `verwijder_mijn_account()`** houdt het schema zoals het is en
-- verplaatst de kennis naar een functie. Dan loopt de volgende tabel met dezelfde
-- omissie er opnieuw tegenaan, en dat is precies wat hier gebeurd is: niets
-- bewaakte deze klasse.
--
-- **`on delete set null` op een nullable kolom**, en dat is wat hieronder staat.
-- 📏 Het is niet de uitzondering maar de regel in dit schema: van de 37 foreign
--    keys naar `profiles` stonden er 21 op cascade en 15 op set null — die
--    vijftien allemaal op een kolom die `null` toestaat, want een `set null` op
--    een `not null`-kolom blokkeert net zo hard als NO ACTION.
--    `approval_withdrawals.approver_id` was de enige op NO ACTION, en na deze
--    migratie zijn het er 21 en 16.
--
-- ⚠️ **En de directe buur doet het al zo:** `completion_approvals.approver_id`
--    staat op set null terwijl `subject_id` cascadeert. De goedkeuring zelf
--    overleeft het vertrek van de goedkeurder dus al zonder naam; de intrekking
--    ervan deed dat niet, en dat verschil was geen besluit maar een omissie.
--
-- ⚠️ **Wat de rij nog waard is zonder naam.** `approval_id`, `completion_id` en
--    `created_at` blijven staan, en dat is alles waar de zes lezers op steunen:
--    📏 `bevestigingsstand`, `openstaande_beoordelingen`, `trek_goedkeuring_in`,
--    `vastgelopen_goedkeuringen`, `verdien_badges` en `verwachte_weekdoelstatus`
--    vragen allemaal `where x.approval_id = …` of `x.completion_id = …`. Geen
--    enkele functie leest `approver_id` van deze tabel.
--
-- ⚠️ **De policy blijft kloppen, en de nul valt aan de goede kant.**
--    `approval_withdrawals_select` luidt `approver_id = auth.uid() or <eigenaar
--    van het doel>`. Met `approver_id is null` is de eerste tak `null` en dus
--    niet waar — de rij blijft zichtbaar voor Bob, de persoon die hij aangaat, en
--    niemand kan hem opeisen. Een `null` op de toesta-kant sluit; op de
--    weiger-kant zou hij openen. Hier is het de eerste.
--
-- ---------------------------------------------------------------------------

-- ⚠️ Idempotent langs de constraintnaam en niet langs `if exists` op de kolom:
--    de naam is wat 0030 uitdeelde en wat de rollback weer terugzet.
do $migratie$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.approval_withdrawals'::regclass
      and conname  = 'approval_withdrawals_approver_id_fkey'
      and confdeltype = 'a'
  ) then
    alter table public.approval_withdrawals
      drop constraint approval_withdrawals_approver_id_fkey;

    alter table public.approval_withdrawals
      alter column approver_id drop not null;

    alter table public.approval_withdrawals
      add constraint approval_withdrawals_approver_id_fkey
      foreign key (approver_id) references public.profiles (id) on delete set null;
  end if;
end
$migratie$;

comment on column public.approval_withdrawals.approver_id is
  'Wie de goedkeuring introk. `null` zodra die persoon zijn account verwijderd '
  'heeft — QS8-371, en dezelfde behandeling als `completion_approvals.approver_id`. '
  'De intrekking zelf blijft staan: dat is bewijs voor de eigenaar van het doel '
  '(domeinregel 6, append-only). Geen enkele functie leest deze kolom; '
  '`approval_withdrawals_select` valt met een null terug op de eigenaar van het '
  'doel, wat de bedoelde lezer is.';
