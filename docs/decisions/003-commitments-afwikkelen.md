# 003 — Hoe een commitment afgewikkeld wordt

**Datum:** 21-08-2026
**Issues:** QS8-83, QS8-84 (EPIC 9)
**Migratie:** `0057_commitments_afwikkelen.sql`
**Status:** vastgesteld

---

## De aanleiding

EPIC 9 vraagt twee dingen: een beloning die vrijkomt als je je doel op tijd
haalt, en een straf die verschuldigd wordt als je je streefdatum mist.

De *berichten* daarvoor stonden er al. `meld_commitment()` bestaat sinds 0025,
`commitment_unlocked` en `commitment_due` staan sinds toen op de allowlist, en
`commitments_select` geeft de begunstigde groep leesrecht vanaf `unlocked`.

Wat ontbrak was alles wat de status vérzet. **Niets in de codebase zette ooit
een commitment op `unlocked` of `due`, dus die trigger had nog nooit gedraaid.**

En daaronder lag nog een laag: `goals.status` kon helemaal geen `completed`
worden. `zet_doelstatus()` kan alleen archiveren, en `authenticated` heeft sinds
0035 geen schrijfrecht meer op die kolom. Er was dus geen moment waarop een
beloning kón vrijkomen, en `meld_doel_af()` heeft evenmin ooit gedraaid.

> Dit is voor de derde keer hetzelfde patroon: QS8-47, QS8-112 en nu dit. De
> onderdelen staan er, ze zijn los getest, en er is geen pad waarlangs een mens
> ze bereikt. **Controleer bij een issue met `area:backend` altijd wie de nieuwe
> functie aanroept, en of dat iets is dat een gebruiker kan doen.**

---

## Besluit 1 — een doel rond je zelf af, maar niet met werk open

`rond_doel_af(goal_id)` is een nieuwe RPC. Alleen de eigenaar, alleen op een
`active` doel, en **alleen als er geen mijlpaal meer op `todo` staat**.

**Waarom niet automatisch bij de laatste mijlpaal.** Dan gebeurt het zonder dat
de gebruiker het bevestigt, terwijl het onomkeerbaar is: er gaat een bericht naar
elke gekoppelde groep en een chatbericht is een onveranderlijke kopie. Een doel
zonder mijlpalen zou bovendien nooit afronden, of meteen — een randgeval dat je
pas terugziet als iemand erin loopt.

**Waarom niet zonder de controle op mijlpalen.** Dit is de kern. Afronden is de
enige handeling die je eigen straf laat vervallen (besluit 3). Zou je dat mogen
doen terwijl er nog werk openstaat, dan is elk commitment device te ontlopen met
één druk op de knop, en dan is het geen commitment device meer.

**De uitweg bestaat nog, en dat is de bedoeling.** Je kunt een mijlpaal laten
vallen (`dropped`) en daarna afronden. Maar dat is een aparte, bewuste handeling
die zichtbaar in de geschiedenis blijft staan (domeinregel 6). De uitweg is niet
langer gratis en niet langer onzichtbaar — dat is genoeg. Een buddy die moet
goedkeuren was de zwaardere optie; die staat niet in de PRD en vraagt een hele
goedkeuringsstroom erbij.

*Besluit van Quinten, 21-08-2026.*

---

## Besluit 2 — twee klokken, allebei in het voordeel van de gebruiker

Dit is asymmetrisch, en met opzet.

**De straf** loopt via de rollover. Die kent `profiles.tz` en rekent de lokale
datum van de eigenaar uit met `shared/time` (correctheidsregel 7).
`maak_straffen_verschuldigd(owner_id, vandaag)` krijgt die datum aangereikt en
vergelijkt exact: verstreken is `target_date < vandaag`. Er wordt in SQL geen
datum afgeleid en geen tijdzone toegepast.

Zou die functie zelf `current_date` gebruiken, dan gaat de straf voor iemand in
Auckland een dag te vroeg af — en te vroeg is hier het enige dat echt niet mag.

**De beloning** loopt via `rond_doel_af()`, een RPC die de client aanroept. Daar
is geen betrouwbare tijdzone: de server staat op UTC, en wat de client over zijn
zone zegt mag niet meetellen — dat zou de gebruiker zelf laten bepalen of hij op
tijd was. Vandaar één dag speling: `current_date <= target_date + 1`. Tussen
UTC-12 en UTC+14 loopt een lokale datum hooguit één dag uit de pas met UTC, dus
niemand die in zijn eigen tijdzone op tijd was, wordt zijn beloning geweigerd.

Beide fouten vallen zo de kant van de gebruiker op. Een beloning is iets dat je
jezelf hebt beloofd; te streng zijn kost daar meer dan te mild zijn.

---

## Besluit 3 — een straf op een afgerond doel wordt `cancelled`, niet `resolved`

Dit is een domeinregel 7-keuze en geen smaak.

`commitments_select` geeft de begunstigde groep leesrecht bij `unlocked`, `due`
**én** `resolved`. Zou een straf die nooit is afgegaan op `resolved` komen, dan
leest die groep alsnog wat jij jezelf had opgelegd — terwijl er niets gebeurd is.

`cancelled` staat niet in die lijst en blijft dus van jou alleen. `resolved` is
gereserveerd voor een straf die verschúldigd wás en daarna afgehandeld is; die
heeft de groep sowieso al gezien.

**Archiveren redt je niet.** `maak_straffen_verschuldigd()` slaat alleen
`completed` over. Een gearchiveerd doel houdt zijn straf, want archiveren is
omkeerbaar en zou anders precies de ontsnapping zijn die A35, A39 en A40 samen
vier migraties hebben gekost: de regel stond in de issue en nergens in de
database.

---

## Besluit 4 — het auditspoor schrijft de database, niet de client

QS8-84 acceptatiecriterium 7 vraagt een volledig auditspoor: instelling,
bevestiging, trigger en bericht.

Tot 0057 schreef `src/modules/commitments/api.ts` die regels zelf. **Dat heeft
nooit gewerkt.** `commitment_events` heeft RLS aan met alleen een SELECT-policy,
dus elke insert werd geweigerd met `42501`, en `logCommitmentEvent()` slikte de
fout op via `reportError`. De tabel stond op nul rijen.

Het is nu een trigger (`commitments_audit` → `noteer_commitment()`), met
`auth.uid()` als actor. Daarmee is het auditspoor een schema-eigenschap zoals
`confirmed_at NOT NULL` dat al was: niet over te slaan en niet te vervalsen.
`commitment_events` houdt bewust **géén** INSERT-policy — weigeren is hier het
juiste antwoord.

De `posted`-regel komt uit `meld_commitment()`, want alleen die functie weet of
het bericht er écht gekomen is. De triggers draaien alfabetisch, dus
`commitments_audit` gaat vóór `commitments_systeembericht` en staat `triggered`
altijd vóór de `posted` die erop volgt.

`actor_id IS NULL` betekent systeem (001-datamodel §2.7). Een straf die door de
rollover verschuldigd wordt, krijgt dus geen actor; een straf die je zelf
intrekt wel. Dat verschil is af te lezen zonder dat iemand het hoeft mee te
sturen.

---

## Wat er onderweg kapot bleek

Twee dingen die QS8-85 al opgeleverd leek te hebben, werkten in de praktijk
niet. Allebei aangetoond tegen de echte database, in een teruggedraaide
transactie:

1. **`trekIn()` kon nooit gewerkt hebben.** `commitments_update` had wel een
   `using` maar geen `with check`. Postgres gebruikt de `using` dan óók als
   controle op de nieuwe rij, dus `status = 'set'` gold voor de uitkomst en
   `cancelled` schrijven gaf `42501`. Migratie 0006 wilde voorkomen dat de
   client zelf een status kiest, en nam de enige overgang mee die de client juist
   wél moet kunnen maken.

2. **`commitment_events` weigerde elke insert** — zie besluit 4.

> **De les.** Een `using` zonder `with check` op een UPDATE-policy is bijna nooit
> wat je bedoelt. Schrijf hem altijd uit, ook als hij hetzelfde zou zijn: dan is
> het zichtbaar een keuze in plaats van een weglating.

En een tweede, uit het testen zelf: **een UPDATE die op de `using` afketst,
raakt nul rijen en geeft géén fout.** Alleen een `with check`-schending geeft
`42501`. Een test die op een exception let, ziet zo'n weigering dus niet — hij
moet naar het aantal geraakte rijen kijken. Die vergissing zat in de eerste
versie van de proef en gaf een groen vinkje bij een gat dat er niet was.

---

## Wat dit voor Q-TODO betekent

- **A47 blijft staan.** De RLS-suite past niet twee keer in een uur; `epic9.test.ts`
  komt er met twee accounts bij.
- **Nieuw:** `goals.status = 'missed'` wordt door niets gezet, en `goals_select`
  laat groepsgenoten die status wél lezen. Zolang niets hem zet is dat theorie,
  maar het is dezelfde vorm als de bevinding uit EPIC 5. Aangetekend in
  `ENGINEER-REVIEW.md`.
