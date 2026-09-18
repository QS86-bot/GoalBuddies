# Een vast punt, niet een langere keten

**Datum:** 17-09-2026 · **Issue:** QS8-526 · **Migratie:** `0289`
**Raakt:** `public.schone_naam()`, `schoneNaam()` in `src/shared/tekst`,
`tests/rls/naamnormalisatie.test.ts`

## Wat er mis was

`schone_naam()` was niet idempotent: `schone_naam(schone_naam(x))` verschilde van
`schone_naam(x)`. Drie kolommen dragen een CHECK die gelijkheid met die functie
eist (`groups.name`, `profiles.display_name` twee keer), dus een waarde die de
functie zelf oplevert kon door de CHECK geweigerd worden.

## Een aanmelding kon er hard op falen, en niet langs de route die het issue vermoedde

QS8-526 schreef: *"`handle_new_user()` normaliseert de naam uit een aanmelding
óók met één aanroep … Een aanmelding met zo'n naam laat de trigger omvallen."*

📏 **Nagemeten tegen een echte `insert` in `auth.users`, en dat klopt niet.** De
trigger roept `schone_naam()` **twee** keer aan — binnen en buiten een
`left(…, 80)` — en de maximale diepte tot een vast punt is twee. Een aanmelding
met `full_name` = `U&'\2001\+00FE05ab'` slaagt gewoon en geeft `display_name` =
`'ab'`.

⚠️⚠️ **De truncatie zit er echter tússen, en díe maakt een nieuwe rand.** De
binnenste aanroep levert schone tekst; `left(…, 80)` knipt en kan precies op een
randteken eindigen; de buitenste aanroep is dan de eerste die dát ziet, en één
aanroep is niet genoeg. 📏 Gemeten met `full_name` = 78 × `'a'` +
variatieselector-6 + EM QUAD + `'zzz'`:

```
ERROR: new row for relation "profiles" violates check constraint
       "profiles_display_name_geen_onzichtbaar_tussen_letters"
```

De registratie faalt hard. **De bevinding klopte, de route niet** — en dat is het
verschil tussen een vermoeden en een meting. Wie de vermoede route had getest en
groen had gezien, was hier gestopt.

## Twee fouten die elkaars spiegelbeeld zijn

QS8-526 noemde twee richtingen en vroeg te **meten** welke klopt in plaats van te
kiezen. Dat was terecht, want de voor de hand liggende is vijftien keer erger.

| vorm | niet-idempotent (paren) |
|---|---|
| A huidig: pijplijn → rand | 256 |
| B rand → pijplijn | **3840** |
| C rand → pijplijn → rand | 0 |
| **D tot een vast punt** | **0** |

Gemeten op de ruimte uit het issue: de 4.261 codepunten waar `schone_naam()` iets
aan doet, elk achtste daarvan, alle paren in vier vormen — 1.136.356 gevallen.

⚠️⚠️ **Die twee nullen betekenen niet hetzelfde, en op dat verschil is dit
document eerst de mist in gegaan.** Deze ruimte bestaat uit **paren**. C scoort er
nul omdat hij de tweetekenklassen dekt; hij tilt het defect naar vier tekens in
plaats van het weg te nemen. De security-review op deze branch vond het
tegenvoorbeeld:

```
a  U+180F  U+1680  U+1BCA0
 1  U+1BCA0 is géén randteken -> de voorste trim komt niet bij U+1680
 2  de pijplijn haalt U+1BCA0 weg
 3  U+180F overleeft: rechterbuur U+1680 is niet-ASCII
 4  de áchterste trim haalt U+1680 weg en legt U+180F bloot
 5  pas een vólgende aanroep strijkt hem   ->   a
```

📏 Zelf nagemeten op de gedeployde functie: `1x = 61 e1a08f`, `2x = 61`. Werkende
schilden: `U+1BCA0`, `U+FFF3`, `U+E0020`, `U+E0067`, `U+E007F`.

**Dat is faalvorm A opnieuw, met een schild ervoor.** De zin die hieronder stond —
*"elke kant dekt precies de blootlegging die de andere veroorzaakt"* — was de
fout: niets dekt de blootlegging die de áchterste randstap zélf maakt, want die
staat nog steeds als laatste.

De twee falende vormen doen hetzelfde, van twee kanten:

- **A** — de randstap legt een nieuwe **context** bloot.
  📏 `ab` + `U+FE05` + `U+2001` → `ab` + `U+FE05` → `ab`. De trailing trim haalt
  `U+2001` weg, waardoor `U+FE05` aan het eind komt te staan en
  `zonder_onzichtbaar_tussen_letters()` hem alsnog pakt — maar die stap is al
  geweest.
- **B** — de pijplijn legt een nieuwe **rand** bloot.
  📏 `U+FFF3` + `U+2001` + `ab` → `U+2001` + `ab` → `ab`. 📏 `U+FFF3` zit wél in
  `zonder_onzichtbaar_middenin()` en **niet** in de randklasse, dus de pijplijn
  haalt hem weg en `U+2001` komt aan de buitenkant — zonder dat er nog een
  randstap komt.

Verplaatsen werkt dus niet, en verdubbelen ook niet: **elke eindige keten heeft
dit probleem opnieuw, één laag dieper.** Een derde randstap verschuift de grens
naar zes tekens. Vandaar D — een vast punt — want daar volgt de eigenschap uit de
constructie in plaats van uit een steekproef: de uitvoer ís een vast punt van de
pas, dus een tweede aanroep verandert niets. De pas binnenin blijft C, omdat die
de tweetekenklassen in één ronde dekt en een lange reeks randtekens weggooit vóór
de vijf regexen.

📏 Diepte gemeten: 1 voor de tweetekengevallen, 2 voor het viertekengeval, en
**stapelen maakt hem niet dieper** — `a` + (`U+180F U+1680 U+1BCA0`) × n geeft
voor n = 1..6 de dieptes 2, 1, 1, 1, 1, 1. Elke pas haalt álles weg wat op dat
niveau weg kan, dus een cascade groeit niet mee met de lengte. Het plafond van
acht is een rem, geen verwachting; wordt het gehaald, dan is de uitvoer geen vast
punt en weigert de CHECK de rij — dicht falen, net als `create_group()`.

📏 Op een **onafhankelijke** ruimte hergemeten — 17.044 drietallen, dus niet de
ruimte die het defect voortbracht: A 15, C 0, D 0. **En C en D geven op elk van
die gevallen hetzelfde antwoord**, dus C rekent het vaste punt in één pas uit.

## C is bovendien eenentwintig keer sneller

📏 Op vijf miljoen zero-width spaties: A 1932 ms, **C 89 ms**, D 1915 ms,
`btrim()` 85 ms. De eerste randstap gooit die vijf miljoen tekens weg vóórdat de
vijf regexen eroverheen gaan.

Dat maakt een aparte bovengrens overbodig. De security-ronde op QS8-515 stelde
voor om `handle_new_user()` een grens van duizend codepunten te geven, zoals
`create_group()` er een heeft, omdat die trigger `schone_naam()` op ongefilterde
`raw_user_meta_data` draait. Met C kost dat geval nog 89 ms. **Niet gebouwd, en
dat is een meting en geen aanname.**

## De vergissing die dit issue onderweg opleverde

⚠️⚠️ **`U+2028` wordt niet vervangen door een spatie.** Zowel de reactie op
QS8-526 als rij 828 in `docs/ENGINEER-REVIEW.md` voerden als meting op dat
`schone_naam(U&'a\2028b')` `'a b'` geeft, en bouwden daarop de conclusie dat
convergentie niet gratis is. 📏 Hermeten in hex: de uitvoer is `61 e280a8 62` —
het teken is onaangeraakt. `U+2028` is LINE SEPARATOR en een terminal toont hem
als witruimte.

Op die vergissing is in dit issue eerst een verkeerde verklaring gebouwd, en pas
de hex-meting haalde hem onderuit. `tests/rls/naamnormalisatie.test.ts` draagt
dezelfde les al in de kop van `alsHex()` — *één regel per geval, en een verschil
in onzichtbare tekens wordt er leesbaar van.* **Een bestand dat de les al draagt,
beschermt je er niet tegen als je hem buiten dat bestand overtreedt.**

📏 Wat er wél geldt, over dezelfde 1.136.356 gevallen: de uitvoer wordt nooit
langer (0) en is nooit even lang terwijl de tekst verandert (0). Alle vijf de
stappen vervangen door `''` of door hun eigen capture. Convergentie is dus wél
gegarandeerd — het argument klopte, de tegenmeting niet.

## De grendel, en wat de ijking eraan veranderd heeft

`tests/rls/naamnormalisatie.test.ts` veegde per codepunt. 📏 Dat kán deze klasse
niet vinden: het hele codepuntbereik in enkelvoudige vormen geeft **nul**
niet-idempotente gevallen. Er waren er twee nodig — het ene teken moest het andere
ergens naartoe schuiven.

⚠️⚠️ **En precies die zin is de val geweest.** Hij was waar vóór de reparatie.
Vorm C tilde de ariteit naar vier, en de veeg bleef op twee zoeken — dus de `0`
die eruit kwam was een eigenschap van de zoekruimte en niet van de functie.
**Vraagt een reparatie meer tekens dan het defect, dan is de ruimte die het defect
vond te klein geworden om de reparatie te toetsen.** De veeg draagt daarom nu ook
een viertekenfamilie, en de grendel is de lus: 📏 het plafond op 1 zetten maakt
twee toetsen rood.

De nieuwe veeg kruist daarom twee verzamelingen per randstap: randteken × context
(klasse A) en pijplijn-maar-geen-randteken × randteken (klasse B).

⚠️⚠️ **Drie dingen zijn pas door de ijking goed gekomen, en geen ervan was
bedacht:**

1. **Met alleen familie A bleef de suite groen** toen de randstap ná de pijplijn
   eruit gehaald werd. Eén familie per randstap, anders bewaakt de helft niets.
2. **Ook mét familie B bleef hij groen**, want `U+2001` viel net buiten de
   steekproef. De twee gemeten tegenvoorbeelden staan nu **vast** in de ruimte:
   een grendel hoort het geval te dragen dat hem nodig maakte, en een modulo is
   geen garantie.
3. **De suite werd rood op zijn eigen gereedschap.** `viaDeDatabase()` geeft elke
   waarde als eigen `-v`-argument mee; bij tienduizenden gevallen valt die aanroep
   om op de argumentenlijst in plaats van op de functie. 📏 Dezelfde veeg in kaal
   SQL gaf nul afwijkingen. De veeg gaat nu in brokken over stdin, met een
   telling erachteraan die luid faalt als het aantal regels niet klopt.

⚠️ **En één rood was helemaal niet van mij:** een eerdere ijkronde werd door zijn
tijdslimiet afgebroken vóór het herstel, dus de volgende "schone" run draaide
tegen de B-mutant. Elke meting hierna noemt daarom eerst welke vorm er
gedeployd staat. Dat is `docs/decisions/2026-09-10-een-rood-is-niet-vanzelf-jouw-rood.md`
in de praktijk.

📏 **De ijking zoals hij nu staat:** schoon 28 groen; de randstap vooraf uit de
database → 2 rood; de randstap achteraf eruit → 2 rood; de randstap uit de
TypeScript-kant → 3 rood, waaronder de vergelijking tussen de twee talen.

## Wat er bewust blijft liggen

- **De vaste-puntlus in `create_group()` (0287)** doet geen werk meer en blijft
  staan. De `name_invalid`-handler ernaast dekt ook CHECKs die er later bij komen;
  hem weghalen is een eigen besluit. De kop van 0287 zegt nu dat zijn premisse
  vervallen is.
- **Bestaande rijen zijn alleen lokaal gemeten.** 📏 `0` rijen in `profiles` en
  `groups` schenden de CHECK — op een database die de suite zelf opbouwt en die
  leeg is (`0` en `0` rijen). ⚠️ **Dat is dus geen uitspraak over productie**, en
  vanuit een bouwsessie is die niet te doen: er is geen productiesleutel. De
  CHECKs stonden er al vóór deze migratie en `schone_naam()` is alleen strénger
  geworden op invoer die hij eerder half liet staan, dus een rij die de oude CHECK
  haalde, haalt de nieuwe ook — maar dat is een redenering en geen meting.
