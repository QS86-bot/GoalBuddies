# Een kaal nummer in een historisch register — QS8-580

**21-09-2026.** `migratie:hernummer` herschrijft verwijzingen naar het nummer dat
het verplaatst. Dat is goed, behalve in één bestand: `docs/ENGINEER-REVIEW.md`.
Dit document draagt waarom dat bestand anders is, en waarom de diagnose die er
sinds 07-09 over stond maar half klopte.

## De dossierrij zei "een blinde `sed`", en dat was de helft

De rij van 07-09-2026 schrijft het incident toe aan een mens die
`s/migratie 0174/migratie XXXX/g` over het dossier draaide, en aan de lijst met
kale verwijzingen die het gereedschap netjes afdrukte en die hij met een `sed`
afdeed in plaats van te lezen.

📏 Nagespeeld op 21-09-2026 met de echte rij van QS8-307 en een **uniek** nummer,
tegen de vorm van vóór dit issue:

```
treffers: 2 | gemeld: 0
| … De begunstigde van een straf beslist mee over het respijt (QS8-307) | migratie 0182 zet er …
| … Onze eigen rij | migratie 0182 doet iets anders …
```

**Het script deed het zelf, en stil.** De `sed` was een tweede weg naar dezelfde
schade, niet de oorzaak — en de lijst die een mens moest lezen was in dit geval
leeg, want er viel volgens het script niets te melden.

⚠️ Dat verschil is niet academisch. Een reparatie die alleen de `sed` adresseert
(beter lezen, de lijst korter maken) laat de eerste weg open. **Een oorzaak die
je uit het verslag overneemt in plaats van na te meten, repareer je op de plek
waar hij niet zit.**

## Waarom de regel van QS8-277 hier niet geldt

Die regel heeft twee helften, en ze zijn allebei goed:

1. **een volledige basis is bewijs** — `0174_onze_migratie` kan maar naar één
   bestand wijzen, dus die wordt altijd herschreven;
2. **een kaal nummer is dat niet** — bij een *gedeeld* nummer wordt het gemeld en
   niet aangeraakt; bij een *uniek* nummer *"valt er niets te verwarren"* en
   wordt het gewoon herschreven.

Helft 2 rust op een aanname die overal klopt behalve hier: **dat de migratiemap
de waarheid is.** In code en in migraties is dat zo — daar gaat een nummer over
het bestand dat vandaag zo heet.

`docs/ENGINEER-REVIEW.md` is geen code maar een **register van vele issues, over
de tijd**. Er staan rijen in over een migratie die dat nummer ooit droeg en
sindsdien zelf hernummerd is. Een nummer dat vandaag uniek is in de map, kan
gisteren van iemand anders zijn geweest. Uniciteit *nu* zegt dus niets over de
vraag of een rij van vroeger over óns bestand gaat.

## Het besluit

In `docs/ENGINEER-REVIEW.md` wordt een kaal nummer **nooit** herschreven — ook
niet als het nummer uniek is. Het wordt gemeld, mét de **titel van de rij**, zodat
zichtbaar is van wie die rij is. Een verwijzing met de volle bestandsnaam gaat
wél gewoon mee: die is bewijs, en hem laten staan zou een verouderde verwijzing
achterlaten.

⚠️ **De prijs staat hier en niet in een voetnoot.** Ook je éígen dossierrij wordt
nu gemeld in plaats van bijgewerkt, want het script kan ze niet uit elkaar
houden. Dat is één regel handwerk per hernummering, en het is de veilige kant op:
een vergeten eigen rij valt op zodra je hem leest, een stil herschreven rij van
een ander niet.

### Waarom alleen dit bestand

Een beslisdocument hoort bij één issue: een kaal nummer erin gaat over de
migratie van dát issue en hoort mee te verhuizen. Zou de regel ook daar gelden,
dan blijven die verwijzingen achter op een nummer dat niet meer bestaat — erger
dan het probleem. `docs/ENGINEER-REVIEW.md` is het enige bestand in deze repo dat
tegelijk een register van véle issues én historisch is.

## Wat hiermee niet opgelost is

Het script kan nog steeds niet zien wélke rij van jou is. 📏 Geteld op
21-09-2026: **139** dossierrijen noemen een migratie, en **60** daarvan dragen
een `QS8-` in hun titelcel — 79 niet.

Route 3 uit QS8-580 — elke rij een expliciet issuenummer geven, zodat een
hernummering erop kan filteren — is de enige die het bij de wortel pakt. Die
blijft open. ⚠️ En hij is zelf een bulkbewerking over ~340 rijen, dus precies het
soort operatie waar dit issue over gaat; wie hem doet, doet hem niet met een
`sed`.

## De ijking

Zes mutaties, elk apart, met vooraf gemeten **0 rood** over de drie suites rond
dit script samen:

| # | mutatie | units | integratie |
| --- | --- | --- | --- |
| A | `\|\| dossier` weg uit de kale tak | 3 | 4 |
| B | `dossier: isDossier(pad)` weg uit de CLI | **0** | **4** |
| C | `isDossier()` geeft altijd `false` | 1 | 4 |
| D | de dossiertak slaat ook de volle naam over | 3 | 3 |
| E | de titel niet meesturen in de melding | 1 | 0 |
| F | `rijtitel()` leest de datumcel | 2 | 0 |

⚠️⚠️ **B is de rij die de integratietest rechtvaardigt.** Haal je alleen de wiring
uit de CLI, dan blijft de regel kloppen en blijft élke unittoets groen — hij
wordt alleen niet meer aangeroepen. Dat is dezelfde naad die QS8-277 twee
reparaties lang openhield, en de reden dat
`tests/scripts/migratie-hernummer-dossier.test.ts` een echte repo op schijf
gebruikt in plaats van de functie te voeden.

⚠️ `tests/scripts/migratie-hernummer-botsing.test.ts` bleef bij alle zes groen:
de gedeeld-tak is niet verbouwd.
