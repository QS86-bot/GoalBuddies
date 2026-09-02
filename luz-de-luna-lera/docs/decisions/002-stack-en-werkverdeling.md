# 002 — Stack en werkverdeling: wat hoort waar

| | |
|---|---|
| **Status** | vastgesteld 02-09-2026 op de kick-off; §4 (n8n-hosting) wacht op een kostenbesluit |
| **Volgt uit** | `docs/VERGADERING-2026-09-02.md` §8 |
| **Raakt** | de mappenstructuur, `CLAUDE.md` Architectuur, elke agent |

> De vergadering koos de bouwstenen. Dit document zegt welke logica in welke
> bouwsteen hoort, want "n8n is de spil" en "Supabase is de database" laten
> precies de vraag open waar een regel als "geen boeking zonder betaling" leeft.

## 1. De bouwstenen

| Bouwsteen | Rol | Wie bouwt |
|---|---|---|
| **Bolt** | genereert de frontend uit prompts | `frontend-engineer` schrijft de prompt, beoordeelt en repareert de export |
| **Supabase** | de database, RLS, databasefuncties; de **bron van waarheid** voor contacten, zelftests, toestemmingen, boekingen, betalingen | `backend-engineer` |
| **n8n** | de spil: webhooks, mails, de AI-agent, Google Agenda, de betaalprovider, publicatie | `automation-engineer` |
| **Hostinger** | hosting van de statische site (en mogelijk n8n) | — |
| **GitHub** | versiebeheer; ook de n8n-exports en de Bolt-prompts | — |
| **Linear** | werkvoorraad | — |
| **Google Agenda** | de agenda van Evianne | — |

## 2. De regel: waarheid in Supabase, gedrag in n8n, weergave in Bolt

1. **Elke regel die over data gaat, leeft in de database** — als constraint,
   trigger of RLS-policy. "Geen dubbele boeking", "geen boeking zonder
   betaling in flow 2", "geen mail zonder toestemming" zijn geen n8n-checks
   maar databaseregels; n8n kan ze niet omzeilen omdat n8n via de REST-API
   praat onder een rol die RLS respecteert (behalve waar expliciet
   `service_role` gedocumenteerd is).
2. **Elke handeling met een buitenwereld, leeft in n8n** — versturen, plannen,
   betalen, publiceren, de AI aanroepen. Idempotent, met foutpad, geëxporteerd
   naar git.
3. **De frontend weet niets** — hij toont, valideert voor de UX, en doet één
   POST naar een geauthenticeerde webhook of leest via de publieke client
   onder RLS. Geen logica die ook ergens anders staat.
4. **Nooit dezelfde regel op twee plekken.** Twee kopieën lopen uit elkaar
   (les 1 en 15 in `docs/LESSEN-UIT-GOALBUDDIES.md`). Een client-validatie
   herhaalt de serverregel voor de UX, maar de server is de grens.
5. **Tijd op één plek.** Eén gedeelde helper voor Europe/Amsterdam en UTC,
   gebruikt door de site, de databasefuncties en n8n. Geen losse
   datumberekening in een Code-node.

## 3. De mappenstructuur

```
web/                  de Bolt-export (frontend)
supabase/migrations/  het schema, genummerd, idempotent, met rollback-pad
supabase/functions/   serverfuncties als ze nodig zijn (Deno)
n8n/workflows/        elke workflow als JSON-export — de bron
n8n/templates/        mailsjablonen (HTML)
docs/                 PRD, werkvoorraad, besluiten, onderzoek, content, prompts
scripts/ tests/       de gereedschapskist en zijn ijkingstests
```

## 4. Open: waar draait n8n

n8n Cloud (abonnement, geen onderhoud, executies met persoonsgegevens bij een
verwerker) of zelf gehost op Hostinger (VPS nodig, onderhoud, data in eigen
hand). Dit is een kostenbesluit (grens 1) en een privacyvraag; zie
`docs/research/README.md`, slug `n8n-hosting`. **Tot het besluit er is, bouwt
`automation-engineer` niets dat maar op één van beide werkt.**

## 5. Wat dit níét is

- Geen keuze voor een mailmarketingtool. Of de mails via een eigen kanaal
  (SMTP/API vanuit n8n) of via een extern programma gaan, volgt uit
  `privacy-avg`.
- Geen keuze voor een betaalprovider. Volgt uit `betalen-mollie`.
- Geen belofte dat Bolt alles kan. Wat Bolt niet goed doet, repareert een mens
  in `web/`, en dat staat in `docs/bolt/PROMPTS.md`.

## Herbevestigen vóór

- Het eerste product uit E6 (een eigen online omgeving vraagt mogelijk een
  ingelogde gebruiker en dus auth in Supabase — dat verandert de RLS-basis).
- De dag dat er een langdraaiende Node-server bijkomt: dan geldt de
  verbindingsregel uit `docs/DEPLOY.md` §2.7.
