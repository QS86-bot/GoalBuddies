# Een slot is niet weg te nemen, maar wel leesbaar te maken

**14-09-2026 — QS8-492.** Vervolg op
`docs/decisions/2026-09-14-een-uitgezette-trigger-is-van-iedereen.md`, dat het
commit-venster sloot en het **slot** liet staan.

## Het probleem

`alter table … disable trigger` neemt een **ShareRowExclusiveLock** op die tabel
en houdt hem tot het eind van de transactie. Die botst met de `RowExclusiveLock`
van elke INSERT, UPDATE en DELETE. Draaien er twee suites tegen dezelfde stack,
dan staat de een stil zolang de transactie van de ander leeft.

📏 Gemeten op de lokale stack: een houder die nog 23 s te gaan had, liet een
schrijver **23079 ms** wachten. De wachttijd ís de looptijd van de transactie.

Wat dat kostte: `dagplafond-batch-tien.test.ts` liep in zijn eigen timeout van
**240 s** terwijl datzelfde bestand solo in **2,93 s** draait. De uitslag wees
naar een bestand dat part noch deel had aan de oorzaak, en er stond nergens dat
er een slot in het spel was.

## Twee routes die het slot wél zouden wegnemen — allebei afgewezen, met meting

**Route 1: een globale `lock_timeout` op alle testverbindingen.**
📏 Gemeten: `tests/rls/adempauze-grendels.test.ts` wordt daar rood van.

```
zonder lock_timeout          3 tests groen
met PGOPTIONS=-c lock_timeout=2s   1 failed | 2 passed
  → "sessie B viel om op iets anders dan het slot:
     ERROR: canceling statement due to lock timeout"
```

Dat bestand **wacht met opzet** op een advisory lock en meet dat met zijn eigen
`statement_timeout`; het faalt hard op elke andere reden, en terecht. Een
globale instelling neemt die test zijn meetinstrument af.

**Route 2: `set session_replication_role = 'replica'` in plaats van
`disable trigger`.** Dit oogt als het goede antwoord — 📏 gemeten neemt het
**geen enkel slot**:

```
slot dat deze sessie op completion_approvals houdt: GEEN
```

En het is toch fout, om een reden die alleen een meting laat zien.
`completion_approvals_subject_is_eigenaar` is geen CHECK maar een **foreign key**
(`contype = 'f'`), en een FK wordt afgedwongen door interne systeemtriggers —
die replica-modus óók uitzet. 📏 Gemeten:

```
REPLICA: de FK liet een rij door die nergens naar wijst
```

Dat is precies de grendel die `goedkeuring-wijst-naar-de-eigenaar.test.ts`
bestaat om te toetsen. Deze route maakt die test **groen zonder iets te
bewijzen** — de duurste uitkomst die dit project kent, en hij zou er bovendien
uitzien als een verbetering.

⚠️ **De les die blijft: "neemt geen slot" is niet hetzelfde als "doet hetzelfde".**
Replica-modus zet álle triggers uit, niet die ene, en de FK'en horen daarbij.

## Het besluit: de botsing blijft, de uitslag wordt eerlijk

Een `lock_timeout` van **3 s** op de **PostgREST-verbindingen**, in de conninfo
in `scripts/lokale-stack.sh` — dus op de weg waar blokkeren altijd een defect is,
en niet op psql, waar één test een wachttijd méét en zijn eigen grens zet.

📏 Gemeten: **23079 ms** zonder, **3055 ms** mét, met
`canceling statement due to lock timeout` erbij.

⚠️ **Dit maakt twee gelijktijdige runs niet groen, en dat is geen omissie maar de
kern van het besluit.** De botsing is niet weg te nemen zonder de opstelling op
te geven die de grendel eronder toetst (route 2 laat zien wat dat kost). Wat wel
kan is het verschil tussen een fout die zichzelf uitlegt in drie seconden en een
timeout van vier minuten op de verkeerde plek.

## ⚠️ Dat het in het conf-bestand staat, is niet dat het werkt

De eerste poging schreef `options=-c%20lock_timeout%3D3s` — de URI-vorm van
percent-codering, in een libpq-conninfo van sleutel=waarde. Dat komt letterlijk
aan:

```
FATAL:  -c %20lock_timeout%3D3s requires a value
```

📏 PostgREST gaf daarna **503 op elk verzoek**, en het conf-bestand zag er
precies goed uit. `tests/rls/lock-timeout.test.ts` meet daarom het **gedrag** —
houder ernaast, schrijver erop, tijd meten — en leest dat bestand niet. Een test
die de configuratie had gelezen, was hier groen gebleven.

## De ijking

Per grendel, en met de mutatie eerst met een `grep` in het bestand teruggezien:

| Mutatie | Uitslag |
|---|---|
| `lock_timeout` uit de conninfo halen, stack herbouwd | **rood** — en de schrijver zat de houder uit: **30106 ms** |
| niets veranderd | groen, 2 van 2 |

⚠️ Het rood is de toets die de mutatie noemt, en de must-allow bleef staan — een
ongehinderde schrijver hoort er in beide werelden doorheen te komen.

⚠️ **De must-allow ving meteen een gat in de opzet van zijn eigen bestand.** De
eerste versie liet de houder tot `afterAll` staan, dus de "ongehinderde"
schrijver kreeg óók een lock timeout. En het psql-proces doodschieten bleek niet
genoeg: de backend zit in `pg_sleep()` en merkt een gesloten socket pas als hij
weer wil schrijven. `pg_terminate_backend()` is de kant die wél meteen werkt.

## Wat hier niet besloten is

Deze instelling staat in de **lokale teststack** en zegt niets over productie.
Of de `authenticator`-rol op het echte project een `lock_timeout` hoort te
hebben, is een eigen afweging: daar verandert hij wat een gebruiker merkt, en
dat is een andere vraag dan deze.
