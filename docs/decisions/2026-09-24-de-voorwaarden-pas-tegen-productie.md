# De voorwaarden-pas, één keer gedraaid tegen productie

**Datum:** 24-09-2026
**Issue:** QS8-596
**Status:** gedraaid
**Raakt:** `docs/ENGINEER-REVIEW.md` (rij 128, 495 en 849)

## 1. Wat dit is

De werkvolgorde van de dossierbaan is Hoog → Middel → **Laag-rijen waarvan de
voorwaarde is afgegaan**. De eerste twee zijn uitgeput; dit is de derde, en het
is de eerste keer dat hij met metingen tegen **productie** gedraaid is in plaats
van tegen de repo.

⚠️ Dat onderscheid is niet van mij maar van rij 128 zelf: _"een Laag-rij
beschrijft risico op wat er **draait**, en bijna elke meting gaat over de repo."_
📏 Die rij noemt het geval waar dat misging — productie stond op `0221` en de map
op 255, dus drie rijen over vier opslagemmers gingen over een productie met één
emmer.

In een cloudsessie is dat normaal niet te repareren: acht controles staan
standaard op **ongemeten** omdat ze een database of een productiesleutel nodig
hebben, en dat zijn precies de productiegevoelige. De Supabase-MCP is hier wél
bereikbaar, en die kan lezen wat `psql` vanaf deze machine niet kan.

## 2. Wat er niet gebeurd is

⚠️ **Geen enkele rij is gesloten.** Dat is een keuze en geen tekort: van de drie
rijen die iets nieuws dragen, ging er één de **gúnstige** kant op (rij 128, de
achterstand is 0) en dat is geen bewijs dat de rij zijn werk niet meer hoeft te
doen. Een voorwaarde die wegdraait sluit de rij niet; alleen een bevinding die
aantoonbaar niet meer bestaat doet dat.

⚠️ **En er is geen script van gemaakt.** QS8-421 heeft dat afgewezen en die
afwijzing staat: of een aanname vervallen is, is geen patroon. Wat hier wél
verandert is dat de pas één keer gedraaid is en dat je in het dossier kunt zien
wanneer — dat was de vraag die rij 128 voor november openhoudt.

## 3. De drie rijen die een meting dragen die niet meer klopte

**Rij 128 — de achterstand is 0, niet 31.** 📏 De map en
`supabase_migrations.schema_migrations` dragen exact dezelfde **301** versies, in
beide richtingen vergeleken, met `0298` als hoogste en inclusief de drie
achtervoegsels `0039a`, `0041a` en `0052a`. De rij zei `0221` tegen 255; dat is
de stand van 11-09.

**Rij 849 — productie staat op `0298`, niet op `0282`.** `supabase/uitgerold.json`
is op 22-09 bijgewerkt en klopt; de rij citeerde een meting van 17-09. 📏 `0294`
is dus toegepast, bevestigd doordat productie **beide** vormen van
`maak_straffen_verschuldigd` kent.

⚠️ Dat verandert de **vorm** van het risico en niet zijn hoogte. Het argument was
dat een dropmigratie een harde volgorde-eis maakt _omdat productie achterloopt_.
Die grond is weg. Wat overblijft is uitsluitend de Edge Function — 📏 live
gemeten via de Management-API, en niet uit `uitgerold.json`, want dat bestand
gaat over migraties en niet over functies:

| functie        | laatst uitgerold     | versie |
| -------------- | -------------------- | ------ |
| `rollover`     | 2026-09-09 18:19 UTC | 24     |
| `notificaties` | 2026-09-09 18:19 UTC | 19     |
| `doelcoach`    | 2026-09-09 18:25 UTC | 20     |

De zin _"de gedeployde rollover is van 09-09"_ klopt dus nog steeds, vijftien
dagen later — en daarmee is **de klok van die voorwaarde zichtbaar** in plaats van
impliciet.

**Rij 495 — deze voorwaarde ís afgegaan.** _"Er structureel meer dan één sessie
tegelijk aan de voorraad"_ is sinds die rij (02-09) de werkwijze geworden. 📏 Wat
ertegenover kwam: `npm run claim` op 06-09 (QS8-294), gebouwd nadat er **op één
dag drie keer hetzelfde issue gebouwd was**, en op 13-09 verscherpt met de
gelande-PR-bron (QS8-449).

⚠️ **De rij is daarom aangevuld en niet gesloten**, want de helft die blijft is
de belangrijkste: een claim is een afspraak en geen slot. Niets in git houdt een
tweede branch tegen. Het bord blijft wat de rij zei dat het was — de enige rem,
nu met gereedschap eromheen.

## 4. Wat gemeten is en níet is afgegaan

Dit staat hier en niet in het dossier, omdat elf rijen aanvullen met _"vandaag
nog niet"_ het dossier langer maakt zonder het scherper te maken. 📏 Gemeten op
24-09-2026:

| rij      | voorwaarde                                                 | meting                                                                                                                           |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 259      | Supabase naar 18                                           | Postgres **17**                                                                                                                  |
| 197      | profielen boven de 200                                     | **1**                                                                                                                            |
| 313      | er zijn echte gebruikers                                   | **1** rij in `auth.users`, verder leeg                                                                                           |
| 131      | `push_tokens` raakt gevuld                                 | **0**                                                                                                                            |
| 126      | vanaf de eerste duizend objecten                           | `storage.objects` **0**                                                                                                          |
| 153, 155 | groepen groter dan twaalf                                  | grootste actieve groep **0**                                                                                                     |
| 280      | `authenticated` krijgt CREATE op `public`                  | **false**                                                                                                                        |
| 276      | `completion_approvals` krijgt een UPDATE- of DELETE-policy | **0**                                                                                                                            |
| 127      | een vierde Edge Function                                   | **3** — `_shared` is er geen                                                                                                     |
| 121      | een tweede `.sh` die psql zelf aanroept                    | **één**; `lokale-stack.sh` delegeert op regel 81, en de vlaggen van `psqlArgumenten()` en `schema-opbouwen.sh` komen nog overeen |
| 803      | meer dan twee parallelle sessies                           | **twee**                                                                                                                         |

⚠️ **Dat rij 313 en rij 128 allebei op "er is nog geen echte gebruiker" leunen is
geen toeval maar een afhankelijkheid.** 📏 Eén rij in `auth.users`, nul groepen,
nul objecten, nul tokens: dit is een ontwikkelaccount. Een flink deel van de
Laag-rijen in dit dossier staat op Laag **omdat de database leeg is**, en die
gaan op dezelfde dag tegelijk omhoog. Dat is de dag waarop deze pas geen
bijzaak meer is.

## 5. Wat een aanname blijft

- **De pas is handwerk en blijft dat.** Dit document bewijst dat hij één keer
  gedraaid is, niet dat hij opnieuw gedraaid wordt.
- **De elf metingen hierboven verouderen.** Ze dragen hun datum; dat is alles wat
  een meting kan doen.
- **De 287 open Laag-rijen zijn niet alle 287 nagelopen.** Wat er gedaan is: de
  voorwaarden zijn gelezen en de **mechanisch toetsbare** eruit gehaald — een
  telling, een versie, een aantal, een stand in productie. Voorwaarden van de
  vorm _"zodra iemand X schrijft"_ zijn niet te toetsen zonder de code te lezen
  die er nog niet is, en die staan hier bewust buiten.
