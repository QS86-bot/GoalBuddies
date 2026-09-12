# Een index op een tabel die niet van ons is

**Datum:** 12-09-2026 · **Issue:** QS8-439 · **Migraties:** 0222, 0228, 0233, 0250

## Wat er misging

Productie stond op `0221`. De map stond op `0255`. **34 migraties achterstand**,
en de reeks stopte elke keer op hetzelfde punt:

```
0222 → ERROR: 42501: must be owner of table objects
```

Daardoor was er twee weken lang geen enkele nieuwe feature te testen. `todo_items`
komt uit `0246`, dus De Lijst — een heel epic — bestond op productie niet.

## Twee metingen, en allebei corrigeren ze wat er stond

### 📏 1. Het is geen bouwsessie-grens

`docs/DEPLOY.md` §2.2 en QS8-243 schreven dit op als *"de grens van de
bouwsessie"*, iets dat *"Quintens hand"* vraagt. Dat klopt niet, en het heeft
drie dagen wachten gekost aan een wachtstand zonder uitweg.

De Supabase-MCP, `psql "$SUPABASE_DB_URL"` en de SQL-editor in het dashboard
draaien **alle drie als `postgres`**. Er is geen route die een mens wél heeft.
En `postgres` kan zichzelf niet helpen:

```
grant supabase_storage_admin to postgres;
ERROR: 42501: "supabase_storage_admin" role memberships are reserved,
              only superusers can grant them
```

### 📏 2. De grens is smaller dan hij was — en dat is de les

Per handeling apart gemeten, elk in een eigen terugrollende transactie tegen
`wehgocadxehottiiyvsc`:

| Op `storage.objects` als `postgres` | 09-09-2026 | 12-09-2026 |
|---|---|---|
| `create policy` | geweigerd | ✅ **gaat** |
| `create trigger` | geweigerd | ✅ **gaat** |
| `create index` | geweigerd | ❌ `42501` |

Supabase heeft de rechten tussentijds verruimd. **De meting van 09-09 was juist
op de dag dat hij gedaan werd en vier dagen later achterhaald** — maar hij stond
in `DEPLOY.md` als feit zonder datum, dus niemand hermat hem.

⚠️ Dat is de bredere les hier, en hij is dezelfde als bij de weggelegde
bevindingen van QS8-123: **een gemeten grens die je zonder datum opschrijft,
verloopt stil.** Wie hem overneemt neemt de conclusie over, niet de meting.
Elke regel in dit document draagt daarom zijn meetdatum.

## De keuze

Netto blijven er na `0255` maar **twee** indexen over: `0222` en `0228` maken er
een die `0233` zelf weer weghaalt. Vier regels blokkeerden dus 34 migraties,
waarvan er twee sowieso van voorbijgaande aard waren.

Vier vormen zijn gewogen.

**A — de index laten vallen.** Map en productie lopen dan exact gelijk. Maar hij
verdwijnt óók lokaal, en `tests/rls/bewijsfotobucket.test.ts` eist hem met zoveel
woorden: *"de avatartelling draait op het schrijfpad van élke upload"*. Dat is
een echte eis weggooien om een rechtenprobleem.

**B — de teller naar `public` verhuizen.** De grondigste route, en QS8-399 zegt al
dat een teller die rijen telt de verkeerde vorm heeft. Maar het is een
datamodelwijziging in vier migraties diep, en hij lost de achterstand vandaag
niet op.

**C — Supabase vragen** om `postgres` lid te maken van `supabase_storage_admin`.
Buiten onze hand, en op de gratis tier onzeker.

**D — voorwaardelijk maken. Gekozen.** De `create index` in een
`do $$ … exception when insufficient_privilege … end $$;`.

```sql
do $$
begin
  create index if not exists objects_chatfotos_groep_dag_idx
    on storage.objects (((storage.foldername(name))[1]), created_at)
    where bucket_id = 'chatfotos';
exception when insufficient_privilege then
  raise notice 'QS8-439: … overgeslagen (42501) — geen eigenaar van storage.objects.';
end $$;
```

**Waarom D en niet A:** dit is de enige vorm waarin het verschil tussen productie
en de map **in de migratie zelf staat**, leesbaar op de plek waar iemand hem
zoekt, in plaats van in een overgeslagen stap of in iemands hoofd. Dat is precies
wat acceptatiecriterium 4 van het issue vraagt.

📏 **En de prijs is gemeten en niet geschat:** een verse opbouw uit alle 258
bestanden geeft lokaal `objects_avatars_map_idx` en `objects_bijlage_ouderdom_idx`
— **dezelfde twee als vóór deze wijziging**. Lokaal en in CI verandert er dus
niets; `schema-opbouwen.sh`, de RLS-suite en `idempotent:controle` zien hetzelfde
schema als gisteren.

## ⚠️ Wat dit besluit níet is

**Geen oplossing voor de prestatievraag.** Op productie ontbreken die twee
indexen, en de tellingen die ze droegen worden daar een seq scan over
`storage.objects`. Vandaag is dat gratis — die tabel is leeg — maar bij het
schaaldoel van 100k gebruikers niet. Dat staat als eigen rij in
`docs/ENGINEER-REVIEW.md`, met de voorwaarde erbij.

**Geen vrijbrief voor een tweede vorm.** De uitzondering geldt voor een index op
een tabel die dit project niet bezit, en voor niets anders. Een policy of een
trigger hoort níet voorwaardelijk te zijn: die gaan gewoon, en ze zijn grendels
in plaats van prestatiehulp — eentje die stilletjes overgeslagen wordt is een
autorisatiegat.

## De grendel eronder

**`npm run storage-eigendom:controle`** wordt rood zodra er een kale
`create index` op `storage.objects` of `storage.buckets` in een migratie staat.

⚠️ Dat is de helft die er het meest toe doet, want dit is **een fout die alleen
op productie bestaat**: lokaal bezitten we de tabel, dus de migratie is daar
groen en niets meldt iets. Zonder deze controle kost de volgende opslagmigratie
met een index opnieuw drie dagen, en dan groeit de reparatie terug onder een
issue dat *opgelost* zegt — de vorm van QS8-417.

📏 **Met de hand rood gemaakt**, per grendel apart: één index terug naar de kale
vorm gezet → rood op het juiste bestand en de juiste regel; hersteld → groen.
`tests/scripts/storage-eigendom-controle.test.ts` voedt hem daarnaast elke vorm
los: wat hij moet vinden (unique, concurrently, `storage.buckets`, een kale index
ná een afgesloten dollarblok) én wat hij met rust moet laten (de voorwaardelijke
vorm, een index op `public`, een rollback-pad in commentaar, een `drop index`).

⚠️ **Wordt `create index` ooit wél toegestaan** — de tabel hierboven laat zien dat
dat kan gebeuren — dan hoort deze controle wég en niet uitgezet, met de nieuwe
meting en haar datum erbij.
