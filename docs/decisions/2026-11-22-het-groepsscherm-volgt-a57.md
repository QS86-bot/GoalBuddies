# Het groepsscherm volgt A57 — QS8-666, deel 3b-1

Datum: 22-11-2026. Geen migratie. Quinten koos (22-11-2026, via de orchestrator) om 3b in twee PR's na elkaar te splitsen: dit is
**3b-1**, het groepsscherm volgens A57 (visueel voorstel V3, optie A van 20-11-2026: een beschermde groep toont de volledige lijst);
3b-2 is de uitnodigingskaart zonder wegklikknop (wegklikken per beheerder is QS8-784). Deze PR bouwt voort op #790 (3a).

## Wat er gebouwd is
- `klassementPlek(uitkomst)` beslist wat er op de plek van het klassement staat: `lijst`, `fout` of `niets`. **De uitkomst van de RPC beslist,
  niet een vlag op de groep**: het scherm kent de regel van A57 niet; `groep_klassement()` is de poort (0333: actief lid, schakelaar, geen teamgroep).
  De functie staat in `src/modules/buddies/klassement-poort.ts` zonder enige import, zodat een toets hem zonder `react-native` kan laden.
- De rij "Op deze pagina" had één vlag, `open`, voor het klassement én de helden. Dat was voor A57 waar (allebei alleen in een open groep) en
  is het niet meer: `groepInhoud({ klassement, helden, kanUitnodigen })`. `klassement` hangt aan `klassementPlek() === 'lijst'`, dus de rij noemt het
  klassement precies als de kaart er staat; `helden` blijft aan `zichtbaarheid === 'open'` en geen teamgroep (besluit 22 van de organisaties).
- De commentaren in het scherm die nog zeiden dat een beschermde groep nul rijen geeft, zijn naar A57 gezet.
- Besluit 2 van V3 (de heldenlijst verdwijnt als een open groep beschermd wordt) vraagt geen codewijziging: de heldenlijst hing al aan de zichtbaarheid (0268).

## Toetsing
`tests/beloftes/groepspagina-inhoud.test.ts` legt de rij naast het scherm (de pagina geeft `klassementPlek(...) === 'lijst'` door en niet de
zichtbaarheid) en `src/modules/buddies/klassement-plek.test.ts` toetst de drie standen. Met de hand gebroken: `klassement:` terug aan de
zichtbaarheid hangen -> de paginatoets valt om; de lengtetoets omdraaien -> twee plektoetsen vallen om; de fouttak weghalen -> de foutstand valt om.

## Aannames
- Een databasetoets voor deze PR is er niet: er is hier geen nieuwe poort, het scherm toont wat de bestaande RPC geeft. De naad (kaart tegenover poort)
  komt met 3b-2, waar de uitnodigingskaart afhangt van wat de database zou accepteren.
- Niet gemeten: het uiterlijk op een toestel. De schermafdrukken (390 en 1280, navy en navy-licht) gaan naar Quinten vóór de merge.
