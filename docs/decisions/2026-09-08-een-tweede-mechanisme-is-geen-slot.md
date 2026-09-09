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

📏 `authenticated` heeft op `push_tokens` geen `INSERT` en geen `UPDATE` (wel
`SELECT`, `DELETE` en `REFERENCES`), en er is geen insert-policy. Alleen
`push_tokens_select` en `push_tokens_delete` bestaan, allebei eigenaar-only. Deze
`SECURITY DEFINER`-RPC is dus de enige weg naar binnen, en ze trimt altijd.

### 2a. Die premisse was een toestand — nu is het een grendel

⚠️⚠️ Hier stond eerst: *er kán geen rij bestaan met spaties eromheen.* 📏 De
security-review heeft dat nagespeeld, en het klopte maar half.

| | geankerde vormtoets op de kolom | gevolg |
|---|---|---|
| **native** | ja — `push_tokens_native_vorm` roept `is_expo_pushtoken()` aan | zelfs `service_role` krijgt `23514` op `'  ExponentPushToken[x]  '` |
| **web** | nee — die CHECK luidt `platform = 'web' or is_expo_pushtoken(token)`, en `is_pushdienst()` staat alléén in de RPC | `service_role` krijgt `'  https://fcm.googleapis.com/fcm/send/…  '` er gewoon in |

📏 En dan doet de nieuwe functie iets anders dan de oude:

```
 van_a |                      opgeslagen
 t     | [  https://fcm.googleapis.com/fcm/send/divergentie  ]
 f     | [https://fcm.googleapis.com/fcm/send/divergentie]
```

Twee rijen waar de `delete` er één maakte. Beide adressen werken bij `fetch()` —
de WHATWG-URL-parser strookt witruimte weg — dus het slachtoffer blijft meldingen
krijgen op een toestel dat is overgenomen.

**Vandaag is dat onbereikbaar.** Er bestaat geen enkele `service_role`-schrijver:
de meldingenjob doet alleen `select` en `delete`. Maar 0209 schreef zelf op waarom
dat te weinig is — **dat is een toestand en geen grendel** — en dit project heeft
die les al twee keer betaald (0179 en 0209 gaan er letterlijk over). Dus:

```sql
alter table public.push_tokens
  add constraint push_tokens_token_getrimd check (token = btrim(token));
```

📏 Drie dingen gemeten voordat die erin ging. `btrim(x)` en `trim(x)` strippen in
Postgres allebei alléén spaties, dus de CHECK is exact de normalisatie die de
functie zelf toepast en de RPC kan geen waarde produceren die hij weigert. Een
token mét een tab komt sowieso niet binnen, want `is_expo_pushtoken()` en
`is_pushdienst()` zijn allebei geankerd én sluiten `[:space:]` uit. En op
productie staan 0 rijen in `push_tokens`, dus er valt niets te normaliseren.

⚠️ **Hij hoort in déze migratie en niet in een volgende.** Zonder hem is de
onderbouwing van 0211 een gemeten omstandigheid; met hem is het een eigenschap van
het schema. Een besluit dat op een aanname leunt, hoort die aanname mee te
leveren.

## 3. Wat er verandert, en wat er niet verandert

Precies één waarneembaar ding: bij een overname houdt de rij haar `id` en
`created_at`, in plaats van dat er een verse rij komt.

📏 Nagemeten dat daar niets aan hangt:

| | |
|---|---|
| foreign keys naar `push_tokens.id` | geen |
| andere functies die de tabel noemen | geen — alleen deze RPC |
| wat de meldingenjob leest | `select token, platform, p256dh, auth` |
| wat de client leest | **alle acht kolommen**, van zijn eigen rijen — zie hieronder |

⚠️ **Dat het vrij was om te kiezen, betekent niet dat het niet vastgelegd hoort
te worden.** `id` en `created_at` waren tot 0211 het énige verschil tussen de twee
paden, en niets toetste ze — een test die alleen `user_id` bekijkt, blijft groen
welk pad je ook kiest. Ze staan nu in `tests/rls/pushtokengrens.test.ts`.

De keuze zelf: `created_at` hoort bij de **rij** en niet bij de eigenaar.
`last_seen_at` draagt al "wanneer heeft deze eigenaar zich voor het laatst
gemeld"; twee kolommen die hetzelfde zeggen is er één te veel.

### 3a. Er is wél een lezer, en die stond hier eerst verkeerd

⚠️ De rij hierboven zei eerst dat de client alleen `token, platform, p256dh,
auth` leest, plus een `delete`. **Dat is onjuist en de security-review heeft het
nagemeten.** `push_tokens_select` is een **rij**beperking (`user_id = auth.uid()`)
en geen **kolom**beperking; `authenticated` heeft SELECT-kolomrechten op alle
acht. Dat is precies de zin uit domeinregel 7 die dit project al een keer gekost
heeft: *RLS kan geen kolommen beperken.*

📏 Gevolg, gemeten: na een overname leest de kaper `created_at = 2026-06-10` — de
eerste registratiedatum van het slachtoffer, negentig dagen terug. Vóór 0211 kreeg
hij `now()`, want de rij was vers.

Dat is een klein maar echt nieuw metadata-lek — *wanneer heeft deze persoon dit
toestel voor het eerst aangemeld* — bovenop de al aanvaarde stille DoS uit de
dossierrij van 21-08. Het weegt licht: je moet het token al kennen, en wie het
token kent heeft het toestel al gekaapt. **Het weegt niet nul**, en het staat als
Laag-rij in `docs/ENGINEER-REVIEW.md` met de voorwaarde eronder waaronder het
zwaarder wordt.

⚠️ **Waarom dit niet alsnog de `delete` terughaalt.** Die zou het lek dichten door
elke overname een verse rij te geven — maar tegen de prijs van het tweede
mechanisme dat dit hele besluit weghaalt, en van een unieke-schending die tussen
`delete` en `insert` op kan treden als een derde hetzelfde token registreert
(`on conflict` kan dat per constructie niet). Wil je het lek écht dicht, dan is
`created_at` op `now()` zetten in de conflicttak de goedkope weg. Dat is een
gedragswijziging op een kolom die niets leest, en dus een eigen besluit — niet
iets om in deze migratie mee te smokkelen.

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
