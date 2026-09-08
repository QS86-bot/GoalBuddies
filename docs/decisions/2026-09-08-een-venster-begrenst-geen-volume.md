# Een venster begrenst geen volume

**08-09-2026 — QS8-354, migratie 0197**

## Waar dit over gaat

QS8-352 (migratie 0195) haalde `points_ceiling` en `points_floor` uit de
INSERT-kolomgrant van `authenticated`: een client kiest niet meer **wat** een week
waard is. Het vervolgissue stelde de andere helft: hij kiest nog wel **hoeveel**
weken er zijn, want `cycle_start_date` staat wél in de grant en er stond geen
enkele CHECK op.

Dit document legt vast waarom het venster dat er nu op staat 52 cycli breed is,
en — belangrijker — waarom het venster het aangevallen volume **niet** begrenst.

## De meting die de eerste versie omdraaide

De eerste versie van 0197 had een venster van 56 dagen terug, met "acht cycli"
als onderbouwing en met een kop die hem presenteerde als de grendel tegen het
scenario uit het issue: A maakt 200 weekdoelen per dag met steeds een andere
`cycle_start_date`, B keurt ze goed, allebei boeken ze in `groep_klassement()`.

📏 Nagerekend doet geen enkele vensterbreedte daar iets aan:

* er staat **geen unieke constraint** op `(goal_id, cycle_start_date)` — 0083 zegt
  dat met zoveel woorden — dus dezelfde cyclus mag honderd keer;
* `completion_approved_ceiling` dedupliceert op de completion en niet op de
  cyclus, dus honderd weken in één cyclus zijn honderd boekingen.

Met een venster van drie cycli haalt het scenario dus **exact hetzelfde aantal
punten** als zonder venster. Wat het volume wél begrenst is de dagteller:
`weekdoelen_plafond()` = 200 (0192) aan de schrijfkant, en de nieuwe teller op
`completion_approvals` aan de goedkeurkant.

**Dat is de reden dat dit document bestaat.** Een grendel die zwaarder
gemotiveerd wordt dan hij draagt, laat de volgende lezer denken dat de zaak
gedekt is. Het venster is een *aannemelijkheidsgrens*: een weekdoel in 2021 op een
account van vorige week is geen legitiem gebruik en het vervuilt `points_ledger`,
`groep_klassement()` en de Risico-radar met geschiedenis die nooit geleefd is.
Meer is het niet, en meer hoeft het ook niet te zijn.

## Waarom 52 cycli, en niet een getal dat ik zelf verzin

Acceptatiecriterium 2 vroeg een breedte "onderbouwd uit wat de bestaande features
nodig hebben en niet uit een rond getal". Die onderbouwing valt in twee helften
uiteen, en alleen de ene helft is af te leiden.

**Vooruit: één cyclus, en dat is gemeten.** 📏 Er zijn precies drie plekken die
client-zijdig een `cycle_start_date` kiezen — `maakWeekdoel()` (de lopende
cyclus), `weekplanstap_naar_weekdoel()` (de cyclus die de beller meegeeft) en
`schuif_weekdoel_door()` (`weekly.ts:306` geeft de lopende mee). De verste
daarvan legt de **opvolger** neer, en een gebruiker wiens tijdzone de serverdatum
een dag vooruit loopt heeft die dag ook nodig. Dat is `+ 7`.

**Achteruit: niets om uit af te leiden, dus overgenomen.** De app schrijft alleen
de lopende cyclus. Strikt genomen zou "nul cycli terug" de gemeten grens zijn —
maar dan is het geen aannemelijkheidsgrens meer maar een tweede rolgrens, en een
gebruiker die zijn week op de rollovergrens indient raakt hem.

**De 52 is dus gekozen, en het is de moeite waard op te schrijven hoe dicht ik
langs een verkeerde onderbouwing schoof.** De eerste versie zei dat het getal
overgenomen was van `plan_adempauze()` — `c_max_cycli = 52` sinds 0166 — met de
instructie de twee synchroon te houden. 📏 De security-review van 08-09 heeft dat
nagemeten en het klopte niet: die constante begrenst daar de **lengte** van een
adempauze (`p_ends_cycle > p_starts_cycle + (c_max_cycli - 1) * 7`) en niet hoe
ver terug hij mag liggen. `plan_adempauze()` met `p_starts_cycle` in 2020 geeft
gewoon `{"ok": true}`; de `niet_vooraf`-toets is er in QS8-227 bewust uitgehaald.

Een koppeling die er niet is, is erger dan geen koppeling. Wie over een half jaar
de adempauzelengte naar acht weken zet, zou het geschiedenisvenster van
weekdoelen meeversmallen zonder dat te bedoelen — en dat is precies dezelfde fout
als de fout waar dit document over gaat: een grendel zwaarder motiveren dan hij
draagt. Er staat nu een eigen constante, `c_venster_cycli`, zonder koppeling.

Wat er van de adempauze overblijft is een **precedent voor de schaal**: een jaar
is de orde van grootte die dit project al eerder als bovengrens op een
cyclusgebonden datum gekozen heeft. Dat is genoeg om 52 te verkiezen boven 8 of
boven 500, en te weinig om het een afleiding te noemen.

## Wat de dagtoets wél doet

`extract(dow from new.cycle_start_date)::smallint <> v_startdag` is de grendel met
de meeste inhoud, en hij is niet tegen volume maar tegen onzin. Een cyclus begint
op de week-startdag van de gebruiker; dat is domeinregel 1 en de reden dat
`profiles.week_start_day` bestaat. Een datum die daar niet op valt hoort bij géén
enkele cyclus en kan dus ook niet uit de app komen.

De vorm is overgenomen en niet bedacht: `plan_adempauze()` toetst al precies deze
vergelijking tegen precies deze kolom. Correctheidsregel 7 gaat over *rekenen* aan
weken; dit is dezelfde vergelijking die er al stond, geen tweede berekening.

⚠️ Er is bewust **niet** gekozen voor `goals.created_at` als achtergrens, hoewel
die strakker zou zijn: een cyclus die vóór zijn eigen doel begint kan door geen
enkele feature ontstaan. Maar dan moet de trigger `created_at` naar de
cyclusstart van de eigenaar afronden, en dát is wél een nieuwe weekberekening in
SQL.

## Wat dit de testsuite kostte, en waarom dat de bevinding zelf is

Het venster van 56 dagen maakte tien bestaande tests rood, verspreid over vier
bestanden. De 52-cycliversie maakt er nog twee rood. Beide keren was de oorzaak
dezelfde: **RLS-fixtures bouwden geschiedenis op met een gewóón account.**

* `klassement.test.ts` schreef weekdoelen in maart 2024, met "ver in het verleden,
  zodat niets van deze test elders meetelt" eronder. Die isolatie hing er niet aan
  — de harness maakt per run verse gebruikers — dus de datums lopen nu mee met de
  klok.
* `risicoklok.test.ts` zet een cyclus neer die met opzet **naast** de startdag van
  de eigenaar ligt, omdat de grens tussen de twee klokken daar valt. Dat is een
  toestand die de app niet kan maken, dus die opbouw gaat nu via `adminDb()` — de
  rol die de rollover ook heeft.
* `definerpoorten.test.ts` gaf `schuif_weekdoel_door()` `vandaag + 7` mee. Dat is
  zes van de zeven dagen geen cyclusstart. De app geeft de RPC een échte
  cyclusstart mee, dus de fixture is er bovendien getrouwer van geworden.

⚠️ **Dat een gewoon account die rijen kón schrijven, ís de bevinding.** Een
fixture die geschiedenis fabriceert langs de clientkant toetst een pad dat de app
niet heeft — en zolang dat pad open stond, viel er ook niets aan op.

## Het orakel dat er bijna in bleef zitten

Een `before insert`-trigger draait **vóór** de `with check` van de RLS-policy. De
eerste versie van de dagtoets antwoordde daarom ook op een insert die de policy
daarna toch geweigerd zou hebben. 📏 Gemeten in dezelfde review: B kent de
goal-id van A (die mag hij lezen) en stuurt zeven inserts; zes komen terug met
`23514 Een cyclus begint op je eigen week-startdag` en precies één met `42501`
van de policy. Die ene verraadt `profiles.week_start_day` van A — een kolom
waarop `profiles` aan géén enkele client leesrecht geeft (403,
`permission denied for table profiles`, ook aan een groepsgenoot).

Dat is een nieuw oppervlak dat over een ander gaat, en de regel bij domeinregel 7
is dat een nieuw oppervlak dicht is tot iemand het tegendeel besluit. De trigger
zwijgt nu zodra de invoerder niet de eigenaar is
(`if v_owner is distinct from v_uid then return new`). Er gaat geen handhaving
verloren: `weekly_goals_insert` eist `g.owner_id = auth.uid()`, dus zo'n rij komt
er sowieso niet in.

⚠️ **Dit is een vorm om te onthouden, niet een incident.** Elke `before`-trigger
die iets over een ánder dan de aanroeper toetst, antwoordt op een vraag die de
policy nog niet beoordeeld heeft.

## Wat hier níet mee opgelost is

Met de twee dagtellers erbij haalt het scenario uit het issue nog steeds tot
+400 punten per dag voor de maker en +200 voor de goedkeurder. ⚠️ En de teller
begrenst de **goedkeurder**, niet de verdiener: met `k` samenspannende
goedkeurders is de opbrengst `k × 400` per dag. Dat is de grens die 0192 gekozen
heeft en die is hier niet herzien. Het staat als rij in
`docs/ENGINEER-REVIEW.md` met de voorwaarde waaronder hij zwaarder wordt.

## Wat er nog open staat aan de UPDATE-kant

De trigger staat op `before insert`. `cycle_start_date` zit niet in de
UPDATE-kolomgrant van `authenticated`, maar `zet_week_startdag()` is
`security definer`, staat wél open voor `authenticated`, en toetst niet dat
`p_nieuwe_start` op `p_dag` valt. 📏 Gemeten: die RPC laat een rij achter met
`cycle_start_date` op dow 2 bij `week_start_day` 1. Geen puntenlek — de RPC eist
dat vandaag in béide cycli valt en de rollover selecteert op een bereik — maar de
invariant die dit document vestigt, geldt dus bij INSERT en niet voor de tabel.
Ligt als QS8-357 in Linear, met de reden erbij waarom hij niet in deze branch mee
kon.

## IJking

Vier mutaties, elk apart tegen de hele RLS-suite gedraaid, elke keer met
`pg_get_functiondef()` erna om te zien dát de mutatie er stond:

| Mutatie | Rood |
| -- | -- |
| de dagtoets eruit | `een cyclus begint op je eigen week-startdag` |
| de venstertoets eruit | `een cyclus ver in het verleden gaat er niet in` |
| de trigger `goedkeuringen_dagplafond` droppen | `een batch goedkeuringen boven het plafond wordt geweigerd` |
| de teller de batch zélf laten overslaan | `een batch goedkeuringen boven het plafond wordt geweigerd` |
| de eigenaarspoort eruit halen (`v_owner is distinct from v_uid`) | `de trigger zwijgt over het profiel van een ander` |

⚠️ De vierde is de ijking die telt. De derde bewijst alleen dat er een trigger
hangt; een teller die de rijen uit dít verzoek niet ziet — de fout van QS8-343 —
haalt hem moeiteloos.
