# Een klassement in elke groep

**Datum:** 03-09-2026
**Besluit:** A57
**Vervangt de open rij uit:** A54 (`2026-08-31-ritme-klassement-en-kleur.md` §2)
**Status:** besloten, **nog niet gebouwd** — er staan vier vragen open die vóór de
migratie beantwoord moeten zijn (§7)

---

## 1. Het besluit

Quinten, 03-09-2026, in antwoord op vraag T1 van de besluitenronde:

> *Ook beschermd een klassement. Open en beschermde groepen in hetzelfde
> klassement. In het klassementsoverzicht kan je filteren of je alles wilt zien
> of alleen bepaalde groepen.*

Dat zijn twee dingen, en ze zijn los van elkaar te bouwen:

**A57a — elke groep krijgt een klassement.** Het puntenklassement per lid is niet
langer voorbehouden aan een groep die voor **open** heeft gekozen. Ook een
beschermde groep toont wie hoeveel punten in díe groep verdiend heeft.

**A57b — één overzicht over je groepen heen, met een filter.** De klassementen
van je groepen staan bij elkaar op één scherm, en je kunt kiezen welke je ziet.

---

## 2. Waarom dit een eigen document is

A54 gaf een **open** groep een klassement en zette er met zoveel woorden bij:

> ⚠️ **Wat hier níét besloten is:** het klassement in béschermde groepen. Dat kan,
> en dan vervalt domeinregel 7 voor het puntentotaal in élke groep. Dat is een
> grotere stap dan deze en hoort dan apart opgeschreven te worden.

Dit is die aparte opschrijving. De reden dat A54 hem apart wilde, is dat de
verruiming in de **code** één regel is en in de **belofte** de grootste stap die
domeinregel 7 tot nu toe heeft gezet. Precies dat verschil is waarom dit een
document is en geen commit-bericht.

---

## 3. Wat er technisch verandert: één regel

`groep_klassement()` (migratie 0141) eindigt op:

```sql
  from gerangschikt g
  where lid_van_open_groep(p_group_id)
```

Die ene regel is de hele poort. Alles eromheen — de rangschikking, de paginering,
de kolommen die er níét zijn — blijft staan.

⚠️ **Maar `is_group_member()` is niet de vervanger, en dat is de val van deze
migratie.** De twee poorten verschillen op **twee** voorwaarden, niet op één:

| | actief lid | groep niet gearchiveerd | groep is open |
|---|---|---|---|
| `lid_van_open_groep()` | ✅ | ✅ | ✅ |
| `is_group_member()` | ✅ | ❌ | ❌ |
| `mag_groep_lezen()` (0153) | ✅ | ❌ | ❌ |

Wie de poort vervangt door `is_group_member()` of `mag_groep_lezen()` verruimt er
per ongeluk twee: het klassement gaat dan óók open in een **gearchiveerde** groep.
Dat is nooit besloten, en de archieftoets is in 0102 juist bewust toegevoegd
omdat een gearchiveerde open groep zijn schakels bleef uitdelen.

**De vervanger is een nieuwe poort** die alleen de zichtbaarheidsvoorwaarde laat
vallen — werktitel `lid_van_levende_groep(gid)`: actief lid, groep niet
gearchiveerd, zichtbaarheid doet niet mee.

---

## 4. De drie grendels van A54: twee blijven, één gaat weg

A54 rustte op drie grendels. Het is belangrijk om te weten welke van de drie dit
besluit opheft, want de andere twee dragen daarna méér gewicht dan eerst.

| Grendel | Wat hij doet | Na A57 |
|---|---|---|
| `points_ledger_gemist_is_niet_van_een_groep` (CHECK, 0141) | `cycle_missed` boekt zónder `group_id`, dus een groepstotaal kan niet dalen van een gemiste week | **Blijft, en wordt belangrijker.** Hij beschermde één soort groep; nu beschermt hij ze allemaal |
| De handtekening van `groep_klassement()` — geen `delta`, geen datum, geen "van hoeveel" | een minpunt, een grafiek per lid en de nadruk op de laatste plaats zijn onmogelijk gemaakt in de kolommen en niet in een component | **Blijft ongewijzigd** |
| `lid_van_open_groep()` in de `where` | een beschermde groep krijgt nul rijen | ⛔ **Dit is de grendel die A57 opheft** |

⚠️ **Er is dus nog precies één ding dat "een laag getal" van "een gemiste week"
scheidt, en dat is de CHECK.** Zolang die staat, betekent een laag klassement
*hier weinig verdiend* en niet *hier weken gemist* — dat tweede zit niet in het
cijfer. Valt die CHECK ooit, dan is het klassement in élke groep meteen een
tegenslagmeter. Wie hem wil wijzigen, leest eerst deze alinea.

---

## 5. Wat dit kost

Vier gevolgen, en ze zijn geen van alle cosmetisch.

### 5a. De toestemming verdwijnt

Dit is het zwaarste, en het staat bewust bovenaan.

Besluit A41 maakte **beschermd de standaard** en **open een handeling**: omzetten
loopt via `zet_groepszichtbaarheid()`, met een actieve beheerder, een expliciete
bevestiging, een rij in `group_events` en een systeembericht — *"met de
zorgvuldigheid van een commitment device (domeinregel 5)"*, staat er in CLAUDE.md.
A54 leunde daar volledig op: het klassement kwam gratis mee met een keuze die de
groep zélf gemaakt had.

**A57 haalt die keuze eruit.** Elke groep krijgt het klassement, en geen enkele
groep heeft eraan ja gezegd. Dat is niet hetzelfde als "de groep mag het uitzetten
als hij wil" — het is de omkering van A41's standaard voor dit ene oppervlak.

⚠️ CLAUDE.md zegt bij domeinregel 7: *"Voor élk níeuw oppervlak is beschermd het
antwoord tot iemand het tegendeel besluit."* Iemand — Quinten — besluit hier het
tegendeel, en dat mag. Wat er niet mag, is dat het stilzwijgend gebeurt: **een
groep die vandaag beschermd is, moet merken dat dit erbij komt.** Hoe, staat als
open vraag in §7.

### 5b. Het werkt met terugwerkende kracht

`points_ledger` staat vol met rijen die geboekt zijn onder een belofte die
CLAUDE.md nog steeds letterlijk maakt: *"Je persoonlijke puntentotaal is privé"*
(A42). Zet je het klassement aan in een beschermde groep, dan wordt niet alleen
wat er vanaf morgen gebeurt zichtbaar, maar ook alles wat er al staat.

Dat is exact dezelfde eigenschap waarom het omzetten van zichtbaarheid via
`zet_groepszichtbaarheid()` loopt en niet via een `update`: *"omzetten verandert
met terugwerkende kracht wat er over ándere leden zichtbaar wordt"*.

Vandaag is dat nog goedkoop — er zijn geen echte gebruikers. **Die aanname
vervalt op de dag dat de eerste gebruiker zich aanmeldt**, en dan is dit besluit
duurder dan nu. Dat is een reden om het nú te bouwen als het gebouwd wordt, en
geen reden om het te versnellen zonder de vragen uit §7.

### 5c. De copy wordt onwaar

`klassement.uitleg` zegt vandaag:

> *"Jullie hebben afgesproken open te zijn, dus staan de punten van deze groep
> hier bij elkaar."*

Die zin verwíjst naar de toestemming uit 5a. Zodra elke groep een klassement
heeft, is hij in de meeste groepen gewoon niet waar. Hij moet mee in dezelfde
wijziging — een onware zin over privacy is erger dan geen zin.

### 5d. Het zakelijke geval verandert niet mee

CLAUDE.md, domeinregel 7: *"zit er een leidinggevende in de groep, dan beschermt
de regel niet tegen schaamte maar tegen een beoordelingsgesprek."*

Bij A54 was het antwoord daarop: zo'n groep zet zichzelf niet op open. Dat
antwoord bestaat na A57 niet meer. Wat overblijft is de CHECK uit §4 — het
klassement kan niet dalen, dus er is geen minpunt af te lezen — plus wat er ook
zonder klassement al zichtbaar was. **Dat is een echte verzwakking en geen
schijnbare**, en ze hoort hier te staan in plaats van in een review in november.

---

## 6. Wat dit niet is

Even belangrijk, want een besluit dat één deur opent, wordt gelezen alsof het het
hele gebouw opent. A57 raakt **uitsluitend** het groepstotaal per lid. Ongewijzigd
blijven:

- **Je persoonlijke puntentotaal blijft privé.** `points_ledger` blijft
  eigenaar-only in RLS; het klassement leest eromheen als `security definer`
  functie met een eigen poort. A42 blijft staan.
- **Geen deltas, geen datums, geen "van hoeveel".** De handtekening van
  `groep_klassement()` verandert niet.
- **De vijf andere gesloten oppervlakken blijven dicht** — systeemberichten over
  tegenslag, realtime, ingetrokken goedkeuringen, de weekpassen en de teller van
  De Ketting. Dat waren er zes; A54 haalde de punten eruit voor open groepen,
  A57 doet dat voor alle groepen. **De lijst wordt vijf, niet nul.**
- **Domeinregel 7 zelf blijft.** Wat vervalt is de uitzondering die A42 maakte
  voor dit ene cijfer, uitgebreid van open groepen naar alle groepen. De
  groepsfeed, de systeemberichten en het groepsoverzicht bevatten nog steeds
  uitsluitend positieve signalen.

⚠️ **De ingetrokken goedkeuring is de plek waar het klassement wél daalt**, en
dat is bij A57 breder dan bij A54. Migratie 0030 boekt bij een intrekking twee
negatieve `correction`-rijen **mét** `group_id`. A54 heeft dat nagelopen en
aanvaard om twee redenen die allebei blijven gelden: het venster is vijftien
minuten, en dezelfde functie verwijdert de aankondiging uit de groepschat — een
regel die verdwijnt uit een kanaal dat mensen lezen, valt meer op dan een getal
dat terugveert. Die redenering draagt ook in een beschermde groep, maar hij is
niet meer *"alleen in een groep die daar ja op gezegd heeft"*. Rij 17 en rij 28
van `002-domeinregel7-oppervlakken.md` moeten dat allebei zeggen.

---

## 7. Wat er beslist moet zijn vóór de migratie

Vier vragen die het besluit openlaat en die de migratie niet zelf kan beantwoorden.
**Ze staan hier omdat ze de belofte raken en niet de bouw** — een conservatief
antwoord verzinnen zou hier precies de fout zijn die A41 wilde voorkomen.

1. **Krijgt een groep een uitknop?** A57 zet het klassement standaard aan. Mag een
   groep het uitzetten, en zo ja: is dat een beheerdershandeling met een
   systeembericht (zoals `zet_groepszichtbaarheid()`) of een stille instelling?
   ⚠️ Een stille instelling is hier de gevaarlijke: hij verandert met
   terugwerkende kracht wat er over ánderen zichtbaar is.
2. **Mag een individueel lid zich eruit houden?** Iets anders dan vraag 1: niet de
   groep, maar één persoon die niet in het lijstje wil staan. Antwoord "nee" is
   verdedigbaar — een klassement met gaten is geen klassement — maar het moet een
   antwoord zijn.
3. **Wat gebeurt er met de groepen die er al zijn?** Krijgen bestaande beschermde
   groepen dit er stilzwijgend bij, of eenmalig een systeembericht? ⚠️ Een nieuw
   type systeembericht vraagt een migratie: de CHECK
   `chat_messages_system_event_bekend` is een allowlist en geldt ook voor
   `service_role`.
4. **Wat betekent "hetzelfde klassement" in A57b?** Zie §8 — ik heb daar een
   aanname gedaan, en dat is de enige plek in dit document waar ik dat doe.

---

## 8. A57b, en de aanname die eronder ligt

*"Open en beschermde groepen in hetzelfde klassement"* kan twee dingen betekenen,
en ze liggen mijlenver uit elkaar:

**Lezing A — één scherm, meerdere klassementen.** Je ziet de klassementen van al
je groepen onder elkaar op één plek, met een filter om te kiezen welke. Elk
klassement is nog steeds het klassement van díé groep, met het groepstotaal van
`groep_klassement()`.

**Lezing B — één klassement, alle groepen door elkaar.** Eén ranglijst waarin
leden van verschillende groepen tegen elkaar staan. Dat kán niet met het
groepstotaal — mensen die niet in dezelfde groep zitten, hebben geen gedeelde
noemer. Zo'n ranglijst heeft je **persoonlijke** totaal nodig, en dat is precies
variant B die A54 heeft afgewezen: hij lekt de gemiste week wél, want
`cycle_missed` telt er dan gewoon in mee.

⚠️ **Ik ga uit van lezing A**, en dat is een aanname en geen mededeling. Reden:
lezing B heft de CHECK uit §4 in de praktijk op en daarmee de laatste grendel die
dit besluit nog draagbaar maakt, en niets in de formulering wijst erop dat dat de
bedoeling is — *"of alleen bepaalde groepen"* veronderstelt juist dat groepen de
eenheid blijven. **Klopt lezing A niet, dan is A57b een ander besluit dan dit
document beschrijft en moet het opnieuw.**

---

## 9. Wat er moet veranderen als dit landt

Een checklist, zodat het besluit niet half in de documenten belandt — dat is het
patroon waar QS8-125 voor bestaat.

| Waar | Wat |
|---|---|
| `supabase/migrations/` | nieuwe poort `lid_van_levende_groep()`, `groep_klassement()` erop over. **Geen** `is_group_member()` — zie §3 |
| `CLAUDE.md` domeinregel 7 | de ⚠️-alinea over A54 verbreden: de uitzondering geldt niet meer alleen voor open groepen |
| `CLAUDE.md` domeinregel 10 | de A54-alinea onder "je persoonlijke puntentotaal is privé" bijwerken; A42 blijft, de uitzondering wordt breder |
| `docs/decisions/002-domeinregel7-oppervlakken.md` rij 28 | van "open groep" naar "elke groep", met de CHECK als enige drager |
| idem, rij 17 | de intrekkingsredenering geldt nu ook zonder groepstoestemming — zie §6 |
| idem, §6b slotalinea | *"zes oppervlakken staan bewust dicht"* wordt **vijf** |
| `2026-08-31-ritme-klassement-en-kleur.md` §2 | de open rij *"wat hier níét besloten is"* verwijst naar dit document |
| `src/shared/i18n/nl.ts` + `en.ts` | `klassement.uitleg` herschrijven — zie §5c |
| `docs/ENGINEER-REVIEW.md` | een rij voor §5d, het zakelijke geval, met de voorwaarde erbij |

---

## 10. De grendel die hierbij hoort

⚠️ **Onwrikbare regel 18, vraag 3, en hier is hij scherp:** de bestaande toets op
dit oppervlak is *"een beschermde groep krijgt nul rijen"*. Die test wordt door
deze wijziging **omgedraaid**, niet verwijderd — en dat is precies het moment
waarop een suite groen kan blijven terwijl de belofte verschuift.

De belofte die na A57 overblijft, is niet meer "een beschermde groep ziet niets"
maar **"het klassement kan van niemand dalen"**. Dat is wat er getoetst moet
worden, en het is een andere test dan die er nu staat:

- boek een `cycle_missed` en toon aan dat het klassement niet zakt — met de hand
  rood te maken door de CHECK te droppen en de gemiste week mét `group_id` te
  boeken. Dat is exact de mutatie die 0141 al beschrijft, en hij bewaakt na A57
  élke groep in plaats van alleen de open;
- een **gearchiveerde** groep geeft nog steeds nul rijen — de tweede voorwaarde
  uit §3, die anders stilletjes meeverruimt;
- een **niet-lid** en een **uitgezet lid** krijgen nog steeds nul rijen.

⚠️ Die laatste twee stonden er al, maar ze hingen aan `lid_van_open_groep()`. Ze
verhuizen mee naar de nieuwe poort, en **een verhuizing is de gevaarlijkste
beweging die er is**: de tests blijven groen omdat ze toetsen wat er in het
bestand staat, niet wat het bestand beloofde. Loop ze na op de nieuwe poort.
