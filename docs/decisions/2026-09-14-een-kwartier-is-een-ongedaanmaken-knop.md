# Een kwartier is een ongedaan-maken-knop, geen oordeel

**Datum:** 14-09-2026
**Issue:** QS8-456
**Migratie:** 0266
**Raakt:** domeinregel 10 (het puntenmodel), domeinregel 6 (append-only)

## De vraag

Wat hoort een week op te leveren die na een **ingetrokken** goedkeuring alsnog
door de termijn wordt goedgekeurd?

Het issue liet twee antwoorden open:

1. **Opnieuw uitbetalen** — de week is gehaald en de eigenaar kan er niets aan
   doen dat zijn buddy zich bedacht.
2. **Niet uitbetalen** — en dan moet de week ook niet op `approved` komen.

Wat vandaag gebeurde was optie 2 *per ongeluk*: de week kwam wél op `approved`
en leverde **netto nul** op. Dat is geen van beide antwoorden, en het botst met
domeinregel 10 — de score moet iets zeggen.

## 📏 Het pad, gemeten

```
1. buddy keurt goed      -> completion_approved_ceiling  +2
2. buddy trekt in        -> correction                   -2
                            weekly_goals.status -> pending
3. buddy verlaat de groep
4. de termijn draait     -> afgehandeld = 1
                            weekstatus -> approved
                            totaal punten -> 0
```

De `+2`-rij uit stap 1 bezet `points_ledger_dedupe_idx` op
`(user_id, reason, ref_type, ref_id)`, dus het `on conflict do nothing` in
`keur_vastgelopen_goedkeuringen_goed()` slikt de boeking van stap 4.

## Het besluit: opnieuw uitbetalen

⚠️⚠️ **De doorslag gaf een meting en niet een redenering.**

Mijn eerste afweging was optie 2, en het argument was: `trek_goedkeuring_in()`
is een bewuste handeling die zegt *dit klopte niet*, en een termijn die dat
overrulet, vervangt een menselijk oordeel door een klok. Peer-goedkeuring is een
autorisatiegrens (domeinregel 3), geen formaliteit.

📏 Toen bleek `intrekvenster_minuten()` **15** te geven.

**Een venster van vijftien minuten is een ongedaan-maken-knop en geen oordeel.**
Niemand herweegt andermans week veertien minuten later op de inhoud en draait
zichzelf terug; wat je in een kwartier terugneemt is een misklik of een
verkeerde rij. En gebeurt het tóch op inhoud, dan staat de week daarna weer op
`pending` en kan elke andere groepsgenoot hem alsnog goedkeuren — er verdwijnt
dus niets dat een mens nog kan corrigeren.

Daarmee valt het argument vóór optie 2 weg: er is hier geen oordeel dat de
termijn overrulet.

⚠️⚠️ **En optie 2 heeft een misbruikvorm die optie 1 niet heeft.** Sluit je een
ingetrokken week permanent uit van de termijn, dan kost één misklik plus een
vertrekkende buddy de eigenaar zijn punten **voorgoed**. Erger: goedkeuren →
intrekken → vertrekken wordt dan een manier om iemands week onbetaalbaar te
maken, door iemand die de groep al verlaten heeft. Dat is een echte schade waar
het risico van optie 1 hypothetisch is.

De termijn bestaat juist voor *"de eigenaar heeft het werk gedaan en niemand
keurde op tijd goed"* — en dat is letterlijk deze situatie.

## Hoe: een ronde, en niet een tweede reden

`points_ledger.ronde smallint not null default 1`, opgenomen in de
dedupe-sleutel: `(user_id, reason, ref_type, ref_id, ronde)`.

Wat `ronde` betekent: **de hoeveelste keer deze (gebruiker, reden, ding) geboekt
is.** Ronde 1 is normaal. Een hogere ronde kán alleen bestaan doordat een
eerdere ronde is teruggedraaid — anders stond de week niet op `pending` en kwam
de termijn er niet aan toe.

⚠️ **Hij zit ín de sleutel en niet ernaast.** Binnen één ronde blijft dubbel
boeken onmogelijk, en dát is waar die index voor bestaat. De termijn neemt
`max(ronde) + 1` en niet "ronde 2": een week kan in theorie meer dan één keer
goedgekeurd-en-ingetrokken zijn.

### Drie alternatieven die zijn afgevallen

| Alternatief | Waarom niet |
|---|---|
| `on conflict … do update set zonder_beoordelaar = true` | Lost het spoor op en de punten niet, en maakt het grootboek in de ándere richting onwaar: die rij ís een echte peer-goedkeuring geweest. 📏 Geijkt als mutatie H — netto blijft 0. |
| Een eigen `reason` voor de automatische route | `reason` bepaalt de punten én zit in de sleutel; een eigen waarde heft de dedupe per ongeluk op. Staat al zo in de kop van 0257 (QS8-453). |
| Het spoor naar `weekly_goals` verhuizen | 📏 `weekly_goals_select` deelt een week met de groep bij een gekoppeld doel, en de tabel zit in de realtime-publicatie. Dat is een **nieuw groepszichtbaar oppervlak**, en dan is beschermd het antwoord. |

## Wat dit besluit níet is

⚠️ **Geen reparatie van QS8-454.** Dat issue gaat over dezelfde index maar een
andere vraag: dat een week een vloer- **én** een plafondboeking kan dragen,
omdat `reason` in de sleutel zit. `reason` blijft hier onveranderd in de sleutel,
dus dat gat staat er nog precies zoals het was. `ronde` staat die reparatie niet
in de weg — wie `reason` er ooit uit haalt, houdt de ronde gewoon.

Het zijn twee issues en dus twee branches; bundelen mag alleen bij één
ondeelbare wijziging, en dit zijn twee besluiten over dezelfde sleutel.

⚠️ **Geen herschrijving van geschiedenis.** De +2 en de −2 blijven staan; er komt
een rij bíj. Domeinregel 6.

⚠️ **Geen nieuw groepszichtbaar oppervlak.** `points_ledger` is eigenaar-only.

## 📏 De ijking

Twee grendels, twee mutaties, elk apart bevestigd op de gedéployde functie vóór
de uitslag gelezen werd. De toets stond hiervóór als `it.fails` in
`tests/rls/vastgelopen.test.ts` en is nu een gewone toets.

| | Mutatie | Wat er rood wordt |
|---|---|---|
| G | de termijn boekt weer in ronde 1, met `on conflict do nothing` | de **spoor**-helft: *"de termijn boekte geen rij met `zonder_beoordelaar`"* |
| H | `on conflict … do update set zonder_beoordelaar = true` (de voor de hand liggende, onjuiste reparatie) | de **punten**-helft: *"expected 0 to be greater than 0"* |

⚠️⚠️ **Dat zijn met opzet twee mutaties en niet één.** Onder mutatie G valt de
spoor-assertie als eerste om, en dan wordt de punten-assertie nooit uitgevoerd —
dan zou die helft ongeijkt in de suite staan terwijl de run rood is. Mutatie H
is de mutatie die de spoor-helft juist **laat slagen** en alleen de punten
breekt. Precies waar CLAUDE.md bij regel 18 voor waarschuwt: een ijking die zijn
geval langs een eerdere grendel voert, bewaakt niets van wat hij belooft.

📏 In beide runs blijft de must-allow groen: *"weigert een tweede boeking met
dezelfde reden voor dezelfde week"* — binnen één ronde dedupliceert de index nog
precies zoals eerst.

## Wat er blijft staan

De week kan nog steeds op `pending` blijven staan als de intrekkende buddy
vertrekt vóór de termijn verstreken is en er geen andere beoordelaar is; dan
wacht hij tot de termijn hem oppakt. Dat is het bestaande gedrag van de termijn
en niet iets dat dit besluit verandert.
