# De groepsroute is geen uitweg, maar het akkoord was blind

**08-09-2026, besloten en gebouwd 09-09-2026.** QS8-370, migratie 0213.

## De bevinding

Migratie 0184 (QS8-317) zette een rem op `zet_streefdatum()`: een straf die op
`set` staat, laat de streefdatum niet vooruit schuiven. Zonder die rem toetst
`maak_straffen_verschuldigd()` een datum die de gestrafte zelf zet, en dan is
domeinregel 11 leeg.

QS8-370 merkt op dat `beslis_deadline_verzoek()` diezelfde rem niet draagt.
📏 Nagemeten op de lokale stack met echte JWT's:

```
Alice vraagt een verschuiving op een doel met een straf op `set`
  -> {"ok": true}                  het verzoek ontstaat
Bob keurt goed
  -> {"ok": true, "moved": true}   de datum schuift vooruit
```

En het lid dat goedkeurt ziet de straf niet: 📏
`commitment_zichtbaar_voor_groep()` geeft `unlocked, due, resolved`, dus een
straf op `set` valt buiten zijn blik.

## ⚠️⚠️ Waarom dit geen bug is die je even dichtzet

Ik heb de voor de hand liggende reparatie gebouwd — dezelfde toets in
`vraag_deadline_verschuiving()` en in `beslis_deadline_verzoek()` — en de
bestaande suite wees hem af. Dat is de meting die dit document draagt.

**📏 Tien bestaande tests werden rood, en ze bewaken allebei de helften die de
reparatie sloopt:**

* `tests/rls/straf-plafond.test.ts` — *"een open verzoek houdt de straf tegen"*.
  Dat is 0174/0175 (QS8-307): een gebruiker met een straf **mag** een
  verschuiving vragen, en zolang dat verzoek open staat is de straf gepauzeerd —
  de groep krijgt een week om te beslissen. Een toets in
  `vraag_deadline_verschuiving()` maakt dat mechanisme onbereikbaar voor precies
  de doelen waarvoor het gebouwd is.

* `tests/rls/straf-plafond.test.ts` — *"en een goedgekeurde verschuiving laat de
  straf gewoon met rust"*, met zoveel woorden gemarkeerd als **must-allow**. Die
  test keurt een verschuiving goed op een doel met een straf op `set`, verwacht
  `ok: true`, en verwacht daarna dat de straf blijft staan zonder af te gaan.

**De groepsroute is dus geen vergeten achterdeur maar de aangewezen weg.** 0184
zegt dat zélf: de rem staat daar ná `needs_group_approval` omdat *"bij een
gekoppeld doel de route via `vraag_deadline_verschuiving()` wél bestaat en de
gebruiker díé hoort te lezen"*.

## Wat er dan wél scheef staat

Niet **dát** de datum langs de groep verschuift — dat is besloten. Wat scheef
staat is dat het akkoord **niet geïnformeerd** is: de goedkeurder ziet de straf
niet, dus hij weet niet dat hij een commitment device losser maakt.

Domeinregel 5 zegt dat een consequentie expliciet bevestigd en auditeerbaar moet
zijn en nooit stilzwijgend geactiveerd. De spiegelzijde — niet stilzwijgend
ge-de-activeerd, en al helemaal niet door iemand die niet ziet waar hij ja tegen
zegt — staat er niet, en dat is precies het gat.

## De vier richtingen, en waarom de keuze niet aan Claude was

De vier richtingen uit QS8-370, met wat de meting erover zegt:

| | Richting | Meting |
| -- | -- | -- |
| 1 | toets in `beslis_deadline_verzoek()` | breekt de must-allow van `straf-plafond.test.ts` |
| 2 | toets in `vraag_deadline_verschuiving()` | breekt het pauzemechanisme van 0174/0175 |
| 3 | de goedkeurder de straf laten zien | lost de kern op, en opent een nieuw groepszichtbaar oppervlak — ⚠️ níet door `commitment_zichtbaar_voor_groep()` te verruimen, zie hieronder |
| 4 | niets doen, vastleggen | laat het ongeïnformeerde akkoord staan |

Richting 1 en 2 zijn niet "strenger maken" maar **een belofte intrekken**: vandaag
is "je buddy kan een verschuiving goedkeuren" onderdeel van de afspraak, en die
weghalen maakt de straf strenger dan waar de gebruiker ja tegen zei. Dat is
beslisbevoegdheid **grens 1** — de keuze bepaalt wat er tegen een mens beloofd is
over een consequentie die hij draagt.

Richting 3 is dat óók, van de andere kant: het verandert wat de groep over jouw
commitment te zien krijgt, en dat is bovendien een nieuw groepszichtbaar
oppervlak onder domeinregel 7 — waar de standaard "beschermd" is tot iemand het
tegendeel besluit.

Richting 4 is een besluit en geen niets-doen: het legt vast dat een groepsakkoord
zwaarder weegt dan de rem van 0184, ook als het blind gegeven is.

**Alle vier vragen ze dus hetzelfde soort besluit, en dat hoort bij Quinten.**

## Het besluit

**Richting 3, en breder dan het issue hem stelde.** Quinten, 09-09-2026:
*"Iedereen van de groep mag de straf zien"* — niet alleen degene die toevallig op
de knop drukt.

De prijs staat er tegenover en is niet klein: **wie om uitstel vraagt, laat zijn
straf zien aan de groep die hij het vraagt.** Dat is een echte kost voor de
aanvrager en de reden dat het aanvraagscherm het zégt vóór de verzendknop
(`deadline.straf_wordt_zichtbaar`). Domeinregel 5 verbiedt een consequentie die
stilzwijgend aan gaat; dit is er een.

### Wat er gebouwd is

Een vierde tak in `commitments_select` (migratie 0213): **een groep die om
uitstel op dit doel gevraagd is, leest de straffen op dat doel.** Plus
`gevraagd_om_uitstel_op(uuid)`, een `security definer`-helper die de vraag aan
`mag_groep_lezen()` stelt, en een index op `deadline_requests (goal_id)`.

Aan de app-kant twee regels tekst en de query die ze voedt: het groepsscherm
haalt met één vraag op welke doelen in de verzoekenlijst een straf dragen
(`fetchStrafDoelen()`, regel 12), en het doelscherm waarschuwt de aanvrager. De
grens die bepaalt wanneer die waarschuwing verschijnt staat in
`wordtZichtbaarBijUitstelverzoek()` en niet in de JSX, om dezelfde reden als bij
`magStrafVastleggen()`: een vergelijking in een scherm is alleen te toetsen door
in dat scherm te zoeken, en zo'n test verhuist niet mee.

### ⚠️ Waarom dit `commitment_zichtbaar_voor_groep()` níet verruimt

Het issue schreef richting 3 op als *"dit verruimt `commitment_zichtbaar_voor_groep()`
met `set`"*. 📏 De meting zegt dat dat het gat niet dicht doet **en** tegelijk te
ver gaat:

* **Te weinig.** Die lijst geldt voor de **begunstigde** groep. De groep die
  beslist is `deadline_requests.group_id`, en die hoeft de begunstigde niet te
  zijn — `vraag_deadline_verschuiving()` eist alleen een koppeling via
  `goal_group_links`. En de straffen in `straf-plafond.test.ts` hebben helemaal
  geen groep als begunstigde maar een **persoon**; daar helpt geen van beide
  bestaande takken.
* **Te veel.** Élke begunstigde groep zou élke straf zien vanaf het moment dat
  hij vastgelegd wordt, ook zonder dat er ooit iets gevraagd is.
* **En een derde reden, aantoonbaar:** `verwijder_doel()` leest diezelfde lijst
  voor de weigering `commitment_in_werking`. Sinds 0190 vangt een látere tak daar
  élke commitment af met `heeft_commitment`, en die twee redenen hebben elk hun
  eigen zin in de catalogus. `set` aan de lijst toevoegen verandert dus stil de
  melding die iemand krijgt die zijn verse doel weggooit — naar "je straf is al
  in werking getreden", en dat is niet waar.

### ⚠️ Elk verzoek telt, niet alleen een open verzoek

Een oppervlak dat dichtklapt zodra er beslist is, neemt de beslisser het zicht af
op wat hij zojuist heeft toegestaan — het tegendeel van "auditeerbaar" uit
domeinregel 5. Vandaar dat `gevraagd_om_uitstel_op()` niet op `status = 'open'`
filtert. Dat is ook de kant die je bij het bouwen niet vanzelf raakt: elk
onderdeel klopt op het moment van drukken.

### ⚠️ En geen statuslijst

De tak kent `type = 'penalty'` en verder niets. Wie de straf op `set` mag zien,
mag hem ook zien nadat hij afgaat of ingetrokken wordt; een tweede lijst om
synchroon te houden levert hier niets op. De client draagt exact dezelfde grens,
en dat is geen netheid maar de naad: een waarschuwing die smaller is dan het
oppervlak dat hij aankondigt, is geen waarschuwing.

### Wat er níet gebouwd is

**Geen rem in `beslis_deadline_verzoek()` en geen rem in
`vraag_deadline_verschuiving()`.** Zie de tabel hierboven: allebei breken ze
bestaande must-allows. De groepsroute blijft dus doen wat 0184 haar laat doen —
alleen niet meer blind.

**Geen toets op `goals.status`** (acceptatiecriterium 3), en dat is een meting en
geen omissie; zie de laatste paragraaf van dit document.

## Wat er wél gemeten is en blijft staan

📏 **Een toets op `goals.status` is niet nodig voor deze belofte.**
`maak_straffen_verschuldigd()` filtert zelf al op `g.status <> 'completed'`, dus
een straf op een afgerond doel gaat nooit af — de datum ervan verschuiven is geen
ontsnapping. Dat beantwoordt acceptatiecriterium 3 met een meting.

⚠️ **`archived` staat níét in dat filter, alleen `completed`.** Een straf op een
gearchiveerd doel wordt dus wél verschuldigd. Wie ooit `archived` aan dat filter
toevoegt, verandert daarmee stil de reikwijdte van elke redenering hierboven.
