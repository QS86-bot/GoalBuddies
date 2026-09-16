# Een cel te veel is een kolom te weinig

**Datum:** 16-09-2026
**Issue:** QS8-500
**Raakt:** `docs/decisions/002-domeinregel7-oppervlakken.md`, `scripts/review-controle.mjs`
(de knip), `npm run tabelcellen:controle` (nieuw)

---

## 1. Wat er stuk was

Drie tabelrijen renderden hun laatste kolom niet. GFM knipt een rij op élke
niet-ontsnapte `|` — ook binnen backticks, want een codespan wordt pas ná het
knippen herkend — en laat overtollige cellen aan het **eind** vallen, of vult
aan met lege. In beide gevallen gaat de laatste kolom eraan, en dat is in dit
project stelselmatig de kolom die de stand draagt.

| Rij | Wat er stond | Wat de lezer zag |
|---|---|---|
| hoofdtabel 9 — Systeemberichten | 6 cellen | de hele uitleg over het samenvouwen (QS8-198) rendert **niet** |
| A41 33 — Een foto als bewijs | 3 cellen | `Stand` leeg |
| A41 31 — Het verleden van een aanvrager | 5 cellen, in een tabel van 4 | `Stand` weg, én een dubbel rijnummer |

📏 De eerste staat er sinds **10-09-2026** (merge `7a46f40f`). Dat is vijf dagen
ná de dag waarop QS8-198 die alinea schreef en vijf dagen vóór QS8-500 werd
aangemaakt — en dat issue meldt de hoofdtabel met zoveel woorden als *"geen
enkele afwijking"*. **Een handmatige telling vindt wat je toevallig aankijkt.**

## 2. Wat er per rij besloten is

**Rij 9.** De zesde cel is teruggeduwd in kolom 5. Hij hoort daar en niet in
"Wat de groep ziet": de tabel legt lange aantekeningen consequent in de laatste
kolom, en rij 9 doet dat al vier keer eerder in dezelfde cel.

**A41-rij 33.** De ontbrekende `Stand` is `🔓 **Om — geërfd via 0077**`. Dat is
geen nieuwe bewering: de rij méét hem al in zijn eigen tekst (*beschermd →
weekdoel 0, voltooiing 0, object 0; open → 1, 1, 1*) en zegt er zelf bij dat de
verruiming geërfd is en nergens als besluit stond. De bestaande notatie
`🔓 **Om (0141)**` gaat over een migratie die iets ópenzette; hier zette niets
iets open, en dat verschil hoort in de cel te staan.

**A41-rij 31.** Verhuisd naar de hoofdtabel als **rij 39**. Hij had de vorm van
die tabel (vijf cellen, met `Waar` en `Afgedwongen door`), zijn nummer botste
met de bestaande A41-rij 31, en 📏 `verzoekers_eerder_lid()` kwam in het hele
document nergens anders voor — hij was dus nooit in de hoofdtabel aangekomen,
niet gedupliceerd.

⚠️ **Wat hier níet gerepareerd is:** de A41-tabel nummert 1–20, dan 31–38, dan
21–23 en 26–30. Die volgorde is ouder dan dit issue en verandert niets aan wat
er rendert; hem rechttrekken is churn in een document waar elke rij een
verwijzing draagt.

## 3. Waarom er een controle bij komt, en waarom een eigen

`review:controle` telt de cellen al, en hij doet het goed — sinds QS8-415 knipt
hij zoals GFM knipt. Maar hij kijkt naar **één** bestand. Dat is de vorm die
QS8-417 benoemt: *een reparatie die de instanties opruimt en het mechanisme laat
staan, groeit terug* — en hier groeide hij terug in het document waar CLAUDE.md
de lezer bij élk nieuw groepsoppervlak heen stuurt.

`npm run tabelcellen:controle` doet die telling over alle `.md` onder `docs/`,
plus `CLAUDE.md` en `PRD-accountability-app.md`. Hij **hergebruikt**
`cellenVanRij()` uit `scripts/review-controle.mjs` in plaats van hem na te
bouwen: twee knippen die uiteen kunnen lopen is precies het defect dat deze
controle bewaakt.

📏 Na de drie reparaties: **587 tabellen, 3274 rijen, 210 bestanden, nul
afwijkingen.** Daarom staat er geen uitzonderingsregister onder — een lijst die
niets dekt, is een lijst die volloopt.

⚠️ **De zeef telt wat hij ziet, en gaat rood op nul tabellen.** Zonder die tak
is groen niet te onderscheiden van een `BRONNEN` die niets meer oplevert. Dat is
dezelfde zorg als *"een controle zonder database is niet groen maar
ongemeten"*.

## 4. Wat hij met opzet niet doet

Een rij mét het juiste aantal cellen maar een **lege** laatste rendert net zo
leeg. 📏 Nul rijen in `docs/` hebben dat vandaag, en het is een andere belofte:
de céltelling gaat over wat GFM wegknipt, een lege cel is een
leesbaarheidsvraag. Hem hier meenemen zou de scope stil verbreden — precies
waar `docs/decisions/2026-09-15-de-scope-van-een-grendel-is-zelf-een-bewering.md`
voor waarschuwt. De toets staat er als must-allow in.

## 5. De ijking, en de eerste poging die niets bewees

📏 Met de hand gedraaid, mutatie per grendel:

* rij 9 zijn zesde cel teruggegeven → exitcode 1, `:65  6 cellen in plaats van 5`
* de Stand-**cel** van rij 33 weggehaald → exitcode 1, `:406  3 cellen in plaats van 4`

⚠️⚠️ **De tweede ging de eerste keer mis, en op een leerzame manier.** Daar ging
de *inhoud* van de cel weg en niet de cel: de rij hield vier cellen met een lege
laatste, en de controle zweeg — terecht. Ik las die stilte bijna als een gat in
de controle. Dat is de vorm die CLAUDE.md afwijst: *een ijking die zijn geval
door een pad voert dat een eerdere grendel al afvangt, bewaakt niets van wat hij
belooft.* Hier was het geen eerdere grendel maar een verkeerd geval — dezelfde
uitkomst, en dezelfde reden om te kijken wélke grendel je breekt.
