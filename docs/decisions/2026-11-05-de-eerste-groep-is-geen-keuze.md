# De eerste groep is geen keuze — 05-11-2026

**Issue:** QS8-651 (issue 1 uit het spec-voorstel van QS8-649/QS8-650).
**Raakt:** `src/modules/buddies/deling.ts`, `app/doel/[id].tsx`, `app/(tabs)/lijst.tsx`,
`src/shared/i18n/nl.ts`, `src/shared/i18n/en.ts`,
`tests/beloftes/geen-stille-eerste-groep.test.ts`,
`docs/decisions/002-domeinregel7-oppervlakken.md`.
**Beslist door:** de bouwsessie, binnen de beslisbevoegdheid van `CLAUDE.md`. Geen
migratie, geen RLS, geen nieuwe belofte aan een mens — wat er verandert is dat de
app een keuze die zij voor de gebruiker maakte, nu aan hem laat.

## 0. Waar dit vandaan komt

QS8-56 vond op 27-08-2026 dat het uitstelverzoek naar `groepen[0]` ging en zette
daar `beslissendeGroep()` voor neer: nul groepen geeft niemand, één geeft die ene,
twee of meer geeft alleen wat de gebruiker aanwees. §7 van dat beslisdocument
liet twee buren bewust staan — de hulpvraag en de straf — met als reden dat hun
keuzelijst *zichtbaar* voorgeselecteerd was. QS8-651 is de herbevestiging van die
twee, en het antwoord is omgegaan.

## 1. De meting — zes plekken, vier ervan versturen iets

📏 Gemeten op `origin/main` = `8c7d1707`, grep op `[0]`, `.find(`, `first`,
`single()` en `maybeSingle()` in alles wat een groep of groepsgenoot kiest (regel
18, vraag 6):

| plek | wat er stond | wat het verstuurt | oordeel |
| -- | -- | -- | -- |
| `app/doel/[id].tsx` `HulpVragen` | `groepId === '' ? groepen[0]?.group_id : groepId` | een chatbericht met je achterstand, naar díe groep | **stille eerste** — route 2 van domeinregel 7 |
| `app/doel/[id].tsx` `Straf`, groep | `useState(groepen[0]?.id ?? '')` | de begunstigde groep van een straf (domeinregel 11) | **stille eerste** |
| `app/doel/[id].tsx` `Straf`, persoon | `gekozenPersoon !== '' ? gekozenPersoon : mensen[0]?.id` | de persoon-getuige van een straf | **stille eerste** |
| `app/doel/[id].tsx` `StuurlozeStraf` | `gekozen !== '' ? gekozen : mensen[0]?.id` | de vervangende getuige | **stille eerste** |
| `app/(tabs)/lijst.tsx` `Deelblok` r.555 | `groepen.length === 1 ? onDeel(groepen[0]?.id)` | de taak, naar de enige groep | correct — dit ís de één-groep-regel |
| `app/(tabs)/lijst.tsx` `Groepskeuze` r.576 | `useState(groepen[0]?.id ?? '')` | de taak, naar de voorgeselecteerde | **stille eerste**, met een deelknop die aan stond |
| `src/modules/buddies/samen.ts` `beginfase()` r.81 | `gekoppeld[0]` | niets — zie §4 | gelaten, met reden |

Het issue noemde de eerste vier met regelnummers die niet nagelezen waren; alle
vier klopten. De spec-planner noemde de getuige-standaard (r.1005 en r.1072) en
`samen.ts` r.81; de eerste twee klopten en zitten in de tabel, de derde is §4.

## 2. Wat er omgaat, en waarom het antwoord van 27-08 niet meer volstaat

De redenering van §7 was: *de gebruiker ziet wélke groep het bericht krijgt op het
moment dat hij op versturen drukt.* Dat is waar en het is niet genoeg, om twee
redenen die op 27-08 nog niet op tafel lagen.

**Een voorselectie is een keuze die de gebruiker niet gemaakt heeft, met een knop
die aan staat.** Bij één groep is dat geen probleem: er is niets te kiezen. Bij
twee groepen is "de eerste" een groep die niemand aanwees — en de volgorde komt
uit een query die er geen belofte over doet. Wie snel op versturen tikt, stuurt
zijn achterstand naar de groep die toevallig bovenaan stond. Dat is precies de
klasse fout van regel 18 vraag 6: zolang bijna iedereen in één groep zit, is de
toestand zeldzaam en ziet geen test hem.

**Teamgroepen maken van zeldzaam gewoon.** QS8-649 zet organisaties en
teamdoelen op de agenda; zodra die er zijn, zit een werkende gebruiker standaard
in twee contexten — vrienden en werk — en dan is de groep die bovenaan staat met
enige regelmaat de verkeerde. Een hulpvraag over een privédoel die in de
teamchat landt, of een straf waarvan een leidinggevende de begunstigde wordt, is
niet een schaamtemoment maar een beoordelingsgesprek (`CLAUDE.md`, domeinregel 7).
Acceptatiecriterium 2 — *een teamgroep is nooit de standaard* — volgt daar
direct uit, en de vorm die dat afdwingt is: **er is bij twee of meer géén
standaard**, van welke soort dan ook.

## 3. De vorm — één regel, vijf plekken (vier op het doelscherm, één in De Lijst)

`enigeOfGekozen(items, keuze, idVan)` in `src/modules/buddies/deling.ts` is de
regel van `beslissendeGroep()` zonder de naam van het uitstelverzoek erop;
`beslissendeGroep()` roept hem aan en blijft bestaan, omdat
`tests/beloftes/doel-in-meerdere-groepen.test.ts` en het beslisdocument van 27-08
hem bij naam noemen.

⚠️⚠️ **Eén regel van QS8-56 is daarbij omgegaan, op de security-ronde van
05-11-2026.** QS8-56 zei: *bij precies één groep wordt een oude keuze genegeerd*,
zodat er geen "geen beslisser" staat terwijl er maar één mogelijkheid is. De
ronde vond wat dat kost zodra de regel ook de hulpvraag draagt: kies "Vrienden",
ontkoppel "Vrienden" in het blok *Gedeeld met* op hetzelfde scherm (`herlaad`
houdt het formulier gemount), en de lijst krimpt tot "Werk" — die werd dan
stilzwijgend de ontvanger, met de keuzelijst verborgen (`groepen.length === 1`)
en de verstuurknop aan. Dat is letterlijk de fout die dit issue wegneemt, in een
randgeval dat er vóór de wijziging niet was: toen bleef `groepId` op "Vrienden"
staan en ging het bericht naar de gekozen groep. **Nu kiest de regel de enige
kandidaat alleen zonder keuze (`keuze === ''`)**; een oude keuze die niet meer
bestaat geeft `undefined`, ook bij één overgebleven groep, en de schermen tonen
de lijst opnieuw zolang er geen ontvanger is — zodat de gebruiker de
overgebleven groep zélf aanwijst in plaats van vast te zitten. Dat geldt via
`beslissendeGroep()` ook voor het uitstelverzoek; `kiesbaar` daar is nu
`groepen.length > 1 || (gedeeld && groep === undefined)`. De oude test is
omgedraaid en zegt waarom.

Bijvangst uit dezelfde ronde: de bevestigingsstap van de straf kon op
`begunstigde === null` uitkomen (lijst ververst terwijl hij openstaat) en dan
deed "Ja, vastleggen" stil niets. De knop staat nu uit en de zin eronder zegt
waarom (regel 14). En de hulpvraag noemt bij één groep de ontvangende groep
(`hulpvraag.gaat_naar`), want "de gebruiker ziet naar welke groep het gaat" was
het argument van 27-08 en gold juist niet bij één groep. De sleutel is een parameter omdat de vijf plekken drie
vormen lezen: `group_id` op een gekoppelde groep, `id` op een `Lijstgroep`, `id`
op een groepsgenoot. Eén regel die alleen `id` kende, had op het doelscherm een
tweede kopie nodig — en dat is hoe de stille eerste er de vorige keer naast kwam
te staan.

Op elke plek geldt daarna hetzelfde: de keuzelijst heeft bij twee of meer geen
voorselectie, er staat een zin onder waarom de knop uit staat
(`hulpvraag.kies_eerst`, `straf.kies_groep_eerst`, `straf.kies_persoon_eerst`,
`stuurloos.kies_eerst`, `lijst.deel_kies_eerst`, in beide catalogi), en de
verzendaanroep leest zijn ontvanger uit de binding die `enigeOfGekozen()` maakte
en nergens anders uit. Bij precies één kandidaat verandert er niets: geen lijst,
geen zin, de knop aan.

⚠️ **Teamgroepen zijn hier níet gebouwd en de regel kent ze niet.** Wat er wél
staat is de grens voor wie ze bouwt: bij twee of meer kiest de functie nooit, dus
een teamgroep kan niet "de standaard" worden zolang er ook een andere groep is.
Het geval dat openstaat is de gebruiker met **alleen** een teamgroep: dan is die
de enige en kiest de regel hem. Of dat mag — een hulpvraag over een privédoel kan
dan alleen naar het team — is een vraag voor QS8-649, en de kop van
`enigeOfGekozen()` zegt dat de aanroeper dan de kandidaten filtert vóór hij ze
aanbiedt. **Herbevestigen vóór de eerste teamgroep-migratie.**

## 4. Wat bewust blijft staan: `beginfase()` in `samen.ts`

`beginfase(gekoppeld, null)` valt zonder gevraagde groep terug op `gekoppeld[0]`
en toont dan "gekoppeld aan <naam>" met de uitnodigingslink van díe groep. Met
twee koppelingen noemt het scherm er één zonder dat de gebruiker koos. Gelaten,
om drie redenen: het scherm verstuurt niets naar een groep en deelt niets van de
gebruiker — de link is zijn eigen uitnodiging, en de groepsnaam staat in de kop
vóór hij hem deelt; beide groepen heeft hij zelf gekoppeld; en het alternatief
("kiezen" tonen terwijl alles al gekoppeld is) laat een lege lijst zien met
"al je groepen hebben dit doel al", wat erger is dan een juiste naam. Dit is een
**aanname** over wat die link waard is en geen meting; staat als ER-rij in de
afleverregel van QS8-651.

## 5. Wat er níet mee besloten is

- Of de gebruiker een **voorkeursgroep** mag instellen die wél als standaard
  dient. Dat is een instelling met een eigen scherm en een eigen zichtbaarheid;
  niets in dit issue vraagt erom en het zou de teamgroep-grens van §2 opnieuw
  openen.
- Of `samen.ts` §4 bij teamgroepen anders moet. Zie de herbevestiging in §3.
- Twee dingen die de reviews **buiten de diff** vonden en die hier niet
  gerepareerd zijn, want ze zijn ouder dan dit issue: `commitments.find((c) =>
  c.type === 'penalty')` op het doelscherm pakt de óudste straf, ook een
  ingetrokken, zodat een nieuwere open straf onbereikbaar is (de unieke index van
  0170 geldt alleen voor `set/unlocked/due`); en een gebruiker die alleen in een
  gearchiveerde groep zit, ziet een strafformulier zonder uitweg
  (`fetchMijnGroepen()` laat het archief weg, `fetchMogelijkeBegunstigden()`
  niet). Beide staan als ER-rij in de afleverregel van QS8-651.

## 6. Grendels

- `src/modules/buddies/deling.test.ts` — de regel zelf. Twee handmatige breuken:
  `return items[0]` en de oude QS8-56-regel (keuze genegeerd bij één); per breuk
  staat in de kop welke tests omvielen.
- `tests/beloftes/geen-stille-eerste-groep.test.ts` — de naad: geen `[0]`, `?.[0]`
  of `.at(0)` op een groepen- of mensenlijst in heel `app/` en `src/` (één
  geregistreerde plek, §4), elke binding aan `enigeOfGekozen()` mét de hele lijst
  en de rauwe keuze als argumenten (een `slice(0, 1)` is de stille eerste met een
  omweg), elke verzendaanroep aan zijn binding, en de knoppen uit zonder keuze.
  Acht mutaties met de hand gedraaid; de kop zegt per mutatie wélke test omviel.
- `tests/beloftes/doel-in-meerdere-groepen.test.ts` blijft het uitstelverzoek
  bewaken via `beslissendeGroep()`; die binding is niet aangeraakt.
