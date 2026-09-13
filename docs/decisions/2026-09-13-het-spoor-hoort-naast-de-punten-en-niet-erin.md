# Het spoor hoort naast de punten, niet erin

**13-09-2026 — QS8-453, migratie 0257.**

Een week die de goedkeuringstermijn goedkeurt omdat er geen buddy meer is, krijgt
sinds 0135 gewoon zijn punten. Dat is een uitzondering op **domeinregel 3** —
alleen een groepsgenoot mag goedkeuren — en die uitzondering liet tot vandaag
geen enkel spoor na.

## 1. Wat er gemeten is

📏 Tegen `pg_get_functiondef()` op een verse opbouw:

```
v_reden := 'completion_approved_ceiling';   -- of _floor
insert into points_ledger (..., group_id, ..., reason, ...)
values (v_rij.owner_id, v_week.goal_id, null, v_punten, v_reden, 'weekly_goal', v_week.id)
```

Dezelfde `reason` als een echte peer-goedkeuring. Geen `group_events`-rij, geen
systeembericht. Het enige onderscheid was `group_id is null`, en dat deelt hij met
`cycle_missed` (CHECK `points_ledger_gemist_is_niet_van_een_groep`, 0141).

Een uitzondering op een autorisatiegrens die geen spoor nalaat, is achteraf niet
te reconstrueren — en dus ook niet met een correctie-record recht te zetten
(**domeinregel 6**).

## 2. Waarom niet de reparatie die de reviewrij voorstelde

De rij van 02-09 schreef: *"Een eigen `reason` — `completion_auto_approved_*` —
lost het op **zonder het puntenmodel te raken**."*

📏 **Dat laatste is gemeten onwaar.** De dedupe-index draagt `reason` in zijn
sleutel:

```
points_ledger_dedupe_idx UNIQUE (user_id, reason, ref_type, ref_id)
  WHERE ref_id IS NOT NULL AND reason <> 'review_given'
```

Twee boekingen voor dezelfde week, verschillende reden:

```
completion_approved_ceiling    -> geboekt
completion_approved_ceiling    -> ERROR: duplicate key ... dedupe_idx   ✅
een ándere reason, zelfde week -> geboekt
=> rijen: 2, som delta: 4
```

Vier punten voor een week met een plafond van twee. De `on conflict do nothing`
in de functie beschermt dan niets meer, want de twee routes zouden verschillende
indexsleutels hebben.

⚠️⚠️ **En `reason` staat daar met reden in, dus hem eruit halen is ook geen
reparatie.** Een `correction` moet naast een goedkeuring kunnen staan — dat ís
domeinregel 6. De index kiest bewust voor "één boeking per (gebruiker, reden,
week)".

Dit is **regel 18 vraag 6** in zijn zuiverste vorm: de voorgestelde wijziging
tilt de aanname *"er is precies één boeking per week"* naar *"er kunnen er meer
zijn"*, en de grendel die dat tegenhield is precies de grendel die je omzeilt.

## 3. Het besluit

Een kolom: `points_ledger.zonder_beoordelaar boolean not null default false`.

| | kolom | eigen `reason` | `group_events`-rij |
|---|---|---|---|
| raakt de dedupe-sleutel | nee | **ja** | nee |
| raakt `sum(delta)` | nee | nee | nee |
| werkt zonder groep | ja | ja | **nee** |
| leesbaar voor de eigenaar | ja | ja | n.v.t. |

De `group_events`-variant valt af op zijn eigen aanname: er ís geen groep om zo'n
rij aan te hangen — dat is nu juist waarom de week vastliep.

⚠️ **`not null default false` en geen nullable boolean.** "We weten het niet" is
hier geen bestaande toestand: elke rij van vóór deze migratie is via de normale
route geboekt. Productie staat op `0221` en deze migratie is niet gedeployd, dus
het bestaande bestand is klein en eenduidig.

## 4. Domeinregel 7 en 10 — nagemeten, niet aangenomen

📏 `authenticated` heeft een **tabelbrede** SELECT-grant op `points_ledger`, dus
een nieuwe kolom is meteen leesbaar voor wie de rij mag zien. Dat is precies de
val die CLAUDE.md noemt bij `kolomrechten:controle` (*"ziet een tabelbrede grant
niet"*), dus het is apart gemeten:

- `points_ledger_select` is `user_id = auth.uid()`; er is géén INSERT-, UPDATE- of
  DELETE-policy. De eigenaar leest dus zijn eigen spoor en niemand anders.
- Geen enkele **view** in `public` leest `points_ledger`.
- Geen enkele **functie** doet `select *` van `points_ledger` — een bestaande
  kolomlijst kan een kolom die er nog niet was per definitie niet meenemen.

Er komt dus geen groepsoppervlak bij: domeinregel 7 is niet in het geding, en
domeinregel 10 (het puntentotaal is privé) blijft staan.

⚠️ `groep_klassement()` ziet deze rijen sowieso niet: die boekingen hebben
`group_id is null`.

## 5. Wat hier bewust niet in zit

📏 **Dezelfde week kan een `completion_approved_floor` én een
`completion_approved_ceiling` dragen** — 2 rijen, 3 punten voor een week met een
plafond van 2. Gemeten op een verse opbouw, **zonder** de kolom uit dit issue: het
gat bestond hiervoor al en hangt aan `reason` in de indexsleutel.

Langs de normale weg is dat niet te bereiken — beide routes zetten
`weekly_goals.status = 'approved'` en slaan over wat niet meer `pending` is — maar
dat betekent dat de grendel niet de index is maar een statuscontrole twee lagen
hoger. Losgetrokken als **QS8-454**; repareren raakt het puntenmodel en niet deze
feature.

## 6. Een ijking die groen bleef

⚠️⚠️ De eerste ijking van de dedupe-grendel **bleef groen**: `zonder_beoordelaar`
aan de indexsleutel toevoegen verandert niets zolang de test dezelfde waarde
invoert. De mutatie raakte de grendel niet, en dat leest in je notities identiek
aan "de grendel werkt". Pas een **niet-unieke** index maakte hem rood.

Zelfde klasse als punt T uit `docs/VOLGENDE-SESSIE.md` en als mutatie C bij
QS8-442. **Mutatie per grendel, en controleer dát je mutatie het geval raakt.**

⚠️ En de eerste versie van de dedupe-test las de reden uit de geboekte rij en
voerde die opnieuw aan. Die botst per definitie — óók als de automatische route
een eigen reden zou krijgen. Die test zou dus groen zijn gebleven bij precies de
wijziging waar hij voor bestaat. Wat de belofte draagt is dat de twee routes
**dezelfde dedupe-sleutel delen**, en dat staat nu als aparte assertie.
