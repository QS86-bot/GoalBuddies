# Een straf die je zelf vooruit kon schuiven

**07-09-2026.** Migratie 0184. QS8-317, gevonden tijdens het meten voor QS8-311.

## De belofte die leeg was

Domeinregel 11 zegt: *een straf treedt alleen in werking bij een verstreken
deadline.* `maak_straffen_verschuldigd()` toetst daarvoor precies één ding:

```sql
and g.target_date < p_vandaag
```

Eén van de voorwaarden waaronder die regel een belofte is, is dat de gestrafte
die datum niet zelf kan verzetten. Het commentaar ernaast zei dat dat zo was:

> `goals.target_date` staat niet in de UPDATE-grant van `authenticated` en
> beweegt alleen met het akkoord van een buddy.

De eerste helft klopt — 📏 `has_column_privilege('authenticated','goals','target_date','UPDATE')`
geeft `false`. De tweede helft niet.

## Waarom hij niet klopte

Er zijn precies twee schrijvers van `goals.target_date` (📏 gemeten over alle
functiedefinities, niet gegrept over de migratiebestanden):

| Functie | Wie mag hem | Wat hij eist |
|---|---|---|
| `beslis_deadline_verzoek()` | `authenticated` | het akkoord van een ánder actief groepslid |
| `zet_streefdatum()` | `authenticated` | **niets**, zodra het doel aan geen groep hangt |

`zet_streefdatum()` weigert met `needs_group_approval` zodra er een
`goal_group_links`-rij is. Bij een ongekoppeld doel weigert hij niets.

En een ongekoppeld doel kán een straf dragen. Dat is de naad: `commitments_insert`
eist wél een begunstigde (`bewaak_begunstigde()`, 0168), maar dat is een groep
waar de **eigenaar** lid van is — níét een groep waar het **doel** aan gekoppeld
is. Twee correcte onderdelen, en de fout leeft ertussen.

## 📏 De meting, end-to-end

Als `authenticated` met echte claims, op de lokale stack:

```
basislijn                        job telt 1, status `due`
eigenaar verzet zijn deadline    {"ok": true, "changed": true}, 30 dagen vooruit
daarna dezelfde job              job telt 0, status `set`
```

Herhaalbaar zonder bovengrens. Eén geslaagde verschuiving is al genoeg — de straf
hoeft niet afgewend te worden, alleen vooruitgeschoven, en dat kan elke dag
opnieuw.

⚠️ **En het is onzichtbaar voor wie het aangaat.**
`commitment_zichtbaar_voor_groep()` geeft `unlocked/due/resolved`, dus een straf
op `set` ziet de begunstigde niet — hij weet niet dát er een straf staat, laat
staan dat de datum opschoof. Het `deadline_moved`-event dat `zet_streefdatum()`
wél schrijft, hangt aan `shares_group_with_goal()`, en bij een ongekoppeld doel
is dat voor niemand anders leesbaar. Domeinregel 5 eist auditeerbaar; dit was het
niet.

## De keuze: weigeren, en alleen vooruit

Het issue noemde drie vormen. Deze migratie bouwt de eerste, en dat is een
bewuste keuze voor de conservatiefste:

1. **`zet_streefdatum()` weigert bij een openstaande straf.** ← gebouwd
2. De straf krijgt een eigen `due_date` die niet meebeweegt.
3. Verschuiven mag, maar de begunstigde ziet het.

⚠️ **2 en 3 vallen onder grens 1 van de beslisbevoegdheid** — ze veranderen wát
er aan de gebruiker als consequentie beloofd is. 1 verandert dat niet: het maakt
de belofte waar die er al stond. Dat is het verschil tussen een gat dichten en
een ontwerp wijzigen, en het is de reden dat deze sessie 1 zelf mocht beslissen
en 2 en 3 in het issue heeft laten staan.

### Twee grenzen die smaller zijn dan "er staat een straf"

**Alleen vooruit.** De grens loopt op `p_date > g.target_date`. Een deadline naar
vóren halen maakt de straf éérder verschuldigd; dat is het tegenovergestelde van
een ontsnapping, en blokkeren zou de gebruiker beletten strenger voor zichzelf te
zijn dan hij beloofd had.

**Alleen `status = 'set'`.** Dat is de enige stand die de job nog omzet. Vanaf
`due` zet alleen `beslis_deadline_verzoek()` de straf terug (0177). Blokkeren op
`due` zou iemand die zijn straf al gehad heeft beletten opnieuw te plannen.

⚠️ Hier stond *"en dat vraagt een buddy — daar valt dus niets te ontsnappen"*, en
dat is te sterk. 📏 Gemeten: die functie eist alleen `r.requester_id <> auth.uid()`
plus actief lidmaatschap, dus een tweede eigen account in je eigen groep voldoet
en zet ook een `due`-straf terug naar `set`. Het kost geen buddy maar een tweede
account. Dat sybil-punt is breder dan deze migratie en staat als dossierrij.

**En de tak staat ná `needs_group_approval`.** Bij een gekoppeld doel bestáát de
route via `vraag_deadline_verschuiving()`, en die hoort de gebruiker aangeboden
te krijgen. "Er staat een straf open" is daar een doodlopende melding waar een
werkende knop hoort.

## De ijking — vier mutaties, één per grendel

⚠️ Niet één mutatie voor de hele controle: elke grendel is apart gebroken, want
een ijking die door een éérdere grendel wordt afgevangen bewaakt niets van wat
hij belooft.

| Mutatie | Wat er rood werd |
|---|---|
| de hele tak eruit | 2 — beide belofte-tests |
| `p_date > g.target_date` eruit | 1 — de must-allow op naar voren halen |
| ook `due` blokkeren | 1 — de must-allow op opnieuw plannen |
| `c.type = 'penalty'` eruit | 1 — de must-allow op een doel met alleen een beloning |
| de tak vóór `needs_group_approval` | 1 — de melding bij een gekoppeld doel |

Daarna alles hersteld: 7 van de 7 groen. De eerste mutatie diende bovendien als
bewijs dát de suite meet — zes tests in ruim een seconde is snel genoeg om je af
te vragen of er wel iets draait.

⚠️⚠️ **De vierde rij ontbrak, en de tabel claimde volledigheid.** De eerste versie
telde vier mutaties bij vijf grendels: `c.type = 'penalty'` had er geen. 📏 In de
security-ronde gemeten door die grendel te slopen — alle zes tests bleven groen.
Zonder ijking kan hij stil wegvallen, en dan leest iemand met alléén een beloning
op zijn doel *"Je hebt zelf een straf aan dit doel gehangen"*: een onware bewering
aan de gebruiker, zonder dat iets rood wordt. De must-allow staat er nu, en de
ijking hierboven is opnieuw gedraaid met vijf.

**De les is niet "ik was er één vergeten" maar dat de tabel zei dat ze compleet
was.** Een ijkingstabel is zelf een bewering; tel de grendels in de code en niet
de mutaties die je toevallig bedacht hebt.

## Wat de test toetst, en wat niet

De suite toetst de **keten** — straf → verstreken deadline → poging → job →
`due` — en niet de weigering. Een test die alleen `straf_staat_open` afleest,
blijft groen zodra iemand de job aan een andere datum ophangt.

⚠️⚠️ **Maar de belofte stond hier eerst te breed, en dat is de duurste fout in dit
document geweest.** Er stond: *"je koopt je niet uit je eigen straf"*, en zo heette
de `describe` ook. 📏 In de security-ronde weerlegd, als `authenticated` eigenaar
en direct ná een geslaagde weigering:

```
zet_streefdatum(doel, +30d)                   → {"ok": false, "reason": "straf_staat_open"}
update commitments set status = 'cancelled'   → gelukt
maak_straffen_verschuldigd                    → 0
```

Eén handeling, geen buddy, en de begunstigde krijgt geen bericht. Dat is de knop
`trekIn()` uit 0057, en de melding die déze migratie toevoegt verwijst er zelf
naar: *"Wil je de straf niet meer, dan kun je hem intrekken."*

Wat 0184 waarmaakt is smaller: **de deadline van een doel met een openstaande
straf beweegt niet vooruit zonder buddy.** Dat is wat de kop, dit document en de
`describe` nu zeggen.

⚠️ **Een te brede belofte is erger dan geen belofte**, want ze laat de volgende
lezer stoppen met zoeken. Dat is dezelfde klasse als de vier onware beweringen in
de kop van 0182, één dag eerder in dezelfde sessie — en toen was de les al dat
proza net zo nagemeten hoort te worden als code. Een `describe`-naam is proza.

## Rechten

`create or replace` op beide functies, geen handtekeningwijziging, dus geen drop
en geen nieuwe grants. 📏 Vóór en ná gemeten en identiek:

```
maak_straffen_verschuldigd  anon=f auth=f svc=t
zet_streefdatum             anon=f auth=t svc=t
```

Dat is hier met opzet de veilige vorm. De sessie hiervoor (QS8-147) liet zien wat
een drop-en-opnieuw kost: `service_role` kwam er stil bij, en alleen omdat de
rechten ná de drop gemeten zijn viel dat op.

## Wat er open blijft staan

* **QS8-321 — een straf is vrijwillig tot hij `due` is.** `trekIn()` neemt hem
  weg zonder buddy en zonder bericht aan de begunstigde. Gemeten hierboven.
  Grens 1: mag je een straf die je jezelf oplegde op elk moment weer intrekken?
* **QS8-322 — te laat afronden laat de straf vervallen.** 📏 `wikkel_commitments_af()`
  toetst de belóning op `v_op_tijd` maar annuleert de **straf** onvoorwaardelijk,
  ook bij een verstreken deadline. De eigenaar zet zijn eigen mijlpalen op `done`
  en rondt af. Ouder dan deze migratie, ook grens 1.
* **Samen met QS8-317 zijn dat drie routes naar dezelfde uitkomst.** 0184 sluit er
  één. Domeinregel 11 is pas een belofte als alle drie beantwoord zijn, en twee
  ervan zijn een productbeslissing en geen conjunct.
* **QS8-317 optie 2 en 3** — de vraag of de begunstigde het verschuiven hoort te
  zien, en of de straf een eigen deadline verdient. Grens 1, dus aan Quinten.
* **`recent_ontkoppeld` heeft geen eigen melding.** 📏 `streefdatumMelding()` in
  `src/modules/goals/api.ts` kent `not_owner`, `bad_date`, `needs_group_approval`
  en sinds nu `straf_staat_open`; `recent_ontkoppeld` valt door naar de algemene
  tekst, terwijl de RPC er een `weer_toegestaan_op` bij teruggeeft die de
  gebruiker precies vertelt wanneer het wél mag. Als dossierrij weggelegd.
* **QS8-311 blijft geblokkeerd** door dit issue: zijn optie 1 (`zet_streefdatum()`
  toestaan als geen gekoppelde groep een ander actief lid heeft) verbreedde
  precies dit gat.
