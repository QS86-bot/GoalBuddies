# De uiterlijkvoorkeur is een eigenaarsrij en de laatste keuze wint

QS8-729, migratie 0303, 19-11-2026. Bouwt op het besluit van Quinten in QS8-722
(aparte, eigenaar-only tabel) en zijn rondes op QS8-729 (vijf voorkeuren,
laatste keuze wint).

## Wat er staat

Tabel `gebruikersvoorkeuren`, primaire sleutel `user_id` (cascade op `profiles`).
Vijf keuzekolommen met een CHECK-allowlist: `stijl` (a, b, c), `kleurvariant`
(geen, baai, avondgloed, bosrand, pruim, koraal), `weergave` (donker, licht,
systeem), `dichtheid` (ruim, compact), `emoji` (boolean). Standaard: b, geen,
donker, ruim, aan. `bijgewerkt_op` wordt door een trigger gezet.

## Keuzes van de bouwsessie (geen besluit van Quinten nodig)

1. **Rechtstreeks schrijven, geen RPC.** Eigenaar-only policies plus kolomgrants
   zijn hier even streng als een functie en laten één definer-functie minder
   achter (elke kopie erft `authenticated` als de revoke vergeten wordt).
2. **Geen `grant delete`, wel een DELETE-policy.** Zelfde keuze als 0281 bij
   `hero_profiles`: een grant zonder aanroeper is dood hout, en met een DELETE
   ernaast is "bewerken" weghalen en opnieuw invoegen. De rij gaat mee met het
   account (cascade, getest).
3. **Insert of voorwaardelijke update, nooit `upsert`.** `user_id` staat in
   `grant insert` en niet in `grant update`; `merge-duplicates` geeft dan 42501
   (gemeten, ook op deze tabel). Een upsert kan bovendien "alleen als er niemand
   tussen kwam" niet uitdrukken.
4. **De laatste keuze wint, en de server beslist wat de laatste is.** De client
   onthoudt de `bijgewerkt_op` waar een keuze op voortbouwt. Een update slaagt
   alleen als die nog klopt (`... and bijgewerkt_op = basis`); nul rijen is een
   conflict en dan wint de account. Een telefoonklok die voorloopt kan zo geen
   keuze van een ander apparaat overschrijven. De prijs: een offline keuze die
   ouder is dan een keuze van het andere apparaat verliest, zonder melding.
5. **Eerst lokaal, dan verzoenen.** De lokale kopie staat onder
   `goalbuddies.uiterlijk` (met `userId`, `basis`, `wacht`); `goalbuddies.thema`
   blijft ongemoeid en wordt gelezen. Een bestaande gebruiker behoudt zijn
   weergave: `navy` wordt donker, `navy-licht` licht, `systeem` systeem. De
   overige voorkeuren krijgen de standaard. Een gebruiker zonder iets en zonder
   rij krijgt de standaard en er wordt geen rij voor hem aangemaakt.

## Aannames (niet gemeten of niet besloten)

- **Een variant hoort bij stijl C en bij niets anders** (CHECK
  `gebruikersvoorkeuren_variant_hoort_bij_c`). Het issue noemt alleen "geen
  variant" als standaard; deze koppeling is de aanname van de bouwsessie. De
  client normaliseert vóór het schrijven (naar C zonder variant geeft `baai`).
- **Een gebruiker zonder bewaarde keuze krijgt donker**, ook al volgde hij tot
  nu toe het toestel (`systeem` was de ThemeProvider-standaard). Dat is de
  standaard uit het issue; wie het toestel wil volgen kiest "systeem".
- **`bosrand`, `pruim` en `koraal` mogen in de database**, ook al kent het
  palet er vandaag alleen twee. Koppeling en terugval zijn QS8-723/QS8-731.
- **Niet aangesloten op `ThemeProvider`**: die map is van QS8-725. De module
  levert `leesLokaleStart()`, `verzoenMetAccount()` en `kiesVoorkeur()` en wacht
  op de aansluiting.
- **`database.types.ts` kent de tabel nog niet**: de migratie wacht op
  Quintens backup en het bestand is een afschrift van productie. `api.ts` loopt
  door één smalle ongetypeerde rand die na `npm run types:db` kan verdwijnen.

## Wat dit niet is

Geen nieuw groepsoppervlak (rij 54 in `002-domeinregel7-oppervlakken.md`), geen
realtime, geen wijziging aan `profiles` of de kolomgrant van 0089.
