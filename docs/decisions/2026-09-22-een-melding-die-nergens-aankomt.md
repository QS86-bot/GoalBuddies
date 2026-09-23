# Een melding die nergens aankomt

**Datum:** 22-09-2026
**Issue:** QS8-586
**Migratie:** `0296_een_melding_krijgt_een_lezer_en_een_afhandeling.sql`
**Schermen:** `app/meldingen.tsx`, de ingangskaart in `app/(tabs)/profiel.tsx`

## De meting

`public.reports` bestaat sinds QS8-232 (migratie `0145`) en het werk eromheen
klopt: policies voor alle vier de handelingen, indexen op `(group_id, status)`,
`reporter_id`, `subject_id` en `message_id`, kolomgrants per kolom in `0173`,
spoofing-grendels in `0284`, en een schrijfkant in
`src/modules/buddies/veiligheid.ts`.

📏 Gegrepen op `from('reports')` en `public.reports` over `src/`, `app/`,
`supabase/` en `scripts/`: buiten de migraties zelf en drie controlescripts die
de tabelnaam incidenteel noemen was er **nul** leespad. Geen Edge Function, geen
job, geen notificatie, geen scherm.

Een gebruiker kon dus melden, de rij werd netjes weggeschreven en bewaakt, en er
keek **niemand** naar. Dat is onwrikbare regel 18 vraag 5 in zijn zuiverste
vorm — *elk schakeltje af, de keten onderbroken* — en dus precies de variant
waar geen enkele test iets van kan zien: er is niets kapot te máken.

Tot 22-09 was dat verdedigbaar. Elke groep bestond uit mensen die elkaar hadden
uitgenodigd, en `reports_select` maakt een melding zichtbaar binnen de groep: bij
bekenden is de groep zelf de moderatie. Het besluit van 22-09 op QS8-230 —
*ook onbekenden, nu* — laat die aanname vervallen.

## Het geval dat de vorm bepaalde

📏 Met echte rijen gemeten, vóór `0296`. `reports_select` is
`reporter_id = auth.uid() OR (is_group_admin(group_id) AND subject_id <> auth.uid())`.
Een melding **over de groepsbeheerder** kwam daarmee bij niemand aan die kon
handelen:

| | |
|---|---|
| `meld()` gaf | `{"ok": true}` |
| de **melder** zag | 1 melding |
| de **beheerder** (het onderwerp) zag | 0 meldingen |

In een groep met onbekenden is dat niet het randgeval maar het geval dat het
zwaarst weegt: wie zich misdraagt als beheerder, is degene die niemand kan
aanspreken.

## Wat er gekozen is

### 1. Een lezer met een kolomlijst, en geen `select *`

`openstaande_meldingen(p_limit, p_na_at, p_na_id)` geeft twaalf kolommen terug.
`reporter_id` staat er **met opzet niet** bij.

⚠️ Dat is een kolomvraag en geen policyvraag. *RLS kan geen kolommen beperken* —
dus dat de melder buiten beeld blijft is een eigenschap van de **returntabel** en
van niets anders. Een `select *` erbij zou hem stilzwijgend terugbrengen.

⚠️⚠️ **En die alinea was niet genoeg, wat de security-review met een meting liet
zien — zie §8, K3.** De RPC liet `reporter_id` weg, en `authenticated` had
ondertussen **tabelbrede** `select` op `public.reports`: één verzoek buiten het
scherm om gaf de melder alsnog. De kolomlijst was de halve reparatie; `0297`
brengt de andere helft.

Wie meldde is niet nodig om te beoordelen, en weglaten beschermt de melder tegen
een beheerder die het hem betaald zet. Zelfde vorm en zelfde reden als
`getuigenissen()` (`0169`) en `straffen_bij_uitstelverzoek()` (`0218`).

### 2. Twee routes, en de tweede is smal

| route | wie | wanneer |
|---|---|---|
| a | beheerder van de groep | en niet zelf het onderwerp |
| b | platformbeheerder | **en** het onderwerp is beheerder van díé groep |

⚠️ **De escalatie is geen moderatiedienst.** Route (b) geeft uitsluitend de
gevallen die route (a) per definitie niet kán afhandelen. ⚠️⚠️ **In `0296` was
dat een bewering en geen implementatie** — zie §8, K2. Zou de
platformbeheerder álles zien, dan leest één account elke melding in elke groep —
een privacybelofte die niemand gedaan heeft. `tests/rls/melding-komt-aan.test.ts`
legt die grens vast als must-not, naast de must-allow.

`profiles.platform_beheerder` is `not null default false`, en
`revoke update (platform_beheerder) … from public, anon, authenticated` — geen
enkele client kan zichzelf de rol geven.

### 3. Afhandelen via een RPC, niet via een `update`

`reports_update` blijft `false`. `handel_melding_af(p_report_id, p_status)` is de
enige weg naar een andere stand, en hij legt `afgehandeld_door` en
`afgehandeld_op` vast onder de CHECK `reports_afhandeling_is_heel` — heel of
niet.

⚠️ **Een tweede oordeel geeft `already_handled` en niet stilzwijgend succes.**
Zonder die poort overschrijft een tweede beheerder het oordeel van de eerste, en
dan is `afgehandeld_door` niet meer wie het besloot. Een afhandeling zonder wie
en wanneer is administratie en geen bewijs.

Dat beantwoordt acceptatiecriterium 3: `status` krijgt een levenscyclus
(`open` → `reviewed` | `dismissed`) die precies één keer doorlopen kan worden.

### 4. Eén scherm, en de client vraagt nooit naar de rol

`app/meldingen.tsx` is één scherm voor al je groepen, want
`openstaande_meldingen()` is niet groepsgebonden: hij geeft terug wat *jij* mag
beoordelen. Een per-groep-scherm zou een filter vragen die de RPC met opzet niet
heeft.

⚠️⚠️ **De ingangskaart op het profiel vraagt de database *"is er iets voor mij"*
en niet *"ben ik beheerder"*.** Hij haalt één rij op en verschijnt alleen als die
er is. Zo staat de rol nergens in de schermlaag — en dat is hetzelfde onderscheid
als bij domeinregel 7: *de regel is pas afgedwongen als de dátabase hem
afdwingt.* Een rolcontrole in de client zou een tweede waarheid zijn die van de
RPC af kan gaan lopen, en de gevaarlijke richting daarvan is niet dat de knop te
vaak verschijnt maar dat hij te **weinig** verschijnt: dan komt een melding
opnieuw nergens aan.

### 5. De knoppen doen niets aan het lidmaatschap

"Ik heb actie ondernomen" en "Hier hoeft niets te gebeuren" sluiten allebei de
melding, meer niet. Iemand uit de groep zetten of blokkeren is een andere
handeling op een ander scherm.

⚠️ Allebei `secundair` en naast elkaar, zelfde afweging als bij beoordelen: een
primair/secundair-verhouding maakt van de ene knop het goede antwoord en van de
andere een uitzondering. Een beheerder die het gevoel krijgt dat wegklikken fout
is, klikt niets weg — en dan groeit de lijst tot niemand er meer naar kijkt.

## De typecorrectie

📏 `reports.toelichting` en `reports.bericht_kopie` staan allebei op
`is_nullable = YES`. `openstaande_meldingen()` geeft ze rechtstreeks door, en de
generator kan nullability op een `returns table` niet zien — hij schrijft
`string`. De correctie staat daarom in `src/lib/database.types.correcties.ts`
(klasse 3), niet met de hand in het gegenereerde bestand, en
`tests/beloftes/typecorrecties.test.ts` legt beide kanten vast.

⚠️ Daarmee is `src/modules/buddies/veiligheid.ts` de enige plek in
`src/modules/` die `Database` uit het correctiebestand haalt in plaats van uit de
generatie. Dat is bewust: een `string` waar `null` staat is hier geen typedetail
maar de plek waar een beheerder leest waaróm er gemeld is.

## De grendel, en hoe hij geijkt is

`tests/beloftes/een-melding-eindigt-bij-een-mens.test.ts`. Drie beloftes, geen
ervan grijpt naar een bestandsnaam (regel 18, vraag 4):

- **A** `reporter_id` is geen veld van de rij die de schermlaag krijgt — een
  tsc-toets, met een `@ts-expect-error` ernaast die hem tanden geeft.
- **B** er is een scherm dat een melding kan lézen én slúiten.
- **C** `platform_beheerder` komt in `app/` en `src/modules/` nergens voor.

IJking met de hand, 22-09-2026, één mutatie per grendel, stand ervóór gemeten
(5 groen):

| mutatie | wat er rood werd |
|---|---|
| A — `reporter_id` met de hand in de `Returns` van de generatie gezet | `npm run typecheck`, op precies die regel (`TS1360`) |
| B — `handelMeldingAf(` uit het scherm gehaald | deze toets **én** `exports:controle` |
| B2 — dezelfde aanroep verhuisd naar een ánder scherm | alleen deze toets; `exports:controle` bleef groen op 3 |
| C — de ingangskaart op `platform_beheerder` laten beslissen | deze toets |

⚠️ **B is een correctie op wat er eerst boven die test stond.** Daar stond dat
`exports:controle` groen zou blijven omdat de import bleef staan. 📏 Gemeten is
dat onwaar: die controle telt *aanroepen*, niet imports. B2 is er bij gekomen om
te meten wat deze toets dán wél toevoegt — en dat is de belofte *"één plek waar
een mens een melding leest én afsluit"*, niet *"de functie is ergens
bereikbaar"*. Een onderbouwing zonder meting leest als een reden om er niet aan
te twijfelen.

## Wat dit niet is

- **Geen herbouw van QS8-232.** De schrijfkant, de policies en de grendels zijn
  goed en blijven staan.
- **Geen nieuw type systeembericht.** Dat zou een migratie op de CHECK
  `chat_messages_system_event_bekend` vragen, en het is hier niet nodig.
- **Geen rolmodel.** Er is één `platform_beheerder`-bit en geen moderatorentabel.
  📏 Er is één gebruiker op productie; wat hier nodig was, is dat een melding
  *aankomt*.
- **Geen notificatie.** Wie een melding krijgt, ziet hem bij het volgende bezoek
  aan zijn profiel. Een pushmelding erbij is een eigen afweging — en grens 1 van
  de *Beslisbevoegdheid* als hij naar echte mensen gaat.

## 8. Wat de security-review vond, en wat `0297` ermee doet

Onwrikbare regel 19 wil een `security-reviewer` direct bij alles wat auth, RLS en
gebruikersdata tussen groepsleden raakt. Die ronde liep op 22-09-2026, ná de
uitrol van `0296` en vóór de PR. **Ze vond vier gaten, en ik heb ze alle vier
zelf nagemeten voordat ik ze verwerkte** — dat is de andere helft van regel 19.

⚠️⚠️ **Twee ervan zijn een belofte die dit document en de migratiekop uitschrijven
en niet waarmaken, en dat weegt zwaarder dan een vergeten regel.** Een omissie
valt op; een uitgeschreven argument leest de volgende persoon als een reden om er
niet aan te twijfelen — en er stond bovendien een testsuite onder die hem leek te
bewijzen.

| | wat er mis was | gemeten |
|---|---|---|
| K1 | de platformbeheerder las en dempte meldingen **over zichzelf**: route (a) draagt `subject_id <> auth.uid()`, route (b) droeg hem niet | `ZIET_OVER_ZICHZELF=1`, `DEMPT_ZELF=true`, `afgehandeld_door` = het onderwerp |
| K2 | de escalatie vuurde bij élke melding over élke groepsbeheerder, ook als een mede-beheerder hem kon afhandelen | `BEHEERDER_B_KAN_DIT_ZELF=1` én `PLATFORM_ZIET_HEM_OOK=1` |
| K3 | `reporter_id` was rechtstreeks van de tabel te lezen; `authenticated` had tabelbrede `select` | `TABEL_GEEFT_MELDER=<uuid>`, `MELDER_NAAM=Melder` |
| K4 | `afgehandeld_door … on delete set null` schond de CHECK die hem juist eiste | `verwijder_mijn_account()` viel om op `reports_afhandeling_is_heel` |

Plus drie kleinere in dezelfde twee functies: een open melding in een
**gearchiveerde** groep bereikte niemand (M1), `meldingen_over_onderwerp` telde
méldingen in plaats van mélders (M2), en de escalatie-`exists` toetste
`group_members.status` niet (L). En een kostenbevinding: de ingangskaart draaide
de RPC bij élk profielbezoek, met een filter dat niet te indexeren is — 📏 58 ms
en `Rows Removed by Filter: 5000` voor nul rijen (M3).

**`0297` sluit ze alle zeven.** De twee routes staan nu elk op één plek
(`mag_melding_als_beheerder()`, `mag_melding_als_escalatie()`) in plaats van twee
keer woordelijk uitgeschreven in de lezer én de afhandeling — dat was precies hoe
K1 in allebei terechtkwam.

⚠️ **Eén meetfout van mijzelf hoort hier ook.** Bij het narekenen van K1 kwam
`DEMPT_ZELF=false` uit, en ik had dat bijna als weerlegging genoteerd. De fout
zat in de meting: het melding-id werd via RLS opgehaald, waar de
platformbeheerder het niet ziet, dus ging er `null` de RPC in. Met het id zoals
**het scherm** hem krijgt — uit `openstaande_meldingen()` — is het `true`. *Een
grendel toetsen langs een pad dat het scherm niet loopt, bewaakt niets van wat
hij belooft.*

### En zes toetsen erbij, want de bestaande vier konden dit niet zien

Dat is geen toeval en het is het leerzaamste van deze ronde. De vier toetsen in
`tests/rls/melding-komt-aan.test.ts` waren groen en klopten, en ze bewaakten
alle vier een eigenschap van het **onderdeel** waar de belofte er een van het
**geheel** was:

- de fixture bouwde één beheerder, dus de toets die *"de escalatie blijft smal"*
  heet kón niet rood worden (regel 18, vraag 6: dit tilt *"er is er altijd
  precies één"* naar *"er kunnen er meer zijn"*, en dan staat de fout er al);
- de must-not *"het onderwerp ziet het nooit"* stond op één van de twee routes,
  en juist de andere miste de poort (vraag 2);
- de `reporter_id`-toets greep naar de **functie**, terwijl de belofte langs de
  **tabel** gebroken werd (vraag 4);
- afhandelen ↔ opzeggen en afhandelen ↔ archiveren zijn naden tussen twee
  onderdelen die elk af waren (vraag 1).

De ijking staat in de kop van dat bestand: zes mutaties, elke keer terug naar de
vorm van `0296`, zes keer precies één rode toets — en elke keer de bedoelde.

## 9. Wat hierna aan Quinten is

**Waar komt een melding over de platformbeheerder wél aan?** Na K1 nergens, en
dat is met opzet zo gelaten: het bepaalt wat een gebruiker beloofd wordt, en dat
is grens 1 van de *Beslisbevoegdheid*. Een e-mailroute, een tweede
platformbeheerder, of een expliciet *"dit kan de app niet oplossen"* zijn alle
drie verdedigbaar — maar het moet een keuze zijn en geen restant. Wat `0297` wél
doet, is het onderwerp uit de stoel van de beoordelaar halen.

## 10. Wat de poort niet kon meten, en CI wel

⚠️⚠️ **Dit is de duurste les van deze ronde, en hij gaat niet over moderatie.**
`npm run poort` gaf drie keer achter elkaar *"niets staat rood"* — met er
onmiddellijk onder: **24** controles hebben niets gemeten, en de **RLS-suite**
was er daar één van. Die suite is in een cloudsessie ongemeten omdat er geen
PostgREST draait. CI draait hem wél, tegen een schema dat uit de migratiemap
opgebouwd wordt, en 📏 vond er **vijf rode testbestanden** op `0297` — van de
189 die er staan. Beide CI-runs, dezelfde sha, dus geen flake.

**De poort deed precies zijn werk.** Hij houdt *ongemeten* en *groen* met opzet
uit elkaar en faalt op allebei; hij schreef het aantal erbij en hij noemde de
suite bij naam. De fout zit bij de lezer: ik heb "niets staat rood" gelezen als
"dit klopt". Dat is dezelfde klasse als de rij hierboven over `0296` — een
uitspraak die sterker is dan de meting eronder.

Wat CI vond, en wat `0298` ermee doet:

| toets | wat er mis was | van wie |
|---|---|---|
| `anonleesrecht` | *"een revoke heeft te ver gegrepen"* | `0297` |
| `veiligheid` | *"de melder ziet zijn eigen melding: expected [] to have a length of 1"* | `0297` |
| `indexdekking` | `reports_afgehandeld_door_fkey` zonder index (onwrikbare regel 11) | `0296` |
| `mijn-profiel-is-volledig` | `platform_beheerder` niet in de view | `0296` |
| `hulpfunctiemodel` | de drie hulpfuncties van `0297` niet in het register | `0297` (testbestand) |

⚠️⚠️ **De eerste twee zijn één fout, en het is er een van de vorm die dit project
het duurst betaalt.** `0297` repareerde K3 — *`reporter_id` was van de tabel te
lezen* — met het grofste instrument dat werkt: `revoke select on public.reports`.
Dat trok óók het leesrecht dicht van de **melder op zijn eigen melding**, een
belofte die sinds QS8-232 onder toets stond en die niemand had opgezegd.

CLAUDE.md noemt bij deze klasse drie instrumenten met zoveel woorden: *een
kolomgrant, een view met expliciete kolomlijst of een rijbeperking.* `0297` koos
geen van drieën. `0298` maakt er de kolomgrant van, zonder `reporter_id` en
zonder `afgehandeld_door` — en dat werkt omdat een policy mág verwijzen naar een
kolom die je niet mag lezen: de `using`-clausule wordt niet door de kolomgrant
beperkt.

> **Een revoke is geen reparatie tot je gemeten hebt wat hij ook dichttrekt.**

⚠️ Dat het meteen rood werd, is het bewijs dat de grendels werken en niet dat ze
overbodig waren. Wat ontbrak was dat ik ze liet draaien vóór de push in plaats
van erna.

## Aannames

- **Acceptatiecriterium 1 — "met de hand aantoonbaar gelopen" — is níet door mij
  afgetekend.** De keten is gemeten op de database (vier RLS-toetsen met echte
  rijen, op een lokaal schema op `0296`) en op de code (drie beloftetoetsen, alle
  drie geijkt). Wat er niet gemeten is, is een mens die in een browser op de knop
  drukt; dat vraagt Quinten met een account dat `platform_beheerder` draagt.
  📏 Die kolom staat vandaag op productie op `false` voor de enige rij in
  `profiles`. Dit is een aanname en geen meting.
