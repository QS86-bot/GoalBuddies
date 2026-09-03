# Een barrière is een subquery-grens, geen lekbaarheidstoets

**03-09-2026 — QS8-210, migratie 0151.**

## Wat er aan de hand was

`group_overview()` is de heetste query van dit project. Zijn kosten schaalden
niet met de groep en niet met de paginagrootte, maar met het **totale aantal
rijen in `user_streaks`**:

| reeksen in `user_streaks` | definer-executies | waarvan `shares_group_with_goal` |
| -- | -- | -- |
| 310 | 3384 | 3109 |
| 910 | 9384 | 9109 |

De groep telde beide keren tien leden en de paginagrootte was beide keren
twintig; de ruis zijn reeksen van andere gebruikers, met andere doelen, niet aan
deze groep gekoppeld.

⚠️ 3109 = 10 × 310 + 9 en 9109 = 10 × 910 + 9: het is **het aantal leden maal het
aantal rijen in de hele tabel**. Bij het schaaldoel van 100k gebruikers is dat in
de huidige vorm miljoenen definer-executies per groepsoverzicht.

## De diagnose die drie ronden kostte

De meting van 25-08 concludeerde *"het schaalt met de grootte van de groep"*. Dat
was consistent met wat er gemeten was en toch niet de oorzaak: die opstelling
bouwde groepen van 50 en 200 leden, en **elk extra lid bracht een extra rij in
`user_streaks` mee**. Groepsgrootte en tabelgrootte groeiden samen op, en dan
wijst het resultaat willekeurig een van beide aan.

⚠️ **Dat is dezelfde faalvorm als regel 18 vraag 3, maar dan in een meting in
plaats van in een test.** Wie twee dingen tegelijk laat variëren, kan niet zien
welke van de twee het doet. De reparatie is in beide gevallen dezelfde: houd er
één stil. De ruistest — 300 reeksen die niets met de groep te maken hebben, bij
een ongewijzigde groep — scheidt ze wel, en wees de tabel aan.

## Waarom het gebeurt

`group_visible_streaks` staat op `security_barrier = true` en draagt
`where shares_group_with_goal(g.id)`. `group_overview()` doet er een
`left join ... on s.goal_id = d.id` op.

De barrière is een **subquery-grens**: de view moet zijn eigen `where` volledig
afgewerkt hebben voordat de buitenkant iets mag toepassen. De join-conditie kan
er dus niet onderdoor, en `shares_group_with_goal()` draait één keer per rij van
de hele tabel.

## De vier gemeten reparaties

| Vorm | executies bij 910 rijen |
| -- | -- |
| huidig — `left join` op de view | 9384 |
| `left join lateral` op de view | 9384 |
| huidig + `shares_group_with_goal` LEAKPROOF | 9384 |
| LATERAL + LEAKPROOF | 9384 |
| **de view vervangen door een groepsfunctie** | **133** |

⚠️ **De belangrijkste uitkomst is dat `leakproof` niets doet, en dat is het
opschrijven waard.** Het stond in dit issue als de goedkoopste kandidaat, met de
aantekening dat het een beveiligingsbewering is en geen optimalisatie: een
leakproof functie mag niets prijsgeven via foutmeldingen of zijpaden, en deze
leest tabellen. Er lag dus een security-discussie klaar over een verandering die,
gemeten, **precies nul executies scheelt** — 9384 blijft 9384, alleen én in
combinatie met LATERAL.

De reden is de diagnose hierboven. `leakproof` bepaalt of een **qual** onder een
barrière mag; hier is de blokkade dat een `left join` met de view aan de nullable
kant sowieso eerst de view moet afmaken. **De naam van de optie ("leakproof")
suggereert dat lekbaarheid de vraag is; de vraag is de vorm van de join.**

⚠️ De les is niet "meet je optimalisaties" — dat stond er al. De les is: **een
beveiligingsbewering die je overweegt als middel, meet je eerst als middel.**
Was hier de volgorde omgedraaid, dan had dit project een leakproof-verklaring
afgegeven op een functie die tabellen leest, voor niets.

## Wat er gebouwd is

`zichtbare_reeksen_van_groep(p_group_id)` — `security definer`, met de
autorisatie één keer in een `exists` over het lidmaatschap van de kijker in plaats
van per rij, en de rijen per constructie beperkt tot `l.group_id = p_group_id`.
Na de migratie: **133 executies bij 310 rijen én bij 910.** Vlak.

## De prijs, en waarom hij zo betaald is

`group_visible_streaks` blijft bestaan: `authenticated` heeft er SELECT op en de
RLS-suite bevraagt hem rechtstreeks via PostgREST. Hem opheffen zou een
API-oppervlak weghalen dat onder test staat.

Daarmee staat de maskering van besluit A41 op twee plekken — de vorm van de
duurste fout die dit project kent (0032/0034). Er zijn twee grendels overwogen:

1. **Een gedeelde hulpfunctie** voor de maskering. Afgevallen: hij kost per
   uitgevoerde rij een extra definer-aanroep, en hij dekt alleen de maskering —
   niet de rijselectie, die per constructie verschilt (de view filtert per doel,
   de functie per groep). Dat is de helft van de naad bewaken tegen een deel van
   de winst.
2. **Een test die de twee paden naast elkaar legt**, in beide richtingen, op de
   gevallen waar ze uiteen kúnnen lopen. Gekozen. Kost niets tijdens het draaien
   en dekt de rijselectie mee.

⚠️ **Beide richtingen, en dat is niet dubbelop.** Een pad dat te wéinig
teruggeeft is een verdwenen groepsgenoot; een pad dat te véél teruggeeft is een
lek onder domeinregel 7. Eén richting vangt één van die twee.

## De security-ronde vond de fout die de ijking niet kón vinden

Regel 19 zegt dat de `security-reviewer` bij dit soort werk direct draait. Dat
leverde twee dingen op die geen enkele test van mij had kunnen geven.

**1. De rijfilter was strénger dan de view, en dat is een gedragsverandering.**
De eerste versie filterde met `join group_members o on o.group_id = l.group_id
and o.user_id = d.owner_id and o.status <> 'inactive'` — de groepsgebonden vorm,
die er juister uitziet. De view gebruikt `shares_group_with_goal(d.id)`, en die
vraagt of de kijker **een** levende gedeelde groep met dit doel heeft waar de
eigenaar óók nog actief in is. Een lid dat in déze groep inactief is maar in een
tweede gedeelde groep nog actief, verdween daarmee uit het groepsoverzicht.

Veilig van richting, en tóch fout: een prestatiemigratie die zegt *"alleen de bron
van `s` verandert"* mag het scherm dat elk groepslid opent niet stilletjes
inkorten. De reparatie is de rijfilter van de view **letterlijk overnemen** —
`shares_group_with_goal(d.id)` staat nu ook in de functie. Dat kost tien
aanroepen in plaats van nul, begrensd door de groepsgrootte in plaats van door de
tabel, en **de gelijkheid met de view is er een eigenschap van de constructie
door geworden** in plaats van iets wat de test toevallig niet raakt.

⚠️ Mijn eigen naadtest kón dat verschil niet zien: er was maar één beschermde
groep, dus "inactief hier maar actief elders" bestond niet in de opstelling. Weer
vraag 3, en weer opgelost door de opstelling uit te breiden — een tweede
beschermde groep waar hetzelfde lid wél actief is.

**2. De prestatiebelofte werd door niets bewaakt.** Zet iemand `left join
group_visible_streaks` terug, dan blijven alle gelijkheidstests groen: ze
toetsen dat de twee paden hetzelfde géven, en dat blijft na zo'n terugzetting
waar. Gemeten: van de elf tests wordt er precies nul rood. De reden van deze hele
migratie was onbewaakt terwijl zijn uitkomst dubbel bewaakt was.

Daarom `barrierelezers()`: een lijst van functies die `group_visible_streaks`
lezen, die leeg hoort te zijn. Een lijst en geen toets op `group_overview`, want
de kostenvorm zit in de view en niet in zijn aanroeper — een controle die één
functienaam noemt, laat de tweede door.

⚠️ **Wat de reviewer verder meldde en wat ik ervan overnam.** Twee bevindingen
waren al opgelost toen zijn ronde afliep (de dossierrij en de losse bevinding
stonden er inmiddels wél). Zijn voorstel om de nieuwe rij naar `GEEN_OPPERVLAK`
te verplaatsen is **niet** overgenomen: hij geeft gemaskeerde gebruikersdata
terug en dat is een oppervlak, ook al opent het geen nieuw feit. Wat er wél mis
was, was de kop van dat script — die telde nog vijf. De ongepagineerdheid
(regel 10) staat nu in de migratie met de grens erbij: twaalf leden, afgedwongen
door `join_group_with_code()` en niet door een constraint, mét *wordt zwaarder
als*.

## Wat de ijking opleverde, en dat was niet wat ik verwachtte

Zeven mutaties, elk apart. De meeste werden meteen rood op de test die ze noemt.
Eén niet: **de eigenaarshelft uit de join knippen**, de grendel die 0102 (QS8-57)
toevoegde tegen een oud-lid dat zijn reeks bleef uitdelen, **bleef groen**.

De opstelling liet `cor` de groep verlaten met `verlaat_groep()`. Die functie
**wist de rij in `goal_group_links` mee**, en `verwijder_lid()` doet hetzelfde.
Via de app is de toestand "inactief lid met een levende doelkoppeling" dus
helemaal niet te bereiken, en de test toetste dat een verdwenen koppeling
verdwenen is — niet dat een inactieve eigenaar wordt weggelaten.

⚠️ **Regel 18 vraag 3 in zijn zuiverste vorm, en hij is alleen zichtbaar geworden
doordat de mutatie per grendel ging.** Eén mutatie voor de hele functie was rood
geweest op een van de andere drie, en dan had deze test er nog steeds gestaan als
bewijs voor iets wat hij niet kon bewijzen.

De opstelling zet `status = 'inactive'` nu met de admin-client. Dat is een
toestand die de app vandaag niet maakt — en de grendel blijft toch de moeite
waard, want hij staat om dezelfde reden in `shares_group_with_goal()` en is het
enige dat die reeks binnenhoudt op de dag dat er een zachtere manier van weggaan
bijkomt.

⚠️ **Dezelfde vorm dook nog een keer op, en toen was hij geen fout.** Het
gearchiveerde geval zit achter twee onafhankelijke sloten: `shares_group_with_goal()`
toetst het zelf, en de `exists` doet het nog eens voor `p_group_id`. Elk van de
twee alléén weghalen laat alle elf tests groen. **Dat is hier geen gat maar
dekking** — pas als ze allebei weg zijn wordt de gearchiveerde test rood, en dat
is precies wat je van twee grendels wilt. Het verschil met het geval hierboven is
of de toestand die de belofte breekt, bereikbaar is: daar was hij dat niet, hier
wel. **Groen na een mutatie is dus geen uitslag maar een vraag**, en de vraag is
welke andere grendel hem opving.

## Wat er níet veranderd is, met opzet

`deelt_open_groep_met_doel(d.id)` vraagt of de kijker een ópen groep deelt met
dit doel — **welke dan ook, niet per se de groep die hij bekijkt**. Een doel dat
in een open én een beschermde groep hangt, toont zijn `best_streak` dus ook in de
beschermde groep.

Dat is bestaand gedrag uit 0078 en het is geen lek: de kijker ziet die reeks via
de open groep toch al, dus er bereikt niemand nieuwe informatie. De
groepsgebonden variant (`lid_van_open_groep(p_group_id)`) is geprobeerd en is
strénger — maar hem hier invoeren zou scope-verbreding in een
prestatiemigratie zijn, en het zou de twee paden uit elkaar laten lopen zonder
dat iemand daarover besloten heeft. Het staat als losse bevinding in
`docs/ENGINEER-REVIEW.md`.
