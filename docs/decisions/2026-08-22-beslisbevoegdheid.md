# Beslisbevoegdheid: één grens in plaats van een lijst

> ⚠️ **Hernummer dit bestand bij het samenvoegen.** Het heeft bewust een datum in
> plaats van een nummer: deze sessie draaide op een remote clone van 19-08 en kon
> niet zien welke nummers na `002` lokaal al vergeven zijn. Een geraden `003` had
> een bestaand besluit kunnen overschrijven.

**Status:** besloten door Quinten, 22-08-2026
**Raakt:** `CLAUDE.md` — vervangt de lijst "Wat je NOOIT doet zonder te vragen"

## Het besluit

De lijst met zeven dingen die niet zonder toestemming mochten, is vervangen door
één grens. Claude beslist zelf en werkt af; stoppen gebeurt nog in precies twee
gevallen:

1. de keuze bepaalt wat er tegen een mens beloofd of in rekening gebracht wordt;
2. de handeling is onomkeerbaar vernietigend.

In alle andere gevallen geldt: kies de conservatiefste optie die het werk áf
maakt, bouw door, en zet de aanname zichtbaar in het issue én hier.

## Waarom

De oude lijst hield vaker op dan hij beschermde. Vier van de zeven punten
(dependency, datamodel van een bestaande tabel, auth-/RLS-logica, migratie op het
echte project) kwamen in een normale week meermaals langs, en het antwoord was
vrijwel altijd ja. De prijs was een halve dag wachten per keer, in een project
met één ontwikkelaar die ook de opdrachtgever is.

## De vertaling, en waarom die nodig was

Quinten formuleerde de grens als *"wat een klant contractueel te horen krijgt of
gefactureerd wordt"*. Die formulering komt uit klantwerk. **GoalBuddies heeft geen
betalende klanten**, dus letterlijk overgenomen is grens 1 leeg en staat er in de
praktijk "vraag nooit iets" — en dan is het geen grens meer maar een afschaffing.

Daarom is hij vertaald naar wat hier hetzelfde gewicht heeft:

- **Een commitment device is het contract van dit product.** Wat een gebruiker te
  horen krijgt als consequentie die hij draagt — inzet, verlies, een straf die
  verschuldigd wordt — is de plek waar een verkeerde aanname een echt mens raakt.
  Domeinregel 5 zegt al dat dit expliciet bevestigd, auditeerbaar en nooit
  stilzwijgend geactiveerd mag zijn; die regel is nu ook de vraaggrens.
- **Geld en externe vastlegging** blijven staan, alleen aan Quintens kant: een
  betaalde tier, een tweede Supabase-project, een betaalde API, een domein, een
  developer-account.
- **Een eerste uitgaande stroom naar echte mensen** die niet terug te nemen is —
  een e-mail of pushmelding naar de hele gebruikersgroep.

Grens 2 vertaalt zichzelf: `drop`, `truncate`, een `delete` zonder filter, een
migratie zonder rollback-pad op een **gevulde** tabel, bulkverwijdering van
gebruikers, `push --force` over andermans werk, een sleutel die je buitensluit.

Uitdrukkelijk níét onomkeerbaar: kolommen toevoegen aan een lege tabel. Rollback
in de kop, doorgaan.

## Wat er bewust níét is weggegooid

Drie van de zeven oude punten waren nooit vragen maar verboden, en zouden bij het
schrappen van de lijst stilzwijgend zijn verdwenen. Ze staan nu apart in
`CLAUDE.md` onder *Wat gewoon verboden blijft*: geen tijdberekening buiten
`shared/time`, geen Vercel-specifieke API, geen `REPLICA IDENTITY FULL` op een
realtime-tabel, geen nieuw systeembericht zonder migratie.

Dat onderscheid is de kern van deze wijziging: **een gate afschaffen is niet
hetzelfde als een regel afschaffen.** De vier die overbleven zijn van gate naar
afweging gegaan — zelf beslissen, maar verantwoorden in een beslisdocument.

## Het risico dat we accepteren

Er is nu geen tweede paar ogen meer vóór een keuze, alleen erna. De rem die
overblijft is de testsuite en dit soort documenten. Dat maakt QS8-116 (de
RLS-suite die in een volle run niets meer bewijst) zwaarder dan hij al was: die
suite ís vanaf nu de review. Zolang hij onbetrouwbaar is, is er geen rem.

Herbevestigen zodra de engineer in november meeleest — dan is er wél een tweede
paar ogen en verandert de afweging.
