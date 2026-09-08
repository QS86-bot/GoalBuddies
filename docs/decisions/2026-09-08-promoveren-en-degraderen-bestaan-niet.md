# Promoveren en degraderen bestaan niet

**08-09-2026.** QS8-356. Migratie `0198`.

## Wat er stuk was

`guard_group_member_update()` (0187) doet voor een **actieve beheerder** een
vroege `return new` en toetst daarna niets meer.

📏 Gemeten met echte JWT's, elk in een eigen groep:

| Handeling door een actieve beheerder | Uitkomst | Spoor |
|---|---|---|
| een ánder lid tot `admin` promoveren | landde | **geen** |
| een mede-beheerder — óók de oprichter — naar `member` degraderen | landde | **geen** |
| iemand anders op `paused` zetten | landde | **geen** |
| een uitgezet lid terug op `active` | landde | alleen dat van de úitzetting |

⚠️⚠️ **De overnameroute is de zwaarste.** De `last_admin`-grendel toetst
`old.user_id = auth.uid()` — **alléén jezelf**. Een tweede beheerder kon daarmee
de oprichter degraderen, en 📏 er is geen weg terug: één treffer op `set role` in
álle functiedefinities, en die zit in de overdracht van `verlaat_groep()`. Geen
RPC, geen scherm.

## Waarom dit geen `revoke` was

Bij QS8-351 stond `group_members` UPDATE op de intreklijst van 0197. 📏 Die
revoke maakte **21 bestaande tests in zeven bestanden** rood; alleen die ene
grant teruggeven maakte alle 100 weer groen.

Dit pad heeft een doel: 0102 en 0187 zijn er juist voor gebouwd, en de
audittrigger schrijft een spoor *"ook bij een uitzetting buiten de RPC om"*.
Intrekken maakt de guard onbereikbaar en heel QS8-314 inhoudsloos. **Een recht
zonder aanroeper in de app is iets anders dan een recht zonder doel.**

## De val: de trigger vuurt óók voor SECURITY DEFINER

⚠️⚠️ **`auth.uid()` blijft binnen een definer-functie de aanroeper.** Dus
`verwijder_lid()`, `verlaat_groep()` en `beslis_lidmaatschapsverzoek()` lopen
door precies dezelfde beheerderstak als een rechtstreekse PATCH. Een grendel die
alleen kijkt naar *wat* er verandert, breekt ze alle drie.

Vandaar twee benoemde uitzonderingen, in de vorm die `join_group_with_code()` al
gebruikte — `set_config(..., true)`, dus `set local`, geldig binnen één
transactie:

| Sleutel | Voor |
|---|---|
| `app.beheer_overgedragen` | de rolwijziging in `verlaat_groep()` |
| `app.lidmaatschap_besloten` | de terugkeer in `beslis_lidmaatschapsverzoek()` |

⚠️ `verwijder_lid()` heeft er geen nodig: uitzetten is `* → inactive`, dat blijft
een beheerdershandeling, en het schrijft al een spoor.

## Het besluit: het pad gaat weg, niet de audit erbij

Acceptatiecriterium 6 liet twee wegen open: het rechtstreekse pad weg, óf een
`group_events`-rij per rolwijziging. **Het pad gaat weg**, en dat is de
conservatiefste keuze die het werk áf maakt:

* 📏 er is vandaag geen scherm en geen RPC die een rol zet, dus er verdwijnt
  niets dat bestaat;
* criterium 7 vroeg om een weg terug uit een degradatie — die is er niet, en met
  dit besluit is hij ook niet nodig, want degraderen kan niet meer;
* **een auditregel om een handeling die niemand ontworpen heeft, legitimeert die
  handeling.** Beschermd is het antwoord tot iemand het tegendeel besluit.

Wie promoveren alsnog wil, bouwt er een RPC voor met een `group_events`-rij en
een systeembericht — en dat laatste vraagt een migratie, want
`chat_messages_system_event_bekend` is een allowlist.

## De `null`-val die de eerste versie stil doorliet

📏 De eerste versie schreef de twee uitzonderingen zo:

```sql
v_overdracht := nullif(current_setting('app.beheer_overgedragen', true), '') = old.group_id::text;
```

Een ongezette sleutel geeft `null`, en `null = <tekst>` is **`null`** en niet
`false`. Daarmee wordt `not (v_overdracht or v_besluit)` ook `null`, vuurt de
`if` niet, en laat de guard alles door. 📏 Gemeten: met de drie nieuwe regels
erin bleven de promotie, de degradatie en het terugzetten gewoon landen — alleen
de `paused`-toets werkte, want die raakt de sleutels niet.

⚠️⚠️ **Dezelfde uitdrukking staat drie regels hoger in `v_toegestaan` van
`join_group_with_code()` zónder `coalesce`, en dáár is dat veilig** — die waarde
staat aan de *toelaat*-kant, dus `null` betekent "niet toegelaten". Hier staat hij
aan de *weiger*-kant en betekent `null` "niet geweigerd".

**Dezelfde regel, tegengesteld gevolg.** Dat is de reden dat de `coalesce` er nu
met een toelichting staat en niet als vanzelfsprekendheid: wie hem kopieert van
boven naar beneden, kopieert een gat.

## De teller van de sleutels meldde zichzelf

⚠️ `sleutelzetters()` (0153) is een register van `app.`-sessiesleutels met de
functies die ze mogen zetten, en zijn derde tak meldt *"een sleutel die in geen
enkel register staat"*. 📏 Deze migratie maakt er twee, en twee bestaande tests —
in `stille-weigering.test.ts` en `archief-leesbaar.test.ts` — werden rood zonder
dat iemand ze had aangeraakt.

Zo hoort een grendel zich te gedragen, en het is precies waarvoor 0153 hem
neerzette: *een nieuw bypass-mechanisme zonder eigen teller zou de uitzondering
zijn.* Beide sleutels staan nu met hun eigen regel in dat register.

## De ijking — vijf grendels, vijf mutaties

📏 Elke regel apart uitgeschakeld, de suite gedraaid, en teruggezet. Vóór en na:
9 groen.

| Mutatie | Uitslag |
|---|---|
| `rol_van_een_ander` uitgeschakeld | 📏 2 rood |
| `lid_teruggezet` uitgeschakeld | 📏 1 rood |
| `pauze_van_een_ander` uitgeschakeld | 📏 1 rood |
| de `coalesce` op `app.beheer_overgedragen` naar `null` | 📏 2 rood |
| de vroege `return new` voor de eigen rij weg | 📏 1 rood |

⚠️⚠️ **Die laatste was eerst 0 rood, en dat was de belangrijkste uitkomst van de
ijking.** Het betekende niet dat die regel overbodig is, maar dat níets toetste
wat hij doorlaat: een beheerder die zijn éigen beheerderschap opgeeft terwijl er
een tweede beheerder is — wat `last_admin` met zoveel woorden toestaat. Zonder de
vroege uitgang zou `rol_van_een_ander` dat alsnog weigeren.

**Een mutatie die niets rood maakt is een bevinding.** Hier was de bevinding geen
overbodige regel maar een ongetoetste; er staat nu een must-allow op.

## Vier bestaande tests promoveerden iemand als opstelling

Het weghalen van de promotiehandeling raakte vier tests die haar als
**scaffolding** gebruikten: `lidmaatschapsgrens`, `veiligheid` (twee keer) en
`lidmaatschapsbesluit`. Alle vier maakten met een client-PATCH iemand beheerder
om daarna iets ánders te toetsen. Ze lopen nu langs `adminDb()`, met de reden
erbij.

⚠️ Eén ervan is inhoudelijk aangepast en niet alleen qua weg:
`lidmaatschapsgrens` bewees "de beheerder komt bij de rij van een ander" door die
ander op `paused` te zetten. Dat is precies een van de vier handelingen die nu
geweigerd worden. De test zet nu `inactive` — hetzelfde bereik, maar met een
handeling die wél ontworpen is.

## Twee opzetfouten in de nieuwe testsuite

📏 Allebei gevonden doordat de tests rood waren om de verkéérde reden, en allebei
dezelfde vorm: **een opruimstap achter een assertie is geen opruimstap.**

De eerste opzet deelde één groep en herstelde de toestand met `adminDb()` ná de
assertie. Vóór de reparatie faalt die assertie juist — dus het herstel liep
nooit, de degradatie uit test 2 bleef staan, en de tests daarna vielen om op
`not_admin` in plaats van op wat ze zeggen te meten. Nu krijgt elke destructieve
test **zijn eigen groep**; die volgorde-afhankelijkheid bestaat dan niet.

Dezelfde klasse in `rechten-zonder-aanroeper.test.ts`: de uitzet-test zette bram
uit de groep, en een uitgezet lid ziet zijn eigen rij niet meer. 📏 De roltest
eronder raakte daarna nul rijen, kreeg géén fout en was groen om precies de
verkeerde reden. Die test heeft nu een eigen onderwerp.

## Drie dingen die onderweg fout gemeten waren

* 📏 `verlaat_groep()` heeft een derde argument `p_nieuwe_beheerder`; zonder dat
  geeft hij `last_admin` en meet de must-allow niets.
* 📏 `vraag_lidmaatschap_aan()` eist `groups.ontdekbaar`, en die kolom eist via
  `groups_ontdekbaar_heeft_categorie` óók een `categorie`.
* 📏 De statuskolom van `group_join_requests` heet `pending` en niet `open` — dat
  stond in de default van de kolom.

Alle drie waren fouten in de **opzet** en niet in de code, en alle drie gaven een
rode test met een melding die naar de verkeerde plek wees.
