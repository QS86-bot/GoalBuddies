# Het `lang`-attribuut van het document volgt de taal, en dat gebeurt in de i18n-module (QS8-741)

Besloten 19-11-2026 door een bouwsessie, als vervolg op QS8-740 (gevonden in de matrix van dat issue).

## Wat gemeten is

📏 Lokale webexport, Playwright, 19-11-2026, vóór en na de wijziging op dezelfde scenario's (`origin/main` tegen deze tak):

| scenario | `lang` op `main` | `lang` na |
|---|---|---|
| uitgelogd, client `nl-NL` | `nl` | `nl` |
| uitgelogd, client `en-US` | **`nl`** | `en` |
| client `nl-NL`, `profiles.locale = 'en'` | **`nl`** | `en` |
| in het profiel English kiezen, zonder herladen | **`nl`** | `en` |
| daarna Nederlands kiezen, zonder herladen | `nl` | `nl` |

`app/+html.tsx` zet `<html lang="nl">` vast voor elke geëxporteerde pagina. Een schermlezer kiest zijn stem op dat attribuut: Engelse tekst werd voorgelezen met een Nederlandse stem. #418 is op beide builds identiek (1, 0, 1, 1): deze wijziging voegt er geen toe (het attribuut staat op `<html>`, buiten de React-boom).

## Besluit

1. **`zetTaal()` en `zetTaalUitApparaat()` zetten het attribuut zelf**, via `zetDocumentTaal()` in `src/shared/i18n/documenttaal.ts`. Alleen als `globalThis.document` bestaat; op de server (`expo export`) en op native doet het niets.
2. **Niet in `app/_layout.tsx` en niet in een React-hook of effect.** De taal is een procesbrede variabele en geen state (zie de kop van `src/shared/i18n/index.ts`): wie het attribuut op een andere plek bijwerkt dan waar de taal verandert, loopt achter of vergeet een ingang (er zijn er twee: de start en het profiel/de taalkeuze). Dat het in de i18n-module gebeurt, is bovendien de reden dat `app/_layout.tsx` niet nog een keer aangeraakt hoefde te worden (QS8-710 en QS8-740 staan daar al in, parallel).
3. **`+html.tsx` blijft op `nl` als standaard**, want de prerender is sinds QS8-740 neutraal (tekent geen taalafhankelijke tekst) en de eerste clientronde zet het attribuut meteen.

## Wat dit niet is

- Geen vertaling van meer teksten en geen wijziging aan de taalkeuze zelf.
- Geen regio in het attribuut: `en`, niet `en-GB`. De catalogus kent geen regiovarianten (`types.ts`), en `opmaaktaal()` (datumnotatie) blijft apart.
- Niet gemeten: native (daar bestaat het attribuut niet), en een echte schermlezer (de stemkeuze zelf is niet beluisterd, alleen het attribuut gemeten).

## Grendel

`src/shared/i18n/documenttaal.test.ts` (8 toetsen): het attribuut volgt de taal via beide ingangen (`zetTaal`, `zetTaalUitApparaat`), onbekende taalcodes en `null` vallen terug op de standaardtaal, en zonder document gebeurt er niets. Geijkt met de hand: de aanroep uit `zetTaal()` halen, de aanroep uit `zetTaalUitApparaat()` halen, het attribuut altijd `nl` zetten, en de `document`-bewaking weghalen; telkens viel de bedoelde toets om.
