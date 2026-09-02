# Linear — milestones en issues om aan te maken

> Het Linear-project **Luz de Luna Lera** bestaat nog niet. Dit bestand is de
> importlijst én het vangnet: staat het project er eenmaal, dan is Linear de bron
> van waarheid voor wát er gebouwd wordt en wordt dit bestand een archief. Tot
> die tijd werk je hieruit (`/verder` leest het).
>
> ⚠️ De Linear-werkruimte van GoalBuddies zat op 27-08-2026 aan de gratis
> issue-limiet. Controleer vóór het aanmaken of er ruimte is; zo niet, dan is
> dat een kostenbesluit voor Quinten (grens 1) en blijft dit bestand de bron.
>
> **Conventies:** één branch per issue met de naam die Linear voorstelt; zonder
> Linear `quinten/ldl-<nr>-<korte-naam>`. Acceptatiecriteria zijn de opdracht.
> Prioriteit: U (urgent), H (hoog), M (middel), L (laag).

## Milestones

| # | Milestone | Doel | Klaar als |
|---|---|---|---|
| M0 | Fundering | repo, omgevingen, poort, CI, documenten | `npm run poort` groen in CI; Supabase, n8n en Hostinger bereikbaar met env vars |
| M1 | Onderzoek en besluiten | de open vragen uit de vergadering beantwoord | elk beslisdocument in `docs/research/` op "besloten" |
| M2 | De eerste klantreis | landing, zelftest, bedankpagina, uitgebreide spiegel | een echte bezoeker doorloopt het op een telefoon en krijgt de spiegel in haar inbox |
| M3 | De e-mailfunnel | vier funnelmails, de Roots-uitnodiging, doorstroom naar de nieuwsbrief | Evianne heeft de reeks zelf ontvangen en goedgekeurd; afmelden werkt end-to-end |
| M4 | Roots boeken en betalen | kennismaking en intake, Google Agenda, betaalprovider, termijnen | een testbetaling leidt tot één boeking in de agenda met samenvatting |
| M5 | De content-machine | nieuwsbrieven, Instagram-voorraad, planning en publicatie | tien nieuwsbrieven en dertig posts staan klaar; publiceren gaat vanuit één plek |
| Later | Productecosysteem en koppelingen | Voelsprieten, Grenzen, Innerlijk kompas; Fresha, Jort | — |

## M0 — Fundering

### LDL-1 · Repo en steiger in gebruik nemen · H
Kopieer deze projectmap, `git init`, GitHub-repo aanmaken, eerste commit, CI groen.
- [ ] `npm install && npm run poort` groen, niets ongemeten
- [ ] `.github/workflows/ci.yml` draait op de eerste push en is groen
- [ ] `docs/WERKVOORRAAD.md` §1 noemt repo, branchnaam en adressen

### LDL-2 · Supabase-project aanmaken · H
Nieuw project, EU-regio, gratis tier. Sleutels in `.env`, nooit in de repo.
- [ ] project bestaat; url en anon key in `.env`; service-role key alleen server-side
- [ ] `docs/WERKVOORRAAD.md` §1 noemt ref en regio; `docs/DEPLOY.md` §1 is ingevuld
- [ ] kostenbesluit vastgelegd: gratis tier, wat een betaalde tier vraagt gemarkeerd

### LDL-3 · n8n-instantie kiezen en inrichten · H · blokkeert LDL-12, LDL-16
Cloud of zelf gehost op Hostinger — een kostenbesluit (grens 1). Zie `docs/research/README.md`.
- [ ] besluit in `docs/decisions/002-stack-en-werkverdeling.md` §4
- [ ] instantie bereikbaar; credentials-store gebruikt; error-workflow aanwezig
- [ ] `n8n/README.md` beschrijft export/import

### LDL-4 · Hostinger-omgeving en domein · M
Subdomein of domein, FTP/SFTP-toegang, statische export uploaden.
- [ ] een lege pagina staat live op het gekozen adres
- [ ] `npm run deploy` (te schrijven) doet een secret-scan vóór de upload en is één keer rood geweest

### LDL-5 · Foutrapportage · M
Sentry of gelijkwaardig voor site en n8n; geen PII in meldingen.
- [ ] één echte testmelding is aangekomen (niet aangenomen)
- [ ] scrubbing van e-mailadressen en namen staat onder test

### LDL-6 · Linear-project aanmaken uit dit bestand · M
- [ ] milestones en issues staan in Linear met dezelfde nummers in de titel
- [ ] `docs/WERKVOORRAAD.md` §1 noemt team en prefix; dit bestand krijgt de kop "archief"

## M1 — Onderzoek en besluiten (`/onderzoek <slug>`)

### LDL-7 · privacy-avg · U · blokkeert LDL-11, LDL-13, LDL-14
Grondslag en toestemming voor zelftest en gepersonaliseerde mails; zijn de
antwoorden bijzondere persoonsgegevens; verwerkers (Supabase, n8n-host,
AI-aanbieder, mailkanaal); zelfbouw versus extern mailprogramma; bewaartermijnen;
verwijderpad; privacyverklaring.
- [ ] `docs/research/privacy-avg.md` met opties, aanbeveling en beslispunten
- [ ] de domeinregels 1–3 in `CLAUDE.md` bevestigd of aangescherpt
- [ ] `privacy-reviewer` heeft het document gelezen en akkoord gegeven

### LDL-8 · betalen-mollie · U · blokkeert LDL-19
Welke provider, wat is nodig voor een account (contractpartij, KvK, bank),
kosten per transactie, betaling in drie termijnen, betaalpagina per product.
- [ ] `docs/research/betalen-mollie.md`; beslispunt voor Evianne (account) en Quinten

### LDL-9 · boekingsflow · H · blokkeert LDL-17
Kennismaking (gratis, max 30 min, praktijk of Teams) versus intake (betaald);
waar het betaalmoment zit; hoe Google Agenda gekoppeld wordt; dubbele boeking.
- [ ] `docs/research/boekingsflow.md` met de flow als diagram en de randgevallen

### LDL-10 · fresha-en-agenda · M
Betalingen in Fresha activeren? Tijdelijke koppeling Fresha–Google Agenda?
Wanneer vervalt Fresha?
- [ ] `docs/research/fresha-en-agenda.md`; Evianne controleert de Fresha-configuratie

### LDL-10a · contenttooling · M · blokkeert LDL-24
Designtool (Canva, InDesign, anders) waaruit nieuwsbrieven en Instagram-posts
ingepland en gepubliceerd worden; koppeling met n8n.
- [ ] `docs/research/contenttooling.md`

### LDL-10b · eigen-platform · L
Vorm en platform voor Voelsprieten, Grenzen, Innerlijk kompas: eigen omgeving,
app, audioreeks, Telegram — tegenover Kajabi/Huddle. Plug&Pay bekijken voor
landings- en betaalpagina's.
- [ ] `docs/research/eigen-platform.md`

### LDL-10c · jort-facturatie · L
Wat is "Jort", wat koppelt het, wanneer.
- [ ] `docs/research/jort-facturatie.md` — te beginnen met de naam verifiëren

## M2 — De eerste klantreis

### LDL-11 · Datamodel en RLS als beslisdocument · U · blokkeert LDL-12 t/m LDL-15
Tabellen voor zelftests, antwoorden, contacten, toestemmingen, mailverzendingen,
boekingen, betalingen, AI-jobs. RLS per tabel; wat `anon` mag. Bewaartermijnen
als kolommen, niet als zinnen.
- [ ] `docs/decisions/003-datamodel.md` vastgesteld, met de vijf principes en per tabel de RLS-strategie
- [ ] `security-reviewer` en `privacy-reviewer` akkoord
- [ ] geen migratie vóór dit issue Done is

### LDL-12 · Migraties 0001–000N en de RLS-suite · U
- [ ] elke tabel RLS met SELECT/INSERT/UPDATE/DELETE; elke FK een index
- [ ] `tests/rls/` draait tegen een lokale of test-Supabase; de poort kent de stap met `database: true`
- [ ] autorisatietest: bezoeker A kan de zelftest van B niet lezen of wijzigen — en de eigen wél

### LDL-13 · De zelftest schrijven (content) · H · `/content zelftest`
- [ ] stellingen op schaal 1–5, gegroepeerd in thema's; toestemmingsteksten (zelftest, nieuwsbrief, AI-personalisatie) apart
- [ ] Evianne akkoord op de stellingen en de thema's

### LDL-14 · Landingspagina, zelftest en bedankpagina (Bolt) · H
- [ ] Bolt-prompt genummerd in `docs/bolt/PROMPTS.md`; export in `web/`
- [ ] werkt op een telefoon; antwoorden overleven een refresh; dubbel verzenden geeft één zelftest
- [ ] laad-, fout- en lege staat; geen geheim in de bundel; geen emoji in UI-tekst
- [ ] korte uitslag op de bedankpagina; uitgebreide alleen per mail

### LDL-15 · Zelftest-intake in n8n · H
Webhook (geauthenticeerd) → validatie → Supabase → bevestiging.
- [ ] idempotent op zelftest-id; rate limit; geen PII in logs; export in `n8n/workflows/`
- [ ] test via de webhook met testdata; dubbele aanroep → één rij

### LDL-16 · De uitgebreide spiegel: AI-personalisatie en verzending · H
- [ ] systeemprompt put alleen uit `docs/content/bron/`; antwoorden als data, niet als instructie; injectietest in de suite
- [ ] kosten per lead gelogd; dagquotum; cache op identieke antwoordpatronen
- [ ] proefpad: Evianne ontvangt vijf voorbeeldspiegels vóór de eerste echte
- [ ] SPF/DKIM/DMARC op het verzenddomein; afmeldlink werkt

## M3 — De e-mailfunnel

### LDL-17 · De vier funnelmails en de uitnodiging (content) · H · `/content mails`
- [ ] per mail: doel, vast deel, gepersonaliseerd deel, bronpassages; audio-ervaring aangeleverd `[EVIANNE]`

### LDL-18 · Funnel-workflow in n8n · H
Tussenpozen, personalisatie per mail, stop bij afmelding of boeking, doorstroom naar de nieuwsbrief.
- [ ] idempotent per (contact, stap); afmelden stopt de reeks binnen één uur; boeking stopt de verkoopmails
- [ ] Evianne heeft de hele reeks op haar eigen adres ontvangen en goedgekeurd

## M4 — Roots boeken en betalen

### LDL-19 · Betaalpagina en betaalwebhook · U
- [ ] provider volgens LDL-8; testmodus; webhook geauthenticeerd en idempotent; status bij de provider geverifieerd
- [ ] betaling append-only in de database; termijnen volgens besluit
- [ ] geen boeking in flow 2 zonder bevestigde betaling — alle routes gezocht en dichtgezet

### LDL-20 · Boekingsmodule op Google Agenda · U
- [ ] beschikbaarheid uit de agenda; keuze praktijk/Teams; dubbele boeking onmogelijk (constraint, ook bij twee gelijktijdige)
- [ ] notificatie aan Evianne met zelftest-samenvatting (beperkt tot wat nodig is)
- [ ] tijden in Europe/Amsterdam voor de mens, UTC in de database

### LDL-21 · Roots-landingspagina (Bolt) · H · `/content uitnodiging`
- [ ] de twee routes zichtbaar; prijs en termijnen alleen uit het PRD; mobiel

## M5 — De content-machine

### LDL-22 · Tien nieuwsbrieven · M · `/content nieuwsbrieven`
### LDL-23 · Instagram: eerst 5–10, dan dertig · M · `/content instagram`
- [ ] Evianne levert 5–10 voorbeeldposts; de eerste batch geijkt vóór de rest
### LDL-24 · Plannen en publiceren vanuit één plek · M · volgens LDL-10a
### LDL-25 · Funnelcijfers · M
- [ ] de cijfers uit PRD §8 komen uit het systeem; wekelijks in `/audit`

## Later

### LDL-26 · Voelsprieten naar binnen · L — na LDL-10b
### LDL-27 · Grenzen · L
### LDL-28 · Innerlijk kompas · L
### LDL-29 · Fresha-koppeling of vervanging · L — na LDL-10
### LDL-30 · Jort-facturatie · L — na LDL-10c
