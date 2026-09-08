# Een drempel is geen bereik

**08-09-2026.** QS8-339, migratie 0194.

## Wat er stuk was

📏 Gemeten met `pg_get_functiondef()` — de waarheid, niet de migratiebestanden:

```
maak_seizoensrecaps(p_op)              -> for g in select … from groups gr
                                            where gr.status <> 'archived'
slaap_stille_groepen(p_dagen)          -> for r in select id from groups
                                            where status = 'active'
keur_vastgelopen_goedkeuringen_goed(p) -> for v_rij in select * from
                                            vastgelopen_goedkeuringen()
```

Alle drie dragen wél een parameter — en alle drie is dat een **drempel** en geen
**bereik**: een moment, een ouderdom, een termijn. Geen van de drie laat de
aanroeper zeggen wáárover hij mag schrijven.

In productie is dat precies goed: de rollover hóórt over alle groepen te lopen.
In een gedeelde testdatabase is het een `update` zonder `where` op eigenaar.

📏 Gemeten bij QS8-336, nadat élke gedeelde identiteit uit de fixtures weg was:
run B 105/105 groen, run A drie rode tests in `seizoensrecap.test.ts` — tellingen
die te hoog of te laag uitkwamen. Dat is de handtekening van een schrijver die
buiten zijn eigen fixture kleurt, niet van een botsende sleutel.

## Het waren er drie en niet één

Het issue noemde `maak_seizoensrecaps()`, en waarschuwde erbij: *repareer niet
alleen dít geval als de lijst er vijf noemt.* 📏 Nageteld tegen
`tests/rls/nevenschade.test.ts`:

| Functie | Bereik? |
|---|---|
| `herstel_weekdoelstatus(p_goal_id)` | ✅ sinds 0137 |
| `weekdoelstatus_afwijkingen(p_goal_id)` | ✅ sinds 0137 |
| `maak_seizoensrecaps(p_op)` | ❌ |
| `slaap_stille_groepen(p_dagen)` | ❌ |
| `keur_vastgelopen_goedkeuringen_goed(p_termijn_dagen)` | ❌ |

⚠️ De 21 functies zónder parameter die ook schrijven, zijn op één na
triggerfuncties — die draaien per rij en zijn door de rij begrensd. De
uitzondering is `verwijder_mijn_account()`, en die is begrensd door `auth.uid()`.

## De keuze

| Richting | Oordeel |
|---|---|
| **1.** De job een optioneel bereik geven | ✅ **Gebouwd.** Zelfde vorm als 0137. `default null` = alle groepen, dus de rollover verandert geen letter. |
| **2.** De test de job per groep laten aanroepen | ⚠️ Goedkoper, maar dan toetst de test niet meer wat de job in productie doet — regel 18 vraag 2. De belofte is *"de job schrijft niet buiten zijn bereik"*, en dat is een eigenschap van de job. |

⚠️ **Een `drop` en geen `create or replace`, en dat kan niet anders:** een
parameter toevoegen maakt een andere handtekening, en `or replace` zou er een
overload naast zetten. Dan bestaan beide vormen naast elkaar en kiest Postgres er
per aanroep één.

⚠️⚠️ **En die `drop` sloeg meteen een gat.** `create or replace` behoudt grants;
`drop` + `create` niet, en `alter default privileges` deelt élke nieuwe functie in
`public` uit aan `anon`, `authenticated` én `service_role`. 📏 Gemeten vlak na het
afspelen:

```
maak_seizoensrecaps                  anon=true auth=true service=true
slaap_stille_groepen                 anon=true auth=true service=true
keur_vastgelopen_goedkeuringen_goed  anon=true auth=true service=true
```

Zonder het revoke-blok kon élke ingelogde gebruiker — en zelfs een bezoeker
zonder sessie — `maak_seizoensrecaps()` aanroepen en systeemberichten in álle
groepen laten plaatsen. Onwrikbare regel 4 bestaat voor precies dit geval. Na het
blok: `anon=false auth=false service=true`, alle drie.

## De ijking

Drie grendels, drie aparte mutaties op de **gedeployde** functie, elk vooraf met
een `pg_get_functiondef()`-controle bevestigd.

| Mutatie | Wat er rood werd |
|---|---|
| het bereik uit `maak_seizoensrecaps()` | **1** — precies zijn eigen bereikstest |
| het bereik uit `slaap_stille_groepen()` | **1** — idem |
| het bereik uit `keur_vastgelopen_goedkeuringen_goed()` | **1** — idem |

### Twee van de drie waren eerst groen om de verkeerde reden

⚠️⚠️ **En dat is het nuttigste van deze ronde.** Bij de eerste ijking maakte het
weghalen van het bereik uit `slaap_stille_groepen()` **nul** tests rood.

📏 De oorzaak: de functie rekent met `greatest(1, coalesce(p_dagen, 30))`, dus
`p_dagen: 0` is gewoon **één dag** — en een verse testgroep heeft
`last_activity_at = now()`. De **ouderdom** hield hem tegen, niet het bereik. De
test zette daarna eerst `last_activity_at` terug naar 2026-01-01.

Hetzelfde bij `keur_vastgelopen_goedkeuringen_goed()`: die eist
`p_termijn_dagen >= 1` en de fixture is vers, dus élke geldige termijn hield hem
al tegen. De test zet nu eerst `completions.submitted_at` terug.

⚠️ **De vorm van deze fout is dezelfde als bij 0192**, één dag eerder: een test
die groen staat doordat een ándere grens hem afvangt, en die dus niets bewaakt
van wat zijn naam belooft. Het patroon is inmiddels herkenbaar genoeg om het
vooraf te vragen: *welke grens vangt dit geval af vóór de grens die ik toets?*

## Wat de security-review erop aanmerkte

Blokkerend, en terecht. Zes bevindingen, alle zes zelf nagemeten.

**1. De twee nieuwe fixture-mutaties zetten twee bestáánde tests uit.** De
bereikstests zetten `groups.last_activity_at` en `completions.submitted_at` ver
terug om hun eigen grens open te zetten — en zetten ze niet terug. De
`beforeEach` herstelde alleen `weekly_goals.status`. 📏 Met geschudde
testvolgorde:

```
seed 1  2 rood      seed 4  2 rood
seed 2  2 rood      seed 5  2 rood
seed 3  8 groen     seed 6  2 rood
```

Steeds dezelfde twee, en het zijn precies de tests *"slaap_stille_groepen laat
een verse groep wakker"* en *"keur_vastgelopen_goedkeuringen_goed laat een verse
voltooiing met rust"* — die leunen erop dat de fixture vers is.

⚠️⚠️ **En boven allebei stond al opgeschreven dat dit zou gebeuren.** Woordelijk:
*"Wordt zwaarder als: een bestand `last_activity_at` terugzet en daarna
ongescopeerd laat slapen"* en *"Wordt zwaarder als: een bestand
`completions.submitted_at` terugzet én een weekdoel op `pending` laat staan
zonder beoordelaar."* Deze branch deed beide dingen, in hetzelfde bestand, en
liep dwars langs beide aantekeningen.

Dat is letterlijk de CLAUDE.md-regel: *vraag bij elke nieuwe beslissing die op
een bestaande primitieve handeling leunt — staat daar een weggelegde bevinding
over?* Er stond er een. Beide velden staan nu in de `beforeEach`, beide
aantekeningen zijn bijgewerkt met wat er gebeurd is, en 📏 alle zes seeds zijn
groen.

⚠️ Het pijnlijke deel is wáár het gebeurde: dit is het bestand dat moet bewaken
dat de ene test de andere niet vervuilt.

**2. De bereikstest van `maak_seizoensrecaps` verliep op de kalender.** Hij
gebruikte een vaste `p_op` in Q4 2026 terwijl de fixture `now()`-relatief is;
vanaf begin november 2026 vallen de fixtureweken buiten dat seizoen, valt de
groep in de stil-tak, en is de test groen mét of zónder bereik. Dezelfde fout die
de buurtest al een keer had.

De reparatie is geen betere datum maar een andere vorm: **de test bewijst nu
eerst zijn eigen voorwaarde** — hij draait één keer mét de vreemde groep in het
bereik en eist dat er dan wél een recap komt. Staat de grens dicht, dan valt hij
luid om in plaats van stil te slagen.

**3. Een onware regel in `docs/ENGINEER-REVIEW.md`.** Zie de correctie onderaan
"Wat hier niet in zit": `rpc:controle` bestáát.

**4. Het commentaar op alle drie de functies was weg.** `pg_get_functiondef()`
geeft het lichaam maar niet de `comment on function`, dus wie een functie uit die
uitvoer herbouwt, verliest hem stilzwijgend — dezelfde val als bij de grants, één
laag dieper. 📏 Alle drie `<GEEN COMMENT>` waar `main` er drie had, en het zijn
juist de zinnen die de autorisatie-intentie uitspreken (*"Alleen voor de
rollover; nooit voor een client"*). Teruggezet, letterlijk uit 0158, 0016 en 0135.

⚠️ Niets kón dit melden: `functies:controle` is de enige controle die commentaar
met productie vergelijkt, en die stond op OVERGESLAGEN wegens een ontbrekende
productiesleutel.

**5. Het rollback-pad noemde 0147 maar niet 0135.** 0147 draagt alleen de
`revoke`; de `grant` en de `comment` staan in 0135. 📏 Het pad letterlijk
uitgevoerd op een herbouwde main-database: `svc=t auth=f <GEEN COMMENT>` — het
recht komt dan via de default privileges terug in plaats van via een besloten
grant, precies de klasse die regel 4 wil uitsluiten.

**6. Het 📏-recept in de kop miste zijn eigen antwoord.** Het opgeschreven
`grep`-commando zoekt `create or replace function public.<naam>` en geeft voor
`slaap_stille_groepen` nul treffers: 0016 schrijft hem zonder schemaprefix. De
drie antwoorden klopten, het recept niet — en een recept dat zijn eigen antwoord
mist is erger dan geen recept, zeker in een kop die het 0192-incident aanhaalt.
Ook het getal "21 parameterloze schrijvers" reproduceerde onder geen enkele
telwijze (12, 18 of 36); de conclusie bleef staan, het getal is eruit.

## Wat hier niet in zit

* **QS8-348 — drie andere oorzaken van kruisbesmetting.** 📏 Twee gelijktijdige
  volledige runs ná 0194: de `seizoensrecap`-fouten zijn weg, maar er blijven er
  drie over met andere oorzaken — een botsende `groups_invite_code_key`, een
  gedeelde rij in `lidmaatschapsgrens.test.ts` en een gedeelde teller in
  `uitnodigingslimiet.test.ts`.

  ⚠️ **Acceptatiecriterium 3 van QS8-339 is daarmee niet gehaald, en dat hoort
  hier te staan in plaats van weggeschreven te worden.** Wat wél gehaald is: de
  oorzaak die dit issue benoemt en meet, is dicht en staat onder test. 📏
  Nagemeten dat de drie resterende er los van staan — geen van de drie
  testbestanden roept een van deze drie functies aan, en geen van de drie is op
  deze branch aangeraakt.

  ⚠️ De eerste van die drie is buiten de tests óók een bug: twee échte
  gebruikers kunnen dezelfde uitnodigingscode krijgen.

* **De gegenereerde types.** `src/lib/database.types.ts` kent `p_group_ids` en
  `p_owner_ids` nog niet: `npm run types:db` genereert uit **productie**, en daar
  staat 0194 nog niet. Ze volgen bij de eerstvolgende generatie ná de deploy.
  ⚠️ Opgemerkt onderweg: `typecheck` accepteerde de nieuwe argumenten tóch, dus
  de types bewaken deze aanroep niet.

  ⚠️⚠️ **Hier stond erbij "een `.rpc()` met een onbekend argument wordt niet
  rood", en dat is onwaar** — gecorrigeerd na de security-review. Hij wordt wél
  rood, alleen niet door de typecheck: `rpc:controle` draait mee in de poort en
  📏 vindt het geval meteen, met bestand, regel en de bestaande parameternamen
  erbij. De les is dezelfde als bij het rollback-pad hierboven: **"ik heb het
  niet zien afgaan" is niet hetzelfde als "er is geen grendel"**, en het verschil
  is precies één commando.
