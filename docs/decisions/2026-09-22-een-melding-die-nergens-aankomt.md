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

Wie meldde is niet nodig om te beoordelen, en weglaten beschermt de melder tegen
een beheerder die het hem betaald zet. Zelfde vorm en zelfde reden als
`getuigenissen()` (`0169`) en `straffen_bij_uitstelverzoek()` (`0218`).

### 2. Twee routes, en de tweede is smal

| route | wie | wanneer |
|---|---|---|
| a | beheerder van de groep | en niet zelf het onderwerp |
| b | platformbeheerder | **en** het onderwerp is beheerder van díé groep |

⚠️ **De escalatie is geen moderatiedienst.** Route (b) geeft uitsluitend de
gevallen die route (a) per definitie niet kán afhandelen. Zou de
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

## Aannames

- **Acceptatiecriterium 1 — "met de hand aantoonbaar gelopen" — is níet door mij
  afgetekend.** De keten is gemeten op de database (vier RLS-toetsen met echte
  rijen, op een lokaal schema op `0296`) en op de code (drie beloftetoetsen, alle
  drie geijkt). Wat er niet gemeten is, is een mens die in een browser op de knop
  drukt; dat vraagt Quinten met een account dat `platform_beheerder` draagt.
  📏 Die kolom staat vandaag op productie op `false` voor de enige rij in
  `profiles`. Dit is een aanname en geen meting.
