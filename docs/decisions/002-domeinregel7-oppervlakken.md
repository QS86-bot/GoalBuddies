# 002 — Falen is nooit publiek: de inventarisatie van elk groepsoppervlak

| | |
|---|---|
| **Status** | ✅ Vastgesteld 18-08-2026 |
| **Datum** | 18-08-2026, tijdens EPIC 7 |
| **Linear** | QS8-74 (7.6) |
| **Volgt uit** | `CLAUDE.md` domeinregel 7 · `docs/PRODUCT-PROPOSAL.md` §1.4 · `docs/research/habit-huddle-teardown.md` |

> Domeinregel 7 is geen feature en daarom nergens "af". Dit document is de lijst
> waar hij op afgedwongen wordt, plus de plekken waar hij vandaag nog lekt.
>
> **De les van de vorige sessie:** de schermen van EPIC 5 hielden de regel netjes
> aan terwijl de database hem lekte. `weekly_goals_select` gaf elke groepsgenoot de
> hele rij van een gekoppeld doel, inclusief `status = 'missed'`. Eén `GET` op
> `/rest/v1/weekly_goals` leverde de volledige lijst gemiste weken van een ander op,
> met datum. Er was geen slimheid voor nodig.
>
> Bij élk nieuw ding dat de groep te zien krijgt, dus twee vragen:
>
> 1. Kan hieruit iemands gemiste week worden afgeleid?
> 2. Kan iemand dat met één API-verzoek uitlezen, buiten de UI om?

---

## 1. De regel, in één alinea

De groepsfeed, systeemberichten, het groepsoverzicht, De Ketting, seizoensrecaps en
notificaties bevatten uitsluitend positieve signalen: afgeronde weekdoelen,
mijlpalen, goedkeuringen, aanmoedigingen. Nooit een gemiste week, verbroken reeks of
achterstand van iemand anders. Eigen tegenvallers zijn privé zichtbaar voor jezelf.

Er zijn precies **twee routes** waarlangs tegenslag de groep bereikt, en beide lopen
via de gebruiker zelf:

1. **Vraag 2 van de weekafsluiting** — "wat zat in de weg?" (7.5, gebouwd in EPIC 7).
2. **De knop "vraag je groep om hulp"** van de Risico-radar (EPIC 12, nog niet gebouwd).

De enige uitzondering is een straf die de gebruiker zelf vooraf heeft ingesteld en
bevestigd (domeinregel 5 en 11). `commitments.confirmed_at` is `NOT NULL`, dus dat
"zelf bevestigd" is een schema-eigenschap en geen belofte.

*Waarom:* in een groep van drie vrienden doodt één schaamtemoment de hele groep. Dit
is de belangrijkste vondst uit de Habit Huddle-analyse.

---

## 2. Elk oppervlak dat de groep ziet

Dit is de lijst die QS8-74 vraagt. Kolom "afgedwongen door" is het antwoord op
vraag 2 hierboven: wat houdt het tegen als iemand de UI overslaat?

| # | Oppervlak | Waar | Wat de groep ziet | Afgedwongen door |
|---|---|---|---|---|
| 1 | Groepsoverzicht | `group_overview()`, `app/groep/[id].tsx` | Naam, gekoppeld doel, mijlpaalvoortgang, reeks, of deze periode is afgesloten | De functie geeft de gevaarlijke kolommen niet terug (0016, 0019). Geen puntentotaal, geen `best_streak`, geen `last_cycle_start`, geen weekstatus |
| 2 | Reeksen | `group_visible_streaks` | `current_streak` | View met expliciete kolomlijst, `security_invoker = false` (0005, 0019). `best_streak` eruit: groter dan `current_streak` is sluitend bewijs van een verbroken reeks |
| 3 | Weekdoelen van een gekoppeld doel | `weekly_goals_select` | Het plan en wat gelukt is | Policy sluit `status in ('missed','carried')` uit voor niet-eigenaars (0019, 0020) |
| 4 | Voltooiingen | `completions_select` | Alleen wat ingediend is | Er bestaat geen rij voor een week die níet is afgerond |
| 5 | Beoordelingswachtrij | `openstaande_beoordelingen()` | Wat op jouw oordeel wacht | Alleen ingediende voltooiingen; niemand komt erin voor wat hij niet gedaan heeft (0021) |
| 6 | Punten | `points_ledger` | Niets | `user_id = auth.uid()` als enige SELECT-regel. Een dalend totaal is zichtbaar bewijs van een gemiste week (domeinregel 10) |
| 7 | Uitnodigingspagina (zonder account) | `invite_preview()` | Groepsnaam, aantal leden, huddledag, voornamen | Functie met vaste projectie (0019). Met account het volledige beeld |
| 8 | **Groepschat** | `chat_messages`, `groepschat()` | Wat mensen zelf typen | `chat_messages_select` eist lidmaatschap. `chat_messages_insert` verbiedt `type = 'system'`; `stamp_chat_message()` zet groep, afzender, type en tijd vast (0006, 0010) |
| 9 | **Systeemberichten** | `chat_messages.system_event` | Acht positieve gebeurtenissen | **CHECK `chat_messages_system_event_bekend`** (0025). Een nieuw type vraagt een migratie. Geen titels, notities of niveaus in de tekst |
| 10 | **Weekafsluiting** | `week_reviews`, `weekafsluiting()` | Wat leden zelf schrijven, incl. vraag 2 | De gebruiker schrijft en verstuurt zelf (route 1). Wie niets invult heeft geen rij en staat er niet op |
| 11 | **Reacties op de weekafsluiting** | `week_review_replies` | Wat leden zelf schrijven | Policies via de groep van het ántwoord, niet van de schrijver (0026). Geen UPDATE |
| 12 | Realtime-abonnementen | `supabase_realtime` | `completions`, `weekly_goals`, `chat_messages` | RLS op INSERT en UPDATE. **Op DELETE níet** — zie §4 |
| 13 | De Ketting | `chain_links` | Opdagen per periode | ⚠️ **GEBOUWD 19-08-2026 (migratie 0036) en daarmee LEKKEND.** De redenering "afwezigheid, geen kruisje" hield zolang de tabel leeg was en houdt niet meer. `chain_links_select` geeft elk lid élke rij, met `user_id` en `group_period_start`; voor een **afgesloten** periode betekent een ontbrekende rij niet "nog niet" maar "die week niets gedaan" — geen weekafsluiting én geen goedgekeurd weekdoel. Eén `GET /rest/v1/chain_links?group_id=eq.X&select=user_id,group_period_start` levert de volledige aanwezigheidsmatrix per persoon per week. Dezelfde klasse als `weekly_goals_select` in EPIC 5. `ketting_stand()` (0036/0037) is wél veilig: aantallen zonder namen, en sinds 0037 voor elk lid hetzelfde getal. Het lek zit in de tabelpolicy en in `group_overview()`, niet in de teller. **GEDICHT dezelfde dag in 0037.** `chain_links_select` is nu `user_id = auth.uid() or (is_group_member(group_id) and group_period_start >= current_date - 8)`: je eigen geschiedenis blijft van jou, van een ander zie je alleen de lopende periode — waarin een ontbrekende schakel "nog niet" betekent en niet "gemist". `group_overview()` geeft `closed_this_period` alleen binnen datzelfde venster en daarbuiten `false`. Historische schakels blijven in de tabel staan (domeinregel 6) maar verlaten de database niet meer per persoon; een historische ketting kan alleen als aantal, via `ketting_stand()`. Vastgelegd in `tests/rls/epic8.test.ts` |
| 14 | Seizoensrecap | — | — | Nog niet gebouwd (EPIC 8) |
| 15 | Notificaties | — | — | Nog niet gebouwd (EPIC 11) |
| 16 | **Deadline-verzoeken** | `deadline_requests`, `app/groep/[id].tsx` | Dat iemand om meer tijd vraagt, met zijn eigen argument | Vier policies; schrijven kan alleen via de RPC's (0032). De gebruiker vraagt het zélf aan — route 1, net als vraag 2 van de weekafsluiting. Q-TODO **A7** |
| 17 | **Ingetrokken goedkeuringen** | `approval_withdrawals` | Niets | `approval_withdrawals_select` laat alleen de intrekker en de eigenaar van de week toe. Er gaat géén systeembericht uit: "de week van X is toch niet bevestigd" is een tegenslagsignaal over een ander (0030). De aankondiging van de goedkeuring wordt juist wéggehaald |
| 18 | **Verwijderde accounts** | `chat_messages.sender_id`, `completion_approvals.approver_id` | "Verwijderd lid" in plaats van een naam | `on delete set null` (0031), plus `stamp_chat_message()` die die ene overgang doorlaat (0033). De rij blijft, de persoon niet |

Vet gedrukt is wat in EPIC 7 en in de besluitenronde van 18-08 is toegevoegd.

---

## 3. Waarom systeemberichten geen titels bevatten

Dit is de niet-vanzelfsprekende keuze van EPIC 7 en hij hoort hier te staan.

Een systeembericht meldt de **persoon en de gebeurtenis**, en nooit de doeltitel, de
weektitel, de mijlpaaltitel, de notitie of het gehaalde niveau. "Sanne heeft een week
afgerond en wacht op bevestiging" — niet welke week, en niet of het de vloer of het
plafond was.

Drie redenen, in volgorde van gewicht:

1. **Een bericht overleeft zijn autorisatie.** Koppelen is de toestemming (QS8-54) en
   ontkoppelen is het intrekken ervan. Ontkoppelt iemand zijn doel, dan verdwijnt de
   titel uit `group_overview` — maar een chatbericht met die titel erin blijft staan.
   Dat is dezelfde klasse fout als een snapshot die een policy overleeft, en die is
   dit project al vier keer overkomen (0006, 0010, 0019, 0023).
2. **Het niveau raakt domeinregel 8.** Vloer gehaald betekent dat de week telt; het
   verschil zit alleen in de punten en die zijn privé. "Sanne haalde de vloer" zet
   een waardeoordeel over iemands slechtste week in een permanent logboek.
3. **Het detail hoort waar RLS er nog bij is.** Het beoordeelscherm heeft alles wat je
   nodig hebt om te oordelen, live en onder policy. Een chatbericht is een nudge.

**Wat dit kost:** de chat is minder informatief. Een test die de vier geheime titels in
de fixture nergens in een systeembericht mag terugvinden, houdt de keuze vast
(`tests/rls/epic7.test.ts`). Wil je het toch ruimer, dan is dat een productbeslissing
en geen bugfix — zet hem in `docs/Q-TODO.docx`.

---

## 4. Wat vandaag nog lekt

Eerlijk opgeschreven, met de deadline erbij.

| Wat | Waar | Vandaag misbruikbaar? | Deadline |
|---|---|---|---|
| Afwezigheid van een weekdoel in een cyclus | `weekly_goals_select` | Zwak: misschien had die persoon niets gepland | Bewust geaccepteerd (0020) |
| `milestones.status = 'dropped'` | `milestones_select` geeft de hele rij | Ja | Hangt aan A7 en is daarmee dezelfde keuze: de groep mag zien dat je van koers verandert |
| `REPLICA IDENTITY FULL` op een realtime-tabel | Geen technische rem: `publish` is een optie van de publicatie | Nee, staat op `default` | **Nu getest** — `realtime_bewaking()` en de test in `tests/rls/epic7.test.ts`. Was Q-TODO **A20** |

### 4a. Drie uitzonderingen die Quinten bewust heeft toegestaan (18-08-2026)

Deze stonden hierboven als lek. Ze zijn geen lek meer maar een besluit, en dat
verschil hoort opgeschreven te staan — anders repareert een volgende sessie ze
alsnog.

| Wat | Besluit | Waarom het te verdedigen is |
|---|---|---|
| `goals.risk_status` en `risk_reason` | **A17 — ja, de groep mag het zien** | Blijft zoals het is; `goals_select` hoeft niet uit elkaar getrokken te worden. Let op: dit is de zwaarste van de drie, want de Risico-radar (EPIC 12) leidt `behind` en `unreachable` zélf af uit gemiste weken. Vanaf de dag dat die radar draait, ís deze kolom een afgeleide van andermans tegenslag — en dan is de vraag of het besluit nog hetzelfde uitvalt. **Herbevestigen vóór EPIC 12.** |
| `goal_events` met `deadline_moved` | **A7 — ja, en sterker: verschuiven vraagt akkoord** | Dit draait de regel niet om maar zet hem op zijn kop, in de goede richting. De verschuiving is niet iets dat de groep achteraf ziet, maar iets dat de gebruiker zélf aanvraagt met een argument. Dat is dezelfde route als vraag 2 van de weekafsluiting: tegenslag bereikt de groep via de persoon, niet via een afgeleide. Migratie 0032 |
| `current_streak` die naar nul valt | **A15 — ja** | Blijft in `group_visible_streaks`. Zwak signaal: een reeks van nul is dubbelzinnig (nieuw lid, pauze, of gemist), en `best_streak` — dat het wél sluitend zou maken — is er in 0019 uitgehaald |

⚠️ **Wat deze drie besluiten níét zijn.** Ze verruimen domeinregel 7 op drie
benoemde plekken; ze schaffen hem niet af. Het puntentotaal, `weekly_goals.status`,
`last_cycle_start` en `points_ledger` blijven dicht, en de regel in §1 geldt
onverkort voor élk nieuw oppervlak. Bij twijfel is het antwoord nog steeds nee.

---

## 5. Hoe de regel afgedwongen blijft

Vier sloten, van hard naar zacht:

1. **`chat_messages_system_event_bekend`** (migratie 0025). Een CHECK, dus hij geldt
   ook voor `service_role` — de rol die alle policies overslaat. Een nieuw type
   systeembericht kán niet zonder migratie.
2. **`SYSTEEM_GEBEURTENISSEN`** in `src/modules/buddies/chat-schemas.ts`, met
   `VERBODEN_GEBEURTENISSEN` ernaast. Drie tests: de lijst is exact negen namen,
   geen enkele naam uit de verbodenlijst staat erin, en — sinds 18-08 — de lijst
   is **gelijk** aan wat de database toestaat, opgehaald met
   `systeembericht_allowlist()` (migratie 0034).

   ⚠️ **Dat derde slot ontbrak, en daardoor viel het slot één keer niet.** Migratie
   0032 zette `deadline_requested` op de CHECK; de lijst in de app bleef op acht
   staan en de test bleef groen, want hij vergeleek de oude lijst met zichzelf.
   De andere test controleerde alleen dat de app niets kent dat de database
   verbiedt — nooit de andere richting. Twee insluitingen zijn geen gelijkheid.
3. **`realtime_bewaking()`** (migratie 0027) plus de test die eist dat geen enkele
   uitgezonden tabel op `full` staat.
4. **Dit document.** De tabel in §2 hoort bijgewerkt te worden bij elk nieuw
   oppervlak, en §4 bij elke reparatie.

### Een vijfde regel, uit de besluitenronde van 18-08

**Een onveranderlijkheidstrigger en een `on delete set null` op dezelfde kolom
sluiten elkaar uit, en de database waarschuwt daar niet voor.**

Een referentiële actie is zelf een UPDATE op de kindtabel. Staat daar een BEFORE
UPDATE-trigger die de kolom terugzet naar `old`, dan draait die de actie in
dezelfde bewerking terug — en Postgres controleert de sleutel daarna niet
opnieuw. Geen fout, geen waarschuwing: de ouderrij verdwijnt en het kind houdt
een verwijzing naar een rij die niet meer bestaat.

Dat is precies wat er gebeurde met `chat_messages.sender_id` (0031 → gerepareerd
in 0033). `groups.created_by` ontsnapte er per ongeluk aan, omdat
`guard_group_update()` begint met een controle op `current_user` en een
referentiële actie als tabeleigenaar draait.

**Bij elke nieuwe `on delete set null`: staat er een trigger op die kolom?**

**Wat er nog niet is:** de RLS-suite draait niet in CI (`docs/WERKVOORRAAD.md` §5).
Groen in GitHub zegt dus niets over domeinregel 7. Zolang dat zo is, moet deze suite
met de hand gedraaid worden vóór een merge.
