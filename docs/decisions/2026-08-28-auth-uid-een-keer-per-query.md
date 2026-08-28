# `auth.uid()` draaide één keer per rij, en dat hoeft niet

**Datum:** 28-08-2026
**Migratie:** 0119
**Raakt:** 49 policies over 30 tabellen, `initplan_bewaking()`,
`is_kale_auth_uid()`, `zonder_initplan_hijs()`, `domeinregel3_bewaking()`,
`tests/rls/initplan.test.ts`

## De aanleiding

Bevinding 3 van de controleronde van 28-08: **49 policies over 30 tabellen roepen
`auth.uid()` kaal aan**, en nul van de 49 gebruikt de subselectvorm. Supabase' eigen
linter noemt dit `auth_rls_initplan`.

`auth.uid()` is geen goedkope functie. Uitgeschreven is hij

```sql
coalesce(
  current_setting('request.jwt.claim.sub', true),
  (nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub'
)::uuid
```

Kaal in een policy komt die hele keten in het rij-filter terecht en draait hij één
keer per gescande rij. `(select auth.uid())` maakt er een InitPlan van: één keer
per query, en het filter wordt `user_id = $0`.

## De meting, inclusief het deel dat de bevinding niet noemde

Op een echte Postgres 16, 500.000 rijen, dezelfde policyvorm (`user_id = <uid>`),
als `authenticated` met een echt JWT-claim:

| Vorm | Zonder index op de kolom | Mét index |
|---|---|---|
| `auth.uid()` | Seq Scan, **633 ms** | Bitmap Index Scan, 2,3 ms |
| `(select auth.uid())` | Seq Scan, **41 ms** | 2,0 ms |

Het plan laat zien waaróm. Kaal:

```
Seq Scan on rijen  (rows=433)
  Filter: (user_id = (NULLIF(COALESCE(current_setting(...), ...), ''))::uuid)
  Rows Removed by Filter: 499500
```

Gehesen:

```
InitPlan 1 (returns $0)
Seq Scan on rijen  (rows=1)
  Filter: (user_id = $0)
```

⚠️ **De tweede kolom is het eerlijke deel en stond niet in de bevinding.**
`auth.uid()` is `stable`, dus voor een indexzoekopdracht rekent Postgres hem
sowieso één keer uit — daar wint de hijs niets. Het verschil van vijftien keer
verschijnt pas bij een **sequentiële scan**, en dat is precies waar onwrikbare
regel 11 al over gaat.

**Dit is dus geen brand.** Het is: nooit langzamer, soms vijftien keer sneller, en
het haalt een waarschuwing weg die je anders went te negeren.

⚠️ Er is een tweede verschil dat verder reikt dan één scan: de **rijschatting**.
Kaal schatte de planner 433 rijen, gehesen 1. Bij een join bepaalt zo'n schatting
de plankeuze, en dan gaat het niet meer over milliseconden op één tabel.

## Waarom 49 autorisatieregels herschrijven veilig was

Negenenveertig policies herschrijven is negenenveertig kansen op een overtikfout
in een autorisatieregel. Twee dingen maken dat hanteerbaar.

**De uitdrukkingen zijn niet met de hand overgetypt.** Ze zijn uit `pg_get_expr()`
gegenereerd met één tekstvervanging: een kale `auth.uid()` wordt
`( select auth.uid() )`.

**En daarna nagemeten, met een vingerafdruk in plaats van een oogopslag.** Alle
**73** policies in `public` — dus ook de 24 die geen `auth.uid()` noemen — zijn
vastgelegd als tabel, naam, opdracht, permissief, rollen, `using` en `with check`,
en door `md5()` gehaald.

| Wat | Vingerafdruk |
|---|---|
| Productie vóór 0119 | `ad8d3ebd367d9864234a9b536644e973` |
| Lokaal ná 0119, subselect weggenormaliseerd | `ad8d3ebd367d9864234a9b536644e973` |
| Lokaal ná 0119, ruw | `49ed2f47625bfaef31a612260f770d72` |
| Productie ná 0119, ruw | `49ed2f47625bfaef31a612260f770d72` |

De eerste twee regels bewijzen dat er niets veranderde behalve de hijs. De laatste
twee bewijzen dat productie letterlijk hetzelfde draait als wat het
migratiebestand lokaal oplevert — geen "logisch gelijk", maar byte voor byte.

Los daarvan: 59 uitdrukkingen veranderd, nul semantische verschillen, en de 1822
tests van de suite bleven groen.

## Wat er onderweg omviel, en waarom dat goed nieuws was

`domeinregel3_bewaking()` (0093) zoekt de letterlijke clausule
`user_id <> auth.uid()` in `completion_approvals_insert`. Door de hijs staat daar
nu `user_id <> ( SELECT auth.uid() AS uid )`, en de bewaking meldde dat het slot
weg was terwijl het er gewoon stond.

⚠️ **Dat is onwrikbare regel 18, vraag 4 — en de bewaking wás goed.** Hij greep
naar een spelling in plaats van naar de belofte, en dan verhuist hij niet mee. De
reparatie is niet "het patroon oprekken" maar de spelling **wegnormaliseren vóór
het vergelijken**, met `zonder_initplan_hijs()`. Dan blijft er in de bewaking staan
wat de belofte ís. Met de hand nagedaan: de clausule echt uit de policy halen geeft
nog steeds `rls`.

Daarnaast viel `hulpfuncties.test.ts` om op `is_kale_auth_uid` zonder
`set search_path`. Terecht, en meteen gezet.

## Hoe het bewaakt wordt

`initplan_bewaking()` meldt elke policy met een kale `auth.uid()`, met tabel, naam
en of het de `using` of de `with check` is. Nul rijen op beide databases.

⚠️ **Het patroon staat in een eigen functie, want een zeef die je niet kunt voeden
kun je niet ijken.** Dat is de les van QS8-115: `tekst:controle` meldde
maandenlang nul terwijl er zeven onvertaalde zinnen stonden, en er was geen manier
om te zien wát hij vond zonder de codebase te wijzigen. `is_kale_auth_uid()` is één
regel op één plek, en `tests/rls/initplan.test.ts` biedt hem elke vorm los aan — de
kale, de gehesen, allebei in één uitdrukking, en een uitdrukking zonder `auth.uid()`.

⚠️ **Geen lijst, dezelfde les als 0118.** De bewaking kijkt naar de gedéployde
uitdrukking via `pg_get_expr()` en niet naar de tekst van een migratiebestand —
dat laatste zegt wat er ooit is afgespeeld, niet wat er draait.

Met de hand rood gemaakt: `ai_jobs_select` terug naar de kale vorm gaf
`ai_jobs | ai_jobs_select | using`, en terugzetten gaf weer nul.

## Wat hier níét mee opgelost is

De policies die een hulpfunctie aanroepen met een kolom als argument —
`is_group_member(group_id)` en verwanten — blijven per rij draaien, en dat kán ook
niet anders: het argument verschilt per rij. Dat is een aparte vraag (de rij van
27-08 over de vier RLS-hulpfuncties gaat er deels over) en geen onderdeel hiervan.
