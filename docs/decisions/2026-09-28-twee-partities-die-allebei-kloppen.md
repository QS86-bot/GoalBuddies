# Twee partities die allebei kloppen — de snede zit in één pad

**Datum:** 28-09-2026
**Issue:** QS8-621 (met QS8-620 als aanleiding)
**Raakt:** `docs/PROMPT-SESSIE.md` §0

## Waar dit vandaan komt

QS8-603 is op 24-09-2026 twee keer gebouwd, door twee sessies naast elkaar. De
ene versie is geland, de andere niet. Dit document gaat over het enige
inhoudelijke verschil dat daarbij is blijven liggen, en over wat de meting
erachter ons leert.

De tijdlijn en het mechanisme staan in QS8-620; hier gaat het alleen om de
inhoud.

## De twee partities

Beide versies tellen dezelfde 144 merges op `main` sinds 13-09 en delen ze in
vier vakjes in die optellen tot 144. Ze komen op een andere uitkomst:

| | gelande versie | niet-gelande versie |
| --- | --- | --- |
| raakt grendel, geen broncode | 53 | 75 |
| raakt broncode én grendel | 52 | 30 |
| raakt geen van beide | 38 | 38 |
| raakt broncode zónder grendel | 1 | 1 |
| **som** | **144** | **144** |

Dat ziet eruit als een tegenspraak en is het niet. **Beide definiëren hun
begrippen, en de definities verschillen op precies één pad:**

* gelande versie — broncode = `src/`, `app/`, `supabase/migrations/`, `supabase/functions/`
* andere versie — broncode = `src/`, `app/`, `supabase/functions/`

## 📏 De meting die dat vaststelt

Niet beredeneerd maar gedraaid. Het telblok uit §0 met één wijziging —
`supabase/migrations` uit de `BRON`-regex — geeft op dezelfde commit:

```
merges=144  grendel-zonder-bron=75  beide=30  geen-van-beide=38  bron-zonder-grendel=1
```

Dat is de andere kolom hierboven, tot op de eenheid. **Er is dus geen vierde
verklaring nodig en geen van beide reeksen is fout.**

## Het besluit

**`main` houdt zijn eigen snede: een migratie is broncode.**

De reden is niet dat de andere lezing onverdedigbaar is — hij is goed te
verdedigen, want een migratie is geen code die draait in de app. De reden is wat
de rij moet beantwoorden. De vraag onder deze tabel is *hoeveel van het werk
raakt het product en hoeveel raakt het gereedschap eromheen*, en een migratie
verandert het schema waar de hele app op rust. Hem bij het gereedschap zetten
maakt de rij "raakt broncode én grendel" kleiner zonder dat er minder aan het
product gewerkt is.

⚠️ **Wat dit besluit niet is: een uitspraak dat 75 verkeerd was.** Wie die snede
wil, verandert één regex en krijgt een reeks die net zo goed klopt. Wat niet mag
is de twee door elkaar gebruiken — een tabel met de ene definitie en een getal
uit de andere is een tegenspraak die niemand kan naspeuren.

## Wat er daarom in §0 staat

Eén draaibaar blok in plaats van commando's per rij, met drie eigenschappen:

1. **De twee regexen staan bovenaan**, als `BRON` en `GRENDEL`, en niet verstopt
   in de lus. Ze zijn de definities uit de tabel eronder, woordelijk.
2. **De verwachte uitvoer staat eronder als commentaar.** Een afwijking is
   daarmee zichtbaar zonder dat je de tabel erbij hoeft te zoeken.
3. **Alle negen getallen komen uit één aanroep.** Dat was de aanleiding: de
   getallen stonden er mét commando's, maar die voedden de telling en leverden
   hem niet op, dus het handwerk ertussen was de plek waar twee sessies uit
   elkaar konden lopen — en dat is precies wat er gebeurd is.

## Geijkt

Drie mutaties, elk op één definitie, alle drie op het blok **zoals het in het
document staat** (eruit geknipt en gedraaid, niet op een kladversie):

| mutatie | uitkomst |
| --- | --- |
| `supabase/migrations` uit `BRON` | 75/30/38/1 — de andere snede, exact |
| `tests/` uit `GRENDEL` | 40/21/51/32 |
| venster een dag later | 130 merges in plaats van 144 |

De som blijft 144 waar het venster gelijk blijft; dat hoort, want het is een
partitie. **Wat de ijking aantoont is dat elk getal aan zijn definitie hangt** en
dat het blok niet toevallig op de goede reeks uitkomt.

## Wat hier bewust niet gebeurt

De drie onderste rijen van §0 — Linear-standen, open PR's en de CI-duur — krijgen
géén script. Ze zijn op 22-09 met de hand gemeten en niet aan een commit te
hangen; §0 zegt dat er al bij. Er een commando bij verzinnen dat *vandaag* meet,
zou suggereren dat het dezelfde meting is.
