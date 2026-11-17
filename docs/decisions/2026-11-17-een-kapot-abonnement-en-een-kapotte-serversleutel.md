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
   elke volgende ronde faalt hetzelfde.
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
