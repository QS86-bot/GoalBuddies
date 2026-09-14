# Twee routes naar een lege weekafsluiting, en waarom het verschil blijft

**14-09-2026 — QS8-487.** Wat er overbleef van QS8-486 nadat de premisse daarvan
onderuit ging. **Dit is geen autorisatievraag:** je eigen weekafsluiting
terugnemen is een bewust gebouwd recht met een knop erop, en dat hoort zo te
blijven.

## 📏 De meting

Beide routes op een verse opbouw van `supabase/migrations/`, met een groep, een
schrijver, een lezer die reageert, en een schakel van De Ketting:

```
ROUTE 1 (terugnemen)  afsluitingen 1 -> 0   reacties 1 -> 0   schakels 1 -> 1
ROUTE 2 (bewerken)    afsluitingen 1 -> 1   reacties 1 -> 1   schakels 1 -> 1
                      did_text = '.'
```

## ⚠️ Wat deze ronde toevoegt: route 2 is de gewone opslaanknop

Het issue beschreef route 2 als *leegmaken* — een `update` die de velden
terugbrengt tot bijna niets. Wat er niet bij stond, en wat dit wel degelijk
verandert: **`bewaarWeekafsluiting()` is een `upsert`** op
`(group_id, user_id, group_period_start)`. Bewerken is dus geen los geschreven
API-verzoek maar het pad dat de opslaanknop zelf neemt, en
`week_reviews_iets_ingevuld` eist alleen dat **één** van de drie velden niet
blanco is.

Er zijn dus geen "route 1 en een achterdeur", maar twee knoppen die allebei
bestaan omdat ze allebei ergens voor zijn.

⚠️ **En dat verzwakt de zaak om er iets aan te doen in plaats van hem te
versterken.** Een bewerking is een bewerking: reacties onder een bijgewerkte
kaart zijn normaal, zoals in elk gesprek. Route 2 wordt pas *terugnemen in
vermomming* als iemand zijn tekst bewust tot betekenisloos terugbrengt terwijl de
knop "Terugnemen" ernaast staat.

## Het besluit: zo laten

De prijs van elk alternatief is hoger dan wat het oplost.

| Route | Wat het oplost | Wat het kost |
|---|---|---|
| Reacties wissen bij een bewerking | route 2 laat geen wezen na | **het herstellen van een typefout ruimt de aanmoediging van je buddies op** — en aanmoediging is het enige dat de groepsfeed mag dragen (domeinregel 7) |
| Bewerken tot bijna-leeg weigeren | idem | een drempel op precies de vrijheid die vraag 2 draagbaar maakt; en `'.'` is niet te onderscheiden van een kort maar echt antwoord |
| Een intern auditspoor | er blijft iets na | schema zonder lezer — de klasse van regel 18 vraag 5, een keten die doodloopt. En het beantwoordt de vraag niet: het spoor is niet wat hier ontbreekt |
| Een groepszichtbaar spoor | de groep weet ervan | ⚠️ **uitgesloten** zonder besluit van Quinten: *"X heeft zijn weekafsluiting teruggenomen"* is een negatief signaal over een ander (domeinregel 7), én grens 1 |

⚠️ **Zo laten is hier een besluit en geen uitstel.** Het recht om terug te nemen
ís de voorwaarde waaronder iemand vraag 2 durft in te vullen; elke oplossing die
dat zwaarder maakt, betaalt met precies het vertrouwen waar domeinregel 7 voor
bestaat.

## Wat er wél gebouwd is: het verschil vastgelegd

Geen gedragswijziging — wat ontbrak was dat het verschil **besloten** was in
plaats van aangetroffen.

1. `tests/rls/weekafsluiting-twee-routes.test.ts` zet beide routes naast elkaar.
   Regel 18 vraag 1: *waar knopen twee correcte onderdelen aan elkaar?* `epic7`
   toetste route 1; niets toetste route 2, en niets legde ze naast elkaar.
2. De kop van `bewaarWeekafsluiting()` zegt nu dat de reacties hier blijven
   staan, en waarschuwt tegen de verkeerde gevolgtrekking.

⚠️ **Die gevolgtrekking is het eigenlijke risico.** De kop van
`verwijderWeekafsluiting()` zegt: *"een reactie op een antwoord dat niet meer
bestaat, is een halve zin over iets dat niemand kan nalezen."* Dat is waar voor
die route. Een lezer die alleen dát leest, leidt er redelijkerwijs uit af dat
*inhoud weg ⇒ reacties weg* een eigenschap van het systeem is — en gaat route 2
"repareren".

## De schakel van De Ketting: al besloten in 0037

`chain_links` blijft bij **allebei** de routes staan. Dat is bewust: `0037` koos
een venster plus `on conflict do nothing` tegen **ketting-inflatie** — wissen en
opnieuw indienen om schakels te farmen — in plaats van het wissen te blokkeren.

⚠️ Wat 0037 níet behandelt is wat een schakel *betekent* zonder afsluiting. Die
vraag blijft open en staat als agendarij.

📏 En er stond tot deze ronde **geen enkele test** onder dat de schakel blijft
staan; het besluit van 0037 leunde op een leesbeurt van de migratie. Dat staat nu
in de test hierboven.

## De ijking

Mutatie per grendel, en elke mutatie eerst met een `grep` in de database
teruggezien:

| Mutatie | Uitslag |
|---|---|
| trigger die bij een bewerking naar `'.'` de reacties opruimt | **alleen route 2 rood** |
| trigger die bij het terugnemen de schakel meeneemt | **alleen route 1 rood** |
| niets | groen, 2 van 2 |

⚠️ Beide mutaties zijn precies de "reparatie" die een volgende lezer zou kunnen
aanbrengen. Dat is wat dit bestand moet vangen, en het vangt ze los van elkaar.

## Wat hier niet besloten is — en bij Quinten ligt

- Of een teruggenomen weekafsluiting een **spoor** hoort na te laten dat de
  gebruiker zelf terugziet.
- Of de groep iets hoort te merken. ⚠️ Het antwoord is vandaag **nee** op grond
  van domeinregel 7, en het omdraaien daarvan is grens 1.
- Wat een schakel betekent zonder afsluiting (zie 0037 hierboven).
