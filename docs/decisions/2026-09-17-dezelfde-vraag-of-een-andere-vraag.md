# Dezelfde vraag, of een andere vraag

**Datum:** 17-09-2026 · **Issue:** QS8-515 · **Status:** gebouwd (migratie 0287)

## Het geval

`create_group()` streek de groepsnaam met `btrim()` en toetste daarna de lengte.
Migratie 0286 (QS8-508) zette `groups_name_schoon` op de tabel: `name =
public.schone_naam(name)`.

📏 Gemeten op de lokale stack, met de gedeployde functie uit
`pg_get_functiondef()`:

| invoer | `btrim()` | `schone_naam()` |
|---|---|---|
| `U&'\00A0Jan\00A0'` | `' Jan '` (5 tekens) | `'Jan'` (3 tekens) |
| `U&'\00A0a\00A0'` | `' a '` (3 tekens) | `'a'` (1 teken) |

De tweede rij is de fout. `btrim()` telt drie tekens, dus de naam haalt de
ondergrens van twee; `schone_naam()` houdt er één over, dus de CHECK weigert de
rij. De functie gaf daardoor geen `{ok: false, reason: 'name_too_short'}` terug
maar een kale `23514` — een foutcode waar `src/modules/buddies/api.ts` geen
vertaling voor heeft.

**De twee stelden een verschillende vraag over dezelfde naam.** Niet omdat er een
vergissing in stond, maar omdat de ene vraag in 0016 geschreven is en de andere
in 0286, en niemand ze naast elkaar heeft gelegd.

## Wat hier de naad is

De schrijver bewaakt de naam met één vraag, de tabel bewaakt hem met zeven
CHECKs. **Het gat tussen die twee is precies zo groot als het verschil tussen de
vragen** — en dat gat is er niet stuk voor stuk, maar in het geheel. Elk van de
onderdelen klopte: `btrim()` doet wat hij belooft, `schone_naam()` ook,
`groups_name_schoon` ook. Regel 18, woordelijk.

📏 En de bestaande toetsen zagen er niets van:

- `tests/rls/naamnormalisatie.test.ts` loopt het hele codepuntbereik langs
  `schone_naam()` en zijn TypeScript-spiegel. Groen. Hij toetst de functie.
- `tests/rls/de-rand-van-een-naam.test.ts` eiste dat `create_group()` een naam
  met een rand **weigert**. Groen — want hij wérd geweigerd, alleen met de
  verkeerde soort antwoord. De toets vroeg *"mislukt dit"* en niet *"krijg ik
  hier een antwoord dat ik kan vertalen"*.

De tweede is de leerzaamste: een toets die alleen `ok !== true` eist, leest een
omgevallen aanroep als een nette weigering. Bij een `23514` is `data` namelijk
`null`, en `null?.ok` is óók niet `true`. **Een dichte deur leest als een veilige
deur** — dezelfde vorm als bij de security-ronde op QS8-450, één laag hoger.

## De bevinding die niet klopte

QS8-515 beschrijft twee dingen. Het tweede is dat de lokale variabele
`schone_naam text` in `create_group()` de gelijknamige functie zou afschermen,
zodat de voor de hand liggende reparatie stukloopt.

📏 **Dat is onjuist.** Nagemeten op PostgreSQL 16.13, vier vormen, elk in een
`pg_temp`-functie met `search_path = public, pg_temp` en een lokale
`schone_naam text` in de declaratie. Alle vier geven `'Jan'` voor
`U&'\00A0Jan\00A0'`:

| vorm | uitkomst |
|---|---|
| `schone_naam := public.schone_naam(p);` | `'Jan'` |
| `schone_naam := schone_naam(p);` | `'Jan'` |
| `select public.schone_naam(p) into schone_naam;` | `'Jan'` |
| `select schone_naam(p) into schone_naam;` | `'Jan'` |

plpgsql kiest op de **vorm** en niet op de naam: een identifier mét
argumentenlijst is een functieaanroep, een kale identifier is de variabele. Er is
geen botsing, ook niet zonder schema-prefix.

De variabele is tóch hernoemd naar `v_naam`. Niet omdat het moest, maar omdat
`schone_naam := schone_naam(...)` als een zelftoekenning leest — en dit issue is
het bewijs dat een lezer daar de verkeerde conclusie uit trekt. Een regel die je
twee keer moet lezen om te weten of hij werkt, is een val die nog niet is
toegeslagen.

⚠️ Dit is de reden dat CLAUDE.md bij regel 19 zegt elke bevinding zelf te
verifiëren. De bevinding wees naar de goede plek en gaf de verkeerde reden; had ik
de reden overgenomen, dan stond er nu een migratiekop die het onwaar uitlegt — en
dat is precies de vorm die QS8-408 duur maakte: *een afwijking die je onderbouwt,
leest de volgende persoon als een reden om er niet aan te twijfelen.*

## De aanname die onderuitging: `schone_naam()` is niet idempotent

De eerste versie van 0287 was één regel: `btrim()` eruit, `public.schone_naam()`
erin. De onderbouwing erbij was dat een `exception when check_violation` overbodig
is, want `schone_naam()` stelt sinds 0285 alle vijf de strijkers samen, dus zijn
uitvoer haalt elke CHECK op `groups.name`.

**Dat klopte niet.** En het kwam alleen boven doordat die zin een meting moest
krijgen.

📏 Het hele codepuntbereik (`U+0001`–`U+10FFFF`, surrogaten overgeslagen) in drie
vormen — `a<c>b`, `<c>ab`, `ab<c>` — door `schone_naam()` gehaald: **3.336.189
gevallen, alle tellers nul.** Idempotent, en elke uitvoer haalt alle vijf de
strijkers. Zo ver klopte de zin.

📏 Daarna **paren**, want één codepunt is niet de aanval. De **4.261** codepunten
waar `schone_naam()` iets aan doet, elk achtste daarvan genomen (**533**), en alle
paren daarvan in vier vormen — **1.136.356** gevallen:

| | |
|---|---|
| niet idempotent | **256** |
| waarvan op `zonder_onzichtbaar_tussen_letters` | **256** |
| op een van de andere vier strijkers | 0 |
| maximale diepte tot een vast punt | **2** |

Met de hand teruggebracht tot één geval:

```
ruw              U&'\2001\+00FE05ab'   -- EM QUAD, variatieselector, 'ab'
schone_naam 1x   U&'\+00FE05ab'        -- de EM QUAD is een randteken en gaat weg
schone_naam 2x   'ab'                  -- nú pas gaat de variatieselector weg
```

En die uitvoer van één aanroep **landt niet**: een `insert` ermee weigert op
`groups_name_geen_onzichtbaar_tussen_letters`. De randstap haalt het buitenste
teken weg en schuift daarmee het volgende teken naar een positie waar een ándere
stap er wél iets van vindt — maar die stap is in diezelfde aanroep al geweest.

⚠️ **Dat is een defect in `schone_naam()` en niet in `create_group()`**, en het
raakt meer dan groepen: `handle_new_user()` normaliseert de naam uit een
aanmelding óók met één aanroep, en `profiles_display_name_schoon` stelt dezelfde
eis. Het is QS8-526 in Linear; hier wordt het niet gerepareerd, want dat
vraagt dezelfde wijziging in `schoneNaam()` in `src/shared/tekst` — die twee staan
onder een naadtest die het hele codepuntbereik afloopt.

## Wat 0287 er daardoor anders doet

1. **Normaliseren tot een vast punt.** `schone_naam()` wordt herhaald tot de
   uitvoer niet meer verandert, met een plafond van vijf. Gemeten is twee genoeg;
   vijf is de marge. De CHECK vraagt letterlijk om een vast punt (`name =
   schone_naam(name)`), dus daar hoort de schrijver er een van te maken. Het is
   bovendien wat de app-route feitelijk al deed: `schemas.ts` strijkt client-side
   en `create_group()` strijkt daarna nog eens.
2. **Een `exception when check_violation` om de `insert`.** Weigert een CHECK op
   `name` het alsnog, dan komt er `{ok: false, reason: 'name_invalid'}` uit en
   geen kale `23514`. Alleen voor een CHECK die over `groups.name` gaat; elke
   andere gaat ongewijzigd door, want die zou een echte fout verbergen.

⚠️ **De handler vraagt het aan `pg_constraint` en niet aan een patroon op de
naam.** `conname like 'groups_name%'` leest de naamgeving van vandaag en niet de
eigenschap: een achtste CHECK die `groups_naam_…` heet valt er stil buiten, en
dan is de kale `23514` terug op precies de plek die deze migratie sluit.

⚠️ **En de handler is geen tak die nooit vuurt.** Dat was de reden om hem eerst
wég te laten, en die reden rustte op de aanname die hierboven sneuvelde. Hij staat
onder een toets die hem met de hand voedt: een CHECK op `groups.name` erbij die
`schone_naam()` niet impliceert, in een transactie die terugdraait.

## Wat er verandert voor wie de RPC rechtstreeks aanroept

Een naam met een override wérd geweigerd en wordt nu gestreken. Dat is een
gedragswijziging en geen bijvangst, dus hij staat hier:

- Het is dezelfde uitkomst die de app-route al gaf. `src/modules/buddies/schemas.ts`
  doet `.transform(schoneNaam)` vóór de lengtetoets — dezelfde normalisatie,
  dezelfde volgorde. Wat verdwijnt is het verschil tussen de twee routes.
- De belofte eronder — *er landt geen groepsnaam die als een andere groep
  rendert* — is in beide gevallen waar.
- Blijft er na het strijken minder dan twee tekens over, dan is het antwoord
  `name_too_short`, en dat is een reden die `api.ts` al vertaalt.

⚠️ **De CHECKs blijven onverkort staan, en dat is geen restant.** De tweede
schrijver op deze kolom is een kale PATCH van een beheerder — 📏
`has_column_privilege('authenticated', 'public.groups', 'name', 'UPDATE')` is `t`,
en `guard_group_update()` noemt `name` niet. Die route normaliseert niets en hoort
te weigeren.

## Wat de toetsen nu dragen, en wat ze niet dragen

| grendel | waar |
|---|---|
| `create_group()` strijkt met `schone_naam()` | `create_group-antwoordt-gestructureerd.test.ts`, de RPC-gevallen |
| en strijkt tot een **vast punt** | dezelfde suite, het geval `EM QUAD + VS6 + ab` |
| een CHECK op `name` wordt een reden en geen `23514` | dezelfde suite, de handlertoets over psql |
| het vaste punt haalt elke CHECK op `groups.name` | dezelfde suite, het naadblok |
| `groups_name_schoon` weigert de PATCH-route | `de-rand-van-een-naam.test.ts` |
| er landt geen naam met een override | `groepsnaam-keert-niet-om.test.ts` |

📏 Elke rij is met de hand gebroken, en per grendel apart:

| mutatie | wat er rood werd |
|---|---|
| `btrim()` terug in `create_group()` | 8 van de 9 aanvalsgevallen; de drie must-allows en het naadblok bleven groen |
| de vaste-puntlus vervangen door één aanroep | alléén het geval `EM QUAD + VS6 + ab`, en op `ok` — de handler ving het op als `name_invalid`, dus er lekte geen `23514`. **Daarom staat de lus er náást de handler: zonder lus wordt een naam die wél mag, geweigerd.** |
| de `when check_violation`-tak weggehaald | de handlertoets, op `OMGEVALLEN=23514` |
| de `pg_constraint`-versmalling weggehaald (élke `check_violation` wordt `name_invalid`) | de must-not-allow-helft, op een `name_invalid` waar een `23514` hoorde |
| de grove grens van duizend weggehaald | het geval `1001 × ZWSP + ab`, dat dan gewoon landt als `'ab'` |
| achtste CHECK `name = upper(name)` op `groups` | het naadblok, op `GESCHONDEN=zz_ijk_hoofdletters` |
| CHECK over twee kolommen (`name <> icon`) | het naadblok, op `BEKEKEN=7` tegen `VAN=8` |
| `groups_name_schoon` gedropt | de twee PATCH-toetsen in `de-rand-van-een-naam.test.ts` |
| `btrim()` terug **én** drie CHECKs gedropt | `laat bij het aanmaken geen groepsnaam met een override achter` |
| alleen de drie CHECKs gedropt | die laatste toets **niet** — de normalisatie houdt de belofte alleen |

⚠️ **Die laatste rij is het antwoord op regel 18 vraag 3, en hij is ongemakkelijk
genoeg om op te schrijven.** De belofte *er landt geen omgekeerde naam* hangt aan
twee onafhankelijke grendels, dus een toets op die belofte wordt pas rood als ze
állebei weg zijn. Dat is juist en het is ook minder scherp dan een toets die één
grendel noemt. Daarom staan ze naast elkaar: de constraintnaam op de route waar
weigeren het enige juiste antwoord is, de belofte op de route waar dat niet zo is.

⚠️ **En het naadblok leest `create_group()` niet.** 📏 Met `btrim()` teruggezet
bleef het groen — terecht, want het toetst de andere helft van de naad. Wie hier
één van de twee weghaalt, houdt een groene suite over die de helft van de belofte
laat vallen. Dat staat in de kop van dat blok, zodat het geen ontdekking hoeft te
zijn.

## Wat deze meting níet dekt

De parenveeg is een **greep**: elk achtste actieve codepunt, 533 van de 4.261.
Drietallen zijn helemaal niet bekeken. De volledige parenveeg is
4.261² × 4 ≈ 72,6 miljoen aanroepen en liep na twintig minuten nog; de greep is
1,1 miljoen en duurt zes.

Dat is geen sluitend bewijs dat vijf iteraties altijd genoeg zijn, en het hoort
hier te staan in plaats van weggeschreven te worden. **Wat er wél staat, is een
tweede grendel voor het geval dat het niet zo is:** loopt de lus zijn plafond af
zonder vast punt, dan weigert de CHECK de rij en vertaalt de handler dat naar
`name_invalid`. Er is dus geen invoer waarmee deze route een kale `23514` geeft —
hooguit een invoer die geweigerd wordt terwijl ze had kunnen landen.

⚠️ **Wordt zwaarder als** iemand het plafond van vijf verlaagt, de handler
weghaalt, of `schone_naam()` uitbreidt met een stap die de uitvoer van een latere
stap opnieuw kan raken. De eerste twee zijn rood in de suite; de derde niet, en
daarom staat de idempotentie van `schone_naam()` als QS8-526 open.

## Wat de security-ronde erbij vond

Drie dingen, en alle drie zijn ze zelf nagemeten voordat ze verwerkt zijn.

**1. De normalisatie stond vóór élke limiet, en deze migratie maakte hem vijftien
keer duurder.** 📏 `public.schone_naam()` op vijf miljoen zero-width spaties kost
**1.470 ms**; `btrim()` kostte **94 ms**. De lus draait hem tot twee keer, en de
lengtetoets komt er pas ná. Omdat er geen groep van komt, telt `daily_limit` niet
op: één ingelogde gebruiker kon dat onbeperkt herhalen, op een tier waar
`max_connections` 60 is voor de héle database.

Het ontbreken van die grens stond er al; de factor is van deze migratie, en dus
hoort de reparatie hier. Er staat nu een grove bovengrens van duizend ruwe
codepunten vóór de lus. 📏 Dezelfde aanroep kost daarmee **35 ms**.

⚠️ **De prijs staat in de toets en niet in een comment.** Een invoer van meer dan
duizend ruwe tekens wordt geweigerd óók als er een geldige naam van overblijft, en
het ijkgeval is daarom `1001 × ZWSP + 'ab'` en geen duizend-en-een `x`-en: bij
`x`-en geeft de lengtetoets ná het strijken hetzelfde antwoord, en dan bewaakt de
toets niets.

**2. De versmalling in de handler was niet getoetst.** De kop hierboven besteedt
twee alinea's aan waarom alleen een CHECK op `groups.name` vertaald mag worden —
en 📏 met de `pg_constraint`-toets eruit gehaald bleven alle zesenvijftig toetsen
van de drie geraakte suites **groen**. Precies "een grendel die alleen in een
comment staat". Er staat nu een must-not-allow naast de handlertoets: een CHECK op
`groups` die niets met `name` te maken heeft, moet ongewijzigd doorgegooid worden.

**3. De suite zat exact op de limiet van tien groepen per gebruiker per dag.** 📏
Eén extra must-allow maakte niet zichzelf rood maar het **laatste** geval, met de
melding *"create_group() weigerde een naam die hij hoort door te laten"* — terwijl
de oorzaak `daily_limit` was. De gevallen rouleren nu over vijf gebruikers. Een
toets die rood wordt op het verkeerde geval, stuurt de volgende lezer naar de
verkeerde plek.

## Eén bevinding uit die ronde is níet overgenomen

De ronde bood een **bewijs** aan dat een vast punt per constructie aan alle zes
de deelstappen voldoet: *elke stap verwijdert uitsluitend tekens, dus de uitvoer
is een deelrij van de invoer, en uit `x = schone_naam(x)` volgt dan dat elke
binnenstap de identiteit is.* Datzelfde argument gaf convergentie van de lus
gratis: elke iteratie is een vast punt of wordt korter.

📏 **De premisse is onjuist**, en dat is met de hand nagemeten:

```
schone_naam(U&'a\2028b')                  ->  'a b'   (3 tekens)
zonder_onzichtbaar_middenin(U&'a\2028b')  ->  'a b'
```

`U+2028` wordt **vervangen** door een spatie en niet verwijderd. De uitvoer is
dus geen deelrij, de lengte kan over een iteratie gelijk blijven, en een cyclus
is niet uitgesloten door dit argument.

Wat er wél staat is de meting (maximale diepte 2 over 1.136.356 gevallen) en de
handler eronder. Dat is zwakker dan een bewijs, en het hoort zo opgeschreven te
worden — **een afwijking die je onderbouwt is duurder dan een die je vergeet**, en
een bewijs dat niet klopt leest de volgende persoon als een reden om er niet aan
te twijfelen. De grens staat als rij in `docs/ENGINEER-REVIEW.md`.
