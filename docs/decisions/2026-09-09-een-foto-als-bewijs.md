# Een foto als bewijs bij een voltooiing

**Datum:** 09-09-2026 · **Issue:** QS8-391 (PRD 7.3b) · **Migraties:** 0227 t/m 0231

Dit document staat naast `2026-09-09-een-foto-in-de-chat.md` en verwijst er
voortdurend naar. Dat is met opzet: de twee helften zien er identiek uit en
beslissen twee keer het tegenovergestelde.

## 1. Een eigen bucket, en waarom hergebruik hier niet kon

`chatfotos` (0222) is `<group_id>/<sender_id>/<naam>` en leest op
`mag_groep_lezen(segment 1)`. Een chatbericht hangt aan precies één groep. Een
voltooiing hangt aan een weekdoel, dat aan een doel hangt, dat aan **nul of meer**
groepen hangt. Die vorm hier hergebruiken breekt op drie plaatsen:

| | Wat er misgaat |
|---|---|
| **Nul groepen** | een solo-doel heeft geen `group_id`. Geen sleutel, dus óf de solo-gebruiker kan geen bewijs plaatsen, óf er komt een sentinel in het pad — en een sentinel in een autorisatiesleutel is een tak die maar in één modus bestaat |
| **Twee groepen** | je kiest er één bij het uploaden. `completions_select` kent geen groepsvoorkeur, dus een beoordelaar uit de ándere groep leest de rij wél en de foto **niet**: hij krijgt bewijs voorgeschoteld dat hij niet kan inzien |
| **De koppeling beweegt** | het pad ligt vast op uploadmoment, `goal_group_links` niet. Koppel het doel morgen aan een derde groep en het publiek van de rij groeit terwijl dat van het object blijft staan — twee autorisaties die over tijd uit elkaar lopen zonder dat iets rood wordt |

⚠️ **En de avatar-vorm `<user_id>/<naam>` (0126) is hier een écht lek**, niet
alleen een mismatch. Die leest op `shares_group_with_user()`, dus iedereen die
één groep met je deelt zou élke bewijsfoto van je lezen — óók die van een doel
dat aan géén groep hangt en dus voor niemand zichtbaar is. Dat is oppervlak 24
uit dossier 002 in een derde verpakking, en het is strenger dan de Carol-meting
van 0222.

📏 Mutatie M1 in `tests/rls/een-bewijsfoto-volgt-zijn-voltooiing.test.ts` zet die
vorm terug en maakt drie gevallen rood.

## 2. ⚠️⚠️ De policy kopieert het predicaat niet — hij stelt de vraag

**Dit is de belangrijkste beslissing in dit issue, en de eerste versie had hem
fout.**

De voor de hand liggende vorm is: schrijf `completions_select` over in een
hulpfunctie. Dat is gedaan, letterlijk overgetypt:

```sql
owner_id = auth.uid() or shares_group_with_goal(g.id)
```

Dat lijkt een getrouwe kopie. Het is er geen.

📏 **De meting.** Beschermde groep, doel eraan gekoppeld, Bob is actief lid, het
weekdoel staat op `missed`:

```
shares_group_with_goal(doel)  = true
Bob ziet het weekdoel         = 0
Bob ziet de voltooiing        = 0
Bob ziet het OBJECT           = 1     ← het lek
```

**`completions_select` erft het statusfilter van `weekly_goals_select`, en dat
staat nergens in zijn eigen tekst.** Zijn `exists` leest `weekly_goals`, en
**RLS geldt óók binnen een policy-subquery**. Staat het weekdoel op `missed`,
`carried`, `cancelled` of `excused`, dan is de voltooiing onzichtbaar voor een
groepsgenoot — via een filter dat in `completions_select` niet voorkomt.

Een `security definer` hulpfunctie omzeilt precies die overerving. Het onderdeel
klopte; het geheel lekte. En wat het lekte was **de gemiste week van iemand
anders**, precies waar domeinregel 7 voor bestaat.

⚠️ **De reparatie is níet "het statusfilter erbij kopiëren".** Dan staat er een
tweede kopie die opnieuw kan verlopen, en dat is de vorm die onwrikbare regel 18
zeven keer heeft zien mislukken. De policy stelt nu de vraag:

```sql
exists (select 1 from completions c where c.attachment_url = name)
```

met `mag_bewijsfoto_lezen()` nadrukkelijk als **`security invoker`**. De RLS van
`completions` beslist, inclusief alles wat die transitief erft. Verandert
`completions_select` ooit, dan beweegt dit oppervlak vanzelf mee. **Er is niets
meer om uit de pas te laten lopen.**

📏 Mutatie M2 zet de definer-vorm terug en reproduceert het lek op precies één
geval; mutatie M8 maakt de functie te streng en maakt de must-allow rood. Die
tweede is er zodat de nullen in de eerste iets betekenen.

⚠️ Er ligt een partiële index onder die lookup
(`completions_attachment_url_idx`): hij draait op het leespad van élke
ondertekening.

### 2a. ⚠️⚠️ Dezelfde overerving werkt óók de andere kant op — A41

**Dit stond hier eerst niet, en de eerste versie van dit document beweerde het
tegenovergestelde.** Er stond in dossier 002 bij rij 33: *"`completions_select`
heeft géén open-groepstak, dus een open groep krijgt hier niets extra's."*

Dat is dezelfde denkfout als §2 hierboven repareert, één laag hoger. Als
`completions_select` het **statusfilter** erft van `weekly_goals_select`, dan erft
hij ook de **open-groepstak** — het is één en dezelfde subquery.

📏 Gemeten met dezelfde kijker, hetzelfde doel en dezelfde **gemiste** week, en
alleen `groups.zichtbaarheid` omgezet:

```
BESCHERMD  Eve: weekdoel=0  voltooiing=0  OBJECT=0
OPEN       Eve: weekdoel=1  voltooiing=1  OBJECT=1
```

⚠️ **Het gedrag is juist en het is geen lek.** Een open groep ziet tegenslag —
dat is besluit A41, en het is de hele reden dat die stand bestaat. En het object
is nergens ruimer dan de rij: het erft precies dezelfde tak, wat is wat §2
belooft.

⚠️ **Wat wél fout was, is dat het nergens als besluit stond.** CLAUDE.md is
expliciet: *"Voor élk níeuw oppervlak is beschermd het antwoord tot iemand het
tegendeel besluit."* Hier was "open ziet het ook" een **erfenis** en geen keuze,
en het register waar de volgende lezer op afgaat zei het omgekeerde. Dat is
precies de klasse fout die dit dossier bestaat om te voorkomen.

⚠️ **En geen enkele controle kón het vinden.** `zichtbaarheid:controle` zoekt
tekstueel naar `open_groep` of `zichtbaarheid` in policies en functielichamen;
`bewijsfotos_select` noemt geen van beide — hij erft ze via twee lagen.
**Een geërfde verruiming is voor een grep onzichtbaar.** Vandaar dat
`tests/rls/een-bewijsfoto-volgt-zijn-voltooiing.test.ts` er sinds 09-09 een
must-allow én een must-deny op draagt: die toetst het gedrag en niet de tekst.

### 2a. De eigenaarstak is geen `or`-gat

`(storage.foldername(name))[2] = auth.uid()` staat erbij, want tussen de upload
en de insert bestaat de voltooiing nog niet — `rondAf()` uploadt eerst, omdat
`attachment_url` alleen bij INSERT te zetten is. In dat venster zou de eigenaar
zijn eigen net geplaatste bestand niet mogen lezen, en de compenserende
opruiming na een mislukte insert zou ook niet kunnen.

⚠️ Dat is per constructie geen verruiming: de insertpolicy laat je uitsluitend in
je eigen map schrijven **en** alleen onder een weekdoel dat van jou is. Deze tak
kan dus alleen objecten raken die je zelf mocht aanmaken.

## 3. De kolomgrens is een CHECK en geen policy

Zelfde zin als bij 0223, en om dezelfde reden: **RLS beslist over rijen en niet
over kolommen.** De eis is "wat mag er in deze kolom staan", en dan is een policy
per definitie te weinig.

⚠️ **Een vormtoets en geen prefixtoets, en dat is de vierde keer.** 0127 zette
deze grendel op `profiles.avatar_url` met een `like`, en 0129 moest erbovenop
omdat `<mij>/../<ander>/a.png` daar doorheen liep.

📏 Acht gevallen gemeten tegen de echte database:

```
GEACCEPTEERD  <eigen weekdoel>/<eigen id>/bewijs.jpg
GEACCEPTEERD  (geen bijlage)
geweigerd     <eigen weekdoel>/<andere id>/bewijs.jpg
geweigerd     <ander weekdoel>/<eigen id>/bewijs.jpg
geweigerd     https://volgmij.example/pixel.gif
geweigerd     <eigen weekdoel>/../<eigen id>/bewijs.jpg
geweigerd     <eigen weekdoel>/<eigen id>/bewijs.svg
geweigerd     <eigen weekdoel>/<eigen id>/b.jpg\nhttps://kwaad.example/a.png
geweigerd     <EIGEN WEEKDOEL IN HOOFDLETTERS>/<eigen id>/bewijs.jpg
```

⚠️ **Geen null-tak zoals in 0223.** Daar moest `type <> 'system'` erbij omdat een
systeembericht geen afzender heeft. Hier zijn `weekly_goal_id` en `user_id`
allebei `not null`. Dat staat opgeschreven omdat de afwezigheid ervan anders als
vergissing leest.

## 4. ⚠️⚠️ Het AVG-antwoord is het tegenovergestelde van wat het issue vroeg

Het issue zei: *"de bewijsfoto **blijft** bij accountverwijdering, langs dezelfde
scheidslijn als 0031 — hij is bewijs voor iemand anders."*

Dat klinkt goed en het is onhoudbaar.

📏 **De meting.** Een voltooiing mét bijlage, en dan `delete from profiles`:

```
voor:  completions = 1
na:    completions = 0, weekly_goals = 0, goals = 0

completions_user_id_fkey        ... on delete cascade
goals_owner_id_fkey             ... on delete cascade
completions_weekly_goal_id_fkey ... on delete cascade
```

**De rij cascadeert weg.** "De foto blijft" levert dus geen bewijs op voor wie
dan ook — het levert een **wees** op: een blob waar geen rij naar wijst, die
niemand meer kan lezen (de leespolicy zoekt een weekdoel dat niet meer bestaat),
die niet meer te vinden is, en die wél de gratis tier vult. Dat is de slechtste
van de drie uitkomsten: géén bewijs én een portret dat een wissingsverzoek
overleeft zonder grondslag.

### 4a. De scheidslijn van 0031 wijst hier juist de andere kant op

0031 trekt de lijn bij *"voor wie is de rij bewijs"*, en zet `completions` met
zoveel woorden aan de cascadekant:

> *"Ze horen bij jou: je voltooiingen, en de goedkeuringen die over jouw weken
> gaan. Dat de goedkeuring van een ander daarmee ook weggaat is juist: hij was
> bewijs over jou, en jij bent er niet meer."*

De juiste formulering is daarom niet "chatfoto weg, bewijsfoto blijft" maar:

> **een bewijsfoto is bewijs vóór een ander zolang de voltooiing bestaat;
> verdwijnt de voltooiing, dan is er geen bewijs meer om te bewaren.**

Dat is dezelfde zin die 0031 over de goedkeuring gebruikt, en **dán** is de
scheidslijn wél dezelfde als die het issue bedoelde.

⚠️ **Wat er niet gekozen is, en waarom niet.** De rij laten staan
(`completions_user_id_fkey` naar `on delete set null`) zou de foto écht bewijs
laten blijven. Dat raakt `award_points_on_approval`, `openstaande_beoordelingen`,
`herbereken_reeks`, `dien_opnieuw_in` en `completions_insert`, en het is een
herziening van besluit A3 van 18-08-2026. Dat is een besluit van Quinten en geen
bijvangst van dit issue. **Grens 1 van de beslisbevoegdheid raakt hier niet: de
conservatiefste optie die het werk áf maakt, is de foto mee laten gaan — meer
wissen en niet minder.** De aanname staat in het issue.

### 4b. Deze trigger repareert geen fout — hij is een besluit

Dat is het verschil met 0224, en de vorm lijkt genoeg op elkaar om het te moeten
opschrijven. Daar brak accountverwijdering **zonder** de trigger op een 23514.
📏 Hier slaagt de verwijdering ook zonder 0230; wat er zonder achterblijft is de
wees.

⚠️ **Wat SQL niet kan.** Een `delete from storage.objects` haalt de metadata-rij
weg; de blob blijft. Zelfde grens als bij 0224, met dezelfde open Laag-rij in
`docs/ENGINEER-REVIEW.md`.

## 5. `note_and_attachment` terug — de opdracht van 0150

0150 haalde die waarde weg omdat hij op zes plekken bestond en op nul plekken werd
afgedwongen, en schreef in zijn kop:

> *"Dit is geen afwijzing van de bijlage. Zodra er een uploadpad neerstaat, komt
> `note_and_attachment` terug — mét een trigger die hem afdwingt en een test die
> rood wordt als die tak verdwijnt."*

0227 t/m 0229 zetten dat pad neer; 0231 is de tweede helft. **De volgorde is de
hele les: de handhaving eerst, de keuze daarna.**

📏 De ijking: de bijlagetak uit `enforce_evidence_policy()` halen maakt twee
tests in `tests/rls/bewijseis.test.ts` rood.

⚠️ **`dien_opnieuw_in()` was de vergeten schrijver.** Hij voegt zelf een
`completions`-rij in en gaf `attachment_url` niet mee, dus onder de nieuwe eis kon
een gebruiker na *"vertel me meer"* nooit meer opnieuw indienen. En zijn
`exception when check_violation` vertaalde **élke** 23514 naar `note_required` —
waar zolang er één eis was, een verkeerde diagnose zodra er twee zijn. Dat is
onwrikbare regel 18 vraag 6: dit issue tilt "er is er altijd precies één" naar
"er kunnen er meer zijn", en dan staat de fout er al zonder dat iemand hem heeft
kunnen zien.

## 6. De grenzen, en waarom ze zo staan

| | Waarde | Waarom |
|---|---|---|
| Bestandsgrootte | **1 MB** (`// TODO(paid-tier)`) | zelfde als `chatfotos`; 1 GB voor het hele project, gedeeld met drie buckets |
| Per uploader per etmaal | **10** (`// TODO(paid-tier)`) | een bewijsfoto hoort bij een weekdoel, en niemand rondt er tien per dag af |
| Geldigheid van de link | **15 minuten** | zie hieronder |

⚠️ **Eén teller en niet twee, anders dan 0226 — en dat is een bewuste
afwijking.** Daar bestaan er twee omdat ze verschillende partijen beschermen: het
groepsplafond de opslag, het lidplafond de andere leden. Hier is er geen tweede
partij: de insertpolicy laat je uitsluitend in je eigen map onder je eigen
weekdoel schrijven, dus niemand kan een ander stilleggen.

⚠️ **De ondertekende URL is een bearer token, en hier weegt dat zwaarder dan bij
de chat.** Eenmaal getekend werkt hij voor iedereen die hem heeft, ongeacht RLS.
Niet te sluiten — dezelfde klasse als een schermafdruk — en de geldigheidsduur is
de enige rem. Een chatfoto wordt doorgescrold en opnieuw bekeken; een bewijsfoto
wordt één keer bekeken bij het beoordelen. Vandaar een kwartier en geen uur: dat
kost niets en scheelt drie kwartier blootstelling.

## 7. De naad, en wat hem bewaakt

**Het object en de rij zijn twee onafhankelijk geautoriseerde dingen die de app
als één ding presenteert** — zelfde naad als bij de chatfoto. Maar er komt een
laag bij die daar niet bestond: **er liggen drie predicaten over dezelfde foto en
ze lijken uitwisselbaar.**

| | Publiek |
|---|---|
| `completions_select` | de **rij** — en transitief het statusfilter van het weekdoel |
| `weekly_goals_select` | het **weekdoel** waar het pad op gesleuteld is |
| `openstaande_beoordelingen()` | de **beoordelaar** — actief lid, niet jezelf, `pending`, nog niet geoordeeld |

Elk van de drie is correct. Het object hangt aan de eerste. De naad is dat het
pad naar de tweede wijst en de app de derde toont.

`tests/rls/een-bewijsfoto-volgt-zijn-voltooiing.test.ts` bevraagt daarom vier
routes, elk met een must-allow én een must-deny, plus het solo-doel, het
lidmaatschap dat eindigt, en de accountverwijdering.

## 8. Wat hier bewust niet in zit

- **Meer dan één foto per voltooiing.** `attachment_url` is één kolom; een
  `attachments`-tabel is een eigen besluit.
- **Een foto bij een Dagzet.** Domeinregel 9: die levert nooit goedkeuring op,
  dus er is niets te bewijzen.
- **Serverzijdige verkleining of thumbnails.** Vraagt een Edge Function of een
  betaalde transformatie-API.
- **Een opruimpas voor wezen.** Een verwijderd weekdoel of doel laat het object
  staan; er is geen cascade van `completions` naar `storage.objects`. Eigen
  issue: een `delete` over `storage.objects` valt onder grens 2 van de
  beslisbevoegdheid en verdient een dry-run. Zelfde vorm als §4c van het
  chatfotodossier.
- **Het samenvoegen van `chatfoto.ts` en `bewijsfoto.ts`.** De duplicatie is
  bewust betaald en staat in beide bestandskoppen. Samenvoegen is een
  opruimissue — en het is een verhuizing, dus de beloftes moeten mee.
