---
description: Pakt de volgende issue uit de werkvoorraad op en bouwt hem af, in de juiste volgorde
---

Ga verder met bouwen aan Luz de Luna Lera. Argument (optioneel): $ARGUMENTS

Is er een argument meegegeven, dan is dat het issue of het onderwerp waar je aan
werkt. Zonder argument bepaal je zelf wat er aan de beurt is.

## Stap 1 — Oriënteer je

Lees, in deze volgorde:
1. `CLAUDE.md` — de grondwet. Wint van alles.
2. `docs/WERKVOORRAAD.md` — waar het project staat en in welke volgorde je werkt.
3. `docs/PRD-luz-de-luna-lera.md` — wat er gebouwd wordt en waarom.
4. Het beslisdocument dat je onderwerp raakt in `docs/decisions/`, en bij alles
   met een database `docs/decisions/003-datamodel.md` (zodra dat er is).

Haal daarna de openstaande issues op: uit Linear (project **Luz de Luna Lera**,
zie `docs/WERKVOORRAAD.md` §1 voor team en prefix), of — zolang het project
daar niet staat — uit `docs/linear/ISSUES.md`.

Controleer dat je op een werkende basis begint:
```
npm install && npm run poort
```
Staat er iets rood dat jij niet veroorzaakt hebt? Meld het en repareer dat eerst.

## Stap 2 — Kies wat er aan de beurt is

Volg de volgorde uit `docs/WERKVOORRAAD.md` §4. Binnen een milestone: hoogste
prioriteit eerst. Een onderzoeksvraag (M1) die een besluit blokkeert gaat vóór
de feature die erop wacht. Sla niets over omdat het saai is.

Zeg in één regel welk issue je oppakt en waarom dat nu aan de beurt is, vóór je
begint.

## Stap 3 — Bouw

- Branch aanmaken met de naam die Linear voorstelt (`gitBranchName` op het issue).
  Zonder Linear: `quinten/<issue-id>-<korte-naam>` uit `docs/linear/ISSUES.md`.
- Zet het issue op **In Progress**.
- Bouw het af tegen de acceptatiecriteria in het issue. Die zijn de opdracht.
- Volg `/feature` voor alles wat meer is dan een tekstwijziging: plan, bouw, tests,
  review naar risico.
- Schrijf tests mee terwijl je bouwt. Tests zijn in de solo-fase de enige review.
- Houd je aan de valkuilen in `docs/LESSEN-UIT-GOALBUDDIES.md`. Vooral: geen
  mail naar een echt mens zonder akkoord, geen geheim in de webbundel, geen
  tijdberekening buiten de gedeelde helper, en de repo is niet wat er draait.

## Stap 4 — Controleer

```
npm run poort
```
Draai die en niet een greep eruit. "Ongemeten" is niet groen.

⚠️ En één vraag erbij: waar knopen in wat je net bouwde twee correcte onderdelen
aan elkaar (site → n8n, n8n → Supabase, betaling → boeking), en staat daar een
test op? Breek daarna je eigen belofte één keer met de hand en kijk of de test
rood wordt.

Vink de acceptatiecriteria af. Alleen wat je echt gedaan hebt.

## Stap 5 — Lever op

- Commit in het Nederlands: eerste regel wat er verandert, daarna waaróm.
- Push de branch. Werk landt via een PR met een merge-commit, niet met een squash.
- Zet het issue op **In Review** met wat er staat en wat er nog open is.
- Werk `docs/WERKVOORRAAD.md` bij: status, en zo nodig de volgorde. Grep daarna op
  het feit dat je wijzigde in `CLAUDE.md`, `docs/VOLGENDE-SESSIE.md` en het PRD.
- Onzekerheden die je niet oplost → `docs/ENGINEER-REVIEW.md`.

## Stap 6 — Ga door

Pak het volgende issue. Blijf doorwerken tot je op een stopvoorwaarde stuit.

---

## Stop en vraag het aan Quinten (of via hem aan Evianne) bij

- **Grens 1:** iets dat bepaalt wat een klant van Evianne beloofd of in rekening
  gebracht wordt (prijs, termijnen, inhoud van het traject, een privacybelofte);
  iets dat geld kost of extern vastlegt (Mollie-account, n8n-abonnement, mailtool,
  betaalde tier); een eerste mail, post of melding naar echte mensen.
- **Grens 2:** iets onomkeerbaar vernietigends (data weg, `push --force`, een
  sleutel intrekken, de Fresha-configuratie aanpassen).
- Iets dat **menselijke actie** vereist: een key, een account, een
  dashboardinstelling, bronmateriaal van Evianne. Zie `docs/WERKVOORRAAD.md` §6.

Meld dan wat je nodig hebt, wat er tot dan toe af is, en wat er blijft liggen.
Ga niet zelf een work-around bedenken voor iets waar een mens één klik voor
nodig heeft — en werk ondertussen door aan het volgende issue dat er niet op wacht.

## Rapporteer elke ronde

Kort, per afgerond issue:
- wat er nu werkt
- wat er is getest, en wat níét
- wat je bewust hebt laten liggen
- wat er als volgende komt
