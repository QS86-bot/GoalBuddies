# Een foto in de chat

**Datum:** 09-09-2026 · **Issue:** QS8-71 (PRD 7.3) · **Migraties:** 0221, 0222, 0223

## 1. Het pad draagt de groep, niet de gebruiker

`avatars` (0126) is `<user_id>/<naam>` en leest op `shares_group_with_user()`.
Die vorm hier kopiëren zou een lek zijn geweest, en dat is niet beredeneerd maar
gemeten.

📏 **De opstelling:** Alice zit in groep A én B, Bob alleen in A, Carol alleen in
B. Met de avatar-vorm is `shares_group_with_user(alice)` wáár voor Carol — zij
deelt immers groep B met Alice — en dus zou Carol de foto lezen die Alice in
**groep A** plaatste. Dat is oppervlak 24 uit dit dossier in een nieuwe
verpakking; `goal_group_links_select` bestaat precies om die vorm te voorkomen.

Vandaar `<group_id>/<sender_id>/<naam>.<ext>`. Twee segmenten die elk een grens
dragen: het eerste de leesgrens, het tweede de schrijfgrens én de sleutel waarop
een accountverwijdering kan opruimen.

⚠️ De mutatie staat in `tests/rls/chatfotobucket.test.ts`: de leespolicy
teruggezet naar de avatar-vorm maakt precies de Carol-test rood.

## 2. `mag_groep_lezen()` leest, `is_group_member()` schrijft

Geen smaak maar een grendel. `archiefleesgat()` (0153) scant `pg_policies` in
`schemaname in ('public', 'storage')` en wordt rood bij een leespolicy langs
`is_group_member()` én bij een schrijvende policy langs `mag_groep_lezen()`. Een
gearchiveerde groep hoort leesbaar te zijn en niet beschrijfbaar.

## 3. De kolomgrens is een CHECK en geen policy

`authenticated` heeft sinds 0059 een INSERT-kolomgrant op
`chat_messages.attachment_url`. Zonder CHECK zet een lid met één
PostgREST-verzoek het pad van een andere groep — of een extern adres — in dat
veld, en dan laadt elk groepslid dat adres uit zijn eigen `<Image>`.

⚠️ **RLS beslist over rijen en niet over kolommen.** De eis is hier *"wat mag er
in deze kolom staan"*, en dan is een policy per definitie te weinig — dezelfde
zin die CLAUDE.md bij domeinregel 7 opschrijft.

⚠️ **Een vormtoets en geen prefixtoets, en dat is de derde keer.** 0127 zette
deze grendel op `profiles.avatar_url` met een `like`, en 0129 moest erbovenop
omdat `<mij>/../<ander>/a.png` daar doorheen liep. De regex is daar overgenomen
en niet opnieuw bedacht.

📏 Gemeten tegen de echte database, zeven gevallen:

```
GEACCEPTEERD  <eigen groep>/<eigen afzender>/foto.png
geweigerd     <eigen groep>/<andere afzender>/foto.png
geweigerd     <andere groep>/<eigen afzender>/x.png
geweigerd     https://volgmij.example/pixel.gif
geweigerd     <eigen groep>/../<eigen afzender>/x.png
geweigerd     <eigen groep>/<eigen afzender>/x.svg
geweigerd     <eigen groep>/<eigen afzender>/x.png\nhttps://kwaad.example/a.png
```

## 4. Wat er met een foto gebeurt — het AVG-verwijderpad

Vier gebeurtenissen, vier uitkomsten:

| Gebeurtenis | De rij | Het object |
|---|---|---|
| **Bericht verwijderd** door de afzender | weg (`chat_messages_delete`) | weg — `verwijderBericht()` haalt het pad óp vóór de delete en ruimt daarna het bestand op |
| **Account verwijderd** | fotobericht mét tekst blijft, zónder tekst gaat de rij weg | weg (migratie 0223) |
| **Groep gearchiveerd** | blijft, leesbaar | blijft, leesbaar — een archief is leesbaar en niet beschrijfbaar |
| **Groep verwijderd** | weg (`on delete cascade` op `group_id`) | ⚠️ **blijft staan als wees** — zie de opruimpas hieronder |

### 4a. De accountverwijdering was een 23514

📏 Zonder 0223 brak accountverwijdering. Gemeten:

```
delete from profiles where id = <a>
→ 23514 / new row for relation "chat_messages"
          violates check constraint "chat_messages_attachment_eigen_pad"
```

`chat_messages_sender_id_fkey` is sinds 0031 `on delete set null` — het bericht
blijft zonder naam, want *"een gesprek van drie mensen is ook van de andere
twee"*. Maar de CHECK van 0222 eist bij een bijlage een `sender_id`.
**Dit is de derde keer dat een CHECK op deze tabel een referentiële actie
blokkeert**; `chat_messages_sender_required` is om precies dezelfde reden in 0031
herschreven.

### 4b. Waarom de foto wél weggaat en het bericht niet

0031 trekt de scheidslijn bij *"voor wie is de rij bewijs"*. Een chatfoto valt
daar anders uit dan een chatzin:

1. Een zin is woorden; een foto is meestal een gezicht. Artikel 17 AVG weegt een
   portret zwaarder, en een chatfoto is — anders dan een **bewijs**foto bij een
   voltooiing (QS8-391) — vrijwel nooit bewijs vóór iemand anders.
2. 0213 heeft de richting net gezet door de weergavenaam uit `body` te halen, met
   de reden dat *"een echte wissing beter is dan een afscherming"*. Een gezicht
   identificeert sterker dan een weergavenaam.

⚠️ **Geen terugvalzin in `body`.** Dat zou Nederlandse tekst in de database
vastzetten die het scherm daarna toont — precies wat 0213 er met moeite uit heeft
gehaald. Een fotobericht zónder tekst gaat daarom weg: dat bericht *ís* de foto.

### 4c. Bewaartermijn: die is er niet, en dat is de keuze

Chatberichten hebben in dit project geen bewaartermijn. Een termijn op foto's
zetten en niet op berichten is een productkeuze, en een termijn is een belofte
aan een gebruiker. **De foto leeft zo lang als het bericht.** Wat er wél is
vastgelegd, is het verwijderpad hierboven — en dat is wat het acceptatiecriterium
letterlijk vraagt.

⚠️ **Wat SQL niet kan.** Een `delete from storage.objects` haalt de
**metadata-rij** weg; de blob blijft in de objectopslag staan. Er is geen manier
om vanuit een migratie te garanderen dat een bestand echt weg is — dat vraagt de
Storage-API (`.remove()`) of een Edge Function. De rij weghalen maakt het bestand
wél onbereikbaar, want er is geen pad meer om te ondertekenen. Dat is de grens
van wat hier haalbaar is, en het staat ook in `docs/DEPLOY.md`.

⚠️ **Een groep verwijderen laat wezen achter**, want de cascade raakt alleen
`chat_messages`. Een opruimpas hoort een eigen issue te zijn: een `delete` over
`storage.objects` valt onder grens 2 van de beslisbevoegdheid en verdient een
dry-run.

## 5. De ondertekende URL is een tweede pad, en dat blijft zo

Een ondertekende URL is een bearer token: eenmaal getekend werkt hij een uur voor
iedereen die hem heeft, ongeacht RLS. Een groepslid kan hem dus buiten de groep
plakken. **Dat is niet te sluiten en het hoort expliciet aanvaard te zijn** — het
is dezelfde klasse als een schermafdruk, en de rem is de geldigheidsduur (één
uur, niet meer). Wat wél gesloten is: een **niet-lid** kan er zelf nooit een
tekenen.

## 6. Type en grootte: wat de bucket wél en niet doet

`allowed_mime_types` toetst de **gedeclareerde** header en niet de bytes. Een
willekeurig bestand met `content-type: image/png` landt dus in de bucket.

Dat is geen lek, en waarom niet is een eigenschap van de consument: het wordt
uitgeleverd vanaf een andere origin, met de opgeslagen content-type, en beland in
een `<Image>` — willekeurige bytes renderen niet en voeren niets uit.

⚠️ **De uitzondering is SVG, en dat is de enige echte reden dat de lijst smal
is.** Een SVG is renderbare HTML met script erin. Vandaar dezelfde drie typen als
`avatars`, en de extensie staat bovendien in de pad-CHECK: twee onafhankelijke
sloten op hetzelfde.

Wat overblijft is **opslag als kostenvector** — geen lek, wel geld op een gratis
tier — en daarvoor is de teller er, niet de MIME-lijst.

⚠️ **Wat deze repository niet bewijst.** `file_size_limit` en
`allowed_mime_types` worden door de storage-diénst afgedwongen en niet door de
tabel. `docs/ENGINEER-REVIEW.md` draagt daar sinds 28-08 een rij over, met
*"Wordt zwaarder als: er een tweede bucket bij komt, óf zodra er een echte
gebruiker uploadt"* — dit issue vervult beide voorwaarden. De twee metingen tegen
het échte project (een bestand van 3 MB, en een PDF met een vervalste
content-type) horen bij de livegang en niet bij deze branch.

## 7. De grenzen, en waarom ze zo staan

| | Waarde | Waarom |
|---|---|---|
| Bestandsgrootte | **1 MB** (`// TODO(paid-tier)`) | niet de 2 MB van `avatars`: een avatar schaalt met accounts, een chatfoto met gesprekken. De gratis tier geeft 1 GB voor álles samen |
| Per groep per etmaal | **20** (`// TODO(paid-tier)`) | een rem tegen het vollopen van de gratis tier, geen productkeuze |
| Geldigheid van de link | **1 uur** | zie §5 |

⚠️ De teller is een **trigger** en geen policy: een subquery op `storage.objects`
in een policy óp `storage.objects` geeft `infinite recursion detected in policy`
(gemeten in 0130). Hij telt per groep en **per etmaal**, waar `avatars` per
gebruiker en zonder venster telt — een avatar is er één, een groep praat door.

⚠️ Er ligt een **partiële index** onder die teller. Hij filtert op een functionele
expressie en draait op het schrijfpad van élke upload; zonder index is dat een
scan over de hele objecttabel. 0130 kwam daarmee weg omdat `avatars` klein is.

## 8. De naad, en wat hem bewaakt

**Het object en de rij zijn twee onafhankelijk geautoriseerde dingen die de app
als één ding presenteert.** `chat_messages_select` beslist over de rij,
`chatfotos_select` over het object, en niemand legt ze naast elkaar. Daar bovenop
liggen drie levensduren die niet gelijklopen: het object overleeft de rij, de rij
overleeft de autorisatie (dossier 002 §3), en het lidmaatschap overleeft geen van
beide.

`tests/rls/een-foto-verlaat-zijn-groep-niet.test.ts` bevraagt daarom **vier
routes** naar hetzelfde pad — het opslagobject, `groepschat()`, een kale select op
de tabel, en een select op alleen de kolom — met voor elke route een must-allow en
een must-deny.

📏 **Die test verdient zijn plek, en dat is gemeten.** Met `chat_messages_select`
gemuteerd naar `shares_group_with_user(sender_id)` gaat hij op drie routes rood
terwijl `chatfotobucket.test.ts` 20/20 groen blijft. De onderdeeltests kunnen die
naad per definitie niet zien.

## 9. Wat hier bewust niet in zit

- **Een foto als bewijs bij een voltooiing.** Eigen issue (QS8-391), want de twee
  helften willen het **tegenovergestelde** antwoord op de AVG-vraag.
- **Documenten** (`type = 'doc'`). De CHECK staat het toe sinds 0001; er komt geen
  schrijver bij.
- **Een foto in een systeembericht.** Nooit: `plaats_systeembericht()` raakt
  `attachment_url` niet aan, en de CHECK van 0222 sluit `type = 'system'` uit.
- **Serverzijdige verkleining of thumbnails.** Vraagt een Edge Function of een
  betaalde transformatie-API.
- **De opruimpas voor wezen.** Zie §4c.
