# Een weekafsluiting is geen klad

**14-09-2026 — QS8-486, migratie 0263.** Gevonden bij het uitwerken van de
agendarij van 08-09 over de DELETE-klasse die `kolomrechten:controle`
structureel niet ziet.

## Wat er stuk was

📏 Gemeten als gewone ingelogde eigenaar via de policy — geen `service_role`,
geen definer-functie:

```
STAP 1 na insert : wr=1 chain=1
STAP 2 na delete : wr=0 chain=1     <- DELETE 1
STAP 3 opnieuw   : wr=1 chain=1
```

Drie sloten, en geen van drieën hield: `authenticated` had tabelbrede DELETE,
`week_reviews_write` was `for all`, en de vier triggers staan allemaal op INSERT
of UPDATE. `week_reviews_periode_grens` bewaakt INSERT en UPDATE; een DELETE
loopt eronderdoor.

⚠️ **De schakel in De Ketting bleef staan.** Ná het wissen telt `chain_links` nog
steeds 1: De Ketting zegt dat de week afgesloten is terwijl de afsluiting niet
meer bestaat. Opnieuw invoegen maakt er géén tweede schakel bij, dus er was geen
tellervervalsing — wel een toestand waarin de twee elkaar tegenspreken, en niets
dat dat opmerkt.

## ⚠️⚠️ Er stond een groene test die precies dit belooft

`tests/rls/archief-leesbaar.test.ts` heeft een geval dat **"laat niemand zijn
eigen weekafsluiting meer wissen"** heet. Het is groen, en het was groen terwijl
het gat openstond.

📏 Nagemeten waaróm: die opstelling roept `archiveer_groep()` aan vóór de poging,
en in een gearchiveerde groep is `is_group_member()` onwaar. De delete botst daar
op het **archief** en niet op een append-only-regel. In een lopende groep gaat
dezelfde handeling gewoon door.

Dat is regel 18 vraag 2 in zijn zuiverste vorm — de naam noemt de belofte, de
meting is een eigenschap van het archief — en vraag 3 erachteraan: hij blijft
groen terwijl de belofte in élke lopende groep breekt.

⚠️ **De naam is hier het gevaarlijkste deel.** Wie zoekt of dit gat bewaakt is,
vindt een groene test die woordelijk zegt van wel. **Dat is duurder dan geen
test**: een omissie valt op, een grendel die de verkeerde kant op kijkt niet.
Daarom staat de nieuwe toets in een eigen bestand dat een **lopende** groep
voert; het archiefgeval blijft waar het is, want dat bewaakt een eigen
eigenschap.

## Het besluit

Domeinregel 6 zegt dat streaks en voltooiingen append-only zijn en dat corrigeren
via een correctie-record gaat. Een weekafsluiting valt daaronder: hij ís de
afsluiting van die week, en de groep heeft hem gezien.

⚠️ **Dit is geen grens 1.** Het raakt geen commitment device, geen geld en geen
uitgaande stroom naar echte mensen; er wordt niets afgezegd dat als consequentie
beloofd is. Het valt dus onder *Beslisbevoegdheid*: kies de conservatiefste optie
die het werk áf maakt. Dat is dichtzetten — **bouw niets "vast open"**, en bij
twijfel over een groepszichtbaar oppervlak is het antwoord nee.

⚠️ **De vraag die daarmee níet beantwoord is**, en die hier expliciet blijft
liggen: vraag 2 van de weekafsluiting is één van de drie routes waarlangs
tegenslag de groep bereikt (domeinregel 7). Mag een lid terugnemen wat hij zijn
groep verteld heeft? Dat is verdedigbaar — het is zijn eigen tekst. Maar als het
mag, hoort het een **handeling met een spoor** te zijn en geen kaal recht dat
niemand opgeschreven heeft. **Herbevestigen vóór** er een scherm komt dat een
weekafsluiting laat intrekken.

## ⚠️ Twee sloten, en de ijking wees uit dat elk alleen al genoeg is

0263 doet twee dingen: het splitst `for all` in een INSERT- en een UPDATE-policy,
en het trekt het DELETE-recht in (`from public, anon, authenticated` — alle drie
met zoveel woorden, onwrikbare regel 4).

📏 Geijkt, en de uitkomst was niet wat ik verwachtte:

| mutatie | uitslag |
| -- | -- |
| alleen de grant terug | **groen** |
| alleen de `for all`-policy terug | **groen** |
| allebei terug | **1 rood** — precies de belofte-test |

Ik had opgeschreven dat het `revoke` de grendel was. Dat was geredeneerd en niet
gemeten, en het klopte niet: de twee sloten zijn onafhankelijk en elk houdt in
zijn eentje.

⚠️ **De prijs daarvan staat erbij.** Verdwijnt er ooit één van de twee, dan wordt
niets rood — de test blijft terecht groen, want de belofte houdt. De volgende die
de ánder aanraakt, opent het gat alsnog. Het `revoke` en de gesplitste policy
horen daarom bij elkaar gelezen te worden.

## Wat er niet breekt — gemeten, niet aangenomen

📏 Geen enkele functie in `public` doet `delete from week_reviews`. De twee routes
waarlangs zo'n rij vandaag verdwijnt zijn referentiële acties, die als het systeem
draaien en niet als `authenticated`:

```
week_reviews_user_id_fkey   -> profiles(id)  on delete SET NULL
week_reviews_group_id_fkey  -> groups(id)    on delete CASCADE
```

Accountverwijdering laat de rij dus staan met een lege `user_id`; een verwijderde
groep neemt hem mee. Allebei zonder de grant die hier weggaat.

⚠️ **En `bewaarWeekafsluiting()` is een upsert**, dus het UPDATE-recht moest
blijven: PostgREST maakt er `insert … on conflict … do update set …` van, en
Postgres eist het UPDATE-recht bij het plannen — ook als er niets botst. Dat is
dezelfde val die 0206 beschrijft. Beide must-allows staan daarom onder test, en
de invoeg-helft apart van de bijwerk-helft: zonder die tweede is "bijwerken
werkt" ook waar in een wereld waarin invoegen stuk is.

## De bredere klasse blijft open

📏 Over alle 16 tabellen waar `authenticated` DELETE heeft: 4 hebben een
client-`.delete()`, 4 worden alleen door een definer-functie geleegd (die de
grant niet nodig heeft), en 8 hebben geen enkele aanroeper. Vijf van die acht
zijn ongevaarlijk — hun DELETE-policy is `using (false)`, dus de grant is dood
hout en de policy is het echte slot. `day_checkins` en `weekly_plan_steps` laten
een delete wél toe en zijn apart gewogen; die staan in de agendarij.
