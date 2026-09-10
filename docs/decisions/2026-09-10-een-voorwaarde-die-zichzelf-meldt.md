# Een voorwaarde die zichzelf meldt

**Datum:** 10-09-2026 · **Issue:** QS8-179 · **Migratie:** geen

## Wat dit issue was, en wat er niet aan te doen viel

De app meldt zijn fouten aan Sentry zonder SDK — de afweging staat in
`docs/decisions/2026-08-26-sentry-in-de-app.md`. Native crashes zitten daar per
definitie niet in: een JS-laag kan ze niet zien.

Vandaag is dat leeg, en dat is geen aanname: 📏 er is geen `eas.json`, geen
`ios/`, geen `android/`, geen `eas-cli` en geen `expo-dev-client`. Er is dus geen
native helft die uitgevoerd wordt, en dus ook niets om te melden. De rij blijft
**Laag** en de SDK-afweging blijft dicht.

**Dat is niet te veranderen zonder een echte build**, en die vraagt een
EAS-project — een handeling van een mens en een account. Er valt hier dus niets te
bouwen aan de bevinding zelf.

## Wat er wél te doen was

De rij draagt de zin die hem laag houdt:

> **Wordt zwaarder als:** er een EAS-project komt en de app op een echt toestel
> draait.

⚠️ **QS8-123 heeft de helft van dat probleem opgelost, en dit is de andere
helft.** `review:controle` wordt rood zodra een Laag-rij zo'n zin **mist** — dat
bewaakt dat de voorwaarde opgeschreven is. Niets bewaakte of hij **ingetreden**
is. Dat hing aan een mens die zich de zin herinnert op precies het moment dat de
wereld verandert.

Dat is dezelfde vorm als de prijsconstante van QS8-187 en de zin over de
weekpasvoorraad van QS8-204: waar op het moment van schrijven, vanzelf onwaar
wordend, en niets gaat er rood van.

## Wat er nu staat

`tests/beloftes/weggelegde-voorwaarden.test.ts` draagt een register van
weggelegde bevindingen **waarvan de voorwaarde mechanisch te toetsen is**, en
wordt rood zodra er één intreedt. De melding noemt de rij, de voorwaarde en wat
er dan opnieuw gewogen moet worden.

Vijf sporen voor QS8-179, want een EAS-project begint niet altijd met hetzelfde
bestand: `eas.json`, `ios/`, `android/`, `eas-cli`, `expo-dev-client`.

⚠️ **`app.json` telt met opzet niet mee.** Dat is de Expo-configuratie van de
webbundel en staat er vanaf dag één. Zou hij meetellen, dan staat deze grendel
vanaf zijn eerste dag rood — en een controle die vanaf dag één rood staat, leert
iedereen hem uit te zetten. Dat is de must-allow die het zwaarst weegt.

⚠️ **Rood is hier goed nieuws.** Wordt deze suite rood, dan is er niets kapot:
dan is de wereld veranderd en hoort iemand de rij te herwegen. Dat is een ander
soort rood dan de rest van de poort, en de melding zegt dat er ook bij.

## Wat er niet in hoort

**Voorwaarden die van buiten de repo komen.** *"Er zijn echte gebruikers"* — de
voorwaarde van QS8-189 en QS8-183 — staat er niet in en hoort er niet in: dat is
niet uit de code af te leiden, en een rij die dat toch beweert wordt een vinkje
zonder meting. Precies wat dit register wil vervangen.

⚠️ **QS8-189 heeft wél een tweede helft die hier ooit bij kan**: *"zodra een
melding meer draagt dan een naam en een gebeurtenis"*. Dat is een eigenschap van
de meldingsinhoud en dus toetsbaar. Bewust niet in deze PR meegenomen — dat is een
andere rij en dus een andere branch (CLAUDE.md, versiebeheer).

## De ijking

| | Mutatie | Uitkomst |
|---|---|---|
| A | `eas.json` in de repowortel zetten | 1 rood, met de rij en het gevolg in de melding |
| B | `eas-cli` aan `devDependencies` toevoegen, zónder `eas.json` | 1 rood — twee onafhankelijke sporen |

Daarnaast biedt de suite de detector elke vorm los aan: drie die hij moet vinden
en drie die hij met rust moet laten. Die tweede helft weegt even zwaar — een
controle die alles meldt, leer je te negeren.
