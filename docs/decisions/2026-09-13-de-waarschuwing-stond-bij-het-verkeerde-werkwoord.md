# De waarschuwing stond bij het verkeerde werkwoord

**13-09-2026 — QS8-442.**

## 1. Wat het issue zei, en wat er van klopte

QS8-442 beschreef twee dingen. Eén was gemeten, één was een verklaring die goed
paste. 📏 Nagemeten op 13-09-2026, en de verklaring bleek onjuist.

| Bewering | Gemeten |
|---|---|
| `groep / g` valt buiten elke opruiming en blijft staan | **klopt** — na elke run staat er `groep \| g = 8` |
| Hij loopt op, dus vanaf de dérde run op dezelfde dag zit de groep aan haar plafond van 20 | **klopt niet** — drie runs achter elkaar, elke keer 20 tests groen en elke keer `g = 8` |

De teller loopt niet op. En de reden dát hij niet oploopt, is de eigenlijke bug.

## 2. De echte oorzaak: een `update` zonder `where`

`tests/rls/dagteller-overleeft-wissen.test.ts` deed, in het geval *"een etmaal
later mag het weer"*:

```ts
psql(`update dagtellers set venster_start = now() - interval '25 hours';`);
```

Geen `where`. 📏 Gemeten met een vreemde tellerrij ernaast — één die een andere
suite had kunnen zetten:

```
VOOR:  aantal=5  start=2026-09-13 05:11:13+00
NA:    aantal=5  start=2026-09-12 04:11:21+00
```

Het **aantal** bleef staan en het **venster** ging een etmaal terug. De
eerstvolgende `tel_dagteller()` ziet dan een verstreken venster, zet de teller op
1 en laat de handeling door. Dat is *"expected GEWEIGERD, got OK"* — precies de
faalsignatuur waar QS8-442 mee begon en waar geen mechanisme bij stond.

⚠️ **Het verklaart ook waarom `g` niet oploopt.** Diezelfde `update` wist elke
run het venster van `groep/g`, dus de teller begon telkens opnieuw. De twee
defecten maskeerden elkaar: **repareer je alleen de `update`, dan bouw je de
tijdbom die het issue beschrijft alsnog.** Ze horen in één wijziging.

## 3. Waarom niemand het zag

Vier regels boven die `update` staat in `leeg()` een uitgebreide uitleg waaróm
een kale `delete from dagtellers` fout is — met het geval, de reden en een
verwijzing naar QS8-336. Die uitleg klopt. Hij staat op de goede plek. Hij gaat
over het verkeerde werkwoord.

⚠️ **Een gevaar dat uitgeschreven naast zich staat, leest als een gevaar dat
afgevangen is.** Dat is dezelfde vorm als de vaste zin in `migraties:controle`
die er ook bij een verse fetch stond (QS8-435) en die daardoor niets meer zei.
De les is niet "beter lezen": het is dat een waarschuwing in proza geen bereik
heeft. Een grendel wel.

## 4. Het besluit over `gedeelde-identiteit:controle` (criterium 3)

**Hij blijft op uuid's, en `g` wordt géén tweede uitzondering — hij wordt
gerepareerd.** Er komt een aparte controle bij voor de vraag die hier echt
gesteld werd.

De reden is dat het twee verschillende vragen zijn:

| Controle | Vraag |
|---|---|
| `gedeelde-identiteit:controle` | **van wie is deze rij?** — twee runs mogen niet dezelfde identiteit dragen |
| `tellerbereik:controle` (nieuw) | **waar mag ik overheen schrijven?** — een opruiming raakt alleen haar eigen sleutels |

`g` is toevallig allebei, en dat maakt het verleidelijk om de eerste te
verbreden. Maar de verbreding die daarvoor nodig is — *"elke vaste waarde in een
gedeelde sleutelruimte"* — heeft geen rand. Elke stringliteral in elke fixture is
dan een kandidaat, en dat is precies de vorm waar dat script zelf voor
waarschuwt: *"een controle die alles meldt, leert je hem te negeren."* De tweede
vraag heeft die rand wél, want hij gaat over schrijfacties op één tabel.

⚠️ **En de nieuwe controle is de vraag die twéé keer gemeten is**, niet één keer.
Het kale `delete from dagtellers` dat `leeg()` vermijdt en de kale `update` die
eronder stond zijn hetzelfde defect; de domeinbrede opruimingen in vier andere
bestanden zijn het ook, alleen met een kleinere straal.

⚠️ **Waarom uitgerekend `dagtellers`.** Die tabel is met opzet gebouwd om een
`delete` te overleven — hij telt de handelingen die er wáren en niet de rijen die
er staan (QS8-399, migratie 0233). Daardoor is hij de enige tabel in dit schema
waar de gewone fixture-opruiming niets aan doet: een rij hangt niet aan een
gebruiker of groep die `removeTestUsers()` weghaalt, maar aan een tekstsleutel
die niemand bezit. Wat er blijft staan, staat er de volgende run nog.

## 5. De belofte stond er al en werd half afgedwongen

De kop van `tests/rls/nevenschade.test.ts` zegt met zoveel woorden: *"Een
testbestand schrijft nooit buiten zijn eigen fixture."* Alles wat dat bestand
tóetst gaat over **databasefuncties** — `pg_get_functiondef()`, een bereik dat de
aanroeper meegeeft. De rauwe SQL van de testbestanden zélf is er nooit langs
gekomen.

Regel 18 in zijn zuiverste vorm: de belofte is een eigenschap van het geheel, de
toets een eigenschap van een onderdeel. En de naad — het testbestand met een
`psql()` in de hand — bleef onbewaakt.

## 6. De ijking

📏 **Zes mutaties, één per grendel, alle zes met de hand rood gezien op
13-09-2026.** Vooraf gemeten groen: **34** in de twee unit-suites samen (19 +
15) en **20** in `tests/rls/dagteller-overleeft-wissen.test.ts`. Van elke mutatie
is met een `grep` vastgesteld dát hij in het bestand stond vóór de uitslag
geloofd werd.

| Mutatie | Wat er brak | Wat er rood werd |
|---|---|---|
| A | de kale `update` terug in `dagteller-overleeft-wissen` | `tellerbereik:controle` |
| B | een domeinbrede `where` terug in `chatdocbucket` | `tellerbereik:controle` |
| C | de letterlijke `g` terug in de páden | **2 — de teardown (exitcode 1) én een gedragstest** |
| D | `vasteSleutels()` omgedraaid | 14 van de 15 |
| E | de commentaarknip blind voor `https://` | 3, waaronder de url-toets zelf |
| F | het statement stopt niet meer bij de `;` | 1 — de kniptest |

### ⚠️ De eerste poging tot C was fout, en dat hoort hier te staan

De voor de hand liggende mutatie — `const GROEP = 'g'` — bleef **groen**. Niet
omdat de grendel niets doet, maar omdat die mutatie het defect niet nabootst:
`GROEP` zit ook in `ALLE_PROEF_IDS`, dus het opruimfilter werd
`similar to '%(g|…)%'` en dát matcht elke sleutel met een letter `g` erin. De
rij werd keurig opgeruimd.

De historische vorm is een andere: `g` in de **paden**, niet in het filter. Zo
gemuteerd werd hij wél rood.

⚠️ **De les is die van CLAUDE.md, hier in het klein:** *breek de grendel die de
ijking noemt, niet zomaar iets.* Een mutatie die zijn geval langs een ándere weg
stuurt, bewaakt niets van wat hij belooft — en een groene uitslag had hier
"de teardown werkt niet" gelezen in plaats van "mijn mutatie deugt niet".

### ⚠️ C maakt er twee rood, en de tweede bewijst de koppeling

Naast de teardown viel `chatfotos: een etmaal later mag het weer` om met
`expected 'GEWEIGERD' to be 'OK'`. Dat is §2 van dit document van de andere
kant bekeken: met een correct afgebakende `update` en een vaste groep verloopt
het venster van `groep/g` **niet** meer, dus de groepsteller blijft vol en de
volgende upload wordt geweigerd.

📏 Dat is de voorspelling uit §2 — *"repareer je alleen de `update`, dan bouw je
de tijdbom alsnog"* — gemeten in plaats van beweerd. En hij is scherper dan
verwacht: de fout treedt niet na dagen op maar binnen dezelfde run.

## 7. De nameting

📏 **Drie volle RLS-runs achter elkaar zonder herbouw** (criterium 1 en 4):

| | Tests | Vaste sleutels over |
|---|---|---|
| vóór | 158 bestanden, 1765 groen | **1** (`groep \| g = 8`) |
| vóór, ná het repareren van `g` | 158 bestanden, 1765 groen | **2** (`mijnmap`, `mijnmap/submap`) |
| na | 158 bestanden, 1765 groen, 3× | **0**, 3× |

⚠️ **Die tweede rij is de teardown die zijn eigen nut bewijst.** `mijnmap` stond
niet in het issue en ik had er niet naar gezocht; hij kwam eruit doordat de
grendel in zijn eerste échte run afging. Dat geval is bovendien geen slordigheid
maar opzet — `chatfotobucket.test.ts` toetst juist een pad **zonder** uuid — en
het dwong de markering te verbreden van "bevat een uuid" naar "bevat twaalf
hextekens", want `proefCode()` is per run uniek zonder uuid te zijn.

📏 Zonder die verbreding had de grendel een correct opgeloste fixture blijven
melden, en dat is precies hoe je een controle leert negeren.

### ⚠️ Wat er wél blijft groeien, en waarom dat mag

De per-run rijen blijven staan: 📏 20 na de eerste run, 40 na de tweede, 60 na
de derde. Die dragen elk een uuid of een `proefCode`-prefix, dus een volgende run
botst er nooit mee — het is rommel en geen gif, en criterium 1 gaat over het
tweede. Opruimen zou vragen dat elk bestand zijn eigen rijen weghaalt in een
`afterAll` die er soms niet is; dat is een aparte afweging en geen onderdeel van
dit issue. Wie de teststack lang laat staan en het netjes wil hebben:
`truncate dagtellers`.
