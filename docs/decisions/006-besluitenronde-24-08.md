# 006 — Besluitenronde 24-08-2026: A37, A41, A42, A43, A46

**Datum:** 24-08-2026
**Issues:** QS8-127, QS8-128, QS8-129, QS8-130
**Besluitnemer:** Quinten

Vier besluiten die al een tijd op het bord stonden, in één ronde genomen. Twee
zijn dezelfde dag gebouwd; één is een epic die nog moet komen; één bevestigt wat
er staat.

---

## A37 — één gehaald weekdoel redt de week ✅ gebouwd

**Besluit:** heeft iemand twee weekdoelen op hetzelfde doel in één week en haalt
hij er één, dan telt die week mee en kan de reeks er niet door breken.

Migratie **0074**. `herbereken_reeks()` groepeerde op `(cycle_start_date, status)`
en leverde daarmee twee rijen voor dezelfde week; de `order by` sorteerde alleen
op datum. **Welke van de twee als laatste langskwam, bepaalde of de reeks
doorliep** — en Postgres belooft daar niets over.

`verbruik_weekpas()` had het al bij het rechte eind: die weigert zichzelf zodra er
in de cyclus iets `approved` staat. De reeks is naar de weekpas toe getrokken en
niet andersom.

⚠️ **De punten blijven per weekdoel.** Twee weekdoelen in één week kunnen `+2` en
`−1` opleveren. Dat is geen tegenstrijdigheid maar het verschil tussen score en
reeks: de reeks zegt "je was er die week", de score zegt hoeveel je afmaakte.

---

## A41 — een keuze per groep: beschermd of open ⏳ nog te bouwen

**Besluit: variant 2.** Bij het aanmaken kiest een groep tussen **beschermd**
(zoals nu, en de standaard) en **open** (de groep ziet ook tegenslag). Variant 3
— domeinregel 7 afschaffen — is afgewezen.

### Waarom dit een epic is en geen vlaggetje

De regel zit niet in de UI maar in het schema. Wat eraan hangt: migraties 0043
t/m 0046, plus 0019, 0020 en 0023 daarvoor; de allowlist
`chat_messages_system_event_bekend`; het privé houden van `points_ledger`; en het
verbod op `REPLICA IDENTITY FULL` op drie realtime-tabellen. **Dat verbod bestaat
uitsluitend hiervoor.**

"Open" betekent dus: **RLS moet per groep gaan variëren op een kolom die nu
categorisch dicht zit.** Dat is het werk, en het raakt de gevoeligste policies die
er zijn.

### Vier grenzen die bij het besluit horen

1. **Beschermd is en blijft de standaard.** Bestaande groepen zijn beschermd; er
   verandert niets aan wat vandaag dicht zit tot de epic gebouwd is.
2. **De keuze staat in de database, nooit alleen in de UI.** Een kolom op `groups`
   waar de policies op variëren.
3. **Omzetten is een handeling met gevolgen voor ánderen.** Een groep die van
   beschermd naar open gaat, verandert met terugwerkende kracht wat er over de
   ándere leden zichtbaar wordt. Dat vraagt dezelfde zorgvuldigheid als een
   commitment device (domeinregel 5): expliciet, auditeerbaar, nooit stilzwijgend.
4. ⚠️ **Bouw niets vooruitlopend "vast open".** Zo verschuift een standaard zonder
   dat iemand het besloten heeft.

### Wat er niet mee verandert

⚠️ **Juist bij zakelijk gebruik weegt domeinregel 7 zwaarder, niet lichter.** Zit
er een leidinggevende in een buddy-groep, dan beschermt de regel niet tegen
schaamte maar tegen een beoordelingsgesprek.

---

## A42 — punten blijven privé ✅ bevestigd, niets te bouwen

**Besluit:** houden zoals het is, en de optellende groepsteller blijft de vorm
voor competitie.

Een gedeeld puntentotaal ís competitiever, en het lekt: een dalend totaal is
zichtbaar bewijs van een gemiste week. Wie het totaal deelt, deelt het missen via
een omweg — en houdt bij de voordeur tegen wat er bij de achterdeur uitgaat.

Wat wél mag is een teller die **alleen optelt**: "deze groep heeft samen 47 weken
afgerond." Gaat nooit omlaag, verraadt niemand. Dat is precies de vorm die De
Ketting sinds migratie 0070 ook voor mijlpalen gebruikt, dus het is een bestaand
patroon in deze codebase en geen idee.

⚠️ **Let op de wisselwerking met A41.** Kiest een groep straks voor "open", dan
is een gedeeld puntentotaal daar niet vanzelf ook goed: A42 is apart besloten en
blijft staan. De teller die optelt is de vorm, in beide soorten groepen.

---

## A43 — geen minpunt bij verschuiven zonder akkoord ✅ bevestigd

**Besluit:** houden zoals het is.

Gebouwd is: verschuiven kán alleen mét akkoord van een buddy, en zonder akkoord
blijft de datum staan. Het alternatief — schuif maar op en betaal een punt — is
afgewezen.

**Waarom:** het zou de enige plek in het model zijn waar je je uit een afspraak
kunt kópen, en **een punt is goedkoper dan een gesprek.** Dat is precies het
gedrag dat A7 wilde tegengaan.

---

## A46 — TRUNCATE en TRIGGER ingetrokken ✅ gebouwd

**Besluit:** intrekken.

Migratie **0073**. `authenticated` had beide op alle 29 tabellen — een erfenis van
de standaardrechten van het platform, niet van een migratie. **TRUNCATE is niet
onderworpen aan RLS**, dus een rol die het heeft leegt de tabel ongeacht welke
policy erop staat. Ook `points_ledger`, `completions` en `chat_messages`.

Vandaag was het niet bereikbaar: PostgREST doet geen DDL. Een deur zonder slot in
een muur waar nog geen gang achter zit.

### Waarom een `revoke` alleen niet genoeg was

Het recht komt uit `pg_default_acl`. Trek je alleen de bestaande rechten in, dan
heeft de volgende tabel het gewoon weer — en dan staat dit issue over een maand
opnieuw op het bord. De standaardrechten gaan in dezelfde migratie mee, en er is
met een nieuwe tabel nagemeten dat het werkt.

### ⚠️ Wat het toepassen zichtbaar maakte

Productie heeft **twee** eigenaren van standaardrechten en een lege database maar
één: `postgres` én `supabase_admin`. `alter default privileges` raakt alleen die
van de rol die hem uitvoert, en `postgres` is geen lid van `supabase_admin` — die
tweede regel is dus buiten bereik.

Hij is ook onschadelijk, en dat is gemeten: standaardrechten gelden per **eigenaar
van het nieuwe object**, en alle 31 objecten in `public` zijn van `postgres`.

De controle klaagt daarom alleen over een standaardrecht van een rol die
daadwerkelijk iets bezit in `public`. **Gaat `supabase_admin` daar ooit een tabel
aanmaken, dan wordt zijn regel levend en de controle rood.** Wegfilteren zou het
gat uit beeld halen op precies het moment dat het ontstaat.

⚠️ Dit is ook een les over de lokale opstelling: die kon dit verschil niet zien.
Een schema dat op één machine klopt, is niet hetzelfde als een schema dat overal
klopt — en de controle die het vond, draaide tegen productie.
