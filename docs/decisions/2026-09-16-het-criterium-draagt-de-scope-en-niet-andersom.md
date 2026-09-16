# Het criterium draagt de scope, en niet andersom

**16-09-2026 — QS8-507, migratie 0284.** Beslisdocument bij het uitrollen van de
bidi-CHECK en de nul-pixelregel over de rest van de groepszichtbare vrije tekst.

Dit document is het vervolg op
`docs/decisions/2026-09-16-een-scope-die-je-erft-erf-je-met-zijn-criterium.md`.
Dat beschrijft hoe de scope van QS8-506 een criterium erfde dat niet het zijne
was; dit beschrijft wat er gebeurt als je hem wél zelf afleidt.

---

## 1. Het criterium, en dat het eerst opgeschreven is

> **Vrije gebruikerstekst die een ánder dan de schrijver kan lezen.**

Dat is de reikwijdte die de twee regels zélf dragen. De bidi-CHECK bestaat omdat
tekst anders kan renderen dan hij is opgeslagen; de nul-pixelregel omdat een
teken dat als nul pixels rendert nooit inhoud is. Geen van beide onderbouwingen
hangt aan een knop — dat deed alleen de uitrolvolgorde van 0269 → 0274.

📏 Toegepast door élke tekstkolom in `public` langs twee metingen te leggen:
heeft `authenticated` er een SELECT-grant op, en heeft de SELECT-policy een tak
die verder reikt dan de schrijver zelf. Beide ja = groepszichtbaar. De uitkomst
staat per kolom in de kop van 0284: **twaalf erin, vijf eruit, elk met zijn
meting.**

⚠️ **De twee vragen zijn niet inwisselbaar, en dat leverde meteen twee kolommen
op die eruit vielen om de *tweede* reden.** `goals.identity_statement` en
`profiles.when_i_do_it` staan in tabellen die wél groepszichtbaar zijn, en zijn
dicht via een **kolomgrant**. Dat is precies de vorm die CLAUDE.md voorschrijft
waar RLS tekortschiet — *RLS kan geen kolommen beperken* — en hier werkt hij. Een
policy-only meting had ze allebei ten onrechte binnengehaald.

## 2. De kolom die eruit moest en er eerst in stond

`reports.bericht_kopie` stond in de eerste versie van deze migratie. 📏 Toen de
schrijfroute opgezocht werd — per kolom, niet per schema — bleek waarom dat niet
kan:

```
meld(), regel 78:   left(v_kopie, 1000)
v_kopie komt uit:   chat_messages.body
chat_messages.body: staat met reden BUITEN deze migratie
```

Een CHECK op de kopie is dus strenger dan de bron. Het gevolg is niet dat er iets
geweigerd wordt dat niemand wilde — het gevolg is dat **een bericht met een
onzichtbaar teken erin niet meer te melden is**. Dat is de meldknop, en die
bestaat voor intimidatie.

> ⚠️⚠️ **Een kopie erft de grenzen van zijn bron.** Een kopieerroute strenger
> maken dan wat hij kopieert breekt de kopieerder — en het breekt hem op invoer
> die iemand ánders geschreven heeft, dus degene die vastloopt kan er niets aan
> doen.

Zelfde klasse als de tweede schrijfroute naar `completions.note` bij QS8-506, één
laag hoger: daar liep één van twee routes dood, hier zou een hele route
doodlopen op de inhoud van een ándere tabel.

⚠️ En `left(…, 1000)` knipt op een codepuntgrens: dat kan een vlagreeks halveren
en een losse tag achterlaten. Wie de kopie ooit tóch wil grendelen, grendelt
eerst de bron en kijkt dán naar die knip.

## 3. De kolom die eruit viel omdat hij geen tekst is

`reports.reden` is een `text`-kolom en ziet er in een kolomlijst uit als vrije
tekst. 📏 `reports_reden_geldig` beperkt hem tot vijf letterlijke waarden. Een
tekengrens erop kan per constructie nooit vuren.

**Een CHECK die niet kan vuren is geen grens maar ruis in de lijst** — en een
lijst met ruis erin leer je scannen in plaats van lezen. Dat is dezelfde reden
waarom een controle die alles meldt, een controle is die je uitzet.

## 4. Wat er met reden wacht

`chat_messages.body` voldoet aan het criterium en gaat hier tóch niet mee. Het is
de heetste schrijfroute van de app, en de openstaande rij in
`docs/ENGINEER-REVIEW.md` over de kosten van een regex-CHECK bij zeer lange
invoer zou hier voor het eerst op een pad staan dat bij élk bericht draait. Die
kosten zijn op een lege database niet te meten.

⚠️ **Dit is een uitstel mét een reden en een plek, en dat is het verschil met wat
QS8-506 opleverde.** Daar ontbrak juist de plek: `milestones` viel buiten het
criterium zónder dat iemand hem hoefde af te wijzen, en stond daardoor in geen
enkele afvallerslijst. Een kolom die je afwijst met een meting erbij, vindt de
volgende lezer terug. Een kolom waar niemand aan gedacht heeft, niet.

## 5. De client, en de les die nu twee keer hetzelfde was

0269 schrijft de drieslag uit: de database weigert, de client strijkt stilletjes.
Zonder die tweede is een CHECK geen grens maar een storing.

📏 Van de twaalf kolommen gingen er tien langs een Zod-schema en **twee langs
geen enkel**: `deadline_requests.decision_note` (via het argument van
`beslis_deadline_verzoek()`) en `reports.toelichting` (via `meld()`). Precies de
vorm van K1 bij QS8-506.

> **Een schema hoort bij een formulier en niet bij een kolom.**

Daarom is voor deze twaalf per kolom de **schrijfroute** opgezocht en niet het
schema. Dat kostte meer tijd en het leverde de twee gevallen op die anders pas
bij een gebruiker waren opgevallen — en bij `reports.toelichting` zou dat een
gebruiker zijn die op dat moment iets aan het melden is.

`src/modules/goals/rpc-tekstroutes.test.ts` bewaakt die twee. Hij heeft geen
tweede route om naast te leggen, dus hij eist dat wat er de deur uit gaat een
**vast punt** van `zonderNulPixels()` is — woordelijk wat de CHECK vraagt — met
een tweede toets eronder die vaststelt dat er daadwerkelijk iets gestreken wordt.

## 6. De ijkingen

⚠️ Mutatie per grendel, en kijken wélke toets omvalt.

| # | mutatie | rood geworden |
|---|---|---|
| 10 | `milestones_title_geen_nul_pixels` gedropt | *elke kolom noemt beide regels* — meldt `milestones.title bidi -` |
| 11 | `beslisDeadlineVerzoek()` terug naar `.trim()` | 7 van de 16 in `rpc-tekstroutes` |
| 12 | `stuurMelding()` geeft de toelichting ongestreken door | 7 van de 16, de andere zeven |

Samen met de negen van QS8-506 zijn dat er twaalf op deze twee migraties.

## 7. Wat er bewust níét in zit

- **De contextregel van 0282** — op geen van de twaalf, dezelfde afweging als in
  0283: zijn onderbouwing gaat over een náám, en dit zijn twaalf kolommen proza.
  De prijs is een formulier dat vastloopt op tekst uit Word.
- **`chat_messages.body`** — §4.
- **`reports.bericht_kopie` en `reports.reden`** — §2 en §3.
- **`completion_approvals.comment`** — 📏 `completion_approvals_select` is
  `approver_id = auth.uid() OR subject_id = auth.uid()`. Geen groepstak, dus
  buiten dit criterium. 0274 §4a noemde hem *"de eerstvolgende ring"* onder een
  ánder criterium; dat blijft daar staan.
