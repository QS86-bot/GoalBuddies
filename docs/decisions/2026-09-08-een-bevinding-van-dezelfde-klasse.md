# Een bevinding van dezelfde klasse landt op de branch waar hij gevonden is

**Datum:** 08-09-2026 · **Besluit van:** Quinten · **Raakt:** onwrikbare regel 19,
`docs/BACKLOG-PLAN.md` §1

## De meting die de vraag opriep

📏 Dertien branches uit 07 en 08-09-2026 leverden **zestien** nieuwe
backlog-issues op, allemaal uit de security-ronde die op die branch draaide:

| Gebouwd op | Leverde op | Klasse |
| -- | -- | -- |
| QS8-352 | QS8-354, QS8-355 | een client schrijft een kolom die hij niet hoort te schrijven |
| QS8-349 | QS8-351, QS8-353 | idem |
| QS8-343 | QS8-347 | hoevéél een client in één verzoek mag invoegen |
| QS8-342 | QS8-345 | een lijst zonder bovengrens in een scherm |
| QS8-340 | QS8-350 | een grendel die zijn eigen klasse niet volledig dekt |
| QS8-341 | QS8-346 | een controle die zichzelf overslaat |
| QS8-330 | QS8-338 | dezelfde reparatie op een tweede set aanroepen |
| QS8-317 | QS8-321, QS8-322 | wat een straf overleeft |
| QS8-331 | QS8-335 | idem |
| QS8-312 | QS8-333 | idem |
| QS8-328 | QS8-332 | de weg terug voor een oud-lid |
| QS8-314 | QS8-325 | een toestand in een CHECK zonder schrijver |
| QS8-297 | QS8-305 | dezelfde vormtoets op het tweede platform |

**Zestien issues, zeven klassen.** Vier zeggen hetzelfde over de schrijfkant van
kolomrechten, vier over wat een straf overleeft. Ze zijn één voor één aangemaakt
omdat ze één voor één gevónden zijn, niet omdat het één voor één verschillende
problemen zijn.

⚠️ In diezelfde twee dagen kwamen er 104 issues bij en gingen er 82 uit. De
uitstroom houdt het bij; de instroom is de helft waar niemand naar keek.

## Het besluit

**Een bevinding die tot dezelfde klasse hoort als het issue waaraan gewerkt
wordt, landt op díe branch. Een bevinding van een ándere klasse blijft een eigen
issue.**

## Waarom dit niet botst met de bundelregel

`CLAUDE.md`, versiebeheer: *"Bundelen mag alleen als de issues één ondeelbare
wijziging zijn — en dan hoort er één issue te zijn, geen acht."*

Die regel verbiedt het samenvóegen van issues die er al zijn. Dit besluit gaat
over het moment ervóór: het voorkomt dat er een tweede issue ontstaat voor iets
wat dezelfde reparatie is. **Er is dus nooit een moment waarop twee bestaande
issues op één branch komen.**

⚠️ En het verandert niets aan "één branch per Linear-issue". Wat er verandert is
wanneer een bevinding een Linear-issue wórdt.

## Wat "dezelfde klasse" betekent, en wat niet

Dezelfde klasse is: **dezelfde belofte, dezelfde reparatie, een andere
instantie.** De vier kolomrechten-issues zijn er een voorbeeld van — één
`revoke`-redenering, vier tabellen.

Het is níét: hetzelfde bestand, dezelfde tabel, of "ik was er toch". Bij twijfel
is het een eigen issue, om dezelfde reden als bij domeinregel 7: een grens die je
oprekt bij twijfel, is geen grens meer.

⚠️ **Drie dingen blijven onveranderd, en zonder die drie is dit besluit een
gat:**

1. **De bevinding wordt genoemd.** In de commit-tekst en in het issue: wát er
   naast de opdracht gevonden is en waarom het dezelfde klasse is. Een bevinding
   die stil in een branch verdwijnt, is erger dan een issue te veel.
2. **De poort geldt onverkort.** Een instantie erbij is een reparatie erbij, met
   dezelfde ijking en dezelfde must-allow-helft.
3. **De PR wordt niet groter dan hij kan dragen.** Loopt het op boven wat er in
   één keer te beoordelen is, dan is het alsnog een tweede issue. Het is een
   afweging en geen rekensom.

## Wat er níet mee opgelost is

Dit remt de instroom; het maakt hem niet nul. Van de zestien hierboven zouden er
met deze regel ongeveer negen niet als issue zijn ontstaan — de zeven klassen
blijven. Dat is de orde van grootte en geen belofte.

⚠️ En het verplaatst een risico: een klasse die op één branch afgehandeld wordt,
is één PR die groter is. De rem daarop is punt 3 hierboven en het oordeel van
degene die hem schrijft.
