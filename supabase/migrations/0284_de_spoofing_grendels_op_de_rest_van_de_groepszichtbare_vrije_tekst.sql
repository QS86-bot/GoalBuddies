-- 0284_de_spoofing_grendels_op_de_rest_van_de_groepszichtbare_vrije_tekst.sql —
-- de bidi-CHECK en de nul-pixelregel gaan van "de tekst vlak vóór een knop" naar
-- élke vrije tekst die een groepsgenoot kan lezen: twaalf kolommen over negen
-- tabellen (QS8-507).
--
-- ROLLBACK-PAD:
--   In één transactie, met ON_ERROR_STOP aan. Deze migratie voegt alleen CHECKs
--   toe en raakt geen functie aan, dus terugdraaien is vierentwintig drops:
--
--     begin;
--     alter table public.milestones           drop constraint if exists milestones_title_geen_bidi;
--     alter table public.milestones           drop constraint if exists milestones_title_geen_nul_pixels;
--     alter table public.milestones           drop constraint if exists milestones_description_geen_bidi;
--     alter table public.milestones           drop constraint if exists milestones_description_geen_nul_pixels;
--     alter table public.goals                drop constraint if exists goals_description_geen_bidi;
--     alter table public.goals                drop constraint if exists goals_description_geen_nul_pixels;
--     alter table public.daily_moves          drop constraint if exists daily_moves_body_geen_bidi;
--     alter table public.daily_moves          drop constraint if exists daily_moves_body_geen_nul_pixels;
--     alter table public.todo_items           drop constraint if exists todo_items_body_geen_bidi;
--     alter table public.todo_items           drop constraint if exists todo_items_body_geen_nul_pixels;
--     alter table public.week_reviews         drop constraint if exists week_reviews_did_text_geen_bidi;
--     alter table public.week_reviews         drop constraint if exists week_reviews_did_text_geen_nul_pixels;
--     alter table public.week_reviews         drop constraint if exists week_reviews_blocked_text_geen_bidi;
--     alter table public.week_reviews         drop constraint if exists week_reviews_blocked_text_geen_nul_pixels;
--     alter table public.week_reviews         drop constraint if exists week_reviews_next_text_geen_bidi;
--     alter table public.week_reviews         drop constraint if exists week_reviews_next_text_geen_nul_pixels;
--     alter table public.week_review_replies  drop constraint if exists week_review_replies_body_geen_bidi;
--     alter table public.week_review_replies  drop constraint if exists week_review_replies_body_geen_nul_pixels;
--     alter table public.commitments          drop constraint if exists commitments_body_geen_bidi;
--     alter table public.commitments          drop constraint if exists commitments_body_geen_nul_pixels;
--     alter table public.deadline_requests    drop constraint if exists deadline_requests_decision_note_geen_bidi;
--     alter table public.deadline_requests    drop constraint if exists deadline_requests_decision_note_geen_nul_pixels;
--     alter table public.reports              drop constraint if exists reports_toelichting_geen_bidi;
--     alter table public.reports              drop constraint if exists reports_toelichting_geen_nul_pixels;
--     commit;
--
--   ⚠️ De twee functies die deze CHECKs aanroepen blijven staan — ze zijn van
--      0269 en 0271 en zesentwintig andere kolommen leunen erop.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt: een scope die zijn criterium niet meenam
-- ---------------------------------------------------------------------------
--
-- 0283 (QS8-506) rolde de nul-pixelregel uit over de dertien kolommen die de
-- bidi-CHECK al droegen, en ontdekte bij het naschrijven van zijn eigen scope
-- dat die dertien de oogst zijn van een **ánder** criterium — 0274 §4a:
-- *tekst die iemand leest vlak vóór een handeling die iets toestaat.*
--
-- 📏 Nagemeten op de draaiende database (`pg_policies` plus
--    `information_schema.column_privileges`, 16-09-2026): `milestones.title` en
--    `.description` zijn leesbaar voor elke groepsgenoot van een gekoppeld doel
--    (`milestones_select`: `owner_id = auth.uid() OR shares_group_with_goal(...)`)
--    en droegen géén van beide regels. Ze stonden ook in geen enkele
--    afvallerslijst: bij een mijlpaal hoort geen knop, dus ze vielen buiten het
--    criterium zónder dat iemand ze hoefde af te wijzen.
--
-- ⚠️⚠️ **Deze migratie draagt daarom een eigen criterium, en dat is breder:**
--
--        vrije gebruikerstekst die een ánder dan de schrijver kan lezen
--
--    Dat is de reikwijdte die de twee regels zélf dragen. De bidi-CHECK bestaat
--    omdat tekst anders kan renderen dan hij is opgeslagen; de nul-pixelregel
--    omdat een teken dat als nul pixels rendert nooit inhoud is. Geen van beide
--    onderbouwingen hangt aan een knop — dat deed alleen de uitrolvolgorde.
--
-- ---------------------------------------------------------------------------
-- Wat er langs dat criterium gelegd is, en wat eruit viel
-- ---------------------------------------------------------------------------
--
-- 📏 Elke tekstkolom in `public` genomen, en per kolom twee dingen gemeten: heeft
--    `authenticated` er een SELECT-grant op, en heeft de SELECT-policy een tak
--    die verder reikt dan de schrijver zelf. Beide ja = groepszichtbaar.
--
--   **Erin, twaalf kolommen:**
--
--     milestones.title, .description        shares_group_with_goal(g.id)
--     goals.description                     shares_group_with_goal(id)
--     daily_moves.body                      visibility = 'group' + shares_group_with_goal
--     todo_items.body                       visibility = 'group' + mag_groep_lezen
--     week_reviews.{did,blocked,next}_text   mag_groep_lezen(group_id)
--     week_review_replies.body              mag_groep_lezen(r.group_id)
--     commitments.body                      begunstigde groep, bij unlocked/due/resolved
--     deadline_requests.decision_note       mag_groep_lezen(group_id)
--     reports.toelichting                   beheerder die niet het onderwerp is
--
--   **Eruit, elk met de meting erbij:**
--
--     - **`goals.identity_statement`** en **`profiles.when_i_do_it`** — 📏 géén
--       SELECT-grant voor `authenticated`. Ze staan in een tabel die wél
--       groepszichtbaar is, en zijn dicht via een **kolomgrant** en niet via een
--       policy. Dat is precies de vorm die CLAUDE.md voorschrijft waar RLS
--       tekortschiet, en hij werkt hier. Een CHECK zou niets bewaken dat een
--       ander kan lezen.
--
--     - **`completion_approvals.comment`** — 📏 `completion_approvals_select` is
--       `approver_id = auth.uid() OR subject_id = auth.uid()`. Geen groepstak:
--       alleen de twee betrokkenen lezen hem. 0274 §4a noemde hem *"de
--       eerstvolgende ring"* onder een ánder criterium; onder dít criterium valt
--       hij er niet in, en dat is een andere reden dan destijds.
--
--     - **`reports.reden`** — 📏 `reports_reden_geldig` beperkt hem tot vijf
--       letterlijke waarden (`harassment`, `spam`, `inappropriate`,
--       `impersonation`, `other`). Het is geen vrije tekst maar een enum in een
--       `text`-kolom, en een tekengrens erop kan per constructie nooit vuren.
--       Een CHECK die niet kan vuren is geen grens maar ruis in de lijst.
--
--     - **⚠️⚠️ `reports.bericht_kopie` — en dit is de scherpste van de lijst,
--       want hij stond er eerst wél in en zou een veiligheidsroute gebroken
--       hebben.** 📏 `meld()` zet die kolom zélf: regel 78 van zijn definitie is
--       `left(v_kopie, 1000)`, met `v_kopie` woordelijk uit `chat_messages.body`.
--       Die bronkolom staat hierboven met reden **buiten** deze migratie. Een
--       CHECK op de kopie is dus strenger dan de bron, en het gevolg is niet dat
--       er iets geweigerd wordt dat niemand wilde: het gevolg is dat **een
--       bericht met een onzichtbaar teken erin niet meer te melden is**. Dat is
--       de meldknop, en die bestaat voor intimidatie.
--
--       ⚠️ De regel eronder is algemener dan dit geval en hij hoort onthouden te
--       worden: **een kopie erft de grenzen van zijn bron.** Een kopieerroute
--       strenger maken dan wat hij kopieert, breekt de kopieerder — en het breekt
--       hem op invoer die iemand ánders geschreven heeft, dus de gebruiker die de
--       melding maakt kan er niets aan doen. Zelfde klasse als de tweede
--       schrijfroute naar `completions.note` bij QS8-506, één laag hoger.
--
--       ⚠️ En `left(…, 1000)` knipt bovendien op een codepuntgrens: dat kan een
--       vlagreeks halveren en een losse tag achterlaten. Wie de kopie ooit tóch
--       wil grendelen, grendelt eerst de bron en kijkt dan naar die knip.
--
--     - **`chat_messages.body`** — voldoet aan het criterium en gaat hier tóch
--       niet mee. Niet omdat het mag, maar omdat het een eigen afweging is: dit
--       is de heetste schrijfroute van de app, en de openstaande rij in
--       `docs/ENGINEER-REVIEW.md` over de kosten van een regex-CHECK bij zeer
--       lange invoer zou hier voor het eerst op een pad staan dat bij elk bericht
--       draait. Die kosten zijn op een lege database niet te meten.
--       ⚠️ **Dit is een uitstel mét een reden en een plek**, en niet de vorm die
--       QS8-506 opleverde — daar ontbrak juist de plek.
--
-- ---------------------------------------------------------------------------
-- Welke regel wél en welke niet
-- ---------------------------------------------------------------------------
--
-- **De bidi-CHECK en de nul-pixelregel gaan op alle veertien.**
--
-- **De contextregel van 0282 gaat op géén ervan**, en dat is dezelfde afweging
-- als in 0283: zijn onderbouwing is *"de lezer leidt hieruit af wíe of wát hij
-- kiest"*, en dat geldt voor een naam. Dit zijn veertien kolommen proza. De
-- prijs van die regel is dat hij tekens strijkt die een gebruiker uit Word of
-- een PDF plakt; bij `reports.toelichting` of een weekafsluiting is dat een
-- formulier dat vastloopt op tekst waar niets aan te zien is.
--
-- ⚠️ De residu-rij die dat oplevert staat al in `docs/ENGINEER-REVIEW.md` sinds
--    QS8-506 (`Hard<ZWNJ>lopen` rendert als `Hardlopen`); deze migratie verbreedt
--    hem naar veertien kolommen en de rij noemt dat.
--
-- ---------------------------------------------------------------------------
-- En de client strijkt mee — de les die QS8-506 duur betaald heeft
-- ---------------------------------------------------------------------------
--
-- 0269 schrijft de drieslag uit: de database weigert, de client strijkt
-- stilletjes. Zonder die tweede is een CHECK geen grens maar een storing.
--
-- ⚠️⚠️ **En "de client" betekent élke schrijfroute en niet élk schema.** 📏 Bij
--    QS8-506 bleek `completions.note` er twee te hebben — één langs een schema en
--    één er volledig langs — en op die tweede liep een geplakte notitie vast op
--    een melding die de gebruiker niet kon oplossen. *Een schema hoort bij een
--    formulier en niet bij een kolom.* Voor deze veertien is daarom per kolom de
--    schrijfroute opgezocht en niet het schema; wat er gevonden is staat in
--    `docs/decisions/2026-09-16-het-criterium-draagt-de-scope-en-niet-andersom.md`.
--
-- ---------------------------------------------------------------------------
-- Staat er al zo een? — en dit blok staat vóór de CHECKs
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De volgorde is de les van 0269, 0270, 0273 en 0283 en geen stijlkeuze.**
--    Staat dit blok ná de `add constraint`, dan draait het nooit: de ALTER valt om
--    met `violated by some row`, de transactie is afgebroken, en alles erna wordt
--    overgeslagen. Een `add constraint` **zónder** `not valid` toetst élke
--    bestaande rij en weigert.
--
-- 📏 Op de lokale stack vandaag: 0 rijen in alle twaalf kolommen.
begin;

do $$
declare
  r record;
  v_totaal bigint := 0;
begin
  for r in
  select 'milestones.title' as kolom, count(*) as aantal from public.milestones where (title <> public.zonder_bidi(title) or title <> public.zonder_onzichtbaar_middenin(title))
  union all
  select 'milestones.description' as kolom, count(*) as aantal from public.milestones where description is not null and (description <> public.zonder_bidi(description) or description <> public.zonder_onzichtbaar_middenin(description))
  union all
  select 'goals.description' as kolom, count(*) as aantal from public.goals where description is not null and (description <> public.zonder_bidi(description) or description <> public.zonder_onzichtbaar_middenin(description))
  union all
  select 'daily_moves.body' as kolom, count(*) as aantal from public.daily_moves where (body <> public.zonder_bidi(body) or body <> public.zonder_onzichtbaar_middenin(body))
  union all
  select 'todo_items.body' as kolom, count(*) as aantal from public.todo_items where (body <> public.zonder_bidi(body) or body <> public.zonder_onzichtbaar_middenin(body))
  union all
  select 'week_reviews.did_text' as kolom, count(*) as aantal from public.week_reviews where did_text is not null and (did_text <> public.zonder_bidi(did_text) or did_text <> public.zonder_onzichtbaar_middenin(did_text))
  union all
  select 'week_reviews.blocked_text' as kolom, count(*) as aantal from public.week_reviews where blocked_text is not null and (blocked_text <> public.zonder_bidi(blocked_text) or blocked_text <> public.zonder_onzichtbaar_middenin(blocked_text))
  union all
  select 'week_reviews.next_text' as kolom, count(*) as aantal from public.week_reviews where next_text is not null and (next_text <> public.zonder_bidi(next_text) or next_text <> public.zonder_onzichtbaar_middenin(next_text))
  union all
  select 'week_review_replies.body' as kolom, count(*) as aantal from public.week_review_replies where (body <> public.zonder_bidi(body) or body <> public.zonder_onzichtbaar_middenin(body))
  union all
  select 'commitments.body' as kolom, count(*) as aantal from public.commitments where (body <> public.zonder_bidi(body) or body <> public.zonder_onzichtbaar_middenin(body))
  union all
  select 'deadline_requests.decision_note' as kolom, count(*) as aantal from public.deadline_requests where decision_note is not null and (decision_note <> public.zonder_bidi(decision_note) or decision_note <> public.zonder_onzichtbaar_middenin(decision_note))
  union all
  select 'reports.toelichting' as kolom, count(*) as aantal from public.reports where toelichting is not null and (toelichting <> public.zonder_bidi(toelichting) or toelichting <> public.zonder_onzichtbaar_middenin(toelichting))
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

alter table public.milestones
  drop constraint if exists milestones_title_geen_bidi;
alter table public.milestones
  add constraint milestones_title_geen_bidi
  check (title = public.zonder_bidi(title));

alter table public.milestones
  drop constraint if exists milestones_title_geen_nul_pixels;
alter table public.milestones
  add constraint milestones_title_geen_nul_pixels
  check (title = public.zonder_onzichtbaar_middenin(title));

alter table public.milestones
  drop constraint if exists milestones_description_geen_bidi;
alter table public.milestones
  add constraint milestones_description_geen_bidi
  check (description is null or description = public.zonder_bidi(description));

alter table public.milestones
  drop constraint if exists milestones_description_geen_nul_pixels;
alter table public.milestones
  add constraint milestones_description_geen_nul_pixels
  check (description is null or description = public.zonder_onzichtbaar_middenin(description));

alter table public.goals
  drop constraint if exists goals_description_geen_bidi;
alter table public.goals
  add constraint goals_description_geen_bidi
  check (description is null or description = public.zonder_bidi(description));

alter table public.goals
  drop constraint if exists goals_description_geen_nul_pixels;
alter table public.goals
  add constraint goals_description_geen_nul_pixels
  check (description is null or description = public.zonder_onzichtbaar_middenin(description));

alter table public.daily_moves
  drop constraint if exists daily_moves_body_geen_bidi;
alter table public.daily_moves
  add constraint daily_moves_body_geen_bidi
  check (body = public.zonder_bidi(body));

alter table public.daily_moves
  drop constraint if exists daily_moves_body_geen_nul_pixels;
alter table public.daily_moves
  add constraint daily_moves_body_geen_nul_pixels
  check (body = public.zonder_onzichtbaar_middenin(body));

alter table public.todo_items
  drop constraint if exists todo_items_body_geen_bidi;
alter table public.todo_items
  add constraint todo_items_body_geen_bidi
  check (body = public.zonder_bidi(body));

alter table public.todo_items
  drop constraint if exists todo_items_body_geen_nul_pixels;
alter table public.todo_items
  add constraint todo_items_body_geen_nul_pixels
  check (body = public.zonder_onzichtbaar_middenin(body));

alter table public.week_reviews
  drop constraint if exists week_reviews_did_text_geen_bidi;
alter table public.week_reviews
  add constraint week_reviews_did_text_geen_bidi
  check (did_text is null or did_text = public.zonder_bidi(did_text));

alter table public.week_reviews
  drop constraint if exists week_reviews_did_text_geen_nul_pixels;
alter table public.week_reviews
  add constraint week_reviews_did_text_geen_nul_pixels
  check (did_text is null or did_text = public.zonder_onzichtbaar_middenin(did_text));

alter table public.week_reviews
  drop constraint if exists week_reviews_blocked_text_geen_bidi;
alter table public.week_reviews
  add constraint week_reviews_blocked_text_geen_bidi
  check (blocked_text is null or blocked_text = public.zonder_bidi(blocked_text));

alter table public.week_reviews
  drop constraint if exists week_reviews_blocked_text_geen_nul_pixels;
alter table public.week_reviews
  add constraint week_reviews_blocked_text_geen_nul_pixels
  check (blocked_text is null or blocked_text = public.zonder_onzichtbaar_middenin(blocked_text));

alter table public.week_reviews
  drop constraint if exists week_reviews_next_text_geen_bidi;
alter table public.week_reviews
  add constraint week_reviews_next_text_geen_bidi
  check (next_text is null or next_text = public.zonder_bidi(next_text));

alter table public.week_reviews
  drop constraint if exists week_reviews_next_text_geen_nul_pixels;
alter table public.week_reviews
  add constraint week_reviews_next_text_geen_nul_pixels
  check (next_text is null or next_text = public.zonder_onzichtbaar_middenin(next_text));

alter table public.week_review_replies
  drop constraint if exists week_review_replies_body_geen_bidi;
alter table public.week_review_replies
  add constraint week_review_replies_body_geen_bidi
  check (body = public.zonder_bidi(body));

alter table public.week_review_replies
  drop constraint if exists week_review_replies_body_geen_nul_pixels;
alter table public.week_review_replies
  add constraint week_review_replies_body_geen_nul_pixels
  check (body = public.zonder_onzichtbaar_middenin(body));

alter table public.commitments
  drop constraint if exists commitments_body_geen_bidi;
alter table public.commitments
  add constraint commitments_body_geen_bidi
  check (body = public.zonder_bidi(body));

alter table public.commitments
  drop constraint if exists commitments_body_geen_nul_pixels;
alter table public.commitments
  add constraint commitments_body_geen_nul_pixels
  check (body = public.zonder_onzichtbaar_middenin(body));

alter table public.deadline_requests
  drop constraint if exists deadline_requests_decision_note_geen_bidi;
alter table public.deadline_requests
  add constraint deadline_requests_decision_note_geen_bidi
  check (decision_note is null or decision_note = public.zonder_bidi(decision_note));

alter table public.deadline_requests
  drop constraint if exists deadline_requests_decision_note_geen_nul_pixels;
alter table public.deadline_requests
  add constraint deadline_requests_decision_note_geen_nul_pixels
  check (decision_note is null or decision_note = public.zonder_onzichtbaar_middenin(decision_note));



alter table public.reports
  drop constraint if exists reports_toelichting_geen_bidi;
alter table public.reports
  add constraint reports_toelichting_geen_bidi
  check (toelichting is null or toelichting = public.zonder_bidi(toelichting));

alter table public.reports
  drop constraint if exists reports_toelichting_geen_nul_pixels;
alter table public.reports
  add constraint reports_toelichting_geen_nul_pixels
  check (toelichting is null or toelichting = public.zonder_onzichtbaar_middenin(toelichting));



commit;
