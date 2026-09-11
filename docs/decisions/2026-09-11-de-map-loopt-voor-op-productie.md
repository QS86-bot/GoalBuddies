# De map loopt voor op productie, en het dossier zei niet welke het beschreef

**Datum:** 11-09-2026 · **Issue:** QS8-430 · **Gevonden in:** de wekelijkse audit

## 1. Wat er mis was

`docs/ENGINEER-REVIEW.md` telde acht rijen met risico **Hoog**. 📏 Nagelopen per rij —
welk issue eraan hangt, welke migratie hem repareert, en of die migratie onder de
productielijn ligt:

| rij | onderwerp | migratie | stand |
|---|---|---|---|
| 129 | `created_at` bij INSERT | 0173 | gerepareerd én gedeployd |
| 532 | `verwijder_doel()` wiste een straf + spoor | 0190 | gerepareerd én gedeployd |
| 560 | weekafsluiting verhuist mét andermans reacties | 0206 | gerepareerd én gedeployd |
| 541 | te laat afronden laat de straf vervallen | **0238** | **in de map dicht, op productie open** |

**Drie rijen waren volledig achterhaald en één wees de verkeerde kant op.**

⚠️ De code-critic las in diezelfde audit onafhankelijk hetzelfde dossier en adviseerde
*"regel 531 en 559 vóór de eerste echte gebruiker naar voren te halen"* — allebei al
gerepareerd én gedeployd. Dat is de schade: een verouderde rij stuurt aandacht naar werk
dat af is, en het overtuigendst bij de rijen die het zwaarst wegen.

## 2. De gevaarlijke richting

Rij 541 leest als een openstaand probleem in de codebase. In werkelijkheid dicht **0238**
hem, en 0238 ligt **boven** de productielijn van `0221`. Wie de rij leest en de migratiemap
controleert, concludeert "opgelost" en sluit hem — terwijl het gedrag op productie leeft:
te laat afronden laat je straf vervallen, waar domeinregel 11 zegt dat hij juist dán had
moeten afgaan.

**Een rij kan dus op twee manieren verouderen, en alleen de eerste valt op.**

## 3. De afspraak

Een rij die over gedeployde toestand gaat, noemt het migratienummer **én** of het boven of
onder de productielijn ligt. Die lijn staat op precies één plek: `docs/WERKVOORRAAD.md` §0.

Dat is het onderscheid dat QS8-421 al in de audit-skill liet opschrijven — *"noteer bij een
rij die over gedeployde toestand gaat, welke van de twee je gemeten hebt"* — en dat geen
van de acht rijen droeg.

## 4. Waarom hier bewust géén controle komt

Het issue vroeg te overwegen of `review:controle` kan afdwingen dat zo'n rij een
migratienummer draagt. **Nee, en dat is een besluit en geen uitstel.**

Een script kan niet zien of een rij over gedeployde toestand gáát — dat is de inhoud van de
zin en niet zijn vorm. Elke rij een migratienummer laten dragen zou de meeste rijen
onterecht raken; alleen de rijen die er al een noemen toetsen, beloont het weglaten ervan.

⚠️ **En een controle die het lastige geval omzeilt, bewaakt vanaf dat moment de omweg en
niet de belofte.** Dat is letterlijk de les van QS8-415. Liever handwerk dat eerlijk
handwerk heet, met de afspraak in de kop van het document waar de schrijver hem leest.

## 5. Wat het nameten opleverde dat een grep niet had gegeven

⚠️⚠️ **Rij 560 had ik bijna verkeerd afgesloten.** De rij gaat over
`week_reviews.group_id`, dus de voor de hand liggende toets is of die kolom nog in de
UPDATE-grant staat. 📏 Dat doet hij — `next_text, user_id, group_period_start, did_text,
group_id, blocked_text`.

Maar 0206 heeft het bewust **niet** met een revoke opgelost: de kop van die migratie zegt
dat een revoke gemeten en verworpen is, en de grendel is de trigger `week_reviews_pin`.
📏 Die staat er en is enabled.

**Wie deze rij naleest met een grep op de kolomgrant, meet het verkeerde en concludeert dat
hij nog open staat.** Dat staat nu in de rij zelf, want de volgende lezer doet precies wat
ik deed.

Rij 532 had dezelfde vorm: 0190 bewaart het auditspoor niet, maar **weigert** de
verwijdering zodra er een commitment aan het doel hangt — 📏 `heeft_commitment` in
`pg_get_functiondef(verwijder_doel)`. Een toets op "wordt `commitment_events` aangeraakt"
geeft daar het verkeerde antwoord.

## 6. Wat er open blijft

Vier rijen, alle vier nagemeten op 11-09-2026:

- **235** — `is_group_member()` en `shares_group_with_goal()` zijn nog `SECURITY DEFINER`.
- **540** — een straf is met één schrijfactie in te trekken (QS8-321, `wacht-op-Quinten`).
- **541** — dicht in de map, open op productie tot `0238` gedeployd is.
- **563** — geen rate limit vóór PostgREST (QS8-141, `wacht-op-Quinten`).

⚠️ Rij 563 is de enige die hier niet na te meten valt: hij gaat over de edge vóór
PostgREST, en die bestaat lokaal niet.
