---
description: Pakt de volgende issue uit de Linear-werkvoorraad op en bouwt hem af, in de juiste volgorde
---

Ga verder met bouwen aan GoalBuddies. Argument (optioneel): $ARGUMENTS

Is er een argument meegegeven, dan is dat het issue of het onderwerp waar je aan
werkt. Zonder argument bepaal je zelf wat er aan de beurt is.

## Stap 1 — Oriënteer je

`CLAUDE.md` is de grondwet en wint van alles. Hij staat al in je context — niet
opnieuw inlezen. Lees wél:
1. `docs/WERKVOORRAAD.md` — waar het project staat en in welke volgorde je werkt.
2. `docs/decisions/001-datamodel.md` — als je iets met de database doet.

Haal daarna de openstaande issues op uit Linear: project **GoalBuddies**, team
`QS86-bot Linear`. Kijk naar status, milestone en prioriteit.

Controleer dat je op een werkende basis begint:
```
npm install && npm run typecheck && npm run lint && npm test
```
Staat er iets rood dat jij niet veroorzaakt hebt? Meld het en repareer dat eerst.

## Stap 2 — Kies wat er aan de beurt is

Volg de volgorde uit `docs/WERKVOORRAAD.md` §4. Binnen een epic: hoogste
prioriteit eerst. Sla niets over omdat het saai is.

Zeg in één regel welk issue je oppakt en waarom dat nu aan de beurt is, vóór je
begint.

## Stap 3 — Bouw

- Branch aanmaken met de naam die Linear zelf voorstelt (`gitBranchName` op het
  issue). Dan koppelen branch, PR en issue automatisch.
- Zet het issue in Linear op **In Progress**.
- Bouw het af tegen de acceptatiecriteria die in het issue staan. Die criteria
  zijn de opdracht, niet een suggestie.
- Schrijf tests mee terwijl je bouwt. `CLAUDE.md`: tests zijn in de solo-fase de
  enige review die bestaat.
- Houd je aan de valkuilen uit `docs/WERKVOORRAAD.md` §7. Vooral: geen tijd
  buiten `shared/time`, geen kleuren buiten `shared/theme`, en falen is nooit
  publiek.

## Stap 4 — Controleer

Alle drie moeten groen zijn vóór je commit:
```
npm run typecheck && npm run lint && npm test
```

⚠️ **En één vraag erbij, want groen is niet hetzelfde als bewaakt.** Waar knopen
in wat je net bouwde twee correcte onderdelen aan elkaar, en staat daar een test
op? Drie keer in de week van 24-08 lekte het geheel terwijl elk onderdeel klopte
en de suite groen bleef. De uitgeschreven versie staat in `CLAUDE.md` bij
onwrikbare regel 18.

Breek daarna je eigen belofte één keer met de hand en kijk of de test rood
wordt. Een test die je niet rood hebt gezien, bewaakt niets.

Vink daarna de acceptatiecriteria in het Linear-issue af. Alleen wat je echt
gedaan hebt — een afgevinkt vakje dat niet klopt is erger dan een leeg vakje.

## Stap 5 — Lever op

- Commit in het Nederlands: eerste regel wat er verandert, daarna waaróm.
  Verwijs bij een niet-vanzelfsprekende keuze naar `docs/decisions/NNN-*.md`.
- Push de branch.
- Zet het issue op **In Review** met een korte samenvatting van wat er staat en
  wat er nog open is.
- Werk `docs/WERKVOORRAAD.md` bij: status, en zo nodig de volgorde.
- Onzekerheden die je niet oplost → `docs/ENGINEER-REVIEW.md`, met datum,
  bestand, risico en één regel uitleg.

## Stap 6 — Ga door

Pak het volgende issue. Blijf doorwerken tot je op een stopvoorwaarde stuit.

---

## Stop en vraag het aan Quinten bij

- Iets dat **menselijke actie** vereist: een key, een dashboardinstelling, een
  installatie, een betaalde tier. Zie `docs/WERKVOORRAAD.md` §6.
- Een **migratie op een database met data erin**. `pg_dump` eerst; de gratis
  tier heeft geen automatische backups.
- Een besluit uit `docs/WERKVOORRAAD.md` §9 dat je zou willen omgooien.

Meld dan wat je nodig hebt, wat er tot dan toe af is, en wat er blijft liggen.
Ga niet zelf een work-around bedenken voor iets waar een mens één klik voor
nodig heeft.

⚠️ **En verder stop je niet.** Een architectuurkeuze waar je niet zeker over
bent is géén stopvoorwaarde: `CLAUDE.md`, Beslisbevoegdheid, zegt dat je dan de
conservatiefste optie kiest die het werk áf maakt, doorbouwt, en de aanname
zichtbaar zet in het issue én in het beslisdocument. Datzelfde geldt voor een
dependency toevoegen, het datamodel van een bestaande tabel wijzigen,
auth-/RLS-/goedkeuringslogica aanpassen, een migratie op het echte project
draaien en meer dan 15 bestanden aanraken — die zijn op 22-08-2026 van gate naar
afweging gegaan: je beslist ze zelf en je verantwoordt ze.

## Rapporteer elke ronde

Kort, per afgerond issue:
- wat er nu werkt
- wat er is getest, en wat níét
- wat je bewust hebt laten liggen
- wat er als volgende komt
