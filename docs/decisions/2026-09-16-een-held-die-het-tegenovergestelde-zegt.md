# Een held die het tegenovergestelde zegt

**Datum:** 16-09-2026
**Issue:** QS8-493
**Migratie:** 0278 — `groep_helden()`
**Raakt:** 0268 (de RPC en zijn allowlist), 0264 (`hero_appearances`), A41,
domeinregel 7, domeinregel 9, rij 37 in
`docs/decisions/002-domeinregel7-oppervlakken.md`

---

## 1. Wat er gebeurde

QS8-493 gaf `groep_helden()` voor het eerst een scherm. De functie stond sinds
14-09 in `WACHT_OP_EEN_BESLUIT` met de vraag *"krijgt dit oppervlak een plek op
het groepsscherm, of hoort de RPC weg?"*. Antwoord van Quinten: een eigen kaart,
los van het klassement.

⚠️⚠️ **En toen die kaart er eenmaal stond, bleek wat de functie al die tijd kon
teruggeven iets anders te betekenen dan een lezer eruit opmaakt.** Gevonden in de
gebruikersreview, daarna zelf nagemeten. Twee van de vier doorgelaten triggers
waren misleidend, en allebei op een manier die een mens raakt.

## 2. `tussendoor` draagt geen gebeurtenis maar iemands quizheld

📏 `kiesStem()` (`src/modules/helden/stem.ts` r. 102) geeft
`{ held: hoofdheld, trigger: 'tussendoor' }` zódra er géén specifieke
gebeurtenis is. `metHeldenstem()` wordt zo aangeroepen bij onder meer
`approval_received` — dus bij **goed** nieuws.

Concreet: is Ignis je quizheld en wordt je week goedgekeurd, dan stond er op de
kaart *"Bij Anna kwam Ignis langs"*. Ignis is de held van `misser`. De lezer ziet
een misser waar een goedkeuring stond.

⚠️⚠️ **En 0268 zegt dit zelf in zijn kop**, wat de pijnlijke kant is:

> Bij vijf van de zes triggers is `hero_key` dus af te leiden uit `trigger` en
> andersom. Bij de zesde niet: `tussendoor` is de trigger die QS8-475 zet als er
> géén gebeurtenis is en de **hoofdheld** spreekt.

Het scherm van QS8-493 motiveerde het wéglaten van de trigger met precies het
tegendeel: *"held en trigger zijn één op één, dus de naam van de held draagt de
reden al"*. Dat stond in een comment, in de i18n-kop én in rij 37 — drie keer
opgeschreven, nergens nagemeten, en weerlegd door de migratie eronder.

CLAUDE.md waarschuwt daar met zoveel woorden voor: *een afwijking die je
onderbouwt is duurder dan een die je vergeet — een omissie valt op, een
uitgeschreven argument leest de volgende persoon als een reden om er niet aan te
twijfelen.* Dit is de derde keer in drie issues dat die vorm zich voordoet, en de
eerste keer dat hij tot een onware bewering óver een gebruiker leidde.

## 3. `misser` betekent "vandaag niets gedaan", niet "een week gemist"

📏 `nudgeReden()` (`supabase/functions/_shared/notificaties/regels.ts`) laat de
nudge gaan bij: herinnering aan, het ingestelde uur geslagen, géén Dagzet
vandaag, géén afronding vandaag, en **ergens** een open weekdoel. Die nudge
schrijft `misser` (`supabase/functions/notificaties/index.ts` r. 547).

Dat vuurt dus op een doodgewone dinsdag met nog een hele week te gaan.

⚠️ **Dat botst met domeinregel 9:** *"De Dagzet is standaard privé … Een dag
overslaan heeft geen enkel gevolg."* Hier had een overgeslagen dag zeven dagen
lang een groepszichtbaar gevolg.

⚠️ **En A41 opende gemiste wéken**, niet gemiste dagen. Dat een gemiste dag daar
stilzwijgend in meegleed via de nudge-trigger, is nooit ergens besloten. Het is
er gekomen doordat `misser` in twee documenten "iemand heeft iets gemist" heet en
in de code "vandaag nog niets gedaan en er staat een weekdoel open".

⚠️ Het trof bovendien uitgerekend wie zijn herinnering **aan** had staan: een
verschijning wordt alleen geschreven als er ook echt een melding uitgaat. Wie
meldingen uit heeft, stond nergens op de kaart. De kaart strafte betrokkenheid.

## 4. Het besluit

**Alleen `mijlpaal` en `stilte`.** Besluit van Quinten, 16-09-2026, onder grens 1
van de beslisbevoegdheid: het bepaalt wat de app over een mens aan zijn groep
vertelt.

Voor die twee houdt de bijectie van `heldVoorTrigger()` wél — `mijlpaal` ⇔ strix,
`stilte` ⇔ lucerna — dus daar draagt de naam van de held de reden werkelijk.

⚠️ **De prijs staat erbij zodat niemand hem later hoeft te ontdekken:** de kaart
toont minder, en `mijlpaal` wordt bij élke weekafsluiting geschreven, goed of
slecht. `stilte` betekent drie dagen niets, en dat is tegenslag die A41 een open
groep toestaat. Wat de kaart níét meer doet is iets bewéren dat niet gebeurd is.

## 5. Wat de tests hiervan merken

`tests/rls/heldenstem-in-een-open-groep.test.ts` leunde op `misser` als de rij
waar elke must-deny om draait. Die fixtures staan nu op `stilte` (⇔ lucerna):
drie dagen niets, wat A41 een open groep wél toestaat en domeinregel 7 in een
beschermde groep buiten de deur houdt. De belofte is onveranderd; alleen de rij
waarmee ze gemeten wordt is er een die de functie nog geeft.

Er is één toets bij: de twee verboden triggers als **enige** verschijning van een
lid, met de eis dat dat lid niet in de lijst staat.

📏 IJKING — de allowlist teruggezet op de vier van 0268: **1 rood**, precies die
nieuwe toets, op zijn eigen regel (*"een misser hoort deze groep niet te
bereiken"*). De negentien andere bleven groen, want de zichtbaarheidsgrens zelf
is niet veranderd.

## 6. Wat er verder uit die review kwam

| Bevinding | Wat ermee gedaan is |
|---|---|
| Nul rijen heeft hier een derde betekenis (`groep_helden()` joint inner, `groep_klassement()` niet) en er was geen lege staat | Gerepareerd: bij een **open** groep zonder rijen staat er nu `groepshelden.leeg`. De `open`-vlag is een weergavehint, geen autorisatiegrens |
| De kop beloofde de held, de rij begon met de persoon | Gerepareerd: de rij is een zin geworden (*"Bij Anna kwam Strix langs"*) en de kop heet `Welke held er langskwam` |
| "de afgelopen week" is in deze app geen week | Gerepareerd: "zeven dagen". Het venster is rollend en op UTC en volgt noch de cyclusstart noch de huddledag; "week" is hier een geladen woord (domeinregel 1) |
| Twee kaarten onder elkaar begonnen met dezelfde bijzin | Gerepareerd: `groepshelden.uitleg` begint niet meer met "Jullie hebben afgesproken open te zijn" |
| Het Engels week af van de toestemmingstekst | Gerepareerd: de formulering van `bevestiging.groep_openzetten.uitleg` overgenomen |
| `t()` met een samengestelde sleutel, terwijl `heldTekstSleutel()` daarvoor bestaat sinds QS8-474 | Gerepareerd |
| Lange namen duwden de held van het scherm | Gerepareerd: één zin in plaats van twee kolommen met `space-between` |
| `groepshelden.van_totaal` is onbereikbaar (pagina 20, groep maximaal 12) | Weggehaald; de paginering in de datalaag blijft, want die hoort bij de RPC |
| Eén eenzame naam op de kaart is opvallender dan de laatste plek op een ranglijst | **Niet gerepareerd** — rij in `ENGINEER-REVIEW.md`. Een drempel is een productkeuze, en na 0278 is de overgebleven inhoud minder pijnlijk |
| Vier foutdoosjes onder elkaar bij één hapering | **Niet gerepareerd** — rij; het raakt vier bestaande kaarten en niet alleen deze |
| De kaart is een doodlopend eind: geen uitleg wie die helden zijn | **Niet gerepareerd** — rij |
| Geen uitweg uit de heldenlijst behalve de groep verlaten | **Niet gerepareerd** — bestaande rij van 14-09, nu herwogen omdat het oppervlak echt zichtbaar is |
