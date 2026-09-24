# Stilte is geen gemiste week — en dat stond nergens

**24-09-2026 — QS8-609.** Voortgekomen uit het aflopen van de open Middel-rijen
in `docs/ENGINEER-REVIEW.md`, rij 618.

## De aanleiding was een vraag die al twee keer versmald was

Rij 618 heet *"geen enkele test in dit project laat tijd verstrijken"*. Hij is op
18-09 (QS8-549) op vier punten bijgesteld en sloot af met één expliciet
openstaand puntje: **de seizoensgrens en een reeks van maanden waren niet
nagemeten** en vielen mogelijk nog onder de blinde klasse.

Die twee zijn nu gemeten, en allebei vallen ze erbuiten:

| kandidaat | waarom hij niet blind is | gemeten met |
| -- | -- | -- |
| `seizoensgrens()` | neemt het moment als argument (`p_op timestamptz default now()`) | `pg_proc` op een lokaal opgebouwd schema, 301 migraties |
| `herbereken_reeks()` | geen enkele `now()`-vergelijking in de lus; groepeert opgeslagen rijen op `cycle_start_date` | `pg_get_functiondef()` |

De blinde klasse die rij 618 beschrijft — *toestand die pas degradeert nadat er
echt tijd verstreken is en die niemand met de hand kan verouderen* — bevat dus
geen van beide.

## Wat er wél lag was een dekkingsgat, en dat is iets anders

⚠️ **Een blinde vlek en een dekkingsgat vragen verschillende dingen.** Bij een
blinde vlek is de vraag *hoe* je überhaupt zou toetsen, en die weging is duur
genoeg om agenda te zijn. Bij een dekkingsgat is de vraag alleen wie de test
schrijft. Rij 618 hield de twee bij elkaar, en daardoor stond er iets op de
agenda voor november dat in een uur te sluiten was.

📏 De langste reeks die enige test opbouwde was **3** cycli. En `is_acht_uur =
false` werd wel getoetst, maar via een ándere tijdzone (Tokio op hetzelfde
moment). Dat is een andere belofte: het bewaakt dat de functie de klok van de
gróép leest en niet die van de server. Waar de rand zelf ligt — 07:59 tegen
08:00 in dezelfde zone — stond nergens.

Dat is regel 18 vraag 2 in het klein: *"Tokio zegt nee"* is een eigenschap van
één geval, *"om 07:59 nog niet en om 08:00 wel"* is de belofte.

## De vondst: stilte breekt een reeks niet

Dit is het enige dat een lange horizon opleverde wat een korte niet kon laten
zien, en het is geen bug maar een ongeschreven besluit.

📏 Twaalf gehaalde cycli, **zesentwintig cycli zonder één rij**, twaalf gehaalde
cycli. `herbereken_reeks()` geeft **24**, niet 12.

De reden staat in de functie: hij loopt de rijen af die er *zijn*, en alleen
`missed` of `carried` zet de teller terug. De rollover zet **bestaande**
onvoltooide weekdoelen op `missed` — voor een cyclus waarvoor de gebruiker
niets plande, bestaat er niets om op `missed` te zetten. Een half jaar
afwezigheid laat de reeks dus doorlopen.

⚠️ **Dat is goed verdedigbaar en daarom juist het gevaarlijke geval.**
Domeinregel 8 zegt *de reeks dient de gebruiker, nooit andersom*; domeinregel 9
dat een dag overslaan geen enkel gevolg heeft. Het pást. Maar het staat in geen
enkel beslisdocument, en het verschil tussen *afwezig* en *gefaald* is precies
wat een gebruiker aan zijn reeks afleest — dat valt onder grens 1.

⚠️ **En het is stil om te breken.** Wie ooit ontbrekende cycli gaat aanvullen —
een lege week als `missed` boeken, bijvoorbeeld om het minpunt van domeinregel 10
eerlijker te maken — verandert daarmee met terugwerkende kracht elke reeks in de
database. Er zou vandaag niets rood van worden.

## Wat er daarom staat

`tests/rls/tijdhorizon.test.ts`, vijf toetsen:

1. een reeks van 52 cycli telt tot 52 — er zit geen horizon in de functie;
2. een gat van 26 cycli zonder rijen breekt de reeks niet (24, niet 12);
3. `is_acht_uur` kantelt op het hele uur en niet ervoor, in één tijdzone;
4. `is_eerste_dag` kantelt ná de eerste dag, met een ongewijzigd `season_start`;
5. `monthly` kent de maand die net afliep.

⚠️ **De tweede test bewaakt het gedrag; hij keurt het niet goed.** Dat verschil
staat er met zoveel woorden in, want een test die een omstreden eigenschap
vastlegt, leest een jaar later als een test die hem voorschrijft.

## De ijking

Vijf grendels, **vijf aparte mutaties** — niet één mutatie voor het hele bestand.
Elke keer werd precies de bedoelde toets rood en bleven de andere vier groen:

| mutatie | wat er rood werd | wat de melding zei |
| -- | -- | -- |
| cyclus 26 op `missed` | de reeks van een jaar | `expected 25 to be 52` |
| het gat mét `missed`-rijen vullen | stilte breekt niet | `expected 12 to be 24` |
| 06:59Z → 07:00Z | de uurrand | `om 07:59 lokaal stond de poort al open` |
| 2 januari → 1 januari | de dagrand | `2 januari telde nog als eerste dag` |
| `monthly` → `quarterly` | de cadans | `expected 2025-10-01 to match 2026-02-01` |

⚠️⚠️ **De eerste poging tot de laatste drie mutaties maakte niets rood, en dat
was een fout in de mutatie en niet in de test.** De mutaties liepen door een
shell-lus die op `:` splitste om naam en expressie te scheiden — en in
`2026-01-01T06:59:00Z` staan drie dubbele punten. `sed` kreeg een halve
expressie, meldde dat, en de suite bleef groen op vijf toetsen.

Dat is precies de valkuil die deze codebase 's ochtends nog in
`docs/VOLGENDE-SESSIE.md` heeft opgeschreven: **een mutatie die niets rood maakt
is eerst een verdenking tegen de mutatie.** De tweede poging ging per
regelnummer, met de gewijzigde regel erbij geprint vóór de run — en toen was de
uitslag er wél.

## Wat hier níet mee besloten is

Of stilte een reeks hóórt te breken. Dat is grens 1 en dus een besluit voor
Quinten; het staat als eigen rij in `docs/ENGINEER-REVIEW.md`. Wat hier besloten
is, is alleen dat het gedrag vanaf nu vastligt in plaats van af te hangen van
wie er als laatste aan `herbereken_reeks()` zat.
