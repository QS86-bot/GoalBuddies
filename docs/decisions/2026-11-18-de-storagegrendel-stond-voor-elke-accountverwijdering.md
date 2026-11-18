# De storagegrendel stond voor elke accountverwijdering

**Datum:** 18-11-2026 · **Issue:** QS8-701 (gevonden bij QS8-700) · **Migratie:** 0299
(voorlopig nummer; de batchsessie hernummert bij het landen)

## Wat er aan de hand was

Supabase zet op `storage.objects` en `storage.buckets` de trigger
`protect_*_delete`. Dat is een `before delete` **per statement**, die
`storage.protect_delete()` aanroept. Die weigert elke SQL-delete met 42501, tenzij
`storage.allow_delete_query = 'true'` gezet is.

`wis_bewijsfotos_van_vertrekker()` (0230) hangt als `before delete` aan `profiles` en
doet zo'n delete. Elke verwijdering van een profiel, en dus elke
accountverwijdering, liep daarop vast. Ook bij gebruikers zonder foto, want een
trigger per statement vuurt altijd.

## Wat gemeten is

📏 Op de lokale stack, met `protect_delete()` en de twee triggers letterlijk van
productie overgenomen (`pg_get_functiondef` en `pg_get_triggerdef`, alleen gelezen):

| handeling | vóór 0299 | na 0299 |
| --- | --- | --- |
| `verwijder_mijn_account()` als gebruiker zonder bewijsfoto | 42501 | `{"ok": true}` |
| idem, mét bewijsfoto | 42501 | `{"ok": true}`, foto-rij weg |
| `delete from auth.users` als `postgres` | 42501 | slaagt |
| kale `delete from storage.objects` ná een verwijdering, zelfde transactie | n.v.t. | 42501 (grendel weer dicht) |

📏 Op productie gelezen: `wis_bewijsfotos_van_vertrekker()` is de enige functie in
`public` die een `delete from storage.objects` doet. Haar lichaam is gelijk aan dat
in de repo (md5 `0bae0fb4…`), en de trigger staat aan.

⚠️ **Niet gemeten:**
- de verwijdering op productie zelf; dat is een schrijfstatement;
- de route via de Auth Admin API of het dashboard (`deleteUser`). Die komt op
  dezelfde `delete from auth.users` uit, dus 0299 dekt hem ook. Dat is een
  afleiding.

De lokale stack is Postgres 16 met een namaak-`storage`. Alleen de grendel is
letterlijk.

## De keuze

1. **De instelling rond deze ene delete zetten, en daarna terug.** Gekozen.
2. De foto's via de Storage-API wissen, met een Edge Function vóór de verwijdering.

Optie 1 is de kleinste wijziging die het wisrecht herstelt. Ze maakt waar wat 0230
al besloot: de rij gaat mee, en het bestand is daarmee onbereikbaar. De blob blijft
in de objectopslag. Dat was al een bekende en weggezette grens (`docs/DEPLOY.md`
§2.6a, en de Laag-rij van 09-09 in `docs/ENGINEER-REVIEW.md`). 📏 `storage.objects`
is op productie leeg (QS8-700), dus er bestaat vandaag geen enkele wees.

Optie 2 haalt ook de blob weg. Maar ze maakt accountverwijdering afhankelijk van een
tweede dienst en een tweede stap die los kan mislukken. Dan zou het wisrecht van een
netwerkaanroep afhangen. Optie 2 blijft het juiste antwoord op de blob-grens, en dat
is een eigen issue.

⚠️ **"Daarna terug" is de helft die telt.** `set_config(…, true)` geldt tot het eind
van de transactie. Zonder terugzetten zou elke volgende delete in die transactie de
grendel ook passeren. Dat toetst §3 van de test, en die is met de hand rood gemaakt.

## Waarom niemand het zag, en wat daaraan veranderd is

- **De lokale stack kende de grendel niet.** De steiger
  (`supabase/shim/0000_supabase_shim.sql`) heeft hem nu, letterlijk van productie.
  De rol `postgres` krijgt in die database standaard `allow_delete_query = 'true'`,
  zoals de storage-dienst zelf, zodat de opruimregels van de tests blijven werken.
  PostgREST verbindt als `authenticator` en krijgt die uitzondering niet. Een
  RPC loopt dus tegen dezelfde grendel aan als op productie.
- **Het harnas fluisterde.** `removeTestUsers()` deed bij een mislukte verwijdering
  alleen een `console.warn`. 📏 Op productie stonden daardoor 1865 testgebruikers
  (QS8-700) zonder dat één run rood werd. Nu maakt `gooiBijMisluktOpruimen()` het
  bestand rood. Een 404 van GoTrue (een gebruiker die een test zelf al verwijderde)
  telt niet als mislukt.
- 📏 Vóór 0299, met de grendel in de stack: ook `wisrecht-wint.test.ts` werd rood (2
  tests), en de opruiming meldde "7 van de 7 testgebruikers konden niet weg". De
  bestaande suite had het dus kunnen vinden, als de stack de grendel had gekend.

## Wat dit níet oplost

- De blob van een bewijsfoto blijft in de objectopslag (optie 2, eigen issue).
- De 1865 testgebruikers op productie: die zijn voor QS8-700. Hun opruiming leunt
  wél op 0299: zonder deze migratie geeft elke `delete from auth.users` 42501.
