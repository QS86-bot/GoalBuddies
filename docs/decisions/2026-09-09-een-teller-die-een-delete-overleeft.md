# Een teller die een delete overleeft

**Datum:** 09-09-2026 · **Issue:** QS8-399 · **Migratie:** 0233 · **Status:** gebouwd

Vijf keuzes die niet vanzelf spreken, met de reden erbij. De acceptatiecriteria
staan in Linear.

---

## 1. Een eigen tabel, en niet een slimmere `count(*)`

De drie emmertellers telden `storage.objects` zelf. Elke variant daarop — een
kolom erbij, een index, een venster — blijft tellen wat er **staat**. De vraag is
hoeveel er **bij zijn gekomen**, en dat is een ander gegeven dan de tabel bevat.

📏 Gemeten vóór de reparatie: tien plaatsen → geweigerd op de elfde → één wissen →
er weer doorheen. Voor alle drie de emmers.

⚠️ **De vorm is niet nieuw en is bewust niet opnieuw bedacht.**
`invite_preview_limits` (0131) doet precies dit: één rij per sleutel, een venster
dat in dezelfde uitdrukking meeschuift, opgehoogd met één
`insert … on conflict do update`. 0233 deelt die vorm in plaats van hem een
vierde keer te kopiëren — en het kopiëren *is* hoe deze bug zich verspreid heeft:
`bewijsfotos` (0228) nam de vorm van `chatfotos` (0226), die hem van `avatars`
(0130) nam, inclusief de `count(*)`.

⚠️ **Géén rij per upload.** Dat zou de teller zelf een groeivector maken —
dezelfde afweging die in 0131 met zoveel woorden gemaakt is.

---

## 2. `security definer`, tegen de aantekening van 0228 in

In de kop van 0228 stond: *"Geen `security definer`: een triggerfunctie op
`storage.objects` draait al in de context van de schrijver."* Dat klopte zolang
de teller alleen las.

De tellertabel is deny-all — geen policy, en dat is de bedoeling: mocht een
client erin schrijven, dan is de rem met één `update` te resetten en hebben we de
bug terug met een extra stap. Een niet-definer functie kán er dan niet in
schrijven. Dus is `tel_opslag_upload()` definer, en dus moeten de drie
triggerfuncties dat óók zijn — anders faalt de aanroep op een ontbrekend
EXECUTE-recht.

⚠️⚠️ **En daarom mag `authenticated` `tel_opslag_upload()` niet uitvoeren.** Wie
hem rechtstreeks mag aanroepen, hoogt de teller van een willekeurig ánder lid op
en stuurt dat lid zijn dag uit. Dat is een griefvector met een schone naam. De
`revoke` is `from public, anon, authenticated` (onwrikbare regel 4) en er staat
een testgeval op beide rollen.

**Wat het niet uitdeelt:** deze functies lezen `new.name` en hogen één teller op.
Ze geven de schrijver geen recht dat hij zonder trigger niet had.

---

## 3. `after insert` en niet `before insert`

⚠️ **Dit is een reparatie die het schrijven van deze migratie zelf opleverde.**
📏 De bestaande suite viel om met `Te veel uploads in deze emmer vandaag (21)` op
een statement dat eindigde op `on conflict do nothing`.

Een `before insert`-trigger vuurt vóórdat Postgres de botsing ziet, dus een
upload die niets toevoegt hoogde de teller tóch op. Bij een `count(*)` viel dat
niet op — die telde de tabel en niet de pogingen — maar een blijvende teller
onthoudt het. En het raakt een echt pad: een avatar vervangen gaat als upsert, en
dan is de insert een update.

`after insert … for each row` vuurt alleen voor rijen die er werkelijk in
gekomen zijn. Zelfde gedachte als de lege-batchtak van `begrens_pushtokens`
(0214): *een statement dat niets toevoegde, kan het plafond niet doorbroken
hebben.*

⚠️ `for each row` en niet `for each statement`, zodat een grote batch tegen de rem
loopt op de rij die eroverheen gaat — de fout die `remdekking.test.ts` (QS8-363)
bewaakt.

⚠️ **Gevolg dat je moet weten:** de zojuist geplaatste rij telt nu mee in elke
`count(*)` binnen die triggers. Daarom staat de gelijktijdigheidsgrens van
`avatars` op `> 10` en niet meer op `>= 10`; 📏 met `>=` weigerde hij de tiende in
plaats van de elfde, en de must-allow viel er meteen over.

---

## 4. `avatars` houdt twee grenzen naast elkaar

0130 telt zonder venster: hoeveel avatars er van deze gebruiker **staan**. Dat is
een grens op gelijktijdigheid — *"één is genoeg voor de app, de rest is ruimte
voor wezen"* — en die hoort te blijven werken als je je avatar vervangt.

Die grens vervangen door een dagteller zou een gebruiker die zijn foto elf keer
in een jaar wisselt voorgoed buitensluiten. Andersom liet 0130 wél toe dat iemand
honderd keer per dag plaatst en wist.

**Het zijn twee vragen en ze hebben allebei hun eigen antwoord nodig.** De
dagteller komt er dus bij in plaats van in de plaats.

⚠️ Dat verschil is meetbaar en staat onder test: het geval *"een etmaal later mag
het weer"* moet voor `avatars` eerst de objecten wissen, want anders houdt de
gelijktijdigheidsgrens hem alsnog tegen. 📏 Zonder die `delete` faalt precies dat
geval voor `avatars` en voor de andere twee niet.

---

## 5. De zin blijft per emmer, de vorm staat op één plek

De eerste versie had één gedeelde melding. Die leest in een log als drie remmen
die je niet uit elkaar kunt houden, en 📏 hij maakte twee bestaande tests stil
onbruikbaar: die matchten op `Te veel bewijsfoto` en gaven `ANDERE_FOUT` in
plaats van `23514`.

⚠️ **Dat is regel 18 vraag 4 van twee kanten.** Die tests grijpen naar een zin en
niet naar de belofte, en dat is hun zwakte. Maar alleen op `23514` toetsen zou
óók de padconstraint aanvaarden, en dan bewaken ze mínder dan nu. De bewoording
komt daarom van de aanroeper: de vorm staat op één plek, de zin blijft per emmer.

⚠️ Geen pad, geen naam en geen sleutel in de melding — deze paden dragen twee
uuid's, en een foutmelding reist naar plekken waar de autorisatie niet meereist.

---

## Wat dit niet is

* **Geen reparatie van `begrens_pushtokens`.** Die telt óók zijn eigen tabel,
  maar er valt niets te winnen met één token minder: het is een snelheidsrem en
  geen opslagrem, en de rij ís het adres. Omzetten raakt bovendien de must-allow
  van `registreer_push_token()` — `Pushwacht` herregistreert bij élke start — en
  die functie doet een eigen voorcontrole die dan mee moet. Dat is een eigen
  wijziging aan een pad met een gemeten geschiedenis van uitgesloten gebruikers.
  Staat als **QS8-401**.
* **Geen reparatie van de zestien `*_dagplafond`-tellers** op gewone tabellen.
  Die delen de vorm maar niet de schade: daar verdwijnt de rij écht bij een
  `delete`, en bij `storage.objects` blijft de blob staan
  (`docs/DEPLOY.md` §2.6a). De dossierrij van 09-09 blijft dus staan.
* **Geen nieuw groepszichtbaar oppervlak.** De tellertabel is deny-all en de
  meldingen noemen niemand. Domeinregel 7 komt niet in het geding, en
  `docs/decisions/002-domeinregel7-oppervlakken.md` hoeft niet bij.
