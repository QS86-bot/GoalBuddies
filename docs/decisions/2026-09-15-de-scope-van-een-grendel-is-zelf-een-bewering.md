# De scope van een grendel is zelf een bewering

**15-09-2026 — QS8-498.** Migratie 0273: `goals_title_geen_bidi` en
`group_join_requests_bericht_geen_bidi`.

## Het besluit in één zin

Twee kolommen krijgen een CHECK die bidi-stuurtekens weigert, en de **reden dat
het er twee zijn en niet acht** staat hier opgeschreven, want dat is de enige
niet-vanzelfsprekende keuze in deze migratie.

## Waar dit vandaan komt

0270 grendelde `groups.name`, `groups.icon` en `groups.omschrijving` met de regel
*"vrije tekst die een niet-lid ziet vóórdat hij besluit te vertrouwen of toe te
treden"*. De andere groepszichtbare tekstkolommen bleven erbuiten met dit
argument:

> dat is inhoud van de schrijver zelf, gelezen door mensen die hem al kennen

Dat argument stond er met een 📏 ernaast en was een aanname. 📏 Voor `goals.title`
is het aantoonbaar onwaar: `invite_preview()` hangt zijn `goal_title`-tak aan
`ingelogd` en niet aan lidmaatschap, dus een ingelogde vreemde met een
uitnodigingscode kreeg `Sparen voor ‮gpj.exe` terug — op de kaart boven de
meedoen-knop, naast de groepsnaam die 0270 net wél had afgedekt.

**Een meting die niet klopt is duurder dan een ontbrekende meting, want de eerste
lees je als bewijs.** Dat is de zin waarmee QS8-498 geopend werd.

## Twee criteria, en dat is het hele punt

De twee CHECKs in 0273 staan **niet** op hetzelfde criterium, en dat is geen
slordigheid maar de kern:

| kolom | criterium | wie leest |
|---|---|---|
| `goals.title` | bereikt een **niet-lid** | een vreemde met een uitnodigingslink |
| `group_join_requests.bericht` | wordt gelezen vlak vóór een **autorisatiebesluit** | de beheerder, boven Aannemen/Afwijzen |

Het tweede is het bredere criterium, en volgens domeinregel 3 — peer-goedkeuring
is een autorisatiegrens — het zwaardere.

⚠️⚠️ **En daar ging de eerste versie van deze migratie de mist in.** De
scopetabel in §3 liep zes kandidaat-kolommen na op de vraag *"bereikt dit een
niet-lid"*, zette er een 📏 bij, en concludeerde dat ze er geen van alle bij
hoefden. Dat klopt — voor díé vraag. Maar de migratie grendelt er zelf een op de
ándere vraag, en langs die vraag vallen er **vijf** kolommen buiten die niet in
de tabel stonden:

- `weekly_goals.title`, `weekly_goals.floor_text`, `weekly_goals.ceiling_text` en
  `completions.note` — alle vier op de goedkeurkaart, boven Bevestigen;
- `deadline_requests.reason` — direct boven de regel die zegt dát er een straf op
  het doel staat, en boven Akkoord.

Die laatste is de zwaarste: `beslis_deadline_verzoek()` kan een straf vooruit
schuiven (QS8-370, migratie 0218), en de waarschuwing daarover staat één regel
ónder de tekst die de aanvrager zelf schreef. Een `reason` die anders rendert dan
hij is, is **domeinregel 5 langs de tekstkant** — een consequentie die
stilzwijgend losser wordt.

## Wat ik daarmee gedaan heb, en wat niet

**Niet:** de vijf meegenomen. Het gat bestond al vóór deze branch, de
acceptatiecriteria van QS8-498 gaan over `goals.title`, en een PR verbreden omdat
je onderweg iets ziet is precies hoe een wijziging onreviewbaar wordt. Ze staan
als **QS8-501** op de backlog, met hun scherm en hun aanvalspad.

**Wel:** §3 zegt nu met zoveel woorden wélke vraag de tabel beantwoordt, en somt
die vijf kolommen op. Dat is het verschil tussen een scope en een blinde vlek.

⚠️ **Dit is de les die groter is dan dit issue.** Een scopetabel is zelf een
bewering, en hij wordt gelezen als *"dit is nagegaan"* — niet als *"dit is
nagegaan op de vraag die er toevallig boven staat"*. Zet er dus bij welke vraag
hij beantwoordt, en welke hij niet beantwoordt. Anders is de tabel een 📏 die
iets anders meet dan de lezer denkt, en dat is dezelfde fout als de fout die dit
issue heeft veroorzaakt — één laag hoger.

## Waarom een CHECK en geen policy of grant

📏 Een `security definer` komt langs een policy en langs een kolomgrant — hij
draait als de eigenaar — maar **niet** langs een CHECK: die wordt tegen de rij
getoetst, wie hem ook schrijft. Eén CHECK dekt dus alle zeven schrijfpaden die in
de migratiekop opgesomd staan, inclusief de paden die er morgen bij komen. Hij
overleeft ook `COPY`, `service_role` en een `pg_restore`.

Dat maakt de opsomming van schrijvers een **controle** en geen afhankelijkheid.
Ze staat er omdat §7a van `docs/decisions/2026-09-13-twee-poorten-die-elkaar-niet-kenden.md`
dat vraagt, niet omdat de grendel erop leunt.

## Wat er níet in zit

- **Geen spiegel in `doelSchema`.** 0270 deed dat voor `groups` evenmin: één
  regel op twee plekken is een regel die je maar half verplaatst. ⚠️ De prijs
  staat op de agenda voor november — wie een titel plakt uit een RTL-document
  krijgt `doel.opslaan_mislukt` zonder te weten welk onzichtbaar teken de
  schuldige is, en dat blijft zo bij elke poging. Het faalt dicht, dus het lekt
  niets; het is een gebruikerservaring en geen gat.
- **`invite_preview()` blijft de doeltitels aan een niet-lid geven.** Dat is een
  productkeuze en een verdedigbare: de titels staan er om iemand te helpen
  beslissen of hij toetreedt. Wat er wél aan hangt, staat als **QS8-502** op de
  backlog — een weggestuurd én geblokkeerd lid leest via zijn oude link nog
  steeds de actuele doeltitels, want een verwijdering roteert de code niet en
  `invite_preview()` toetst geen blokkade. 📏 Nagemeten met `Stoppen met drinken`
  als titel.

## De grendels, en hoe ze geijkt zijn

`tests/rls/een-doeltitel-rendert-niet-als-een-andere.test.ts`, zes toetsen, drie
grendels, drie losse mutaties:

| mutatie | wat er rood wordt |
|---|---|
| de CHECK op `goals` weghalen | de uitnodigingstoets én de insertkant-toets |
| de CHECK op `group_join_requests` weghalen | alleen de toetredingstoets |
| `execute` op `zonder_bidi()` intrekken van `authenticated` | alle drie de must-allow-toetsen |

Die derde is de belangrijkste, en hij is er niet uit netheid: een CHECK die een
functie aanroept toetst EXECUTE bij **élke** schrijving, dus zonder die grant
valt iedere schrijving op `goals` om — ook eentje die niets met bidi te maken
heeft. 📏 Dat is in 0256, 0269 én 0270 gemeten en het was elke keer bijna een
ship-stopper.

⚠️⚠️ **De toets noemt de belofte en niet de foutcode**, en dat kostte twee
correcties. QS8-498 noemt vier opties, waarvan er twee dit langs verschillende
kanten repareren: de tekst weigeren, óf `invite_preview()` de tak aan lidmaatschap
hangen. Een toets die `23514` eist, legt één van die vier vast en wordt rood
zodra iemand voor een andere kiest — dan bewaakt hij de oplossing in plaats van
de belofte. De toets eist daarom dat er geen stuurteken op de kaart komt, en
daarnaast dat de schrijfactie érgens toe geleid heeft: óf geweigerd met de rij
onveranderd, óf geland mét het teken. Het enige dat niet mag is *"er gebeurde
niets en niemand weet waarom"*.

⚠️ **En de eerste versie van die toets bewaakte niets.** Hij maakte wel een doel
maar koppelde het niet aan de groep, dus `invite_preview()` gaf `goal_title:
null` en de toets bleef groen mét de CHECK eruit gesloopt. De ijking vond dat —
regel 18 vraag 3, en precies de reden dat die vraag met een mutatie beantwoord
wordt en niet met nadenken. Er staat nu eerst een helft die bewijst dát het
kanaal open staat.

## Drie eigen opstellingen die groen waren om de verkeerde reden

Ze horen hier omdat ze alle drie dezelfde vorm hebben: **een meting die iets
anders meet dan je denkt, ziet er precies zo uit als een meting die klopt.**

1. `expect(uitkomst).not.toBeNull()` op `vraag_lidmaatschap_aan()` — die functie
   geeft **altijd** een object terug. Het echte antwoord was
   `{"ok": false, "reason": "not_open"}`.
2. Een subquery `(select id from groups where invite_code = …)` die als de
   vreemde draaide. Die kan `groups` niet lezen, dus hij gaf `null`, en de
   functie werd met een leeg argument aangeroepen.
3. De niet-gekoppelde doel hierboven.

Alle drie staan ze nu als expliciete voorwaarde-toets in het testbestand, met de
reden erbij.
