# Een kapot abonnement en een kapotte serversleutel zijn twee dingen

**Datum:** 17-11-2026 · **Issue:** QS8-690 · **Status:** gebouwd en lokaal getoetst, niet gedeployd

## Wat er gemeten is (productie, alleen gelezen, 17-11-2026)

| meting | waarde |
| --- | --- |
| meldingen in `function_logs`, 16-11 20:35:45–20:38:18, **één** run | 11: 6× `invalid P-256 elliptic curve point`, 5× `Unexpected error decoding private key` |
| web-tokens in `push_tokens` | **16** van 9 gebruikers |
| waarvan `p256dh` 87 tekens, 65 octetten en `0x04` | **7** |
| waarvan `p256dh` structureel onbruikbaar | **9**: 3× begint met `E`, 3× met `T` (eerste octet geen `0x04`), 3× 255 tekens (te lang) |
| `auth` van 16 octetten | 16 van 16 |

(Gelezen als tellingen en lengtes; geen token en geen sleutel is geciteerd.)

## Wat het betekent

`maakPakket()` ving het versleutelen (`p256dh`/`auth` van het abonnement) en
`vapidAuthorization()` (onze eigen `VAPID_PRIVATE_KEY`) in één `catch`, onder één
tekst `versleutelen mislukte: …`. Daardoor waren een kapot abonnement en een kapotte
serversleutel in het log niet te onderscheiden — en dus ook niet voor de code.

⚠️⚠️ **Deze alinea en de volgende zijn ingetrokken** — zie *Herzien na de
batch-review*, onder besluit 4: Deno geeft dezelfde tekst bij een abonnement waarvan
het punt niet op de curve ligt. Ze blijven staan als het spoor van de vergissing.

De volgorde in `maakPakket()` is eerst het abonnement, dan de serversleutel. Een
`decoding private key` kan dus alleen een token treffen waarvan `p256dh` **wel**
klopte. **Dat is een redenering over de volgorde en geen meting van de omgeving**:
`VAPID_PRIVATE_KEY` zelf is hier niet te lezen. Wat ze zegt: de 5 meldingen over de
privésleutel komen van abonnementen die zelf in orde waren, dus **alle 7
bruikbare webabonnementen hebben vermoedelijk geen melding gekregen**, en dat is
een zaak van de sleutel in de omgeving van de functie. Dat de 9 kapotte rijen er
bij staan verklaart waarom de andere zes niet op de sleutel strandden.

## Besluit

1. `abonnementFout()` toetst het abonnement los van onze sleutels (65 octetten, `0x04`, een
   punt dat WebCrypto als P-256 importeert, `auth` van 16 octetten). Faalt dat, dan
   is de uitkomst `ongeldig` en gaat de rij uit `push_tokens`: de rij is de oorzaak en
   elke volgende ronde faalt hetzelfde. *(Verscherpt na de batch-review: zie besluit 4
   tot en met 6 hieronder.)*
2. Een fout bij `vapidAuthorization()` heet nu `VAPID-sleutel onbruikbaar: …` en
   blijft `mislukt`. Daar gaat **nooit** een rij voor weg: dat zou één kapotte
   omgevingsvariabele omzetten in het verlies van elk abonnement.
3. Het abonnement wordt vóór de serversleutel getoetst. Een abonnement dat zelf niet
   deugt gaat weg, ook als onze sleutel óók kapot is.

⚠️ **Dit gooit gegevens weg** (grens 2 in `CLAUDE.md`): de 9 structureel kapotte rijen
verdwijnen bij de eerstvolgende ronde na de deploy. Het zijn rijen die nooit iets
hebben kunnen afleveren en die de gebruiker met een nieuwe registratie vervangt;
er gaat geen geschiedenis mee. Conservatiefste keuze die het issue afmaakt, maar
wie de rijen eerst wil bekijken, haalt ze op met de telling hierboven.

## Wat niet gemeten is

* **Of `VAPID_PRIVATE_KEY` in de omgeving kapot is.** Zeker is alleen dat de code er niet
  mee kon rekenen op 16-11 20:36. Meten na de deploy: staat `VAPID-sleutel
  onbruikbaar` in het log, dan is het de omgeving, en lost opruimen niets op.
* Waarom de 3 rijen met `E`/`T` en de 3 van 255 tekens zijn ontstaan; ze lijken op
  proefdata (3 gebruikers per vorm).
* Of de 11 meldingen alle abonnementen van die run waren. De run van 17-11 04:02 werd
  afgekapt en kwam misschien nooit bij de webtokens.

## Herzien na de batch-review van 17-11-2026

`code-critic` en `security-reviewer` kwamen op de batch-PR #679 onafhankelijk op
hetzelfde punt uit, en Quinten stuurde het werk terug naar de bouwsessie. 📏 De
code-critic toonde aan dat `abonnementFout()` **elke** exceptie ving als
`ongeldig`: met een geldig abonnement en een `importKey()` die een
`TypeError('runtime kapot')` gooit, kwam `ongeldig` terug. Dat is precies de klasse
die besluit 1 hierboven uitsloot ("de rij is de oorzaak"), en het betekende dat één
WebCrypto-regressie in één ronde elk web-abonnement wist.

**4. `ongeldig` alleen bij vier oordelen die van de rij komen.** De lengte en het
eerste octet van `p256dh`, de lengte van `auth`, en een `DOMException` met naam
`DataError` (`importKey`: geen punt op de curve) of `InvalidCharacterError`
(`atob`: geen base64). Elke andere worp is `mislukt` en de rij blijft.

⚠️⚠️ **En het punt op de curve rekent de code zelf** (`ligtOpP256()`,
`y² ≡ x³ − 3x + b mod p`). 📏 Gemeten in Deno 2.9.6 (`node_modules/.bin/deno`):
`importKey()` **slaagt** op een punt van 65 octetten met `0x04` dat niet op de curve
ligt — één bit omgedraaid, of `0x04` gevolgd door nullen — en pas `deriveBits()`
valt om, met een **`TypeError` "Unexpected error decoding private key"**. Node geeft
op hetzelfde punt een `DataError`. De tests draaien in Node; een toets die op
`importKey()` leunt, was daar groen en in productie dood. Na de wijziging 📏 in Deno
gemeten: een geldig punt `null`, beide vormen buiten de curve `ongeldig`,
`atob` geeft daar óók een `DOMException` `InvalidCharacterError`.

⚠️⚠️ **Dit trekt de conclusie over de VAPID-sleutel hierboven in.** "Unexpected error
decoding private key" kan van het **abonnement** komen en niet van onze sleutel: het
is precies wat Deno zegt bij een punt buiten de curve. De 5 meldingen van 16-11 zijn
dus géén aanwijzing dat `VAPID_PRIVATE_KEY` kapot is. **Niet roteren op grond van die
redenering.** Na de deploy maakt het log het onderscheid wel: `VAPID-sleutel
onbruikbaar` is onze sleutel, `ongeldig abonnement opgeruimd: p256dh ligt niet op
P-256` het abonnement.

**5. Een stroomonderbreker over de hele run, niet per gebruiker.** `stuurWeb()`
verwijdert een `ongeldig` abonnement niet meer zelf; het noteert hem in een
`Opruimlijst` die de hele run deelt, en `ruimOngeldigeOp()` beslist aan het eind.
Waren **alle** web-uitkomsten van de run `ongeldig`, dan wordt er niets verwijderd en
alleen gemeld (`webpush_alles_ongeldig`, naar Sentry vanaf drie getoetste
abonnementen, zodat een kleine gezonde run geen alarm geeft). Dat is het patroon dat
een kapotte toets altijd geeft en een verzameling echte abonnementen nooit. Getoetst
wordt per **rij** en niet per uitkomst, en een `mislukt` waarbij het abonnement zelf
niet getoetst kon worden telt niet mee als bewijs.

**5a. Een plafond: hoogstens 3 wissingen per run, `weg` en `ongeldig` samen**
(security-review op het herstel). De onderbreker vangt alleen een fout die élk
abonnement raakt. 📏 Een `vanBase64url()` zonder de `-`/`_`-vertaling raakt er volgens
de reviewer 96,4% (gemeten over 20.000 sleutels; zelf nagerekend als ≈ (62/64)^109):
de rest wordt bezorgd en de onderbreker springt niet. Wat boven het plafond valt
blijft staan en gaat als `webpush_wisplafond` naar Sentry. De 9 kapotte rijen van
17-11 zijn zo in drie runs weg.

*Waarom geen drempel op het aandeel.* De code-critic stelde "onderbreken boven 50%"
voor. 📏 Op productie is vandaag 9 van 16 = 56% kapot; die drempel zou precies de
opruiming tegenhouden waar dit issue om vraagt. Het plafond begrenst de schade bij
elke verhouding.

*Waarom de run en niet één aanroep van `stuurWeb()`.* De review vroeg de onderbreker
"in `stuurWeb()`". Per aanroep is "alle rijen ongeldig" voor wie één web-abonnement
heeft — 📏 16 tokens van 9 gebruikers, dus de meesten — altijd waar, en dan gaat zijn
kapotte rij nooit weg. Over de run weegt elk bruikbaar abonnement van een ander mee als
bewijs dat de toets werkt. *De prijs:* een run die alleen kapotte abonnementen ziet,
ruimt niets op; de rij gaat pas weg in een run die ook een bruikbare tegenkomt.
`weg` (404/410) valt erbuiten: dat oordeel komt van de pushdienst en blijft direct.

*En daarom staat de toets op het abonnement nu vóór de grens op de payload.* Elke
uitkomst telt in de onderbreker als een oordeel over het abonnement; een `mislukt`
om een te lang bericht had de toets nooit gezien.

**6. De delete filtert op `token`, `p256dh` én `auth`.** Tussen het lezen en de
delete kan de browser zich op hetzelfde endpoint opnieuw geabonneerd hebben;
op `token` alleen wiste het oordeel over het oude abonnement het nieuwe.

**Pad terug:** de vorige vorm staat op `fc30d687`. Gaan rijen te traag weg, dan is de
knop `MAX_WISSEN_PER_RUN` en niet het weghalen van de onderbreker.
