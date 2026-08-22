# De RLS-suite logt niet meer in

> ⚠️ **Hernummer dit bestand bij het samenvoegen.** Datum in plaats van nummer,
> om dezelfde reden als het beslisdocument over de beslisbevoegdheid: deze sessie
> draaide op een remote clone van 19-08 en kon niet zien welke nummers na `002`
> lokaal vergeven zijn.

**Status:** besloten door Quinten, 22-08-2026 · **Issue:** QS8-116 (Q-TODO A47)
**Raakt:** `tests/rls/harness.ts`, `tests/rls/jwt.test.ts`, `tests/rls/token.test.ts`, `.env.example`

## De aanleiding

Een volle RLS-run was niet meer te vertrouwen. Twee runs achter elkaar gaven 1
respectievelijk 5 falende bestanden, elke keer andere, en élk bestand was in
isolatie groen. Het faalbeeld was geen melding over een limiet maar een fixture
die halverwege omvalt: een paar bestanden rood, de rest "skipped". Dat leest als
een kapotte policy.

Waarom dat kritiek was en niet vervelend: een suite die soms zonder aanwijsbare
reden rood is, leert je om rood te negeren. Zolang dit stond zei "npm test is
groen" niets meer over domeinregel 7.

## Wat de meting liet zien — en waarom de diagnose in het issue niet klopte

De aanname was: de suite maakt ~40 aanmeldingen, Supabase weigert na ~30 per uur.
De auth-logs van 21 en 22-08 spreken dat op twee punten tegen.

**Aanmelden is niet gelimiteerd.** Alle 429's staan op `/auth/v1/token` met
`grant_type: password` — dat is `signInWithPassword`. Op `/auth/v1/admin/users`
staat in 24 uur geen enkele 429:

| Uur (22-08) | accounts aangemaakt | geweigerd |
|---|---|---|
| 10:00 | 146 | 0 |
| 11:00 | 133 | 0 |
| 12:00 | 370 | 0 |

**En het is geen uurquotum van ~30.** In datzelfde 12:00-uur slaagden 262
inlogpogingen; in de minuut 12:35 alleen al 39.

| Uur (22-08) | inlogpogingen OK | geweigerd |
|---|---|---|
| 10:00 | 110 | 0 |
| 11:00 | 99 | 0 |
| 12:00 | 262 | 13 |

De weigeringen vallen alleen waar volle runs kort achter elkaar stapelen én de
inlogs gelijktijdig vuren: om 12:36:26 staan vijf 429's en drie 200's in dezelfde
seconde. Het is een burst-limiet per IP (`remote_addr`), geen quotum per project.

De exacte drempel en het venster zijn niet hard gemeten. Dat het een
korte-venster-burstlimiet per IP is, wel.

## Waarom niet A of B

**A — één set fixtures voor de hele run.** Vermindert het aantal *accounts*, en
dat is precies de as die niet gelimiteerd is. Je betaalt er gedeelde state tussen
suites voor. Winst op de verkeerde grootheid. Om dezelfde reden heeft de ingreep
van 22-08 — 43 naar 31 aanmeldingen via `createTestProfile` — het faalbeeld
waarschijnlijk niet geraakt.

**B — een eigen testproject.** Helpt wél, maar niet omdat het quotum meeverhuist:
omdat de limiet per IP geldt en je vanaf dat IP dan nog maar één project raakt. B
blijft op eigen kracht de moeite waard, want de suite raakt productie aan. Dat is
een ánder probleem en verdient een eigen afweging, niet meeliften op een rood
testbeeld.

## Het besluit — C: niet meer inloggen

`admin.createUser()` blijft. `signInWithPassword()` verdwijnt uit
`createTestUser()`; de harness tekent het gebruikers-JWT zelf met
`SUPABASE_JWT_SECRET`.

Auth-verzoeken per run: van ~31 naar **één** — de controletest hieronder.

**Waarom dit mag.** De anon-key van dit project is een legacy HS256-JWT, dus
PostgREST verifieert symmetrisch met hetzelfde secret. Een token met dezelfde
claims is voor PostgREST niet te onderscheiden van een token van GoTrue.
Nagemeten: **194** voorkomens van `auth.uid()` in de migraties en **nul** van
`auth.jwt()`, `auth.role()` of `request.jwt.claims`. De policies hangen dus
uitsluitend aan `sub`. Geen enkele test opent een realtime-kanaal — de
realtime-controle loopt via de RPC `realtime_bewaking()` als admin — dus
`realtime.setAuth()` speelt niet.

⚠️ Beide greps zijn gedraaid op de stand van 19-08. Eén policy die `auth.jwt()`
gaat lezen verandert welke claims het token moet dragen.

**Wat we opgeven,** en hoe het gedicht is. Het bewijs dat GoTrue zélf correcte
claims uitgeeft — nooit de vraag van een RLS-suite. `token.test.ts` haalt één
echte sessie op per run en vergelijkt `sub`, `role`, `aud` en `iss` claim voor
claim. Gelijkheid, niet twee insluitingen.

## Wat er is gebouwd

- `hs256()` apart van `tekenGebruikersToken()`, zodat de handtekening te toetsen
  is aan een **externe** vector.
- `jwt.test.ts` — RFC 7515 §A.1. Draait **zonder credentials en dus in CI**. Dat
  is bewust: het stilste faalpunt (base64url versus base64, HMAC over de
  verkeerde bytes) was anders nergens gedekt, want de rest van `tests/rls/` slaat
  zichzelf over zodra `.env` ontbreekt.
- `token.test.ts` — de poort: eigen rij lezen (positief), andermans rij niet
  (negatief), een vervalste handtekening wordt geweigerd, en de controletest.
- Een 429 op een auth-call stopt luid met "dit is GEEN policyfout".

## Wat er open blijft

- **Twee volle runs achter elkaar groen** is hier niet aangetoond: de
  bouwomgeving had geen `.env` en dus geen credentials. Typecheck, lint en de
  204 tests die zonder Supabase draaien zijn groen, inclusief de RFC-vector.
- **De suite draait nog steeds tegen productie.** Eigen issue (richting B).
- `docs/WERKVOORRAAD.md` §0 en §3b zijn niet bijgewerkt — dat bestand liep hier
  drie dagen achter en blind bewerken zou de nieuwere versie beschadigen.
