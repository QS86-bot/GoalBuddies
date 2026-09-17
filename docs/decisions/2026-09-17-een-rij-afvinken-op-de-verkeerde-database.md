# Een dossierrij hermeet je op de database waar hij het over heeft

**17-09-2026 — QS8-523.** Drie open **Middel**-rijen in `docs/ENGINEER-REVIEW.md`
gingen over wat er langs de CHECKs van `profiles.display_name` en `groups.name`
komt. Op de lokale stack waren ze alle drie dicht. Op productie was er één dicht.

## 1. De meting

| rij | geval | map (0286) | productie (0282) |
|---|---|---|---|
| 778 | `Ja`+`U+200B`+`n`, idem `U+FEFF` / `U+00AD` / `U+200C` | geweigerd | **geweigerd** |
| 786 | tien nul-pixeltekens aan de rand van `می` | 0 van 10 door | **10 van 10 door** |
| 775 | een groepsnaam van uitsluitend onzichtbare tekens | geweigerd | **komt erdoor** |

Rij 778 is gedicht door **0271** en **0282**, allebei uitgerold. Rij 786 en 775
zijn gedicht door **0283** en **0286**, en die staan alleen in de map:
`supabase/migrations/` loopt vier migraties vóór op productie.

## 2. De fout die hier bijna in ging

De voor de hand liggende handeling — de lokale stack opbouwen, de battery
draaien, drie rijen afvinken — geeft **drie keer groen**. Dat is precies de
fout die deze reeks issues corrigeert (QS8-433, QS8-516, QS8-521), alleen
gespiegeld: dáár zeiden rijen dat productie achterliep terwijl dat niet meer zo
was; hier zou de rij zeggen dat het dicht is terwijl productie het gat nog
draagt. **De tweede richting is de gevaarlijke**: een rij die ten onrechte
openstaat kost een lezer tijd, een rij die ten onrechte dicht staat haalt een
bevinding van de agenda.

⚠️ **De regel die eruit volgt is smal en toetsbaar:**

> Een dossierrij hermeet je op de database waar de rij het over heeft. Zegt de
> rij *"gemeten op productie"*, dan is een lokale meting geen hermeting maar een
> ander onderzoek.

Rij 786 schreef zijn bron er zelf bij (*"Gemeten op productie (16-09-2026,
read-only, stand `0282`)"*). Dat is wat het verschil zichtbaar maakte — dezelfde
gewoonte die CLAUDE.md voorschrijft voor de meetdatum, en om dezelfde reden.

## 3. Waarom de tegenproef erbij hoort

De lokale uitslag was **0 van 13** op beide kolommen, midden én rand. Die vorm
leest identiek of de grendel werkt óf het meetpad dood is: een `update` die op
RLS strandt geeft ook nul doorgelaten gevallen.

In dezelfde transactie, langs dezelfde weg, zijn daarom vijf must-allows
meegedraaid:

```
'Jan Jansen'                   UPDATE 1
می            (kale basis)     UPDATE 1
م + U+200C + ی                 UPDATE 1      orthografisch verplicht
👨 + U+200D + 👩                UPDATE 1      de lijm van een samengesteld gezin
groups.name = 'Andere Naam'    UPDATE 1
create_group('Nette Groep', …) doorgelaten
```

Dat is dezelfde eis als bij elke controle in dit project: de vormen die hij moet
vinden **en** de vormen die hij met rust moet laten.

## 4. Wat rij 778 onderweg bewees

Rij 778 vroeg om *"een eigen uitzonderingsanalyse per teken"* en waarschuwde dat
de naïeve reparatie `U+200D` (de lijm in een samengesteld gezin) en `U+200C`
(orthografisch verplicht in het Perzisch, Hindi en Bengaals) zou wegknippen.

📏 Die analyse staat er, en niet als tekst maar als **twee** CHECKs: `U+200B`,
`U+FEFF` en `U+00AD` vallen op `profiles_display_name_geen_onzichtbaar_middenin`
(0271), `U+200C` en `U+200D` op
`profiles_display_name_geen_onzichtbaar_tussen_letters` (0282) — en die laatste
laat ze staan zodra er aan weerszijden een letter uit hetzelfde schrift staat.
De must-allows hierboven zijn daar het bewijs van.

## 5. De klasse eronder

Geen van de drie PR's die deze gaten dichtte, raakte de rij die het gat benoemde.
Dat is rij 748 (*"criterium 5 van een issue — werk de dossierrij bij — heeft geen
grendel"*), en de PR van QS8-508 is het scherpste geval: die voegde **drie
nieuwe Laag-rijen** toe — de bevindingen die hij onderweg vond — en liet de
**Middel**-rij die hij juist repareerde openstaan.

⚠️ Dat is geen slordigheid maar een asymmetrie: een nieuwe bevinding schrijf je
op omdat je hem net gevonden hebt, en de oude rij sluiten is een opzoekactie in
een document van achthonderd regels. **Wat een opzoekactie kost, gebeurt
onregelmatig** — en daarom loopt het dossier één kant op scheef.

## 6. Wat dit besluit niet is

- **Geen nieuwe controle.** `review:controle` toetst of een rij zichzelf
  tegenspreekt; of een rij nog wáár is, is geen eigenschap van het document.
  Dat blijft handwerk, zoals vraag 5 van regel 18 dat ook blijft.
- **Geen uitrol.** 0283 t/m 0286 staan nog in de map. Dat is QS8-243, en het is
  een besluit van Quinten — live code tegen echte gebruikers.
- **Geen verruiming van rij 775.** De normalisatievorm van `create_group()`
  (`btrim()` in plaats van `schone_naam()`) is een eigen bevinding geworden en
  staat als QS8-515. Die gaat over de vórm van de weigering, niet meer over de
  vraag of de naam erdoor komt.
