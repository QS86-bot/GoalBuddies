# Een uitrol zonder dump, en waarom dat hier mocht

**19-09-2026 — de uitrol van `0283` t/m `0294` naar `wehgocadxehottiiyvsc`.**

## Wat er gebeurd is

Twaalf migraties zijn naar productie gebracht: `0283` t/m `0294`. De stand ging
van `0282` naar `0294`, en `supabase/uitgerold.json` van 285 naar 297
registerrijen.

📏 Na afloop gemeten: **297 registerrijen en 297 migratiebestanden**, hoogste aan
beide kanten `0294`, en geen enkele versie die niet de vorm `NNNN` of `NNNNa`
heeft. De twee verzamelingen versienummers zijn met `comm` naast elkaar gelegd —
geen enkel bestand zonder rij, geen enkele rij zonder bestand.

⚠️ **`0294` kwam er tijdens de uitrol bij**, met PR #555 (QS8-548), en `0292` en
`0293` net zo. Wie deze uitrol naleest moet weten dat de map onder hem doorliep:
het startpunt was negen migraties en het werden er twaalf. Dat is geen
slordigheid maar de normale toestand van een project waar parallel aan gewerkt
wordt — en het is precies waarom de eindmeting het **aantal aan beide kanten**
telt in plaats van af te vinken wat er aan het begin op de lijst stond.

## ⚠️⚠️ Er is géén `pg_dump` gedraaid, en dat is een besluit van Quinten

CLAUDE.md schrijft `pg_dump` vóór elke migratie voor, met als reden dat de
gratis tier geen automatische backups heeft. Die dump is hier niet gemaakt, en
dat is voorgelegd en goedgekeurd (*"Doorgaan zonder dump"*).

📏 **Wat de meting was die dat droeg**, vlak vóór de eerste migratie:

| tabel | rijen |
|---|---|
| `auth.users` | **1** |
| `profiles` | **1** |
| `goals` | **1** |
| `groups`, `group_members`, `chat_messages`, `commitments`, `completions` | **0** |

⚠️ **De reden dat de dump niet kón, is een andere dan de reden dat hij niet
hoefde, en die twee horen niet door elkaar te lopen.** `npm run db:dump` en
`npm run register:uitlijnen` leunen allebei op `SUPABASE_DB_URL`, en die staat in
deze cloudsessie niet in de omgeving — 📏 nagemeten, geen enkele
`SUPABASE_*`/`PG*`-variabele gezet en alleen een `.env.example` op schijf. Er was
dus geen route naar een dump, ook niet als we hem hadden gewild. Wat de
beslissing droeg is de telling hierboven: er is vandaag vrijwel niets om te
verliezen, en elke van de twaalf migraties draagt een uitgeschreven rollback-pad.

⚠️ **Die redenering vervalt bij de eerste echte gebruiker.** Hij is een meting en
geen regel: zodra `auth.users` meer dan een handvol rijen telt, is dit precies de
situatie waar CLAUDE.md voor schrijft. Wie deze rij leest als een precedent,
leest hem verkeerd.

## ⚠️⚠️ De route liep via de MCP, en dáár zat het echte risico

Zonder `SUPABASE_DB_URL` is er geen `psql -v ON_ERROR_STOP=1 -f <bestand>`. Elke
migratie is daarom met `apply_migration` toegepast, en dat betekent dat de SQL
**door de context van een model heen** gaat in plaats van rechtstreeks van
schijf.

**Het gevaar is niet dat zo'n overdracht mislukt.** Een halve migratie eindigt
meestal in een onafgemaakte statement, en dan is het een syntaxfout en rolt alles
terug. Het gevaar is dat hij toevallig op een **statementgrens** afbreekt: dan
commit hij als een gedeeltelijke migratie en schrijft hij zichzelf weg als
toegepast. Dat faalt open, en het is stil.

**Daarom is elke migratie ná het toepassen tegen zijn eigen volledige uitkomst
gelegd**, en niet steekproefsgewijs:

| migratie | wat er geteld is | uitkomst |
|---|---|---|
| `0283` | 15 CHECK-constraints | 15 van 15 |
| `0284` | 24 CHECK-constraints, elk bij naam, plus het familietotaal | 24 van 24, totaal 27 → 51 |
| `0285` | 8 CHECKs + het gedrag van beide functies + de grants | alle acht, LF/TAB/CR blijven, VT/FF/C0 gaan weg |
| `0286` | 2 CHECKs, gevalideerd, mét hun comment, + de naadreparatie in `handle_new_user()` | beide, en de naad gemeten |
| `0287` | zes merktekens door het hele lichaam van `create_group()`, van de bovengrens tot de staart | alle zes, één overload, grants ongewijzigd |
| `0288` | drie functies, hun grants, en de datumgrens aan beide kanten van de naad | `doeldatum()` zonder `authenticated`-grant |
| `0289` | taal, volatiliteit, grants, én de twee gemeten idempotentiegevallen | `plpgsql`/`immutable`, beide gevallen vast |
| `0290` | de twee verzette clausules én de regel die met opzet blijft staan | oude vorm weg, `g.target_date < p_vandaag` blijft |
| `0291` | zeven voorkomens van `c_ruwe_grens`, alle vier de bronnen, de trigger | zeven, vier, één |
| `0292` | vier functies, hun grants, beide bewakingen gedraaid, de knip geijkt | 0 bezwaren, 0 verkeerde grants |
| `0293` | de verruimde allowlist, de functie, de drie dragende conjuncten | alle drie aanwezig |
| `0294` | beide overloads, hun taal, hun `security`-stand, hun grants en de afgeschreven-comment | definer/plpgsql + invoker/sql, geen van beide voor `authenticated` |

⚠️ **De vorm van die controle is wat hem bruikbaar maakt: hij telt het gehéél en
niet een voorbeeld.** Bij `0284` is niet "staat er een constraint" gevraagd maar
"staan er precies vierentwintig, elk bij naam, en klopt het familietotaal
27 + 24 = 51". Een gedeeltelijke toepassing kán die uitslag niet halen. Een
steekproef op de eerste of de laatste wél — en de laatste is juist de statement
die bij een afbreking als eerste ontbreekt.

📏 **Vóór elke migratie is ook de begintoestand gemeten**, en dat is dezelfde
regel als bij een ijking: een uitslag die niet weet hoe het ervóór stond, meet
niet wat hij beweert. Zo is bij `0285` eerst vastgesteld dat de gedeployde
tekenklasse woordelijk de vorm van `0271` was, en bij `0286` dat er nul rijen
waren die `validate` zouden laten afbreken.

## Wat er op productie veranderd is, en wat opvalt

Geen enkele migratie gedroeg zich anders dan zijn kop beloofde. Twee metingen
zijn het noemen waard omdat ze de belofte bevestigen in plaats van alleen de
vorm:

- **`0285` haalde bijna een grendel weg.** 📏 Vóór: `schone_naam('Jan' + LF +
  'Admin')` gaf `'JanAdmin'`. Ná, mét het `schone_naam()`-blok dat die migratie
  meebrengt: nog steeds `'JanAdmin'`. Zonder dat blok had dezelfde correctie de
  naam over twee regels laten renderen — precies waar `0269` voor gebouwd is.
- **`0286` repareerde een naad die anders een registratie kostte.** 📏 Op
  productie nagerekend: `left(schone_naam(repeat('a',79) || ' Jansen'), 80)`
  eindigt op een spatie en haalt `profiles_display_name_schoon` niet; de nieuwe
  volgorde `schone_naam(left(…))` haalt hem wel.
- **`0292` verandert vandaag niets aan de uitslag, en dat is wat zijn eigen kop
  voorspelde.** 📏 `tijdstempel_bewaking()` en `dagplafondvenster_bewaking()`
  geven allebei **0 bezwaren** op productie. De winst zit in de spelling die nog
  niemand getypt heeft.

📏 `get_advisors` (security) na afloop: geen enkele van de zes nieuwe functies —
`zonder_regelovergang`, `doeldatum`, `serverklok_default`,
`code_zonder_commentaar`, `dagplafondvenster_bewaking`,
`teruggedraaide_straffen_voor` — komt voor in de lijst met
`SECURITY DEFINER`-functies die `anon` of `authenticated` mag uitvoeren. De
`revoke`-regels hebben dus gedaan wat ze zeggen.

## ⚠️ De registerversie is twaalf keer met de hand rechtgezet

`apply_migration` deelt altijd een **tijdstempel** uit als versie
(`20260919172706`), en de registercontroles van dit project verwachten het
viercijferige bestandsnummer. `npm run register:uitlijnen` doet dat normaal, maar
die leunt óók op `SUPABASE_DB_URL`. Elke rij is daarom direct na zijn migratie
met een `update ... where name = … and version <> …` op zijn nummer gezet, en de
`returning` is elke keer nagelezen.

📏 Die vorm is met opzet idempotent en smal: hij raakt precies één rij, hij doet
niets als de versie al klopt, en hij noemt de naam voluit in plaats van een
patroon. Dat is dezelfde overweging als bij `migratie:hernummer` — een blinde
`sed` heeft in dit project al eens de dossierrij van een ánder issue
overschreven.

⚠️ Dit is een handmatige stap in een pad dat er een geautomatiseerde voor heeft.
De reparatie is niet "beter opletten" maar `SUPABASE_DB_URL` in de omgeving van
een cloudsessie, en dat is de enige manier waarop deze hele uitrol langs `psql`
had gekund. Zolang die er niet is, is dít de route, en dan hoort de controle
erbij die hierboven staat.

## Wat dit kost aan openstaand werk

`npm run uitrolproza:controle` (QS8-560) legt de dossierproza naast
`supabase/uitgerold.json`. Met de stand op `0293` slaat hij aan op elke rij die
zegt op een uitrol te wachten die inmiddels geland is — en dat is de bedoelde
uitslag, niet een defect: *"dit is kijk hier en niet opgelost"*. Die rijen zijn
in deze wijziging hermeten; wat er per rij uit kwam, staat bij de rij zelf.

## ⚠️⚠️ Wat het hermeten opleverde, en dat is meer dan een getal bijwerken

Acht rijen noemden een productiestand, en twee wachtten op een uitrol die met
deze batch landde. Het bijwerken ervan bracht drie dingen boven die geen van
alle over de stand gingen:

**1. Twee rijen droegen een bewering die al vóór deze uitrol onwaar was.** r200 zei middenin *"daar bestaat
alleen `avatars`"* en aan het eind *"alle vier op of onder `0282`"*. r697 net zo
met `bewijsfotos`. 📏 Read-only geteld op productie: **vier** emmers, met de
uiteenlopende limieten (2 / 1 / 1 / 5 MB, `chatdocs` op uitsluitend
`application/pdf`).

⚠️ **De vorm is de les: een rij die zichzelf aan het eind verbetert, laat de oude
tekst staan voor wie alleen het begin leest.** Een hermeting die er onderaan bij
komt, corrigeert de rij niet — hij voegt een tweede waarheid toe naast de eerste.

**2. r708 leidde de toestand van productie áf uit het standverschil in plaats van
hem te meten**, en kwam daarmee op twee onware zinnen: één emmer, en
`avatars_update` zou er nog staan. 📏 Geteld: vier emmers, **nul**
UPDATE-policies op `storage.objects`. ⚠️ **Een afgeleide toestand leest als een
meting en is het niet.**

**3. r595 wees op een risico dat deze uitrol bijna opleverde, in de andere
richting.** 📏 De gedeployde `notificaties` is **v19** en roept twee RPC's aan;
de versie in de map roept er drie aan, want `0293` bracht
`teruggedraaide_straffen_voor()` mee. Was de functie vóór de migratie
gedeployd, dan had hij elk uur een `PGRST202` gevangen en was de derde melding
stil weggevallen. Het ging goed omdat de migratie eerst liep — een eigenschap
van déze batch en niet van een grendel.

## ⚠️ Een gemeten grens van `uitrolproza:controle` zelf

Drie van de meldingen sloegen op een **gedateerde historische** meting
(*"productie staat op 0282"*, geschreven op 11-09 en op 17-09). Die zijn naar de
verleden tijd gezet — *stónd op* — en daarmee zwijgt de controle.

⚠️⚠️ **Dat is terecht én het is een opening, en die twee staan naast elkaar.**
Terecht, omdat een gedateerde meting geen bewering over vandaag is; een dossier
dat zijn eigen geschiedenis niet meer mag opschrijven verliest precies wat het
waard is. Een opening, omdat `staat op` → `stond op` een bewering over de
huidige stand kosteloos onzichtbaar maakt, zonder dat er iets hermeten is.

📏 Gemeten: `STANDCLAIM` in `scripts/uitrolproza-controle.mjs` matcht `staat op`
en `stand` en niet `stond op`. Er is vandaag geen tweede grendel die dat opvangt.

De controle is hier **niet** aangepast, en dat is een keuze met een reden: de
onderscheidende eigenschap is niet de werkwoordsvorm maar of er een **datum** bij
staat, en dat is een andere controle dan deze. Het staat als rij in
`docs/ENGINEER-REVIEW.md` in plaats van als stilzwijgende eigenschap.

## De twee stappen die geen migratie zijn, en waarom ze erbij horen

**`notify pgrst, 'reload schema'` — twee keer gedraaid**, na `0293` en na `0294`.
PostgREST bouwt zijn schemacache bij het starten op en ziet een nieuwe functie
niet uit zichzelf. Zonder die reload geeft elke nieuwe RPC `PGRST202`, en 📏 dat
is precies hoe de drift van 52 migraties in QS8-505 ontdekt werd: **door
gebruikers en niet door een controle.**

⚠️ `0293` bracht `teruggedraaide_straffen_voor()` mee en `0294` een nieuwe
`maak_straffen_verschuldigd(uuid)`. Allebei zijn ze vandaag nog onbereikbaar
voor een client (📏 geen `authenticated`-grant), maar de reload hoort bij de
uitrol en niet bij de eerste aanroeper die erover struikelt.

**De volgorde tussen migratie en functiedeploy is één keer goed gegaan, en dat
was geen grendel.** 📏 `0294` schrijft in zijn eigen kop dat *deploy vóór
migratie* de rollover stil laat vallen: `wikkelStraffenAf()` vangt de
`PGRST202`, logt naar `console.error`, telt nul, en de rollover geeft een 200 —
er wordt voor niemand nog een straf verschuldigd zonder dat iets rood wordt.
📏 De gedeployde `rollover` is **v24** en roept de tweearguments vorm aan, die
`0294` met opzet als wrapper laat staan; de gedeployde `notificaties` is **v19**
en roept `teruggedraaide_straffen_voor()` nog niet aan. De migraties liepen dus
vóór de functies, wat de goede kant is.

⚠️ **Wat nu openstaat is de andere helft: de functies deployen.** Zolang dat niet
gebeurd is, draait er een `notificaties` die de derde melding niet kent en een
`rollover` die via de wrapper werkt. Geen van beide is kapot; ze zijn alleen nog
niet wat de map beschrijft. De wrapper mag pas weg als dat gemeten is tegen de
**gedeployde bundel** — dat staat als QS8-559 en de `comment on` in de database
draagt dezelfde zin.

## ⚠️⚠️ De sterkste controle staat achteraan, want hij toetst het gehéél

De metingen per migratie hierboven toetsen elk één bestand. Wat ze niet kunnen
zeggen is of het schema als geheel is wat de map beschrijft — dat is regel 18
vraag 2, toegepast op de uitrol zelf.

📏 **Daarom is de functieverzameling van productie naast die van een verse
lokale stack gelegd**, opgebouwd uit dezelfde 297 bestanden:

| | functies |
|---|---|
| productie | **292** |
| lokale stack (297 migraties + de shim) | **294** |
| alleen op productie, niet lokaal | **0** |
| alleen lokaal, niet op productie | **2** |

En die twee zijn `shim_maak_gebruiker(text, text)` en
`shim_verwijder_gebruiker(uuid)` — de helpers uit
`supabase/shim/0000_supabase_shim.sql`, die per constructie nooit op productie
horen te staan.

⚠️ **Productie is dus een strikte deelverzameling, en het verschil is precies
verklaard.** Dat is een sterkere uitspraak dan twaalf losse controles bij elkaar:
een gedeeltelijk toegepaste migratie, een overgeslagen bestand of een functie die
per ongeluk op productie is blijven staan zou hier uitkomen, en geen van drieën
doet dat.

📏 De vergelijking gaat over méér dan de naam: de vingerafdruk telt per functie
ook `prosecdef` (definer of invoker), `provolatile` en de grants aan `anon`,
`authenticated` en `service_role`. Een functie die op productie definer is en
lokaal invoker, of die daar een grant draagt die de map niet uitdeelt, valt
daarmee op.

⚠️ **Wat deze controle níet dekt**, en dat hoort erbij: hij vergelijkt de
verzameling en niet de lichamen. Twee functies met dezelfde naam, handtekening,
volatiliteit en grants maar een verschillend lichaam geven hier hetzelfde
antwoord. Daar is `functie_vingerafdrukken()` voor, en die vraagt een sleutel die
deze sessie niet heeft — `functies:controle` staat daarom standaard op
*ongemeten*.
