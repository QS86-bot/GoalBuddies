# Een websleutel heeft een vorm — en de curve rekent de database zelf

**Datum:** 18-11-2026 · **Issue:** QS8-696 · **Migratie:** `0329_een_websleutel_heeft_een_vorm.sql` (nummer voorlopig; zie onder)

## Aanleiding

`registreer_push_token()` toetste `p256dh` en `auth` alleen op lengte (≤ 255 octetten). 📏 QS8-690 vond op productie 16 web-tokens, waarvan 9 onbruikbaar. De pushjob ruimt zulke rijen op bij het versturen, maar een client met dezelfde fout zette ze na elke opruiming terug, want de RPC nam ze aan.

## Besluit

De RPC weigert een web-abonnement:

* **`p256dh_ongeldig`** als `p256dh` geen base64url is, niet 65 octetten lang is, niet begint met `0x04`, of geen punt op P-256 is;
* **`auth_ongeldig`** als `auth` geen base64url van 16 octetten is.

Dat zijn dezelfde regels als `abonnementFout()` in de client (QS8-690). Twee hulpfuncties dragen ze: `websleutel_octetten(text)` (base64url naar `bytea`, of NULL) en `is_p256_punt(bytea)`. Beide zijn `immutable`, geen definer, en niet uitvoerbaar voor `anon` en `authenticated`.

## De keuze die het issue openliet: de curvetoets ook in SQL

**Gekozen: ja, in de database, naast de client.**

* 📏 In Deno 2.9.6 slaagt `importKey()` op een punt buiten de curve (QS8-690), dus WebCrypto in de pushjob is geen vangnet.
* Lengte en prefix alleen laten `ligt niet op de curve` door, en dat was op productie de vaakste melding (6 van 11).
* `pgcrypto` heeft geen elliptische-krommetoets, maar `numeric` rekent met willekeurige precisie. `y² ≡ x³ − 3x + b (mod p)` is een handvol regels, en dezelfde som als `ligtOpP256()` in de client.
* Het alternatief (curve alleen in de client) laat elke andere client, of een direct RPC-verzoek, er alsnog doorheen. De regel is pas afgedwongen als de database hem afdwingt.

## Wat bewust níet

* **Geen CHECK op `push_tokens`.** Er staan kapotte rijen op productie, en een CHECK zou de migratie laten omvallen of ze eerst laten wissen (grens 2). De RPC is de enige schrijver (0211), dus elke nieuwe rij loopt erlangs.
* **Geen eigen zin voor de gebruiker.** Beide redenen krijgen de algemene zin ("dit apparaat is niet bruikbaar"), en niet die van `geen_websleutels` ("zet meldingen opnieuw aan"). Een browser die een kapot abonnement geeft, geeft bij opnieuw aanzetten hetzelfde; die zin zou een oplossing beloven die er niet is.

## Gevonden onderweg

* 📏 **De 9 kapotte tokens op productie zijn RLS-fixtures.** 3 met eerste teken `E`, 3 met `T`, 3 van 255 tekens: precies `registreerWeb(…, 'E')`, `registreerWeb(…, 'T')` en `'B'.repeat(255)` uit `tests/rls/pushtokengrens.test.ts`. Die suite draaide tegen productie (QS8-693). De fixtures zijn nu echte P-256-sleutels.
* **`tests/rls/pushredenen.test.ts` zag geen reden met een cijfer.** Het patroon was `[a-z_]+`, en dan valt `p256dh_ongeldig` stil buiten de vergelijking. Als de lijst in de client hem óók had gemist, waren beide kanten even blind geweest en was de test groen gebleven. Nu `[a-z0-9_]+`.

## Het nummer

Opnieuw gebouwd op `main` van 21-11-2026 (besluit Quinten 20-11-2026: toch bouwen, op een nieuwe tak; de oude tak is verouderd en dient alleen als bron, tag `archief/qs8-696-oude-tak`). Voorlopig nummer `0329`. Wie als tweede merget, hernummert (QS8-318) met `npm run migratie:hernummer`.

## Het pad terug

Zie de kop van de migratie: eerst `registreer_push_token()` terugzetten naar de vorm van 0234, daarna de twee hulpfuncties droppen. Er verandert geen data.
