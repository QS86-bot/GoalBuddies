# Tekst zonder grens is opslag van een ander — en tien jobs is pas een quotum als één job begrensd is

**Datum:** 28-08-2026
**Migratie:** 0120
**Raakt:** veertien CHECK-constraints, `vraag_ai_job()`, `ai_invoer_max()`,
`tekstgrenzen_bewaking()`, `src/modules/ai/jobs.ts`, de berichtencatalogus,
`tests/rls/tekstgrenzen.test.ts`

## De aanleiding

Bevinding 4 van de controleronde van 28-08, in twee helften: zes tekstkolommen
zonder lengtegrens, en een AI-dagquotum dat jobs telt in plaats van tokens — een
invoer van 450.000 tekens werd geaccepteerd.

## Helft 1: het waren er veertien, niet zes

Generiek gemeten in plaats van de zes uit de bevinding over te nemen: **elke
tekstkolom die `authenticated` mag schrijven en waar geen enkele CHECK de lengte
begrenst**. Dat zijn er veertien.

| Kolom | Grens | Waarom die |
|---|---|---|
| `goals.description` | 2000 | gelijk aan `doelSchema` |
| `goals.identity_statement` | 200 | gelijk aan `doelSchema` |
| `milestones.title` | 1–200 | gelijk aan `mijlpaalSchema` |
| `milestones.description` | 2000 | gelijk aan `mijlpaalSchema` |
| `weekly_goals.floor_text` | 200 | gelijk aan `weekly-schemas.ts` |
| `weekly_goals.ceiling_text` | 200 | idem |
| `chat_messages.attachment_url` | 1000 | URL; ruim boven een getekende Storage-URL |
| `commitments.image_url` | 1000 | idem |
| `completions.attachment_url` | 1000 | idem |
| `profiles.avatar_url` | 1000 | idem |
| `groups.icon` | 100 | kort label |
| `groups.invite_code` | 1–64 | de generator maakt er 12 |
| `groups.tz` | 64 | langste IANA-naam is 30 |
| `profiles.tz` | 64 | idem |

⚠️ **De Zod-schema's hadden die grenzen al, en dat is precies het probleem.** Een
verzoek aan PostgREST komt langs geen enkel Zod-schema. Elk onderdeel klopt en het
geheel lekt — onwrikbare regel 18, en de reden dat regel 3 ("alle input
servergevalideerd") over de sérver gaat en niet over het formulier.

⚠️ **Vier kolommen stonden niet in de bevinding, en twee ervan verklaren waarom de
regel scherp gesteld moest worden.** `chat_messages.attachment_url` en
`commitments.image_url` wórden door een CHECK genoemd — de eerste door "er moet
inhoud zijn", de tweede door de https-vorm — maar geen van beide zegt iets over
lengte. Een eerste versie van de meting telde "wordt genoemd door een CHECK" als
dekking en liet die twee door. **Een https-URL kan een megabyte zijn.**

### De richting van de eenheid, en waarom die hier goed valt

Zod's `.max()` telt UTF-16-eenheden, `char_length` telt codepunten, en `.length`
is altijd ≥ `char_length`. Bij een **bovengrens** betekent dat: alles wat het
formulier goedkeurt, past in de CHECK. Bij een **ondergrens** gaat het de
gevaarlijke kant op — daarom krijgt `milestones.title` een ondergrens van 1 en
niet van de 3 die het schema hanteert, gelijk aan `goals_title_len`. Zie de
emoji-sectie in CLAUDE.md en QS8-118.

Er staat een test op die precies dat meet: duizend keer 😀 is `char_length` 1000
en `.length` 2000, en dat hoort door de grens van 2000 heen te komen.

### Wat hier bewust níét in zit

`groups.tz` en `profiles.tz` krijgen een **lengte**grens en geen
geldigheidstoets. Dat `profiles.tz` onzin mag bevatten legde in augustus de hele
rollover om en staat open als **A38**. `groups.tz` heeft dezelfde vorm en dat is
hier opgevallen: 0019 valideert hem in `create_group()`, maar dezelfde migratie
geeft `grant update (…, tz, …)` aan `authenticated` — dus een beheerder loopt om
die validatie heen. Een geldigheidstoets vraagt `pg_timezone_names`, en dat kan
niet in een CHECK; dat is een trigger of een domein, en dus een eigen besluit.
**Deze migratie lost het niet op en doet ook niet alsof.**

## Helft 2: het dagquotum telde jobs en niet tekens

⚠️ **`vraag_ai_job()` schreef zijn eigen risico al op en begrensde het niet.** In
de kop van de `milestone_tip`-tak staat letterlijk: *"zou de functie tekst uit het
verzoek gebruiken, dan is het quotum een formaliteit — dan stuur je gewoon je
eigen prompt en betaalt Quinten de rekening."* Voor `milestones` en
`weekly_goals` stelt de client de invoer wél samen, en daar stond geen enkele
bovengrens op.

Tien jobs per dag klinkt als een quotum. Tien jobs van elk een kwart miljoen
tekens is het niet — dat is opslag op een gratis tier zonder backups, én een
rekening bij Anthropic.

**De grens is gemeten en niet gegokt.** Het zwaarste legitieme geval is
`weekly_goals` met een volledig interview: doeltitel (≤ 200) + mijlpaaltitel
(≤ 200) + vijf interviewantwoorden van elk ≤ 1000 (`ANTWOORD_MAX`) + twee datums
+ de sleutels. Ruim onder de 6.000 tekens. **8.000 is dus twee keer wat het
formulier maximaal kan produceren, en een factor 56 minder dan wat er doorheen
kwam.**

Twee sloten, zoals bij het pushadres in 0117: de functie weigert met
`{"ok": false, "reason": "invoer_te_groot"}`, en `ai_jobs_input_len` is de CHECK
eronder voor elk toekomstig tweede schrijfpad.

⚠️ Het getal staat in `ai_invoer_max()` en niet op twee plekken — dezelfde keuze
als `ai_dag_limiet()` in 0056. De CHECK roept de functie aan; dat mag omdat hij
`immutable` is, maar hij toetst bestaande rijen niet opnieuw als het getal ooit
omlaag gaat.

De gebruiker krijgt een eigen melding en niet de generieke, want dit is het enige
geval dat hij zélf kan oplossen.

## De bewaking

`tekstgrenzen_bewaking()` meldt elke schrijfbare tekstkolom zonder lengtegrens.
Precies twee soorten dekking tellen: een échte lengtetoets
(`char_length(kolom)`/`length(kolom)`) en een waardenlijst (`kolom = ANY (...)`,
die begrenst de lengte vanzelf). "Wordt ergens door een CHECK genoemd" telt
níét — dat was de versie die twee kolommen doorliet.

| Ijking | Uitkomst |
|---|---|
| Alles op zijn plek | 0 rijen (van 49 schrijfbare tekstkolommen) |
| `goals_description_len` weggehaald | `goals.description` |
| `commitments_image_url_len` weg, https-vorm blijft staan | `commitments.image_url` |

De laatste rij is de belangrijkste: die bewijst dat een formaattoets niet als
lengtedekking telt.

## Gemeten vóór het toepassen

Op productie eerst geteld of er een bestaande rij zou omvallen — voor alle
veertien kolommen en voor `ai_jobs.input`: **nul**. Daarna toegepast; alle vier de
bewakingen (`tekstgrenzen`, `initplan`, `schrijfrechten`, `domeinregel3`) geven nul
rijen.
