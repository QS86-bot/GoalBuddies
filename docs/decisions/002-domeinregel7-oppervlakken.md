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
| 13 | De Ketting | `chain_links` | Opdagen per periode | Nog niet gebouwd (QS8-80). Er staat geen rij voor een periode waarin iemand niet opdaagde: afwezigheid, geen kruisje |
| 14 | Seizoensrecap | — | — | Nog niet gebouwd (EPIC 8) |
| 15 | Notificaties | — | — | Nog niet gebouwd (EPIC 11) |

Vet gedrukt is wat in EPIC 7 is toegevoegd.

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
| `goals.risk_status` en `risk_reason` | `goals_select` geeft groepsgenoten de hele rij | Nee — de Risico-radar bestaat niet en alles staat op `on_track` | Vóór EPIC 12. Vraagt een architectuurwijziging, niet een reparatie. Q-TODO **A17** |
| `goal_events` met `deadline_moved`, `scope_reduced`, `milestone_dropped` | `goal_events_select` | Ja | Productbeslissing. Q-TODO **A7** |
| `milestones.status = 'dropped'` | `milestones_select` geeft de hele rij | Ja | Hangt aan A7; zelfde keuze |
| `current_streak` die naar nul valt | `group_visible_streaks` | Ja, maar zwak: een reeks van nul is dubbelzinnig | Productbeslissing. Q-TODO **A15** |
| Afwezigheid van een weekdoel in een cyclus | `weekly_goals_select` | Zwak: misschien had die persoon niets gepland | Bewust geaccepteerd (0020) |
| `REPLICA IDENTITY FULL` op een realtime-tabel | Geen technische rem: `publish` is een optie van de publicatie | Nee, staat op `default` | **Nu getest** — `realtime_bewaking()` en de test in `tests/rls/epic7.test.ts`. Was Q-TODO **A20** |

---

## 5. Hoe de regel afgedwongen blijft

Vier sloten, van hard naar zacht:

1. **`chat_messages_system_event_bekend`** (migratie 0025). Een CHECK, dus hij geldt
   ook voor `service_role` — de rol die alle policies overslaat. Een nieuw type
   systeembericht kán niet zonder migratie.
2. **`SYSTEEM_GEBEURTENISSEN`** in `src/modules/buddies/chat-schemas.ts`, met
   `VERBODEN_GEBEURTENISSEN` ernaast. Twee tests: de lijst is exact acht namen, en
   geen enkele naam uit de verbodenlijst staat erin. Een toevoeging is dus óók een
   rode test, niet alleen een verkeerde toevoeging.
3. **`realtime_bewaking()`** (migratie 0027) plus de test die eist dat geen enkele
   uitgezonden tabel op `full` staat.
4. **Dit document.** De tabel in §2 hoort bijgewerkt te worden bij elk nieuw
   oppervlak, en §4 bij elke reparatie.

**Wat er nog niet is:** de RLS-suite draait niet in CI (`docs/WERKVOORRAAD.md` §5).
Groen in GitHub zegt dus niets over domeinregel 7. Zolang dat zo is, moet deze suite
met de hand gedraaid worden vóór een merge.
