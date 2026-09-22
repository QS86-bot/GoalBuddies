# Een policy is zo zwak als zijn zwakste tak

**22-09-2026 — QS8-461, migratie 0295.**

`leesroute_bewaking()` (0259) toetst of een leespolicy die groepsgenoten iets
laat zien, dat via de gedeelde toets doet en niet via een eigen kopie. Hij deed
dat met `like` en `not like` op de **hele** `qual`. Dit document legt vast waarom
dat de verkeerde korrel was, en — belangrijker — **waarom de eerste reparatie
hiervan óók de verkeerde korrel had, en hoe dat gemeten is.**

## De meting die het issue opleverde

📏 Op een lokaal opgebouwd schema — Postgres 16, `scripts/schema-opbouwen.sh`,
298 migraties op een lege database — met de fixture uit QS8-461 in een
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
na de mutatie verschijnt is aantoonbaar van de mutatie.

## Waarom juist deze vorm gevaarlijk is

Een **vervanging** van de expressie leest in een diff als een herschrijving en
valt op. Een **tak erbij** leest als uitbreiding. `CLAUDE.md` noemt die vorm bij
domeinregel 11 als duur betaald: *"Een vierde tak op `commitments_select` gaf dat
alles wél weg"*.

En het gaat om een groepszichtbaar oppervlak: een gearchiveerde groep die weer
meeleest, ziet `missed`-weekdoelen. Dat is het schaamtemoment waar domeinregel 7
voor bestaat.

## ⚠️⚠️ De eerste versie van deze migratie splitste alleen de bovenste OR-laag, en dat was fout

Die versie redeneerde: `and` versmalt, `or` verbreedt, dus alleen de bovenste
`or` hoeft per tak getoetst. Een security-review op deze migratie heeft dat
weerlegd, en het is daarna zelf nagemeten.

📏 `goal_events_select` — de policy waarmee 0259 zijn eigen meting deed — ziet er
vandaag zo uit:

```
(EXISTS ( SELECT 1 FROM goals g
  WHERE ((g.id = goal_events.goal_id)
     AND ((g.owner_id = ( SELECT auth.uid() AS uid)) OR shares_group_with_goal(g.id)))))
```

**De gesanctioneerde aanroep staat binnen de subquery.** De natuurlijke plek voor
een extra tak is dus náást hém, één laag dieper — en daar keek de
bovenste-laag-versie niet.

📏 Gemeten met precies die vorm plus een derde OR-tak: **0 rijen, het gat
volledig open.**

📏 En het is niet de uitzondering maar de meerderheid: van de **48**
SELECT/ALL-policies in `public`+`storage` hebben er **35** één bovenste tak,
waarvan er **8** tóch een ` OR ` dragen. Vier van de acht policies die een
gesanctioneerde doeltoets noemen, stonden in die blinde vlek.

### En de reden die erbij stond, was gemeten onwaar

De eerste versie schreef dat dieper splitsen *"meldingen zou opleveren over
takken die door een omsluitende `and` al afgedekt zijn"*.

📏 Nagemeten op de 48 echte policies: dieper splitsen geeft **nul** meldingen.
**De gestelde prijs bestaat vandaag niet.**

En de redenering meet het verkeerde. `A and (B or C)` is inderdaad minstens zo
streng als `A` — maar de belofte van deze grendel is niet *"de policy is streng"*,
het is *"de groepsroute loopt langs de gedeelde toets"*. In
`g.id = goal_events.goal_id AND (eigenaar OR sterk OR zwak)` is die `A` een
**join**conditie en geen autorisatietoets: hij versmalt de rijen, niet de
rechten. Een extra `or` verbreedt daar onverkort.

⚠️ **Dit is de duurste fout uit de grondwet, en hij is hier gemaakt:** *"een
afwijking die je onderbouwt is duurder dan een die je vergeet."* Een omissie was
opgevallen; een uitgeschreven argument had de volgende lezer een reden gegeven om
er niet aan te twijfelen. Het staat hier daarom uitgeschreven mét de meting, en
niet stilzwijgend gecorrigeerd.

## Wat het wél geworden is

`or_takken()` geeft twee dingen terug en niets anders:

1. de hele expressie, en
2. elke disjunct die door een `or` ontstaat, op welke diepte dan ook.

**Een omhulsel is geen tak.** Het lichaam van een `exists` dat geen `or` draagt
komt er niet uit; er wordt wél doorheen gekeken om een `or` te vinden die dieper
ligt.

⚠️ **Dat onderscheid is de tweede correctie, en zonder hem meldt de grendel
veilige policies.** 📏 Gemeten op een versie die élk blad teruggaf: die meldde
`shares_group_with_goal(goal_id) and exists (select 1 from goal_group_links l
where …)` — een must-allow — omdat het afdalen het `exists`-lichaam losweekte van
de sterke aanroep ernaast. **De tabelnaam reisde mee, de aanroep niet.**

Het werkt om één reden: **de tak die een doel ontsluit draagt zijn eigen `from`**.
De aanvalsvorm is `or exists (select 1 from goal_group_links l join group_members
m …)`, en die hele `exists` ís de disjunct — inclusief de tabelnamen waarop tak 1
en tak 2 matchen.

### Waarom niet richting 2 uit het issue

*De `qual` mag de lidmaatschapstabellen niet noemen buiten een gesanctioneerde
aanroep.* 📏 Van de 48 echte policies noemt er vandaag **nul** die tabellen, dus
dat zou nul valse meldingen geven.

Maar het breekt een bestaande must-allow: `shares_group_with_goal(goal_id) and
exists (select 1 from group_members m where m.user_id = auth.uid())` **noemt**
`group_members` volkomen legitiem, naast een sterke aanroep. Richting 2 zou daar
een register voor nodig hebben, en dat is precies de vorm die hier vermeden
wordt.

## De splitser is zelf een grendel

`string_to_array(qual, ' OR ')` splitst ook binnen een subquery, binnen een
stringliteral **en binnen een aanhalingstekennaam**. `or_takken()` loopt de tekst
teken voor teken af met een haakjesdiepte, een vlag voor `'…'` en een vlag voor
`"…"`.

⚠️⚠️ **Die laatste vlag is geen netheid, en hij ontbrak in de eerste versie.**
📏 Gemeten:

| vorm | uitkomst zonder `"`-vlag |
| --- | --- |
| kolom `"it's"` in de `qual` | **1 tak in plaats van 3**, en een zwakke kopie erachter bleef **ongemeld** |
| kolom `"vlag or niet"` | splitste *binnen* de naam en meldde een volstrekt veilige policy |

De eerste faalt **open**: één apostrof in een kolomnaam volstond om deze grendel
uit te zetten. Dat is QS8-461 volledig terug via een andere deur.

Zelfde les als bij de knip die commentaar uit de bron haalt (QS8-412): **de knip
die een controle scherp houdt, is zelf een grendel** en hoort zijn eigen toets te
hebben.

## De ijking — drie mutaties, drie grendels

⚠️ Eén mutatie voor de hele controle bewijst hier niets: er zitten drie
onafhankelijke grendels achter elkaar, en een mutatie die door de eerste al
afgevangen wordt zegt niets over de tweede.

Gemeten met de stand ervóór (19 tests groen, **0** bevindingen op het echte
schema):

| mutatie | wat er rood werd |
| --- | --- |
| `leesroute_bewaking()` terug op de vorm van 0259 | **precies de twee OR-taktoetsen** — de bovenste-laag-vorm én de geneste vorm. De overige 17 bleven groen. |
| `or_takken()` vervangen door `string_to_array(…, ' OR ')` | **precies de splitsertoets.** De overige 18 bleven groen. |
| de `"`-vlag uit `or_takken()` gehaald (drie regels) | **precies de splitsertoets**, met `expected '1' to be '3'` — de fail-open-kant. De overige 18 bleven groen. |

⚠️ **Dat de andere tests groen bleven is de helft die ertoe doet.** Het laat zien
dat 0295 geen gedragsverandering is op de bestaande vorm: een `qual` zonder enige
`or` levert precies één tak op die gelijk is aan de hele `qual`, en dan doet deze
functie letterlijk wat 0259 deed.

## Wat er buiten bereik blijft, en dat is bewust

📏 QS8-461 meet het zelf en 0295 verandert dat niet: een policy die via een
**nieuwe definer-functie** of een **view** leest (`using (mag_doel_zien_459(goal_id))`)
wordt niet gemeld. De grendel toetst de spelling van de policy, niet de semantiek
van de route.

`tests/rls/hulpfunctiemodel.test.ts` heeft een register van de hulpfuncties waar
zo'n nieuwe functie in hoort te landen; dát register vangt deze klasse af, niet
deze functie.

⚠️ En het aantal rijen telt **policies en geen takken** — `union` dedupliceert.
Een policy met twee zwakke takken in dezelfde categorie geeft één rij; een policy
die béide takken raakt geeft er twee, want `bezwaar` verschilt.

## Wat dit voor reviewrij 520 betekent

Die rij stond open op dit gat. Met 0295 erin is de bevinding die hem openhield
afgedekt; de rij zelf is deze ronde niet aangeraakt, want `docs/ENGINEER-REVIEW.md`
is in deze ronde van de andere baan (zie `docs/PROMPT-SESSIE.md` §1).
