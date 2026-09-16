-- 0283_nul_pixeltekens_op_elke_groepszichtbare_tekst.sql — de nul-pixelregel van
-- 0271 gaat van één kolom naar de dertien die de bidi-CHECK al dragen, en een
-- groepsnaam krijgt daarnaast de contextregel van 0282 (QS8-506).
--
-- ⚠️ De bestandsnaam zegt "elke groepszichtbare tekst" en dat is één kolom te
--    ruim gelezen; wat hieronder staat is *de dertien van de bidi-uitrol*. De
--    sectie hierna meet na wat daar buiten valt.
--
-- ROLLBACK-PAD:
--   In één transactie, met ON_ERROR_STOP aan. Deze migratie voegt alleen CHECKs
--   toe en raakt geen functie aan, dus terugdraaien is vijftien drops:
--
--     begin;
--     alter table public.groups              drop constraint if exists groups_name_geen_nul_pixels;
--     alter table public.groups              drop constraint if exists groups_icon_geen_nul_pixels;
--     alter table public.groups              drop constraint if exists groups_omschrijving_geen_nul_pixels;
--     alter table public.goals               drop constraint if exists goals_title_geen_nul_pixels;
--     alter table public.weekly_goals        drop constraint if exists weekly_goals_title_geen_nul_pixels;
--     alter table public.weekly_goals        drop constraint if exists weekly_goals_ceiling_text_geen_nul_pixels;
--     alter table public.weekly_goals        drop constraint if exists weekly_goals_floor_text_geen_nul_pixels;
--     alter table public.weekly_plan_steps   drop constraint if exists weekly_plan_steps_title_geen_nul_pixels;
--     alter table public.weekly_plan_steps   drop constraint if exists weekly_plan_steps_ceiling_text_geen_nul_pixels;
--     alter table public.weekly_plan_steps   drop constraint if exists weekly_plan_steps_floor_text_geen_nul_pixels;
--     alter table public.completions         drop constraint if exists completions_note_geen_nul_pixels;
--     alter table public.deadline_requests   drop constraint if exists deadline_requests_reason_geen_nul_pixels;
--     alter table public.group_join_requests drop constraint if exists group_join_requests_bericht_geen_nul_pixels;
--     alter table public.groups              drop constraint if exists groups_name_geen_onzichtbaar_tussen_letters;
--     alter table public.groups              drop constraint if exists groups_name_geen_losse_tag;
--     commit;
--
--   ⚠️ De drie functies die deze CHECKs aanroepen blijven staan — ze zijn van
--      0271 en 0282 en `profiles.display_name` leunt erop.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-450 → QS8-494 → QS8-498 → QS8-501 rolden de **bidi**-CHECK uit over
-- dertien kolommen. QS8-495 (0271) en QS8-499 (0282) bouwden daarná twee
-- zwaardere regels, maar die stonden op **één** kolom.
--
-- ⚠️⚠️ **Het issue van deze migratie zei "over elke groepszichtbare
--    tekstkolom", en dat is nagemeten en onwaar.** Die dertien zijn de oogst van
--    een ánder criterium — 0274 §4a schrijft het uit: *tekst die iemand leest
--    vlak vóór een handeling die iets toestaat.* Dat is smaller dan
--    groepszichtbaar, en het overlapt er alleen maar mee.
--
--    📏 Nagemeten op de draaiende database (`pg_constraint` plus
--    `information_schema.column_privileges`, 16-09-2026), en de scherpste vondst
--    is `milestones`:
--
--      milestones.title        SELECT-grant voor `authenticated`: ja
--      milestones.description  idem
--      milestones_select       `owner_id = auth.uid() OR shares_group_with_goal(g.id)`
--      bidi-CHECK: geen        nul-pixel-CHECK: geen
--
--    Een groepsgenoot leest dus andermans mijlpaaltitels via
--    `GET /rest/v1/milestones`, en die twee kolommen dragen géén van beide
--    regels. Ze staan ook in geen enkele afvallerslijst — 0274 §4a liep de
--    knoppen na, en bij een mijlpaal hoort er geen, dus ze vielen buiten het
--    criterium zonder dat iemand ze hoefde af te wijzen.
--
-- ⚠️ **Dat gat gaat hier niet stilletjes mee, en dat is de regel en geen
--    zuinigheid.** Deze migratie draagt het criterium *"een teken dat als nul
--    pixels rendert is nooit inhoud"*; `milestones` mist daarnaast de bidi-CHECK,
--    en die twee in één migratie stoppen maakt van dit bestand opnieuw een
--    scopetabel die twee criteria door elkaar haalt. Het staat als **QS8-507**
--    met deze meting erin, en niet als een regel in een commit-bericht.
--
-- ⚠️ **En de bredere ring is groter dan `milestones` alleen.** 📏 Dezelfde
--    meting geeft nog vrije gebruikerstekst zonder één van beide CHECKs in
--    `chat_messages.body`, `commitments.body`, `daily_moves.body`,
--    `goals.description`, `goals.identity_statement`, `todo_items.body`,
--    `week_reviews.{did,blocked,next}_text`, `week_review_replies.body`,
--    `profiles.when_i_do_it`, `completion_approvals.comment`,
--    `deadline_requests.decision_note` en `reports.{reden,toelichting,
--    bericht_kopie}`. De laatste vier staan mét reden in de afvallerslijst van
--    0274 §4a; de rest is nooit langs een criterium gelegd. Dat register hoort
--    in dat issue en niet hier.
--
-- 📏 Gemeten op 16-09-2026 met de CHECK-uitdrukkingen zelf:
--
--      Ja<U+200B>n   bidi laat door: ja   middenin zou weigeren: ja
--      Ja<U+200C>n   bidi laat door: ja   middenin zou weigeren: nee
--
--    Beide landden dus in elk van de dertien kolommen hieronder, terwijl ze in
--    `display_name` geweigerd worden.
--
-- ---------------------------------------------------------------------------
-- Welke regel op welke kolom, en waarom niet overal dezelfde
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De maat is of de ónderbouwing van een regel voor die kolom opgaat, niet
--    of de regel er technisch op past.** Dat onderscheid is het hele besluit.
--
--   **De nul-pixelregel (0271) gaat op alle dertien.** Zijn onderbouwing is
--   *"een teken dat als nul pixels rendert is nooit inhoud"*, en dat geldt voor
--   élke tekst — een omschrijving evengoed als een naam. De vier must-allows
--   (gezinsemoji, Perzisch/Hindi/Bengaals, subdivisievlag, variatieselector)
--   zitten in de acht uitzonderingen die 0271 met reden overslaat, dus de regel
--   kan ze per constructie niet raken.
--
--   **De contextregel (0282) gaat er alleen bij op `groups.name`.** Zijn
--   onderbouwing is *"de lezer leidt hieruit af wíe of wát hij kiest"* —
--   domeinregel 3 voor een weergavenaam, en hetzelfde voor een groepsnaam: uit
--   die naam leidt een lid af in welke groep hij handelt, en een uitgelogde
--   bezoeker ziet hem op de uitnodigingslink.
--
--   ⚠️ **Voor vrije proza gaat die onderbouwing niet op, en de prijs wél.** De
--      contextregel strijkt tekens die een gebruiker uit een PDF of uit Word kan
--      plakken. Bij een naam van 80 tekens is dat te overzien; bij een notitie
--      van 2000 tekens is het een formulier dat vastloopt op tekst die er goed
--      uitziet. Een doeltitel kan daardoor nog steeds onzichtbaar botsen
--      (`Hard<ZWNJ>lopen` naast `Hardlopen`) — dat staat als rij in
--      `docs/ENGINEER-REVIEW.md` en niet als iets dat er stilletjes bij ging.
--
-- ⚠️⚠️ **En de client strijkt mee, want anders is dit geen grens maar een
--    storing.** 📏 Gemeten vóór deze migratie: van de dertien kolommen streek
--    er géén enkele iets op de client — alleen `display_name`, via
--    `profielSchema`. 0269 schrijft de drieslag uit: de trigger strijkt, de
--    client strijkt stilletjes, de database weigert. Zonder die tweede toont de
--    app `opslaan mislukt` zonder reden, bij tekst waar niets aan te zien is.
--    `zonderNulPixels()` in `src/shared/tekst` is die tweede; hij gaat in
--    dezelfde wijziging mee of de CHECKs gaan niet.
--
-- ⚠️⚠️ **Hier stond eerst "twaalf van de dertien krijgen die tweede", en dat was
--    op padniveau onwaar.** De security-review op dit issue vond dat
--    `completions.note` **twee** schrijfroutes heeft: `rondAf()` langs
--    `afrondSchema`, en `dienOpnieuwIn()` langs geen enkel schema. Die tweede
--    streek niet, en een notitie met een `U+200B` erin liep daar vast op deze
--    CHECK met een melding die de gebruiker niets zegt en die hij zelf niet kan
--    oplossen. **Een schema hoort bij een formulier en niet bij een kolom**;
--    "dit veld gaat langs een schema" is waar over de kolom en onwaar over de
--    route. Gerepareerd vóór de merge, mét een toets die de twee routes naast
--    elkáár legt (`src/modules/completions/notitie-routes.test.ts`).
--
-- ⚠️ **En de volgorde stond fout: `.trim()` vóór het strijken.**
--    `zonder_onzichtbaar_middenin()` raakt de randen niet aan, en
--    `String.prototype.trim()` ziet een `U+200B` niet als witruimte — dus
--    witruimte die eráchter schuilging kwam ná het strijken weer tevoorschijn.
--    📏 Gemeten: een doeltitel `<ZWSP>␣␣␣<ZWSP>` werd aanvaard als drie spaties
--    en `goals_title_len` (>= 1) liet hem door. `schoneVrijeTekst()` in
--    `src/shared/tekst` doet die volgorde nu op één plek.
--
-- ⚠️ **En de dertiende kolom is gemeten en niet vergeten.** 📏 `groups.icon`
--    wordt door de app nergens geschréven —
--    `from('groups')` komt drie keer voor in `src/` en geen ervan zet `icon`;
--    `Lijstgroep` leest hem alleen. Er is dus geen formulier om stil te laten
--    strijken. De CHECK staat er wél, want de kolom draagt een INSERT- én een
--    UPDATE-grant voor `authenticated` en is daarmee gewoon langs PostgREST te
--    schrijven. **Komt er een icoonveld, dan hoort de client er meteen bij** —
--    anders is het de eerste plek waar dit een storing wordt in plaats van een
--    grens.
--
-- ⚠️ **En één van de twaalf strijkt buiten een schema, ook gemeten.**
--    `group_join_requests.bericht` heeft geen Zod-veld: hij gaat rechtstreeks
--    als argument de RPC `vraag_lidmaatschap_aan()` in. Het strijken staat
--    daarom in `vraagLidmaatschapAan()` in `src/modules/buddies/ontdekken.ts`,
--    vóór de leegtoets — een bericht van louter onzichtbare tekens is ná het
--    strijken leeg en hoort `null` te worden, niet een lege string.
--
-- ---------------------------------------------------------------------------
-- Staat er al zo een? — en dit blok staat vóór de CHECKs
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De volgorde is de les van 0269 en 0270 en geen stijlkeuze.** 📏 Bij
--    0269 stond dit blok eerst ná de `add constraint`, en dan draait het nooit:
--    de ALTER valt om met `violated by some row`, de transactie is afgebroken,
--    en alles erna wordt overgeslagen. Een `add constraint` **zónder**
--    `not valid` toetst élke bestaande rij en weigert.
--
-- ⚠️ Dertien tabellen en niet één, dus dit blok is langer dan bij 0269 — maar
--    het is dezelfde vorm: tel eerst, meld, en laat de ALTER daarna zelf
--    beslissen.
do $$
declare
  r record;
  v_totaal bigint := 0;
begin
  for r in
  select 'groups.name' as kolom, count(*) as aantal from public.groups where name <> public.zonder_onzichtbaar_middenin(name)
  union all
  select 'groups.icon' as kolom, count(*) as aantal from public.groups where icon is not null and icon <> public.zonder_onzichtbaar_middenin(icon)
  union all
  select 'groups.omschrijving' as kolom, count(*) as aantal from public.groups where omschrijving is not null and omschrijving <> public.zonder_onzichtbaar_middenin(omschrijving)
  union all
  select 'goals.title' as kolom, count(*) as aantal from public.goals where title <> public.zonder_onzichtbaar_middenin(title)
  union all
  select 'weekly_goals.title' as kolom, count(*) as aantal from public.weekly_goals where title <> public.zonder_onzichtbaar_middenin(title)
  union all
  select 'weekly_goals.ceiling_text' as kolom, count(*) as aantal from public.weekly_goals where ceiling_text is not null and ceiling_text <> public.zonder_onzichtbaar_middenin(ceiling_text)
  union all
  select 'weekly_goals.floor_text' as kolom, count(*) as aantal from public.weekly_goals where floor_text is not null and floor_text <> public.zonder_onzichtbaar_middenin(floor_text)
  union all
  select 'weekly_plan_steps.title' as kolom, count(*) as aantal from public.weekly_plan_steps where title <> public.zonder_onzichtbaar_middenin(title)
  union all
  select 'weekly_plan_steps.ceiling_text' as kolom, count(*) as aantal from public.weekly_plan_steps where ceiling_text is not null and ceiling_text <> public.zonder_onzichtbaar_middenin(ceiling_text)
  union all
  select 'weekly_plan_steps.floor_text' as kolom, count(*) as aantal from public.weekly_plan_steps where floor_text is not null and floor_text <> public.zonder_onzichtbaar_middenin(floor_text)
  union all
  select 'completions.note' as kolom, count(*) as aantal from public.completions where note is not null and note <> public.zonder_onzichtbaar_middenin(note)
  union all
  select 'deadline_requests.reason' as kolom, count(*) as aantal from public.deadline_requests where reason <> public.zonder_onzichtbaar_middenin(reason)
  union all
  select 'group_join_requests.bericht' as kolom, count(*) as aantal from public.group_join_requests where bericht is not null and bericht <> public.zonder_onzichtbaar_middenin(bericht)
  union all
  select 'groups.name (contextregel)' as kolom, count(*) as aantal from public.groups
    where name <> public.zonder_onzichtbaar_tussen_letters(name)
       or name <> public.zonder_losse_tags(name)
  loop
    if r.aantal > 0 then
      raise notice '⚠️ %: % rij(en) dragen een teken dat deze migratie weigert.', r.kolom, r.aantal;
      v_totaal := v_totaal + r.aantal;
    end if;
  end loop;

  if v_totaal > 0 then
    raise notice
      '⚠️ In totaal % rij(en). De CHECKs hierna gaan daarop om en deze migratie '
      'stopt. Bepaal eerst wat er met die teksten gebeurt — dat is een '
      'productbeslissing, geen migratiestap.', v_totaal;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- De grenzen zelf
-- ---------------------------------------------------------------------------

alter table public.groups
  drop constraint if exists groups_name_geen_nul_pixels;

alter table public.groups
  add constraint groups_name_geen_nul_pixels
  check (name = public.zonder_onzichtbaar_middenin(name));

comment on constraint groups_name_geen_nul_pixels on public.groups is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.groups
  drop constraint if exists groups_icon_geen_nul_pixels;

alter table public.groups
  add constraint groups_icon_geen_nul_pixels
  check (icon is null or icon = public.zonder_onzichtbaar_middenin(icon));

comment on constraint groups_icon_geen_nul_pixels on public.groups is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.groups
  drop constraint if exists groups_omschrijving_geen_nul_pixels;

alter table public.groups
  add constraint groups_omschrijving_geen_nul_pixels
  check (omschrijving is null or omschrijving = public.zonder_onzichtbaar_middenin(omschrijving));

comment on constraint groups_omschrijving_geen_nul_pixels on public.groups is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.goals
  drop constraint if exists goals_title_geen_nul_pixels;

alter table public.goals
  add constraint goals_title_geen_nul_pixels
  check (title = public.zonder_onzichtbaar_middenin(title));

comment on constraint goals_title_geen_nul_pixels on public.goals is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.weekly_goals
  drop constraint if exists weekly_goals_title_geen_nul_pixels;

alter table public.weekly_goals
  add constraint weekly_goals_title_geen_nul_pixels
  check (title = public.zonder_onzichtbaar_middenin(title));

comment on constraint weekly_goals_title_geen_nul_pixels on public.weekly_goals is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.weekly_goals
  drop constraint if exists weekly_goals_ceiling_text_geen_nul_pixels;

alter table public.weekly_goals
  add constraint weekly_goals_ceiling_text_geen_nul_pixels
  check (ceiling_text is null or ceiling_text = public.zonder_onzichtbaar_middenin(ceiling_text));

comment on constraint weekly_goals_ceiling_text_geen_nul_pixels on public.weekly_goals is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.weekly_goals
  drop constraint if exists weekly_goals_floor_text_geen_nul_pixels;

alter table public.weekly_goals
  add constraint weekly_goals_floor_text_geen_nul_pixels
  check (floor_text is null or floor_text = public.zonder_onzichtbaar_middenin(floor_text));

comment on constraint weekly_goals_floor_text_geen_nul_pixels on public.weekly_goals is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.weekly_plan_steps
  drop constraint if exists weekly_plan_steps_title_geen_nul_pixels;

alter table public.weekly_plan_steps
  add constraint weekly_plan_steps_title_geen_nul_pixels
  check (title = public.zonder_onzichtbaar_middenin(title));

comment on constraint weekly_plan_steps_title_geen_nul_pixels on public.weekly_plan_steps is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.weekly_plan_steps
  drop constraint if exists weekly_plan_steps_ceiling_text_geen_nul_pixels;

alter table public.weekly_plan_steps
  add constraint weekly_plan_steps_ceiling_text_geen_nul_pixels
  check (ceiling_text is null or ceiling_text = public.zonder_onzichtbaar_middenin(ceiling_text));

comment on constraint weekly_plan_steps_ceiling_text_geen_nul_pixels on public.weekly_plan_steps is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.weekly_plan_steps
  drop constraint if exists weekly_plan_steps_floor_text_geen_nul_pixels;

alter table public.weekly_plan_steps
  add constraint weekly_plan_steps_floor_text_geen_nul_pixels
  check (floor_text is null or floor_text = public.zonder_onzichtbaar_middenin(floor_text));

comment on constraint weekly_plan_steps_floor_text_geen_nul_pixels on public.weekly_plan_steps is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.completions
  drop constraint if exists completions_note_geen_nul_pixels;

alter table public.completions
  add constraint completions_note_geen_nul_pixels
  check (note is null or note = public.zonder_onzichtbaar_middenin(note));

comment on constraint completions_note_geen_nul_pixels on public.completions is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.deadline_requests
  drop constraint if exists deadline_requests_reason_geen_nul_pixels;

alter table public.deadline_requests
  add constraint deadline_requests_reason_geen_nul_pixels
  check (reason = public.zonder_onzichtbaar_middenin(reason));

comment on constraint deadline_requests_reason_geen_nul_pixels on public.deadline_requests is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.group_join_requests
  drop constraint if exists group_join_requests_bericht_geen_nul_pixels;

alter table public.group_join_requests
  add constraint group_join_requests_bericht_geen_nul_pixels
  check (bericht is null or bericht = public.zonder_onzichtbaar_middenin(bericht));

comment on constraint group_join_requests_bericht_geen_nul_pixels on public.group_join_requests is
  'Deze tekst is groepszichtbaar en draagt geen teken dat als nul pixels rendert - QS8-506. Een onzichtbaar teken is daar nooit inhoud; het is opvulling of een spoof.';

alter table public.groups
  drop constraint if exists groups_name_geen_onzichtbaar_tussen_letters;

alter table public.groups
  add constraint groups_name_geen_onzichtbaar_tussen_letters
  check (name = public.zonder_onzichtbaar_tussen_letters(name));

comment on constraint groups_name_geen_onzichtbaar_tussen_letters on public.groups is
  'Een groepsnaam draagt geen ZWNJ, ZWJ, CGJ, variatieselector of IVS op een plek waar die niets kan betekenen - QS8-506. Zelfde regel als op display_name (0282): uit een groepsnaam leidt de lezer af in welke groep hij handelt.';

alter table public.groups
  drop constraint if exists groups_name_geen_losse_tag;

alter table public.groups
  add constraint groups_name_geen_losse_tag
  check (name = public.zonder_losse_tags(name));

comment on constraint groups_name_geen_losse_tag on public.groups is
  'Een groepsnaam draagt geen tagteken dat geen geldige vlagreeks vormt - QS8-506.';
