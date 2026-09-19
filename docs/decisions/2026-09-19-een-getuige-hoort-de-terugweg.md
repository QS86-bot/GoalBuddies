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

📏 **Er is precies één functie die een straf van `due` terugzet naar `set`:**
`beslis_deadline_verzoek()`. Gebeurt dat, dan **is** de getuige ingelicht
geweest, verliest die kennis stil haar geldigheid, en kan de straf daarna via de
gewone intrekknop verdwijnen zonder dat er ooit iets rechtgezet is.

⚠️⚠️ **Hier stond eerst "drie functies", mét een 📏, en dat was onwaar.** De
andere twee kwamen uit een zoekopdracht die een `where`-predicaat en een
commentaarregel niet van een `set`-clausule onderscheidde. 📏 Hermeten met
`code_zonder_commentaar()` uit 0292: precies één regel in het hele schema luidt
`set status = 'set'`. Gevonden in de security-ronde op dit issue.

⚠️ **Het is dezelfde fout die 0292 één dag eerder repareerde**, en dat maakt hem
leerzaam in plaats van alleen gênant: daar las een bewaking commentaar als code,
hier las ík dat. Een 📏 betekent in dit project *dit is gemeten*; een grep is
geen meting zolang hij commentaar en predicaten meetelt.

⚠️⚠️ **En het verschil draagt de hele scope.** Met drie oorzaken leest
`commitment_reverted` als vaag; met één is hij eenduidig — de melding zegt dan
onvermijdelijk *"er is een uitstelverzoek ingewilligd"*, hoe neutraal de woorden
ook zijn. Zie §"Wat er alsnog open ligt".

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

---

## Wat de security-ronde vond, en wat er daarna is veranderd

De `security-reviewer` (onwrikbare regel 19) noemde de wijziging blokkerend. Drie
dingen daaruit zijn zelf nagemeten en verwerkt; de rest staat als rij in
`docs/ENGINEER-REVIEW.md`.

### 1. Het bereik ging verder dan het besluit — en dat lag aan de foute meting

📏 **End to end nagespeeld:** alice zit in G1 (met bob) en G2 (met dave), haar
doel hangt **alleen** aan G2, en haar persoon-getuige is **bob uit G1**. Dave
willigt het uitstel in → `teruggedraaide_straffen_voor(bob)` gaf **1 rij**.

Bob hoorde dus iets over een uitstel in een groep waar hij niet in zit. Dat kan
doordat `commitments_insert` alleen `shares_group_with_user()` eist: een getuige
deelt *een of andere* groep met de eigenaar, niet per se de groep waar het doel
aan hangt.

⚠️⚠️ **En dit was alleen te zien mét de gecorrigeerde meting.** Met "drie
mogelijke oorzaken" leest de melding als vaag genoeg; met één oorzaak is ze
eenduidig, en dan is de vraag *wie hoort dit* ineens een vraag over domeinregel
7. **De foute 📏 was niet naast de bevinding — hij verborg haar.**

**Besluit van Quinten (19-09-2026): beperken tot een gekoppelde groep.** De
getuige krijgt de melding alleen als hij lid is van een groep waar het doel aan
hangt. Dat sluit bob uit, en het houdt de melding binnen de kring die het doel
al kent.

⚠️ **Dit blijft een verruiming van rij 31 en geen gelijkmaking.** Rij 31 (QS8-370)
gaat over de **gevraagde** groep; hier mag óók een lid van een ándere gekoppelde
groep het horen. Bewust zo besloten, en het staat als **rij 40** in
`docs/decisions/002-domeinregel7-oppervlakken.md`.

### 2. De must-denies bewezen niets zonder positieve controle

📏 `teruggedraaide_straffen_voor()` op een willekeurige uuid geeft óók `''`. Elke
stille mislukking in de opstelling — een straf die niet aangemaakt werd, een
`heenEnTerug` zonder effect, een ontbrekend lidmaatschap — liet de must-denies
dus groen staan zonder iets te bewijzen.

Beide structurele must-denies dragen nu een positieve controle: dezelfde
opstelling met één conjunct omgedraaid moet de rij **wél** teruggeven. Pas dan is
het lege antwoord een eigenschap van de grendel en niet van een dode fixture.

⚠️ Dit is dezelfde les als bij mutatie A hierboven, één laag hoger: daar was de
*mutatie* niet scherp genoeg, hier de *opstelling*.

## Wat er alsnog open ligt

Drie dingen zijn gemeten en bewust niet in dit issue gerepareerd; ze staan met
datum 19-09-2026 in `docs/ENGINEER-REVIEW.md`:

1. **Wordt de straf ná de teruggang ingetrokken vóór de job draait, dan hoort de
   getuige nooit meer iets.** 📏 Gemeten. Dit is precies het gat dat QS8-321
   wilde dichten, en het blijft open.

   ⚠️ **En de reden die er in dit document voor stond, is te breed.** "Een
   bericht bij intrekken kan niet zonder domeinregel 11 te schenden" geldt voor
   een getuige die niets weet — niet voor een die al een `commitment_witness`
   draagt. Voor hém zou dezelfde conjunct het dekken. Het besluit mag hetzelfde
   blijven; de grond moet kloppen.

2. **Ná de terugmelding is een tweede keer `due` stil**, door de unieke index op
   `(user_id, kind, ref_id)`. Vóór 0293 verouderde de kennis van de getuige de
   veilige kant op; erna kan hij te horen hebben gekregen dat de straf niet meer
   verschuldigd is terwijl hij dat wél is. Dit document noemde die eenmaligheid
   *symmetrisch overgenomen van `commitment_witness`*, en symmetrisch is ze niet.

3. **`refTypeVoor()` heeft nog steeds geen test**, terwijl zijn eigen kop de
   klasse beschrijft waar hij ooit fout stond.
