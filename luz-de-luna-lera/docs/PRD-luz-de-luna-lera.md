# PRD — Luz de Luna Lera: website en klantreis

> Productdefinitie. **Dit document bezit de prijs en de doelen**; elders wordt
> ernaar verwezen en niet herhaald (`npm run docs:controle` bewaakt dat).
> Bron: de vergadering van 02-09-2026 (`docs/VERGADERING-2026-09-02.md`).
> Alles met `[EVIANNE]` moet zij bevestigen vóór het een belofte aan een klant wordt.

**Versie:** 0.1, 02-09-2026 — opgesteld uit de kick-off, nog niet door Evianne gelezen.

---

## 1. Wat het is

Een website met een geautomatiseerde klantreis voor de coachingpraktijk van
Evianne. De reis begint op Instagram, leidt via een landingspagina naar een
zelftest, en via een gepersonaliseerde e-mailreeks naar het betaalde
1-op-1-traject **Roots**. Wie niet koopt, blijft in een nieuwsbrieffunnel en
stroomt later door naar laagdrempelige online producten. Alles wat terugkerend
is — mails, boekingen, betalingen, agenda, publicatie van content — wordt
geautomatiseerd, zodat Evianne haar tijd aan sessies besteedt en niet aan
administratie.

## 2. Doelgroep

Vrouwen die weten dat er iets groots in hen zit en dat willen leven, maar zich
verlamd voelen. Niet "ik ben niet productief genoeg" maar "er speelt iets
dieperliggends". Ze hebben al zelfreflectie gedaan en lopen vast. Hun
voelsprieten staan naar buiten: ze pikken de behoeften van anderen op en zetten
zichzelf achteraan. Ze komen binnen via Instagram, op een telefoon, met weinig
tijd en gezonde scepsis.

## 3. Het aanbod

### 3.1 Roots — het 1-op-1-traject

| | |
|---|---|
| Vorm | 1-op-1-begeleiding |
| Duur | 3 tot 3,5 maand |
| Prijs | circa **€ 900** `[EVIANNE]` — de exacte prijs staat in Eviannes documenten |
| Betaling | vooraf; volledig of in drie termijnen `[EVIANNE — te onderzoeken]` |
| Instap | (a) gratis kennismakingsgesprek van max 30 minuten, praktijkadres of Teams; (b) directe intake voor wie al gekozen heeft — betalen, dan de intake plannen, die de start van het traject is |
| Beschikbaarheid | di/wo/do; later ook maandagmiddag en eventueel vrijdag |

⚠️ De naam wordt in de ene samenvatting "Roots" en in de andere "Routes"
genoemd. Hier is **Roots** aangehouden `[EVIANNE]`.

### 3.2 Latere producten — het ecosysteem

Drie laagdrempelige online producten, elk onder **€ 100**, eenmalig te bouwen,
thematisch opbouwend maar los instapbaar:

1. **Voelsprieten naar binnen** — contact met de binnenwereld in plaats van de buitenwereld scannen.
2. **Grenzen** — eigen grenzen voelen en uitspreken, en de spanning die dat oproept dragen.
3. **Innerlijk kompas** — het innerlijk kompas onderscheiden van oude pijn en patronen.

Vorm (audioreeks, eenvoudige app, Telegram, eigen online omgeving) en platform
(eigen bouw heeft de voorkeur boven Kajabi of Huddle) zijn onderzoeksvragen —
zie `docs/research/README.md`. **Niet in de eerste klantreis.**

## 4. De klantreis

### 4.1 De eerste route (wat er eerst gebouwd wordt)

| Stap | Wat de bezoeker ziet | Wat het systeem doet |
|---|---|---|
| 1 | Instagram-post of advertentie | — |
| 2 | Landingspagina: herkenning, uitnodiging tot de zelftest | meet bezoek en klik |
| 3 | Zelftest "Je weet wat je wilt, maar hoeveel daarvan leef je eigenlijk?" (werktitel) — stellingen, schaal 1–5, e-mailadres aan het eind | slaat antwoorden op, vraagt toestemming, start de reeks |
| 4 | Bedankpagina met een **korte** uitslag | — |
| 5 | Mail 1 — de **uitgebreide spiegel**: de volledige, gepersonaliseerde uitslag | AI-agent schrijft op basis van antwoorden + Eviannes teksten |
| 6 | Mail 2 — herkenning | idem, per thema |
| 7 | Mail 3 — verdieping | idem |
| 8 | Mail 4 — een ervaring: audio-meditatie of -reis | levert de audio |
| 9 | Mail 5 — evaluatie, een andere kijk op het probleem | idem |
| 10 | Mail 6 — de uitnodiging voor Roots, met link naar de Roots-pagina | — |
| 11a | Koopt: Roots-pagina → boeken (kennismaking of intake) → betalen | agenda, betaling, notificatie aan Evianne mét zelftest-samenvatting |
| 11b | Koopt niet: reguliere nieuwsbrief | verplaatst naar de nieuwsbrieflijst |

Wat vast staat: de uitgebreide uitslag komt **alleen per mail** (besluit 4 in het
verslag). De tussenpozen tussen de mails staan niet in de vergadering `[EVIANNE]`.

### 4.2 De lange lus (later)

zelftest → Roots-uitnodiging → (nee) Voelsprieten → Roots → Grenzen → Roots →
Innerlijk kompas. Het 1-op-1-traject wordt na elke stap opnieuw aangeboden.

## 5. Personalisatie

- Invoer: de scores per stelling, gegroepeerd in vaste thema's ("tijd
  ontbreekt", "niet urgent", "ik raak verlamd als ik iets voor mezelf kan doen",
  "alles van een ander is belangrijker dan ik"). Herhaald hoog scoren op een
  thema stuurt welk punt de mail aanhaalt.
- Verwerking: een AI-agent (via n8n) die uitsluitend put uit Eviannes eigen
  teksten en daar een persoonlijk "point of view" van maakt.
- Eisen: **confronterend en authentiek, nooit beschamend**; geen medische,
  therapeutische of resultaatclaims; geen verzonnen advies; elke mail heeft een
  vast deel en een gepersonaliseerd deel, en Evianne kan voorbeelden lezen vóór
  de eerste echte verzending.
- Privacy: dit is de kern van het product én de grootste AVG-vraag. Zie
  domeinregel 1 in `CLAUDE.md` en `docs/research/privacy-avg.md`.

## 6. Boeken en betalen

- Twee routes (zie §3.1). De keuze praktijk/Teams is een veld in de flow.
- Eén agenda als bron van waarheid: Google Agenda, via n8n. Een dubbele boeking
  op hetzelfde slot is onmogelijk, ook bij twee gelijktijdige boekingen.
- Bij een boeking: notificatie aan Evianne met de boekingsdetails én een
  samenvatting van de zelftest, beperkt tot wat zij voor het gesprek nodig heeft.
- Betalen via een betaalprovider (Mollie of vergelijkbaar — onderzoek); de site
  ziet nooit kaartgegevens; een betaling is pas geslaagd als de provider dat
  bevestigt, niet als de bezoeker terugkomt op de bedankpagina.
- Fresha is de huidige agenda en wordt op termijn volledig vervangen; tot die
  tijd is een tijdelijke koppeling denkbaar (onderzoek).
- Facturatie later via "Jort" `[naam verifiëren]`.

## 7. De content-machine

- Twee nieuwsbrieven per week (eerst tien schrijven, elk op één zelftest-onderwerp).
- Minimaal drie Instagram-posts per week; voorraad van dertig, **eerst 5–10 om
  de toon te ijken**.
- De route naar buiten vergaand geautomatiseerd: vanuit een designtool
  inplannen en publiceren (tooling: onderzoek).
- Er moet nog een lay-out komen voor mails, zelftest, landings- en betaalpagina.

## 8. Doelen — 1 september t/m 31 december 2026

| Maand | Betaalde sessies | Per week | Cumulatief |
|---|---|---|---|
| september | 8 | 2 | 8 |
| oktober | 16 | 4 | 24 |
| november | 24 | 6 | 48 |
| december | 32 | 8 | **80** |

- **80 betaalde 1-op-1-sessies** in totaal.
- **5.000 Instagram-volgers** eind december, met een ondergrens van 2.000.
- Daarvoor is bij 2–4% conversie een instroom van circa 4.000 geïnteresseerden nodig.

**Wat we daarom vanaf dag één meten:** bezoek op de landingspagina, gestarte en
afgeronde zelftests, afgeleverde spiegel-mails (en bounces), geboekte
kennismakingen en intakes, betalingen, afmeldingen. Zonder die cijfers is het
doel een wens.

## 9. Epics en user stories

### E0 — Fundering
- Als ontwikkelaar wil ik een repo met poort, CI, documenten en agents, zodat elke sessie op een werkende basis begint.
- Als ontwikkelaar wil ik een Supabase-project, een n8n-instantie en een Hostinger-omgeving met env vars, zodat er iets te deployen is.

### E1 — Onderzoek en besluiten
- Als Evianne wil ik weten wat de AVG eist van de zelftest en de gepersonaliseerde mails, zodat ik geen risico loop.
- Als Evianne wil ik weten welke betaalprovider ik nodig heb en wat dat kost, zodat ik een account kan openen.
- Als Evianne wil ik een advies over kennismaking versus intake met betaalmoment, zodat de flow converteert én klikt.
- Als Evianne wil ik weten of Fresha kan blijven tot de eigen module er is, en hoe Google Agenda gekoppeld wordt.
- Als Evianne wil ik weten welke vorm en welk platform de latere producten krijgen, zodat ik niet in Kajabi hoef.
- Als Evianne wil ik een werkwijze en tooling voor nieuwsbrieven en Instagram, zodat drie posts per week haalbaar is.

### E2 — Landingspagina, zelftest, bedankpagina, spiegel
- Als bezoeker wil ik op mijn telefoon in twee minuten de zelftest doen zonder iets kwijt te raken.
- Als bezoeker wil ik direct een korte uitslag zien en de uitgebreide uitslag in mijn mail.
- Als bezoeker wil ik precies weten waar ik toestemming voor geef en me altijd kunnen afmelden.
- Als Evianne wil ik dat de spiegel klinkt als ik, en confronteert zonder te beschamen.

### E3 — De e-mailfunnel en de nieuwsbrief
- Als bezoeker wil ik vier mails die op elkaar voortbouwen en op mijn antwoorden ingaan.
- Als bezoeker wil ik een audio-ervaring kunnen beluisteren zonder account.
- Als bezoeker wil ik na de uitnodiging óf boeken óf rustig in de nieuwsbrief blijven.
- Als Evianne wil ik elke mail eerst zelf ontvangen voordat een klant hem krijgt.

### E4 — Roots boeken en betalen
- Als onzekere klant wil ik gratis kennismaken, op de praktijk of via Teams.
- Als zekere klant wil ik betalen (volledig of in termijnen) en daarna mijn intake plannen.
- Als Evianne wil ik elke boeking in mijn Google Agenda met de zelftest-samenvatting erbij.
- Als Evianne wil ik nooit een dubbele boeking en nooit een boeking zonder bevestigde betaling in flow 2.

### E5 — De content-machine
- Als Evianne wil ik tien nieuwsbrieven en dertig posts klaar hebben, in mijn toon, met eerst een kleine proef.
- Als Evianne wil ik posts en nieuwsbrieven vanuit één plek inplannen en automatisch publiceren.

### E6 — Het productecosysteem (later)
- Voelsprieten naar binnen, Grenzen, Innerlijk kompas in een eigen omgeving; de lange lus uit §4.2.

### E7 — Koppelingen (later)
- Fresha (overgang), Jort (facturatie).

## 10. Niet-functionele eisen

- **Privacy by design.** Minimale opslag, expliciete en gelogde toestemming, EU-opslag, verwijderpad, geen PII in logs. Zie `CLAUDE.md` domeinregels 1–3.
- **Mobiel eerst.** Alle pagina's op een telefoon met wisselend bereik.
- **Aflevering.** SPF, DKIM en DMARC op het verzenddomein; double opt-in; een werkende afmeldlink in elke mail; bounces verwerkt.
- **Kosten.** Elke AI-call gelogd per lead, met cache en dagquotum. Gratis tiers waar mogelijk; alles wat een betaalde tier vraagt gemarkeerd met `TODO(paid-tier)`.
- **Meetbaar.** De cijfers uit §8 komen uit het systeem, niet uit een spreadsheet.
- **Toegankelijk.** Labels, contrast, toetsenbord; geen emoji in UI-tekst.
- **Nederlands**, jij-vorm, in Eviannes stem (content) en helder en neutraal (UI).

## 11. Wat het níét is (nu)

Geen ledenomgeving of cursusplatform (E6 is later), geen mobiele app, geen
advertentiebeheer, geen boekhouding. Geen tweede taal.

## 12. Open vragen

Zie `docs/research/README.md`. De belangrijkste vijf: AVG-grondslag en
verwerkers voor de zelftestdata; betaalprovider en termijnen; kennismaking
versus intake; Fresha en Google Agenda; contenttooling.
