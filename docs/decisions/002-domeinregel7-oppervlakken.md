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
| 1 | Groepsoverzicht | `group_overview()`, `app/groep/[id].tsx` | Naam, gekoppeld doel, mijlpaalvoortgang, reeks, of deze periode is afgesloten | De functie geeft de gevaarlijke kolommen niet terug (0016, 0019). Geen puntentotaal, geen `best_streak`, geen `last_cycle_start`, geen weekstatus ⚠️ **Besluit 25-08-2026: `closed_this_period` blijft per persoon zichtbaar, en dat is géén vierde verruiming.** De vraag lag sinds 19-08 open (zie `docs/ENGINEER-REVIEW.md`): De Ketting toont met opzet aantallen zonder namen, en twintig pixels lager staat dezelfde weekstatus per lid mét naam — in een groep van drie is de anonimiteit van die teller daarmee een rekensom die het scherm zelf al oplost. Het blijft zoals het is, om één reden: **een afgerond weekdoel is precies het positieve signaal dat domeinregel 7 de groep wél gunt**, en het weghalen kost product zonder dat er iets beschermd wordt. Wat de constructie binnen de regel houdt is niet de discretie van het scherm maar het venster in de database: buiten de lopende periode geeft `group_overview()` `false` en geeft `chain_links_select` niets, dus een ontbrekend vinkje betekent altijd "nog niet" en nooit "gemist" (0037, getest in `tests/rls/epic8.test.ts` mét een schakel op de oude periode, zodat de test ook rood wordt als het venster wegvalt). ⚠️ **Wat hier níét uit volgt.** Dit is geen argument om De Ketting namen te laten tonen, en geen argument om het venster van acht dagen op te rekken — "de ledenlijst laat het toch al zien" is precies de redenering waarmee een standaard verschuift zonder dat iemand hem verschoven heeft. In een **open** groep vervalt het venster wél, en dat is A41 en niet dit besluit. ⚠️ Sinds 25-08 draagt de rij één toegankelijkheidslabel uit `ledenrijLabel()` in plaats van een kleurbolletje zonder tekst; de afwezigheid blijft daarin stil en er is een test die rood wordt zodra iemand er "nog niet" aan toevoegt |
| 2a | Profielfoto | `profiles.avatar_url`, bucket `avatars` | De foto die je zelf gekozen hebt | ⚠️ **Beoordeeld op 03-09-2026 (QS8-196) en dat is de reden dat deze rij bestaat: de regel is dat élk nieuw groepszichtbaar oppervlak hier langskomt, óók als het antwoord meteen "geen bezwaar" is.** Domeinregel 7 is niet in het geding — uit een portret valt geen gemiste week af te leiden, en de foto is er een die de gebruiker zélf kiest en zelf kan weghalen. Wat het wél is, is een oppervlak: groepsgenoten lezen `avatar_url`. Afgedwongen door de bucketpolicies (0126: schrijven alleen in je eigen map, `auth.uid()` als eerste padsegment), de CHECK `profiles_avatar_url_eigen_pad` (0127 — een extern adres of het pad van een ander wordt geweigerd, anders laadt elk groepslid dat adres), de bucketgrenzen (0126: 2 MB en drie MIME-types) en de tienlimiet per map (0130). Getoetst in `tests/rls/avatarbucket.test.ts`. ⚠️ **Wat hier openstaat is niet privacy maar misbruik:** een foto in een groep met onbekenden is iets anders dan in een groep met drie vrienden. Zodra het ontdekken van groepen bestaat, hoort dit oppervlak rapporteerbaar te zijn — zie het meld- en blokkeerwerk van 0145. ⚠️ `invite_preview()` geeft sinds 0128 géén avatarpad meer mee: een uitnodigingscode verloopt nooit en is bedoeld om doorgestuurd te worden. |
| 2 | Reeksen | `group_visible_streaks` | `current_streak` | View met expliciete kolomlijst, `security_invoker = false` (0005, 0019). `best_streak` eruit: groter dan `current_streak` is sluitend bewijs van een verbroken reeks |
| 2b | Reeksen, tweede pad | `zichtbare_reeksen_van_groep()` | idem oppervlak 2 | ⚠️ **Geen nieuw oppervlak maar een tweede deur naar hetzelfde** (0151, QS8-210). `group_overview()` leest de reeksen sinds 0151 hierlangs en niet meer via de view, omdat de view op `security_barrier` staat en zijn `where` daardoor per rij van de héle `user_streaks` draait — 594 definer-executies bij 310 rijen, 1174 bij 910, en 103 na de wijziging. De maskering is letterlijk die van 0078. **De grendel tegen uiteenlopen is geen gedeelde hulpfunctie maar een test**: `tests/rls/reeksen-van-een-groep.test.ts`, die beide paden op één opstelling naast elkaar legt in béide richtingen, met een open groep, een doel dat aan een open én een beschermde groep hangt, en een inactief geworden eigenaar. Wijkt hij ooit inhoudelijk van de view af, dán is het een nieuw oppervlak en hoort deze rij te splitsen |
| 3 | Weekdoelen van een gekoppeld doel | `weekly_goals_select` | Het plan en wat gelukt is | Policy sluit `status in ('missed','carried','cancelled')` uit voor niet-eigenaars (0019, 0020, en `cancelled` sinds 0045). ⚠️ Elke nieuwe status die "niet gelukt" betekent, hoort hier meteen bij: `cancelled` (zelf afgesloten) is er in 0045 bij gekomen en zonder die regel had die migratie gelekt wat 0020 net had gedicht. ⚠️ **Sinds QS8-260 staan er ook getallen op deze rij, en dat hoort hier opgeschreven te staan.** `floor_days` en `ceiling_days` (0140, besluit A53) liften mee op deze policy, dus een groepsgenoot leest vanaf nu "3 van de 5 dagen" waar hij eerst alleen de teksten zag. **Dat is geen nieuw lek en wel een nieuw feit.** Geen lek, omdat het dezelfde klasse is als `floor_text` naast `achieved_level`: het plan en het bereikte niveau van een week die gelúkt is — de statusfilter houdt `missed`, `carried`, `cancelled` en `excused` er onverkort uit, dus een gemiste week draagt deze getallen niet naar buiten. Een nieuw feit, omdat de precisie toeneemt: "vloer gehaald" was een woord en is nu een getal naast een ander getal. ⚠️ **Wie hier ooit de dágen zelf bij wil zetten — welke dagen afgevinkt zijn — leest eerst oppervlak 27:** `day_checkins` is eigenaar-only, want een rooster met gaten is zeven signalen per week in plaats van één |
| 4 | Voltooiingen | `completions_select` | Alleen wat ingediend is | Er bestaat geen rij voor een week die níet is afgerond |
| 5 | Beoordelingswachtrij | `openstaande_beoordelingen()` | Wat op jouw oordeel wacht | Alleen ingediende voltooiingen; niemand komt erin voor wat hij niet gedaan heeft (0021) |
| 6 | Punten | `points_ledger` | Niets | `user_id = auth.uid()` als enige SELECT-regel. Een dalend totaal is zichtbaar bewijs van een gemiste week (domeinregel 10) |
| 7 | Uitnodigingspagina (zonder account) | `invite_preview()` | Groepsnaam, aantal leden, huddledag, voornamen | Functie met vaste projectie (0019). Met account het volledige beeld |
| 8 | **Groepschat** | `chat_messages`, `groepschat()` | Wat mensen zelf typen | `chat_messages_select` eist lidmaatschap. `chat_messages_insert` verbiedt `type = 'system'`; `stamp_chat_message()` zet groep, afzender, type en tijd vast (0006, 0010) |
| 9 | **Systeemberichten** | `chat_messages.system_event`, `subject_id`, `actor_id`, `payload` | Tien positieve gebeurtenissen | **CHECK `chat_messages_system_event_bekend`** (0025, uitgebreid in 0032, 0070 en 0071). Een nieuw type vraagt een migratie. Geen titels, notities of niveaus in de tekst. ⚠️ **Gewijzigd 21-08-2026 (migratie 0059, QS8-107).** De zin stond uitgeschreven in `body` en werd zo getoond; nu dragen de rijen hun parameters als kolommen en maakt de app de zin, in `src/modules/buddies/systeemberichten.ts`. `body` blijft als noodterugval. **Voor deze regel verandert er niets aan wát de groep ziet** — de zinnen zijn woordelijk gelijk gebleven — maar de regel woont nu op één plek in plaats van verspreid over zeven SQL-functies, mét een test die weigert dat een bekende gebeurtenis op de terugval landt. De persoonskolommen zijn `on delete set null`, zodat een verwijderd account "Een oud-lid" wordt zonder dat er een rij herschreven wordt (oppervlak 18). ⚠️ Een persoon hoort **nooit** in `payload`: een uuid in jsonb heeft geen foreign key en overleeft dus een accountverwijdering ⚠️ **`chain_milestone` is er in 0070 bij gekomen (24-08) en is het enige systeembericht zonder persoonsnaam** — een ketting-mijlpaal is van de groep. De mijlpaal is een rond **cumulatief** aantal schakels (10, 25, 50, …) en bewust geen "voltallig deze periode" of "N perioden op rij": die twee zijn conditioneel, dus het uitblijven van het bericht vertelt de groep dat iemand ontbrak — de afwezigheid wordt dan zelf het signaal. Een cumulatieve teller is monotoon, kent die toestand niet, en rekent bovendien niets uit (correctheidsregel 7). ⚠️ **0075 repareerde een onderbroken keten:** de drempel stond alleen in `body`, en dat is sinds 0059 noodterugval — de app maakt de zin zelf uit `system_event` plus de kolommen. Er was geen catalogussleutel en geen parameter voor een getal, dus de groepschat toonde letterlijk `systeembericht.chain_milestone`. Elk schakeltje was af (`payload` bestond, `groepschat()` gaf hem terug, de CHECK stond goed) en de keten liep nergens door — de variant zonder kapot onderdeel uit onwrikbare regel 18, vraag 5. Het getal gaat nu mee in `payload`; een persoon hoort daar nóóit in. ⚠️ **0071 sloot een gat dat 0070 gevaarlijk maakte:** `chat_messages_insert` verbood wel `type = 'system'` maar zei niets over `system_event`, dus een lid kon een eigen bericht met een systeemgebeurtenis plaatsen. Onschadelijk tot 0070 — de weergave kijkt naar `sender_id` en `type` — maar daarna kon je er elke echte mijlpaalaankondiging mee wegdrukken. Nu twee sloten: de policy laat het niet meer toe, en de telling accepteert alleen rijen die `plaats_systeembericht()` geschreven kan hebben | ⚠️ **Samengevouwen sinds 05-09-2026 (QS8-198), en dat is render-tijd — geen migratie, de CHECK is niet aangeraakt.** Drie of meer gelijksoortige berichten op dezelfde dag worden één regel. Van de drie opties in dat issue is dit de enige die níéts weglaat: dezelfde personen, dezelfde gebeurtenis, minder herhaling. Een oppervlak dat mínder toont kan deze regel niet verruimen, en dát is de reden dat deze kant gekozen is. ⚠️ **De vouw is onvoorwaardelijk, en dat is de hele zorg.** Zou er alleen gevouwen worden als de reeks "compleet" is, dan vertelt het uitblijven van de regel dat er iemand ontbrak en wordt de afwezigheid zelf het signaal — precies de constructie die 0070 vermeed door de ketting-mijlpaal cumulatief te maken. Een reeks van drie vouwt ongeacht wie erin staat; er staat een test op die dezelfde drie berichten met drie mensen en met één persoon vergelijkt. ⚠️ **Niet alles vouwt.** `chain_milestone` draagt een drempel en `season_recap` drie groepstotalen: twee zulke regels zijn verschillende feiten. `milestone_done` en `goal_completed` zijn per persoon een eigen prestatie. Wat vouwt zijn de drie die in reeksen binnenkomen — `member_joined`, `completion_pending` en `completion_approved`. ⚠️ **En die derde vouwt alleen binnen één bevestiger:** die zin noemt twee mensen, dus twee bevestigers in één regel zou een naam laten vallen en daarmee een positief signaal wegnemen. ⚠️ De dagovergang loopt op de klok van de **groep** en niet van de lezer — anders ziet een lid op reis een ander aantal regels dan zijn groepsgenoten thuis.
| 10 | **Weekafsluiting** | `week_reviews`, `weekafsluiting()` | Wat leden zelf schrijven, incl. vraag 2 | De gebruiker schrijft en verstuurt zelf (route 1). Wie niets invult heeft geen rij en staat er niet op |
| 11 | **Reacties op de weekafsluiting** | `week_review_replies` | Wat leden zelf schrijven | Policies via de groep van het ántwoord, niet van de schrijver (0026). Geen UPDATE. ⚠️⚠️ **LEKKEND tot 08-09-2026, GEDICHT in 0206 (QS8-362).** Die eerste zin was de onderbouwing, en ze was onvolledig: de groep van het antwoord stond in `week_reviews.group_id`, en die kolom was door de eigenaar te verzetten. 📏 Gemeten end-to-end met drie echte JWT's: Alice zit in groep A (met Bob) en in B (met Carol), Bob reageert in A, één `PATCH {group_id: B}` en Carol leest Bob zijn tekst — terwijl Bob nooit in B gezeten heeft. Beide helften van `week_reviews_write` blijven waar bij zo'n verhuizing (`user_id = auth.uid() and is_group_member(group_id)`), want Alice ís lid van B: **de policy was hier niet de grens, de kolom was dat.** RLS kan geen kolommen beperken — de tweede vraag uit domeinregel 7 in zijn zuiverste vorm. 0206 pint `group_id`, `user_id` en `group_period_start` met `pin_week_review()`. ⚠️ Géén `revoke` van de kolomgrant, hoewel het issue dat voorstelde: 📏 gemeten dat élke variant daarvan — ook op één losse kolom — het opslaan van een weekafsluiting met 42501 breekt, óók de eerste keer, omdat `bewaarWeekafsluiting()` een upsert is en PostgREST alle body-kolommen in de `set`-lijst zet. |
| 12 | Realtime-abonnementen | `supabase_realtime` | `completions`, `weekly_goals`, `chat_messages` | RLS op INSERT en UPDATE. **Op DELETE níet** — zie §4 |
| 13 | De Ketting | `chain_links` | Opdagen per periode | ⚠️ **GEBOUWD 19-08-2026 (migratie 0036) en daarmee LEKKEND.** De redenering "afwezigheid, geen kruisje" hield zolang de tabel leeg was en houdt niet meer. `chain_links_select` geeft elk lid élke rij, met `user_id` en `group_period_start`; voor een **afgesloten** periode betekent een ontbrekende rij niet "nog niet" maar "die week niets gedaan" — geen weekafsluiting én geen goedgekeurd weekdoel. Eén `GET /rest/v1/chain_links?group_id=eq.X&select=user_id,group_period_start` levert de volledige aanwezigheidsmatrix per persoon per week. Dezelfde klasse als `weekly_goals_select` in EPIC 5. `ketting_stand()` (0036/0037) is wél veilig: aantallen zonder namen, en sinds 0037 voor elk lid hetzelfde getal. Het lek zit in de tabelpolicy en in `group_overview()`, niet in de teller. **GEDICHT dezelfde dag in 0037.** `chain_links_select` is nu `user_id = auth.uid() or (is_group_member(group_id) and group_period_start >= current_date - 8)`: je eigen geschiedenis blijft van jou, van een ander zie je alleen de lopende periode — waarin een ontbrekende schakel "nog niet" betekent en niet "gemist". `group_overview()` geeft `closed_this_period` alleen binnen datzelfde venster en daarbuiten `false`. Historische schakels blijven in de tabel staan (domeinregel 6) maar verlaten de database niet meer per persoon; een historische ketting kan alleen als aantal, via `ketting_stand()`. Vastgelegd in `tests/rls/epic8.test.ts`. **Het scherm** (`app/groep/[id].tsx`, component `Ketting.tsx`) toont hiervan uitsluitend aantallen via `ketting_stand()` — nooit namen, ook niet in het toegankelijkheidslabel. ⚠️ Maar de ledenlijst eronder (`MemberRow`) toont dezelfde weekstatus wél per persoon met naam; in een kleine groep maakt dat de anonimiteit van de teller grotendeels ongedaan. Geen datalek — het is oppervlak 1, bewust genomen in QS8-55 — wel een ontwerpinconsistentie op één scherm. **Beslist op 25-08-2026: zo houden, en geen vierde verruiming.** De onderbouwing staat bij oppervlak 1; wat de constructie binnen de regel houdt is het venster hierboven en niet de discretie van het scherm |
| 14 | **Seizoensrecap** | `season_recaps`, systeembericht `season_recap` | Drie **groepstotalen**: afgeronde weken, gehaalde mijlpalen en schakels — nooit per persoon | ⚠️ **Gebouwd 27-08-2026 (QS8-79, migratie 0112).** Vijfde tabel die van leeg naar gevuld ging, dus de twee vragen horen erbij. **Kan hieruit iemands gemiste week worden afgeleid?** Nee: alle drie de cijfers zijn optellingen over de hele groep en alle drie monotoon. Dezelfde vorm als `ketting_stand()` en de mijlpaalaankondiging uit 0070 — een teller die alleen omhoog gaat, verraadt niemand. **Kan iemand het buiten de UI om uitlezen?** `season_recaps_select` is `is_group_member(group_id)` en er is geen INSERT-, UPDATE- of DELETE-policy; `maak_seizoensrecaps()` is de enige schrijver en is `service_role`-only. ⚠️ **Twee dingen die de recap bewust níét doet.** Er staat géén ranglijst in — die is per definitie ook een lijst van wie onderaan staat — en er komt **géén recap als alle drie de cijfers nul zijn**: "samen 0 weken afgerond" is een tegenslagbericht met een vrolijke kop erop. In een stille groep zwijgt hij, en er komt dan ook geen rij, zodat een groep die later weer actief wordt niet op een bezette sleutel stukloopt. ⚠️ **Mijlpalen tellen op `completed_at` en niet op `target_date`** — dat tweede zou een niet-gehaalde mijlpaal als cijfer in de groepschat zetten. ⚠️ **Varieert niet op `groups.zichtbaarheid`** (A41): het zijn groepstotalen zonder namen, dus er is in een open groep niets extra's te openen. Getest in `tests/rls/seizoensrecap.test.ts` |
| 15 | Notificaties | — | — | Nog niet gebouwd (EPIC 11) |
| 16 | **Deadline-verzoeken** | `deadline_requests`, `app/groep/[id].tsx` | Dat iemand om meer tijd vraagt, met zijn eigen argument | Vier policies; schrijven kan alleen via de RPC's (0032). De gebruiker vraagt het zélf aan — route 1, net als vraag 2 van de weekafsluiting. Q-TODO **A7** |
| 17 | **Ingetrokken goedkeuringen** | `approval_withdrawals` | Niets | `approval_withdrawals_select` laat alleen de intrekker en de eigenaar van de week toe. Er gaat géén systeembericht uit: "de week van X is toch niet bevestigd" is een tegenslagsignaal over een ander (0030). De aankondiging van de goedkeuring wordt juist wéggehaald |
| 18 | **Verwijderde accounts** | `chat_messages.sender_id`, `completion_approvals.approver_id` | "Verwijderd lid" in plaats van een naam | `on delete set null` (0031), plus `stamp_chat_message()` die die ene overgang doorlaat (0033). De rij blijft, de persoon niet |

| 19 | **Weekpassen** | `week_pass_events`, `weekpas_stand()`, `weekpas_standen()` | **Niets** | ⚠️ **GEBOUWD 19-08-2026 (migraties 0039–0042).** Dit is de derde tabel die van leeg naar gevuld ging, dus de vraag hoort erbij: een ontbrekende rij betekent nu "deze gemiste week is niet gered", en dat is per definitie een tegenslagsignaal. Daarom heeft `week_pass_events` **alleen** een SELECT-policy op `user_id = auth.uid()`, zijn alle schrijvers SECURITY DEFINER en `service_role`-only, en staat de tabel **niet** in de realtime-publicatie. `weekpas_stand()` en `weekpas_standen()` dragen hun eigenaarstoets zélf en leunen niet op RLS — een groepsgenoot mág de rijen van een gekoppeld doel lezen, dus een INVOKER-functie zou de voorraad van een ander teruggeven. In 0039 was die toets stuk (`eigenaar <> auth.uid()` gaat zonder sessie niet af, want `null` is geen `false`); gedicht in 0040. **Er komt géén systeembericht bij een verbruikte pas** — dat zou een gemiste week in de groepschat zetten — dus `chat_messages_system_event_bekend` is bewust niet aangeraakt. De componenten `Weekpas` en `DoelStandKaart` hebben geen `viewer`-prop en staan alleen op het privé-dashboard |
| 20 | **Commitments** | `commitments`, `commitment_events`, systeemberichten `commitment_unlocked` en `commitment_due` | Een **beloning** zodra hij vrijgespeeld is, en een **straf** zodra hij verschuldigd is — verder niets | ⚠️ **GEBOUWD 21-08-2026 (migratie 0057).** Vierde tabel die van leeg naar gevuld ging, dus de vraag hoort erbij. Een verschuldigde straf is de **enige benoemde uitzondering** op deze regel (domeinregel 5 en 11): de gebruiker heeft hem zelf ingesteld en bevestigd, en `commitments.confirmed_at` is `NOT NULL` zodat dat een schema-eigenschap is. `commitments_select` geeft de begunstigde groep leesrecht vanaf `unlocked`, `due` en `resolved` — en **daarom wordt een straf op een afgerond doel `cancelled` en niet `resolved`**: die staat niet in de lijst, en een straf die nooit is afgegaan is niemands zaak (besluit 003 §3). De beloning gaat naar élke gekoppelde groep, de straf **alleen** naar de begunstigde groep. ⚠️ **Uitgebreid 06-09-2026 (QS8-228, migratie 0168): de begunstigde van een straf mag ook één persoon zijn.** `commitments_select` heeft daarvoor een derde tak met een éígen statuslijst, `commitment_zichtbaar_voor_persoon()` = `{due, resolved}` — nadrukkelijk zónder `unlocked`, want dat is de beloningskant. Domeinregel 11 verandert dus niet; wat verandert is hoevéél mensen de getuige zijn. Wie je mag aanwijzen is begrensd tot `shares_group_with_user()` (beide kanten actief lid), je kunt jezelf niet aanwijzen, en een straf kan nooit tegelijk een groep en een persoon dragen. Gemeten in de security-ronde van 06-09: de getuige ziet nul rijen bij `set`, `unlocked` en `cancelled`, één bij `due` en `resolved`; een groepsgenoot die géén getuige is ziet niets, `anon` ziet niets, en `commitment_events` blijft eigenaar-only óók voor de getuige. ⚠️ **Wat hier nog níét staat is een oppervlak waar die persoon het tégenkomt** — geen systeembericht, geen melding, geen scherm. Zie de rij van 06-09 in `docs/ENGINEER-REVIEW.md` en QS8-291. Het **auditspoor** (`commitment_events`) is eigenaar-only en gaat nóóit naar de groep: die leest de straf, niet de geschiedenis eromheen. De teksten noemen de persoon en de gebeurtenis en verder niets — geen bedrag, geen doeltitel (§3). Vastgelegd in `tests/rls/epic9.test.ts` |
| 21 | **Adempauzes** | `breathers`, `breathers_select`, `app/doel/[id].tsx` | De hele aankondiging: dát er een pauze is, en van welke cyclus tot welke | ⚠️ **Toegevoegd 25-08-2026 na besluit A50 — en dit oppervlak ontbrák in deze lijst, terwijl het sinds QS8-82 bestond.** Dat is de eigenlijke bevinding: een tabel die de groep leest en die hier niet stond. `breathers_select` is `user_id = auth.uid() or (… shares_group_with_goal(g.id))` en geeft de hele rij. **Dat is geen lek maar route 4 naar de groep**, naast de drie uit `CLAUDE.md`: de gebruiker kondigt zijn pauze **zelf** aan, en dat is het acceptatiecriterium van QS8-82. ⚠️⚠️ **Tot 06-09-2026 stond hier "zelf en vooraf", met de zin "een aankondiging vooraf is iets anders dan een gemiste week achteraf" als hele onderbouwing. QS8-227 haalt "vooraf" weg** — een adempauze mag sinds migratie 0166 over weken liggen die al voorbij zijn. Daarmee is `announced_at` ná `ends_cycle` een afleidbaar signaal: wie zijn pauze aankondigt nádat de week voorbij is, kondigt hem aan omdát die week misging. Gemeten in de security-review van 06-09-2026 met één GET op `/rest/v1/breathers` als gewoon groepslid in een **beschermde** groep. Dit is dus geen lek meer maar een **derde benoemde verruiming**, en die staat met haar onderbouwing in §4a — niet hier als bijzin. ⚠️ **Wat de groep hierdoor níét ziet blijft dicht:** welke weken in die periode gemist zijn, staat in `weekly_goals.status` en dat is sinds 0047 afgeschermd — inclusief `excused`. De groep ziet de pauze, niet de weken. ⚠️ **En dit oppervlak varieert niet op `groups.zichtbaarheid`** (A41): het is de eigen handeling van de gebruiker, dus het staat open in béide standen — net als de weekafsluiting (10) en het deadline-verzoek (16) |
| 22 | **Vertrek uit een groep** | `group_members`, `group_events` (`member_left`, `admin_transferred`), `verlaat_groep()` | Dát iemand er niet meer is — zichtbaar doordat zijn naam uit de ledenlijst verdwijnt. Verder niets | ⚠️ **Toegevoegd 27-08-2026 (QS8-57, migratie 0102).** Er komt **geen systeembericht** in de chat, en dat is een beslissing met twee redenen. Ten eerste zegt domeinregel 7 dat de feed uitsluitend positieve signalen draagt, en een vertrek is er geen. Ten tweede, en dat is de scherpere: `member_inactive` ("iemand is uit de groep gezet") staat in `VERBODEN_GEBEURTENISSEN`. Zou "iemand is zélf vertrokken" er wél in komen, dan wordt **de afwezigheid van het bericht het signaal** — verdwijnt een naam uit de ledenlijst zonder regel in de chat, dan is hij eruit gezet. Dat is exact de constructie die 0070 vermeed door de ketting-mijlpaal cumulatief te maken in plaats van conditioneel. Het spoor staat in `group_events`, leesbaar voor élk lid en schrijfbaar voor niemand, en `archiveer_groep()` maakte in 0092 dezelfde keuze. ⚠️ **Het vertrek sluit een oppervlak dat openstond:** `shares_group_with_goal()` toetste alleen de kíjker en nooit de eigenaar, dus een oud-lid bleef zijn doel, mijlpalen, weekdoelen en voltooiingen aan de verlaten groep uitdelen — in een ópen groep inclusief zijn gemiste weken. Zeven policies lopen langs die functie. Gedicht in 0102, samen met dezelfde route via `inactive` en via een gearchiveerde groep. ⚠️ **En dat was de eerste keer niet genoeg, wat de leerzaamste helft van dit issue is.** `shares_group_with_goal()` werd gerepareerd en de migratiekop verklaarde de drie routes dicht — maar `weekly_goals_select` heeft sinds 0077 een dérde tak, `deelt_open_groep_met_doel()`, die dezelfde vraag zélf beantwoordt met het oude predicaat. In een **open** groep bleef een uitgezet lid daardoor zijn `status = 'missed'` uitdelen, en dat is de gevoeligste kolom van allemaal. Gevonden door de security-review van 27-08, niet door de 446 groene tests: die lazen `goals` en al hun fixtures waren beschermde groepen, dus de open-groepstak kon per constructie nooit rood worden. **Zoek bij een predicaat niet alleen de aanroepers maar ook de functies die het overschrijven**, en toets een tak die alleen in één groepsstand bestaat ook ín die stand |
| 23 | **De Doelcoach-tip per mijlpaal** | `milestone_tips` | **Niets.** De groep ziet deze tip nooit, in geen enkele stand | ⚠️ **Toegevoegd 27-08-2026 (QS8-137, migratie 0103).** De voor de hand liggende plek was een kolom op `milestones` — en dat kan niet: `milestones_select` loopt via `shares_group_with_goal()`, en RLS beslist over rijen en niet over kolommen. Die kolom was met elke mijlpaalrij meegegaan naar elke groepsgenoot van een gekoppeld doel. Woordelijk dezelfde fout die 0050 heeft moeten repareren met `goal_risk`, en de reparatie heeft dezelfde vorm: een eigen tabel, eigenaar-only (`user_id = auth.uid()`), en voor géén enkele client schrijfbaar — alleen de Edge Function schrijft, onder `service_role`. ⚠️ **Ook een positieve tip blijft dicht.** Hij is een afgeleide van wat de coach van jouw voortgang vindt, en de Risico-radar heeft laten zien hoe snel zoiets een uitspraak over je gemiste weken wordt (A17, teruggedraaid in 0050). ⚠️ **En hij is geen route voor tegenslag naar jezelf.** Domeinregel 7 geldt ook voor tekst die alleen jij ziet — daar niet als lek maar als toon. Een zeef in de database weigert een tegenvaller, en die zeef geldt óók voor `service_role`; dat is de enige rol die hier schrijft. Getest in `tests/rls/mijlpaaltip.test.ts` |
| 24 | **De andere groepen van een doel** | `goal_group_links`, `goal_events`, `deadline_requests` | Dát het doel in deze groep staat — en verder niets over de ándere groepen waar het in staat | ⚠️ **Toegevoegd 27-08-2026 (QS8-56).** Dit oppervlak bestond al — het datamodel kan sinds 0001 één doel aan meerdere groepen hangen — maar werd pas een vraag toen de app het ging aanbieden. `goal_group_links_select` is `is_group_member(group_id)`, dus een lid van groep A leest de rij van groep B niet, ook al mag het het doel wél zien. Zonder dat slot zou elke groep met één verzoek de ándere groepen van elk lid kunnen uitlezen. Vastgelegd in `tests/rls/deling.test.ts`, mét de tegentest — "Bob ziet groep B niet" is gratis groen als Bob niets ziet. ⚠️ **Het deadline-verzoek is de gevoelige helft.** Sinds A7 gaat een verzoek naar één groep, en de uitleg die je erbij schrijft is het enige stuk vrije tekst in de app waarin iemand vertelt dat iets niet lukt. Met twee groepen is "de groep" een keuze geworden, en `deadline_requests_select` volgt de gróép (`is_group_member(group_id)`) en niet het dóél — dus de niet-gekozen groep leest niet mee. Stond hij op `shares_group_with_goal()`, de vorm die `goal_events_select` wél heeft, dan las groep A een bekentenis die aan groep B gericht was. Ook `beslis_deadline_verzoek()` toetst lidmaatschap van `r.group_id` en niet van het doel. ⚠️ **`goal_events` is de enige die per dóél kijkt, en dat is afgewogen aanvaard.** Een lid van groep A leest daardoor het `deadline_moved`-event dat groep B goedkeurde, inclusief `approved_by_id` — een opake uuid van iemand die hij niet kent. Aanvaard omdat de CHECK op `goal_events` een allowlist van vier is (`created`, `deadline_moved`, `archived`, `completed`) en géén daarvan tegenslag draagt, en omdat `goals.target_date` toch al zichtbaar is voor elke gekoppelde groep: het event vertelt hóé de datum verschoof, niet dát hij verschoof. **Wordt zwaarder zodra er een vijfde `event_type` bij komt** — wie die allowlist verruimt met iets dat over tegenslag gaat, opent dit oppervlak mee. ✅ **Sinds 06-09-2026 (QS8-176, migratie 0181) bijt die voorwaarde.** `goal_events_bewaking()` wordt rood zodra de allowlist afwijkt van de vier die hier gewogen zijn — in béide richtingen, want een register dat een gebeurtenis noemt die niet meer bestaat, dekt straks stilzwijgend iets anders af. ⚠️ **Wat er al stond was niet genoeg:** `policies.test.ts` legt `DOELGEBEURTENISSEN` uit `schemas.ts` in beide richtingen naast de CHECK, maar dat vangt alleen een lijst die uit de pas loopt. Iemand die een vijfde type netjes aan **allebei** toevoegt — precies wat je doet als je een feature bouwt — bleef daar groen. Gelijkheid bewaken is iets anders dan omvang bewaken. De policy zelf is niet gewijzigd: die is gemeten en aanvaard, en dit is een grendel en geen herziening. ⚠️ **En het scherm koos tot QS8-56 stilzwijgend `groepen[0]`**: elk slot hierboven stond dicht, en de gebruiker had de groep die erdoorheen mocht nooit aangewezen. Zie `docs/decisions/2026-08-27-een-doel-in-meer-dan-een-groep.md` §2 |
| 25 | **Badges** | `badges` | **Niets.** De groep ziet ze nooit, in geen enkele stand | ⚠️ **Toegevoegd 27-08-2026 (QS8-78, migratie 0113).** Zesde tabel die van leeg naar gevuld ging. **Kan hieruit iemands gemiste week worden afgeleid?** Ja, en dat is precies waarom dit oppervlak dicht is: een badgemuur naast een ledenlijst maakt van de **ontbrekende** badge het signaal. Wie na twaalf weken geen `streak_12` heeft, heeft zichtbaar een week gemist — geen afgeleide maar een rekensom die het scherm zelf maakt. `badges_select` is daarom `user_id = auth.uid()` zonder groepstak, dezelfde vorm als `points_ledger` (A42), `week_pass_events` (0039) en `goal_risk` (0050, waar A17 om dezelfde reden is teruggedraaid). ⚠️ **Een badge verdwijnt bovendien nooit**, en dat is dezelfde regel één stap naar binnen: zou hij weggaan als je reeks breekt, dan ís dat verdwijnen de melding dat je een week gemist hebt — in je eigen app, op het moment dat je het het minst kunt gebruiken. Structureel: géén UPDATE- en géén DELETE-policy, ook niet voor `service_role`, en de reeksbadges hangen aan `best_streak` en niet aan `current_streak`. ⚠️ **Varieert niet op `groups.zichtbaarheid`** (A41): er valt in een open groep niets extra's te openen, want er gaat sowieso niets naar buiten. Wie dat wil veranderen, verandert niet een instelling maar het besluit in `docs/decisions/2026-08-27-badges-zijn-prive.md`. ⚠️⚠️ **En de tabel was tot 06-09-2026 niet het hele oppervlak.** `verdien_badges()` mocht door élke ingelogde gebruiker aangeroepen worden voor een wíllekeurig id, en gaf terug hoevéél badges hij toekende. 📏 Gemeten: `bob roept aan voor alice -> 1`, terwijl `bob leest badges van alice -> 0`. De tabel bleef dicht en het getal vertelde het toch — een orakel op precies wat deze rij privé verklaart. Migratie 0165 trekt dat recht in (QS8-287). ⚠️ De les voor élke volgende rij: **een oppervlak is niet alleen een tabel of een view, maar ook wat een functie teruggeeft.** Getest in `tests/rls/badges.test.ts` |
| 26 | **Het weekplan** | `weekly_plan_steps` | **Niets.** De groep ziet een geplande weekstap nooit, in geen enkele stand | ⚠️ **Toegevoegd 31-08-2026 (QS8-203, migratie 0137).** Vier policies, alle vier eigenaar-only via `goals.owner_id`, en met opzet géén tak voor groepsgenoten — dezelfde vorm als `goal_risk` (0050) en `milestone_tips` (0103). ⚠️ **De twee vragen, met het antwoord erbij.** *Kan hieruit iemands gemiste week worden afgeleid?* Ja, indirect: wie ziet dat stap 3 vorige week is geactiveerd en deze week nog steeds de laatste is, weet dat er niets ingeschoven is. *Kan iemand het buiten de UI om uitlezen?* Alleen met een policy die dat toestaat, en die is er niet. ⚠️ **Een geplande stap is geen belofte aan de groep**, en daarom komt er géén nieuw type systeembericht bij: `chat_messages_system_event_bekend` is niet aangeraakt. Pas als een stap een écht weekdoel wordt, gelden de bestaande regels en de bestaande berichten — en dan is het oppervlak 3 en niet dit. ⚠️ **Het inschuiven zelf is ook stil naar buiten toe.** De rollover maakt een `weekly_goals`-rij en verder niets; de enige die het te horen krijgt is de eigenaar, op zijn eigen hoofdscherm. Getest in `tests/rls/weekplan.test.ts` |
| 27 | **Dagafvinkingen** | `day_checkins` | **Niets.** De groep ziet nooit welke dagen iemand wel of niet afvinkte, in geen enkele stand | ⚠️ **Toegevoegd 01-09-2026 (QS8-253, besluit A53, migratie 0140).** Drie policies — select, insert, delete — alle drie eigenaar-only via `goals.owner_id`, en met opzet géén tak voor groepsgenoten. Dezelfde vorm als `goal_risk` (0050), `milestone_tips` (0103) en `weekly_plan_steps` (0138). ⚠️ **Hier wordt domeinregel 7 strénger en niet losser, en dat is de kern van deze rij.** Een gemiste week is één signaal; een rooster met gaten is er zeven, en daaruit lees je iemands week dag voor dag af. Een dagelijkse afvinking is dus fijnmaziger tegenslag dan alles wat er tot nu toe in deze lijst staat. ⚠️ **Er is geen UPDATE-recht**, en dat is geen omissie: een afvinking heeft geen veld om bij te stellen, maar wél een `local_date` die je zou kunnen verzetten. Dat is de backdating die `afvinking_binnen_de_cyclus()` net dichtzet, en een UPDATE-policy zou hem via de voordeur weer openen. ⚠️ **Wat de groep wél blijft zien is onveranderd:** het weekdoel (oppervlak 3) en de voltooiing zodra die is ingediend (oppervlak 4). Het bereikte niveau komt sinds 0140 uit de dagen in plaats van uit het formulier — de gróép ziet dus hetzelfde als altijd, alleen is het nu moeilijker te overdrijven. Getest in `tests/rls/ritme.test.ts` |
| 28 | **Het puntenklassement** | `groep_klassement()`, `groep_teller()`, `app/groep/[id].tsx` | In een **open** groep: per lid een naam, een totaal en een plek. In een **beschermde** groep: niets — alleen de optelteller zonder namen | ⚠️ **Toegevoegd 01-09-2026 (QS8-254, besluit A54, migratie 0141), en dit is de eerste rij die een besluit terúgdraait.** Punten stonden sinds A42 in §6b als bewust dicht, óók in een open groep. **Kan hieruit iemands gemiste week worden afgeleid?** Nee, en dat is een eigenschap van het cijfer en niet van het scherm: het klassement toont het **groepstotaal** (`points_ledger.group_id = deze groep`), en `cycle_missed` wordt door de rollover zónder `group_id` geboekt — een gemiste week is niet aan één groep toe te rekenen. Een laag getal betekent "hier weinig verdiend", niet "hier weken gemist". ⚠️ **Die eigenschap was een toevalligheid en is nu een grendel:** `points_ledger_gemist_is_niet_van_een_groep`. Wie die CHECK weghaalt, verandert dit oppervlak in een tegenslagmeter — en tot 0141 zou geen enkele test daar rood van worden. ⚠️ **Kan iemand het buiten de UI om uitlezen?** Nee: `groep_klassement()` is SECURITY DEFINER met `lid_van_open_groep()`, dus een beschermde groep krijgt nul rijen ook bij een rechtstreeks verzoek aan PostgREST. DEFINER is hier geen gemak maar noodzaak — `points_ledger_select` is `user_id = auth.uid()`, dus een INVOKER-functie zou een klassement van één persoon opleveren. ⚠️ **Er is geen delta en geen datum**, en dat staat in de handtekening en niet in een component: de kolommen bestaan niet. ⚠️ **Wat er wél afleidbaar werd:** een ingetrokken goedkeuring (oppervlak 17) laat het totaal dalen. Aanvaard — het venster is vijftien minuten en dezelfde functie verwíjdert de aankondiging uit de chat, wat een luider signaal is dan een getal dat terugveert. ⚠️ **De teller (`groep_teller()`) staat in béide standen open** en telt zoals `seizoensrecap_cijfers()` telt: één telwijze, anders geeft dezelfde groep twee getallen. Getest in `tests/rls/klassement.test.ts` |
| 29 | **De zoeklijst** | `ontdek_groepen()`, `group_join_requests`, `app/groep/ontdek.tsx` | Aan een **vreemde**: naam, categorie, omschrijving, voertaal, huddledag en ledental. Aan de groep zelf: één systeembericht dat hij vindbaar is geworden | ⚠️ **Toegevoegd 01-09-2026 (QS8-231, migratie 0144), en dit is het eerste oppervlak dat iemand van búiten de groep bedient.** Alle 28 rijen hierboven gaan over wat een *lid* ziet; deze gaat over wat een onbekende ziet, en dat maakt de twee vragen scherper in plaats van anders. **Kan hieruit iemands gemiste week worden afgeleid?** Nee, en dat is geen keuze van het scherm maar van de handtekening: `ontdek_groepen()` is SECURITY DEFINER met een **expliciete kolomlijst** en geeft niets per persoon terug. Er staat geen enkele naam in, geen reeks, geen activiteit en geen "deze groep is stil" — dat laatste was de verleidelijke, want het helpt de zoeker en het is een uitspraak over drie mensen die er niets over te zeggen hebben gehad. **Kan iemand het buiten de UI om uitlezen?** Nee: `groups_select` blijft `is_group_member(id)` en is niet aangeraakt, dus het gevonden groeps-id is geen sleutel — een vreemde leest er geen leden, doelen, chat, reeksen of `invite_code` mee. Dat is precies waarom hier een DEFINER-functie staat en geen extra tak in de policy: **RLS kan geen kolommen beperken**, dus een policy die "iedereen mag een ontdekbare groep lezen" zegt, geeft de héle rij weg. ⚠️ **Een vindbare groep is altijd beschermd, als CHECK** (`groups_ontdekbaar_is_beschermd`). Zou een **open** groep vindbaar kunnen zijn, dan zien onbekenden elkaars tegenslag zodra ze binnen zijn, en dan is besluit A41 geen verruiming meer maar een afschaffing via een omweg. De CHECK werkt in beide richtingen. ⚠️ **`ontdekbaar` is een toestemming en geen instelling:** geen kolomgrant, `guard_group_update()` zet hem terug, en de enige route is `zet_groepsontdekbaarheid()` — actieve beheerder, expliciet bevestigd, een rij in `group_events` en een systeembericht. Niemand mag er achteraf achter komen dat zijn groep vindbaar is geworden. ⚠️ **Een aanvraag krijgt géén systeembericht en een afwijzing al helemaal niet.** "X wilde erbij en mocht niet" is een uitspraak over een ander die niets positiefs draagt; het spoor staat in `group_events`. Zelfs binnen de groep is de aanvraag beperkt: `group_join_requests_select` noemt de aanvrager en de beheerder, en een gewoon lid ziet niet wie er heeft aangeklopt. Getest in `tests/rls/ontdekken.test.ts` — per kolom, niet beredeneerd |
| 30 | **Meldingen en blokkades** | `reports`, `user_blocks`, `app/groep/leden/[id].tsx` | **Niets.** De groep ziet geen melding, geen blokkade en geen uitzetting — in geen enkele stand | ⚠️ **Toegevoegd 01-09-2026 (QS8-232, migratie 0145), en dit is het eerste oppervlak dat de regel de ándere kant op moet dragen.** Alle rijen hierboven gaan over wat er te veel gedeeld wordt; hier is de vraag wat er te weinig verborgen blijft. **Kan hieruit iemands gemiste week worden afgeleid?** Nee — er staat niets over weken in. Maar de eigenlijke vraag is een zwaardere: **kan de gemelde persoon merken dat hij gemeld is?** Dat is dezelfde soort schade als domeinregel 7 voorkomt, en in een groep van drie zelfs erger: wie weet dát hij gemeld is, weet ook dóór wie. `reports_select` noemt daarom de melder en de beheerder van de groep, **en sluit de gemelde met zoveel woorden uit** (`subject_id <> auth.uid()`) — ook als die beheerder is. Zonder die derde voorwaarde leest een beheerder die zelf gemeld wordt zijn eigen melding, en dat is precies het geval waarin het gevaarlijk is. Een melding over een beheerder is dan alleen voor de melder en voor Quinten zichtbaar, en dat is de juiste uitkomst en geen gat. ⚠️ **`user_blocks_select` noemt alleen de blokkeerder.** Niet `or blocked_id = auth.uid()`: dat leest als symmetrie en is een mededeling. De blokkade wérkt wel twee kanten op (`blokkade_met_groep()`), maar hij is voor één kant zichtbaar. ⚠️ **Er komt geen systeembericht en geen `group_events`-rij van een melding.** Het spoor van een melding is de melding zelf. Een uitzetting krijgt wél een `group_events`-rij — leden mogen weten dat de samenstelling veranderd is — maar géén systeembericht: "X is uit de groep gezet" is een uitspraak over een ander die niets positiefs draagt, en waar de uitgezette niet meer op kan reageren omdat hij de chat niet meer kan openen. ⚠️ **De audit hangt aan een trigger en niet aan de RPC**, want een beheerder kan sinds 0029 met één kaal verzoek `status = 'inactive'` zetten. Getest in `tests/rls/veiligheid.test.ts` |
| 31 | **De straf bij een uitstelverzoek** | `straffen_bij_uitstelverzoek()`, `app/groep/[id].tsx`, `app/doel/[id].tsx` | Aan de groep die om uitstel gevráágd is: **dát** er een straf op dat doel staat. Niet de tekst, niet de foto, niet de getuige en niet de stand. Aan elke andere groep: niets | ⚠️ **Toegevoegd 09-09-2026 (QS8-370, migratie 0218), en dit is een verruiming die Quinten zelf besloten heeft: *"Iedereen van de groep mag de straf zien"*.** De aanleiding is een gat en geen wens. `zet_streefdatum()` weigert sinds 0184 een straf op `set` vooruit te schuiven; `beslis_deadline_verzoek()` doet dat met opzet niet, want 0184 wijst de groepsroute zelf aan als de weg die openblijft. 📏 Gemeten: het lid dat goedkeurt zag de straf niet — nul rijen bij `set`, voor allebei de vormen. Het akkoord was dus blind, en dáármee werd een commitment device stilzwijgend losser gemaakt: de spiegelzijde van domeinregel 5. ⚠️⚠️ **Dit is géén policy en dat is de kern van deze rij.** De eerste versie zette een vierde tak op `commitments_select`. 📏 De security-ronde van 09-09-2026 mat drie dingen na en alle drie zijn ze zelf geverifieerd: (1) een lid van de gevraagde groep las met één `select *` de `body`, de `image_url` én het id van de aangewezen getuige, terwijl het scherm er één zin van toont — **RLS kan geen kolommen beperken**; (2) datzelfde lid las de straf op stand **`due`**, en `due` betekent letterlijk *deze persoon heeft zijn streefdatum niet gehaald* — tegenslag over een derde, in een beschermde groep, buiten de drie routes om, en zónder dat de eigenaar er nog iets voor doet; (3) na `delete from goal_group_links` las hij het dóél niet meer (= 0) en de straf nog wél (= 1). ⚠️ **De eerste versie van deze rij beweerde het tegendeel van (2)** — *"de tegenslagkant is `due`, en die was voor de begunstigde al zichtbaar"*. Dat klopt voor rij 20 en niet voor dit publiek: de gevraagde groep is meestal niet de begunstigde. Wie deze rij als precedent gebruikt, leze dus de zin die er nú staat. ⚠️ **De reparatie is de vorm die dit project al had:** `straffen_bij_uitstelverzoek()` is een `security definer`-RPC met één kolom, precies zoals `getuigenissen()` (0169) voor de persoonlijke getuige. `commitments_select` is niet aangeraakt. **Kan hieruit iemands gemiste week worden afgeleid?** Nee, en dat is een eigenschap van wat de functie teruggeeft en niet van een `where`-regel: de uitkomst verandert níet als een straf van `set` naar `due` gaat — dat doel stond er al in. **Kan iemand het buiten de UI om uitlezen?** Alleen wie er recht op heeft; de functie toetst lidmaatschap via `mag_groep_lezen()` en de koppeling via `goal_group_links`. ⚠️ **Het oppervlak heeft randen**, en die zijn stuk voor stuk getoetst: een **ingetrokken verzoek** telt niet (daar heeft niemand iets toegestaan), een **ingetrokken straf** ook niet (er schuift dan niets, en de zin op het scherm zou onwaar zijn), **ontkoppelen** trekt de toestemming in, en de bit leeft nooit langer dan het **doel** waar hij over gaat — `shares_group_with_goal()` draagt daar dezelfde grens als de rest van de leeskant, dus een gearchiveerde groep en een eigenaar die geen lid meer is sluiten hem allebei. Wat er níet ophoudt is de beslissing zelf: ook na `approved` of `rejected` blijft het zichtbaar, anders raakt de beslisser het zicht kwijt op wat hij heeft toegestaan (domeinregel 5). ⚠️⚠️ **En ontkoppelen sluit óók de knop en niet alleen de waarschuwing**, want anders is die rand erger dan geen rand. 📏 Gemeten in de tweede security-ronde: de aanvrager verstuurde het verzoek, drukte daarna op "Niet meer delen met deze groep", en de beslisser zag géén waarschuwing meer — niet "onbekend" maar niets — en verschoof de datum met één klik. Een trigger op `goal_group_links` trekt een openstaand verzoek nu in. Dat is de reparatiekant en niet een toets in `beslis_deadline_verzoek()`: die zou het verzoek `open` laten staan terwijl niemand het meer kan beslissen, en sinds 0174 houdt een open verzoek de straf tegen — precies het onbeslisbare schild dat QS8-309/0175 heeft moeten repareren. ⚠️ **En de eigenaar weet het vooraf**, want anders is dit een consequentie die stilzwijgend aan gaat: het aanvraagscherm zegt vóór de verzendknop dat de groep dit gaat weten, **en dat de tekst van de straf niet meegaat** (`deadline.straf_wordt_zichtbaar`). Dit is dus route 3 uit domeinregel 7 — via de gebruiker zelf — en niet een vierde. ⚠️ **Alleen `type = 'penalty'` en alles behalve `cancelled`**: `wordtZichtbaarBijUitstelverzoek()` in de client draagt exact dezelfde grens, want een waarschuwing die smaller of ruimer is dan het oppervlak is geen waarschuwing. ⚠️⚠️ **En de retourvorm is zélf de belofte, met een eigen grendel.** 📏 De tweede security-ronde legde `body`, `image_url`, `status` en `beneficiary_user_id` bij de uitvoer en alle 1378 RLS-tests bleven groen: de zin *"deze functie geeft één kolom"* stond in drie documenten en in geen enkele test. `pg_get_function_result()` staat nu onder test, plus de kolomsleutels zoals PostgREST ze teruggeeft. Getest in `tests/rls/uitstelbeslisser-ziet-de-straf.test.ts` (twaalf grendels, elk apart met de hand rood gemaakt) en `tests/beloftes/uitstelbeslisser-krijgt-het-te-zien.test.ts` (zes) |
| 32 | **Een foto in de groepschat** | `chatfotos`-bucket, `chat_messages.attachment_url`, `groepschat()`, `app/groep/chat/[id].tsx` | Aan een groepslid: de foto die een ander lid in **deze** groep plaatste. Aan elke andere groep, ook een die een lid met je deelt: niets | ⚠️ **Toegevoegd 09-09-2026 (QS8-71, migraties 0221/0222/0223).** Dit oppervlak is niet nieuw in de zin dat de groep iets nieuws over een pérsoon te zien krijgt — het is wat iemand zelf plaatst, net als rij 8 — maar het is het eerste dat een **tweede opslagsysteem** in het spel brengt, en daar zit het risico. **Kan hieruit iemands gemiste week worden afgeleid?** Nee: een foto is wat de plaatser kiest te laten zien, en niets in dit oppervlak varieert op status, reeks of week. **Kan iemand het buiten de UI om uitlezen?** Dat is hier de scherpe vraag, want een storage-object heeft een URL die de RLS van `chat_messages` **niet** kent — het object en de rij zijn twee onafhankelijk geautoriseerde dingen die de app als één ding toont. ⚠️⚠️ **Daarom draagt het pad de groep en niet de gebruiker.** 📏 Gemeten met Alice in groep A én B, Bob alleen in A, Carol alleen in B: met de vorm van `avatars` (`<user_id>/…`, lezend op `shares_group_with_user()`) is dat predicaat wáár voor Carol — zij deelt groep B met Alice — en las zij dus de foto uit **groep A**. Dat is oppervlak 24 in een nieuwe verpakking. Het pad is `<group_id>/<sender_id>/<naam>.<ext>`; het eerste segment draagt de leesgrens, het tweede de schrijfgrens. ⚠️ **De kolomgrens is een CHECK en geen policy** (`chat_messages_attachment_eigen_pad`), want `authenticated` heeft sinds 0059 een INSERT-kolomgrant op `attachment_url` en **RLS kan geen kolommen beperken**. Zonder die CHECK zet een lid met één PostgREST-verzoek het pad van een ándere groep of een extern adres in dat veld, en dan laadt elk groepslid dat adres uit zijn eigen `<Image>`. Het is een **vormtoets en geen prefixtoets**, en dat is de derde keer: 0127 deed dit met een `like` voor `avatar_url` en 0129 moest erbovenop omdat `<mij>/../<ander>/a.png` erdoorheen liep. 📏 Zeven gevallen gemeten, zes geweigerd (ander lid, andere groep, extern adres, padtraversal, `.svg`, en een tweede URL achter een regeleinde) en één toegelaten. ⚠️ **`mag_groep_lezen()` leest en `is_group_member()` schrijft**, want `archiefleesgat()` (0153) scant óók `schemaname = 'storage'`: een archief is leesbaar en niet beschrijfbaar. ⚠️ **De ondertekende URL blijft een tweede pad en dat is aanvaard**, niet opgelost: eenmaal getekend werkt hij een uur voor iedereen die hem heeft. Dat is dezelfde klasse als een schermafdruk; de rem is de geldigheidsduur. Wat wél dicht is: een niet-lid kan er zelf nooit een tekenen. ⚠️ **Bij accountverwijdering gaat de foto weg en blijft het gesprek** — anders dan bij een bewijsfoto (QS8-391), die blijft omdat hij bewijs is vóór iemand anders. 📏 Dat was bovendien een 23514 en geen ontwerp: het `on delete set null` van 0031 maakt `sender_id` leeg en de CHECK van 0222 eist er een, dus accountverwijdering brak op een fotobericht. Derde keer dat een CHECK op deze tabel een referentiële actie blokkeert. Getest in `tests/rls/chatfotobucket.test.ts` (twintig gevallen, vier grendels apart met de hand rood gemaakt) en `tests/rls/een-foto-verlaat-zijn-groep-niet.test.ts` (vier routes, elk met een must-allow en een must-deny) |

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

### 3a. En de persoon staat er sinds 0213 als verwijzing, niet als tekst (QS8-372)

De regel hierboven — *een bericht meldt de persoon en de gebeurtenis* — blijft
staan. Wat verandert is **hoe** de persoon erin zit.

⚠️⚠️ Tot 0213 bakten acht functies de weergavenaam als **platte tekst** in
`chat_messages.body`, op het moment van plaatsen. Het scherm was netjes: sinds
0059 rendert `systeemberichtTekst()` uit de catalogus met `naam(subject_name)`, en
na een accountverwijdering is `subject_name` `null` — dus daar staat "Een oud-lid".

📏 De database niet. `groepschat()` geeft `body` terug, `authenticated` heeft
kolom-SELECT op `body`, en één verzoek volstond:

```
supabase.from('chat_messages').select('body').eq('group_id', …)
→ "Alice heeft een doel afgerond."
```

De naam die volgens het scherm gewist was, stond er nog. **Dit is de tweede vraag
uit domeinregel 7 in het klein:** kan iemand dat met één API-verzoek uitlezen
buiten de UI om? De les van EPIC 5, opnieuw.

**Sinds 0213 draagt de body geen naam meer.** Er staat een neutrale terugvalzin
("Een lid doet mee."); de persoon zit in `subject_id` en `actor_id`, en die zijn
foreign keys die bij een accountverwijdering op `null` gaan. Het scherm joint de
naam vers en toont hem zolang de persoon bestaat — 📏 nagemeten dat
`groepschat().subject_name` gewoon "Alice" teruggeeft zolang ze er is.

⚠️ **Waarom niet de leesroute dichtzetten.** Dat sluit maar één deur:
`groepschat()` de body laten inhouden laat een kale `select body from
chat_messages` open staan. En die tweede deur is niet met een kolomgrant te
sluiten zonder de autorisatie te verbouwen — 📏 `groepschat()` is
`SECURITY INVOKER` en leunt op `chat_messages_select` voor het lidmaatschap, dus
`authenticated` het SELECT-recht op `body` afnemen breekt de functie zelf. Er
`SECURITY DEFINER` van maken zou de lidmaatschapstoets met de hand in de functie
leggen, en dat is precies waar QS8-181 al over gaat.

De naam uit de body halen sluit ze allebei, plus elke route die morgen bedacht
wordt — en het is een echte wissing in plaats van een afscherming.

⚠️ **Dit raakt de onveranderlijkheid uit §3 hierboven niet.** Die gaat over wát er
gebeurd is: wie, wat, wanneer. `system_event`, `subject_id`, `actor_id`, `payload`
en `created_at` blijven ongemoeid. Wat herschreven wordt is de **terugvalzin**, en
die is machinaal gemaakt en wordt in het normale pad niet eens getoond. Er worden
niemands woorden herschreven.

⚠️⚠️ **De naad die dit blootlegde, en die had niets met privacy te maken.**
`trek_goedkeuring_in()` zocht het bericht van een ingetrokken bevestiging terug met
`m.body = tekst` — het bouwde de zin opnieuw op uit twee weergavenamen. **De zin
wás de sleutel.** Zonder naam dragen twee bevestigingen van dezelfde beoordelaar
voor dezelfde persoon in dezelfde groep exact dezelfde tekst.

📏 Nagespeeld met precies dat geval: met de oude sleutel bleven er na het intrekken
**2** berichten staan — `treffers` telt er twee, de `if` slaat over, en er blijft
een bericht staan dat zegt dat een week bevestigd is terwijl de bevestiging is
ingetrokken. Het bericht draagt daarom nu zijn `completion_id` in `payload`, en
daar wordt op gezocht: **1** over, en dat is de andere voltooiing.

Dat is onwrikbare regel 18 vraag 6 — *tilt dit een aanname van "er is er altijd
precies één" naar "er kunnen er meer zijn"?* — en het antwoord was ja.

⚠️⚠️ **En de eerste reparatie was zelf te grof, wat de security-ronde op deze
branch heeft gemeten.** De zin codeerde **twee** dingen: de voltooiing én de
beoordelaar, want zijn naam stond erin. `completion_id` codeert alleen het eerste,
en `completion_approvals_one_vote` is `unique (completion_id, approver_id)` — bij
een drempel boven één bevestigen dus meerdere mensen dezelfde voltooiing, en
`meld_goedkeuring()` plaatst per bevestiging een bericht.

📏 Twee gevallen nagespeeld, allebei correct vóór 0213 en allebei stuk met alleen
`completion_id`:

| Geval | Zonder `actor_id` | Met `actor_id` |
|---|---|---|
| Alice trekt in nadat Carol de drempel haalde | Alice wist **Carols** bericht, terwijl Carols bevestiging geldig blijft — en dit draait `security definer`, dus langs `chat_messages_delete` heen | Carols bericht blijft staan |
| Drie beoordelaars, twee trekken in | **2** berichten blijven staan die zeggen dat de week bevestigd is, terwijl hij op `pending` staat | 1 blijft staan, en die is waar |

De sleutel is dus het **paar**: `payload->>'completion_id'` én `actor_id`. Precies
de onderscheidende kracht die de zin had, zonder de zin terug te halen.

**De les is niet "completion_id was een slechte keuze".** Het is dat een sleutel
vervangen betekent dat je nagaat wát de oude codeerde — en een zin met twee namen
erin codeerde twee dingen, ook al zag hij eruit als één.

⚠️ Een voltooiing is geen persoon, dus die mag in `payload`. De regel uit 0059 is
dat er nóóit een **persoon** in gaat: een uuid in jsonb heeft geen foreign key en
overleeft dus een accountverwijdering. Een `completion_id` cascadeert juist mee.

⚠️ **Wat het issue niet zag:** het noemde vijf functies; 📏 een scan over
`pg_proc.prosrc` gaf er acht. Een lijst in een issue is geen dekking.

⚠️⚠️ **Maar een scan op `weergavenaam(` was dat evenmin**, en dat is de tweede
correctie uit de security-ronde. 📏 Twee mutaties kwamen er ongemerkt langs: een
eigen `select display_name into v_naam from profiles` gevolgd door concatenatie,
en `weergavenaam (x)` met een spatie voor het haakje. En erger: `weergavenaam()`
heeft sinds 0213 **nul** aanroepers, dus de volgende schrijver grijpt er sowieso
niet naar — een scan op een dode functie bewaakt niets. Regel 18 vraag 2: dat
toetste het ónderdeel (welke helper), niet de belofte (geen naam in een body).

📏 Een scan op de **vorm** helpt hier ook niet: "een plaatser stelt zijn tekst niet
samen" vlagt elf functies, want `||` bouwt net zo goed een jsonb-foutenlijst
(`maak_seizoensrecaps`) of een getal (`meld_ketting_mijlpaal`). Elf uitzonderingen
is een lijst, geen grendel.

**Wat er nu staat is een gedragstoets:** lok vijf gebeurtenissen uit met één
zeldzame naam in de groep en kijk of die naam in een body opduikt. Hoe hij er zou
komen doet niet ter zake. 📏 Geijkt met precies de mutatie die de scan miste — een
eigen `select display_name` in `meld_mijlpaal()`, een gebeurtenis die de
routetests niet voeren — en die wordt nu rood. De drie gebeurtenissen die deze
toets niet uitlokt (`commitment_due`, `commitment_unlocked`, `deadline_requested`)
staan als rij in `docs/ENGINEER-REVIEW.md`.

---

## 4. Wat vandaag nog lekt

Eerlijk opgeschreven, met de deadline erbij.

| Wat | Waar | Vandaag misbruikbaar? | Deadline |
|---|---|---|---|
| Afwezigheid van een weekdoel in een cyclus | `weekly_goals_select` | Zwak: misschien had die persoon niets gepland | Bewust geaccepteerd (0020) |
| `milestones.status = 'dropped'` | `milestones_select` geeft de hele rij | Ja | Hangt aan A7 en is daarmee dezelfde keuze: de groep mag zien dat je van koers verandert |
| `REPLICA IDENTITY FULL` op een realtime-tabel | Geen technische rem: `publish` is een optie van de publicatie | Nee, staat op `default` | **Nu getest** — `realtime_bewaking()` en de test in `tests/rls/epic7.test.ts`. Was Q-TODO **A20** |

### 4a. De uitzonderingen die Quinten bewust heeft toegestaan (18-08-2026, aangevuld 06-09-2026)

Deze stonden hierboven als lek. Ze zijn geen lek meer maar een besluit, en dat
verschil hoort opgeschreven te staan — anders repareert een volgende sessie ze
alsnog.

| Wat | Besluit | Waarom het te verdedigen is |
|---|---|---|
| `goals.risk_status` en `risk_reason` | ⚠️ **A17 — herbevestigd op 20-08-2026, en teruggedraaid: de groep ziet het NIET** | Het oorspronkelijke besluit (18-08) was "ja", mét de aantekening "herbevestigen vóór EPIC 12", juist omdat de radar `behind` en `unreachable` afleidt uit gemiste weken. Bij het bouwen van EPIC 12 is die herbevestiging gevraagd en het antwoord was dicht. **Er zijn dus nog twee verruimingen, niet drie.** Uitgevoerd in migratie 0050: de drie kolommen zijn verhuisd naar een eigen tabel `goal_risk` met eigenaar-only RLS, want een kolomgrant geldt per rol (de eigenaar zou zijn eigen stand kwijtraken) en `goals_select` eigenaar-only maken breekt `group_overview()`. Een eigen tabel maakt de bescherming structureel in plaats van een policy die je goed moet onthouden. Het acceptatiecriterium van QS8-94 zei trouwens al hetzelfde: "uitsluitend zichtbaar voor de eigenaar" |
| `goal_events` met `deadline_moved` | **A7 — ja, en sterker: verschuiven vraagt akkoord** | Dit draait de regel niet om maar zet hem op zijn kop, in de goede richting. De verschuiving is niet iets dat de groep achteraf ziet, maar iets dat de gebruiker zélf aanvraagt met een argument. Dat is dezelfde route als vraag 2 van de weekafsluiting: tegenslag bereikt de groep via de persoon, niet via een afgeleide. Migratie 0032 |
| `current_streak` die naar nul valt | **A15 — ja** | Blijft in `group_visible_streaks`. Zwak signaal: een reeks van nul is dubbelzinnig (nieuw lid, pauze, of gemist), en `best_streak` — dat het wél sluitend zou maken — is er in 0019 uitgehaald |
| Een adempauze die je **achteraf** aankondigt (`breathers.announced_at` ná `ends_cycle`) | **QS8-227 — ja, 30-08-2026** | Dit is de derde, en hij is er op 06-09-2026 bij geschreven omdat hij anders als bijvangst was meegelift. Quinten heeft besloten dat een adempauze over al verstreken weken mag, én dat die "net zo zichtbaar wordt aangekondigd als een vooruit geplande" — dat staat woordelijk in het issue, met het tegenadvies erbij. Wat hij daarmee opgeeft: rij 21 verdedigde de zichtbaarheid van `breathers` met "vooraf is iets anders dan achteraf", en die zin gaat niet meer op. Een groepsgenoot kan uit een terugwerkende aankondiging afleiden dát je die week gemist hebt. **Waarom het te verdedigen is:** de aankondiging is de énige rem die dit besluit overlaat — de reeks en het minpunt worden vrijwillig (zie `2026-09-06-de-adempauze-wordt-vrij.md`), en zonder die zichtbaarheid is er geen enkele. En de route is dezelfde als bij A7: de gebruiker doet het zélf, met een knop, en de app zegt er in `adempauze.groep_ziet` bij wat de groep ziet. **Wat het níét is:** de statuskolom per week blijft dicht (0047, `excused` incluis), dus dit is een afleiding uit één rij en niet een lijst van gemiste weken |

⚠️ **Het zijn er sinds 06-09-2026 drie.** A17 is op 20-08-2026 herbevestigd en
teruggedraaid — zie de rij hierboven — en dat maakte er twee: A15 (de groep ziet
je reeks) en A7 (de groep ziet je deadline-verschuiving, en die vraag je zelf
aan). QS8-227 zet er een derde bij: de groep ziet ook een adempauze die je
áchteraf aankondigt.

⚠️ **En die derde is de reden om deze paragraaf te lezen vóór je een besluit
neemt dat op een bestaande handeling leunt.** De verruiming stond niet in het
issue als verruiming; ze volgde uit het weghalen van een lengtegrens. `CLAUDE.md`
zegt het bij regel 19: *vraag bij elke nieuwe beslissing die op een bestaande
primitieve handeling leunt of daar een weggelegde bevinding over staat.* Hier
stond er een — de zin "vooraf is iets anders dan achteraf" in rij 21 — en die is
pas in de security-review van 06-09 teruggevonden, niet bij het besluit.

⚠️⚠️ **Deze paragraaf is op 06-09-2026 één keer stil verdwenen, en dat hoort hier
te staan.** Commit `da744f2` werkte oppervlak 25 bij vanaf een basis van vóór
QS8-227 en nam daarmee de derde uitzondering, de §4a-kop, rij 21 en de
A41-aantekening mee — zonder één woord erover in het commitbericht. Gevonden in
de security-ronde op QS8-228; `docs:controle` en `review:controle` waren allebei
groen, want die toetsen tegenspraken met getallen en de "wordt zwaarder als"-zin,
niet óf een besluitrij nog bestaat. **Een besluit dat uit dit document valt, is
erger dan een besluit dat er nooit in stond:** de policy deelt het recht nog
steeds uit, en de volgende lezer ziet een regel die strenger is dan de
werkelijkheid.

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
| 1 | Groepsoverzicht | `group_overview()` geeft ook `last_cycle_start` en `best_streak` door. ⚠️ **De weekstatus is er bewust níét bij gekomen**: die is per lid per cyclus, en een lid kan sinds 0074 meerdere weekdoelen in één cyclus hebben — dat is een berekening en die hoort niet in SQL (correctheidsregel 7). `closed_this_period` houdt zijn venster van acht dagen; dat hoort bij De Ketting en gaat mee met QS8-135 | ✅ **0078** |
| 2 | Reeksen | `best_streak` en `last_cycle_start` in `group_visible_streaks`, als `case`-expressie: gevuld voor de eigenaar zelf en voor een lid van een open groep, `null` daarbuiten. ⚠️ **De belofte is van vorm veranderd en dat is een verzwakking die je moet weten**: hier stond "de kolom bestáát niet", en een kolom die er niet is kan niet lekken. Nu staat er "de kolom is leeg", en dat hangt van een `case` af. De afweging tegen een tweede view en tegen een functie staat in de kop van 0078. ⚠️ `total_points` staat op dezelfde tabel en blijft eruit (A42) | ✅ **0078** |
| 3 | **Weekdoelen van een gekoppeld doel** | De statusfilter `missed/carried/cancelled/excused` vervalt voor een lid van een open groep | ✅ **0077** |
| 4 | Voltooiingen | Niets. Er bestaat geen rij voor een week die niet is afgerond, dus er valt niets te openen | ✅ n.v.t. |
| 5 | Beoordelingswachtrij | Niets. Alleen ingediende voltooiingen | ✅ n.v.t. |
| 6 | Punten | **Niets, en dat is een apart besluit** — A42, 24-08-2026. Ook in een open groep blijft `points_ledger` eigenaar-only; wie het totaal deelt, deelt het missen via een omweg. De vorm voor competitie is een teller die alleen optelt | ⛔ **Bewust dicht** |
| 7 | Uitnodigingspagina | `invite_preview()` noemt de zichtbaarheid, óók zonder account. ⚠️ **Dit was de naad die 0076 niet dekte**: wie meedoet met een groep die al open staat, maakt dezelfde overgang mee als een lid van een groep die wordt opengezet — zijn gemiste weken worden zichtbaar — maar er is geen systeembericht, want er verándert niets aan de groep. Een bericht kan dat ook niet opvangen: wie nieuw is heeft het niet gelezen. Dit scherm is de enige plek waar het feit kan staan, en dus staat het er vóór de knop | ✅ **0080** |
| 8 | Groepschat | Niets. Wat mensen zelf typen, is altijd hun eigen keuze geweest | ✅ n.v.t. |
| 9 | Systeemberichten | Niets aan de bestaande tien. Er kwamen er twee bij (6a) die over de gróép gaan. ⚠️ Een open groep krijgt géén nieuw type "X heeft een week gemist": dat zou van een keuze een aankondiging maken, en de allowlist is bewust een migratie waard | ⛔ **Bewust dicht** |
| 10 | Weekafsluiting | Niets. Route 1 — de gebruiker schrijft en verstuurt zelf | ✅ n.v.t. |
| 11 | Reacties op de weekafsluiting | Niets. Idem | ✅ n.v.t. |
| 12 | Realtime | **Het transportverbod verandert niet; de ínhoud volgt de policy.** ⚠️ "Niets" stond hier tot de code-review van 24-08, en dat misleidt: realtime past de SELECT-policy per abonnee toe, en `weekly_goals_select` is in 0077 verruimd. Een lid van een open groep ontvangt vanaf nu dus wél het UPDATE-event van andermans weekdoel dat op `missed` komt te staan — correct gedrag, maar niet "onaangeraakt door A41". Wat wél onveranderd blijft is het verbod op `REPLICA IDENTITY FULL`. ⚠️ De reden is hier een ándere dan bij een beschermde groep: met `full` gaat bij een DELETE de volledige oude rij naar iedereen die zich abonneert, **lid of niet**. "Open" is een keuze over wat de gróép ziet; dit lek gaat naar buiten de groep, en dat heeft niemand gekozen. Getoetst in `tests/rls/epic13.test.ts` | ⛔ **Bewust dicht** |
| 13 | De Ketting | Het venster van acht dagen vervalt in een open groep, op `chain_links_select` **en** op `closed_this_period` in `group_overview()`. ⚠️ Die twee dragen hetzelfde venster op twee plekken; één van de twee omzetten zou een lid de schakels in de tabel laten zien maar niet in het overzicht dat het scherm leest. `ketting_stand()` en `chain_milestone` zijn niet aangeraakt: aantallen zonder namen, in beide standen hetzelfde | ✅ **0079** |
| 14 | Seizoensrecap | Nog niet gebouwd (EPIC 8) — beoordeel bij het bouwen | **Nog niet gebouwd** |
| 15 | Notificaties | Nog niet gebouwd (EPIC 11) — beoordeel bij het bouwen | **Nog niet gebouwd** |
| 16 | Deadline-verzoeken | Niets. De gebruiker vraagt het zélf aan (A7) | ✅ n.v.t. |
| 17 | Ingetrokken goedkeuringen | ⚠️ **Bewust dicht, ook in een open groep.** "De week van X is toch niet bevestigd" is niet iemands eigen tegenslag maar het oordeel van een ánder lid over hem. Openzetten is een keuze over eigen zichtbaarheid, geen mandaat om andermans intrekking rond te sturen | ⛔ **Bewust dicht** |
| 18 | Verwijderde accounts | Niets. `on delete set null` is geen zichtbaarheidskeuze | ✅ n.v.t. |
| 19 | Weekpassen | ⚠️ **Bewust dicht.** Een verbruikte pas is een gemiste week plus de handeling om hem te redden; dat is een privé-voorraad, geen groepsgegeven. Bovendien staan de schrijvers op `service_role` en dragen `weekpas_stand()` en `weekpas_standen()` hun eigenaarstoets zélf — dit oppervlak leunt niet op RLS en zou dus een tweede, eigen verruiming vragen | ⛔ **Bewust dicht** |
| 20 | Commitments | Niets. De beloning en de verschuldigde straf zijn al zichtbaar; het auditspoor blijft eigenaar-only. ⚠️ **Sinds QS8-228 kan de begunstigde ook één persoon zijn**, met dezelfde statusgrens; die tak varieert net zomin op `groups.zichtbaarheid` als de groepstak | ✅ n.v.t. |
| 31 | De straf bij een uitstelverzoek | Niets. Wat dit oppervlak opent hangt aan het **verzoek** en niet aan `groups.zichtbaarheid`: de gebruiker vraagt het zélf aan, precies als bij 10, 16, 21 en 22, dus het staat in béide standen gelijk. ⚠️ Een **beschermde** groep die om uitstel gevraagd wordt, weet dus óók dát er een straf staat — dat is geen verruiming van A41 maar een verruiming die er los van staat, en wie die twee door elkaar haalt, denkt dat hij hem met een groepsinstelling kan terugdraaien. ⚠️ En het is nadrukkelijk niet zo dat een **open** groep hier méér krijgt: de functie geeft één kolom, in beide standen | ✅ n.v.t. |
| 32 | Een foto in de groepschat | Niets. Een foto is wat iemand zélf plaatst — oppervlak 8 en niet 3 — en er valt in een open groep niets extra's te openen. In lijn met 10, 16, 21 en 22 | ✅ n.v.t. |
| 21 | Adempauzes | Niets. De gebruiker kondigt zélf aan, dus dit staat in beide standen open (A50). ⚠️ **Sinds QS8-227 geldt dat ook voor een pauze die je achteraf aankondigt**, en dat is een verruiming en geen gelijkblijvende stand — zie rij 21 hierboven en §4a | ✅ n.v.t. |
| 22 | Vertrek uit een groep | Niets. Vertrekken is de eigen handeling van de gebruiker en het vertrek zelf draagt geen tegenslag, dus dit staat in beide standen gelijk — net als 10, 16 en 21. ⚠️ De reparatie in `shares_group_with_goal()` werkt juist hárder in een open groep: daar lekte een blijvende koppeling ook de gemiste weken van een oud-lid | ✅ n.v.t. |
| 23 | De Doelcoach-tip per mijlpaal | Niets. Eigenaar-only in béide standen; `groups.zichtbaarheid` raakt deze tabel niet en hoort dat ook nooit te doen | ✅ n.v.t. |
| 26 | Het weekplan | Niets. Eigenaar-only in béide standen; `groups.zichtbaarheid` raakt deze tabel niet en hoort dat ook nooit te doen — net als 23. ⚠️ Dit is dus géén achtste rij bij de zeven hieronder: die zeven zijn oppervlakken die de groep wél kent en die in een open groep tóch dichtblijven. Dit oppervlak kent de groep in geen enkele stand, dus er is niets te verruimen. Voor élk nieuw oppervlak is beschermd het antwoord tot iemand het tegendeel besluit, en niemand heeft dat hier besloten | ✅ n.v.t. |
| 27 | Dagafvinkingen | Niets. Eigenaar-only in béide standen; `groups.zichtbaarheid` raakt deze tabel niet en hoort dat ook nooit te doen — net als 23 en 26. ⚠️ Dit is de rij waar het onderscheid het scherpst ligt: een **open** groep heeft afgesproken elkaars gemiste wéken te zien, en dat is iets anders dan elkaars gemiste dágen. Wie dat ooit wil verruimen, verruimt niet één stap maar zeven per week | ✅ n.v.t. |
| 28 | Het puntenklassement | ⚠️ **Om, en dat is de enige rij in deze tabel die van dicht naar open ging.** Besluit A54 geeft een open groep een klassement per lid; een beschermde groep krijgt nul rijen. Wat er open gaat is het **groepstotaal**, niet je persoonlijke totaal en niet de deltas — en het kan niet dalen van een gemiste week, want `cycle_missed` draagt geen groep (CHECK sinds 0141) | 🔓 **Om (0141)** |
| 29 | De zoeklijst | ⚠️ **Andersom dan alle rijen hierboven: `open` sluit dit oppervlak juist úít.** Een vindbare groep móet beschermd zijn (`groups_ontdekbaar_is_beschermd`), dus een open groep komt er niet in en een vindbare groep kan niet open. Dit is de eerste rij waar de twee besluiten elkaar begrenzen in plaats van versterken: A41 verruimt wat léden van elkaar zien, en dat is precies de reden dat er geen vréémden bij mogen | 🔒 **Uitgesloten (0144)** |
| 30 | Meldingen en blokkades | Niets. In béide standen dicht; `groups.zichtbaarheid` raakt deze twee tabellen niet en hoort dat ook nooit te doen — net als 23, 26 en 27. ⚠️ Dit is de rij waar dat het minst onderhandelbaar is: een **open** groep heeft afgesproken elkaars gemiste wéken te zien, en dat is iets heel anders dan elkaars meldingen. Een open groep waarin zichtbaar is wie wie gemeld heeft, is geen open groep maar een groep waarin niemand meer meldt | ✅ n.v.t. |
| 31 | **Het verleden van een aanvrager** | `verzoekers_eerder_lid()` (0219), `app/groep/beheer/[id].tsx` | **Niets — dit oppervlak is niet van de groep maar van de beheerder.** Een actieve beheerder van díé groep ziet per openstaand verzoek of de aanvrager eerder lid was, en hoe dat eindigde: `verwijderd`, `vertrokken` of `eerder_lid`, met de datum. Elk ander lid krijgt **nul rijen** | ⚠️ **Toegevoegd 08-09-2026 (QS8-332), en de aanleiding is 0189.** Sinds daar werkt de weg terug na een uitzetting, en de beheerder die aanneemt zag een verzoek van iemand die vorige week is weggestuurd precies zoals een verzoek van een vreemde. Met meer dan één beheerder is dat het gat: A zet iemand weg, B neemt hem later aan. **Wie het mag zien:** alleen een actieve beheerder, afgedwongen in de functie zelf (`is_group_admin()` in de `where`, dus nul rijen en geen fout — dezelfde vorm als `groep_klassement()` in een beschermde groep). Getoetst in `tests/rls/verzoekgeschiedenis.test.ts`, met een gewoon lid, de aanvrager zelf en iemand buiten de groep. ⚠️ **Drie dingen komen er met opzet niet uit**, hoewel ze in de gelezen rij staan: `actor_id` (wie de uitzetting deed — dat maakt van de beslislijst een plek waar het handelen van een mede-beheerder ter discussie staat, en die vraag hoort in de groep), `old_value` (rol en status van vóór de uitzetting, draagt niets bij aan dit besluit) en een reden (die bestaat niet als veld, en dat blijft zo — 0145). ⚠️ **`vertrokken` staat er bewust naast `verwijderd`.** Zou de functie alléén uitzettingen teruggeven, dan ís de aanwezigheid van de regel het negatieve signaal en zegt het label niets meer; nu gaat het oppervlak over geschiedenis en niet over straf. ⚠️ **Géén nieuw clientpad naar `group_events`.** De functie leest die tabel server-side en geeft twee velden terug; 📏 na 0219 leest nog steeds geen enkele client `group_events` — nagemeten over `src`, `app` en `supabase/functions`. ⚠️⚠️ **Wat een gewoon lid daarnaast kan lezen, en dat is sinds 08-09-2026 een besluit en geen omissie.** 📏 Gemeten tegen de draaiende database: `verwijder_lid()` is de énige schrijver van `group_members.status = 'inactive'` en `verlaat_groep()` de énige die de rij **verwijdert**. Het bestáán van een inactieve rij is daarmee exact gelijk aan "deze persoon is uit de groep gezet" — de tabel zegt het niet als één van meerdere mogelijkheden maar sluitend — en `group_members_select` staat op `mag_groep_lezen()`, dus élk lid leest dat met één API-verzoek buiten de UI om. **Besluit van Quinten, 08-09-2026: dat blijft zo.** De redenering is die van de agendarij waar het vandaan komt: een groep die iemand wegstuurt, weet dat zelf — uitzetten is een handeling ván de groep en niet een tegenslag ván de uitgezette, en dat is de grens die domeinregel 7 trekt. ⚠️ **Wat dit besluit níét is:** geen vrijbrief om het féít ergens te tónen. Het staat in de tabellen en in geen enkel scherm; wie er een oppervlak op wil bouwen, komt hier eerst langs, en het antwoord is dan opnieuw beschermd tot iemand het tegendeel besluit. `tests/rls/verzoekgeschiedenis.test.ts` legt beide leespaden vast, zodat het besluit een test heeft en niet alleen een zin. Het derde acceptatiecriterium van QS8-332 ("langs geen enkele weg") is daarmee beantwoord in plaats van gehaald |

**Zes oppervlakken staan bewust dicht, ook in een open groep.** Dat is geen
halfheid maar de kern van het besluit: "open" betekent dat de groep jouw
tegenslag mag zien, niet dat alles open is. Wie ooit een van die zes wil
verruimen, komt langs deze tabel en langs de reden.

⚠️ **Het waren er zeven tot 01-09-2026, en de zevende is punten.** Besluit A54
haalde ze eruit — maar alleen het **groepstotaal per lid**, en alleen in een open
groep. Dat is de eerste keer dat deze tabel een rij de andere kant op laat gaan,
en het is precies daarom uitgeschreven in rij 28 hierboven: niet "punten mogen nu"
maar "dít cijfer mag, om deze reden, met deze grendel eronder".

### 6c. Wat er af is, en waar de grens ligt

**Alle twintig oppervlakken zijn beoordeeld en alles wat om moest, is om**
(migraties 0076 t/m 0079). Een lid van een **open** groep ziet van een gekoppeld
doel de gemiste, doorgeschoven, afgesloten en vrijgestelde weken, de beste reeks,
de laatste getelde cyclus en de historische aanwezigheid in De Ketting.

⚠️ **De vier oppervlakken beantwoorden "staat deze groep open?" met twee
verschillende vragen, en dat is zichtbaar op één scherm.** Oppervlak 2 en 3
vragen `deelt_open_groep_met_doel()` — per **doel**, via `goal_group_links`.
Oppervlak 13 en `closed_this_period` vragen `lid_van_open_groep()` — per
**groep**, via `group_members`. Dat de twee helpers naast elkaar bestaan is
verdedigd in de kop van 0079 (een doel heeft groepen, een schakel heeft er één),
maar het gevólg stond nergens:

> Een lid dat in béíde helften van een gemengde koppeling zit, ziet in het
> overzicht van de bescherméde helft wél de beste reeks van een ander (hij deelt
> via de open helft een open groep mét dat doel) en níét de historische schakel
> (déze groep is beschermd).

Dat is geen lek — die reeks mag hij al via de open groep, en die schakel hoort
bij de beschermde. Het is wel twee antwoorden op één scherm, en dat hoort iemand
te wéten in plaats van tegen te komen. Vastgelegd in `tests/rls/epic13.test.ts`,
"twee helpers, twee antwoorden". Gevonden door de code-review van 24-08.

⚠️ **Er zijn twee routes naar zichtbaarheid en niet één.** Grens 3 van het
besluit beschrijft er één — de groep wordt omgezet — en dekt hem met een
bevestiging, een auditrij en een systeembericht (0076). De tweede is **meedoen**:
een groep die al open staat verandert niet, dus er is niets aan te kondigen. Daar
is een *feit vooraf* het antwoord en geen bevestigingsstap (0080), om dezelfde
reden waarom `create_group()` er geen heeft: in beide gevallen beslist de persoon
uitsluitend over zijn eigen weken. Bevestigen doe je waar je over een ánder
beslist.

**Zes oppervlakken staan bewust dicht, ook daar** — en dat is de grens van het
besluit, geen restpost: systeemberichten over tegenslag, realtime, ingetrokken
goedkeuringen, de weekpassen, de teller van De Ketting en de mijlpaalaankondiging.
Wie er ooit een wil verruimen, komt eerst langs de rij in §6b en langs de reden die
daar staat.

⚠️ **Punten stonden hier tot 01-09-2026 als zevende**, en zijn er door besluit A54
uit gehaald voor het groepstotaal per lid in een open groep (rij 28). Het
persoonlijke totaal en de deltas blijven dicht in élke stand.

⚠️ **Eén ding dat bij het bouwen boven kwam en dat geen "nog niet" is.** Oppervlak
1 noemde ook "de weekstatus". Die is er bewust niet bij gekomen: welke week van
welk lid telt, hangt af van de persoonlijke cyclus van dat lid — en sinds
migratie 0074 kan één cyclus meerdere weekdoelen dragen. Dat uitrekenen in SQL is
correctheidsregel 7 breken. Wie het toch wil, bouwt het op `weekly_goals` (dat is
oppervlak 3 en dat is al om) en niet op een nieuwe kolom in het overzicht.

⚠️ **Achterhaald sinds QS8-119 (24-08-2026):** hier stond dat de RLS-suite niet
in CI draaide en dat groen in GitHub dus niets zei over domeinregel 7. Dat is
gerepareerd — de suite draait tegen een lokaal opgebouwd schema, in CI, zonder
secrets. Zie `docs/decisions/005-rls-suite-lokaal.md`.
