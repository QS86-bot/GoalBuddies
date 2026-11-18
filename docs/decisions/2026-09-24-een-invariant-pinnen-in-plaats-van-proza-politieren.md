# Een invariant pinnen in plaats van proza politieren

**24-09-2026 — QS8-613.** Voortgekomen uit dossierrij **169** (06-09-2026).

## De vraag die openstond

De duurste regel van QS8-293 stond niet in een migratie maar als toelichting in
een test: *"die kolom staat niet in de UPDATE- of INSERT-grant van
`authenticated`, en dat hoort zo."* De invariant was precies goed. De
vaststelling was onwaar — `0057` versmalde alleen de UPDATE-grant, en de
INSERT-grant was nog de standaard die Supabase via `alter default privileges`
uitdeelt: **álle** kolommen. Er stond geen query naast, dus er werd niets rood
van, en de belofte van een hele migratie hing eraan.

Rij 169 laat achter: *schrijf een grant, een policy of een default nooit op als
feit zonder de query erbij die het meet — en zet die query in een test, niet in
een commentaarregel.* En als voorwaarde: **wordt zwaarder als er meer plekken
komen waar een invariant in proza wordt vastgelegd.**

Die voorwaarde is ingetreden. De vraag was wat je eraan doet.

## De voor de hand liggende grendel kan niet, en dat is gemeten

Het precedent lag klaar: `uitrolproza:controle` telt prozabeweringen over de
productiestand na en wordt rood als een rij een verlopen getal draagt. Hetzelfde
zou hier moeten kunnen.

📏 **Het kan niet, en het getal zegt waarom.** **176** bestanden noemen een
grant: 65 in `docs/`, 82 in `tests/`, 16 in `src/`, 13 in `scripts/`. Precies
**één** regel in de hele boom draagt de letterlijke vorm die een script zou kunnen
natellen (`(7 kolommen INSERT, 3 UPDATE)`), en dat is de dossierrij die deze vraag
stelde. Geteld op `abe6dda^`, de stand waarop dit besluit genomen is:

```bash
git grep -l -i -w -E 'grants?' abe6dda^ -- docs tests src scripts | wc -l          # 176
git grep -n -E '\([0-9]+ kolommen INSERT, [0-9]+ UPDATE\)' abe6dda^              # 1 regel
git grep -n -i -E '\b([0-9]+|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)\b (ongebruikte )?(kolommen|kolomrechten|schrijfrechten)\b' \
  abe6dda^ -- docs/ENGINEER-REVIEW.md | wc -l                                    # 21
```

⚠️ **De derde regel is de ruimere vorm, en die bestaat wél.** 📏 21 dossierregels
dragen een getal of telwoord bij *kolommen*, *kolomrechten* of *schrijfrechten*, en
**11** daarvan gaan over een grant: de regels 150, 169, 174, 222, 228, 369, 441,
479, 554, 627 en 629 op `abe6dda^`. Bijvoorbeeld *"23 ongebruikte kolomrechten"*
(554), *"UPDATE op vier kolommen van `approval_withdrawals`"* (479) en *"Zeven
schrijfrechten staan open"* (627). Elk staat in een eigen zinsvorm. Dat maakt de
conclusie hieronder sterker en niet zwakker: er zijn veel telbare beweringen, en
geen gedeelde vorm om er een controle op te bouwen.

⚠️ **De andere tien gaan niet over een grant, en het commando onderscheidt dat
niet.** 📏 Met de hand gelezen: twee over een trigger (482, 605), drie over de vorm
van een tabel (507, 721, 730), één over een tekstlengte (219) en vier over iets
anders (243, 313, 744, 808). Hier stond tot QS8-645 *"pint negen kolommen"* (605)
als voorbeeld van een grantvorm; dat gaat over `guard_group_update`, een trigger.
Het commando telt wat het belooft, een telwoord bij een van drie woorden, en niet
of de zin over een grant gaat. Dat onderscheid is handwerk, en dat is opnieuw de
reden dat hier geen controle op te bouwen is.

⚠️ Hier stond tot QS8-632 *"138 bestanden — 53 in `docs/`, 50 in `tests/`, 25 in
`src/`, 10 in `scripts/`"*, zonder het criterium waarmee geteld was. 📏 Geen enkel
`git grep`-net op `abe6dda^` komt erop uit (`grant` geeft 234, `grant\b` 211,
`\bgrant` 193, `\bgrants?\b` 176), en `src/` lag in die telling hóger dan in het
smalste net terwijl `tests/` lager lag. Het was dus niet een strengere variant van
hetzelfde net, maar een criterium dat nergens stond.

⚠️ `uitrolproza:controle` werkt juist doordat de uitrolstand **één getal op één
bekende plek** is. Een grant is dat niet: hij is een tabel, een kolom, een
rechtensoort en een rol, en elke schrijver noemt daar een andere deelverzameling
van in een andere zin. Een controle die dat probeert te beoordelen, geeft vals
alarm op tientallen plekken — en dit project weet wat een controle met die
trefzekerheid wordt: eentje die je leert overslaan (QS8-415).

## Wat wél kan: de andere kant op

De rij vraagt *een query naast elke bewering*. De duurzame vorm daarvan is niet
per bewering een query, maar **één toets die de eigenschap over het hele schema
vastlegt**. Dan is elke bewering ertegen te houden, en gaat elke wijziging rood —
ook een wijziging in een tabel die niemand met de hand aan een lijst heeft
toegevoegd.

⚠️ Dat is regel 18 vraag 2. De drie toetsen die rij 169 noemt pinnen
`commitments` en `goals`; dat zijn **onderdelen**. De belofte is een eigenschap
van het geheel.

📏 Gemeten op een lokaal opgebouwd schema (301 migraties), uit
`information_schema.column_privileges`:

| vraag | uitkomst |
| -- | -- |
| tabellen met een INSERT/UPDATE-kolomgrant voor `authenticated` | 25 |
| tabellen waar die grant álle kolommen dekt — de faalvorm van QS8-293 | **0** |
| `created_at` of `updated_at` in een schrijfgrant | **nergens** |

`tests/rls/kolomgrants.test.ts` legt beide vast.

## ⚠️⚠️ De ijking staat in het bestand en niet in een handeling

Een toets die zegt *er is geen tabelbrede schrijfgrant* ziet er precies zo uit
als een toets die niets meet. Beide zijn groen, en het verschil is van buiten
niet te zien.

Daarom zet elke lezer in dit bestand **eerst zelf een kapot geval neer** — een
tabel met een tabelbrede grant, een kolom `created_at` met een UPDATE-recht —
binnen een transactie die terugrolt, en eist dat hij het vindt. Pas daarna
betekent de groene invariant-toets ernaast iets.

📏 **Nagemeten door de lezer blind te maken** (`return []` bovenaan): dan valt
**alleen** de ijkingstoets om, en blijft de invariant-toets groen. Dat is
precies het bewijs dat dat groen zonder ijking niets zou hebben betekend —
regel 18 vraag 3, aan een levend geval.

⚠️ Het voordeel van een ijking in het bestand boven een ijking met de hand is
dat hij meereist. Een handmatige mutatie bewijst iets over de dag waarop je hem
uitvoerde; deze bewijst het elke run.

## Wat er onderweg gevonden is en geen bevinding bleek

📏 `id` staat in de UPDATE-kolomgrant van vijf tabellen. Dat leek een gat en is
het niet: alle vijf dragen een UPDATE-policy met `using false`, gemeten met
`pg_get_expr()`, dus geen client kan die tabellen überhaupt updaten.

⚠️ Het is wél een lading die op één handeling wacht, en dus een eigen rij met een
vervalvoorwaarde: drie van die vijf zijn woordelijk de `false`/`false`-policies
die rij **454** bij naam noemt. Draait iemand er ooit een open om één geval door
te laten, dan wordt in diezelfde beweging de primaire sleutel schrijfbaar van een
tabel die een auditspoor draagt.

Het `revoke` staat er niet in deze ronde, om twee redenen: het is een migratie en
dus de andere baan, en er is vandaag niets kapot — dus het is een opruiming met
een eigen afweging en geen reparatie.

## Wat hier niet mee besloten is

Rij 169 gaat niet dicht. Wat daar openstaat is een **gewoonte**, en die meet je
niet aan één toets. Wat eruit gaat is de vraag óf er een mechanische vorm voor
bestaat: die is nu gemeten, en het antwoord is nee.
