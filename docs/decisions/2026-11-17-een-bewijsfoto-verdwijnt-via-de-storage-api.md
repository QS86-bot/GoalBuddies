# Een bewijsfoto verdwijnt via de Storage-API, en een account is weer te verwijderen

**Datum:** 17-11-2026 · **Issue:** QS8-692 · **Status:** gebouwd en lokaal getoetst; niet toegepast, niet gedeployd

## Wat er gemeten is (door de issuehouder, productie, alleen gelezen)

Alle **1.050 van de 1.050** `DELETE /auth/v1/admin/users/…` van 16-11 18:48–21:15 UTC
gaven HTTP 500: `Direct deletion from storage tables is not allowed … (SQLSTATE
42501)`. De keten staat in de kop van migratie 0315. Dit raakt het wisrecht van elke
gebruiker, niet alleen een testsuite. Niet gemeten: of een echte gebruiker het heeft
geprobeerd, en sinds wanneer Supabase `protect_delete` op dit project heeft.

## Gekozen: optie 2 van het issue (de weg van de chatfoto's)

| optie | besluit | reden |
| --- | --- | --- |
| 1. `set_config('storage.allow_delete_query', 'true', true)` | **nee** | laat de blob als wees achter zonder dat iets hem nog vindt; dat is precies waar de grendel van Supabase tegen is |
| 2. rij laten staan, opruimen via de Storage-API | **ja** | dezelfde vorm als 0235/0250 voor chatfoto's en -documenten; blob én rij gaan weg |
| 3. eerst de Storage-API leegmaken, dan `auth.users` | nee | een Edge Function in het pad van een verwijdering; groter en een nieuw faalpunt in het wisrecht |

Gekozen als de conservatiefste optie die het werk afmaakt, binnen een precedent dat
dit project al heeft. **Dit is geen besluit van Quinten**: het issue zegt "nog niet
gekozen".

## Wat het doet

* `wis_bewijsfotos_van_vertrekker()` raakt `storage.objects` niet meer.
* `verlopen_bewijsfotos(p_limiet)` (alleen `service_role`) geeft de paden van objecten
  in `bewijsfotos` waarvan het tweede padsegment (de eigenaar, 0230) geen profiel meer
  heeft. Een pad zonder uuid wordt nooit teruggegeven.
* `ruimVerlopenBijlagenOp()` in de rollover loopt nu over drie emmers en wist de
  paden met `storage.remove()`. De telling `bijlagenOpgeruimd` en `bijlagenMislukt`
  tellen ze mee.
* `removeTestUsers()` in `tests/rls/harness.ts` gooit nu als een testgebruiker niet te
  verwijderen was, in plaats van een `console.warn` (criterium 2).

## ⚠️ Wat dit verandert voor de gebruiker

Tussen het verwijderen van een account en de eerstvolgende rolloverrun (elk uur)
staat de foto nog als wees op de opslag. Hij is dan al onleesbaar: de leespolicy
`bewijsfotos_select` (0227) laat een lid alleen lezen via `mag_bewijsfoto_lezen()`, een
`exists` op `completions.attachment_url` met dat pad, en die rij is na de cascade
weg. Dat is gelezen en niet getoetst: geen test leest het object via het JWT van een
voormalig groepsgenoot, en het is niet tegen productie gemeten. De bytes gaan binnen
een uur weg, niet in dezelfde transactie. Onder 0230 was dat "meteen" (op papier; op
productie faalde het, en vóór 0230 wiste niets).

## Gemeten (lokaal, Postgres 16, 302 migraties)

`tests/rls/bewijsfoto-accountverwijdering.test.ts`, **negen** tests, op een lokale
stack waarvan de shim (`supabase/shim/0000_supabase_shim.sql`) `storage.protect_delete()`
en `protect_objects_delete` draagt, per statement. Die twee zijn volgens de
bouwsessie van QS8-694 op 17-11 met `pg_get_functiondef` en `pg_get_triggerdef` van
productie gelezen en woordelijk overgenomen; dat is hun meting en niet de mijne, en
een dode kopie blijft een kopie.

Gemeten door de code-critic op de batch (18-11, lokaal, Postgres 16 en PostgREST
12.2.3, 302 migraties): de drie testbestanden van deze batch zijn **34 van 34 groen**.
Met de functie van 0230 teruggezet vallen er **negen** om, niet drie:

* `bewijsfoto-accountverwijdering.test.ts`: 4 ("slaagt…", "slaagt ook zonder bewijsfoto…",
  "laat de blob staan", "wijst … aan als wees");
* `accountverwijdering-langs-de-storagegrendel.test.ts`: 3, alle met `42501`;
* `een-bewijsfoto-volgt-zijn-voltooiing.test.ts`: 1;
* `removeTestUsers()` gooit in `afterAll`: "4 testgebruiker(s) konden niet verwijderd
  worden". Acceptatiecriterium 2 is daarmee gemeten, en het werkt.

Met de trigger omgezet naar `for each row` wordt "heeft de grendel … per statement"
rood en worden de "zónder foto"-toetsen terecht groen: de grendel is de test en geen
toeval. Verder met de hand gebroken: de uuid-controle, de `not exists` en de
emmerfilter; elke keer viel de bedoelde test om (bij `not exists` drie).

## Niet gemeten

* **Acceptatiecriterium 1** (op productie een testaccount mét bewijsfoto aanmaken en
  verwijderen, HTTP 200, geen rij en geen blob): een bouwsessie schrijft niet naar
  productie. Meten na de toepassing van de migratie en de deploy van `rollover`.
* De rollover-kant (`verlopen_bewijsfotos` → `storage.remove()`) is niet end-to-end
  gedraaid: er is hier geen Storage-API. Alleen de typecheck en de lint hebben hem gezien.
* `removeTestUsers()` rood bij een mislukte verwijdering: door de bouwsessie niet
  gedraaid; later wel gemeten door de code-critic (zie *Gemeten*).
* De achtergebleven testaccounts (QS8-693) zijn volgens de orchestrator op 18-11
  opgeruimd (dump `backups\goalbuddies-2026-11-18-15-40.sql`, 2 echte gebruikers);
  dat is niet door deze batch nagemeten.

## Volgorde

Migratie eerst, dan `rollover` deployen (`docs/DEPLOY.md` §2.3a). De nieuwe rollover
roept `verlopen_bewijsfotos` aan en werkt dus niet zonder de migratie. **Het nummer was 0299 en is op 20-11-2026
hernummerd naar 0315** (besluit van Quinten), zie de kop van de migratie.
