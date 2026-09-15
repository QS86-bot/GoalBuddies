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

### ⚠️⚠️ En het argument waarmee ik de rest buiten hield, was onwaar

Hier stond: *"de zes andere groepszichtbare tekstkolommen — doeltitels,
mijlpalen, chatberichten — blijven buiten, want dat is inhoud van de schrijver
zelf, gelezen door mensen die hem al kennen."*

📏 **Gemeten in de security-ronde, en voor `goals.title` is dat aantoonbaar
onjuist.** `invite_preview()` gaat verder dan `group_name` en `icon`:

```
'goal_title', case when ingelogd then ( select gg.title … ) else null end
```

Die tak hangt aan **`ingelogd`** en niet aan lidmaatschap. Een ingelogde
**vreemde** met een uitnodigingslink krijgt dus de doeltitels van de leden
terug, in hetzelfde antwoord als de groepsnaam — en
`app/uitnodiging/[code].tsx` rendert ze op dezelfde kaart:

```
<Subheading>{u.group_name}</Subheading>
…
<Caption>{lid.goal_title ?? …}</Caption>
```

Boven de meedoen-knop. Dezelfde schade, dezelfde functie, hetzelfde scherm als
waarvoor `groups_name_geen_bidi` net gebouwd is.

⚠️⚠️ **Dit is precies de fout die dit besluit zegt te repareren, nog een keer.**
Het document hierboven schrijft op dat een weggezette bevinding laag bleef staan
op een aanname die al onwaar was — en zette er toen een nieuwe rij onder met
opnieuw een aanname in plaats van een meting. **Een 📏 die niet klopt is duurder
dan een ontbrekende meting, want de eerste lees je als bewijs.**

**Wat er daarom veranderd is:** de scope-regel is versmald tot wat hij werkelijk
dekt — *vrije tekst **in `groups`** die een niet-lid ziet* — en `goals.title`
staat als gemeten gat met zijn eigen issue. Wat 0270 doet is onveranderd; wat het
document beweert niet meer.

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

⚠️⚠️ **Hier stond dat `create_group()` onder C4 omviel op `permission denied`,
en dat was een aanname die als meting was opgeschreven.** Ze sprak bovendien de
alinea hierboven tegen: als de definer-route met de rechten van de eigenaar
draait, kán hij niet op een ingetrokken `authenticated`-grant vallen.

📏 Nagemeten in een geïsoleerde database, alle vier de combinaties:

| | directe insert, schoon | directe insert, bidi | definer, schoon | definer, bidi |
|---|---|---|---|---|
| **mét** grant | ok | `23514` | ok | `23514` |
| **zónder** grant | `42501` | `42501` | ok | **`23514` + constraintnaam** |

De aanmaaktoets blijft onder C4 dus groen **op de CHECK**, niet op een
permissiefout. Dat de constraintnaam-assertie er hoort, blijft waar — een toets
die alleen *"het mislukte"* eist, leest een dichte deur als een veilige deur —
maar de reden is deze tabel en niet wat ik eerst opschreef.

## ⚠️ Twee gaten die deze migratie niet dicht, en allebei gemeten

**Een groepsnaam van uitsluitend onzichtbare tekens komt er nog steeds door.**
📏 `create_group(U&'\200B\200B', …)` haalt élke validatie en alle drie de CHECKs
en strandt pas op de foreign key. `create_group()` doet alleen `btrim()` en
`length >= 2` — géén `schone_naam()`, anders dan de aanmeldtrigger bij
`profiles`. En `groepSchema` helpt niet: JS `.trim()` strijkt `U+200B` niet, en
`'\u200b\u200b'.length === 2`.

⚠️⚠️ **`groups.name` is op die as dus strikt zwakker beschermd dan
`display_name`**, waar de trigger tenminste de randen strijkt. Dat is dezelfde
klasse als QS8-495 en het hoort daar bij.

**`group_join_requests.bericht` is het spiegelbeeld van de scope-regel.** Vrije
tekst **van** een vreemde, gelezen door de beheerder op het moment dat hij
besluit iemand toe te laten — 📏 geen bidi-CHECK (alleen `_len` en
`_status_valid`), `vraag_lidmaatschap_aan()` doet enkel `nullif(btrim(…), '')`,
en `app/groep/beheer/[id].tsx` rendert naam → bericht → "Aannemen"/"Afwijzen".

De regel hierboven zegt *"tekst die een niet-lid **ziet** vóór hij besluit te
vertrouwen"*. De omgekeerde richting — tekst **van** een niet-lid, gelezen vóór
een **autorisatiebesluit** — weegt minstens even zwaar, want lidmaatschap is de
grens waar domeinregels 3, 4 en 7 alle drie op leunen.

## Wat er blijft liggen

Twee dingen die in het meten boven kwamen en met hun voorwaarde in
`docs/ENGINEER-REVIEW.md` staan:

- `groepSchema.name` gebruikt `.trim().max(60)`, en `.max()` telt
  **UTF-16-eenheden**. 📏 Veertig emoji zijn 80 eenheden: de client weigert die
  naam, terwijl de CHECK (80 codepunten) en `create_group()` (60 codepunten) hem
  allebei doorlaten. De client is dus strenger op een manier die van de inhoud
  afhangt — de klasse van QS8-448, één oppervlak verderop.
- Er komt geen nette melding vóór de grens: `groepSchema` kent de bidi-regel niet.
  📏 Hier stond dat de gebruiker dan "de databasefout" ziet, en dat is onjuist —
  en het werkelijke gedrag is **slechter**. `maakGroep()` en `wijzigGroep()` in
  `src/modules/buddies/api.ts` vangen élke fout af en tonen
  `t('groep.aanmaken_mislukt_kort')` respectievelijk `t('groep.opslaan_mislukt')`.
  De beheerder krijgt dus een ondoorzichtig *"opslaan mislukt"* zonder enige
  aanwijzing wélk teken het probleem is, en kan het niet zelf oplossen.
