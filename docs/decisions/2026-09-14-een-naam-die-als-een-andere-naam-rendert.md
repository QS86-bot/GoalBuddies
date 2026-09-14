# Een naam die als een ándere naam rendert

**Datum:** 14-09-2026
**Issue:** QS8-450
**Migratie:** 0268
**Raakt:** domeinregel 3 (peer-goedkeuring is een autorisatiegrens), domeinregel 7 (groepszichtbare oppervlakken)

## De vraag

QS8-448 (migratie 0256) sloot de klasse **leegte**: een naam die als niets
rendert. Dit is de klasse **spoofing**: een naam die als iets ánders rendert.

## 📏 De meting

Gemeten door de security-review op QS8-448 (13-09-2026), nagemeten op de
draaiende opbouw ná 0256 (14-09-2026):

```
schone_naam(U&'gxp\202Eeterces')  ->  gxp‮eterces   (11 tekens)
schone_naam(U&'a\202Db')          ->  a‭b            (3 tekens)
schone_naam(U&'a\2067b')          ->  a⁧b            (3 tekens)
schone_naam(U&'J\0430n')          ->  Jаn            (Cyrillische а)
```

`gxp‮eterces` rendert als `secrete.pxg`.

⚠️ **Deze tekens stónden al in de bereikenlijst van 0256.** Dat is de kern van
de vondst: ze werden alleen aan de **randen** gestreken, want dat is wat die
lijst met opzet doet. Met tekst eromheen bleven ze staan.

`display_name` is groepszichtbaar via `profiles_select`, dus dit staat in de
ledenlijst van iedereen die een groep met je deelt.

## Het besluit: negen tekens, overal weg

`U+202A`–`U+202E` (embedding, override, pop) en `U+2066`–`U+2069` (isolate,
pop) — de tekens die de **volgorde** van de tekens eromheen omkeren.

`zonder_bidi()` haalt ze overal weg; `schone_naam()` componeert hem vóór het
randtrimmen; `profiles_display_name_geen_bidi` weigert wat er tóch nog een
draagt.

### ⚠️⚠️ Twee lijsten, en ze mogen nooit één worden

`ONZICHTBARE_BEREIKEN` beantwoordt *"rendert dit als niets aan de rand"* en
wordt daarom **verankerd** toegepast. `BIDI_BEREIKEN` beantwoordt *"rendert dit
de rest van de naam anders"* en wordt daarom **met `g`** toegepast.

Die eerste lijst bevat `U+200D`, en die ís de lijm in `👨‍👩‍👧‍👦`
(`U+1F468 U+200D U+1F469 U+200D U+1F467 U+200D U+1F466`). Een `g` eroverheen
houdt vier losse mensen over in plaats van één gezin. Dat is de reparatie die
het erger had gemaakt, en ze staat aan beide kanten als toets.

### ⚠️ Twee schrijvers, twee middelen

📏 De les van §7a in
`docs/decisions/2026-09-13-twee-poorten-die-elkaar-niet-kenden.md`: de eerste
versie van QS8-448 repareerde de trigger en liet de `PATCH` open — de
mákkelijkere route, want om groepszichtbaar te zijn heb je toch al een account.

| Schrijver | Middel | Waarom |
|---|---|---|
| de aanmeldtrigger | `schone_naam()` **strijkt** | de provider levert de naam; een geweigerde aanmelding is erger dan een gepoetste naam |
| `PATCH /rest/v1/profiles` | de CHECK **weigert** | de gebruiker typt zelf en krijgt een melding terug |

Dezelfde tweedeling als bij de lege naam in 0256, en met dezelfde reden.

## Wat er met reden **niet** in zit

### LRM, RLM en ALM

`U+200E`, `U+200F` en `U+061C` zijn *markeringen*, geen overrides: ze zetten de
richting van de **neutrale** tekens ernaast en kunnen een run met sterke tekens
niet omkeren. Ze hebben legitiem gebruik in een naam die schriften mengt — een
Arabische naam met een punt erin heeft er soms een nodig om die punt aan de
goede kant te houden. Aan de rand worden ze al gestreken.

**Wordt zwaarder als** iemand aantoont dat een run van uitsluitend neutrale
tekens (een naam als `a.b-c`) er genoeg door verschuift om als een andere naam
te lezen. Die voorwaarde staat in `docs/ENGINEER-REVIEW.md`.

### Homoglyphen

📏 `schone_naam(U&'J\0430n')` geeft `Jаn` met een Cyrillische `а`. Twee leden in
dezelfde groep kunnen dus een identiek renderende naam hebben.

Niet opgelost, en dat is een **besluit**:

- Het middel is een schriftmengregel, en die weigert legitieme namen. Een
  Nederlandse naam met één Grieks teken bestaat, en een gebruiker die zijn eigen
  naam niet mag invoeren is een echte schade tegenover een hypothetische.
- Een confusables-tabel (UTS #39) is een dataset die onderhouden moet worden en
  die per Unicode-versie schuift. Dat is een afhankelijkheid met een eigen
  levensduur.
- De schade is bovendien anders van aard: een bidi-override maakt van *jouw*
  naam een **andere string dan er staat**; een homoglyph maakt twee
  verschillende strings **op elkaar lijken**. Het tweede is met een tweede
  signaal op te lossen (een avatar, een groepsrol), het eerste niet.

Het staat als geval in `tests/rls/profielschrijven.test.ts` bij de must-allows,
zodat het zichtbaar is als besluit en niet als omissie: wie het ooit omkeert,
maakt die toets rood en leest dan waarom hij er stond.

### De andere groepszichtbare tekstkolommen

📏 Gemeten: `groups.name`, `goals.title`, `goals.description`,
`weekly_goals.title`, `milestones.title`, `milestones.description`,
`chat_messages.body` en `daily_moves.body` zijn allemaal groepszichtbaar en
allemaal schrijfbaar door `authenticated`.

Niet in deze migratie, en de reden is dat de **schade** verschilt. Een
weergavenaam is een identiteitsclaim: de lezer leidt eruit af wíé iets deed, en
daar hangt peer-goedkeuring aan (domeinregel 3 — je keurt de week van een
persoon goed). Een doeltitel of een chatbericht is inhoud van de schrijver zelf;
die mag alles zeggen wat hij wil, en bidi voegt daar niets aan toe wat gewone
tekst niet al kan.

⚠️ `groups.name` is het randgeval — een groepsnaam is ook een soort identiteit,
en een uitnodiging naar een groep die als een andere groep rendert is een echt
scenario. Het staat als vervolgvraag in `docs/ENGINEER-REVIEW.md` met zijn
voorwaarde, en niet in deze migratie: dat zou een tweede tabel, een tweede CHECK
en een tweede naad zijn in een issue dat over namen gaat.

## 📏 De ijking — vijf grendels, vijf mutaties

Vooraf gemeten: naamnormalisatie 11, profielschrijven 28, aanmelding 16.

| | Mutatie | Wat er rood werd |
|---|---|---|
| B1 | de `g`-vlag uit `zonder_bidi()` | **2** — de twee gevallen met twee overrides |
| B2 | `profiles_display_name_geen_bidi` droppen | 7 — alle PATCH-weigeringen; de must-allows blijven groen, en terecht |
| B3 | `schone_naam()` componeert `zonder_bidi()` niet meer | 4 — de twee sweeps, de gemeten spoofnaam en de aanmeldroute |
| B4 | `grant execute on zonder_bidi to authenticated` eruit | de **ship-stopper**: ook *"slaat de taal en de tijdzone op"* en *"rondt de onboarding af"* |
| B5 | `[0x2066, 0x2069]` uit `BIDI_BEREIKEN` | 2 — de naad in één richting, plus de lijsttoets |

### ⚠️⚠️ B1 was groen, en dat is de scherpste uitkomst van deze ronde

📏 Bij de eerste ijking liet de `g`-vlag eruit halen **alle tien de toetsen
groen**. Elk geval droeg precies één bidi-teken, en zonder `g` wordt de eerste
treffer nog steeds weggehaald — dus de vlag deed in de hele suite niets
waarneembaars. De migratiekop noemde hem intussen *"het hele punt van deze
functie"*.

Dat is woordelijk de klasse die dit project het vaakst betaalt: een bron die
beweert dat er een grendel op staat, terwijl de toets er met één voorbeeld
naast grijpt. Er staan nu twee gevallen met **twee** overrides, en de scherpste
staat op de aanmeldroute — want zonder `g` blijft de tweede staan, haalt de
trigger de nieuwe CHECK niet, en **kost een aangeleverde naam een account**.

### ⚠️ En B4 laat zien waarom de must-allows er staan

Zonder de grant vielen óók de *"weigert …"*-toetsen om — maar met `42501`
(permission denied) in plaats van `23514` (check violation). Een test die alleen
*"er kwam een fout"* eist, had dat groen gelezen. Een dichte deur leest als een
veilige deur.
