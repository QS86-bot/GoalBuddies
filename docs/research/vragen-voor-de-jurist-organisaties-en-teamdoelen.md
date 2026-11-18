# Vragen voor de jurist: organisaties en teamdoelen

**Datum:** 04-11-2026 · **Issue:** QS8-649, punt 5
**Status:** een vragenlijst en **geen advies**. Alles wat hieronder over recht staat is een
vraag of een niet-geverifieerde veronderstelling van de sessie die dit schreef, geen jurist.

## Waarom dit document

Quinten besloot op 04-11-2026 (besluit 33 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`) dat de
juridische toets een **voorwaarde voor verkoop aan organisaties** is en dat er ondertussen
gebouwd wordt. Er zijn nog geen organisaties als klant. Dit document is wat een jurist
nodig heeft om te beginnen: wat het product met gegevens doet, en de vragen.

⚠️ **Het risico van deze keuze is herwerk.** Eist de toets iets aan het datamodel, dan is
dat achteraf duurder dan vooraf. Daarom staan de vragen die het datamodel raken bovenaan.

## Wat het product met gegevens doet

Feiten uit de repo en uit CLAUDE.md, niet juridisch geduid. Bij alles wat ik niet zelf heb
nagelezen staat dat erbij.

| Gegeven | Wie ziet het | Opmerking |
|---|---|---|
| Naam, avatar en rol (beheerder of lid) in een organisatie | De leden van die organisatie | Een beheerder ziet van de voortgang van anderen niet meer dan een lid (besluit 6) |
| Een teamdoel: titel, beschrijving, streefdatum, status | De leden van de teamgroep | Eén gedeeld object, geen persoon eraan |
| Een aandeel: een persoonlijk doel met mijlpalen, gekoppeld aan het teamdoel | Alleen de eigenaar ziet zijn voortgang | Collega's zien de teambalk en hun eigen aandeel (besluit 11 en 21) |
| De teambalk | De leden van de teamgroep | Een teller van behaalde mijlpalen, zonder persoon en zonder noemer |
| Punten, ook een teambonus van +2 per afgerond teamdoel | Alleen de eigenaar | Het puntenboek is eigenaar-only |
| Een commitment (afspraak of straf) met een teamgroep als begunstigde of getuige | De teamgroep, pas als de straf verschuldigd is | Vrijblijvend en nooit een geldbedrag (domeinregel 5) |
| Chat en systeemberichten in een teamgroep | De leden van de teamgroep | Systeemberichten noemen geen titel |

**Verwerking en hosting:**
* De database draait bij Supabase in de regio `eu-west-3` en de app bij Hostinger; foutmeldingen gaan naar Sentry (CLAUDE.md).
* De gratis Supabase-tier heeft geen automatische backups (CLAUDE.md).
* De Doelcoach gebruikt volgens `docs/WERKVOORRAAD.md` (QS8-587) de Anthropic-API. **Wat daar precies naartoe gaat, heb ik niet nagelezen.**
* Sentry krijgt volgens de spec-planner een `group_id` als context mee; een organisatie-id zou er op dezelfde manier heen kunnen gaan. **Niet zelf nagelezen.**
* Wissen: er is een recht op accountverwijdering (`verwijder_mijn_account()`) en een eerder besluit over wat een straf overleeft (`docs/decisions/2026-09-08-wat-een-straf-overleeft.md`). Bij vertrek uit een organisatie blijven iemands doelen van de gebruiker en vervalt alleen de koppeling (besluit 14).

## De vragen

### A. Rollen en grondslag
1. Is de werkgever verwerkingsverantwoordelijke en zijn wij verwerker, of is er een andere verdeling (gezamenlijke verwerkingsverantwoordelijken)? Wat verandert er als een zzp'er of freelancer zelf een organisatie aanmaakt?
2. Welke grondslag past voor werknemersgegevens? Een werknemer kan bij een afhankelijkheidsrelatie zelden vrij toestemming geven; geldt dat hier, nu deelname aan een team door de werkgever kan worden georganiseerd?
3. Is een verwerkersovereenkomst nodig, en welke subverwerkers (Supabase, Hostinger, Sentry, de AI-leverancier) horen erin?
4. Is er doorgifte buiten de EU, en zo ja welke (de AI-leverancier, Sentry)?

### B. Gegevensbeschermingseffectbeoordeling
5. Is een DPIA verplicht, met het oog op systematische monitoring van werknemers of het bijhouden van scores en punten?
6. Wie moet hem uitvoeren: wij, de werkgever, of beiden?

### C. Medezeggenschap
7. Heeft een ondernemingsraad een instemmingsrecht? ⚠️ **Niet geverifieerd.** Zoeksamenvattingen van Rendement noemen artikel 27 lid 1 onder k van de [WOR](https://www.rendement.nl/instemmingsrecht-artikel-27-wor) (een regeling over de verwerking en bescherming van persoonsgegevens van werknemers) en onder l (voorzieningen die gericht zijn op of geschikt voor waarneming van of controle op aanwezigheid, gedrag of prestaties). De bronnen behandelen de combinatie niet expliciet en adviseren de actuele wettekst op wetten.overheid.nl te controleren. Ik heb dat niet kunnen doen.
8. Vanaf welke omvang speelt dit, en geldt het ook voor kleine klanten zonder ondernemingsraad?
9. Maakt het uit of een werknemer zelf een team kiest, of dat de werkgever het aanwijst?

### D. Prestaties en beoordeling
10. Valt een teambonus, een puntentotaal of de voortgang op een aandeel onder 'beoordeling van prestaties'?
11. De beheerder ziet niet meer dan een lid. Is dat genoeg, of ontstaat er toch controle op prestaties via de teambalk?
12. Vallen de punten en het afronden van teamdoelen onder geautomatiseerde besluitvorming (artikel 22 AVG)?

### E. Bewaren en wissen
13. Welke bewaartermijnen gelden voor organisatie- en lidmaatschapsgegevens?
14. Een vertrekkende werknemer houdt zijn doelen (besluit 14). Botst dat met een werkgever die gegevens wil houden of wissen?
15. Bij wie komen verzoeken van betrokkenen (inzage, wissen) terecht, bij de werkgever of bij ons?
16. De teambalk bevat geen gebruiker en blijft na verwijdering staan als anonieme telling. Is dat anoniem genoeg?

### F. Afspraken en straffen
17. Een commitment mag een teamgroep als begunstigde of getuige hebben. Het is vrijblijvend en nooit een geldbedrag. Zijn er arbeidsrechtelijke risico's als een afspraak tegenover collega's in een werkcontext een straf draagt?

### G. Overig
18. In doelen en chat kan bedrijfsgevoelige informatie staan, zoals omzetdoelen. Welke geheimhouding moeten wij bieden?
19. Welke algemene voorwaarden en aansprakelijkheidsbeperking horen bij verkoop aan organisaties?
20. Verandert iets voor een klant die een eenmanszaak of zzp'er is, tegenover een bedrijf met personeel?

## Wat dit document niet is

Geen juridisch advies. De enige externe bron is een zoeksamenvatting van Rendement over artikel 27
WOR; de rest zijn vragen. Laat de wettekst en recente uitspraken door een jurist toetsen.
