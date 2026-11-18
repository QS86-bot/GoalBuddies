# De uitweg die de melding noemde, bestond niet

*05-10-2026 — QS8-626. Volgt op QS8-605 (`eenrij:controle`) en QS8-233.*

## 1. Wat er mis was

`eenrij:controle` eist dat elke `.single()` en `.maybeSingle()` een structurele
garantie draagt dat er hoogstens één rij terugkomt. Die garantie leidt hij af uit
de migratiemap: een primaire sleutel, een unieke index, een partiële unieke
index. Dat werkt voor een keten die met `.from('tabel')` begint.

Een keten die met `.rpc('functie')` begint heeft geen tabel. Hij viel daarom in
`onleesbaar`, en die tak gaat er in `beoordeel()` uit **vóór** de registerlookup
— die bovendien op `{pad, tabel}` matcht, en een onleesbare keten draagt geen
tabel.

De melding luidde: *"Ongemeten is niet groen; zet hem leesbaar neer of in het
register."* Het tweede kon niet.

📏 Nagemeten vóór de reparatie, met het register gevoed zoals de melding
voorschrijft:

| geval | ongedekt | onleesbaar | ongebruikt |
| -- | -- | -- | -- |
| `.rpc('zoek_buddy', …).maybeSingle()`, geen register | 0 | **1** | 0 |
| dezelfde keten, mét een registerrij | 0 | **1** | **1** |

**Een poging tot registreren maakte het erger**: twee bevindingen in plaats van
nul. De keten bleef onleesbaar, en de rij die hem moest dekken heette ongebruikt.

⚠️ CLAUDE.md beschrijft bij `review:controle` de vorm *een controle die een
lastig geval omzeilt in plaats van het te melden, bewaakt vanaf dat moment de
omweg en niet de belofte*. Dit is het spiegelbeeld: hij meldde het wél, en wees
naar een deur die er niet was. Dat is erger dan zwijgen, want het kost de lezer
eerst een poging en daarna het vertrouwen in de melding.

## 2. De garantie van een RPC is zijn retourtype

Een functie die geen `setof` en geen `table(...)` teruggeeft, levert over
PostgREST per constructie precies één waarde. Dat is even structureel als een
unieke index, en niet te omzeilen door wat er in het lichaam staat.

📏 In de migratiemap: **307** functienamen, waarvan **246** op die grond gedekt.

## 3. Waarom een `limit 1` in het functielichaam níet meetelt

QS8-626 stelde als acceptatie voor: *"een RPC mét `limit 1` is gedekt, een RPC
zónder is een bevinding"*. Die vorm zit er bewust **niet** in, en de reden is een
meting.

📏 Van de **123** meerrijdefinities in de migratiemap heeft er **geen enkele** een
`limit 1` als laatste clausule van zijn lichaam. **Zestien** hebben er wél een
ergens in het lichaam, en bij **alle zestien** zit hij in een laterale subquery —
elk wordt gevolgd door `) d on true`, `) k on true`, `) g(regel)` of `) s`:

| functie | wat er na de `limit 1` staat |
| -- | -- |
| `group_overview` (8×) | `) d on true` |
| `openstaande_beoordelingen` (4×) | `) k on true` |
| `definer_bewaking` (2×) | `) g(regel)` |
| `mijn_bevestigingsstanden` | `) s` |
| `verzoekers_eerder_lid` | `) laatste on true` |

Een regex die *"`limit 1` in het lichaam"* leest, zou dus `group_overview` en
`openstaande_beoordelingen` als gedekt aanmerken — en dat zijn juist de
**gepagineerde** functies, waar een tweede rij de regel is en niet de
uitzondering. Dat is een vals groen op precies de aanroep die mis kan gaan.

⚠️ **De `limit 1` die wél telt, telde al mee**: die op de aanroep (`.limit(1)` in
de keten). Die staat op de buitenste query en is op de aanroeproep te zien, dus
daar is hij decideerbaar. De bedoeling van het acceptatiecriterium is daarmee
gehaald op de plek waar hij waar te maken is.

## 4. Een naam is pas gedekt als élke definitie gedekt is

Niet "de laatste wint", zoals bij views in hetzelfde script. CLAUDE.md
waarschuwt er met zoveel woorden voor dat een drop van `f(uuid, text, text)` geen
nieuwe `f` met zes argumenten dekt: overloads delen een naam en leven naast
elkaar, en PostgREST kiest op de meegegeven parameternamen. Een vals negatief
kost een registerrij, een vals positief een productiefout.

📏 Vandaag kost die keuze niets: **geen enkele** van de 307 namen valt in beide
klassen, en de 246 gedekte namen zijn precies de namen waarvan élke definitie
enkelrij is (kruiscontrole: 246 = 246).

## 5. ⚠️⚠️ Een fout die bij het ijken boven kwam en niet bij het schrijven

De eerste versie zocht de `returns` in een venster van 8000 tekens ná de
functiekop, en las de SQL ongeknipt.

📏 Dat gaf een onwaar meetresultaat dat ik bijna in een comment én een test heb
vastgelegd: *"`sleutelzetters` valt in beide klassen"*. De oorzaak staat in
`0276` op regel 13 — een rollbackpad als
`--   create or replace function public.sleutelzetters() …`. Dat telt als kop,
en de `)` `returns` die er dan bij gezocht wordt, is die van een **andere**
functie verderop in hetzelfde bestand: `returns integer`.

Alle vier de echte definities van `sleutelzetters` geven `TABLE(naam, bezwaar)`
terug. De bewering was dus van het instrument en niet van het schema — precies de
klasse die dit project deze week vijf keer gekost heeft.

**Twee reparaties, want het waren twee fouten:**

1. regelcommentaar gaat eruit vóór het matchen;
2. de zoektocht naar `returns` stopt bij de **volgende** kop, zodat hij er nooit
   een van een buurfunctie pakt.

⚠️ De conservatieve regel uit §4 ving de schade op — een spookwaarde `true` kan
een bestaande `false` niet omkeren — maar dat is geluk en geen ontwerp. Het
gevaarlijke geval is een naam die **alleen** in commentaar staat: zonder knip is
dat een gedekte functie die nooit geschreven is, en een `.rpc('spook')
.maybeSingle()` zou er stilzwijgend doorheen komen.

⚠️⚠️ **En de eerste toets daarvoor bewaakte niets.** Hij zette het commentaar
bóven een echte, meerrijige definitie van dezelfde naam; door §4 kwam er ook
zónder knip `false` uit, en de mutatie maakte niets rood. Dat is de valkuil die
CLAUDE.md beschrijft: *een ijking die zijn geval door een pad voert dat een
eerdere grendel al afvangt, bewaakt niets van wat hij belooft.* De fixture is
vervangen door de spookfunctie.

## 6. De ijking

Stand ervóór: **41 groen, 0 rood** (39 vóór de twee toetsen van §5). Eén mutatie
per grendel, teruggezet en met `diff -q` bevestigd, en per mutatie genoteerd
wélke toets omvalt.

| # | mutatie | welke toets rood werd |
| -- | -- | -- |
| 1 | `table\|(` uit `MEERRIJ` | *dekt een table()-functie niet…* (+3) |
| 2 | `setof` uit `MEERRIJ` | *dekt setof net zomin als table()* (+2) |
| 3 | de conservatieve EN → laatste-wint | *leest de volgorde andersom net zo* |
| 4 | de rpc-tak keurt alles goed | *meldt een rpc met een table()-retourtype als ongedekt* (+2) |
| 5 | `registersleutel` kent alleen tabellen | *laat een registerrij een rpc-keten dekken* |
| 6 | `ketensIn` ziet geen `.rpc(` meer | *leest de functienaam uit een rpc-keten…* (+4) |
| 7 | de SQL-commentaarknip weg | *maakt van een kop in commentaar geen spookfunctie* |
| 8 | de begrenzing bij de volgende kop weg | *pakt de returns van een buurfunctie niet* |

⚠️ Mutatie 3 valt alleen op door de **andersom**-variant: met enkel de eerste
volgorde in de suite blijft "laatste wint" groen. Beide staan er daarom.

## 7. De klasse van vandaag, zodat de volgende sessie ziet of hij gegroeid is

📏 Gemeten over `src/` en `app/` (246 bronbestanden, testbestanden niet
meegerekend):

| | |
| -- | -- |
| `.rpc(`-aanroepen | **65** |
| ketens op `.single()`/`.maybeSingle()` | **38** |
| daarvan via `.rpc(...)` | **0** |
| daarvan onleesbaar (geen `.from` én geen `.rpc`) | **0** |

De klasse is vandaag dus leeg, en dat is precies waarom het register leeg kan
blijven. De datalaag loopt grotendeels over RPC's; de eerste die er een
`.maybeSingle()` achter zet, krijgt vanaf nu óf een garantie óf een bevinding met
drie uitwegen die alle drie bestaan.
