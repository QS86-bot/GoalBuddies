# Een groepsnaam die een vreemde ziet

**Datum:** 14-09-2026
**Issue:** QS8-494
**Migratie:** 0270
**Raakt:** domeinregel 7 (groepszichtbare oppervlakken), QS8-123 (een weggezette bevinding zegt wanneer hij terugkomt)

## De vraag

Migratie 0269 sloot bidi-spoofing op `profiles.display_name`. `groups` kreeg toen
met reden geen CHECK: het argument was dat een doeltitel of chatbericht **inhoud
van de schrijver zelf** is, en die mag zeggen wat hij wil.

Voor `groups.name` gaat dat argument niet op, en dat bleek pas bij het meten.

## 📏 De meting — de voorwaarde was al gevuurd

De rij die `groups` open liet, hield zichzelf laag met:

> **Wordt zwaarder als:** er een uitnodigingsoppervlak komt waar de groepsnaam
> buiten de groep getoond wordt, of zodra groepsnamen doorzoekbaar worden voor
> mensen die nog geen lid zijn.

Allebei bestonden al:

```
    proname     | prosecdef | anon_mag | auth_mag
----------------+-----------+----------+----------
 invite_preview | t         | t        | t
 ontdek_groepen | t         | f        | t
```

⚠️⚠️ **Dat is precies de fout waar QS8-123 voor bestaat.** De aanname die de rij
laag hield was op het moment van schrijven al onwaar, en niemand kon dat zien
omdat er geen meting bij stond — alleen een voorspelling. **Schrijf bij een
weggezette bevinding op wat je gemeten hebt, niet wat je verwacht.**

## Het besluit: drie kolommen, en de regel is te meten

> **Vrije tekst die een niet-lid ziet vóórdat hij besluit te vertrouwen of toe te
> treden.**

Per functie nagelopen:

| Functie | Geeft | Aan wie |
|---|---|---|
| `invite_preview(code)` | `group_name`, `icon` | **`anon`** — uitgelogd, met alleen een link |
| `ontdek_groepen(…)` | `naam`, `omschrijving` | ingelogde **niet-leden** |

Dus `name`, `icon` en `omschrijving`.

📏 `categorie` en `voertaal` gaan óók mee naar niet-leden, maar dragen een CHECK
met een vaste waardenlijst en kunnen per constructie geen stuurteken bevatten.
Ze staan er met reden niet bij.

⚠️ **Dit verruimt 0269 niet.** De zes andere groepszichtbare tekstkolommen —
doeltitels, mijlpalen, chatberichten — blijven buiten, met het argument dat daar
wél opgaat: dat is inhoud van de schrijver zelf, gelezen door mensen die hem al
kennen.

### Drie constraints en niet één

Een gebundelde CHECK meldt bij een schending alleen zijn eigen naam, en dan weet
de schrijver niet wélke kolom hem tegenhoudt. Dat is de les uit de security-ronde
op QS8-450: `23514` zegt *"een CHECK weigerde dit"* en niet welke.

### Weigeren en niet strijken

Anders dan bij `display_name` in 0269. Daar strijkt de aanmeldtrigger omdat een
**provider** de naam aanlevert en een geweigerde aanmelding een account kost.
Hier typt de gebruiker zelf, op allebei de routes, en dan is een melding het
juiste antwoord — hij kan het meteen verbeteren.

## 📏 De twee schrijvers, allebei gemeten

De les van §7a in `docs/decisions/2026-09-13-twee-poorten-die-elkaar-niet-kenden.md`.

1. **`create_group()`** — `security definer`, zet de naam bij het aanmaken.
2. **`PATCH /rest/v1/groups`** — `has_column_privilege('authenticated',
   'public.groups', 'name', 'UPDATE')` is **`t`**, `groups_update` is
   `is_group_admin(id)`, en `guard_group_update()` noemt `name` **niet**. Die
   trigger pint acht andere kolommen vast (`invite_code`, `status`,
   `zichtbaarheid`, `tz`, `huddle_day`, …) — `name` staat er niet tussen.

📏 Van de dertien functies die `groups` bijwerken raakt alleen `create_group()`
deze kolommen aan; de andere twaalf zetten status, activiteit, uitnodigingscode,
zichtbaarheid, ontdekbaarheid en huddledag. Nagemeten op `prosrc`.

⚠️ **Een CHECK dekt allebei, een policy of kolomgrant zou dat niet doen.** Een
`security definer`-functie draait met de rechten van de eigenaar en komt langs
elke policy; een CHECK geldt voor élke schrijver. Dát is de reden dat de grens
hier een CHECK is en geen grant.

## 📏 De ijking — vijf grendels, vooraf gemeten op 12 groen

| | Mutatie | Wat er rood werd |
|---|---|---|
| C1 | `groups_name_geen_bidi` droppen | **4** — de drie PATCH-weigeringen én de aanmaakroute |
| C2 | `groups_icon_geen_bidi` droppen | 1 |
| C3 | `groups_omschrijving_geen_bidi` droppen | 1 |
| C4 | `grant execute on zonder_bidi from authenticated` | **11 van de 12** — ook elke gewone hernoeming |
| C5 | de naam-CHECK vervangen door een anders genaamde die hetzelfde weigert | 3 — dankzij de constraintnaam-assertie |

⚠️ **C1 maakt óók de aanmaaktoets rood, en dat is het bewijs dat die iets eigens
bewaakt.** Een suite die alleen de PATCH toetst, laat de definer-route open — en
dat is woordelijk hoe QS8-448 de eerste keer misging.

### ⚠️⚠️ Wat C4 liet zien over de grant

Onder C4 vielen elf toetsen om — en de **aanmaaktoets bleef groen**, met zijn
constraintnaam-assertie intact. Dat is geen gat maar een eigenschap:
`create_group()` is `security definer` en eigendom van `postgres`, dus de
aanroep van `zonder_bidi()` binnen de CHECK wordt daar met de rechten van de
eigenaar geëvalueerd.

**De grant beschermt dus alleen de directe PATCH-route.** Dat stond nergens, en
een volgende lezer zou het moeten raden.

⚠️ Die aanmaaktoets was bij zijn eerste versie groen om de **verkeerde** reden:
hij eiste alleen *"het mislukte"*, en onder C4 mislukte `create_group()` ook —
op `permission denied`. Een dichte deur leest als een veilige deur. Hij eist nu
de constraintnaam, en dát is wat hem onder C4 om de juiste reden groen laat.

## Wat er blijft liggen

Twee dingen die in het meten boven kwamen en met hun voorwaarde in
`docs/ENGINEER-REVIEW.md` staan:

- `groepSchema.name` gebruikt `.trim().max(60)`, en `.max()` telt
  **UTF-16-eenheden**. 📏 Veertig emoji zijn 80 eenheden: de client weigert die
  naam, terwijl de CHECK (80 codepunten) en `create_group()` (60 codepunten) hem
  allebei doorlaten. De client is dus strenger op een manier die van de inhoud
  afhangt — de klasse van QS8-448, één oppervlak verderop.
- Er komt geen nette melding vóór de grens: `groepSchema` kent de bidi-regel niet,
  dus een gebruiker die zo'n naam intypt krijgt de databasefout te zien.
