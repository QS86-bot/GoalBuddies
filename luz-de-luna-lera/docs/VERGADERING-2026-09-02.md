# Vergadering 02-09-2026 — Website en klantreis voor de coachingpraktijk

> Samengesteld uit twee samenvattingen van hetzelfde gesprek (een
> redenerende samenvatting en de notulen met tijdstempels). Waar de twee elkaar
> aanvullen staan ze hier samen; waar ze verschillen staat dat onder §9.
> Dit document is een **verslag**: wat er besloten is staat in het PRD en de
> beslisdocumenten, wat er moet gebeuren in `docs/linear/ISSUES.md`.

**Deelnemers:** Evianne (coach, opdrachtgever) en Quinten (ontwikkelaar).
**Onderwerp:** een nieuwe website met een geautomatiseerde klantreis, van
Instagram via een zelftest en een e-mailreeks naar het betaalde 1-op-1-traject
"Roots", met later een doorstroom naar laagdrempelige online producten.

---

## 1. Opzet: twee co-work sessies

Evianne heeft al veel voorwerk gedaan: teksten over zichzelf en haar praktijk, en
een landingspagina die voor 90% klaar is. Daarom zijn er twee sessies:

| Sessie | Inhoud |
|---|---|
| **1 — functioneel en technisch** | de functionele omschrijving van website en funnel, de backend (Supabase, n8n), het Linear-project, de prompts voor Bolt |
| **2 — content** | vijf categorieën tekst uit Eviannes bestaande database: de zelftest, een e-mailfunnel van zes mails, de uitnodiging voor het 1-op-1-traject, tien nieuwsbrieven, tien Instagram-posts |

## 2. Sleutelbesluiten

1. **De zelftest gebruikt een schaal van 1 tot 5** ("in hoeverre herken je je
   hierin") per stelling. Reden: scherpere herkenning en een betere weging dan
   scenariokeuzes, die "net naast" de ervaring kunnen zitten.
2. **Het kennismakingsgesprek is gratis, maximaal 30 minuten**, met keuze tussen
   het praktijkadres en Teams. Reden: drempel verlagen, flexibiliteit.
3. **Instagram begint met een kleine batch van 5–10 posts** om de toon te ijken
   vóór er dertig geproduceerd worden.
4. **De uitgebreide uitslag van de zelftest komt uitsluitend per e-mail.** Op de
   bedankpagina staat alleen een korte uitslag. Reden: de bezoeker gaat naar haar
   inbox (en haalt de mail zo nodig uit spam), wat de aflevering van de rest van de
   reeks ten goede komt.
5. **Eerst de eerste klantreis operationeel, dan pas de rest van de website.**

## 3. De eerste klantreis

```
Instagram (organisch of advertentie)
  → landingspagina (doelgroeptekst, uitnodiging tot de zelftest)
  → zelftest "Je weet wat je wilt, maar hoeveel daarvan leef je eigenlijk?"
      (werktitel; stellingen op schaal 1–5; e-mailadres aan het eind)
  → bedankpagina met korte uitslag
  → e-mail 1: de "uitgebreide spiegel" (volledige uitslag, gepersonaliseerd)
  → e-mail 2: herkenning
  → e-mail 3: verdieping
  → e-mail 4: een ervaring (audio-meditatie of -reis, kennismaking met de werkwijze)
  → e-mail 5: evaluatie en een andere kijk op het probleem
  → e-mail 6: de uitnodiging voor het Roots-traject
      ├─ koopt → landingspagina Roots → betaalpagina → afspraak plannen
      └─ koopt niet → reguliere nieuwsbrieffunnel (warm houden, geen verkoopdruk)
```

De notulen tellen "3 tot 4" funnelmails ná de spiegel plus de uitnodiging; de
samenvatting noemt een reeks van vier plus de uitnodiging. Samen met de spiegel
zijn dat de zes mails uit de contentopdracht.

**De doelgroep:** vrouwen die weten dat er iets groots in hen zit en dat willen
leven, maar zich verlamd voelen — geen productiviteitsprobleem maar iets
dieperliggends. Ze hebben al zelfreflectie gedaan en lopen vast; hun
"voelsprieten" staan sterk naar buiten gericht, op de behoeften van anderen.

## 4. Personalisatie en de AI-agent

- De antwoorden (1–5 per stelling) worden opgeslagen in n8n; een AI-agent maakt
  daar sterk gepersonaliseerde mails van, te beginnen bij de uitgebreide spiegel.
- De agent slaat een brug tussen de pijnpunten uit de test en Eviannes eigen
  visie, en put daarbij uit haar al geschreven teksten.
- Vaste thema's of "redenblokken" (zoals "tijd ontbreekt", "niet urgent") sturen
  de personalisatie: kiest iemand herhaaldelijk een bepaald antwoord, dan komt
  dat thema herkenbaar en persoonlijk terug ("ik raak verlamd als ik iets voor
  mezelf kan doen", "ik vind alles van een ander belangrijker dan mezelf").
- **Eis van Evianne:** confronterend en authentiek; absoluut geen verzameling
  algemene teksten.
- Dit roept privacy- en AVG-vragen op: waar staan de gegevens, wat mag ermee, en
  is een extern e-mailmarketingprogramma nodig of kan de funnel zelfgebouwd
  blijven? **Onderzoek gestart** (actiepunt).
- Er moet nog een professionele lay-out komen voor de mails, de zelftest, de
  landingspagina en de betaalpagina ("Claude Design" of in de co-work).

## 5. Boeken en betalen voor het Roots-traject

| | Flow 1 — de onzekere klant | Flow 2 — de zekere klant |
|---|---|---|
| Stap | plant een gratis kennismakingsgesprek | klikt "ja, ik wil samenwerken" |
| Duur | max 30 minuten | intake, tevens de start van het traject |
| Locatie | praktijkadres of Teams (keuzeveld) | idem |
| Betaling | geen | vooraf, volledig of in drie termijnen (te onderzoeken) |

- Het traject duurt 3 tot 3,5 maand en kost circa € 900 (exacte prijs in
  Eviannes documenten; zie het PRD).
- Elk product krijgt een eigen landings- en betaalpagina.
- **Nu:** Fresha voor de agenda; betalingen zijn daar nog niet ingeregeld.
  **Straks:** een eigen boekingsmodule op de site, gekoppeld aan Google Agenda,
  die Fresha volledig vervangt.
- Bij een boeking krijgt Evianne een notificatie in haar agenda mét een
  samenvatting van de ingevulde zelftest, om zich voor te bereiden.
- Later: een koppeling met "Jort" voor de facturatie (naam nog te verifiëren).

## 6. Toekomst: het productecosysteem

Drie laagdrempelige online producten (elk onder € 100, eenmalig te bouwen), die
thematisch op elkaar voortbouwen maar los instapbaar zijn:

1. **Voelsprieten naar binnen** — weer contact maken met de binnenwereld in
   plaats van de buitenwereld scannen (beschreven in "prompt eerste klantreis").
2. **Grenzen** — eigen grenzen voelen en uitspreken, en omgaan met de spanning.
3. **Innerlijk kompas** — het verschil leren voelen tussen het innerlijk kompas
   en de stemmetjes van oude pijn of patronen.

De funnel op lange termijn: zelftest → uitnodiging Roots → (niet gekocht) →
Voelsprieten → uitnodiging Roots → Grenzen → uitnodiging Roots → Innerlijk
kompas. Het 1-op-1-traject wordt na elke stap opnieuw aangeboden.

Hosting van die producten: liever een **eigen online omgeving** dan Huddle
(weinig animo) of Kajabi (beter, maar vermoedelijk duurder en Evianne werkt er
niet mee). Plug&Pay wordt genoemd als zeer goed voor landings- en
betaalpagina's. Eisen aan een eigen omgeving: e-mailfunnel onderhouden, een
omgeving of app voor grotere producten, minimale abonnementskosten, naadloze
integratie met de rest van de site. De vorm (audioreeks, app, Telegram, eigen
omgeving) is nog te onderzoeken.

## 7. Doelen en cijfers

Zie het PRD §8 voor de doelen zelf; hier alleen de context uit het gesprek.

- Sessieopbouw per maand van september tot en met december, met beschikbaarheid
  op dinsdag, woensdag en donderdag, later uitgebreid met maandagmiddag en
  eventueel vrijdag.
- Om dat te halen is een instroom van enkele duizenden geïnteresseerden nodig bij
  een conversie van 2–4%; vandaar het volgersdoel op Instagram, met een
  ondergrens.
- Commitment: minimaal drie Instagram-posts per week; twee nieuwsbrieven per
  week gesuggereerd, niet te ver vooruit plannen.
- De "route naar buiten" moet vergaand geautomatiseerd: vanuit een designtool
  direct inplannen en publiceren (tooling zoals InDesign of Canva te onderzoeken).

## 8. Techniek en projectmanagement

| Onderdeel | Keuze |
|---|---|
| Frontend | Bolt (genereert de site uit prompts) |
| Backend | Claude Cowork bouwt hem; n8n is de spil van alle automatisering |
| Database | Supabase |
| Hosting | Hostinger |
| Versiebeheer | GitHub; alle projectbestanden ook lokaal bij Evianne |
| Projectmanagement | Linear: mijlpalen, functies, issues en de bijbehorende Bolt-prompts |
| Agenda | Google Agenda |
| Later | koppeling Fresha (tijdelijk) en Jort (facturatie) |

## 9. Waar de twee samenvattingen verschillen of onduidelijk zijn

| Punt | Samenvatting A | Notulen B | Hier aangehouden |
|---|---|---|---|
| Naam van het traject | "Roots" | "Routes-traject" | **Roots** — te bevestigen bij Evianne |
| Aantal funnelmails | reeks van vier na de spiegel, dan de uitnodiging | 3 tot 4, dan de uitnodiging | zes mails in totaal (spiegel + vier + uitnodiging), zoals de contentopdracht zegt |
| "Cloud Cowork", "Cloud Design", "NETN" | — | letterlijk uit de transcriptie | Claude Cowork, Claude Design, n8n |
| Fresha | koppeling met Google Agenda bouwen | Fresha tijdelijk koppelen, daarna vervangen | Fresha is overgang; het doel is een eigen module op Google Agenda |
| "Jort" | facturatie | facturatie | naam en product verifiëren vóór er iets gebouwd wordt |

## 10. Actiepunten

**Voor Claude (dit project)**
- [ ] Twee co-work sessies: (1) de functionele omschrijving van website en funnel; (2) de content in vijf categorieën.
- [ ] De backend bouwen (Hostinger, n8n, GitHub, Supabase), het project in Linear opzetten met mijlpalen en issues, alles documenteren, prompts voor Bolt schrijven.
- [ ] Onderzoek privacy en AVG bij persoonlijke input en gepersonaliseerde mails: conflicten, wettelijke eisen, oplossingsrichting, en of een extern mailprogramma nodig is.
- [ ] Onderzoek betaalverkeer: welke provider (Mollie of vergelijkbaar), wat is er nodig voor een account, betaalpagina's per product, betaling in drie termijnen.
- [ ] Onderzoek en adviseer de boekingsflow: kennismaking versus intake met betaalmoment, technische inrichting in de site en n8n.
- [ ] Onderzoek betalingen in Fresha, de koppeling Fresha–Google Agenda, en op termijn het vervangen van Fresha.
- [ ] Onderzoek de vorm en het platform voor toekomstige producten (eigen omgeving, app, audioreeks, Telegram) tegenover Huddle of Kajabi.
- [ ] Onderzoek workflow en tooling voor designgestuurde contentcreatie en planning (nieuwsbrieven, Instagram).
- [ ] Onderzoek de toekomstige koppeling met Jort voor facturatie.
- [ ] Een eerste set van 5–10 Instagram-posts (na Eviannes voorbeelden).
- [ ] Schrijf en bouw de landingspagina voor het 1-op-1-traject, inclusief betaalpagina en agenda-integratie.

**Voor Evianne**
- [ ] De huidige Fresha-configuratie controleren op betaalmogelijkheden en een structurele betaalprovider (zoals Mollie) onderzoeken.
- [ ] 5 tot 10 voorbeelden van Instagram-content selecteren om de toon te valideren.
- [ ] (Impliciet) De tekstdatabase aanleveren voor de content-sessie: `docs/content/bron/`.

Geen van de actiepunten heeft een datum gekregen.
