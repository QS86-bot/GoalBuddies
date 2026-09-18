# Zeven seconden was een budget dat de aanvaller niet heeft

**18-09-2026 · QS8-546 · migratie 0290**

## De bevinding, en wat er niet aan klopte

QS8-546 meldde dat `handle_new_user()` `raw_user_meta_data` normaliseert zonder
bovengrens, in een `security definer`-trigger op een pad dat per definitie voor
niet-ingelogde gebruikers openstaat. Dat klopt. Het **getal** eronder klopte niet.

Het issue rekende met acht miljoen codepunten en kwam op 7146 ms per aanmelding.
Die invoer kan niet bestaan: 📏 GoTrue begrenst het héle verzoeklichaam op **1 MB**
— `limitRequestBody(1 << 20)` in `internal/api/api.go`, uitgevoerd door de
middleware in `internal/api/middleware.go`. Acht miljoen losse tags zijn 32 MB.

⚠️ **Het issue vroeg zelf om die meting vóór er gebouwd werd** (*"Meet dat eerst
— het bepaalt of er iets te bouwen valt"*), en dat was de juiste volgorde: de
meting halveert de bevinding niet, ze deelt hem door achttien.

## De hermeting, op het budget dat er wél is

📏 1 MB ruwe bytes, dus per tekenklasse een ánder aantal codepunten.
`octet_length` per geval nagerekend: `U+E0020`, `U+1BCA0` en `a` komen op precies
1.048.576, `U+FFF3` en `U+200B` op 1.048.575 (349.525 × 3).

| klasse | codepunten | zonder grens | met grens |
|---|---:|---:|---:|
| `U+E0020` losse tag | 262.144 | **392 ms** | 5,1 ms |
| `U+FFF3` | 349.525 | 163 ms | 2,7 ms |
| `U+1BCA0` | 262.144 | 123 ms | — |
| `a` (inert) | 1.048.576 | 55 ms | 4,3 ms |
| `U+200B` (randklasse) | 349.525 | 6,2 ms | — |

En door de échte trigger heen, met een teruggerolde `insert into auth.users`:
📏 **350,6 ms** zonder grens tegen **25,2 ms** met.

⚠️⚠️ **Het budget moest van codepunten naar bytes, en dat verandert wie er wint.**
Uit de tabel hierboven: de losse tag kost **1,495 µs/codepunt** (392 ms / 262.144)
en vier bytes in UTF-8, dus **0,374 µs/byte**; `U+FFF3` 0,466 µs/cp over drie bytes
is 0,155; `a` is 0,0525 voor allebei. De losse tag wint op beide assen.

⚠️⚠️ **Die µs-cijfers stonden hier eerst fout, en de fout is leerzamer dan het
getal.** Er stond 0,91 µs/codepunt — dat is 7146 ms / 8.000.000, teruggerekend uit
precies de meting die dit document verwerpt. Ik had een kengetal overgenomen uit de
run die ik aan het weerleggen was. De security-ronde heeft het gevonden; de
conclusie bleef overeind, de onderbouwing niet. **Een verworpen meting laat zijn
afgeleiden achter.**

Dat de winnaar dezelfde bleef is bovendien toeval en geen wet: een klasse die per
codepunt duur is maar één byte kost, had de rangorde omgedraaid. **Een meting in de
verkeerde eenheid geeft het goede antwoord alleen per ongeluk.**

## Wat er dan nog over is

~392 ms CPU per aanmelding in plaats van zeven seconden. Geen algoritmische
ontploffing, niets dat lekt — maar wel een goedkope manier om connecties bezet
te houden op een open pad, en `max_connections` is **60** voor de héle database
op de gratis tier.

⚠️ **De reden om het tóch te begrenzen is niet de 392 ms maar de vorm.** Zonder
grens schaalt het **normalisatiewerk** met wat een vreemde opstuurt; met grens
niet. Die eigenschap blijft waar als GoTrue zijn 1 MB ooit verruimt — en dat is
precies het soort verandering dat niemand hier ziet gebeuren.

⚠️⚠️ **Het is "het normalisatiewerk is begrensd" en niet "de kosten hangen niet
meer van de invoer af".** Die tweede zin stond hier, in de migratiekop en in de
reviewrij, en ze is te sterk — de security-ronde heeft haar weerlegd en ik heb het
nagemeten. 📏 Een aanmelding met leeg metadata-lichaam kost ~13 ms, met 1 MB ~24 ms.
Maar 1 MB in een sleutel die de trigger **nooit leest** (`junk`) kost ~21–33 ms, en
1 MB in `avatar_url` ~28 ms: statistisch hetzelfde. Wat overblijft is het opslaan
van de jsonb in `auth.users`, niet iets wat deze trigger doet.

**Waarom dat verschil ertoe doet en niet muggenzifterij is:** die zin zou in
november gelezen worden door iemand zonder de meting ernaast, en wie er een vijfde
ruwe bron bij bouwt met *"de kosten hangen toch niet van de invoer af"* in zijn
hoofd, bouwt hem zonder grens. Exact de klasse fout waar dit issue over ging — een
bewering die blijft staan nadat ze niet meer klopt.

⚠️ **Die 1 MB is een aanname en staat als zodanig in de migratiekop.** Hij is
gelezen uit de bron van `master`, niet uit de gedeployde versie van dít project;
de Management API is vanuit een bouwsessie niet bereikbaar (QS8-234, vier routes,
alle vier dicht). De gemeten bescherming hangt er niet van af — de omvang van het
gat wél.

## Afkappen en niet weigeren

`create_group()` (0287) **weigert** met `{'ok': false, 'reason': 'name_too_long'}`.
Dat kan daar: het is een RPC en de aanroeper leest die uitslag.

⚠️⚠️ **Hier kan dat niet, en dat is geen smaak maar een geleerd geval.** Dit is
een trigger op `auth.users`; de enige manier om te weigeren is werpen, en dan
**mislukt de aanmelding**. Migratie `0154` bestaat omdat `handle_new_user()`
botste met de profielconstraints en aanmelden via een OAuth-provider daardoor
stukliep op de trigger in plaats van op de configuratie. Een te lange naam hoort
geen account te blokkeren.

Het **getal** is wél hetzelfde als in `create_group()`: 1000. Twee grenzen op
dezelfde handeling met verschillende getallen is een verschil dat niemand kan
uitleggen.

## Wat het afkappen kost, en waarom dat aanvaardbaar is

Een `full_name` van meer dan 1000 codepunten waarvan de eerste duizend allemaal
wegvallen bij normalisatie, valt nu terug op `name`, dan op het deel vóór de `@`,
en dan op `'Naamloos'` — waar hij daarvóór de zichtbare tekens ná die duizend nog
gevonden had. 📏 Gemeten aan beide kanten van de grens: 1000 zero-widths + `Jan`
geeft de e-mailterugval, 997 + `Jan` geeft `Jan`.

⚠️ **Er is een tweede, mildere gedragsverandering en die stond hier eerst niet.**
Een *gedeeltelijke* afkapping: 📏 `950 × U+200B + 100 × 'a'` gaf vóór 0290 een naam
van 80 tekens en geeft er nu 50. Geen CHECK-schending, geen terugval — alleen een
kortere naam. Even adversarieel van vorm, maar de zin hierboven dekte dat geval niet.

Zo'n naam is adversarieel van vorm — duizend onzichtbare tekens vóór je naam — en
de terugval is niet stuk maar milder. De keuze staat hier opgeschreven in plaats
van gekopieerd, zoals het issue vroeg.

## De grens staat om de bínnenste aanroepen

**Vier** bronnen dragen hem, niet één. `coalesce` kortsluit, dus normaal wordt alleen
`full_name` genormaliseerd — maar een `full_name` die naar leeg normaliseert
dwingt `name` er alsnog bij, en dan telt het werk op. Het totaal mag niet van de
invoer afhangen, dus alle drie.

⚠️ **De vierde is `avatar_url`, en die ontbrak in de eerste versie.** Die
begrensde er drie en beweerde in dezelfde kop dat álle bronnen begrensd waren — de
security-ronde vond het. 📏 De regex erop kost 2,11 ms per MB, dus verwaarloosbaar;
het punt is dat de bewering anders onwaar is. Geen gedragswijziging: een pad dat aan
`profiles_avatar_url_eigen_pad` voldoet is hoogstens 237 codepunten, en afkappen kan
een niet-match geen match máken.

De `left(…, 80)` blijft staan en doet ander werk: 1000 begrenst wat er
genormaliseerd wordt, 80 wat er opgeslagen wordt. De buitenste `schone_naam()`
blijft nodig om de rand te strijken die `left()` maakt — bij 1000 net zo goed als
bij 80 (QS8-508, en QS8-526 voor de reden dat die randstap tot een vast punt
doorloopt).

## Geijkt

Per grendel een eigen mutatie, en steeds gekeken wélke toets omviel:

| mutatie | rood |
|---|---|
| grens weg bij `full_name` | *"kapt af op 1000 codepunten"* — en alleen die |
| grens weg bij `name` | *"begrenst ook `name`"* — en alleen die |

⚠️ **De toets meet gedrag en geen tijd.** Een drempel op milliseconden is op een
gedeelde runner een gok en wordt rood om redenen die niets met de belofte te maken
hebben. Wat de grens deterministisch verandert is wáár hij knipt; twee gevallen
aan weerszijden van codepunt 1000 leggen dat vast.
