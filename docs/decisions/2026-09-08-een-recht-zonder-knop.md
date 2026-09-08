# Een recht zonder knop — het bewerkvenster op een chatbericht

**Datum:** 08-09-2026
**Issue:** QS8-327
**Migratie:** 0192
**Besluit:** het bewerkrecht op `chat_messages` gaat weg. De knop komt er niet.

---

## De vraag

`chat_messages_update` bestaat sinds migratie 0003 en staat een afzender toe zijn
eigen bericht vijftien minuten lang bij te werken. `authenticated` had daar tien
UPDATE-kolomrechten bij. Er is nooit een knop voor gebouwd.

Drie richtingen lagen open: de knop bouwen, het recht weghalen, of het laten
staan met de meting als dossierrij.

## Wat er gemeten is

📏 Over de hele codebase en het schema:

```
.update() op chat_messages in src/ of app/          geen
functies in het schema die chat_messages UPDATEN     geen
```

📏 Tegen de lokale stack met echte JWT's, vóór de migratie:

| Handeling | Uitkomst |
|---|---|
| Anna bewerkt haar eigen tekstbericht (binnen 15 min) | **HTTP 200 — landt** |
| Anna zet `subject_id` naar Bram | HTTP 400, `23514` |
| Anna maakt `subject_id` leeg op haar eigen bericht | 200, maar hij stond al leeg |
| Anna bewerkt het systeembericht (dát draagt `subject_id`) | 200 met `[]` |
| Bram bewerkt Anna's bericht | 200 met `[]` |

Het recht was dus **live en bereikbaar** — langs een rechtstreeks
PostgREST-verzoek en langs geen enkele knop.

### De veronderstelde lek is er niet

QS8-327 noemde één ding dat nog ongemeten was: `chat_messages_update`'s CHECK
bindt `subject_id` en `actor_id` niet, dus zou een afzender ze binnen het venster
kunnen leegmaken. 📏 Nagemeten, en het klopt niet:

- `plaats_systeembericht()` is de **enige** schrijver van die twee kolommen en
  zet `type` hard op `'system'`.
- De INSERT-kolomrechten van `authenticated` bevatten `subject_id` en `actor_id`
  niet, en `chat_messages_insert` eist `type <> 'system'`.
- Een systeembericht heeft `sender_id is null`, dus de `using` van
  `chat_messages_update` (`sender_id = auth.uid()`) matcht er nooit op.

De enige rijen die die kolommen dragen zijn dus systeemberichten, en die vallen
tweevoudig buiten de policy. Op een bericht dat een afzender wél mag bijwerken
staan ze altijd leeg — leegmaken is een no-op, en vullen werpt `23514` op de
trigger van 0188.

## Het besluit, en waarom

**Het recht gaat weg.** Niet omdat het gevaarlijk is — dat is het na 0188
aantoonbaar niet — maar omdat de app deze vraag al beantwoord had.

In `src/shared/ui/ChatRegel.tsx` staat het bij de plek waar de knop zou komen,
met zoveel woorden:

> Bewerken zit er niet, ook al staat de policy het 15 minuten toe. Een bewerkte
> regel in een gesprek van drie mensen is een gesprek waarvan de helft achteraf
> kan veranderen. Weghalen is eerlijker: dan is de regel weg en niet stil anders.

De ontbrekende aanroeper was dus **geen vergeten schakel maar een besluit**. Wat
er niet bij gebeurde, is het recht opruimen — en daardoor stonden de app en de
database maandenlang het tegenovergestelde te zeggen.

⚠️ **De vijf migraties op deze policy waren allemaal insnoerend.** 0010 pinde de
onveranderlijke velden, 0059 en 0060 regelden de persoonskolommen, 0071 haalde
`system_event` bij de client weg, 0188 maakte de weigering eerlijk. Vijf keer
"hou dit ongevaarlijk", nul keer "zet dit aan". 0192 is de zesde stap in
diezelfde richting en de laatste die er te zetten is.

### Waarom niet de knop bouwen

Dat zou het besluit in `ChatRegel` omkeren, en daar is dit issue de verkeerde
aanleiding voor: het vraagt of een ongebruikt recht mag blijven, niet of de app
een bewerkfunctie moet krijgen. Wil iemand die functie alsnog, dan hoort daar een
eigen afweging bij — inclusief een `edited_at`-kolom, want zonder markering is
een bewerkt bericht precies het "stil anders" waar `ChatRegel` tegen argumenteert.
Dat is een schemawijziging met gevolgen voor realtime, en dus een eigen issue.

### Waarom niet laten staan

Een schrijfrecht zonder knop is het oppervlak dat niemand doorloopt. CLAUDE.md
zegt het bij domeinregel 7 in algemene vorm: *bouw niets "vast open"; dat is
precies hoe een standaard verschuift zonder dat iemand het besloten heeft.*

## Geen policy is hier de strengste vorm, geen gat

Zonder UPDATE-policy weigert Postgres élke UPDATE op een tabel met RLS. 📏
Twintig tabellen in dit schema doen het al zo — `completions`, `points_ledger`,
`completion_approvals`, `goal_group_links` en zestien andere. Onwrikbare regel 1
is daarmee gediend en niet geschonden: de opdracht is bestuurd, en weigeren ís
het bestuur.

## Twee grendels die verschillend werk doen

📏 Per grendel apart geijkt, en de uitslag verraste:

| Mutatie | Uitkomst |
|---|---|
| kolomrecht terug, policy weg | 1 rood, en **alleen op de audibiliteit** — de bewerking landt niet, maar PostgREST geeft `200 []` |
| policy terug, kolomrecht weg | alles groen — `42501` komt vóór de policy |

**De `drop policy` sluit het oppervlak; de `revoke` maakt de weigering hoorbaar.**
Alleen droppen laat precies het stille-weigerpad staan waar dit project al drie
issues aan besteed heeft (QS8-314, QS8-326, QS8-342). Alleen revoken laat een
policy staan die iets toestaat wat niemand kan aanroepen. Geen van beide is
dubbeling.

Dat is meteen de winst die deze migratie oplevert bovenop het opgeruimde
oppervlak: waar een bewerkpoging vroeger `200` met een lege lijst gaf, geeft hij
nu `403 / 42501`.

## Wat er blijft staan, en waarom

⚠️⚠️ **`stamp_chat_message()` blijft ongewijzigd, inclusief zijn UPDATE-tak.**
Die lijkt na 0192 dood en is dat niet: `sender_id`, `actor_id` en `subject_id`
dragen `on delete set null`, en dat is een UPDATE die Postgres zélf uitvoert als
een profiel verdwijnt. Een trigger is geen policy — hij vuurt ook voor de
referentiële actie en ook voor `service_role`.

📏 Nagemeten ná 0192: een profiel verwijderen zet `sender_id` op NULL, het bericht
blijft staan, en er wordt niets geworpen. De must-allow staat in
`tests/rls/bewerkvenster.test.ts`.

## Gevolgen

- `tests/rls/bewerkvenster.test.ts` toetst nu het tegenovergestelde van wat hij
  toetste. De geschiedenis staat in zijn kop; het bestand is niet weggegooid,
  want de vraag die het bewaakt is dezelfde gebleven.
- De rollback staat in de kop van 0192, met de waarschuwing dat hij alleen
  sámen met een knop terug hoort.
