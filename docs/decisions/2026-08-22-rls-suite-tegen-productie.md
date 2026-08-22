# De RLS-suite draait tegen productie — en waarom dat nog niet opgelost is

> ⚠️ **Hernummer dit bestand bij het samenvoegen.** Datum in plaats van nummer,
> om dezelfde reden als de twee andere documenten van vandaag.

**Status:** onderzocht 22-08-2026 · **Issue:** QS8-119 · **Besluit: uitgesteld, met een volgorde**
**Raakt:** `tests/rls/harness.ts`, en op termijn de projectopzet

## De vraag

De RLS-suite maakt echte accounts aan in het productieproject `wehgocadxehottiiyvsc`
en ruimt ze op met de service-role-key — een key die RLS volledig omzeilt. Moet
daar een tweede Supabase-project voor komen, een lokale stack, of blijft het zo?

## Wat er niet klopte aan de vraagstelling

Twee dingen uit de issuetekst zijn bij nameting niet blijven staan.

**1. Het is geen rate-limit-oplossing.** QS8-116 stelde een tweede project voor
om de aanmeldlimiet te omzeilen. Die limiet bleek per IP te gelden en niet per
project, dus een tweede project verplaatst hem hooguit. Richting C heeft hem
weggenomen door niet meer in te loggen. Dit issue staat dus volledig op eigen
benen.

**2. Het gevaar zat niet waar ik het beschreef.** De issuetekst waarschuwde voor
"een lege array die als alles wordt gelezen". Nagekeken: `removeTestUsers()`
begint met `if (ids.length === 0) return`, en PostgREST vertaalt een lege `in.()`
naar "matcht niets". Dat pad bestaat niet.

Wat wél overblijft is smaller en reëler: de lijst met te verwijderen id's is de
enige bewering dát het testgebruikers zijn, en die bewering wordt nergens
gecontroleerd op het moment van verwijderen.

## Wat de meting wél opleverde, en dit is de kern

De migratiegeschiedenis van het project gebruikt **twee onverenigbare
nummeringen**:

| soort | aantal | voorbeeld |
|---|---|---|
| genummerd | 38 | `0001` … `0038` |
| tijdstempel | 28 | `20260819121517` (naam: `weekpassen`) |

De 28 met tijdstempel zijn alles wat sinds 19-08 via de MCP-tool is toegepast.
Die tool kiest zelf een tijdstempel als versie, ongeacht hoe het bestand heet.

**Gevolg:** de bestandsnaam `0039_….sql` in de repo komt nooit overeen met een
versie in `schema_migrations`. De repo kan het project dus niet verifiëren, en
het project de repo niet. Dat is de valkuil "de repo en het project lopen uit
elkaar, in béíde richtingen" — nu geteld in plaats van vermoed.

⚠️ **Mijn eigen twee migraties van vandaag maken het niet beter.** `0062` en
`0063` staan in de geschiedenis als `20260822135134` en `20260822151529`, met het
nummer alleen in de náám. Ik had geen ander gereedschap, maar het is dezelfde
drift en het hoort hier te staan.

In deze clone ontbreken bovendien `0036` en `0037` als bestand terwijl ze wél
zijn toegepast — die staan op de werkmachine.

## Waarom dat dit issue blokkeert

Zowel een lokale stack als een tweede cloudproject werkt op één manier: **je
speelt de migraties opnieuw af op een lege database.** Dat kan alleen als de
migratiebestanden een volledige, geordende bron zijn.

Vandaag zijn ze dat aantoonbaar niet. Een lokale stack die uit deze bestanden
wordt gebouwd, krijgt een schema dat niet gelijk is aan productie — en dan toetst
de RLS-suite een verzinsel. Dat is erger dan tegen productie draaien, want het is
groen zonder iets te bewijzen. Precies het faalbeeld dat QS8-116 kwam opruimen.

## Het besluit: uitgesteld, met een volgorde

1. **De migratiebron eerst repareerbaar maken.** Eén nummering, één ledger, en
   een controle die zegt of repo en project nog gelijk lopen. Zonder dit is stap
   2 niet te doen en stap 3 niet te vertrouwen.
2. **Daarna een lokale stack** (`supabase start`). Gratis, pauzeert nooit, sneller,
   offline, en het kostenbesluit vervalt. Staat al als C3 in `Q-TODO.docx` en
   wordt in `harness.ts` al als eindbeeld genoemd.
3. **Een tweede cloudproject blijft de terugvaloptie**, niet de eerste keus.

⚠️ **Een tweede Supabase-project is bewust niet aangemaakt.** Dat valt onder
grens 1 van de beslisbevoegdheid: iets dat Quinten geld kost of hem extern
vastlegt. Dat is niet aan Claude, ook niet op de gratis tier — een gratis project
pauzeert na inactiviteit, en een testproject is per definitie inactief tussen
runs door, dus in de praktijk is het een betaalde tier.

⚠️ Wat een lokale stack kost dat de cloud niet kost: de suite draait dan niet
meer tegen de échte Postgres-versie en de échte Supabase-configuratie. Dat heeft
in dit project al twee keer verschil gemaakt — de gedeployde functie bleek
strenger dan het migratiebestand. `pg_get_functiondef()` op productie blijft dus
nodig als controle, óók met een lokale stack.

## Wat er intussen wél is gebeurd

Uitstellen mag geen synoniem zijn voor niets doen. `removeTestUsers()` heeft nu
een grendel op de plek die telt — vlak vóór het verwijderen, niet aan het begin
van de run:

- de harness houdt per aangemaakte gebruiker het e-mailadres bij;
- vóór er iets verwijderd wordt, moet elk adres het patroon van deze suite hebben;
- wijkt er één af, dan gooit hij en gaat er **niets** weg, ook niet de rest.

`isTestEmail()` staat onder test in `jwt.test.ts` en dus in CI, met zes
weigergevallen naast de drie die moeten slagen — waaronder
`rls-…@example.com.kwaadaardig.nl` en een echt adres.

Dat neemt de reden voor dit issue niet weg. Het verkleint het venster waarin een
slordige refactor schade doet van "de hele opruimlus" tot "niets".
