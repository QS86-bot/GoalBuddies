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

⚠️⚠️ **Hier stond dat het langs de normale weg niet te bereiken is, en dat is
gemeten onjuist.** Het argument was dat beide routes `weekly_goals.status` op
`'approved'` zetten en overslaan wat niet meer `pending` is. Maar
`trek_goedkeuring_in()` zet die status terug op `pending` — dus die deur staat
weer open. De security-review vond het, en de reproductie staat in QS8-456.

Wat er dus werkelijk staat: de grendel is niet de index maar een statuscontrole
twee lagen hoger, én die controle is omkeerbaar. Losgetrokken als **QS8-454**;
repareren raakt het puntenmodel en niet deze feature.

⚠️ **Dit is precies waar CLAUDE.md voor waarschuwt.** *"Een afwijking die je
onderbouwt is duurder dan een die je vergeet"* — een uitgeschreven argument leest
de volgende persoon als een reden om er niet aan te twijfelen. Dit argument stond
hier met zoveel woorden, en het was onwaar.

## 5b. De naad die deze feature níet dichtzet

📏 Gemeten, end-to-end gereproduceerd: buddy keurt goed → buddy trekt in → buddy
verlaat de groep → de termijn draait.

```
weekstatus                  -> approved
  completion_approved_ceiling | +2 | zonder_beoordelaar = f
  correction                  | -2 | zonder_beoordelaar = f
totaal punten               -> 0
```

De week is goedgekeurd, de eigenaar heeft er netto **nul** punten voor, en er is
geen spoor dat de termijn het deed. De +2-rij uit de ingetrokken goedkeuring bezet
de dedupe-sleutel, dus `on conflict do nothing` slikt de boeking van de termijn.

⚠️⚠️ **De voor de hand liggende reparatie is fout.** `on conflict … do update set
zonder_beoordelaar = true` lost het spoor op en de punten niet — en het stempelt
een rij die écht een peer-goedkeuring was als automatisch. Dat is een tweede
onwaarheid, geen reparatie.

⚠️ En het spoor kan niet naar `weekly_goals`: die tabel is groepszichtbaar bij een
gekoppeld doel (`weekly_goals_select`) én zit in de realtime-publicatie. Dat zou
een nieuw groepszichtbaar oppervlak zijn, en dan is beschermd het antwoord tot
iemand het tegendeel besluit.

Wat hier onder ligt is een productvraag — *wat hoort zo'n week op te leveren?* —
en die raakt het puntenmodel. Losgetrokken als **QS8-456**, dat dit issue
blokkeert. De toets staat als `it.fails` in `tests/rls/vastgelopen.test.ts` en
slaat om zodra iemand het repareert; dát is het sein om reviewrij 453 te sluiten.

⚠️ **Reviewrij 453 blijft daarom open.** Hem nu op *opgelost* zetten zou de fout
van QS8-448 herhalen: een vinkje dat het agendapunt wegneemt terwijl het gat nog
werkt.

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
