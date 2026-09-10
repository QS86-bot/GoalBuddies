# Verschuiven in plaats van weigeren

**10-09-2026 — QS8-406, migratie 0238.** Het tweede criterium van QS8-92: een
venster waarin een gebruiker geen meldingen krijgt.

## De vraag die dit issue draagt

`nudge` en `cycle_summary` vuren op één specifiek uur. Valt dat uur in het stille
venster, dan gaat die melding die dag helemaal niet — terwijl de drie
`ref_id`-gebonden soorten vanzelf de volgende ronde terugkomen, omdat de poort
vóór de rij in `notifications_sent` staat en de ontdubbeling dus ongebruikt
blijft.

Zet iemand zijn herinnering op 23:00 met stilte van 22:00 tot 07:00, dan krijgt
hij **nooit meer** een nudge. Geen fout, geen rode test — onwrikbare regel 18,
vraag 5.

## Drie opties, en waarom de derde

### 1. Een RPC die de combinatie weigert — afgewezen

De validatie zou twee kolommen moeten bewaken die van twee kanten bewegen. Je
kunt de stille uren dichtzetten en dáárna je herinneringsuur verzetten, en die
route staat open zolang `reminder_time` een gewone kolomgrant heeft — hij wordt
vandaag geschreven vanuit twee schermen plus `herinneringStandaard()`.

Om het écht dicht te krijgen moet `reminder_time` óók door die RPC, en dan is dit
geen klein issue meer maar een verbouwing van de onboarding, `herinneringVelden()`
en de kolomgrant van 0139.

⚠️ Een slot met een deur ernaast, waarvan de motivering luidt *"geen scherm doet
dat vandaag"*, is in dit project al twee keer duur geweest (QS8-327, QS8-352).

### 2. Een waarschuwing in de UI — afgewezen

Een regel die alleen in de UI bestaat, is geen regel. En een waarschuwing lost
het niet op: wie hem wegklikt, of de instelling drie maanden later vergeet, zit
nog steeds in de stille storing.

### 3. ✅ Het uur verschuiven

Het effectieve uur wordt `verschovenUur()`: valt het in het venster, dan wordt
het het eerste luide uur. Herinnering 23:00 met stilte 22→7 komt om 07:00.

**Daarmee bestaat er geen ongeldige combinatie meer om tegen te houden.** Dat is
het verschil met optie 1: niet een grens bewaken die van twee kanten beweegt,
maar de twee instellingen laten samenstellen.

De prijs — je krijgt hem later dan je instelde — staat op het scherm, en het
getal komt uit **dezelfde functie** die de verschuiving doet. Die zin kan dus
niet uit de pas lopen met wat er gebeurt. Dat is het verschil met optie 2: geen
belofte over een regel, maar een mededeling over de uitkomst.

## Wat er en passant gerepareerd is

Het weekoverzicht ging van `lokaalUur === overzichtsUur` naar `>=`. Dat was los
van dit issue al nodig: met een gelijkheid kost één mislukte job-run om precies
dat uur stilzwijgend het hele weekoverzicht van die gebruiker — dezelfde klasse
als QS8-202. De ontdubbeling op `(user_id, 'cycle_summary', local_date)` houdt
het bij één, dus later alsnog sturen kan geen tweede opleveren.

## Twee keuzes in het datamodel

**Hele uren en geen `time`.** De job draait één keer per uur en beslist op
`partsIn(tz, nu).hour`. Een `time`-kolom belooft minuten die het mechanisme niet
kan waarmaken: `22:30` gedraagt zich als 22:00 of als 23:00 afhankelijk van hoe
je afrondt, en die keuze is voor de gebruiker onzichtbaar. Zelfde redenering als
*"een teller in grafemen bij een grens in codepunten is een nieuwe fout en geen
reparatie"*.

**`van === tot` wordt verboden en niet gedefinieerd.** Het is niet te
onderscheiden tussen "altijd stil" en "nooit stil", en béide betekenissen zijn al
langs een andere weg bereikbaar: alle vier de schakelaars uit (0237),
respectievelijk beide kolommen op `null`. Een dubbelzinnige grens maak je
onmogelijk in plaats van hem te raden.

## De fout die dit bijna een storing maakte

⚠️⚠️ De eerste versie van die tweede CHECK luidde
`quiet_from is distinct from quiet_to`. Dat leest als "ze mogen niet gelijk zijn"
en dat is het ook — behalve voor `null`.

📏 Gemeten: `null is distinct from null` geeft **`false`**. De CHECK weigerde dus
precies de stand *"geen stille uren"*. En `handle_new_user()` — de trigger op
`auth.users` — maakt bij iedere nieuwe gebruiker een profielrij met béide
kolommen op `null`.

**Deze migratie zou dus niet de feature gebroken hebben maar het aanmelden.** Elke
nieuwe registratie zou zijn omgevallen op een CHECK die over meldingen gaat.

Het geval staat nu apart onder test — *"laat een gewone aanmelding ongemoeid"* —
en niet als variant van *"laat geen stille uren toe"*, want het draagt een andere
belofte. 📏 Geijkt door de oude vorm terug te zetten: drie tests rood, waaronder
die.

De les die blijft: **`is distinct from` is niet de nulls-veilige versie van `<>`
maar een ándere vraag**, en bij een nullable kolom is dat verschil het hele
geval. En breder: een CHECK op een tabel die door een trigger gevuld wordt, is
een CHECK op dat pad — ook als je dat pad niet in gedachten had.

## Wat er open blijft

⚠️ Stille uren van 08:00 tot 23:00 zetten het overzichtsuur (≥ 12) volledig
binnen het venster, en `verschovenUur()` schuift dan naar 23:00 — dat is nog
steeds dezelfde dag, dus het overzicht komt. Maar een venster dat 23 van de 24
uren dekt, laat alleen dát ene uur over. Dat is geen stille bug: het volgt
rechtstreeks uit een instelling die het scherm voorleest, en de gebruiker kan hem
zien staan. Rij in `docs/ENGINEER-REVIEW.md`.
