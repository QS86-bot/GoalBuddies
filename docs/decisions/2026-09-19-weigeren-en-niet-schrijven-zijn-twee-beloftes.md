# Weigeren en niet-schrijven zijn twee beloftes — QS8-557

**19-09-2026.** `weekly_plan_steps_insert.check#1` — de conjunct
`weekplanstappen_over() > 0` — stond wagenwijd open zonder dat één test rood
werd. Dit document legt vast wat de meting opleverde, want die weerlegt de
diagnose waarmee het issue geopend is.

## De diagnose in het issue, en waarom hij niet klopte

QS8-557 redeneerde zo: er staan twee triggers op deze tabel, de rem vuurt op
`weekplanstappen_plafond() * 2`, de policy-conjunct staat op het plafond zélf,
dus er is een **bereik tussen plafond en tweemaal plafond waarin alléén deze
conjunct de grendel is**. Het issue zei er eerlijk bij wat het níet gemeten had.

📏 Gemeten op een lokale stack (294 migraties, `0291`), een eigenaar met 199
stappen in het etmaalvenster:

| | uitkomst |
|---|---|
| `weekplanstappen_over()` bij C=199 | **1** — de 200e stap landt |
| `weekplanstappen_over()` bij C=200 | **0** — de 201e wordt geweigerd |
| dezelfde 201e mét de conjunct opengezet | **óók geweigerd** |

De weigering kwam de tweede keer van `begrens_weekplanstappen()`:

```
ERROR: Te veel weekplanstappen in één dag (1 erbij, 201 in het laatste etmaal, plafond 200)
CONTEXT: PL/pgSQL function begrens_weekplanstappen() line 9 at RAISE
```

⚠️ **Het issue vergeleek met de verkeerde trigger.** Er staan er twee, en het
issue noemde ze allebei — maar het zette de conjunct naast `weekplanstappen_rem`
(0200, op `plafond * 2`) terwijl `weekplanstappen_dagplafond` (0192,
`begrens_weekplanstappen()`) op **precies dezelfde drempel** staat. Het
veronderstelde bereik tussen 200 en 400 bestaat niet: voor de vraag *"wordt dit
geweigerd"* is de conjunct volledig redundant.

En dat is geen toeval van deze ene grens maar volgt uit de vorm:

* de conjunct weigert dan en slechts dan als `C >= 200` (C = de stand bij het
  begin van het statement);
* de handhaver weigert dan en slechts dan als `C + N > 200`.

Is `C >= 200` en `N >= 1`, dan is `C + N >= 201`. **De handhaver weigert alles
wat de conjunct weigert.** Er is geen invoer waarvoor dat niet geldt.

## Wat de conjunct wél in zijn eentje doet

`begrens_weekplanstappen()` is een `after insert`-trigger. Hij weigert *nadat*
de rijen op schijf staan. De conjunct is een `with check` en weigert *ervóór*.

📏 Tien geweigerde verzoeken van 400 rijen, door een gebruiker die al op 200 zat:

| | foutcode | aangroei van de tabel |
|---|---|---|
| conjunct intact | `42501` (RLS) | **0 bytes** |
| conjunct open | `23514` (0192) | **401.408 bytes heap / 663.552 bytes incl. indexen** |

⚠️ **De rem van 0200 vangt dit niet op.** Zijn voorwaarde is `v_n > plafond * 2`,
dus een verzoek van precies 400 rijen glipt er langs en kost zijn volle omvang.
Dat is per verzoek, en het is herhaalbaar: elk volgend verzoek wordt opnieuw
geweigerd en kost opnieuw dezelfde schijf. Die ruimte komt pas terug bij een
`vacuum full`.

Dat is dezelfde belofte als QS8-347/0200 — *één gebruiker kan de schijf niet
volschrijven met verzoeken die tóch geweigerd worden* — alleen dan voor de
gebruiker die al op zijn plafond zit. Op een gratis tier van 500 MB zonder
backups is dat het verschil dat telt.

**Dus: geen registerrij maar een test.** De conjunct draagt een eigen belofte,
en die is meetbaar.

## ⚠️⚠️ De ijking legde een fout in de toets zelf bloot

De eerste versie toetste in deze volgorde: (1) elk verzoek geweigerd, (2) de
foutcode is `42501`, (3) de tabel groeide niet. Met de conjunct opengezet werd
**assertie 2** rood — en assertie 3, de enige die de belofte meet, werd daardoor
nooit uitgevoerd.

Dat is precies de val die CLAUDE.md beschrijft: *een ijking die zijn geval door
een pad voert dat een éérdere grendel al afvangt, bewaakt niets van wat hij
belooft.* De toets was "geijkt" op een assertie die de belofte niet raakt.

De schijfmeting staat daarom nu vóór de foutcode. Herhaald met de mutatie:

```
AssertionError: de tabel groeide met 648 kB na 10 geweigerde verzoeken;
met de conjunct hoort dat nul te zijn
  expected 663552 to be less than 153600
```

De foutcode-assertie blijft eronder staan als diagnose — hij zegt wélke grendel
sprak — maar hij is niet wat de test bewaakt.

⚠️ **Assertie 1 blijft met opzet groen onder de mutatie.** Dat is geen
zwakte maar de bevinding: de weigering is niet wat deze conjunct levert. Een
toets die daarop was blijven staan, had de conjunct "bewaakt" genoemd terwijl
hij hem niet aanraakte.

## De drempel

150 kB, tegen een gemeten signaal van 648 kB — factor 4,3. Ruim, en om dezelfde
reden als bij de bestaande toetsen in dit bestand: de suite draait parallel en
andere bestanden schrijven ook in `weekly_plan_steps`. Met de conjunct is onze
eigen bijdrage nul, dus alles wat de teller oppikt is ruis van anderen.

## Wat hier níet mee af is

📏 **Vier andere tabellen dragen dezelfde vorm** — een `*_over() > 0`-conjunct
in hun insert-policy, naast een dagplafondtrigger op dezelfde drempel en een rem
op tweemaal die drempel:

`chat_messages`, `day_checkins`, `week_review_replies`, `weekly_goals`.

Voor alle vier geldt de redenering hierboven woordelijk, en voor geen van de vier
is de schijfbelofte getoetst. Dat is een eigen issue en geen bijvangst van dit
issue — het vraagt per tabel een eigen fixture, en de plafonds verschillen
(500 berichten, 100 weekreacties).

⚠️ En het is geen live gat: op alle vijf draagt de gedeployde policy de conjunct
gewoon. Het gaat om de grendel die hem vasthoudt bij een refactor.
