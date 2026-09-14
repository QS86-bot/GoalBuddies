# Een allowlist die alleen de buitenkant leest

**Datum:** 13-09-2026
**Issue:** QS8-464 (migratie 0260, reviewrij 519)
**Status:** vastgelegd

## Waar dit over gaat

`goal_events.old_value` en `new_value` hadden geen enkele grens — geen vorm, geen
omvang, geen type — en elke gekoppelde groep leest die kolommen mee. De
reparatie is een register per `event_type` van de sleutels die erin mogen, plus
een omvangsgrens.

Die reparatie is drie keer geschreven. De eerste versie was groen op negentien
toetsen en liet het scenario van de reviewrij woordelijk door. De tweede was
groen op negenentwintig toetsen en **weigerde elk akkoord op een
uitstelverzoek**. Dit document gaat niet over `goal_events` maar over de vorm van
die twee fouten, want geen van beide is aan deze tabel gebonden.

## 1. `jsonb_object_keys()` beantwoordt een smallere vraag dan hij lijkt

Het register stond op:

```sql
exists (
  select 1 from jsonb_object_keys(w.v) k
  where not exists (select 1 from toegestaan t where t.sleutel = k and …)
)
```

Dat leest als *"zit er een sleutel in die niet gewogen is"*. Wat het beantwoordt
is *"zit er een **buitenste** sleutel in die niet gewogen is"* — `jsonb_object_keys()`
daalt niet af. 📏 Gemeten, met die versie in de database:

```
goal_event_sleutels_kloppen(
  'created', null,
  jsonb_build_object('title', jsonb_build_object('reden','…','gemiste_week',true))
)  ->  true
```

De sleutel is `title`, en `title` mag. Wat eronder hangt is een heel object met
vrije tekst erin — 1846 tekens gemeten met 1800 tekens `reden` — en dat is
precies waar reviewrij 519 over gaat: *"zet een toekomstige feature een
toelichting in `new_value`, dan leest groep A wat voor groep B bedoeld was."*
De toets die een plátte `reden` weigerde, liet de geneste door.

**De les is niet "vergeet het nesten niet".** De les is dat een allowlist die op
namen weegt, weegt op de laag waar hij kijkt en op geen enkele laag daaronder.
Een naam is een ondiepe eigenschap van een diepe structuur.

De reparatie is een register met een kolom erbij: niet `(gebeurtenis, kant,
sleutel)` maar `(gebeurtenis, kant, sleutel, soort)`, getoetst met
`jsonb_typeof(w.v -> k)`. `title` mag een `string` zijn en verder niets — een
object, een array of een getal onder diezelfde sleutel wordt geweigerd. Daarmee
is de diepte geen open vraag meer maar één: onder een gewogen sleutel hangt een
scalar van de gewogen soort, en dus hangt er niets onder.

⚠️ **Waar dit nog meer staat.** Elke plek die een jsonb- of JSON-structuur
beoordeelt op zijn sleutels: `sleutelzetters()`, elk Zod-schema dat onbekende
velden doorlaat, en elke toekomstige CHECK die een payload weegt. De vraag om te
stellen is niet *"staan de goede sleutels erin"* maar *"kan er iets in staan dat
mijn toets niet bekijkt"*.

## 2. Een register dat je van de naam afleest in plaats van van de schrijver

De soortkolom uit §1 loste het lek op en maakte meteen een nieuwe fout mogelijk,
want nu moest er van elk veld een soort opgeschreven worden. Eén ervan heet
`straffen_teruggezet`. Dat leest als een boolean, en er stond `boolean`.

📏 Het is een `integer`. In `beslis_deadline_verzoek()` staat
`teruggezet integer := 0`, gevuld met `get diagnostics teruggezet = row_count` —
het is het **aantal** vooruitgeschoven straffen, niet de vraag óf er een
vooruitgeschoven is. De CHECK weigerde daarmee élk akkoord op een
uitstelverzoek: de RPC viel om, PostgREST gaf `null` terug, en de reden stond
niet in de melding maar in het serverlog (`DETAIL: Failing row contains …`).

⚠️⚠️ **En de must-allow die dit had moeten vangen, was het ermee eens.** Die
voedde `'straffen_teruggezet', true` aan — een vorm die geen enkele schrijver
produceert. Hij was overgeschreven uit het register in plaats van uit de
schrijver, dus register en toets waren het met elkáár eens en allebei oneens met
het schema. De suite bleef groen op negenentwintig toetsen.

Wat het ving was `tests/rls/uitstelbeslisser-ziet-de-straf.test.ts`, een suite van
een ánder issue die de echte RPC aanroept.

**De regel die hieruit volgt:** een fixture in een must-allow komt uit de
schrijver en niet uit je eigen register. Dat is vraag 2 van regel 18 toegepast op
de invoer in plaats van op de assertie — *toetst deze test de belofte, of een
eigenschap van het onderdeel?* Een must-allow met een zelfbedachte payload toetst
dat je register consistent is met zichzelf, en dat is het altijd.

Praktisch: er zijn precies twee schrijvers van `deadline_moved` in de database,
`zet_streefdatum()` en `beslis_deadline_verzoek()`, en geen enkele client schrijft
dat type zelf — `goal_events_insert` laat alleen `created`, `archived` en
`completed` toe. De eerste staat sinds deze ronde als échte aanroep in
`tests/rls/goalgebeurtenissen.test.ts`; voor de tweede verwijst die suite naar de
straf-suite, want die vraagt een groep, een verzoek en een begunstigde.

## 3. Een must-allow die als eigenaar draait, toetst de grant niet

De derde fout zit ook in de toets. De CHECK roept een functie aan, en Postgres
toetst EXECUTE op zo'n functie op het moment van **schrijven**. Zonder
`grant execute … to authenticated` valt daarmee élke insert van een ingelogde
gebruiker om — ook een volkomen normale. Dat is de les van QS8-453, hij staat in
de kop van 0260, en er stond een must-allow onder die hem zou vangen.

Die must-allow draaide als `postgres`. 📏 Gemeten, met de grant in een
teruggerolde transactie weggehaald:

```
als postgres        -> true                (de test bleef groen)
als authenticated   -> permission denied for function goal_event_sleutels_kloppen
```

De eigenaar van een functie heeft EXECUTE ongeacht elke grant. De toets die er
stond om de grant te bewaken, was de enige rol waarvoor de grant niet bestaat.

⚠️ **Dit is vraag 3 van regel 18 in zijn zuiverste vorm:** kan deze test groen
blijven terwijl de belofte breekt? Het antwoord was ja, en het was niet met
nadenken te vinden — het was met de mutatie te vinden. `PSQL_OMGEVING` valt terug
op `PGUSER ?? 'postgres'`, en dat staat nergens in de test.

**De regel die hieruit volgt:** een toets die een recht bewaakt, draait onder de
rol die dat recht nodig heeft. Voor deze suite betekent dat `set local role
authenticated` met claims, en bij voorkeur langs de échte schrijfroute — daar
staan de policy, de grant en de CHECK samen in.

## 4. Een grens die je onderbouwt met een getal dat je niet gemeten hebt

Kleiner, maar dezelfde familie. De omvangsgrens stond op 2000 met de
onderbouwing *"ruim tienvoudig boven het huidige maximum"*. Het huidige maximum
is 213 tekens — een `created` met een titel van 200, het maximum van
`goals_title_len`. Tienvoudig leek te kloppen.

📏 Wat er niet gemeten was, is dat de json-**tekst** aan het ontsnappen hangt:

| titel van 200 tekens | `char_length(…::text)` |
|---|---|
| gewone tekens | 213 |
| emoji | 213 |
| aanhalingstekens | 413 |
| stuurtekens | 1213 |

Een stuurteken kost zes tekens in de json-tekst. Het slechtste geval dat het
schema vandaag toestaat is dus 1213 en niet 213, en 2000 was 1,65× en niet
tienvoudig. De grens staat nu op 4000.

⚠️ **En daarmee hangt dit getal aan een CHECK in een andere migratie.** Gaat
`goals_title_len` ooit van 200 naar 500, dan wordt het slechtste geval hier 3013
— onder 4000, maar ruim boven de 2000 die er eerst stond. Dan weigert deze grens
een titel die het schema zelf goedkeurt, en dat is een dichte deur en geen grens.
Git ziet die koppeling niet; de kop van 0260 noemt hem, en deze rij noemt hem
nog een keer.

Tegen de misbruikkant maakt 2000 of 4000 niets uit — allebei liggen ze ruim
duizendvoudig onder de vijf miljoen tekens die er vóór 0260 gewoon in gingen.
Tegen de valse weigering maakt het alles uit, en dat is de kant waar een grens
kan omvallen zonder dat iemand het merkt: een insert die hoort te lukken en niet
lukt, ziet er van buiten uit als een veilige tabel. §2 is daar het bewijs van —
die fout stond vier uur in de branch en zag er als een strengere grens uit.

## Wat er onder staat

Zeven mutaties over twee suites (47 toetsen), elke keer teruggelezen uit de
database vóór de uitslag geloofd is, elk tegen de toets die hem noemt:

| Mutatie | Rood | Welke |
|---|---|---|
| `goal_events_waarde_omvang` weg | 1 | de toets die de omvangsgrens noemt |
| het register op `select true` | 12 | elke must-block, geen must-allow |
| de soortvergelijking eruit | 6 | de vijf soortgevallen plus de geneste langs de schrijfroute |
| de `grant execute` weg | 19 | inclusief de gewone `created`-insert langs de echte route |
| de grens op 1000 | 1 | de must-allow van het slechtste legitieme geval (1213) |
| `straffen_teruggezet` weer `boolean` | 4 | **allebei de straf-toetsen**, plus de must-allow die nu de echte vorm draagt |
| `target_date` uit de nieuw-kant | 4 | allebei de straf-toetsen, plus de echte aanroep van `zet_streefdatum()` |

De laatste twee rijen zijn de ijking die telt. Ze laten zien dat de fout uit §2
nu **binnen deze branch** rood wordt en niet alleen in de suite van een ander
issue — en dat is precies het verschil tussen een grendel en een toevalstreffer.
