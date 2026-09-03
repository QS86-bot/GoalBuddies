# Een archief met een sleutel, en waarom die het groeps-id draagt

**03-09-2026 — QS8-217, migratie 0153.**

## Wat er aan de hand was

Migratie 0092 verving het verwijderen van een groep door archiveren, en zette de
archieftoets in `is_group_member()`. Dat was de goede plek: **tien schrijfpolicies
lopen daarlangs, en tien losse voorwaarden is tien kansen om er één te vergeten.**

Maar `groups_select` loopt langs diezelfde functie. Gevolg: de chat, de
weekafsluitingen, de ledenlijst en de seizoensrecaps van een gearchiveerde groep
waren **voor niemand meer te openen**. Er werd niets gewist — de rijen stonden er
nog, de reeksen van de leden klopten — maar *"archief"* beloofde leesbaarheid die
er niet was. De bevestigingstekst zei dat toen ook met zoveel woorden, en dat is
eerlijk maar het is geen archief.

📏 **Gemeten in `pg_policies` en niet geteld in de migratiebestanden:** zeventien
policies lopen langs `is_group_member()` — **elf SELECT** en zes die schrijven
(INSERT, UPDATE, en één `ALL` op `week_reviews`).

## De splitsing, en de reden dat er een teller bij hoort

De leeskant krijgt `mag_groep_lezen()`; de schrijfkant houdt `is_group_member()`
ongewijzigd. De archieftoets staat daarmee nog steeds op één plek **per
richting**, en dat is nog steeds het punt van 0092.

⚠️ **Maar twee functies naast elkaar hebben het probleem van 0092 één laag
hoger.** De volgende SELECT-policy krijgt `is_group_member()` omdat dat de naam is
die iedereen kent, en dan is één tabel stilzwijgend dicht in het archief. Of,
gevaarlijker, een schrijfpolicy krijgt `mag_groep_lezen()` en dan mag je schrijven
in een gearchiveerde groep.

Vandaar `archiefleesgat()`: een tweezijdige teller die hoort leeg te zijn. **De
splitsing is daarmee een grendel in plaats van een afspraak.** Dezelfde vorm als
`bewijseis_allowlist()` (0150) en `systeembericht_allowlist()` (0034).

## Tien van de elf, en de elfde is de interessante

⚠️ **`chain_links_select` gaat níét open, en dat is domeinregel 7.** Die policy
draagt sinds 0037 een venster: van een ánder zie je alleen de lopende periode,
want daarin betekent een ontbrekende schakel *"nog niet"* en nooit *"gemist"*.

**In een gearchiveerde groep is élke periode afgesloten.** Daar zou een
ontbrekende schakel dus altijd het tweede betekenen. De rij openzetten zou precies
het lek zijn dat 0037 dichtte, met "archief" als omweg.

Je eigen kettinggeschiedenis blijft leesbaar: de eerste tak van die policy
(`user_id = auth.uid()`) heeft geen lidmaatschapstoets en is niet aangeraakt.

⚠️ **`weekly_goals_select` staat niet in de elf en gaat ook niet open.** Die loopt
langs `shares_group_with_goal()`, dat zijn eigen archieftoets heeft. Dat is de
zwaarste tabel van domeinregel 7 — hij draagt `missed`, `carried` en `excused` —
en "leesbaar archief" is geen reden om daaraan te komen. Het gevolg is dat een
gearchiveerde groep zijn chat en weekafsluitingen toont maar niet de weekdoelen
zelf. **Dat is een gat in de belofte en het is de veilige kant ervan**; het staat
als losse bevinding in `docs/ENGINEER-REVIEW.md`.

⚠️ **Archiveren verruimt niets.** Elke rij die na 0153 zichtbaar is in een
gearchiveerde groep, was zichtbaar toen de groep nog liep. De maskering van
besluit A41 wordt zelfs **strénger**: `lid_van_open_groep()` en
`deelt_open_groep_met_doel()` hebben allebei hun eigen archieftoets, dus een ópen
groep gedraagt zich na archiveren als een beschermde. Dat is met opzet niet
aangeraakt.

## De sleutel

`archief_blijft_archief()` (0092) pint `status` vast voor **elke** rol, ook
`service_role` en definer-functies. Dat is met opzet: drie van de vier routes
terug naar `active` zijn definer-functies, dus een rolfilter zou hier juist het
gat zijn.

Een `heropen_groep()` moet daar dus doorheen. De discriminator kan geen rol zijn
en geen tabelinhoud; wat wél onderscheidt is **welke functie er draait**. Dat is
in Postgres een transactielokale instelling, en dit project had er nog geen — het
is dus een nieuw mechanisme op een gevoelige plek, en daarom staat het hier.

### Waarom hij het groeps-id draagt en geen `true`

⚠️ **Dit is de hele zorgvuldigheid van deze keuze.** Een booleaanse vlag
ontgrendelt binnen die transactie **élke** gearchiveerde groep die er toevallig
langskomt — een trigger vuurt per rij, en een `update groups set ...` zonder
`where` zou er dan een hele tabel doorheen halen. Een id ontgrendelt er precies
één: de groep waarvoor de beheerder net getekend heeft.

Lekt de instelling ooit — via een toekomstige functie die `set_config` doorgeeft,
of via een `pre-request`-hook — dan is de schade begrensd tot die ene rij in
plaats van tot de hele tabel. **Het verschil kost één `::text` en het is het
verschil tussen een sleutel en een loper.**

### Drie dingen die eraan vastzitten

- **`set_config(..., true)` — transactielokaal.** Zonder die `true` blijft de
  instelling voor de rest van de sessie staan, en PostgREST hergebruikt
  verbindingen uit een pool. Dan is de ontgrendeling niet één transactie lang
  geldig maar tot iemand anders diezelfde verbinding krijgt. Dit is het soort
  fout dat nooit lokaal opvalt.
- **`is_group_admin()` is hier onbruikbaar**, en dat is geen bug: hij geeft
  onwaar voor een gearchiveerde groep. `heropen_groep()` kijkt daarom rechtstreeks
  in `group_members`. Dat stond al in de kop van 0092, opgeschreven zodat de
  volgende het niet als een bug leest — en dat heeft precies gewerkt.
- **De functie leest de status terug.** De pin weigert **stil**: hij zet
  `new.status` terug in plaats van te gooien (les van 0017 — een `raise` in
  `join_group_with_code()` zou de zojuist geschreven `invite_events`-rij
  meerollen). Zonder die teruglezing zou een mislukte heropening `ok: true` geven
  terwijl er niets veranderd is. **Dat is de duurste vorm die dit project kent, en
  hij is hier ingebouwd in plaats van getest** — de mutatie die de sleutel
  weghaalt levert nu `pinned` op en niet stilte.

## Een belofte die omgedraaid is

⚠️ **`tests/rls/archief.test.ts` bewaakte letterlijk het tegendeel** — *"verdwijnt
uit beeld"* — en die test is nu omgedraaid in plaats van weggehaald.

Dat is geen fout van toen. 0092 schreef die keuze op als bewust en met open eind,
en dat open eind werd de dossierrij van 25-08. De rest van dat bestand is niet
aangeraakt: er is nog steeds niets in te schrijven, en drie van de vier routes
zetten de groep nog steeds niet terug. **Alleen de vierde route bestaat nu, met
een naam en een bevestiging.**

## IJking

Zes mutaties, elk apart, elk rood op de test die hem noemt:

| mutatie | uitslag |
| -- | -- |
| `groups_select` terug op `is_group_member` | *"is voor zijn leden nog te openen"* + de teller |
| het lidmaatschap uit `mag_groep_lezen()` | *"geeft een buitenstaander nog steeds niets"* |
| `chain_links_select` óók open | *"houdt De Ketting van een ander dicht"* |
| de pin uit `archief_blijft_archief()` | *"blijft gearchiveerd bij een gewone update"* |
| de sleutel uit `heropen_groep()` | *"gaat open voor de beheerder"* |
| `chat_messages_insert` op `mag_groep_lezen()` | *"laat er niemand meer in schrijven"* + de teller |

⚠️ **De laatste is de belangrijkste en hij was het makkelijkst te vergeten.** Dat
is de gevaarlijke richting van de splitsing — schrijven in een archief — en de
teller vangt hem naast de gerichte test. Een mutatie in de veilige richting die
maar één test rood maakt, zegt minder dan deze.
