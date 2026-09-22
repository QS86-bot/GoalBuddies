# Een policy is zo zwak als zijn zwakste tak

**22-09-2026 — QS8-461, migratie 0295.**

`leesroute_bewaking()` (0259) toetst of een leespolicy die groepsgenoten iets
laat zien, dat via de gedeelde toets doet en niet via een eigen kopie. Hij deed
dat met `like` en `not like` op de **hele** `qual`. Dit document legt vast waarom
dat de verkeerde korrel was, welke twee richtingen er waren, en waarom het
richting 1 geworden is.

## De meting

📏 Op een lokaal opgebouwd schema — Postgres 16, `scripts/schema-opbouwen.sh`,
297 migraties op een lege database — met de fixture uit QS8-461 in een
teruggerolde transactie:

```sql
create policy p459d_ortak on public.p459d for select to authenticated
  using (shares_group_with_goal(goal_id)
         or exists (select 1 from goal_group_links l
                    join group_members m on m.group_id = l.group_id
                                        and m.user_id = (select auth.uid())
                    where l.goal_id = p459d.goal_id));
```

| | |
| --- | --- |
| `leesroute_bewaking()` vóór de fixture | **0 rijen** |
| `leesroute_bewaking()` ná de fixture | **0 rijen** |

De tweede tak doet géén eigenaar-toets en géén archieftoets — precies de
verruiming waarvoor 0259 bestaat — en de grendel zweeg, omdat de **eerste** tak
het gesanctioneerde woord droeg en `not like` naar de hele `qual` keek.

⚠️ **Het "ervóór" is hier geen formaliteit.** De baseline is nul, dus elke rij die
na de mutatie verschijnt is aantoonbaar van de mutatie. Was de baseline niet
gemeten, dan had "er werd niets gemeld" ook kunnen betekenen dat de functie al
stuk was.

## Waarom juist deze vorm gevaarlijk is

Een **vervanging** van de expressie leest in een diff als een herschrijving en
valt op. Een **tak erbij** leest als uitbreiding. `CLAUDE.md` noemt die vorm bij
domeinregel 11 als duur betaald: *"Een vierde tak op `commitments_select` gaf dat
alles wél weg"*.

En het gaat om een groepszichtbaar oppervlak: een gearchiveerde groep die weer
meeleest, ziet `missed`-weekdoelen. Dat is het schaamtemoment waar domeinregel 7
voor bestaat.

## De twee richtingen, en de meting die de keuze maakte

QS8-461 noemt ze allebei.

### Richting 2 — de tabelnamen verbieden

*De `qual` mag `goal_group_links` en `group_members` niet noemen buiten een
gesanctioneerde aanroep.* Strenger, korter op te schrijven, en het sluit ook de
vorm uit QS8-459 zelf uit.

📏 Gemeten hoeveel legitieme policies dit vandaag zou melden: van alle
SELECT/ALL-policies in `public` en `storage` noemt er **nul** `goal_group_links`
of `group_members`. Richting 2 zou dus vandaag **nul** valse meldingen geven —
precies wat het issue vermoedde, nu gemeten.

⚠️ **En tóch is het niet gekozen.** Richting 2 vraagt een uitzonderingsregister
zodra één legitieme policy die tabellen om een andere reden noemt. Een register
dat vandaag leeg is, is een register waar de eerste vulling ongemerkt in
verdwijnt — en dit project heeft er drie die met de hand rood gemaakt moesten
worden om te bewijzen dat ze iets deden. Een grendel die géén register nodig
heeft, is een grendel minder die kan rotten.

### Richting 1 — per bovenste OR-tak toetsen *(gekozen)*

Dezelfde twee takken als 0259, maar toegepast op elke bovenste `or`-tak apart in
plaats van op de hele `qual`.

## Waarom de bovenste OR-laag precies de juiste korrel is

`and` versmalt en `or` verbreedt.

* Staat er `A and (B or C)`, dan moet `A` óók gelden. Het geheel is minstens zo
  streng als `A`; een zwakke `C` kan daar niets openzetten wat `A` dichthoudt.
* Staat er `A or C`, dan volstaat `C` alleen, en is de policy zo zwak als zijn
  zwakste tak.

**Alleen de bovenste `or` verbreedt de toegang, dus alleen daar hoort de toets
per tak.** Dieper splitsen zou meldingen opleveren over takken die door een
omsluitende `and` al afgedekt zijn — en een controle die iets meldt wat geen
probleem is, leer je uitzetten.

⚠️ Postgres vlakt geneste `or` af in de expressieboom, dus `A or (B or C)` komt
als één vlakke `A OR B OR C` uit `pg_get_expr()` en valt vanzelf in drie takken
uiteen. Een `or` binnen een subquery staat tussen haakjes en blijft binnen zijn
tak.

## De splitser is zelf een grendel

`string_to_array(qual, ' OR ')` splitst ook binnen een subquery en binnen een
stringliteral. Dan meldt `leesroute_bewaking()` takken die geen takken zijn, en
dat is een controle die alles meldt. `bovenste_or_takken()` loopt de tekst teken
voor teken af met een haakjesdiepte en een vlag voor stringliteralen.

Dat is dezelfde les als bij de knip die commentaar uit de bron haalt (QS8-412):
**de knip die een controle scherp houdt, is zelf een grendel** en hoort dus zijn
eigen toets te hebben. Die staat er.

📏 Vier proeven, gemeten vóórdat de migratie geschreven werd:

| invoer | takken |
| --- | --- |
| het geval uit QS8-461 | **2** |
| `(shares_group_with_goal(goal_id))` | **1** — gelijk aan 0259 |
| `(EXISTS ( SELECT 1 FROM t WHERE (a OR b)))` | **1** — niet gesplitst |
| `(naam = 'x OR y')` | **1** — niet gesplitst |

## De ijking — twee mutaties, twee grendels

⚠️ Eén mutatie voor de hele controle zou hier niets bewijzen: de functie heeft
twee onafhankelijke grendels achter elkaar (de splitser en de taktoets), en een
mutatie die door de eerste al afgevangen wordt, zegt niets over de tweede.

Gemeten met de stand ervóór (18 tests groen, 0 bevindingen op het kale schema):

| mutatie | wat er rood werd |
| --- | --- |
| `leesroute_bewaking()` terug op de vorm van 0259 (toets op de hele `qual`) | **precies** de nieuwe OR-taktoets, met `expected '' to be 'proef_leesroute_461.proef_461_ortak'`. De overige 17 bleven groen. |
| `bovenste_or_takken()` vervangen door `string_to_array(…, ' OR ')` | **precies** de splitsertoets, met `expected '3' to be '2'` — de naïeve vorm splitst binnen de subquery. De overige 17 bleven groen. |

⚠️ **Dat de andere zeventien groen bleven is de helft die ertoe doet.** Het laat
zien dat 0295 geen gedragsverandering is op de bestaande vorm: een `qual` zonder
bovenste `or` levert precies één tak op die gelijk is aan de hele `qual`, en dan
doet deze functie letterlijk wat 0259 deed. De bestaande toets uit QS8-459 —
inclusief zijn must-allow met `shares_group_with_goal(...) and exists(...
group_members ...)` — blijft onveranderd groen.

## Wat er buiten bereik blijft, en dat is bewust

📏 QS8-461 meet het zelf en het verandert niet met 0295: een policy die via een
**nieuwe definer-functie** of een **view** leest (`using (mag_doel_zien_459(goal_id))`)
wordt niet gemeld. De grendel toetst de spelling van de policy, niet de semantiek
van de route.

Dat is een grens van deze vorm en hij hoort opgeschreven te staan in plaats van
stilzwijgend te bestaan. `tests/rls/hulpfunctiemodel.test.ts` heeft een register
van de hulpfuncties waar zo'n nieuwe functie in hoort te landen; dát register is
wat deze klasse afvangt, en niet deze functie.

## Wat dit voor reviewrij 520 betekent

Die rij stond open op dit gat. Met 0295 erin is de bevinding die hem openhield
afgedekt; de rij zelf is deze ronde niet aangeraakt, want `docs/ENGINEER-REVIEW.md`
is in deze ronde van de andere baan (zie `docs/PROMPT-SESSIE.md` §1).
