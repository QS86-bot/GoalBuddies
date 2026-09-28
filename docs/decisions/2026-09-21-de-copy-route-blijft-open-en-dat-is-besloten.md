# De `copy`-route blijft open, en dat is besloten — QS8-578

**21-09-2026.** Een `copy` in de Storage-API omzeilt het plafond en de
mime-allowlist van de doelemmer. Dat staat sinds 11-09 als open risico
**Middel** in `docs/ENGINEER-REVIEW.md`, met een voorwaarde die inmiddels is
ingetreden. Dit document legt vast wat er besloten is, wat er onderweg aan de
diagnose veranderde, en wat de volgende stap beslist.

## Wat er ingetreden is

De rij schreef zijn eigen voorwaarde op:

> **Wordt zwaarder als:** het `copy`-eindpunt niet aan de servicelaag dichtgezet
> is vóór de deploy van het migratiegat `0222`–`0255`, of zodra een emmer een
> type krijgt dat een browser naar de HTML-parser routeert.

📏 De **eerste helft is ingetreden**: `uitgerold.json` zet productie op `0294`,
dus `0222`–`0255` staan erop, en het eindpunt is nergens dichtgezet — nul
aanroepen van `.copy(` of `/object/copy` in `src/`, `app/`, `supabase/` en
`scripts/`. 📏 De **tweede niet**: geen enkele emmer draagt `text/html` of
`image/svg+xml`.

⚠️ En er ís geen servicelaag om hem in dicht te zetten. Hostinger serveert alleen
de statische bundel; de app praat rechtstreeks met `<ref>.supabase.co`. De
grendel die de rij noemt bestaat vandaag niet en kán vandaag niet bestaan.

## Het besluit

**Accepteren tot de langdraaiende Node-server er is** (`docs/DEPLOY.md` §2.7), en
de rij daar bij naam aan hangen zodat hij meekomt op de dag dat die laag om een
ándere reden ontstaat. Het risico blijft **Middel**. Besluit van Quinten,
21-09-2026.

De begrenzing die dat verdedigbaar maakt staat al in de rij en is niet veranderd:
de dagtellers vuren óók op een `copy` (`before insert` per emmer), dus dit is
misbruik-op-schaal op de gratis tier en **geen rechtenverhoging**.

⚠️ De rij blijft daarom met opzet **open**. Een besluit om iets te accepteren is
geen oplossing, en `review:controle` wordt terecht rood zodra een rij zichzelf
als opgelost aankondigt terwijl de risicokolom hem openhoudt — dat gebeurde bij
het schrijven van deze wijziging, met een ✅ die er niet hoorde.

## ⚠️⚠️ Eén zin uit 0255 is te sterk, en dat verandert de vervolgvraag

0255 en de dossierrij zeggen allebei:

> Op databaseniveau is dit niet te sluiten: een INSERT-policy ziet alleen de
> nieuwe rij en er bestaat geen kolom die de herkomst draagt.

Dat klopt voor **policies**. Het klopt niet voor de **tabel**. 📏 Er draaien al
**acht** triggers op `storage.objects` in dit project (`*_aantal_begrensd` en
`*_aantal_begrensd_verhuisd`, vier emmers maal twee), dus het mechanisme is hier
niet nieuw.

En een trigger hoeft de herkomst helemaal niet te kennen. Wat een `copy`
omzeilt zijn `file_size_limit` en `allowed_mime_types` van de **doel**emmer, en
die zijn te toetsen tegen het object zelf:

```sql
-- de vorm, niet de migratie
new.metadata ->> 'size'      vs  storage.buckets.file_size_limit
new.metadata ->> 'mimetype'  vs  storage.buckets.allowed_mime_types
```

**Dat is geen herkomstvraag maar een eigenschapsvraag, en die kan een trigger
wél stellen.**

## Waarom die trigger hier niet gebouwd is

Niet omdat hij niet mag, maar omdat hij niet te **meten** is:

1. 📏 De lokale `storage.objects` is een **plaatsvervanger van vijf kolommen** —
   `id, bucket_id, name, owner, created_at` — aangemaakt door onze eigen
   migraties (`0222`, `0228`, `0233`) zodat de RLS-suite kan draaien. Er is geen
   `metadata`-kolom, dus een trigger die erop leunt is hier niet te schrijven en
   al helemaal niet te ijken.
2. 📏 `0228` meet dat de storage-dienst **metadata pas ná een upload bijwerkt**.
   Of een `copy` zijn metadata al bij de INSERT meebrengt, is daarmee een open
   vraag — en het antwoord bepaalt alles: is het veld leeg, dan is de trigger een
   slot dat niets doet terwijl het er staat.
3. DDL op `storage.objects` vraagt eigenaarschap (`42501: must be owner of table
   objects`) en moet van Quintens machine komen — `docs/DEPLOY.md` §2.2 en §2.6b.

⚠️⚠️ **Punt 2 is de reden dat dit een vervolgissue is en geen regel code.** Een
grendel die je niet kunt ijken is in dit project geen halve grendel maar een
aanname met een slotje ervoor — precies de vorm waar `CLAUDE.md` bij regel 18
over gaat. **Eén meting beslist hem**, en die vraagt een echte storage-dienst:

> Doe één `copy` en lees de nieuwe rij: staat er `metadata->>'size'` en
> `->>'mimetype'` in op het moment van de INSERT?

Staat als **QS8-581**.

## Wat er níet overwogen hoeft te worden

`chatdocs` in een eigen Supabase-project zou de zwaarste kruising structureel
sluiten — zonder gedeeld project is er geen `copy`-pad. Dat kost een tweede
project en dus geld, en valt daarmee onder grens 1 van de *Beslisbevoegdheid*:
een besluit van Quinten en niet van een bouwsessie. Het is hier voorgelegd en
niet gekozen.

## Wat de nieuwe voorwaarde zegt

De oude was ingetreden en zei dus niets meer. De nieuwe noemt drie momenten, en
alle drie zijn ze waarneembaar:

1. een emmer krijgt een type dat een browser naar de HTML-parser routeert — dan
   is het geen opslagmisbruik meer maar een leveringspad;
2. de langdraaiende server is er — dan bestaat de plek om hem te sluiten en is
   wachten geen keuze meer;
3. QS8-581 meet dat `metadata` bij een `copy` wél gevuld is — dan kan het slot
   vandaag al.
