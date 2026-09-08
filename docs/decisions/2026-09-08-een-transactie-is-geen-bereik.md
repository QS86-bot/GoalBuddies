# Een transactie is geen bereik

**08-09-2026.** QS8-348.

## Wat er stuk was

📏 Twee volledige RLS-suites tegelijk op dezelfde lokale stack gaven allebei
rode tests — en **niet elke keer dezelfde**. Twee metingen op dezelfde code:

```
ronde 1   run A  3 rood (lidmaatschapsgrens ×2, uitnodigingslimiet)
          run B  1 bestand rood (lidmaatschapsbesluit, in de opbouw)

ronde 2   run A  1 bestand rood (lidmaatschapsbesluit)
          run B  3 rood (alleenlezen, seizoensrecap-per-groep ×2)
```

⚠️ **Die wisseling is zelf de belangrijkste meting.** Het issue noemde "drie
oorzaken" op grond van één waarneming; er zijn er meer, en welke je ziet hangt af
van hoe de twee runs langs elkaar schuiven. Een lijst uit één run is een
steekproef, geen inventaris.

## De vier oorzaken

**1. Een vaste `invite_code` in een fixture.** `lidmaatschapsbesluit.test.ts` zet
tien groepen neer met `BF0000` t/m `BF0009`, en `groups_invite_code_key` is uniek
over de hele tabel. Twee runs botsen daar **deterministisch** op, in de opbouw,
dus het hele bestand valt om.

⚠️⚠️ **Dit is géén botsing in `generate_invite_code()`, en die correctie hoort
hier te staan** — het issue vermoedde van wel en dat was onjuist. 📏 Die functie
trekt twaalf tekens uit een alfabet van dertig met `gen_random_bytes`; 30¹² ≈
5·10¹⁷, dus een toevallige botsing tussen twee runs is geen redelijke verklaring.
De code kwam uit de fixture. **Er is dus ook geen productiebug**, anders dan het
issue veronderstelde.

Opgelost met `proefCode()` naast het bestaande `proefId()` — zelfde prefix per
run, zelfde reden.

**2. Een tweede bestand riep de globale job nog ongescopeerd aan.** QS8-339 gaf
`maak_seizoensrecaps()` een bereik en scoopte `seizoensrecap.test.ts`;
`seizoensrecap-per-groep.test.ts` bleef achter met vier ongescopeerde aanroepen.

⚠️ **Dat bestand draait binnen `begin … rollback`, en dat leek genoeg.** Het is
het niet: een transactie isoleert wat *deze* transactie schrijft, niet wat de
functie in de rijen van een andere run aanricht. **Een transactie is geen
bereik** — vandaar de titel.

**3 en 4. Twee assertions telden een hele tabel.** `alleenlezen.test.ts` telde
alle rijen vóór en ná een geweigerde insert (📏 `expected 3 to be 6` op `groups`),
`uitnodigingslimiet.test.ts` deed hetzelfde op `invite_preview_limits` (📏
`expected 1 to be 2`). Allebei melden ze dan een lek dat er niet is.

⚠️ **De reparatie maakt ze niet alleen run-veilig maar scherper.** `alleenlezen`
telt nu op de rij die het probeerde in te voegen — dat toetst dat **déze** rij
niet geland is, in plaats van dat de tabel toevallig even groot bleef. Elke
`nieuweRij` in dat bestand is opgebouwd uit id's van de eigen run, dus hij wijst
nooit naar andermans rij.

⚠️ Bij `uitnodigingslimiet` bleef de vraag: bewaakt een gescopeerde telling nog
wel de belofte *"geen rij voor een code die niet bestaat"*? 📏 Nagemeten:
`invite_preview_limits.group_id` is de primaire sleutel, `not null`, met een
foreign key naar `groups`. Een rij voor een onbekende code is dus niet te
sleutelen; zou de `insert` vóór de bestaanstoets staan, dan werpt hij op die
`not null`. De test eist daarom nu ook expliciet dat `bekijk()` `null` teruggeeft
— dáár zou dat geval landen, en niet in een teller.

## Wat er níét in zit

* **`lidmaatschapsgrens.test.ts`** viel in ronde 1 om (`expected undefined to be
  'P0001'`) en in ronde 2 niet, en is bij deze reparaties niet meer teruggekomen
  — ook niet in twee bevestigende rondes. Er is dus **geen oorzaak vastgesteld**,
  en dat is met opzet zo opgeschreven in plaats van hem stilzwijgend afgevinkt te
  laten worden door een groene run. 🗣 Komt hij terug, dan is de eerste vraag of
  bobs lidmaatschapsrij er nog was: `expected undefined` betekent nul geraakte
  rijen, niet een zwijgende trigger.

## De uitkomst

📏 Twee volledige suites tegelijk, twee keer achter elkaar gemeten:

```
ronde 1   A  108 bestanden, 1250 groen, 1 overgeslagen
          B  108 bestanden, 1250 groen, 1 overgeslagen
ronde 2   A  1250 groen | B  1250 groen
```

Daarmee is het acceptatiecriterium gehaald dat bij QS8-339 bleef staan.

⚠️ **Twee groene rondes zijn geen bewijs dat er niets meer schuilt** — de
wisselende uitslag hierboven laat juist zien hoe makkelijk zo'n bewering te
sterk wordt. Wat er staat is: de vier oorzaken die aangewezen konden worden zijn
weg, en de vorm waarin ze terugkomen is nu bekend (een vaste identiteit, een
ongescopeerde globale schrijver, een telling zonder filter).
