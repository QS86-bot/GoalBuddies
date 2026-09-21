# Een bewaking die alleen stilte belooft

**16-09-2026** — sluit de reviewrij van 15-09-2026 over de ijking van de
trigger-grendel in `tests/rls/domeinregel3.test.ts`.

## Wat er aan de hand was

`domeinregel3_bewaking()` is de grendel onder domeinregel 3: hij toetst dat de
policy, de constraint, de foreign key en de trigger op `completion_approvals`
allemaal nog staan zoals ze bedoeld zijn. Acht takken, acht sloten.

De suite toetste hem op twee plekken, en allebei de keren zo:

```ts
expect(data ?? []).toEqual([]);                      // regel 56
expect((data ?? []) as unknown[]).toHaveLength(0);   // regel 926
```

Dat is een stilte-eis op de grendel zelf. 📏 Gemeten door
`domeinregel3_bewaking()` te vervangen door een lichaam dat niets teruggeeft:

| | takken | uitslag |
|---|---|---|
| `tests/rls/domeinregel3.test.ts` | 0 | **15 passed** |
| `tests/rls/domeinregel3-bewaking-spreekt.test.ts` | 0 | **faalt, en weigert te draaien** |

De bewaking bewaakt de policy en de trigger; er was niets dat de bewaking
bewaakte. Regel 18 vraag 3 in zijn zuiverste vorm: *kan deze test groen blijven
terwijl de belofte breekt?*

## ⚠️ Wat er wél al was, en waarom dat niet genoeg was

Dit is de nuance die de rij zelf niet maakte en die hier hoort te staan: de kop
van `domeinregel3.test.ts` draagt een **uitgeschreven ijking** — M9a, M9b en M10
— waarin de bewaking met de hand gemuteerd is en netjes rood werd, met de
getallen erbij. Dat is precies de standaard die `CLAUDE.md` vraagt, en het is
goed gedaan.

Maar **een handmeting is een meting van één moment.** Wat er daarna elke dag
draait is de stilte-eis. Raakt de bewaking later een tak kwijt — door een
refactor, een migratie, een tweede schrijver — dan is er niets dat dat ziet, en
de opgeschreven ijking wordt er niet onwaar van. Ze wordt alleen oud.

**De reparatie is dus niet "een ijking schrijven" maar "de ijking laten
meedraaien".** De mutaties stonden er al; ze zijn nu tests.

## Hoe het nu is afgedwongen

`tests/rls/domeinregel3-bewaking-spreekt.test.ts`, elf tests:

- een **nulmeting** — zonder mutatie zwijgt de bewaking;
- een toets die de acht slotnamen **uit de functie zelf** leest, zodat er geen
  tweede lijst is die kan gaan afwijken;
- **acht mutaties, één per slot**, elk in een `begin … rollback`.

Postgres kent transactionele DDL, dus de mutatie bestaat alleen binnen de
transactie en de database ziet hem nooit. Daarom mag dit bestand DDL doen waar
de rest van de suite dat niet doet.

📏 Geijkt door de `eigenaar-fk`-tak uit de bewaking te halen: **precies twee**
tests worden rood (de slottelling en de `eigenaar-fk`-mutatie), de andere negen
blijven groen. Een mutatie per grendel, en aantoonbaar geïsoleerd.

## ⚠️ De eerste ijking trof de verkeerde grendel

De eerste poging haalde de tak `clausule4-actieve-voltooiing` weg. Het bestand
werd rood — maar **niet op de toets die ik ijkte**: de gate
`stackBeschikbaarOfFaal()` proeft op precies die slotnaam om te zien of het
schema wel bij de migraties past, en wierp dus vóór er één test draaide.

Dat is het geval waar `CLAUDE.md` voor waarschuwt: *breek de grendel die de
ijking nóemt, en kijk wélke grendel rood wordt.* De uitslag klopte, over iets
anders. De tweede poging gebruikt `eigenaar-fk`, een naam die de gate niet
noemt, en isoleert daarmee wat ze beweert te isoleren.

## ⚠️ Wat deze drie takken werkelijk toetsen

De takken `clausule2-lidmaatschap`, `clausule2-koppeling` en
`clausule4-actieve-voltooiing` zoeken een **tekstfragment** in het lichaam van
`fill_approval_subject()`. Dat is hoe 0262 ze gebouwd heeft.

Gevolg: wat zo'n tak bewaakt is de **spelling** van een clausule, niet haar
aanwezigheid. De mutaties hier maken dat expliciet — ze vervangen
`from group_members` door `from public.group_members`, wat hetzelfde betekent en
geldige SQL is, en de tak meldt er niettemin op.

Het fragment wéghalen bleek geen bruikbare mutatie: dan blijft er een losse alias
of een lege `if`-voorwaarde staan, weigert Postgres de functie, en meet je de
parser in plaats van de bewaking. 📏 Twee van de drie liepen daar de eerste keer
op stuk.

**Dat een tak op spelling matcht is een eigenschap om te kennen, geen reden om
hem niet te ijken**: een tak die op géén enkele herschrijving reageert, is stuk,
en dat is wat hier gemeten wordt. De keerzijde — een tak die zwijgt terwijl de
clausule in dode code of in een nooit-genomen tak staat — staat als eigen rij op
de agenda.

## Wat dit niet is

- **Geen wijziging aan `domeinregel3_bewaking()`.** De functie is niet
  aangeraakt; alleen de manier waarop ze getoetst wordt.
- **Geen vervanging van de stilte-eis.** Die blijft staan en hoort te blijven
  staan: "alles op zijn plek" is de normale uitslag. Er staat nu alleen naast dat
  de bewaking dát ook kán zeggen.
- **Geen DDL die de database raakt.** Alles rolt terug; de definitie is na de
  ijking byte-voor-byte vergeleken met de snapshot van ervoor.
