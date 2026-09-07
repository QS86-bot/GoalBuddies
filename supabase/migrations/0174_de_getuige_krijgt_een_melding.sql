-- 0174_de_getuige_krijgt_een_melding.sql — de persoon-getuige van een straf hoorde pas dat hij getuige was als hij de app zelf opende (QS8-298)
--
-- ROLLBACK-PAD:
--   alter table public.notifications_sent drop constraint notifications_sent_kind_bekend;
--   alter table public.notifications_sent add constraint notifications_sent_kind_bekend
--     check (kind in ('nudge', 'approval_request', 'approval_received', 'cycle_summary'));
--   drop function if exists public.getuigenissen_voor(uuid);
--   ⚠️ Staan er al rijen met `kind = 'commitment_witness'`, dan weigert de CHECK
--   bij het terugzetten — terecht. Verwijder die rijen eerst, of laat de
--   verruiming staan: hij verplicht tot niets.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-292 gaf de persoon-getuige zijn leesoppervlak: `getuigenissen()` (0169)
-- plus een blok *Jij bent getuige* op *Vandaag*. Wat er niet kwam is de duw
-- ernaartoe. 📏 Gemeten op de draaiende database:
--
--   * `meld_commitment()` plaatst alleen een systeembericht bij
--     `beneficiary_group_id is not null` — de persoonstak doet niets.
--   * `src/modules/notifications/regels.ts` noemt `commitment` nul keer.
--   * `pg_publication_tables` voor `supabase_realtime`: chat_messages,
--     completions, weekly_goals. `commitments` staat er niet in.
--
-- De groepstak krijgt dus wél een bericht en de persoonstak niet. Dat is de
-- asymmetrie die hier weggaat.
--
-- ⚠️ **En dit vraagt wél een migratie, anders dan QS8-292 aannam.** Die schreef:
-- *"een notificatietype vraagt alleen een migratie als het een systeembericht
-- wordt."* Nagemeten klopt dat niet:
--
--   notifications_sent_kind_bekend ->
--     CHECK (kind = ANY (ARRAY['nudge','approval_request',
--                              'approval_received','cycle_summary']))
--
-- Zonder rij in `notifications_sent` is er geen ontdubbeling, en dan stuurt de
-- uurjob dezelfde melding elke ronde opnieuw. De CHECK is dus geen formaliteit
-- maar de plek waar de ontdubbeling op leunt.
--
-- ---------------------------------------------------------------------------
-- Domeinregel 7 — waarom dit mag, en waarom het de regel niet verruimt
-- ---------------------------------------------------------------------------
--
-- De kop van `regels.ts` zegt met zoveel woorden dat geen van de vier soorten
-- over de tegenslag van een ánder gaat, en dat er zo geen bij mag komen. **Deze
-- is de eerste die dat wél doet**, en dat kan op precies één grond: de
-- uitzondering die domeinregel 7 zelf noemt — *"een straf die de gebruiker zelf
-- vooraf heeft ingesteld en bevestigd"*.
--
-- Drie dingen dragen die grond, en geen ervan mag weg:
--
-- 1. **De eigenaar heeft deze persoon zelf als getuige aangewezen** en het
--    commitment bevestigd (`confirmed_at`, domeinregel 5). Er is geen pad
--    waarlangs iemand ongevraagd getuige wordt.
-- 2. **De melding gaat pas af als de straf verschuldigd is** — `status = 'due'`,
--    dezelfde grens als `commitment_zichtbaar_voor_persoon()` en dezelfde als
--    domeinregel 11. Vóór dat moment weet de getuige van niets, en dat blijft zo.
-- 3. **Er gaat niets naar de groep.** Dit is een pushmelding aan één persoon.
--    Via de groepschat zou de hele groep horen wat expliciet naar één iemand
--    ging — precies de verruiming die QS8-228 níét maakte.
--
-- ⚠️ **Wat dit dus níét is:** geen precedent voor een melding over een gemiste
-- week, een verbroken reeks of een achterstand. Die hebben geen vooraf
-- bevestigde afspraak onder zich en blijven verboden. Wie hier een tweede soort
-- aan wil hangen, leest eerst deze drie punten en vraagt zich af welke ervan hij
-- kan aanwijzen.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De vijfde soort
-- ---------------------------------------------------------------------------
--
-- ⚠️ Drop en opnieuw, want een CHECK is niet te wijzigen. Idempotent doordat de
--    drop `if exists` is; draait deze migratie twee keer, dan staat er daarna
--    dezelfde constraint.

alter table public.notifications_sent
  drop constraint if exists notifications_sent_kind_bekend;

alter table public.notifications_sent
  add constraint notifications_sent_kind_bekend check (
    kind in ('nudge', 'approval_request', 'approval_received', 'cycle_summary',
             'commitment_witness')
  );

-- ---------------------------------------------------------------------------
-- 2. Waar de job zijn vraag stelt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **SECURITY DEFINER met de gebruiker als parameter, en dat is geen
--    gemakzucht.** Dezelfde reden als bij `te_beoordelen_voor()` (0054): de job
--    draait als `service_role`, en een INVOKER-functie zou daar élke
--    verschuldigde straf in het hele project teruggeven. Een melding daarop
--    baseren betekent iemand vertellen over de straf van een wildvreemde. De
--    autorisatiegrens hoort dus ín de functie.
--
-- ⚠️ **`authenticated` mag hem niet uitvoeren.** Hij toetst zijn aanroeper niet
--    — hij kán dat niet, want hij krijgt de gebruiker als argument — en dan is
--    de enige veilige stand: alleen `service_role`. Zie 0167, tak 4 van
--    `definer_bewaking()`. Onwrikbare regel 4: de revoke noemt `authenticated`
--    met zoveel woorden.
--
-- ⚠️ **Geen tijdvenster, wél een limiet.** De ontdubbeling loopt op `ref_id` —
--    het commitment-id — en die is blijvend, dus een venster zou alleen
--    meldingen kunnen laten wégvallen als de job een ronde overslaat. De limiet
--    van 50 is er tegen de andere kant: een getuige van honderd straffen krijgt
--    er niet honderd tegelijk. Zelfde vorm als `te_beoordelen_voor()`.

create or replace function public.getuigenissen_voor(p_user_id uuid)
returns table(commitment_id uuid, eigenaar_naam text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, p.display_name
  from commitments c
  join goals    g on g.id = c.goal_id
  join profiles p on p.id = g.owner_id
  where c.beneficiary_user_id = p_user_id
    and c.status = 'due'
    -- ⚠️ De grens van domeinregel 11 en van `commitment_zichtbaar_voor_persoon()`.
    --    Een straf die nog niet verschuldigd is, bestaat voor de getuige niet.
    and c.confirmed_at is not null
    -- ⚠️ Nooit jezelf. Een CHECK dekt dit af sinds 0168, maar een melding sturen
    --    over je eigen straf is een aparte fout dan een rij die niet had mogen
    --    bestaan — en deze regel kost niets.
    and g.owner_id <> p_user_id
  order by c.confirmed_at, c.id
  limit 50;
$$;

revoke execute on function public.getuigenissen_voor(uuid) from public, anon, authenticated;
grant  execute on function public.getuigenissen_voor(uuid) to service_role;

comment on function public.getuigenissen_voor(uuid) is
  'De verschuldigde straffen waarvan deze gebruiker de getuige is, voor de '
  'meldingenjob. Alleen `service_role`: de functie toetst haar aanroeper niet '
  'maar krijgt de gebruiker als argument. Zie 0174 en QS8-298.';
