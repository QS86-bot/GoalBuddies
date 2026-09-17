# De klok die de gestrafte zelf zet

**16-09-2026** — sluit de reviewrij van 08-09-2026 over `wikkel_commitments_af()`
(QS8-322, 0238). Migratie `0280`.

## Wat er aan de hand was

`wikkel_commitments_af()` besliste of een doel op tijd af was met:

```sql
v_vandaag := coalesce(eigenaarsdatum(v_doel.owner_id), current_date);
v_op_tijd := v_vandaag <= v_doel.target_date + 1;
```

`eigenaarsdatum()` is `(now() at time zone profiles.tz)::date`, en `tz` staat in
de UPDATE-kolomgrant van `authenticated`. **De gestrafte zette dus zelf de klok
die bepaalde of hij op tijd was.**

📏 Gemeten: de uiterste offsets in `pg_timezone_names` liggen **26 uur** uit
elkaar — `Etc/GMT+12` tot `Pacific/Kiritimati`. Een westelijke zone kocht daarmee
ten hoogste `ceil(26 / 24)` = **twee** extra dagen — `v_op_tijd` bleef waar tot
`target_date + 3`.

⚠️⚠️ **Hier stond "precies twee datums, dus exact één extra dag", en dat is op
17-09-2026 gecorrigeerd** (QS8-530). De meting was echt gedaan en tóch onwaar,
want hij is op **één moment** gedaan: 📏 een venster van 26 uur is langer dan een
etmaal, dus het bevat twee middernachten gedurende 26 − 24 = twee uur per dag.
Van **10:00 t/m 11:59 UTC** zijn het drie datums, de rest van de dag twee. De
grendel die deze aanname vastlegde stond daardoor elke dag twee uur rood op
`main`.

De les is niet *beter meten* maar **wat** je meet: het aantal datums is een
eigenschap van de klok, de spanwijdte een eigenschap van de tz-database. Dit
document leunt op de tweede. ⚠️ En de tegenspraak stond al in de repo —
`0134` geeft in zijn kop UTC−8 nul dagen respijt en UTC+10 twee, wat een
spreiding van twee dagen tussen de uitersten ís.

⚠️ **Het besluit hieronder verandert er niet van.** 0280 bevriest `tz` bij het
aangaan, dus de straftak is dicht of de bovengrens nu één dag is of twee; alleen
het getal in deze uitleg was fout. En de afweging tussen bevriezen en UTC hing
nooit aan dat getal, maar aan wiens belofte er verschuift.

📏 En end to end gemeten, met dezelfde opstelling en alleen de klok verschillend:

| straftak | `vervallen` | status |
|---|---|---|
| de oude, met de klok van vandaag | **1** | `cancelled` — ontsnapt |
| `0280`, met de bevroren klok | 0 | `set` — blijft staan |

## ⚠️ Waarom dit geen nieuwe bug was maar een nieuwe consequentie

0057 koos die coulante toets **bewust**, en schreef het argument erbij op:

> de fout valt zo altijd de goede kant op — een beloning is iets dat je jezelf
> hebt beloofd

Dat argument is geldig. Het draait alleen om zodra dezelfde toets over een
**straf** gaat, want daar ís te mild precies de ontsnapping.

Dit is dezelfde klasse als wat 0172 met `created_at` deed en 0184 met
`target_date`: een consequentie ophangen aan een getal dat de gestrafte zelf
zet. En het is de klasse die `CLAUDE.md` bij de review-agenda beschrijft —
*vraag bij elke nieuwe beslissing die op een bestaande primitieve handeling
leunt: staat daar een weggelegde bevinding over?* Hier was het omgekeerd: er
stond een **besluit** over, en dat besluit gold voor een andere handeling.

## Het besluit

Drie opties lagen voor. Dit is een commitment device, en `CLAUDE.md` noemt dat
met zoveel woorden grens 1 — *de keuze bepaalt wat er tegen een mens beloofd
wordt* — dus is hij voorgelegd in plaats van zelf genomen.

| optie | wat het doet | waarom niet / wel |
|---|---|---|
| **bevriezen bij het aangaan** | de zone van het moment van `set` beslist | **gekozen.** Verandert niemands belofte: je houdt precies de coulance die je had toen je je vastlegde, en kunt hem achteraf niet meer verschuiven |
| beslissen in UTC | simpelst, niet te manipuleren | neemt speling af van wie in een oostelijke zone zit, zonder dat hij iets fout deed — dát is wél een belofte die verandert |
| laten staan en vastleggen | geen codewijziging | één dag is een bovengrens zolang `bewaak_tijdzone()` blijft en de respijtdag niet groeit; twee aannames die niemand bewaakt |

Quinten koos de eerste, op 16-09-2026.

## Hoe het gebouwd is

- **`commitments.tz`**, gevuld door een `before insert or update`-trigger
  (`bevries_commitmentzone()`), en in **geen enkele grant aan `authenticated`**.
  ⚠️ Dat laatste is de grens, niet de trigger: `authenticated` INSERT
  rechtstreeks in `commitments` via kolomgrants, niet via een RPC. Zou `tz` in
  die grant komen, dan mag de gestrafte zijn eigen klok kiezen en is de hele
  migratie ongedaan.
- **Onveranderlijk daarna**, en luid: een poging de zone te wijzigen werpt. Stil
  terugzetten laat de schrijver denken dat het gelukt is.
- **Alleen de straftak verhuist.** De beloningstak houdt `eigenaarsdatum()` en
  daarmee het argument van 0057. Een migratie die allebei verzet, verandert meer
  dan de bevinding vraagt — en dan weet je achteraf niet meer welke helft je
  gemeten hebt.

## ⚠️ Twee dingen die bij het schrijven misgingen, en allebei zijn ze een klasse

**1. De grendel blokkeerde zijn eigen terugvulling.** De `before update`-tak
weigert elke wijziging van `tz`. De terugvulling verderop in dezelfde migratie
zet `null` naar een waarde — en dat *is* een wijziging. Zonder
`and old.tz is not null` had de migratie zichzelf tegengehouden. Gevonden bij het
nalezen, vóór de eerste run.

**2. Onvoorwaardelijk overschrijven bij INSERT breekt een terugzet.** De eerste
versie deed `new.tz := coalesce(v_tz, 'UTC')` en negeerde dus wat er in de rij
stond. Bij een `pg_restore --data-only` zou dat de zone van vandaag over de
bevroren zone heen schrijven — woordelijk de klasse die `docs/DEPLOY.md` §2.9a
dezelfde dag beschreef. Nu staat `new.tz` vooraan in de `coalesce`.

Allebei zijn ze gevonden door de migratie tegen te lezen vóór hij liep, en niet
door een test. Dat is precies waarom regel 18 vraag 3 vraagt of een test groen
kán blijven terwijl de belofte breekt: deze twee zouden dat allebei gedaan hebben
— de eerste had de migratie laten falen (luid), de tweede niets (stil).

## ⚠️ De kolom opende een groepsoppervlak, en de poort ving dat

`commitments` is groepszichtbaar: `commitments_select` geeft de begunstigde groep
leesrecht zodra een straf `unlocked`, `due` of `resolved` is. En de SELECT-grant
stond **tabelbreed**. Een kolom toevoegen betekende dus: die groep leest hem mee,
zonder dat iemand dat besloot.

📏 Gemeten ná `add column`: `tz` stond gewoon in de kolomlijst van
`authenticated`. `groepskolommen:controle` werd daar rood op, en dat is precies
waarvoor hij bestaat — ik had er zelf niet aan gedacht bij het schrijven.

Een tijdzone is geen tegenslag, dus dit is geen domeinregel-7-lek. Maar `CLAUDE.md`
is er stellig over: *voor élk níeuw oppervlak is beschermd het antwoord tot iemand
het tegendeel besluit.* Dus gaat hij eruit.

⚠️ **En een `revoke select (tz)` doet niets.** 📏 Gemeten: het recht zit tabelbreed
(`SELECT, REFERENCES` in `table_privileges`), en Postgres weigert dan stilzwijgend
een kolomgewijze intrekking. De enige vorm die werkt is het tabelrecht intrekken
en per kolom teruggeven — woordelijk de les die 0236 voor `goals` opschreef, mét
de waarschuwing die deze migratie anders had verdiend: *wie dat omdraait, krijgt
een migratie die groen draait en niets doet.*

Gevolg: de CENSUS-rij van `commitments` in `scripts/groepskolommen-controle.mjs`
is weg, want die tabel heeft geen tabelbrede grant meer. Ook dát meldde de
controle zelf — een rij laten staan die zijn grant kwijt is, dekt ooit stilletjes
een tabel die hem wél heeft. Dezelfde ratel als bij `regel15:controle`.

## Wat dit niet is

- **Geen strengere straf.** Niemand wordt eerder verschuldigd dan onder de zone
  waarin hij zich vastlegde. Alleen de ontsnapping ná het vastleggen is dicht.
- **Geen wijziging aan `maak_straffen_verschuldigd()`.** Wat blijft staan, blijft
  op `set`; verschuldigd worden is een aparte stap met zijn eigen grendels
  (domeinregel 5).
- **Geen wijziging aan `eigenaarsdatum()`.** Die functie doet wat hij belooft en
  wordt elders terecht gebruikt.

## Grendel

`tests/rls/strafklok-ligt-vast.test.ts`, zeven tests, waaronder de must-allow
(de straf vervalt wél als je in de bevroren zone op tijd bent) en een toets op de
aanname eronder: de spanwijdte over alle zones is 26 uur, dus ten hoogste twee
dagen. Groeit die ooit, dan is "twee dagen" geen bovengrens meer.

⚠️ Die toets vroeg tot 17-09-2026 het **aantal datums** in plaats van de
spanwijdte, en was daarmee klokafhankelijk: hij stond twee uur per dag rood.
Sinds QS8-530 vraagt hij de spanwijdte (klokonafhankelijk) en van het aantal
datums alleen nog de bovengrens. 📏 Alle drie de grendels zijn los geijkt — een
extremere zone maakt de spanwijdte rood, `ceil` naar `floor` het dagental, en een
opgehoogde telling de bovengrens.
