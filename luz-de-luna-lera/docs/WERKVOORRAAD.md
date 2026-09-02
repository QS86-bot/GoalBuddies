# Werkvoorraad — waar het project staat en hoe je verdergaat

> **Lees dit als eerste in een nieuwe sessie.** Dit bestand is de overdracht:
> wat er staat, wat er nog moet, in welke volgorde, en waar je jezelf pijn doet
> als je het overslaat. Bijwerken is onderdeel van het werk: sluit je een issue
> af, werk dan ook dit bestand bij — en grep daarna op het feit in `CLAUDE.md`,
> `docs/VOLGENDE-SESSIE.md` en het PRD.

**Laatst bijgewerkt:** 02-09-2026 (projectmap opgezet uit de kick-off van dezelfde dag)

---

## 0. De stand in tien regels

1. **Er is nog niets gebouwd.** Op 02-09-2026 is de kick-off geweest
   (`docs/VERGADERING-2026-09-02.md`) en is deze projectmap opgezet met de
   gereedschapskist, de agents en de lessen uit GoalBuddies. Dat is alles.
2. **Er is nog geen Supabase-project, geen n8n-instantie en geen adres op
   Hostinger.** Die drie zijn M0 en vragen accounts van Quinten (§6).
3. **De steiger draait.** De poort telt 12 stappen, allemaal gemeten; de suite
   geeft **266 geslaagd**. Dat bewijst dat het gereedschap werkt, niet dat er
   een product is.
4. **Twee onderzoeksvragen blokkeren het meeste werk:** `privacy-avg` en
   `betalen-mollie`. Begin daar (M1) zodra M0 staat — of eerder, want ze vragen
   geen omgeving.
5. **Content kan pas als de bron er is.** `docs/content/bron/` is leeg tot
   Evianne haar teksten aanlevert. Zonder bron schrijft de content-agent niets.
6. **Het Linear-project bestaat nog niet.** `docs/linear/ISSUES.md` is de
   importlijst én het vangnet; `/verder` werkt eruit tot Linear er is.
7. **De volgorde is M0 → M1 → M2 → M3 → M4 → M5.** M2 (de eerste klantreis) gaat
   vóór de rest van de website; dat is een besluit uit de vergadering.
8. **Vijf besluiten zijn al genomen** en staan in §9. Prijs, naam van het
   traject en termijnen zijn géén besluiten maar `[EVIANNE]`-markeringen in het PRD.
9. **Wat op mensen wacht staat in §6** — bronmateriaal en voorbeeldposts van
   Evianne, accounts en kostenbesluiten van Quinten.
10. **De valkuilen staan in `docs/LESSEN-UIT-GOALBUDDIES.md`**, 64 stuks. De
    vijf die hier het meest tellen staan in §7.

---

## 1. Waar alles staat

| Wat | Waar |
|---|---|
| Projectmap | `C:\Users\Quint\.claude\projects\Luz de Luna Lera` `[na kopiëren]` |
| Code | GitHub `[owner/repo — in te vullen bij LDL-1]`, hoofdbranch `main` |
| Werkvoorraad | Linear, project **Luz de Luna Lera** `[team en prefix — LDL-6]`; tot dan `docs/linear/ISSUES.md` |
| Database | Supabase `[projectnaam, ref, regio — LDL-2]`, gratis tier |
| Automatisering | n8n `[cloud of zelf gehost — LDL-3]` |
| Hosting | Hostinger `[account, map, adres — LDL-4]` |
| Agenda | Google Agenda van Evianne |
| Bronmateriaal | `docs/content/bron/` (lokaal, niet in git) |

**Linear is de bron van waarheid voor wát er gebouwd moet worden** zodra het
project er staat. Dit bestand zegt alleen in welke volgorde en waar de valkuilen zitten.

---

## 2. Wat er nu draait

**Database — niets.** Eerst `docs/decisions/003-datamodel.md` (LDL-11), dan migraties.

<!-- STAND:BEGIN — gegenereerd door `npm run stand` -->
Er staan nog geen migraties in `supabase/migrations/`.
<!-- STAND:EINDE -->

⚠️ Dat blok is gegenereerd; met de hand bijwerken heeft geen zin. Draai
`npm run stand`; `stand:controle` wordt rood zodra het achterloopt.

**De steiger — af.** `scripts/README.md` somt op wat er is en wat er bewust niet
is meegenomen. Elke controle heeft een ijkingstest in `tests/scripts/`.

**Agents en commands — af.** Tien agents in `.claude/agents/` (zeven uit
GoalBuddies aangepast, drie nieuw: `automation-engineer`, `content-writer`,
`privacy-reviewer`) en vijf commands (`/feature`, `/verder`, `/audit`,
`/content`, `/onderzoek`).

**Documenten — af voor de start.** PRD, vergaderverslag, beslisdocumenten 001 en
002, onderzoeksindex, issuelijst, Bolt-promptlogboek, contentbriefing, deploy,
reviewdossier, lessen. Alles met `[in te vullen]` of `[EVIANNE]` wacht op een mens.

---

## 3. Wat een nieuwe sessie als eerste doet

1. Lees `CLAUDE.md`. Dat is de grondwet en wint van alles hieronder.
2. Lees dit bestand.
3. Lees het beslisdocument dat je onderwerp raakt; bij databasewerk
   `docs/decisions/003-datamodel.md` zodra dat bestaat.
4. Haal de openstaande issues op (Linear of `docs/linear/ISSUES.md`).
5. Controleer of `.env` bestaat en gevuld is (§6).
6. Draai `npm install && npm run poort` om te zien dat je op een werkende basis begint.

### 3b. Het merge-ritueel

De eenheid is één issue. Eén branch per issue met de naam die Linear voorstelt;
landen via een PR met een merge-commit, niet met een squash. Vóór elke merge:

```bash
npm run poort
```

En dan de stappen die geen machine voor je doet:

- **De reviewagents die bij deze wijziging horen**, naar risico: `security-reviewer`
  en `privacy-reviewer` direct bij alles wat auth, RLS, betalingen, boekingen,
  webhooks, een AI-prompt of gebruikersdata raakt; `code-critic` en
  `critical-user` één keer per milestone, samen. Verifieer elke bevinding zelf.
- **Vergelijk de SHA van de groene run met de kop van de PR.**
- **Loop de flow zelf door** op een telefoon als er een scherm of een mail bij
  zit. Een groene suite meet niet of het te gebruiken is.

---

## 4. Uitvoeringsvolgorde

Zes milestones, in deze volgorde. De reden staat erbij; de issues in
`docs/linear/ISSUES.md`.

| # | Milestone | Issues | Waarom nu |
|---|---|---|---|
| M0 | Fundering | LDL-1 t/m 6 | zonder omgevingen is er niets te deployen; zonder poort in CI geen review |
| M1 | Onderzoek en besluiten | LDL-7 t/m 10c | privacy en betalen blokkeren datamodel, mails en betaalpagina; vragen geen omgeving, kunnen parallel aan M0 |
| M2 | De eerste klantreis | LDL-11 t/m 16 | de vergadering koos: eerst de converterende route, dan de rest van de site |
| M3 | De e-mailfunnel | LDL-17, 18 | bouwt op de spiegel en de personalisatie van M2 |
| M4 | Roots boeken en betalen | LDL-19 t/m 21 | vraagt de besluiten uit M1 (provider, flow) |
| M5 | De content-machine | LDL-22 t/m 25 | kan parallel zodra de bron er is; publicatie-automatisering wacht op `contenttooling` |
| Later | Ecosysteem en koppelingen | LDL-26 t/m 30 | na M4 en na `eigen-platform` |

Binnen een milestone: hoogste prioriteit eerst. Een onderzoeksvraag die een
feature blokkeert, gaat vóór die feature.

---

## 6. Wat menselijke actie vereist

| Wie | Wat | Blokkeert |
|---|---|---|
| Evianne | de tekstdatabase in `docs/content/bron/` zetten (via Quinten) | alle content, de spiegel |
| Evianne | 5–10 voorbeeld-Instagramposts kiezen om de toon te ijken | LDL-23 |
| Evianne | de naam (Roots/Routes), de prijs en de termijnen bevestigen in het PRD | LDL-21, 19 |
| Evianne | de Fresha-configuratie controleren op betalingen | `fresha-en-agenda` |
| Evianne | akkoord op elke mail vóór hij naar een echt mens gaat | M2, M3 |
| Quinten | Supabase-project aanmaken (gratis tier, EU) | LDL-2 |
| Quinten | n8n: cloud of zelf gehost — kostenbesluit | LDL-3 |
| Quinten | Hostinger-adres en toegang | LDL-4 |
| Quinten | GitHub-repo aanmaken en deze map pushen | LDL-1 |
| Quinten | ruimte in Linear (gratis limiet) of besluit om uit `ISSUES.md` te werken | LDL-6 |
| Quinten | AI-sleutel en dagbudget | LDL-16 |
| Quinten / Evianne | betaalprovider-account (contractpartij is Evianne) | LDL-19 |
| Quinten | toegang tot de Google Agenda (service-account) | LDL-20 |

Loop je vast op iets uit deze tabel: zet het erbij, meld het, en ga door met het
volgende issue dat er niet op wacht.

---

## 7. Valkuilen — hier gaat het mis

De volledige lijst staat in `docs/LESSEN-UIT-GOALBUDDIES.md`. Deze vijf tellen
hier het zwaarst:

1. **Een mail naar een echt mens is onomkeerbaar.** Elke workflow heeft een
   proefpad; de schakelaar gaat om na akkoord van Evianne. (Les 59, grens 1.)
2. **De repo is niet wat er draait — dubbel bij n8n.** Export is de bron. Een
   workflow die in de instantie is aangepast en niet geëxporteerd, bestaat niet.
   (Les 41.)
3. **Elk onderdeel klopt en het geheel lekt.** De naden hier: site → n8n,
   n8n → Supabase, betaling → boeking, antwoorden → prompt → mail. Daar hoort
   een test. (Les 15–17.)
4. **De regel is pas afgedwongen als de database hem afdwingt.** "Geen boeking
   zonder betaling" en "geen mail zonder toestemming" zijn constraints en
   policies, geen n8n-checks. (Les 29, besluit 002 §2.)
5. **Een groene suite meet niet of het te gebruiken is.** Loop de zelftest zelf
   door op een telefoon, vanaf een Instagram-link, tot en met de mail in je
   inbox. (Les 9.)

---

## 8. Openstaande onzekerheden

Zie `docs/research/README.md` (acht vragen) en `docs/ENGINEER-REVIEW.md` (drie
rijen op 02-09). De grootste: of de zelftest-antwoorden als gezondheidsgegevens
gelden — dat bepaalt de toestemmingsteksten, de verwerkers en of de AI-aanbieder
buiten de EU mag staan.

---

## 9. Beslissingen die al genomen zijn

| # | Besluit | Bron |
|---|---|---|
| A1 | De zelftest gebruikt een schaal van 1–5 per stelling | vergadering, sleutelbesluit |
| A2 | Het kennismakingsgesprek is gratis, max 30 minuten, praktijk of Teams | vergadering, sleutelbesluit |
| A3 | Instagram begint met 5–10 posts om de toon te ijken vóór de dertig | vergadering, sleutelbesluit |
| A4 | De uitgebreide uitslag komt uitsluitend per mail; de pagina toont een korte | vergadering |
| A5 | Eerst de eerste klantreis operationeel, dan de rest van de website | vergadering |
| B1 | Beslisbevoegdheid: één grens in plaats van een lijst | `docs/decisions/001-beslisbevoegdheid.md` |
| B2 | Waarheid in Supabase, gedrag in n8n, weergave in Bolt; nooit dezelfde regel op twee plekken | `docs/decisions/002-stack-en-werkverdeling.md` |
| B3 | Voor elk nieuw oppervlak geldt de strengste privacylezing tot `privacy-avg` iets anders zegt | `CLAUDE.md` domeinregel 1 |
