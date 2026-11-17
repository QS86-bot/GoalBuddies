# Marktbronnen — teardown van goalgeniee.com, habi.app en goalsandprogress.com

> Onderzoekssessie van 17-11-2026, punt 1 van QS8-649 (besluit 31). Geen code, geen
> migratie, geen PR. Grens van Quinten (17-11-2026): alleen wat een gewone bezoeker
> zonder account publiek ziet, geen app-ontleding, geen omzeiling.
> `habithuddle.com` staat in een aparte sessie (`docs/research/habit-huddle-app-ontleding.md`
> op `claude/habithuddle-app-ontleding`) en valt hier buiten.

**Kort: van de drie bronnen is er één gelezen.** De andere twee zijn niet te lezen
binnen de grens, en dat staat hieronder als *ongemeten*, niet als "leeg".

| Bron | Bereikbaar | Gelezen | Stand |
|---|---|---|---|
| goalsandprogress.com | ja (200) | ja, 5 pagina's | **gemeten** |
| goalgeniee.com | apex geeft `307` naar `www.goalgeniee.com`; `www` weigert de proxy (`CONNECT` 403) | nee | **ongemeten** |
| habi.app | proxy laat door, maar de site geeft `403` met `cf-mitigated: challenge` | nee | **ongemeten** |

Legenda: **GEMETEN** = op de pagina gezien, met URL. **AANGENOMEN** = niet gezien.

## 1. Bereikbaarheid (gemeten 17-11-2026, één `curl -I` per host)

- `goalsandprogress.com`: `200`.
- `goalgeniee.com`: `307`, `location: https://www.goalgeniee.com/` (server Vercel).
  `www.goalgeniee.com`: `curl` faalt met `CONNECT tunnel failed, response 403`; de
  proxystatus meldt `connect_rejected` voor `www.goalgeniee.com:443`. Het is de
  **sessieproxy**, niet de site, die weigert. Geen omweg geprobeerd.
- `habi.app`: `403`, `content-type: text/html`, `cf-mitigated: challenge` — een
  botcontrole van Cloudflare. `www.habi.app` weigert de proxy (`CONNECT` 403).
  Een botcontrole is een bewuste drempel van de site voor een programma; omzeilen valt
  buiten de grens van Quinten en is niet geprobeerd.
- Wat dit nodig heeft: `www.goalgeniee.com` op de toegestane domeinen van een nieuwe
  sessie, en voor habi.app **handmatig lezen door Quinten** (een mens passeert de
  controle zonder omweg) of een besluit dat de bron vervalt.

## 2. goalsandprogress.com — GEMETEN

### 2.1 Voorwaarden (eerst gelezen, regel 1)
Bron: https://goalsandprogress.com/terms/ ("Valid from 2 October 2026").

- **Geen clausule over geautomatiseerde toegang**, scraping, bots, crawlers, tekst- en
  datamining of AI-training. Geen robotsverklaring in de voorwaarden. (GEMETEN, absentie
  na lezen van de volledige voorwaardenpagina door de WebFetch-hulp; zelf niet
  regel voor regel herlezen.)
- De enige gebruiksbeperkingen gaan over de eigen producten: de licentiecode van de app
  is voor één persoon (§4), het werkboek is voor eigen gebruik en niet te delen of te
  verkopen (§5). Zwitsers recht, Zürich (§8).
- `robots.txt` (https://goalsandprogress.com/robots.txt): `User-agent: *`, sluit alleen
  WordPress-beheer, zoekpaden en queryvarianten uit; geen crawl-delay, geen
  botspecifieke regels. Er is **één verzoek per pagina** gedaan, geen crawl, buiten de
  uitgesloten paden.
- Gelezen: home, terms, robots.txt, twee lijstartikelen. Niet gelezen: privacy,
  imprint, de app zelf (demo).

### 2.2 Wat het is
- Een persoonlijk doelen-site van één maker (Ramon Landes, Zwitserland): 521 artikelen,
  41 gratis tools, een betaalde web-app ("Life Goals App", eenmalig, introductieprijs
  $49.99) en een werkboek van 29 pagina's. (GEMETEN, https://goalsandprogress.com/)
- Doelgroep volgens de maker: "people who want structure without overcomplication".
  Persoonlijk, niet zakelijk. (GEMETEN, home)
- De home noemt geen groepen, geen accountability en geen teams. (GEMETEN, home)
- Over zijn eigen app: "has no shared goals or team features, and one person builds it".
  (GEMETEN, https://goalsandprogress.com/best-goal-setting-apps/)

### 2.3 De lijstartikelen (de bron achter de marktbewering in het beslisdocument)
- "Best Apps for Goal Setting: 11 Personal Goal Apps Compared" — **elf** apps, niet
  tien of negen: Lifetick, Success Wizard, Life Goals App (eigen), Griply, GoalsOnTrack,
  Strides, Timestripe, Remente, Amazing Marvin, Notion Life Design, Full Focus Planner.
  Prijzen en functies "as of 17 October 2026". (GEMETEN,
  https://goalsandprogress.com/best-goal-setting-apps/)
- Diezelfde pagina laat **teamtools (Lattice, 15Five) met opzet weg**. (GEMETEN, zelfde
  URL.) Dat is een uitsluiting door de auteur, geen meting van de markt: de lijst
  zegt niets over of teamfuncties bij persoonlijke doelen-apps voorkomen.
- Belang en uitgever: de auteur bouwt een van de elf zelf en zegt dat; er staan "no
  affiliate or paid links" volgens de eigen disclosure. (GEMETEN als bewering van de
  auteur; dat het waar is, is **niet** gecontroleerd.)
- "Best Goal Planners for 2027" noemt 16 planners, voornamelijk papier en printbaar;
  twee zijn apps (Life Goals App, Griply). (GEMETEN,
  https://goalsandprogress.com/best-goal-planners/) Het gedeelte na de afkapgrens van
  de fetch is een samenvatting en telt niet als gemeten.
- "SMART goals examples: 17 personal goals" is wat de home als persoonlijke-doelenlijst
  noemt; de "Personal Goal …"-lijst uit het beslisdocument is dus waarschijnlijk een
  van deze. **AANGENOMEN**: welke van de drie het is, is niet vastgesteld.

### 2.4 Wat dit zegt over de besluiten

| Vraag | Uitkomst | Status |
|---|---|---|
| Bestaan organisaties of teams boven groepen? | Niet bij deze bron: geen groepen, geen teams, geen organisaties | GEMETEN (home, apps-artikel) |
| Gedeelde teamdoelen met eigen aandeel? | Niet aangeboden; eigen app zegt "no shared goals" | GEMETEN |
| Klassement? | Niet gezien | GEMETEN afwezig op de gelezen pagina's; niet breder |
| Zakelijk gebruik als markt? | Bewust buiten de lijst gelaten | GEMETEN (uitsluiting), betekenis AANGENOMEN |
| Prijsanker | $49.99 eenmalig voor een persoonlijke app | GEMETEN |

**Besluit 2 (alles tegelijk) en 4 (organisatie boven groepen):** deze bron zegt er
**niets over**. Het is een persoonlijke-doelensite zonder team- of groepslaag; dat
spreekt niets tegen en bevestigt niets. De afwezigheid van teams in de 11 apps is
een keuze van de auteur, geen marktuitspraak.

**Domeinregel 5 (geen geld):** raakt niet; de enige betaling is de aankoop van het
product, geen inzet of consequentie. **Domeinregel 7:** niets gezien dat falen
publiek maakt; er is geen groepsoppervlak.

## 3. goalgeniee.com — ONGEMETEN

Niet gelezen. Alles wat je erover zou willen weten staat open: wat het product is,
voor wie, prijs, teams, het ToS-artikel over kopiëren of concurreren. Er is
**niets** over de site gemeten behalve dat de apex naar `www` doorverwijst op Vercel.
Zoekmachine-snippets zijn niet gebruikt; die zouden **AANGENOMEN** zijn en geen
meting. Voorwaarden niet gelezen, dus de regel "eerst de voorwaarden" kon niet
worden uitgevoerd en er is dus niet doorgelezen.

## 4. habi.app — ONGEMETEN

Niet gelezen, zelfde reden en zelfde status. De Cloudflare-controle is een signaal
van de site dat automatische toegang ongewenst is; daar is niet langs gegaan.
Alle vragen (organisaties, teamdoelen, klassement, prijs) staan open.

## 5. Wat de bronnen zeggen over besluit 2 en 4

| Besluit | Spreekt tegen | Bevestigt | Zegt niets |
|---|---|---|---|
| 2 — alles tegelijk | — | — | goalsandprogress (persoonlijk, geen zakelijk aanbod) |
| 4 — organisatie boven groepen | — | — | goalsandprogress (geen groepen, geen teams) |

goalgeniee en habi.app: **niet te beoordelen**. De voorwaarde van besluit 31 (vier
bronnen lezen) is daarmee **voor twee van de drie niet vervuld**; samen met de
aparte Habit Huddle-sessie is punt 1 van QS8-649 **nog niet af**. Het oordeel over
besluit 2 en 4 is aan Quinten.

## 6. Besluit van Quinten (17-11-2026): de voorwaarde vervalt voor twee bronnen

Quinten liet de voorwaarde van besluit 31 **vervallen voor goalgeniee.com en
habi.app**. Die twee blijven ongemeten en dat is nu een besluit en geen open punt:
de markt is voor deze twee **niet getoetst**, in geen van beide richtingen. Wat nog
openstaat van besluit 31: `habithuddle.com` (aparte sessie, tak
`claude/habithuddle-app-ontleding`). goalsandprogress.com is gelezen (§2).

## 7. Aanname en volgende stap

**Aanname, expliciet:** dat de afwezigheid van teams bij goalsandprogress iets zegt
over de markt is niet gemeten; het is één site van één maker. Eén bron zonder
teams zegt niets over of anderen ze hebben.

**Volgende afgebakende stap:** het oordeel over de Habit Huddle-ontleding en dan
het afvinken van punt 1 in QS8-649 (aan Quinten). Voor goalgeniee en habi.app is
niets meer nodig.
