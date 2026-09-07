# Welke groep beslist over een streefdatum, en wanneer is dat niemand

**07-09-2026 — QS8-309, migratie 0175.**

## De vraag

Een doel mag aan meerdere groepen hangen (QS8-56, PRD 5.5). Besluit A7 zegt dat
een streefdatum alleen verschuift met het akkoord van de groep. Welke groep?

## Wat er al besloten was, en dat blijft staan

**De eigenaar kiest.** `beslissendeGroep()` in `src/modules/buddies/deling.ts`
legt dat vast: bij één gekoppelde groep is er niets te kiezen, bij twee of meer
telt alleen een keuze die de gebruiker zelf gemaakt heeft en die nog bestáát.

Tot QS8-56 stond er `groepen[0]` in het scherm, op een lijst zonder `order by` —
een keuze die niemand gemaakt had en die Postgres niet eens beloofde. De
vervanging is bewust géén regel die de app zelf bedenkt (de oudste groep, de
grootste, die van de getuige): elke groep is een aparte toestemming, en welke
van je groepen je om uitstel vraagt, is aan jou.

⚠️ **Dat besluit is hier níet teruggedraaid.** Wat eraan toegevoegd is, is één
ondergrens.

## Wat er is bijgekomen

**Een groep waar de eigenaar het enige actieve lid is, kan niet de beslisser
zijn.**

Niet omdat die groep "er niet over gaat" — dat is precies de vraag die de
eigenaar mag beantwoorden — maar omdat er dan **niemand** is die kan beslissen.
`beslis_deadline_verzoek()` weigert de aanvrager met `not_yourself`, dus zo'n
verzoek kan alleen verlopen. Gemeten, als gewone gebruikers:

```
A1 verzoek in soloclub | ok: true
A2 alice beslist zelf  | ok: false, reason: not_yourself
A3 bob beslist         | ok: false, reason: not_found
A4 bob ziet verzoeken  | 0
```

Het is dus geen verzoek maar een wachtstand, en de app zei intussen dat je op je
groep wachtte.

## Waarom het nu pas telt

Sinds migratie 0174 (QS8-307) houdt een open verzoek een straf tegen. Daarmee is
een onbeslisbaar verzoek een **schild dat niemand kan wegnemen**: de begunstigde
van de straf is geen lid van die groep, ziet het verzoek niet
(`deadline_requests_select`) en kan het niet afwijzen.

0174 kapt de schade af op een week — die grens hangt aan `goals.target_date` en
niet aan het verzoek — maar binnen die week klopt het niet.

## De afweging die niet gemaakt is

De security-review stelde voor te eisen dat het verzoek in de groep staat die de
inzet houdt. Dat is niet gedaan, om twee redenen:

- **De begunstigde is niet altijd een groep.** Bij `beneficiary_user_id` (sinds
  QS8-228) bestaat "de groep die de inzet houdt" niet.
- **Het zou het besluit van QS8-56 terugdraaien.** Een doel in drie groepen met
  een straf in één ervan zou zijn uitstel alleen daar mogen vragen, terwijl de
  andere twee net zo goed buddy's zijn.

De gekozen grens is smaller en algemener: *een verzoek dat niemand kán beslissen,
is geen verzoek.* Die geldt ook zonder straf erop, en hij leunt op precies de
regel die `beslis_deadline_verzoek()` al hanteert.

## Twee grendels, want de toestand verandert ertussen

1. `vraag_deadline_verschuiving()` weigert met `geen_beslisser`. Dat is de
   eerlijke melding: er is hier niemand die ja kan zeggen, en dat hoor je nu in
   plaats van na een week wachten.
2. `maak_straffen_verschuldigd()` laat een verzoek alleen schild zijn zolang er
   een beslisser ís.

⚠️ De tweede is niet overbodig. Een groep kan één lid worden **nadat** het
verzoek is ingediend — iemand vertrekt, wordt uitgezet of gaat op `inactive` —
en dan is het verzoek alsnog onbeslisbaar. Die tak dekt ook de rijen die vóór
0175 zijn aangemaakt. Regel 18 vraag 1 in zijn zuiverste vorm: twee correcte
onderdelen, en een naad ertussen.

⚠️ Beide takken toetsen `status <> 'inactive'` en niet `= 'active'`, want dat is
wat `beslis_deadline_verzoek()` toetst. Een lid op `paused` mag daar beslissen,
dus hier telt hij ook mee. Twee opvattingen over wie er mag beslissen, is een
naad die stilvalt zodra iemand er één bijwerkt.

## Wat hiermee niet is opgelost

Wie alléén in een groep zit en zijn doel eraan gekoppeld heeft, kan zijn
streefdatum nu helemaal niet meer verzetten: `zet_streefdatum()` weigert bij elk
gekoppeld doel (`needs_group_approval`, 0110) en een verzoek kan hij niet meer
indienen. Dat was vóór 0175 net zo, alleen liep het toen dood op een verzoek dat
eeuwig open bleef staan in plaats van op een melding. Het staat als **QS8-311**.
