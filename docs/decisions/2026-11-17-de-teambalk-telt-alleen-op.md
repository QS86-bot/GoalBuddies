# De teambalk telt alleen op

**Datum:** 17-11-2026 · **Issue:** QS8-655 (epic QS8-650) · **Migratie:** `0306` (voorlopig nummer, botst met productie) ·
**Bouwt voort op:** QS8-654 (`0305`, teamdoelen en aandelen) ·
**Besluiten:** 7, 11, 14 en 16 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| `team_progress_events` | één rij per mijlpaal van een aandeel die voor het eerst gedaan is; geen persoon; geen directe SELECT |
| de vuller | trigger `milestones_teamteller` (na insert of statuswijziging van een mijlpaal) |
| alleen erbij | trigger `team_progress_events_alleen_erbij`: UPDATE en DELETE weigeren, ook voor `service_role`; en `team_progress_events_niet_leeg` tegen TRUNCATE |
| een getelde mijlpaal blijft | trigger `milestones_geteld_blijft`: een mijlpaal die in de teller staat, is niet rechtstreeks te verwijderen |
| de teambalk | `teambalk()`: één getal, of `null` voor wie het teamdoel niet mag lezen |

## Keuzes die hier gemaakt zijn

**1. De twee uitzonderingen op "alleen erbij" herkent de trigger aan de diepte, niet
aan de rol.** Een foreign-keyactie draait zelf als trigger, dus de bewaker zit dan een
niveau dieper (`pg_trigger_depth() > 1`). Wat erdoor mag:
- de mijlpaal verdwijnt: `milestone_id` wordt leeg en verder verandert er niets;
- het teamdoel verdwijnt: de teller gaat mee.

Een rechtstreekse UPDATE of DELETE heeft diepte 1 en weigert, ook van
`service_role`. Het alternatief, geen foreign key op `milestone_id`, laat een id
staan dat nergens meer naar wijst. Dat zegt niets meer, maar is ook niet nodig.

**2. Na vertrek telt een mijlpaal van de vertrokken eigenaar niet meer bij.** De
vuller vraagt dat het aandeel nog aan zijn teamgroep hangt. De vertrek-cascade van
0304 haalt die koppeling weg. Wat er al geteld was blijft staan (besluit 14); wat de
eigenaar daarna aan zijn eigen doel doet, is niet meer van het team.

**3. Elke mijlpaal telt één keer.** Gedaan, terug naar te doen en weer gedaan levert
één rij op (UNIQUE op teamdoel en mijlpaal, `on conflict do nothing`). Een mijlpaal
die op `dropped` gaat, telt niet.

**4. Een getelde mijlpaal blijft staan** (securityreview H1). Zonder die regel kon
één lid de balk onbeperkt opblazen: duizend mijlpalen aanmaken, op gedaan zetten,
weggooien, en dat herhalen. 📏 De review mat 3000 na drie rondes. Het dagplafond op
mijlpalen telt alleen mijlpalen die nog bestaan, en elke verwijdering liet een rij
achter. Nu weigert een rechtstreekse verwijdering van een mijlpaal die geteld is,
ook nadat hij op `dropped` is gezet. Een cascade van het doel of het account mag
wel. Dit volgt domeinregel 6: wat geteld is, is geschiedenis. ⚠️ Voor de gebruiker
betekent het dat hij een gedane stap van een aandeel niet meer kan weggooien; hij kan
hem op `dropped` zetten. Een scherm dat "verwijderen" aanbiedt, hoort dat te weten.

**5. Geen cachekolom.** De telling is een `count(*)` over een index op
`team_goal_id`. Het issue noemt een cachekolom boven ongeveer 10.000 events per
teamdoel. Dat is hier niet gemeten.

## Domeinregel 7

De twee vragen per oppervlak staan in rij 45 van
`docs/decisions/002-domeinregel7-oppervlakken.md`.

⚠️ **Wat er in een klein team toch uit volgt.** Wie zijn eigen mijlpalen kent, kan de
balk daarvan aftrekken; in een team van twee is de rest die van de ander. Wie de RPC
herhaaldelijk aanroept, ziet wanneer de balk stijgt. Dat zijn positieve signalen en
geen tegenslag. Maar besluit 11 zegt dat collega's niet zien hoe ver een ander is, en
dit is daar een smalle afleiding van. Het is inherent aan een teller zonder noemer in
een klein team. Of dat bezwaarlijk is, is niet besloten. Een ondergrens op de
teamgrootte waaronder de balk niet getoond wordt, zou het dichten.

## Wat getest is

`tests/rls/teambalk.test.ts`: 11 tests via PostgREST, met het JWT van elke gebruiker,
over het echte teampad.
- Criterium 6(b): geen van de drie teamtabellen staat in de realtime-publicatie, en
  geen heeft `REPLICA IDENTITY FULL`.
- Criterium 6(c): de balk blijft gelijk na een gemiste week en bij een mijlpaal die
  heen en weer gaat.
- Verder: de lus van de review (aanmaken, gedaan, weggooien) breekt; de balk daalt
  niet als het doel verdwijnt; geen TRUNCATE; na vertrek telt er niets
  meer bij; er zijn geen rechtstreekse wijzigingen; er is geen rechtstreeks lezen;
  een niet-lezer krijgt `null`, net als een verzonnen id.
- Zeven mutaties per grendel met de hand. De uitslag staat in de kop van de test.

## Wat de securityreview vond

- **H1, hersteld:** de balk was onbeperkt op te blazen. Zie keuze 4.
- **L1, hersteld:** `service_role` kon de teller leegmaken met TRUNCATE. Nu weigert
  een statement-trigger dat. Het recht zelf blijft, omdat een bestaande test eist dat
  `service_role` zijn tabelrechten houdt.
- **L2, open:** de uitzondering voor een DELETE kijkt naar de triggerdiepte, niet
  naar wélke foreign key. Vandaag schrijft geen andere functie in deze tabel.
  Wordt zwaarder als: een functie of trigger `team_progress_events` gaat wijzigen of
  verwijderen.
- **L3, open:** de afleiding per persoon in een klein team (rij 45). Wordt zwaarder
  als: QS8-661 de mijlpalen van aandelen afschermt, want dan is de teller de enige
  bron.

## Aannames, niet gemeten

- **Opblazen binnen het dagplafond.** Zonder verwijderen kan één lid nog steeds
  tot het dagplafond op mijlpalen per etmaal stappen aanmaken en afvinken. Die
  stappen bestaan dan wel en zijn voor hem zelf zichtbaar. Een teller zonder noemer
  (besluit 16) kan dat niet onderscheiden van echt werk.

- **Schaal.** De `count(*)` is niet gemeten boven een handvol events.
- **`src/lib/database.types.ts`** kent de nieuwe tabel en RPC nog niet. Hergenereren
  gebeurt bij de uitrol.

## Het pad terug

Zie de kop van de migratie. Zolang er geen tellingen zijn, is alles terug te draaien
zonder gegevensverlies. Met tellingen erin zijn ze niet terug te rekenen.
