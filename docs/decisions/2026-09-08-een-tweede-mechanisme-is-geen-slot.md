# Een tweede mechanisme is geen slot

**Datum:** 08-09-2026 · **Issue:** QS8-367 · **Migratie:** 0211

`registreer_push_token()` droeg twee mechanismen voor dezelfde overname. Eén
ervan las als het slot op het gedeelde-apparaatgeval en deed niets. Dit document
legt vast welke van de twee weggaat en waarom weghalen beter is dan repareren.

## 1. Wat er gemeten is

De functie schrijft overal `trim(p_token)`, behalve op één plek:

```sql
delete from push_tokens where token = p_token and user_id <> v_uid;

insert into push_tokens (user_id, token, …)
values (v_uid, trim(p_token), …)
on conflict (token) do update set user_id = excluded.user_id, …;
```

📏 Die `delete` staat er zo sinds 0055 en is nooit meeveranderd — ook niet toen
de lengtetoetsen (0179) en de vormtoets (0209) erbij kwamen, die allebei wél
`trim(p_token)` lezen.

Met `'   ExponentPushToken[X]   '` mist de `delete` dus. **En de overname gebeurt
alsnog**, want de `insert` trimt wél, botst op de bestaande rij, en de
`on conflict` zet `user_id` om.

⚠️ **De uitkomst is in beide gevallen identiek.** Het token belandt bij de
laatste registreerder. Dat maakt dit geen autorisatiegat — het maakt het iets
anders, en dat is de eigenlijke vondst: **de `delete` is dode code naast de
`on conflict`, terwijl hij leest als de grendel.** Zo staat hij ook in de
dossierrij van 21-08 beschreven.

## 2. Waarom weghalen en niet trimmen

Het issue noemt twee opties. Trimmen laat twee mechanismen staan die voortaan
hetzelfde moeten blijven doen — een naad (onwrikbare regel 18) op een plek waar
er geen hoeft te zijn. Weghalen laat er één over, en dat is de enige die het werk
al deed.

**Dat kan omdat deze tabel precies één schrijver heeft, en dat is gemeten:**

📏 `authenticated` heeft op `push_tokens` alléén `SELECT` — geen `INSERT`, geen
`UPDATE` — en er is geen insert-policy. Alleen `push_tokens_select` en
`push_tokens_delete` bestaan, allebei eigenaar-only. Deze `SECURITY DEFINER`-RPC
is dus de enige weg naar binnen, en ze trimt altijd.

Daarmee vervalt het enige geval waarin de twee mechanismen uit elkaar zouden
lopen: **er kán geen rij bestaan met spaties eromheen** waarop de `delete` wél
zou matchen en de `on conflict` niet.

## 3. Wat er verandert, en wat er niet verandert

Precies één waarneembaar ding: bij een overname houdt de rij haar `id` en
`created_at`, in plaats van dat er een verse rij komt.

📏 Nagemeten dat daar niets aan hangt:

| | |
|---|---|
| foreign keys naar `push_tokens.id` | geen |
| andere functies die de tabel noemen | geen — alleen deze RPC |
| wat de meldingenjob leest | `select token, platform, p256dh, auth` |
| wat de client leest | hetzelfde, plus een `delete` op `token` |

⚠️ **Dat het vrij was om te kiezen, betekent niet dat het niet vastgelegd hoort
te worden.** `id` en `created_at` waren tot 0211 het énige verschil tussen de twee
paden, en niets toetste ze — een test die alleen `user_id` bekijkt, blijft groen
welk pad je ook kiest. Ze staan nu in `tests/rls/pushtokengrens.test.ts`.

De keuze zelf: `created_at` hoort bij de **rij** en niet bij de eigenaar.
`last_seen_at` draagt al "wanneer heeft deze eigenaar zich voor het laatst
gemeld"; twee kolommen die hetzelfde zeggen is er één te veel.

## 4. De dossierrij van 21-08

Het issue vraagt die na te lopen vóór je kiest, en dat is terecht: hij beschrijft
de overname als *"haalt een token weg bij de vorige eigenaar en zet hem op de
aanroeper"*.

Die analyse blijft staan — inclusief wat ze accepteert (wie een token kent kan het
naar zich toe trekken; een stille denial-of-service, geen datalek, met de entropie
van een Expo-token als bescherming). Wat er verandert is welk mechanisme het doet,
en dat deed de `on conflict` al. De rij is bijgewerkt zodat hij niet langer naar
een regel wijst die er niet meer staat.

## 5. De ijking

📏 Twee mutaties, en ze zeggen samen precies wat er is gebeurd:

| Mutatie | Wat er rood werd |
|---|---|
| `user_id = excluded.user_id` uit de `on conflict` | drie tests — de overname zelf, de identiteit en het spatiegeval |
| de oude `delete` erbij terug | **alleen** de test op `id` en `created_at` |

De tweede is de interessante. Hij laat zien dat de `delete` verder niets deed:
met hem erbij blijft de overname werken en blijft het spatiegeval werken; het
enige dat verschuift is welke rij het is. Dat is de meting waarop dit besluit
rust.
