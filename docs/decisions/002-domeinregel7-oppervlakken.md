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
| 3 | Weekdoelen van een gekoppeld doel | `weekly_goals_select` | Het plan en wat gelukt is | Policy sluit `status in ('missed','carried','cancelled')` uit voor niet-eigenaars (0019, 0020, en `cancelled` sinds 0045). ⚠️ Elke nieuwe status die "niet gelukt" betekent, hoort hier meteen bij: `cancelled` (zelf afgesloten) is er in 0045 bij gekomen en zonder die regel had die migratie gelekt wat 0020 net had gedicht |
| 4 | Voltooiingen | `completions_select` | Alleen wat ingediend is | Er bestaat geen rij voor een week die níet is afgerond |
| 5 | Beoordelingswachtrij | `openstaande_beoordelingen()` | Wat op jouw oordeel wacht | Alleen ingediende voltooiingen; niemand komt erin voor wat hij niet gedaan heeft (0021) |
| 6 | Punten | `points_ledger` | Niets | `user_id = auth.uid()` als enige SELECT-regel. Een dalend totaal is zichtbaar bewijs van een gemiste week (domeinregel 10) |
| 7 | Uitnodigingspagina (zonder account) | `invite_preview()` | Groepsnaam, aantal leden, huddledag, voornamen | Functie met vaste projectie (0019). Met account het volledige beeld |
| 8 | **Groepschat** | `chat_messages`, `groepschat()` | Wat mensen zelf typen | `chat_messages_select` eist lidmaatschap. `chat_messages_insert` verbiedt `type = 'system'`; `stamp_chat_message()` zet groep, afzender, type en tijd vast (0006, 0010) |
| 9 | **Systeemberichten** | `chat_messages.system_event`, `subject_id`, `actor_id`, `payload` | Tien positieve gebeurtenissen | **CHECK `chat_messages_system_event_bekend`** (0025, uitgebreid in 0032, 0070 en 0071). Een nieuw type vraagt een migratie. Geen titels, notities of niveaus in de tekst. ⚠️ **Gewijzigd 21-08-2026 (migratie 0059, QS8-107).** De zin stond uitgeschreven in `body` en werd zo getoond; nu dragen de rijen hun parameters als kolommen en maakt de app de zin, in `src/modules/buddies/systeemberichten.ts`. `body` blijft als noodterugval. **Voor deze regel verandert er niets aan wát de groep ziet** — de zinnen zijn woordelijk gelijk gebleven — maar de regel woont nu op één plek in plaats van verspreid over zeven SQL-functies, mét een test die weigert dat een bekende gebeurtenis op de terugval landt. De persoonskolommen zijn `on delete set null`, zodat een verwijderd account "Een oud-lid" wordt zonder dat er een rij herschreven wordt (oppervlak 18). ⚠️ Een persoon hoort **nooit** in `payload`: een uuid in jsonb heeft geen foreign key en overleeft dus een accountverwijdering ⚠️ **`chain_milestone` is er in 0070 bij gekomen (24-08) en is het enige systeembericht zonder persoonsnaam** — een ketting-mijlpaal is van de groep. De mijlpaal is een rond **cumulatief** aantal schakels (10, 25, 50, …) en bewust geen "voltallig deze periode" of "N perioden op rij": die twee zijn conditioneel, dus het uitblijven van het bericht vertelt de groep dat iemand ontbrak — de afwezigheid wordt dan zelf het signaal. Een cumulatieve teller is monotoon, kent die toestand niet, en rekent bovendien niets uit (correctheidsregel 7). ⚠️ **0075 repareerde een onderbroken keten:** de drempel stond alleen in `body`, en dat is sinds 0059 noodterugval — de app maakt de zin zelf uit `system_event` plus de kolommen. Er was geen catalogussleutel en geen parameter voor een getal, dus de groepschat toonde letterlijk `systeembericht.chain_milestone`. Elk schakeltje was af (`payload` bestond, `groepschat()` gaf hem terug, de CHECK stond goed) en de keten liep nergens door — de variant zonder kapot onderdeel uit onwrikbare regel 18, vraag 5. Het getal gaat nu mee in `payload`; een persoon hoort daar nóóit in. ⚠️ **0071 sloot een gat dat 0070 gevaarlijk maakte:** `chat_messages_insert` verbood wel `type = 'system'` maar zei niets over `system_event`, dus een lid kon een eigen bericht met een systeemgebeurtenis plaatsen. Onschadelijk tot 0070 — de weergave kijkt naar `sender_id` en `type` — maar daarna kon je er elke echte mijlpaalaankondiging mee wegdrukken. Nu twee sloten: de policy laat het niet meer toe, en de telling accepteert alleen rijen die `plaats_systeembericht()` geschreven kan hebben |
| 10 | **Weekafsluiting** | `week_reviews`, `weekafsluiting()` | Wat leden zelf schrijven, incl. vraag 2 | De gebruiker schrijft en verstuurt zelf (route 1). Wie niets invult heeft geen rij en staat er niet op |
| 11 | **Reacties op de weekafsluiting** | `week_review_replies` | Wat leden zelf schrijven | Policies via de groep van het ántwoord, niet van de schrijver (0026). Geen UPDATE |
| 12 | Realtime-abonnementen | `supabase_realtime` | `completions`, `weekly_goals`, `chat_messages` | RLS op INSERT en UPDATE. **Op DELETE níet** — zie §4 |
| 13 | De Ketting | `chain_links` | Opdagen per periode | ⚠️ **GEBOUWD 19-08-2026 (migratie 0036) en daarmee LEKKEND.** De redenering "afwezigheid, geen kruisje" hield zolang de tabel leeg was en houdt niet meer. `chain_links_select` geeft elk lid élke rij, met `user_id` en `group_period_start`; voor een **afgesloten** periode betekent een ontbrekende rij niet "nog niet" maar "die week niets gedaan" — geen weekafsluiting én geen goedgekeurd weekdoel. Eén `GET /rest/v1/chain_links?group_id=eq.X&select=user_id,group_period_start` levert de volledige aanwezigheidsmatrix per persoon per week. Dezelfde klasse als `weekly_goals_select` in EPIC 5. `ketting_stand()` (0036/0037) is wél veilig: aantallen zonder namen, en sinds 0037 voor elk lid hetzelfde getal. Het lek zit in de tabelpolicy en in `group_overview()`, niet in de teller. **GEDICHT dezelfde dag in 0037.** `chain_links_select` is nu `user_id = auth.uid() or (is_group_member(group_id) and group_period_start >= current_date - 8)`: je eigen geschiedenis blijft van jou, van een ander zie je alleen de lopende periode — waarin een ontbrekende schakel "nog niet" betekent en niet "gemist". `group_overview()` geeft `closed_this_period` alleen binnen datzelfde venster en daarbuiten `false`. Historische schakels blijven in de tabel staan (domeinregel 6) maar verlaten de database niet meer per persoon; een historische ketting kan alleen als aantal, via `ketting_stand()`. Vastgelegd in `tests/rls/epic8.test.ts`. **Het scherm** (`app/groep/[id].tsx`, component `Ketting.tsx`) toont hiervan uitsluitend aantallen via `ketting_stand()` — nooit namen, ook niet in het toegankelijkheidslabel. ⚠️ Maar de ledenlijst eronder (`MemberRow`) toont dezelfde weekstatus wél per persoon met naam; in een kleine groep maakt dat de anonimiteit van de teller grotendeels ongedaan. Geen datalek — het is oppervlak 1, bewust genomen in QS8-55 — wel een ontwerpinconsistentie op één scherm, en een productbeslissing. Zie `docs/ENGINEER-REVIEW.md`, 19-08 |
| 14 | Seizoensrecap | — | — | Nog niet gebouwd (EPIC 8) |
| 15 | Notificaties | — | — | Nog niet gebouwd (EPIC 11) |
| 16 | **Deadline-verzoeken** | `deadline_requests`, `app/groep/[id].tsx` | Dat iemand om meer tijd vraagt, met zijn eigen argument | Vier policies; schrijven kan alleen via de RPC's (0032). De gebruiker vraagt het zélf aan — route 1, net als vraag 2 van de weekafsluiting. Q-TODO **A7** |
| 17 | **Ingetrokken goedkeuringen** | `approval_withdrawals` | Niets | `approval_withdrawals_select` laat alleen de intrekker en de eigenaar van de week toe. Er gaat géén systeembericht uit: "de week van X is toch niet bevestigd" is een tegenslagsignaal over een ander (0030). De aankondiging van de goedkeuring wordt juist wéggehaald |
| 18 | **Verwijderde accounts** | `chat_messages.sender_id`, `completion_approvals.approver_id` | "Verwijderd lid" in plaats van een naam | `on delete set null` (0031), plus `stamp_chat_message()` die die ene overgang doorlaat (0033). De rij blijft, de persoon niet |

| 19 | **Weekpassen** | `week_pass_events`, `weekpas_stand()`, `weekpas_standen()` | **Niets** | ⚠️ **GEBOUWD 19-08-2026 (migraties 0039–0042).** Dit is de derde tabel die van leeg naar gevuld ging, dus de vraag hoort erbij: een ontbrekende rij betekent nu "deze gemiste week is niet gered", en dat is per definitie een tegenslagsignaal. Daarom heeft `week_pass_events` **alleen** een SELECT-policy op `user_id = auth.uid()`, zijn alle schrijvers SECURITY DEFINER en `service_role`-only, en staat de tabel **niet** in de realtime-publicatie. `weekpas_stand()` en `weekpas_standen()` dragen hun eigenaarstoets zélf en leunen niet op RLS — een groepsgenoot mág de rijen van een gekoppeld doel lezen, dus een INVOKER-functie zou de voorraad van een ander teruggeven. In 0039 was die toets stuk (`eigenaar <> auth.uid()` gaat zonder sessie niet af, want `null` is geen `false`); gedicht in 0040. **Er komt géén systeembericht bij een verbruikte pas** — dat zou een gemiste week in de groepschat zetten — dus `chat_messages_system_event_bekend` is bewust niet aangeraakt. De componenten `Weekpas` en `DoelStandKaart` hebben geen `viewer`-prop en staan alleen op het privé-dashboard |
| 20 | **Commitments** | `commitments`, `commitment_events`, systeemberichten `commitment_unlocked` en `commitment_due` | Een **beloning** zodra hij vrijgespeeld is, en een **straf** zodra hij verschuldigd is — verder niets | ⚠️ **GEBOUWD 21-08-2026 (migratie 0057).** Vierde tabel die van leeg naar gevuld ging, dus de vraag hoort erbij. Een verschuldigde straf is de **enige benoemde uitzondering** op deze regel (domeinregel 5 en 11): de gebruiker heeft hem zelf ingesteld en bevestigd, en `commitments.confirmed_at` is `NOT NULL` zodat dat een schema-eigenschap is. `commitments_select` geeft de begunstigde groep leesrecht vanaf `unlocked`, `due` en `resolved` — en **daarom wordt een straf op een afgerond doel `cancelled` en niet `resolved`**: die staat niet in de lijst, en een straf die nooit is afgegaan is niemands zaak (besluit 003 §3). De beloning gaat naar élke gekoppelde groep, de straf **alleen** naar de begunstigde groep. Het **auditspoor** (`commitment_events`) is eigenaar-only en gaat nóóit naar de groep: die leest de straf, niet de geschiedenis eromheen. De teksten noemen de persoon en de gebeurtenis en verder niets — geen bedrag, geen doeltitel (§3). Vastgelegd in `tests/rls/epic9.test.ts` |

Vet gedrukt is wat in EPIC 7, in de besluitenronde van 18-08 en in EPIC 8 en 9 is
toegevoegd.

⚠️ **Wat oppervlak 19 verandert aan oppervlak 2, en dat is de kant die je zou
missen.** Vóór de weekpassen was "de reeks van X valt naar nul" sluitend bewijs
van een gemiste week; §4a hieronder verdedigt A15 met het argument dat een reeks
dubbelzinnig genoeg is. Een geredde week laat de teller nu **vlak staan** in
plaats van hem op nul te zetten, en een vlakke reeks is ononderscheidbaar van
"die week geen weekdoel gepland" en van een adempauze.

**De weekpas maakt A15 dus zwakker in de goede richting: `current_streak`
verklapt sinds 19-08 mínder dan daarvoor, niet meer.** Dat is bijvangst en geen
ontwerpdoel — reken er niet op als bescherming, want een gebruiker zonder passen
heeft hem niet.

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
| `goals.risk_status` en `risk_reason` | ⚠️ **A17 — herbevestigd op 20-08-2026, en teruggedraaid: de groep ziet het NIET** | Het oorspronkelijke besluit (18-08) was "ja", mét de aantekening "herbevestigen vóór EPIC 12", juist omdat de radar `behind` en `unreachable` afleidt uit gemiste weken. Bij het bouwen van EPIC 12 is die herbevestiging gevraagd en het antwoord was dicht. **Er zijn dus nog twee verruimingen, niet drie.** Uitgevoerd in migratie 0050: de drie kolommen zijn verhuisd naar een eigen tabel `goal_risk` met eigenaar-only RLS, want een kolomgrant geldt per rol (de eigenaar zou zijn eigen stand kwijtraken) en `goals_select` eigenaar-only maken breekt `group_overview()`. Een eigen tabel maakt de bescherming structureel in plaats van een policy die je goed moet onthouden. Het acceptatiecriterium van QS8-94 zei trouwens al hetzelfde: "uitsluitend zichtbaar voor de eigenaar" |
| `goal_events` met `deadline_moved` | **A7 — ja, en sterker: verschuiven vraagt akkoord** | Dit draait de regel niet om maar zet hem op zijn kop, in de goede richting. De verschuiving is niet iets dat de groep achteraf ziet, maar iets dat de gebruiker zélf aanvraagt met een argument. Dat is dezelfde route als vraag 2 van de weekafsluiting: tegenslag bereikt de groep via de persoon, niet via een afgeleide. Migratie 0032 |
| `current_streak` die naar nul valt | **A15 — ja** | Blijft in `group_visible_streaks`. Zwak signaal: een reeks van nul is dubbelzinnig (nieuw lid, pauze, of gemist), en `best_streak` — dat het wél sluitend zou maken — is er in 0019 uitgehaald |

⚠️ **Het zijn er nu twee, niet drie.** A17 is op 20-08-2026 herbevestigd en
teruggedraaid — zie de rij hierboven. Wat overblijft is A15 (de groep ziet je
reeks) en A7 (de groep ziet je deadline-verschuiving, en die vraag je zelf aan).

⚠️ **Wat deze besluiten níét zijn.** Ze verruimen domeinregel 7 op benoemde
plekken; ze schaffen hem niet af. Het puntentotaal, `weekly_goals.status`,
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

---

## 6. Besluit A41 — open of beschermde groepen (24-08-2026, EPIC 13)

Vanaf migratie 0076 is domeinregel 7 een eigenschap **per groep** in plaats van
een eigenschap van het product. `groups.zichtbaarheid` staat op `beschermd` of
`open`; beschermd is de standaard en bestaande groepen zijn beschermd.

⚠️ **Dit document blijft de waarheid over de beschérmde stand.** Alles in §2 t/m
§5 beschrijft wat een groep ziet zolang hij op `beschermd` staat, en dat is
onveranderd. Deze paragraaf zegt er per oppervlak bij wat "open" betekent — en
bij verreweg de meeste oppervlakken is het antwoord "niets".

### 6a. De fundering

| Wat | Waar | Wat het doet |
|---|---|---|
| `groups.zichtbaarheid` | 0076 | `not null default 'beschermd'`, CHECK op twee waarden. Geen derde toestand: "nog niet gekozen" zou betekenen dat elke policy moet weten wat dat betekent, en het antwoord is altijd "beschermd" |
| Twee schrijfsloten | 0076 §2 | De kolom valt buiten de zeven kolommen die 0019 aan `authenticated` teruggaf, dus hij was vanaf het eerste moment niet client-schrijfbaar. `guard_group_update()` zet hem daarnaast terug. ⚠️ **Dat eerste slot kreeg de kolom gratis, en dat is precies waarom 0019 het zo heeft opgezet** — een slot dat werkt zonder dat iemand eraan denkt |
| `group_events` | 0076 §3 | Auditspoor van de groep als geheel. Leesbaar voor élk lid (wie zichtbaar gemaakt wordt, hoort te kunnen nazien wanneer en door wie), schrijfbaar voor niemand: er is geen INSERT-policy, dezelfde vorm als `commitment_events`. Geen doel, geen week, geen status in de rij |
| `zet_groepszichtbaarheid()` | 0076 §6 | De enige route. Actieve beheerder, `p_bevestigd` verplicht, `group_events`-rij vóór het bericht, systeembericht erna. ⚠️ **De rem staat alleen op de onveilige richting**: naar `open` hooguit één keer per etmaal, naar `beschermd` altijd — een beheerder die zich vergist heeft, mag de gemiste weken van zijn leden niet een dag lang zichtbaar moeten houden als straf voor zijn fout |
| `group_opened` / `group_protected` | 0076 §5, oppervlak 9 | Elfde en twaalfde systeemgebeurtenis. Zónder deze twee zou het omzetten stilzwijgend zijn, en dat is precies wat grens 3 verbiedt: het bericht is het moment waarop een lid kan besluiten zijn doel te ontkoppelen |

### 6b. Wat "open" per oppervlak betekent

⚠️ **Niet in één keer opengooien** — dat staat letterlijk in QS8-132. De kolom
bestaat sinds 0076 en varieerde toen nog nergens op; 0077 is het eerste
oppervlak. Deze tabel is de beoordeling van alle twintig, met de stand van
24-08-2026.

| # | Oppervlak | Wat "open" hier betekent | Stand |
|---|---|---|---|
| 1 | Groepsoverzicht | `group_overview()` mag de weekstatus en `last_cycle_start` teruggeven. ⚠️ Een functie met vaste projectie, dus dit is geen policy maar een tweede projectie — en die moet apart getest | **Nog niet** |
| 2 | Reeksen | `best_streak` erbij in `group_visible_streaks`. ⚠️ Een view met `security_invoker = false`: de kolomlijst is de bescherming, dus dit vraagt een tweede view of een kolom die conditioneel leeg is. Niet triviaal | **Nog niet** |
| 3 | **Weekdoelen van een gekoppeld doel** | De statusfilter `missed/carried/cancelled/excused` vervalt voor een lid van een open groep | ✅ **0077** |
| 4 | Voltooiingen | Niets. Er bestaat geen rij voor een week die niet is afgerond, dus er valt niets te openen | ✅ n.v.t. |
| 5 | Beoordelingswachtrij | Niets. Alleen ingediende voltooiingen | ✅ n.v.t. |
| 6 | Punten | **Niets, en dat is een apart besluit** — A42, 24-08-2026. Ook in een open groep blijft `points_ledger` eigenaar-only; wie het totaal deelt, deelt het missen via een omweg. De vorm voor competitie is een teller die alleen optelt | ⛔ **Bewust dicht** |
| 7 | Uitnodigingspagina | Niets. Vaste projectie zonder persoonsgegevens over voortgang | ✅ n.v.t. |
| 8 | Groepschat | Niets. Wat mensen zelf typen, is altijd hun eigen keuze geweest | ✅ n.v.t. |
| 9 | Systeemberichten | Niets aan de bestaande tien. Er kwamen er twee bij (6a) die over de gróép gaan. ⚠️ Een open groep krijgt géén nieuw type "X heeft een week gemist": dat zou van een keuze een aankondiging maken, en de allowlist is bewust een migratie waard | ⛔ **Bewust dicht** |
| 10 | Weekafsluiting | Niets. Route 1 — de gebruiker schrijft en verstuurt zelf | ✅ n.v.t. |
| 11 | Reacties op de weekafsluiting | Niets. Idem | ✅ n.v.t. |
| 12 | Realtime | **Niets, en het verbod op `REPLICA IDENTITY FULL` blijft onverkort staan.** ⚠️ De reden is hier een ándere dan bij een beschermde groep: met `full` gaat bij een DELETE de volledige oude rij naar iedereen die zich abonneert, **lid of niet**. "Open" is een keuze over wat de gróép ziet; dit lek gaat naar buiten de groep, en dat heeft niemand gekozen. Getoetst in `tests/rls/epic13.test.ts` | ⛔ **Bewust dicht** |
| 13 | De Ketting | Het venster van acht dagen op `chain_links_select` zou kunnen vervallen, en `closed_this_period` buiten dat venster. ⚠️ Dit is de aanwezigheidsmatrix per persoon per week — het zwaarste oppervlak na 3 | **Nog niet** |
| 14 | Seizoensrecap | Nog niet gebouwd (EPIC 8) — beoordeel bij het bouwen | **Nog niet gebouwd** |
| 15 | Notificaties | Nog niet gebouwd (EPIC 11) — beoordeel bij het bouwen | **Nog niet gebouwd** |
| 16 | Deadline-verzoeken | Niets. De gebruiker vraagt het zélf aan (A7) | ✅ n.v.t. |
| 17 | Ingetrokken goedkeuringen | ⚠️ **Bewust dicht, ook in een open groep.** "De week van X is toch niet bevestigd" is niet iemands eigen tegenslag maar het oordeel van een ánder lid over hem. Openzetten is een keuze over eigen zichtbaarheid, geen mandaat om andermans intrekking rond te sturen | ⛔ **Bewust dicht** |
| 18 | Verwijderde accounts | Niets. `on delete set null` is geen zichtbaarheidskeuze | ✅ n.v.t. |
| 19 | Weekpassen | ⚠️ **Bewust dicht.** Een verbruikte pas is een gemiste week plus de handeling om hem te redden; dat is een privé-voorraad, geen groepsgegeven. Bovendien staan de schrijvers op `service_role` en dragen `weekpas_stand()` en `weekpas_standen()` hun eigenaarstoets zélf — dit oppervlak leunt niet op RLS en zou dus een tweede, eigen verruiming vragen | ⛔ **Bewust dicht** |
| 20 | Commitments | Niets. De beloning en de verschuldigde straf zijn al zichtbaar; het auditspoor blijft eigenaar-only | ✅ n.v.t. |

**Zeven oppervlakken staan bewust dicht, ook in een open groep.** Dat is geen
halfheid maar de kern van het besluit: "open" betekent dat de groep jouw
tegenslag mag zien, niet dat alles open is. Wie ooit een van die zeven wil
verruimen, komt langs deze tabel en langs de reden.

### 6c. Wat er nog niet af is

Oppervlak 1, 2 en 13 varieren nog niet op de kolom. Zolang dat zo is, ziet een
lid van een **open** groep de gemiste weken van een gekoppeld doel (oppervlak 3)
maar niet de weekstatus in het groepsoverzicht, niet `best_streak` en niet de
historische ketting. Dat is inconsistent en het is de veilige kant van
inconsistent: de kolom opent nergens méér dan hier beschreven staat.

⚠️ **Achterhaald sinds QS8-119 (24-08-2026):** hier stond dat de RLS-suite niet
in CI draaide en dat groen in GitHub dus niets zei over domeinregel 7. Dat is
gerepareerd — de suite draait tegen een lokaal opgebouwd schema, in CI, zonder
secrets. Zie `docs/decisions/005-rls-suite-lokaal.md`.
