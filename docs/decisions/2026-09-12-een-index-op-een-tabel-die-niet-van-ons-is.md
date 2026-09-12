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

**Geen oplossing voor wat er onder die indexen hing — en dat is meer dan
prestatie.** 📏 `bewaak_avatar_aantal()` doet per upload `count(*) from
storage.objects where bucket_id = 'avatars' and (storage.foldername(o.name))[1] =
map` (gelezen uit `pg_get_functiondef()`). Zonder index is dat een seq scan over
de **héle** objecttabel, dus óók over chatfoto's, bewijsfoto's en documenten:
**wie veel bijlagen uploadt, maakt de quotacontrole van iedere ánder duurder**,
en die controle is nu juist het ding dat misbruik moet tegenhouden. Dat is een
grendel die slijt en geen prestatiedetail — de eerste versie van dit document
noemde het "prestatie" en dat is na de security-review rechtgezet. De andere drie
tellers zijn veilig: die gebruiken `tel_dagteller` in `public`. Vandaag gratis,
want de tabel is leeg; eigen rij met voorwaarde in `docs/ENGINEER-REVIEW.md`.

**Geen vrijbrief voor een tweede vorm.** De uitzondering geldt voor een index op
een tabel die dit project niet bezit, en voor niets anders. Een policy of een
trigger hoort níet voorwaardelijk te zijn: die gaan gewoon, en ze zijn grendels
in plaats van prestatiehulp — eentje die stilletjes overgeslagen wordt is een
autorisatiegat.

## De grendel eronder

**`npm run storage-eigendom:controle`** wordt rood zodra een index op
`storage.objects` of `storage.buckets` **niet** wordt afgevangen — én zodra een
policy, trigger of `enable row level security` daar juist wél wordt afgevangen.

⚠️ Dat is de helft die er het meest toe doet, want dit is **een fout die alleen
op productie bestaat**: lokaal bezitten we de tabel, dus de migratie is daar
groen en niets meldt iets. Zonder deze controle kost de volgende opslagmigratie
met een index opnieuw drie dagen, en dan groeit de reparatie terug onder een
issue dat *opgelost* zegt — de vorm van QS8-417.

### ⚠️⚠️ De eerste versie van deze grendel stelde de verkeerde vraag

**Dit hoort hier te staan, want hij was met de hand rood gemaakt en hij bewaakte
toch niets.** De eerste versie vroeg: *staat deze `create index` buiten een
`$$`-blok?* De belofte is: *draait deze regel op productie?* Dat is niet
hetzelfde, en 📏 de security-review voerde er acht vormen aan die er allemaal
doorheen kwamen:

| vorm | waarom hij erdoorheen kwam |
|---|---|
| `do $$ begin create index … end $$;` **zonder** `exception` | staat in een blok, dus "afgevangen" — maar vangt niets |
| `exception when others then null` | vangt het én slikt elke echte fout |
| `create index on storage.objects (…)` (naamloos) | de regex eiste een naam |
| `create index "objects_f_idx" on …` | aanhalingstekens |
| `on storage . objects` | spaties rond de punt |
| `on only storage.objects` | `only` |
| `create index x on objects` | schemaloos |
| `alter table storage.objects add constraint u unique (…)` | legt óók een index aan |

⚠️ **De eerste is de gevaarlijkste, en hij is geen kunstgreep.** Vier
aangrenzende migraties doen nu een `do`-blok voor. De volgende schrijver kopieert
die vorm, laat bij het knippen de `exception`-regel vallen, en dan is de controle
groen, de migratie lokaal groen, en productie staat opnieuw stil — woordelijk de
drie dagen waar dit issue over gaat.

**De vraag is nu per statement wat er op productie gebeurt**, en dat is
tweerichtingsverkeer:

- een **index** móet in een blok met `when insufficient_privilege` staan;
- een **policy, trigger of `enable row level security`** mag dat juist **niet** —
  die gaan wél, dus afvangen verbergt alleen een echte fout.

⚠️ **Die tweede richting is de belangrijkste en stond er eerst helemaal niet in.**
Bij een policy valt een stille overslag dicht (geen policy, niemand erbij); bij
een **trigger valt hij open**. Een migratie die `drop trigger if exists` doet en
daarna een voorwaardelijke `create trigger`, laat `bewaak_chatfoto_aantal()`
nergens meer aan hangen — en dan is er geen bovengrens meer op wat iemand
uploadt, zonder dat één controle rood wordt. `storage:controle` maskeert het
zelfs: die matcht `create policy … on storage.objects` in de **bestandstekst** en
blijft dus groen bij een voorwaardelijke policy.

📏 **Alle elf de vormen zijn nu gevonden en alle zes de goede met rust gelaten**,
elk los gevoerd in `tests/scripts/storage-eigendom-controle.test.ts` (26 gevallen).
`concurrently` krijgt een eigen melding: 📏 `25001: CREATE INDEX CONCURRENTLY
cannot run inside a transaction block`, dus een blok is daar geen uitweg en de
oude tekst stuurde de lezer een doodlopende weg in.

⚠️ **De les is niet "beter reguleren".** Hij is dat *met de hand rood maken* niet
genoeg is als je de **verkeerde eigenschap** rood maakt. Ik had één mutatie
gedaan — een index terug naar de kale vorm — en die werd netjes rood. Dat
bewees dat de controle iets ziet, niet dat hij ziet wat hij belooft. Regel 18
vraag 2, op een grendel in plaats van op een test.

⚠️ **Wordt `create index` ooit wél toegestaan** — de tabel hierboven laat zien dat
dat kan gebeuren — dan hoort deze controle wég en niet uitgezet, met de nieuwe
meting en haar datum erbij.
