# Meldingen uitzetten — de knop die er niet was

*26-08-2026 — QS8-114 / QS8-124*

## Wat er ontbrak, en waarom niets dat zag

Web push kon sinds QS8-124 **aan**: `webpush-registratie.ts` regelt de service
worker en het abonnement, `Meldingen` op het profielscherm zet hem aan achter een
klik, en `_layout.tsx` plugt de bron in. Alles onder test.

Er was alleen geen weg terug. `verwijderPushToken()` stond er sinds EPIC 11, met
in zijn eigen kop *"Hoort bij uitloggen"*, en werd door **niets** aangeroepen —
niet bij uitloggen, en niet vanaf een scherm. Het abonnement in de browser werd
al helemaal nooit opgezegd.

⚠️ Dat is de variant uit CLAUDE.md regel 18, vraag 5: **elk schakeltje af en de
keten nergens aangesloten.** Er was niets kapot, dus geen enkele test kon rood
worden. `keten:controle` vond het ook niet, want dat script zoekt naar dode
database-functies en niet naar dode TypeScript-exports.

## De beslissingen

### 1. Eerst de rij, dán het abonnement opzeggen

`verwijderPushToken()` vraagt de bron om het token, en op web is dat het endpoint
van het **lévende** abonnement. Zeg je dat eerst op, dan geeft `haalToken()`
`null`, slaat het verwijderen over en blijft de rij in `push_tokens` staan.

Het gevolg zou een apparaat zijn dat meldingen blijft krijgen nadat de gebruiker
ze uitzette — en die meldingen kunnen over zijn week gaan, op een vergrendeld
scherm dat iemand anders kan meelezen. Dat is geen datalek via de database maar
wel via het nachtkastje.

De volgorde staat daarom onder test, en die test toetst de **volgorde** en niet
"beide zijn aangeroepen". Met de hand omgedraaid: één rode test.

### 2. `zetMeldingenUit()` krijgt het verwijderen aangereikt

Als parameter en niet als import. `webpush-registratie.ts` importeert bewust
niets uit `tokens.ts` behalve een type; zou het dat wel doen, dan trekt elke test
die deze regels wil controleren `lib/supabase` mee, en daarmee de
Supabase-client, AsyncStorage en React Native — in een test die in Node draait.
Dezelfde reden als bij de schema-bestanden (QS8-120, QS8-121).

### 3. Het scherm zet de stand zelf op `uit`, en leest hem niet opnieuw

De toestemming blijft `granted` — die kan alleen de gebruiker intrekken in zijn
browserinstellingen. `huidigeMeldingenstand()` zou dus `aan` blijven zeggen
terwijl er geen abonnement meer is, en dan liegt het scherm over wat de knop net
gedaan heeft.

⚠️ Gevolg dat je moet weten: **`uit` betekent hier "niet meer geabonneerd", niet
"toestemming weg".** Daarom werkt aanzetten daarna zonder nieuwe prompt, en dat
is precies de bedoeling — de prompt is het schaarse goed.

### 4. Uitzetten mag nooit omvallen

Mislukt het opzeggen, dan is de rij al weg en komen er hoe dan ook geen meldingen
meer aan. Een profielscherm dat crasht terwijl je een knop indrukt is erger dan
een abonnement dat in de browser blijft hangen. Vandaar `{ ok: false, reden }` en
geen exception.

## `npm run edge:sync:controle`

Meegekomen in dezelfde ronde, en hij hoort bij hetzelfde thema. `edge:sync`
genereert de kopieën in `supabase/functions/_shared/`; deze controle rekent uit
wat hij zóu schrijven en vergelijkt dat met wat er staat. Dezelfde generatorcode,
dus de controle kan per definitie niet uit de pas lopen met de sync.

⚠️ **Niet `edge:controle`** — die naam was al bezet door de tijdmodule-
vergelijking, die in `/audit` draait. Het oorspronkelijke voorstel gebruikte hem
wél, en dat zou de bestaande controle stilzwijgend hebben vervangen: een script
minder in de audit zonder dat iemand het merkt.

Dit is de tweede helft van `edge:gedeployd`. Die vergelijkt de gedéployde bundel
met de repo; deze vergelijkt de gegenereerde kopie met zijn origineel. Een
achtergebleven kopie is groen bij de eerste en rood bij deze — en dat is precies
het gat waardoor de app en de jobs met verschillende regels kunnen gaan werken.

## Wat er níét overgenomen is

Op 26-08 bleek er een tweede client-implementatie van web push te bestaan
(`webpush-bron.ts` en `webpush-stand.ts`, ongecommit), net als bij Sentry die dag.
Die is niet overgenomen: `main` heeft dezelfde functionaliteit met een rijkere
toestandsmachine — zij kent ook `geen-sleutel`, en dat is een deployfout die je
niet als keuze aan een gebruiker moet voorleggen.

Wat er wél uit meekwam is de redenering onder beslissing 1. Die stond alleen daar
opgeschreven, en hij klopt.
