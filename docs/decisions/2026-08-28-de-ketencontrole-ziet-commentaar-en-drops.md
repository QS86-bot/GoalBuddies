# Nog twee blinde vlekken in `keten:controle`, en wat eronder zat

**Datum:** 28-08-2026
**Migratie:** 0124
**Raakt:** `scripts/dode-keten-controle.mjs`, `tests/scripts/dode-keten.test.ts`,
`tests/rls/aikosten.test.ts` (nieuw), `tests/rls/weekpassen.test.ts`,
`tests/rls/epic13.test.ts`, `src/lib/database.types.ts`

## De aanleiding

De vorige ronde haalde één blinde vlek uit `keten:controle`: `grant`- en
`revoke`-regels telden als aanroeper. Bij het meten bleken er nóg twee, en die
zijn toen vastgelegd zonder reparatie — elk van de dertien functies eronder vroeg
een eigen verdict, en dat is geen werk voor een merge-reparatie. Dit is die ronde.

## Gat 1: SQL-commentaar telde als aanroeper

`zonderDefinities()` streepte geen `--`-regels weg. Een migratiekop legt uit wát
een functie doet en noemt hem daarbij mét haakjes, en dan telt de uitleg als het
gebruik.

⚠️ **Het overkwam deze sessie zelf.** Een ⚠️-regel in 0122 bevatte de zin *"mét
een groene `initplan_bewaking()`"*, waarna de controle die functie levend noemde
en het register een reden gaf voor een toestand die er niet was. De reparatie is
één regel; de vondst zat in wat eronder lag.

## Gat 2: `drop function` telde niet mee

`functiesIn()` verzamelde élke `create ... function`, ook van functies die een
latere migratie had weggegooid. `markeer_doorgeschoven()` is in 0091 verwijderd en
verscheen daardoor als "dode functie" terwijl hij niet bestáát.

`checksIn()` deed dit voor constraints al goed — in volgorde verwerken en
`drop constraint` honoreren. Hier stond dat patroon niet.

⚠️ **De regel is "het laatste woord telt", en dat is met opzet grover dan de
handtekening.** `drop function f(a); create function f(a, b)` is in dit project de
normale vorm van een migratie die de vorm van een functie wijzigt. Voor de vraag
die hier gesteld wordt — *bestaat deze náám nog en roept iemand hem aan* — is de
naam het juiste niveau: blijft er één overload over, dan is er iets om aan te
roepen. Voor de vraag of een dróp de goede overload raakt is de handtekening wél
nodig, en die staat in `tests/migraties/idempotentie.ts`.

## Wat eronder zat: dertien functies, drie verdicten

| Verdict | Aantal | Wat |
|---|---|---|
| Bewaking of ops, hoort geen pad te hebben | 11 | staan op `BEWAAKT_BUITEN_DE_APP`, elk met een reden, en het script eist een aanroeper in `tests/` of `scripts/` |
| Bestond niet meer | 1 | `markeer_doorgeschoven()`, in 0091 gedropt — vals alarm van gat 2 |
| Echt dood | 1 | `weekpas_stand(uuid)` — verwijderd in 0124 |

Plus één die géén van drieën was, en daarom een nieuwe categorie kreeg.

### `ai_kosten_per_week()` — op de lijst, en niemand keek

De lijst deed precies waarvoor hij gebouwd is: hij stond erop met de reden "ops en
audit", en er wás geen ops en geen audit. **Een naam parkeren zonder dat er iets
kijkt, is de fout die deze lijst moet vangen** — en hij ving hem, bij mij.

Onwrikbare regel 6 zegt dat elke AI-call geld kost en dat de kosten per user-id
gelogd worden. Het loggen gebeurde; het opvrágen niet. `tests/rls/aikosten.test.ts`
is nu de aanroeper: de vorm van de zes kolommen, en dat een gewone gebruiker hem
niet mag aanroepen — want het totaal verraadt hoeveel anderen de coach gebruiken.
Geen assertie op bedragen: de database is leeg en andere suites laten jobs achter.

### `ketting_schakel()` — een nieuwe categorie

Een correcte, volledig bewaakte RPC die niemand aanroept. QS8-80 bouwde hem als de
weg waarlangs je een kettingschakel verdient: ingelogd, lid van de groep, periode
binnen bereik, een goedgekeurd weekdoel in die cyclus, hoogstens één schakel per
cyclus, en een unieke index eronder. Elke toets erin klopt.

Maar de app roept hem nooit aan: `ketting_uit_weekafsluiting()` is een trigger en
doet het vanzelf zodra je je week afsluit.

⚠️ **Dat past in geen van de twee bestaande lijsten, en dat verschil is de kern.**
`BEWAAKT_BUITEN_DE_APP` zegt *"deze functie hóórt geen pad door de app te
hebben"*. Hier is het omgekeerde waar: een functie die een pad zóu moeten hebben
en er geen heeft. Vandaar `WACHT_OP_EEN_BESLUIT` — **een agenda en geen
parkeerplaats**, waarin elke regel de vráág draagt en niet alleen de constatering:

> Is een schakel iets dat je zelf claimt, of iets dat de weekafsluiting voor je
> doet? Is het het tweede, dan hoort deze functie weg — hij staat open voor
> `authenticated` en schrijft in een tabel die de groep leest. Is het het eerste,
> dan hoort er een knop bij.

De lijst loopt niet stil achter: een naam die inmiddels wél een pad heeft, wordt
gemeld als "de vraag is beantwoord".

### `weekpas_stand(uuid)` — de echte vondst, en de tests eromheen

0041 hield hem aan *"zodat de bestaande aanroeper en zijn tests niet hoeven te
veranderen"*. Die aanroeper bestaat niet meer — de app leest `weekpas_standen()`
(meervoud, in één verzoek, zonder N+1). Wat overbleef is een `security definer`
die `authenticated` mag uitvoeren en niets doet. 0124 haalt hem weg.

⚠️ **En daar zat de EPIC 9-vorm nog eens in het klein.** Vier tests riepen hem wél
aan, waaronder twee autorisatietests: *"geeft een ander geen weekpasstand"* en
*"geeft een uitgelogde bezoeker geen weekpasstand"*. Tests rondom een functie waar
geen knop heen loopt — precies waarom een aanroep uit een test in dit script niet
als leven telt.

Die vier zijn verhuisd naar het meervoud. **Dat is niet gelijkwaardig maar beter:**
ze toetsen nu de weg die de app écht neemt, en de eigenaarstoets die ze bewaken zat
altijd al daar.

## De ijkingen

| Reparatie teruggedraaid | Rood |
|---|---|
| commentaar niet meer strippen | ✅ |
| `drop function` niet meer honoreren | ✅ |

Plus zeven nieuwe gevallen: een functie die alleen in commentaar staat, vier vormen
van create-en-drop in verschillende volgorde, en drie op de nieuwe categorie —
waaronder dat een aanroep uit een tést een naam op `WACHT_OP_EEN_BESLUIT` níét als
"beantwoord" meldt. De EPIC 9-regel blijft overal staan.

## De uitslagregel telt nu drie getallen

*"137 functies hebben allemaal een verdict — 114 met een pad door de app, 22
bewakingen en ops-functies met een aanroeper in tests/ of scripts/, en 1 zonder pad
waar het verdict een productvraag is."*

⚠️ Eén totaal maakt de tweede en derde groep onzichtbaar, en zo is de blinde vlek
van 28-08 ontstaan: alles telde als "levend" en niemand kon zien waaróm.
