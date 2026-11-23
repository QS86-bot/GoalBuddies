# Een nieuw account heeft geen vorige week (QS8-806)

Besluit van de orchestrator op 23-11-2026: optie A voor de maatstaf, en geen merge van
de tak van QS8-793. Quinten besloot eerder op dezelfde dag dat het onderzocht en
gerepareerd moest worden.

## Wat er mis was

Een account dat net was aangemaakt, zag op Vandaag de kaart "Je vorige week loopt nog
even door". De kop zei "Week van" de vorige maandag.

## De oorzaak, gemeten

De voorwaarde van de kaart was niet het probleem. Het lag aan `shared/time`.

* De kaart staat in `src/schermen/vandaag/delen.tsx` en verschijnt bij
  `coulance && afTeSluiten`. `afTeSluiten` is nooit null.
* `isWithinGrace(clock, at)` en `closableUserCycle(clock, at)` in
  `src/shared/time/cycle.ts` kennen alleen de klok en het moment. Het account kennen ze
  niet.
* Gevolg: in de eerste twaalf uur van elke cyclus zit iedereen in de coulance, ook een
  account van vijf minuten oud.

📏 Gemeten met de echte functies in Europe/Amsterdam:

| startdag | moment (UTC) | coulance | afsluitbaar |
| --- | --- | --- | --- |
| maandag | 23-11 05:30 | ja | 16-11 |
| maandag | 23-11 12:00 | nee | 23-11 |
| zondag | 22-11 08:00 | ja | 15-11 |
| woensdag | 23-11 05:30 | nee | 18-11 |

Het issue is op maandag 23-11 om 05:49 UTC aangemaakt. De afdruk van QS8-793 viel in
dat venster. Op de echte web-export tegen een lokale database is het opnieuw gezien, op
390 en op 1280 pixels.

De lijst met weekdoelen had dit probleem niet. `mogelijkeCyclusstarts()` neemt ook de
lopende week mee.

## De maatstaf: het account bestond al vóór deze cyclus

"Er is een vorige week" betekent: `profiles.created_at` ligt vóór `startsAt` van de
lopende cyclus. Dat zit in `existedBeforeCycle()` in `shared/time` (correctheidsregel 7).
Er zijn drie nieuwe functies:

* `existedBeforeCycle(clock, at, since)`
* `closableUserCycleSince(clock, at, since)`: is het account nieuw, dan is de lopende
  cyclus de afsluitbare.
* `isWithinGraceSince(clock, at, since)`: is het account nieuw, dan is er geen coulance.

⚠️ **Wat bewust níet de maatstaf is: "in de vorige week stonden weekdoelen" (optie B).**
Die maatstaf hangt aan data. Vandaag zou dan met een query uitmaken wat een week is,
naast `shared/time`, en dat verbiedt correctheidsregel 7. Een bestaand account zonder
weekdoelen in de vorige week ziet de kaart dus nog steeds. Dat was al zo vóór dit
issue, en het klopt ook: die week bestond voor hem.

Drie randen, en alle drie staan onder test:

* **De grens.** Strikt kleiner. Een account dat precies op de rollover ontstaat, is
  nieuw. Eén milliseconde eerder is het dat niet.
* **Twee week-starts.** Een account van zondag 02:00 is voor een maandagstarter ouder
  dan zijn week. Voor een zondagstarter is het nieuw.
* **Middernacht.** Maandag 00:30 in Amsterdam is in UTC nog zondag 23:30. Daarom
  vergelijken we momenten en geen kalenderdata. Een vergelijking op de UTC-datum gaf
  dit account een vorige week die het nooit had.

Is `since` onleesbaar, dan geldt het oude gedrag: een kaart te veel, nooit een week die
je niet meer kunt afsluiten.

## Waarom nieuwe functies en geen optionele parameter

`closableUserCycle()` en `isWithinGrace()` staan letterlijk gelijk in de Edge-kopie
(`supabase/functions/_shared/time/`), en de rollover gebruikt de eerste.
`edge-tijd:controle` wordt rood zodra ze uit elkaar lopen. Met een optionele vierde
parameter zou de rollover-bundel veranderen voor gedrag dat de rollover niet gebruikt.
Een aanroeper die de parameter vergeet, krijgt dan bovendien geen fout maar het oude
gedrag.

`closableUserCycle()` en `isWithinGrace()` blijven letterlijk zoals ze waren. De drie
nieuwe functies gaan via `npm run edge:sync` ook in de Edge-kopie: `edge:sync:controle`
eist dat de kopie gelijk loopt met `src/`. Een eerste versie liet ze daar weg, met de
redenering "weglaten mag", en de poort werd er rood van.

**Geen Edge Function roept de nieuwe functies aan, dus het gedrag op de server verandert
niet.** Wel verandert de inhoud van `_shared/time`, en daarmee de bundel van elke functie
die hem importeert: `rollover`, `notificaties`, `doelcoach` en `koppelen`. Deployen
brengt de bundels weer gelijk met de repo; het verandert niets aan wat ze doen.

Na de merge deployt Quinten `rollover`, `notificaties` en `doelcoach`. **`koppelen`
wacht op QS8-634** (aanwijzing van de orchestrator, 23-11-2026): die functie gaat pas
uit als dat issue Done is, ook al loopt zijn bundel tot dan achter op de repo.

In `src/modules/goals/cycles.ts` is `sinds` verplicht. Een vergeten aanroeper is daar een
fout van `tsc`.

## De naad

`useTijd()` in `src/schermen/vandaag/useVandaag.ts` rekent nu via `tijdVan()` in
`src/schermen/vandaag/tijd-vorm.ts`. Zo is de kern zonder renderer te toetsen.

`tests/render/vandaag-coulance.test.ts` toetst dat het profiel met zijn `created_at` de
klok in gaat, voor twee week-starts. De ijking staat in de kop van die test. Stopt
`tijdVan()` er een vaste datum in, dan worden alleen de twee gevallen met een nieuw
account rood, en blijven de tests van `shared/time` en `goals` groen. Dat is de naad.

## Wat er níét verandert

* De rollover, de Edge-kopie en de server. Geen migratie.
* Een account van vóór de lopende cyclus. De tests leggen voor vier startdagen vast dat
  `closableUserCycleSince` en `isWithinGraceSince` dan precies `closableUserCycle` en
  `isWithinGrace` zijn.

## Voor de engineer in november

Er zijn nu twee varianten van "afsluitbaar": de client rekent met het account, de
rollover zonder. Voor een nieuw account geven ze binnen het venster een andere
`zojuistAfgeslotenCyclus()`. Dat schaadt niet zolang een nieuw account in eerdere weken
geen rijen kan hebben. **Wordt zwaarder als:** er een import of migratie van bestaande
weekdoelen naar een nieuw account komt.
