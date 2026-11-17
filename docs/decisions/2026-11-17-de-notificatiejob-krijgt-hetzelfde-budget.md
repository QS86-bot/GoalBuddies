# De notificatiejob krijgt hetzelfde budget als de rollover

**Datum:** 17-11-2026 · **Issue:** QS8-688 · **Status:** gebouwd, nog niet gedeployd ·
**Bouwt voort op:** QS8-685 (`verwerkBinnenBudget()`), zie
`docs/decisions/2026-11-17-de-rollover-krijgt-een-budget-en-geen-muur.md`

## Aanleiding

De uurjob `notificaties` liep zijn profielen één voor één af. Per profiel haalt hij
eerst de push-tokens op en loopt dan vijf soorten meldingen door. De looptijd groeide
dus lineair met het aantal gebruikers. Daardoor botste hij op dezelfde twee grenzen
als de rollover: de curl-timeout van 120 s in `.github/workflows/notificaties.yml` en
de wandkloklimiet van de Edge Function.

## Wat er gemeten is (productie, alleen gelezen, 17-11-2026)

| meting | waarde | bron |
| --- | --- | --- |
| run 16-11 20:35 | 795× `push_tokens`, eindigt 20:38:54 met `Http: connection closed before message completed`, daarna `shutdown` | issue, `function_logs` |
| run 17-11 04:02 | 1.200× `push_tokens`, `shutdown` om 04:05:15 (≈ 194 s) | issue, `function_logs` |
| profielen | **1.332** | `count(*)` |
| push-tokens | **44**, van **16** gebruikers | `push_tokens` |
| unieke indexen op `notifications_sent` | `notifications_sent_per_dag` en `notifications_sent_per_onderwerp`, zoals in 0053 | `pg_indexes` |

## Hoe de job dubbel versturen voorkomt

Het issue vroeg dit als eerste, en terecht. Een dubbele rollover is onschadelijk,
maar een herinnering die twee keer op iemands telefoon verschijnt niet. Er zijn twee
lagen, en maar één ervan is een rem:

1. **`alVerstuurd()`** vraagt vooraf of er al een rij in `notifications_sent` staat.
   Dat is een besparing en geen rem: twee runs die tegelijk vragen, krijgen allebei
   "nee".
2. **De rij wordt vóór het versturen geschreven** (`stuur()`), en de twee partiële
   unieke indexen uit 0053 weigeren een tweede rij met `23505`. Wie verliest,
   verstuurt niets. Dát is de rem.

Elke melding gaat naar de eigenaar van het profiel dat onderhanden is, en beide
indexen beginnen met `user_id`. Twee profielen die tegelijk lopen, raken elkaars
rijen dus nooit. Komt hetzelfde profiel twee keer langs, door een verschuiving
tussen twee pagina's of een tweede run die overlapt, dan houdt de index de tweede
push tegen.

📏 De test op de naad
(`tests/beloftes/notificaties-binnen-de-wandklok.test.ts`) laat twee runs met
**dezelfde** startplek tegelijk lopen, zodat ze op hetzelfde moment bij hetzelfde
profiel zijn. Elke melding komt één keer aan. Wordt de rem weggehaald (bij een fout
op de insert tóch versturen), dan wordt die toets rood. ⚠️ Met twee *willekeurige*
startplekken bleef hij bij die mutatie groen, omdat de tweede run dan meestal pas
langskomt als de rij er al staat. Ook dat is gemeten. Daarom staat de startplek in
die toets vast.

## Besluit

Dezelfde vorm als de rollover (QS8-685), met dezelfde getallen:

1. **Acht profielen tegelijk** (`PROFIELEN_TEGELIJK = 8`). Binnen één profiel blijven
   de vijf soorten ná elkaar; `meldEenProfiel()` is ongewijzigd. De rollover draait
   een half uur ernaast, dus de twee jobs leggen niet tegelijk acht verzoeken bij
   PostgREST neer.
2. **Een tijdbudget** (`PROFIELBUDGET_MS = 100_000`). Na 100 s begint er geen nieuw
   profiel meer. Wat loopt, maakt zijn vijf soorten af. Vijftig seconden marge dekt
   ook een profiel dat op twee externe verzoeken wacht (Expo en web push, elk met
   een timeout van 15 s).
3. **Een willekeurige startplek**: eerst `id >= scharnier`, dan `id < scharnier`.
4. **`volledig` in de uitvoer, en de workflow wordt rood op `false`.** Sentry krijgt
   `notificaties_profielbudget_op`.
5. **De curl-timeout naar 240 s**, boven de gedocumenteerde 150 s en boven alle
   gemeten afkappingen (162, 192 en ≈ 194 s).

## Wat een budget hier kost dat het bij de rollover niet kost

Een profiel dat de rollover dit uur mist, wordt volgend uur afgesloten; de week
verandert er niet door. Bij een melding ligt dat anders. De nudge hangt aan het uur
dat de gebruiker koos (`nudgeBesluit()`). Komt zijn profiel in dát uur niet aan de
beurt, dan krijgt hij die dag geen herinnering. Goedkeuringsverzoeken en de andere
soorten komen wel een uur later. Daarom is `volledig: false` hier rood en geen
waarschuwing.

Met de aanname van de rollover (≈ 0,45 s per profiel één tegelijk, lineair bij acht)
komt de grens bij ≈ 1.780 profielen per run. 📏 Deze job deed ≈ 194 s over 1.200
profielen, dus ≈ 0,16 s per profiel. Dat is sneller, omdat de meeste profielen geen
token hebben en na één verzoek klaar zijn. Onder dezelfde aanname ligt de grens dan
bij ≈ 5.000 profielen. Dat is een schatting en geen meting.

## Aannames — niet gemeten

* **Dat acht tegelijk lineair schaalt.** Zelfde aanname en zelfde meetpunt als bij
  de rollover: de eerste run na de deploy, met `profielen`, `volledig` en de looptijd
  uit de uitvoer en `edge_logs`. Dat is acceptatiecriterium 1, en het wacht op de
  deploy.
* **Dat Expo acht verzoeken tegelijk verdraagt.** Vandaag hebben 16 gebruikers een
  token, dus er gaan er zelden acht tegelijk naar Expo.
* **Welk deel van de profielen in de afgekapte runs geen melding kreeg.** Niet
  nagegaan. De runs begonnen vooraan in `order('id')`, dus het waren steeds dezelfde
  profielen achteraan.

## Het risico dat blijft

**De heldenstem wordt vóór de rem geschreven.** `metHeldenstem()` schrijft een rij
in `hero_appearances` als onderdeel van het bericht, ná de poort maar vóór de insert
in `notifications_sent` (QS8-475). Verliest een run de race op de index, dan
verstuurt hij niets, maar staat de verschijning er wel. De dagregel van de held is
dan opgebruikt door een bericht dat van een andere run kwam. Dat kon al voor dit
issue. Nu kan het ook binnen één run, maar alleen als een profiel dubbel langskomt
door een paginaverschuiving. Gevolg: hooguit een held die die dag niet meer spreekt.
Geen dubbele push.

## Wat afgewezen of uitgesteld is

* **Alleen profielen met een token ophalen.** Dat brengt de lus van 1.332 naar 16
  profielen, en elk profiel zonder token stopt nu toch al na `apparatenVan()`. Er is
  geen migratie voor nodig: `push_tokens.user_id` verwijst naar `profiles(id)` (0053),
  dus PostgREST kan met `push_tokens!inner(...)` filteren. Het is uitgesteld omdat
  het de telling `zonderToken` en de betekenis van `profielen` in de uitvoer
  verandert, en omdat het issue om de vorm van QS8-685 vroeg. Dit is de echte
  reparatie, net als QS8-687 voor de rollover. Vervolgissue: QS8-691.
* **Een cursor in de database** in plaats van een willekeurige startplek. Strenger,
  maar het vraagt een tabel.

## Terzijde: web push faalt bij versleutelen

📏 In `function_logs` van 15-11 11:00 tot 17-11 11:00 UTC staan **6×** `invalid P-256
elliptic curve point` en **5×** `Unexpected error decoding private key`. Alle elf
vallen in de run van 16-11 20:35. Niet in dit issue opgelost; vervolgissue QS8-690.

## Het pad terug

`PROFIELBUDGET_MS = Infinity` en `PROFIELEN_TEGELIJK = 1` geven het oude gedrag, op de
startplek na. Zet de workflow terug op `--max-time 120` en haal de `volledig`-toets
weg. Er is geen migratie, dus er valt niets in de database terug te draaien.
