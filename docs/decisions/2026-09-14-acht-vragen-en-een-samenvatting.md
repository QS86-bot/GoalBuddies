# Acht vragen en één samenvatting — wat er van A56 overeind blijft

**Datum:** 14-09-2026
**Issue:** QS8-474 (epic QS8-468)
**Raakt:** besluit A56 (QS8-257), acceptatiecriterium 4 van QS8-37, besluit 6 en 7
van QS8-468

---

## 1. Wat er verandert

De korte vragenlijst in `app/onboarding/vragenlijst.tsx` gaat van vier vragen
naar acht. De vier nieuwe zijn de heldenvragen uit
`docs/superhelden-archetypes.md`; ze wijzen samen een held aan, en die held gaat
naar `hero_profiles` (migratie 0264).

**Er komt géén tweede samenvatting bij.** Acht vragen, één samenvattingsscherm
aan het eind, en de heldenuitslag staat op dát scherm.

## 2. Waarom dat de kern van dit besluit is

QS8-257 legde A56 vast, en dat issue ging er met zoveel woorden over dat **het
samenvattingsscherm het punt was en niet de vier vragen**:

> "Dit heb je me verteld — tik een antwoord aan om het te wijzigen" maakt het
> plan van de gebruiker in plaats van van de app, en het is de goedkoopste
> vertrouwenswinst in de hele flow.

Acht vragen met één samenvatting houdt dat overeind. Acht vragen met twee
samenvattingen niet: dan is het geen vragenlijst-met-een-terugblik meer maar twee
vragenlijsten achter elkaar, en is de terugblik een tussenscherm geworden.

⚠️ **Dit is precies de vorm waarop een besluit stil verschuift.** Niemand zou
opschrijven "we draaien A56 terug"; wat er gebeurt is dat er een quiz bij komt
die logischerwijs zijn eigen afsluiting krijgt, en dan is A56 weg zonder dat
iemand het besloot. Vandaar dat er een grendel onder staat en niet alleen deze
alinea: `tests/beloftes/alle-gedeelde-koplopers.test.ts` wordt rood zodra er een
tweede `<Samenvatting` in het scherm staat, en zodra de samenvatting niet meer
achter álle vragen komt.

## 3. Besluit 7: alle gedeelde koplopers, niet de top 2

Het brondocument schrijft bij de scoring:

> Bij gelijkspel: toon de top 2 en laat de gebruiker zelf kiezen.

Dat is niet gedefinieerd voor het geval dat hier normaal is. Vier vragen over zes
helden geeft maximaal 4 punten, en **1-1-1-1 over vier verschillende helden is
een gewone uitslag** — geen randgeval. "De top 2" zou dan twee van de vier
koplopers laten zien, gekozen op een volgorde die niemand heeft besloten.

Besluit 7 van QS8-468: toon **álle** gedeelde koplopers. Twee, drie, vier, in
theorie zes.

De reden die het brondocument zelf geeft voor de keuze — *agency, en meer
betrokkenheid bij de gekozen held* — blijft staan en wordt hier alleen eerlijk
uitgevoerd.

### Wat dat in code betekent

`koplopers()` geeft **altijd een array** terug, ook bij één winnaar. Een functie
die soms een held en soms een lijst teruggeeft, verplaatst de aanname "er is er
precies één" naar elke aanroeper.

⚠️ Dit is regel 18 vraag 6 in zijn zuiverste vorm: een feature die *"er is er
altijd precies één"* optilt naar *"er kunnen er meer zijn"*. De grep die het
issue voorschreef (`[0]`, `.find(`, `first`, `single()`, `maybeSingle()`) is
vóór het bouwen gedraaid over de schermlaag, `vragenlijst-schemas.ts`,
`src/modules/helden/` en `profile.ts`. 📏 Uitkomst: de aanname stond er nog
níet, want er was nog geen scoringscode. De enige treffers waren
`maybeSingle()`/`single()` op de profielrij — daar is één rij ook echt de
waarheid — en een `[0]` in een testassertie.

**De aanname zou dus in dit issue zijn ontstaan.** Vandaar dat de vorm van
`koplopers()` het eerste is wat vastligt, en niet iets wat achteraf is
rechtgezet.

## 4. Wat er níet in zit

**Geen vijfde uitkomst "de app kiest wel".** Wie een gelijkspel onbeslist laat,
bewaart zijn vragenlijst zonder held. Dat is dezelfde regel als overslaan: de app
vult niets in namens iemand.

**Geen verplichte keuze.** Een gelijkspel afdwingen zou van overslaan een
doodlopende weg maken, en acceptatiecriterium 4 van QS8-37 zegt dat overslaan
mag en niets wist.

**De vier heldenantwoorden worden nergens bewaard.** Alleen de uitslag landt, in
`hero_profiles`. Gevolg: wie het scherm een tweede keer opent, ziet de
heldenvragen leeg terwijl de andere vier ingevuld staan.

⚠️ Dat gevolg is één plek waar het bijna misging. De eerste opzet toonde dan
"Je hebt de heldenvragen overgeslagen" — een ware zin met een onware strekking,
want die gebruiker hééft een held. `useHeldprofiel()` haalt hem op, en het scherm
zegt in dat geval welke held blijft staan. **Gevonden doordat
`npm run exports:controle` meldde dat `heldprofiel()` nergens werd aangeroepen**;
de voor de hand liggende reactie was een registerrij met "weg bij QS8-475", en
dat zou de copyfout hebben laten staan.

## 5. Twee dingen die onderweg gemeten zijn

### `.upsert()` werkt niet op `hero_profiles`

📏 Gemeten op 14-09-2026 tegen de lokale PostgREST, als een echte
`authenticated`:

| Vorm | Uitslag |
|---|---|
| kale `insert` | 201 |
| kale `PATCH` | 204 |
| `Prefer: resolution=merge-duplicates` | **403, 42501, "permission denied for table hero_profiles"** |

De grants van 0264 zijn `insert (user_id, hero_key, source)` en
`update (hero_key, source)`: `user_id` mag je bij het aanmaken zetten en daarna
nooit meer. PostgREST zet bij `merge-duplicates` élke payload-kolom in de
`on conflict do update set`-lijst, en `user_id` moet in die payload staan want
het is de conflictkolom. Postgres eist dan UPDATE-recht op `user_id` en weigert
de héle rij.

`bewaarHeld()` doet daarom insert, en bij 23505 een update. Niet "eerst kijken of
hij er al is": dat is een race waar de sleutel de scheidsrechter hoort te zijn.

### Twee controles konden een samengestelde sleutel niet volgen

`npm run catalogus:controle` herkent een template-literal alleen als die
**direct in `t()`** staat. `heldTekstSleutel()` gaf er een terug uit een helper,
en dan ziet de controle niets — ook niet nadat dit issue die teksten op het
scherm zette.

📏 Daardoor stonden achttien sleutels in `NOG_NIET_AANGESLOTEN` met de reden
"heldencopy zonder scherm", en die reden zou stilletjes onwaar zijn geworden.
Beide helpers zijn omgezet naar een opzoektabel met `Sleutel`-literals. Dat doet
er nog iets bij: `tsc` toetst nu of de sleutel bestáát, wat de `as Sleutel`-cast
juist wegnam — en `t()` valt bij een onbekende sleutel terug op de sleutel zelf,
dus een typefout werd een scherm met `held.qiup.naam` erop.

De vierenveertig quotesleutels blijven in het register en zijn voor QS8-475.

## 6. Wat hierna nog waar moet blijven

- De samenvatting staat achter álle vragen, en er is er één.
- Het aantal getoonde koplopers komt uit de uitslag en nergens uit een getal.
- Overslaan wist niets, ook de held niet.
- Een gelijkspelkeuze telt alleen zolang hij koploper ís.
