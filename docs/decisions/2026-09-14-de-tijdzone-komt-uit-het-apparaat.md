# De tijdzone komt uit het apparaat, en het handmatige veld is weg

**Datum:** 14-09-2026 · **Issue:** QS8-472 · **Besluit van:** Quinten

> *"Ook moet ik nog steeds de tijdzone zelf invullen. Dit moet automatisch
> uitgelezen worden uit het apparaat dat ik gebruik en deze handmatige instelling
> moet verwijderd worden."*

## Wat er verandert

`Tijdzonewacht` in `app/_layout.tsx` roept `useTijdzoneSync()` aan. Wijkt
`apparaatTijdzone()` af van `profiles.tz`, dan schrijft die hook de zone van het
apparaat weg — bij elke start, niet alleen bij de onboarding.

`TijdzoneKeuze` is verdwenen, en met hem `src/shared/ui/tijdzone.ts`,
`tijdzone-aliassen.ts` en drie testbestanden.

## ⚠️ Wat dit weggooit, en dat is meer dan één knop

Dit draait acceptatiecriterium 1 van **QS8-27** terug en maakt **QS8-212** dood
werk. Dat tweede issue mat vier termen die nul treffers gaven — *Rotterdam*,
*Manchester*, *Osaka*, *Netherlands* — en bouwde er een aliastabel voor. Die
belofte (*wie zijn stad intypt, vindt zijn tijdzone*) bestaat niet meer, want er
is niets meer om in te typen.

**Dat staat hier omdat een verwijdering geen test rood maakt.** Onwrikbare regel
18 waarschuwt voor de verhuizing waarbij de test meeverhuist en groen blijft; de
verwijdering is het spiegelbeeld — de test verdwijnt mét de belofte, en niemand
merkt dat er een belofte weg is. Vandaar deze rij.

## De twee gevallen die nu niet meer opgevangen worden

Allebei zijn ze reëel en allebei stonden ze met zoveel woorden in de kop van
`apparaatTijdzone()` als de reden dat er een correctiepad was:

1. **Het apparaat heeft het mis.** Wie in Lissabon woont met zijn telefoon op
   Amsterdam rekent vanaf nu in Amsterdam, en kan dat nergens rechtzetten. Op web
   is `Intl` de enige bron, en een VPN of een verkeerd ingestelde machine
   verandert hem.
2. **Reizen verzet je week.** Zit je een week in Bangkok, dan schuift de grens van
   je lopende cyclus mee. Domeinregel 2: *een streak die om middernacht verkeerd
   breekt, kost je een gebruiker.*

Voor beide is de uitweg nu "zet je apparaat goed", en dat is een echte
achteruitgang voor wie dat niet kan.

## Wat dit uitdrukkelijk **niet** doet

⚠️⚠️ **Geen lopende weekdoelen verzetten — en dat heeft wél een gevolg.** Hier
stond dat een zonesprong "dezelfde toestand als een gewone weekovergang"
oplevert en dat de rollover hem al behandelt. Dat was onwaar, en de
security-review op deze PR heeft het gemeten:

| moment | zone | `userCycle().startDate` |
|---|---|---|
| `2026-09-13T22:30Z` | `Europe/Amsterdam` | `2026-09-14` |
| `2026-09-13T22:30Z` | `Pacific/Honolulu` | `2026-09-07` |

Valt de sprong over de week-startdag, dan verschuift de grens niet met een dag
maar met **zeven**, en westwaarts gaat hij terúg. `fetchWeekdoelen()` matcht
exact op `cycle_start_date` (`src/modules/goals/weekly.ts:45`), dus een weekdoel
dat je net hebt aangemaakt kan uit je lijst verdwijnen zónder dat er iets
verstreken is. Dat doet een gewone weekovergang nooit, en de rollover doet er
dus ook niets aan.

Wat wél blijft staan: de invariant van 0198 (*een cyclus begint op de
week-startdag van de eigenaar*), want de week-startdág verandert niet, en
`zet_week_startdag()` blijft de enige schrijver van `cycle_start_date` (0201). De
database wordt hier dus niets ontnomen; wat er gebeurt is dat de gebruiker een
andere week te zien krijgt.

⚠️ **Dat dit eerst als "afgedekt" beschreven stond, is het duurste deel van deze
bevinding.** CLAUDE.md waarschuwt er met zoveel woorden voor: een afwijking die
je onderbouwt is duurder dan een die je vergeet, omdat de volgende lezer een
uitgeschreven argument leest als een reden om er niet aan te twijfelen.

⚠️ **Geen migratie en geen nieuwe schrijfweg.** De hook gebruikt exact het pad dat
de weggehaalde knop gebruikte: `updateProfiel()` met `tijdzoneSchema` ervoor en de
CHECK op de kolom erachter. Wat verandert is wíé de schrijfactie aanstoot.

⚠️⚠️ **Over de tweede schrijver — de eerste versie van dit document had het
mis.** Er stond "geen tweede schrijver", en `TijdzoneInstelling` op het
profieltabblad schrijft inderdaad niets. Maar de **onboarding** schrijft `tz`
wél, en die schreef een waarde die bij de eerste render bevroren was: bij een
vers account de kolomstandaard `Europe/Amsterdam` (migratie 0001). 📏 Gevolg,
gemeten in de security-review: de wacht schreef de échte zone weg en onthield
dat, het formulier schreef seconden later de standaard terug, en de wacht
probeerde het die sessie niet meer. Een gebruiker in Tokio rondde zijn
onboarding af in Amsterdam.

De onboarding leest `tz` daarom niet meer uit `profiel` maar rechtstreeks uit
`apparaatTijdzone()`. Er zijn nog steeds twee schrijvers, maar ze lezen uit
dezelfde bron en kunnen elkaar niet meer met een ándere waarde overschrijven.

⚠️ **En de lusgrendel hangt nu aan de gebruiker.** De `useRef` hield alleen de
zone bij terwijl dit document beweerde dat het "voor deze gebruiker" was.
`Tijdzonewacht` hangt in `RootLayout` en demonteert nooit, dus op een gedeeld
toestel sloeg de wacht na een accountwissel over en zat de tweede gebruiker vast
in de zone van de eerste. De ref draagt nu `{ userId, zone }`, en de hook
beslist pas als `profiel.id === userId` — dat laatste dekt ook het venster
waarin `ProfielProvider` met opzet de oude profielrij laat staan.

## De grendel tegen een schrijflus

`useTijdzoneSync()` houdt in een `useRef` bij welke zone het voor deze gebruiker
al geprobeerd heeft, en een mislukte poging telt óók mee. Zonder die ref is dit
geen hulpmiddel maar een verkeersgenerator: schrijft de server de zone anders
terug dan wij aanboden, dan blijft de voorwaarde waar en gaat het effect bij
elke render opnieuw. Dat is de duurste vorm hier — `max_connections` is 60 voor
de héle database.

## Hoe dit terugkomt

Rij in `docs/ENGINEER-REVIEW.md` met de voorwaarde die hem laag houdt. Wordt hij
zwaarder, dan is de reparatie niet "de knop terug" maar de vraag of de zone een
*bevestigde* waarde hoort te zijn in plaats van een afgeleide — met een melding
bij een sprong, zoals een commitment device nooit stilzwijgend aangaat
(domeinregel 5).
