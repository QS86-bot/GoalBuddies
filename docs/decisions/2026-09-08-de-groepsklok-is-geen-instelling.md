# De groepsklok is geen instelling

**08-09-2026 — QS8-355, migratie 0201**

## Waar dit over gaat

`groups.tz` stond in de UPDATE-kolomgrant van `authenticated`, en
`guard_group_update()` pinde hem niet. Een beheerder kon de tijdzone van zijn
groep dus met één rechtstreekse PATCH verzetten, buiten elk scherm om.

📏 Nagemeten met een echte sessie van de beheerder, tegen de lokale stack:

```
create_group('Klokgroep')                   -> tz Europe/Amsterdam
update groups set tz = 'Pacific/Kiritimati' -> geaccepteerd
groepsdatum(gid)                            -> 2026-09-09
```

De serverdatum was 2026-09-08. Eén PATCH, en de groep staat een dag verder.

## Waarom dat meer is dan een instelling

`groups.tz` is de tweede klok van domeinregel 1. `currentGroupPeriod()` leest
hem, en daarmee hangen de **huddledag**, de **weekafsluiting**, **De Ketting** en
het groepsoverzicht eraan — voor élk lid. Eén beheerder verschoof daarmee de
weekgrens van iedereen in de groep.

⚠️ En dat raakt domeinregel 7 langs een omweg: verspringt de weekgrens, dan kan
een week die voor jou nog liep, voor de groep afgesloten worden. Wat er dán over
jou zichtbaar wordt, is nooit doordacht — want niemand heeft deze handeling ooit
als handeling ontworpen.

## De keuze: nee

Het issue liet twee wegen open. **Nee** (dichtzetten) of **ja, maar zorgvuldig**
(een eigen RPC met de zorgvuldigheid van een commitment device). Het antwoord is
nee.

⚠️ De grondwet zegt het met zoveel woorden: *voor élk nieuw oppervlak is
beschermd het antwoord tot iemand het tegendeel besluit.* Een handeling die de
weekgrens van elk lid verschuift, heeft geen scherm, geen bevestiging, geen
systeembericht en geen auditrij. Hem laten staan omdat hij toevallig bestáát, ís
stilzwijgend voor "ja" kiezen.

Een RPC bouwen zou bovendien de vraag beantwoorden die niemand gesteld heeft: hij
vraagt een nieuw type systeembericht (en dus een migratie op de allowlist
`chat_messages_system_event_bekend`), een bevestigingsstap, en een besluit over
wat er zichtbaar wordt als de weekgrens verspringt terwijl een week nog loopt. Dat
is een feature, geen reparatie.

📏 Er breekt niets. `tz` wordt client-zijdig alleen bij het **aanmaken** gezet —
`api.ts` geeft `apparaatTijdzone()` mee aan `create_group()` — en `wijzigGroep()`
schrijft negen kolommen waar `tz` niet bij zit: `name`, `huddle_day`,
`evidence_policy`, `approval_rule`, `approval_quorum`, `season_cadence`,
`categorie`, `omschrijving`, `voertaal`.

⚠️ **Deze meting is de tweede versie.** De eerste zei "aantoonbaar alleen
`huddle_day` en `name`, dat staat zelfs onder test". Dat waren er negen, en die
twee kwamen uit een **fixture**: `wijzigen.test.ts:54` voert een verzonnen
bronstring aan `geschrevenKolommen()` om díe helper te toetsen. Ik las een
testvoorbeeld als een meting aan de echte bron; de security-review van 08-09 wees
het aan.

De conclusie hield stand, maar dat is hier niet het punt. **Een 📏 in dit project
is dragend bewijs**, en een verkeerd getal eronder kost precies zoveel als een
verkeerde conclusie zodra iemand er de volgende beslissing op bouwt.

Wat er wél onder test staat is bovendien sterker dan wat ik beweerde:
`wijzigen.test.ts` legt `groepSchema` en de updatelijst in **beide richtingen**
naast elkaar. Een `tz` die niet in het schema zit, kan dus ook niet stil in de
updatelijst verschijnen.

## Twee grendels, en de tweede is niet overbodig

| Grendel | Wat hij doet |
| -- | -- |
| `revoke update (tz)` | weigert **luid**: de client krijgt 42501 |
| `new.tz := old.tz` in `guard_group_update()` | vangt **stil** op als het recht ooit terugkomt |

⚠️ **De volgorde doet ertoe.** Zonder de `revoke` zou de pin een PATCH
stilzwijgend negeren en 200 teruggeven — de klasse "succes dat er geen is" waar
dit project al drie keer op gestruikeld is (QS8-314, QS8-326, QS8-342). Met de
`revoke` weet de client dat er niets gebeurd is.

De pin blijft er wél bij, want RLS kan geen kolommen beperken: komt de grant ooit
terug via een `alter default privileges` of een migratie die `grant update on
groups` schrijft, dan is de pin het net eronder. Dezelfde combinatie die
`zichtbaarheid` en `ontdekbaar` al dragen.

## De rij die dit gat openhield

In `scripts/kolomrechten-controle.mjs`, `GEEN_SCHRIJFPAD`, stond:

> *"0123 wijst erop dat een beheerder via deze grant de tijdzone van de groep kan
> verzetten. Zolang geen scherm hem gebruikt, is het een recht zonder pad."*

⚠️ **Het gevolg stond er dus al in; alleen de conclusie ontbrak.** "Zolang geen
scherm hem gebruikt" beschrijft wat de client vandaag *doet*, niet wat hem
*tegenhoudt* — precies de vorm die QS8-352 duur maakte. De rij is weg, want er is
geen recht meer om uit te leggen.

De les die blijft: **een reden in zo'n register hoort de grendel te noemen, niet
het gedrag.** Een uitleg die begint met "zolang" is een houdbaarheidsdatum zonder
alarm.

## IJking

| Mutatie | Rood |
| -- | -- |
| `grant update (tz) on groups to authenticated` | `een beheerder verzet de groepsklok niet met een kale PATCH` |
| `new.tz := old.tz` uit `guard_group_update()` halen | `tz is niet door een client te wijzigen, ook niet mét het kolomrecht` |

⚠️ De eerste mutatie is het geval waar de test voor bestaat: de PATCH slaagt dan
**stil** — geen fout, en de waarde blijft staan doordat de pin hem terugzet. Een
test die alleen de waarde controleert, was daar groen op gebleven.

## Wat hier niet in zit

* **De vraag of een groep zijn klok ooit hóórt te kunnen verzetten.** Die staat
  nu dicht en dat is een besluit, geen antwoord. Wil iemand hem openen, dan is de
  weg een RPC met bevestiging, auditrij en systeembericht — en eerst een besluit
  over wat er zichtbaar wordt als de weekgrens verspringt terwijl een week loopt.
* **`huddle_day`.** Die is nog wél door een beheerder te wijzigen en verschuift
  óók de groepsperiode. Het verschil is dat hij een scherm heeft, en dat de
  huddledag per ontwerp een groepsafspraak is — maar dezelfde vraag over een
  lopende week geldt er evengoed. Dat is een aparte weging.
