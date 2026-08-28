# Het venster van De Ketting telt zeven dagen, niet acht

**Datum:** 28-08-2026
**Aanleiding:** de controle van 28-08.

## De regel eronder

De Ketting mag leden laten zien wie er in de **lopende** periode al opgedaagd is.
Binnen die periode betekent een leeg vakje "nog niet". Zodra de periode voorbij
is betekent hetzelfde lege vakje "gemist" — en dat is domeinregel 7. 0037 kwam
dat dichten met een venster op de policy en op `group_overview()`.

## De fout

```sql
or (is_group_member(group_id) and group_period_start >= current_date - 8)
```

Een huddleperiode duurt exact zeven dagen en begint op de huddledag. Een
**lopende** periode is dus hoogstens **zes** dagen oud. Zeven dagen oud is per
definitie de vorige.

De kop van 0037 rekent het zelf verkeerd voor: *"Een lopende periode is
hoogstens zeven dagen oud, plus één dag speling."* Twee fouten van één dag,
op elkaar gestapeld.

**Gevolg:** op de huddledag zelf én de dag erna stond de net afgesloten periode
open. Twee van elke zeven dagen, structureel, in een **beschermde** groep. Eén
verzoek naast `group_members` gelegd geeft dan met naam wie de afgelopen week
gemist heeft.

## Waarom geen enkele test dit ving — en dit is het echte punt

**De bevinding is twee keer als opgelost afgevinkt op het verkeerde bewijs.**

- De rij van 16-08 (`p_period_start` is vrij te kiezen) is op 25-08 gesloten met:
  *"`group_overview()` grenst de periode inmiddels af — er staat een venster op
  `p_period_start`, dus het is geen vrije parameter meer."*
- De rij van 19-08 (de aanwezigheidsmatrix) staat als *"gedicht in 0037"*.

Beide keren is gemeten **dát** er een venster stond. Nooit **hoe breed**.

En de tests deden hetzelfde. `tests/rls/epic8.test.ts` legt een schakel op
`periodStart - 60` — zestig dagen terug, ver genoeg om buiten élk denkbaar
venster te vallen. Die test is groen bij een venster van 8 dagen, bij 80 dagen
en bij 800. **Hij toetst dat er een venster ís, niet waar het ligt.**

⚠️ **Dit is regel 18 vraag 3 in een vorm die de tabel in `CLAUDE.md` nog niet
kende:** niet "de test bewaakt een onderdeel in plaats van de belofte", maar *de
test bewaakt de belofte op een plek waar hij niet kan breken*. Een grens toets je
op de grens.

## De reparatie

`current_date - 6`, op beide plekken: de policy `chain_links_select` (laatste
versie 0079) en `group_overview()` (laatste versie 0104). Migratie 0116, ook op
productie toegepast.

De nieuwe test in `tests/rls/epic8.test.ts` legt twee schakels: één op
`vandaag - 7` (moet onzichtbaar zijn voor een groepsgenoot) en één op
`vandaag - 6` (moet zichtbaar zijn). Zonder die tweede helft bewijst de eerste
niets — een dichtgemetselde policy zou hem ook halen.

⚠️ **De data zijn relatief aan vandáág en niet aan `f.periodStart`**, want de
policy vergelijkt met `current_date`. Dat is de grens die getoetst wordt.

⚠️ **Met de hand rood gemaakt:** het venster op de lokale stack terugzetten op
`- 8` maakt de nieuwe test rood (`expected [ Array(1) ] to have a length of +0`)
en de 27 andere Kettingtests groen. Dat laatste is het bewijs dat geen enkele
bestaande test deze grens raakte.

⚠️ **De migratie is gebouwd uit de bróntekst van 0104**, niet uit een
`pg_get_functiondef()`-dump. Productie draait PG17 en de lokale stack PG16, en
die renderen een functiedefinitie verschillend; uit de dump bouwen zou het
migratiebestand en productie uit twee verschillende bronnen laten komen.

## Wat blijft staan

**De grens is een vast getal, en dat blijft een aanname.**
`groups.season_cadence` kent al `monthly` en `quarterly`. Gaat een
niet-wekelijkse cadans ooit de huddleperiode sturen, dan is `- 6` net zo fout als
`- 8` nu. Staat als rij in `docs/ENGINEER-REVIEW.md` met de voorwaarde erbij.

En het blijft `current_date` in UTC, buiten `shared/time` — correctheidsregel 7.
Hier is die berekening tegelijk de beveiligingsgrens, en juist de "speling" die
ad hoc werd toegevoegd, veroorzaakte de fout. Ook dat staat als rij.
