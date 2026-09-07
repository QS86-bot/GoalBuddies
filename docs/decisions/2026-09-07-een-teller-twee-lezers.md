# Eén teller, twee lezers — QS8-174

**07-09-2026.** Migratie 0180. Dossierrij van 27-08-2026, risico Laag.

## Wat er ontbrak

QS8-65 gaf een groep een drempel: één buddy, meerderheid of quorum. De
**beoordelaar** ziet in zijn wachtrij "1 van de 2 bevestigingen" — dat komt uit
`openstaande_beoordelingen()`. De **eigenaar** zag alleen dát zijn week op
bevestiging wachtte. Dat was vóór QS8-65 het hele verhaal; met een
meerderheidsregel is het onvolledig.

## De keuze die deze migratie draagt

De voor de hand liggende vorm is een tweede functie die de bevestigingen nog
eens telt. Dat zou de zin in de kop van `goedkeuringsdrempel_gehaald()` — *de
enige plek waar bevestigingen geteld worden* — onwaar maken, en dan zijn er twee
opvattingen over wanneer een week rond is. Precies de vorm van regel 18: twee
correcte onderdelen, en de naad ertussen die niemand bewaakt.

Dus is de telling uit `goedkeuringsdrempel_gehaald()` gelicht en in
`bevestigingsstand()` gezet, en leest die functie hem daar. **Eén teller, twee
lezers:** de een maakt er een oordeel van, de ander laat de getallen zien.

⚠️ Dat is een wijziging in de goedkeuringsroute, en dus in de gevoeligste functie
van de app. De 23 bestaande tests over `goedkeuringsdrempel`, `beoordelingsgrens`
en `domeinregel3` zijn het bewijs dat het gedrag niet verschoven is.

## De invoker-vorm overleefde de eerste meting niet

Het ontwerp in het issue wilde `mijn_bevestigingsstanden()` als `security
invoker`, zodat RLS de rijen filtert *naast* de expliciete eigenaarstoets — twee
sloten in plaats van één. 📏 Gemeten:

```sql
set local role authenticated;
select * from mijn_bevestigingsstanden(array[]::uuid[]);
-- ERROR: permission denied for function bevestigingsstand (42501)
```

Een invoker draait onder de aanroeper, en die mag de teller niet uitvoeren. Twee
uitwegen, allebei een keuze:

| Uitweg | Wat het kost |
|---|---|
| `bevestigingsstand()` aan `authenticated` geven | De teller wordt een nieuw oppervlak: een groepsgenoot leest er de stand van andermans voltooiing uit |
| `mijn_bevestigingsstanden()` definer maken | Het oppervlak blijft wat het issue ontwierp; de grens hangt op één slot |

**Het tweede**, want het beschermt het oppervlak en niet de vorm. Voor élk nieuw
oppervlak is beschermd het antwoord tot iemand het tegendeel besluit. Dat ene
slot — `g.owner_id = (select auth.uid())` — staat onder test met een
groepsgenoot die andermans `weekly_goal_id` aanbiedt, en tak 4 van
`definer_bewaking()` bewaakt dat deze definer zijn aanroeper toetst.

## De semantiek: de dichtstbijzijnde groep

Een doel kan aan meerdere groepen hangen, en elke groep oordeelt met zijn eigen
regel; één groep die zijn drempel haalt is genoeg. Er zijn dus net zoveel standen
als groepen, en de eerlijke om te tonen is de dichtstbijzijnde:
`order by (nodig - gedaan) asc, gedaan desc limit 1`.

⚠️ **Die regel was eerst niet te ijken**, en dat wees een gat aan: elk doel in de
testopstelling hing aan één groep, dus er viel niets te kiezen en de mutatie
(`order by` omdraaien) bleef groen. Er staat nu een test met een doel in twee
groepen met verschillende drempels; daar gaat die mutatie wél rood, en als enige.

## Wat het bijschrift wel en niet zegt

* **Geen namen.** Wie er bevestigd heeft is niet van de groep — `beoordelen` legt
  dat al vast. Twee getallen en verder niets.
* **Alleen voor de eigenaar.** `rangeState()` dwingt dat af en niet het scherm.
* **Alleen als er iets te tellen valt.** Bij een drempel van één — de standaard
  `any` — zegt "0 van de 1" precies hetzelfde als "wacht op je buddy", met meer
  woorden. Een bijschrift dat niets toevoegt, leer je overslaan.
* **Wegvallen mag.** `fetchBevestigingsstanden()` werpt niet bij een fout; het
  bijschrift valt dan terug op de tekst van vóór dit issue. Een lijstscherm laten
  omvallen voor een bijschrift is de verkeerde ruil.

## Eén verzoek voor de hele cyclus

Een array-parameter en geen enkel id. Het dashboard toont alle weekdoelen van de
cyclus; per week los ophalen is de N+1 uit onwrikbare regel 12, en dat is precies
waarom deze rij zo lang op de dossierlijst stond.

## De blokkade die er niet meer was

Het issue noteerde op 03-09 een tweede blokkade: *"`database.types.ts` wordt
gegenereerd uit productie en met de hand bewerken staat er bovenaan verboden."*
📏 Dat verbod staat er niet. Het bestand draagt geen banner, en het draagt al
handgeschreven handtekeningen van migraties die nog niet op productie staan
(`beneficiary_user_id` uit 0168). `docs/WERKVOORRAAD.md` beschrijft dat als de
huidige toestand met een benoemd risico — *"een handmatige regel die niemand meer
als handmatig herkent, is precies hoe de repo en het project uit elkaar gaan
lopen"* — en niet als een verbod.

⚠️ Dat risico blijft staan en is met deze migratie één regel groter geworden. Het
hoort bij de openstaande taak `npm run types:db`, niet bij dit issue.
