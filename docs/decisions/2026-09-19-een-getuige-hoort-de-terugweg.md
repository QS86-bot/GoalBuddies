# Een getuige hoort de terugweg, niet de intrekking

**19-09-2026 — QS8-321, migratie 0293**

## De vraag, en waarom het antwoord een ander werd

QS8-321 vroeg of een straf stilzwijgend mag verdwijnen. Het issue stelde dat de
persoon-getuige bij het **aanwijzen** een melding krijgt en bij het **intrekken**
niets — een asymmetrie die vanzelf om een reparatie vroeg.

Ik heb die stelling aan Quinten voorgelegd als meting, en **hij was fout.** Het
besluit dat erop volgde ("melden bij intrekken") was daardoor niet uitvoerbaar
zonder domeinregel 11 te breken. Het is herzien nadat de fout boven kwam.

Dat de fout in de úitvoering pas bleek en niet bij het voorleggen, is het
leerzaamste deel van dit issue. Zie §"Hoe de meetfout ontstond".

## Wat er werkelijk staat — gemeten op 0292

| moment | hoort de getuige iets | waarom |
|---|---|---|
| aangewezen (`set`) | **nee**, en hij kan de straf ook niet **lezen** | `commitment_zichtbaar_voor_persoon()` = `{due, resolved}` |
| verschuldigd (`due`) | **ja** — `commitment_witness` | `getuigenissen_voor()` heeft een gate op `c.status = 'due'` |
| ingetrokken | nee | 📏 `commitments_update` **USING** eist `status = 'set'` |

⚠️⚠️ **Daarmee is een bericht bij intrekken niet te bouwen.** Intrekken gebeurt
per definitie vanuit `set`, en in die toestand heeft de getuige nooit van de
straf gehoord én mag hij er niet van weten — *een straf die nog niet verschuldigd
is, bestaat voor de getuige niet*. De melding zou de eerste zijn die hij erover
hoort, en daarmee precies de onthulling die domeinregel 11 tegenhoudt.

**Er is dus geen asymmetrie van de soort die het issue beschreef.** De getuige
wordt één keer ingelicht, op het enige moment dat de regel toestaat.

## Wat er wél overbleef

📏 Drie functies kunnen een straf van `due` terugzetten naar `set`:
`beslis_deadline_verzoek()`, `guard_group_member_update()` en
`maak_straffen_verschuldigd()`. Gebeurt dat, dan **is** de getuige ingelicht
geweest, verliest die kennis stil haar geldigheid, en kan de straf daarna via de
gewone intrekknop verdwijnen zonder dat er ooit iets rechtgezet is.

Rij 165 van `docs/ENGINEER-REVIEW.md` merkt die teruggang al op: *"vandaag is de
teruggang naar `set` stil, en dan is de groep het enige dat het verschil zag."*
De persoon-getuige zag het niet.

## Het besluit (Quinten, 19-09-2026)

**Melden op de teruggang, niet op het intrekken.** De getuige hoort het op het
moment dat zijn kennis veroudert; daarna staat de straf op `set`, en dát is de
toestand die domeinregel 11 onzichtbaar houdt, dus een latere intrekking hoeft
niet apart gemeld.

**De intrekknop zelf blijft ongemoeid.** Intrekken blijft eenzijdig en gratis:
geen akkoord van de getuige, geen afkoelperiode, geen puntenprijs. Wat dat kost
staat in de rij: zolang er echte inzet of geld in zit, is dat een andere
afweging — en die staat als voorwaarde in `docs/ENGINEER-REVIEW.md` en niet als
stilzwijgen.

## De grendel die dit hele bestand draagt

`teruggedraaide_straffen_voor()` meldt alleen aan wie **eerder een
`commitment_witness`-melding kreeg**. Zonder die conjunct pleegt de reparatie
zélf de schending waarop het oorspronkelijke voorstel strandde, alleen langs een
andere route: de rollover kan een straf verschuldigd maken en
`beslis_deadline_verzoek()` kan hem terugzetten bínnen hetzelfde venster waarin
de notificatiejob nog niet gedraaid heeft. Dan staat er een `reverted`-rij in het
spoor terwijl er nooit een duw is uitgegaan.

**Je vertelt iemand alleen dat zijn kennis veroudert als hij die kennis had.**

## Wat er bewust níet gedeeld is

De melding zegt *wát* er veranderd is en niet *waaróm*. De weg terug van `due`
naar `set` loopt vandaag via een ingewilligd uitstelverzoek, en dat is precies de
tegenslag die domeinregel 7 uit andermans blikveld houdt. *"De streefdatum is
verschoven"* mag er dus niet staan, ook al is het de aanleiding.

Dezelfde schakelaar als de heenweg (`notify_commitment_witness`) en geen zesde:
wie kan aanzetten dat hij hoort dát een straf verschuldigd werd en kan uitzetten
dat hij hoort dat het niet meer zo is, houdt de helft van een verhaal over — en
juist de helft die hem geruststelt.

## Hoe de meetfout ontstond, want dat is de bruikbare les

Ik las `meld_commitment()` — de trigger die systeemberichten plaatst — zag daar
alleen een groepstak, en concludeerde *"de persoon-getuige hoort niets"*. Dat
klopt voor die functie. Maar de melding aan de persoon loopt helemaal niet langs
die weg: hij komt uit de edge-functie via `getuigenissen_voor()`, een pad dat
0178 er naast heeft gezet.

⚠️ **De fout is niet "ik heb iets over het hoofd gezien" maar "ik heb één
implementatie gelezen en daar een uitspraak over het gedrag op gebaseerd".** Het
gedrag is een eigenschap van het gehéél — trigger plus job plus RPC — en
precies dat onderscheid is waar onwrikbare regel 18 over gaat. Dat het hier een
*meting* betrof en geen test, maakt het niet anders: een meting aan één onderdeel
draagt geen uitspraak over de keten.

⚠️⚠️ **En de fout kwam pas boven bij het bouwen, niet bij het voorleggen** — dus
er is een besluit genomen op een onjuiste grond. Dat het herzien kon worden, is
geluk: de bouwstap raakte toevallig dezelfde functie. **Een meting die een
beslissing van een mens draagt, verdient de tweede bron vóór het voorleggen en
niet erna.**

## Wat de ijking opleverde

Vijf mutaties, elk op de echte database en teruggerold. Twee uitslagen zijn de
moeite waard:

📏 **A moest overgedaan worden.** Ik verving eerst alleen
`and n.kind = 'commitment_witness'` door `and n.kind is not null` — **0 rood**.
Niet omdat de toets niets bewaakt, maar omdat de must-deny-persoon hélemaal geen
rij in `notifications_sent` heeft: het `exists` bleef vals en de deur ging niet
open. **De mutatie was fout, niet de test.** Pas het weghalen van het hele
`exists`-blok bereikt de grendel die de toets noemt.

📏 **E deed niets, en dat staat in de testkop.** `bewaak_begunstigde()` (0168)
laat een rij waarin de eigenaar zijn eigen getuige is niet ontstaan, ook niet als
`service_role`. De conjunct `g.owner_id <> p_user_id` blijft staan als tweede
grendel op dezelfde deur, maar **geen enkele toets bewaakt hem** — en dat hoort
opgeschreven in plaats van aangenomen.

## Een gemeten grens die blijft staan

📏 `notifications_sent_per_onderwerp` is uniek op `(user_id, kind, ref_id)`, dus
een straf die twee keer heen en weer gaat, meldt één keer. Dat geldt net zo goed
voor `commitment_witness` zelf sinds 0178 — de tweede keer verschuldigd worden is
daar ook stil. Die eigenschap is hier overgenomen en niet opgelost; doorbreken
vraagt een andere sleutel dan `ref_id` en raakt beide soorten.
