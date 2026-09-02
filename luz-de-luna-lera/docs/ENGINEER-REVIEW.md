# Reviewdossier — open bevindingen

Alles waar Quinten of de agents niet zeker over zijn. Aanvullen tijdens het
bouwen, niet achteraf reconstrueren. De naam van het bestand is overgenomen uit
GoalBuddies zodat het gereedschap (`npm run review:controle`) hetzelfde is.

## Hoe je deze lijst leest

**Een doorgestreept risico (`~~Hoog~~ opgelost`) is afgehandeld; al het andere
is open werk.** `npm run review:controle` bewaakt dat de kolom klopt, dat elke
open **Laag**-rij zegt wanneer hij zwaarder wordt, dat een rij die zichzelf
"opgelost" noemt ook doorgestreept is, en dat geen rij er twee keer in staat.

⚠️ **Een rij beschrijft de stand op de dag van schrijven, niet die van vandaag.**
Meet de gedeployde stand (`pg_get_functiondef()`, `pg_policy`, de live
workflow) voordat je een rij gelooft. Een lijst waarvan een deel al klaar is,
kost de lezer het vertrouwen in de rest.

⚠️ **Schrijf een reparatie in de rij zelf op, met een ✅ en het migratienummer
of de commit.** Alleen dan ziet de controle dat hij klaar is.

### De stempels

| Stempel | Betekenis |
|---|---|
| ✅ | Gerepareerd. De risicokolom is doorgestreept. |
| 📏 | Nagemeten op de genoemde datum en nog steeds open. |
| 🗣 | Niet te meten: een ontwerpvraag of iets dat pas uit gebruik blijkt. |

### Risiconiveaus

`Laag`, `Middel`, `Hoog`, `Kritiek`. Een Laag-rij draagt altijd
`**Wordt zwaarder als:** …` — de aanname die hem laag houdt.

## De bevindingen

| Datum | Bestand / plek | Bevinding | Risico |
|---|---|---|---|
| 2026-09-02 | `scripts/poort.mjs` | De poort kent nog geen stap met `database: true`, dus "ongemeten" kan vandaag alleen ontstaan bij een controle die zelf `OVERGESLAGEN` print. Zodra de eerste migratie landt zonder RLS-suite in de poort, meldt hij groen over een schema dat niemand getoetst heeft. **Wordt zwaarder als:** `supabase/migrations/` zijn eerste bestand krijgt (LDL-12). | Laag |
| 2026-09-02 | `docs/PRD-luz-de-luna-lera.md` §3.1 | De naam van het traject staat in de ene samenvatting als "Roots" en in de andere als "Routes"; de prijs is "circa € 900" en de termijnen zijn niet besloten. Alles wat een klant te horen krijgt hangt hieraan. **Wordt zwaarder als:** de Roots-landingspagina (LDL-21) geschreven wordt vóór Evianne het bevestigd heeft. | Laag |
| 2026-09-02 | `n8n/` | Er is nog geen n8n-instantie en dus geen enkele test die een workflow via zijn webhook raakt. De hele automatiseringslaag is een blinde vlek tot LDL-3 en LDL-15. 🗣 | Middel |
