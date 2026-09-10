# De kolom die de lezer niet ziet — 10-09-2026

**Issue:** QS8-415
**Raakt:** `docs/ENGINEER-REVIEW.md` (21 rijen), `scripts/review-controle.mjs`, `tests/scripts/review-controle.test.ts`

---

## 1. Wat er stuk was

`docs/ENGINEER-REVIEW.md` is één tabel met vier kolommen, en de vierde is het
risico. In GitHub Flavored Markdown scheidt binnen een tabelrij **elke
niet-ontsnapte `|` een cel — ook binnen backticks**. Een codespan wordt pas ná
het knippen herkend; de spec vraagt daar met zoveel woorden `\|`. Draagt een rij
daardoor meer cellen dan de kop, dan gooit GFM de overtollige weg **aan het
eind**, en dat is precies de risicokolom.

📏 Hermeten op 10-09-2026 tegen `main` op `d757ae6`, 597 dossierrijen:

| Vorm | Aantal |
| -- | -- |
| Rijen die iets ánders dan hun risico renderen (drie ervan leeg) | **18** |
| Rijen waar het risico wél rendert maar de tekst eráchter wegvalt | **3** |

Voorbeeld: de rij van `alleenlezen_bewaking()` hoorde **Middel** te zeggen en
rendert `ALL`. De rij over de EXIF-meting hoorde **Laag** te zeggen en rendert
`EXIF`.

Dit is geen cosmetiek. Dit document *is* de agenda voor de engineer-review van
november, de risicokolom is waarop iemand sorteert, en een rij die leeg rendert
leest als een rij zonder risico. In een teksteditor is er niets aan de hand — het
valt alleen om bij het renderen, en dat is precies hoe een reviewer het opent.

## 2. Waarom de controle die hierop staat het niet zag

`review:controle` bestaat sinds QS8-123 en las de risicokolom door van rechts
naar links te knippen. Er stond zelfs een comment bij:

> *Van rechts lezen. Een cel kan een `|` bevatten binnen backticks — dat is niet
> theoretisch, de rij over de twee voortgangsbalken doet het — en naïef splitsen
> op `|` zet dan de verkeerde kolom als risico.*

Die zin klopt over de brontekst en is een omweg om het probleem heen. De
schrijver zag het verschijnsel, koos ervoor eromheen te lezen, en maakte de
controle daarmee **groen over een document dat verkeerd rendert**.

Dat is regel 18 vraag 3 in zijn zuiverste vorm — *kan deze test groen blijven
terwijl de belofte breekt?* — met het antwoord dat er twee weken lang stond: ja,
en dat deed hij ook. De les eronder is scherper dan "beter splitsen":

> **Een controle die een lastig geval omzeilt in plaats van het te melden,
> bewaakt vanaf dat moment de omweg en niet de belofte.**

De belofte gaat over het **gerenderde** document, want zo leest een reviewer het.
Vandaar dat `cellenVanRij()` nu knipt zoals GFM knipt, en dat toets 0 vóór alle
andere gaat: op een verschoven rij zegt "het risico" niets meer.

## 3. Waarom geen parser als dependency

Het issue mat met `marked`. Deze reparatie doet het zonder, en dat is een keuze
en geen gemak: de regel die hier telt is **volledig** — binnen een tabelrij is
elke niet-ontsnapte `|` een scheiding en alleen `\|` is inhoud. Dat is geen
benadering van een parser maar diezelfde regel, in acht regels code.

De prijs van een parser zou echter zijn dat het antwoord op *"waar knipt GFM"*
verhuist naar een pakket dat niemand hier bijhoudt, in een repo waar de scripts
bewust geen runtime-afhankelijkheden hebben. 📏 De kruiscontrole is er wel: het
issue mat met `marked` **18** rijen, en deze implementatie meet er onafhankelijk
**18**.

## 4. Hoe de 21 rijen gerepareerd zijn

Twee passen, en de tweede bestaat omdat de eerste niet alles aankan.

**Pas 1 — automatisch, 17 rijen.** Een wegwerpscript dat elke `|` binnen een
backtick-codespan ontsnapt. Idempotent (een `|` met een `\` ervoor blijft met
rust), en met één grendel erin die zichzelf bewees: **een omzetting die de rij
ónder de vier cellen duwt, wordt geweigerd.**

📏 Die grendel sloeg meteen aan. De eerste versie van het script volgde
backtick-runs op lengte en raakte op één rij de tel kwijt; het ontsnapte daar de
échte celscheidingen aan het eind, waarna de rij drie cellen had. Zonder die
weigering was dat een stille beschadiging geweest in een bestand van 650 regels.
Die ene rij bleek helemaal geen reparatie nodig te hebben.

Onwrikbare regel 20 (de uitbreiding van QS8-209) is hiermee gehaald langs de weg
die hij zelf noemt: het script hoeft geen wegwerpcode te zijn die je durft te
herhalen, want `review:controle` wordt rood zodra het twee keer draait —
`\|` wordt dan `\\|`, dat rendert als een backslash plus een celscheiding, en de
rij verschuift alsnog.

**Pas 2 — met de hand, 4 rijen.** Drie rijen droegen een aantekening **áchter**
de risicokolom (die valt in zijn geheel weg bij het renderen); die is naar de
beschrijvingskolom gegaan. Eén rij had titel en beschrijving als twee losse
cellen en telde daardoor vijf; die twee zijn samengevoegd. Geen tekst is
weggegooid.

## 5. De ijking

Vier grendels, vier mutaties, elk met een `grep` bevestigd vóór de uitslag
geloofd werd:

| Grendel | Mutatie | Uitslag |
| -- | -- | -- |
| A — een niet-ontsnapte `\|` in een codespan | `` `SELECT\|INSERT` `` in een celtekst | rood, `kolom-verschoven` |
| B — tekst achter de risicokolom | een vijfde cel achter `Laag` | rood, `kolom-verschoven` |
| C — wat hij met rust moet laten | dezelfde codespan mét `\\\|` | **groen** |
| D — de kopgrendel | een vijfde kolom in de kop | rood met de kopmelding, **niet** 597 rijklachten |

D verdient een woord. Zonder die grendel zou een vijfde kolom in de kop élke rij
als verschoven melden — en een controle die zeshonderd dingen meldt, leer je
uitzetten. Hij faalt daarom hard op de kop, met de reden erbij.

## 6. Wat dit niet is

Geen herziening van de inhoud van de agenda: geen risiconiveau is aangepast en
geen rij is weggehaald. Alleen de twintig strepen die de kolom verschoven, en de
vier rijen waarvan de celindeling niet klopte.
