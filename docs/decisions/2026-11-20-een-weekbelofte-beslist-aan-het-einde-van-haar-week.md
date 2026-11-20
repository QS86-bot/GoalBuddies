# Een weekbelofte beslist aan het einde van haar week — QS8-759

**Datum:** 20-11-2026 · **Issue:** QS8-759 (x.2 van de poort QS8-744) · **Migratie:** 0313 (niet op productie; wacht op
Quintens "backup gedaan") · **Raakt:** domeinregel 5, 7, 10 en 11, Beslisbevoegdheid grens 1

Dit document vult `docs/decisions/2026-11-20-de-belofte-is-een-commitment-met-een-getuige.md` aan. Daar staat het
besluit. Hier staat wat de bouw van x.2 erbij moest kiezen, wat er gemeten is dat het issue tegensprak, en welke
uitwegen er openstaan.

## Wat er gebouwd is

- `beslis_weekbeloftes(owner, moment)`: beslist de rijpe beloftes van één eigenaar. Security invoker, uitvoerbaar
  voor niemand dan de eigenaar `postgres`. Zo kan de suite het moment vastzetten (de DST-wissel), en kan geen client
  of `service_role` een klok meegeven. Dat is de vorm die 0294 wegnam (`p_vandaag`).
- `maak_straffen_verschuldigd(uuid)` roept hem aan met `now()`. Zelfde handtekening, dus de rollover hoeft niet
  opnieuw gedeployd te worden.
- `wikkel_commitments_af()`: de doelstraf meet nog aan `target_date`; een belofte wordt gehouden als het doel binnen
  haar week wordt afgerond.
- `zet_week_startdag()` weigert met `weekbelofte_loopt` zolang er een belofte op `set` staat. De client toont daar
  een eigen melding in plaats van een Sentry-fout.
- `CLAUDE.md`, domeinregel 11, kreeg de benoemde verruiming.

## De beslisregel

Een belofte op `set` is **rijp** als:

1. de dag in haar bevroren `tz` op of na `periode_einde` ligt;
2. ze ouder is dan 24 uur (hetzelfde venster als de doelstraf, 0171);
3. er in haar week geen weekdoel meer op `todo` of `cancelled` staat.

Een rijpe belofte is **gebroken** als er in haar week een weekdoel op `missed` staat zonder bestede weekpas voor die
cyclus, en niets op `approved` of `pending`. Dan wordt ze `due`. Anders is ze **gehouden** en wordt ze `cancelled` met
`actor_id null`. Geen bericht en geen push: `meld_commitment()` spreekt alleen bij `due`, en `getuigenissen_voor()`
heeft een gate op `due` (0293).

## Wat gemeten is, en twee dingen spraken het issue tegen

📏 Op de lokale stack, stand 0312, met `pg_get_functiondef()`:

- **Een weekpas zet de week niet op `excused`.** `verbruik_weekpas()` laat het weekdoel op `missed` staan en schrijft
  een `week_pass_events`-rij met `event = 'spent'`. Het issue had uit een comment van 0159 gelezen dat het `excused`
  werd. De toets is dus de bestede pas, niet de status.
- **Een zelf afgesloten weekdoel (`cancelled`) is nog niet beslist.** De rollover pakt `todo` én `cancelled` en zet
  ze bij het verstrijken op `missed` (A40, 0045). Wie alleen op `todo` wacht, leest een zelf opgegeven week in de run
  waarin de week sluit als gehouden. 📏 Met `cancelled` uit de lijst gehaald vallen twee toetsen om.
- De rollover roept `maak_straffen_verschuldigd()` aan vóór `sluitVerstrekenWekenAf()` (`verwerkProfiel()` in
  `supabase/functions/rollover/index.ts`). Een belofte beslist dus één run na het sluiten van de week (criterium 5).

## Wat hier besloten is

### Afronden binnen de week telt als gehouden

Quinten vroeg in de reactie op het issue om dit uitdrukkelijk te besluiten. Vóór 0313 annuleerde
`wikkel_commitments_af()` elke straf op `set` bij op tijd afronden, gemeten aan `goals.target_date`. Dat is de klok
van het doel en niet die van de belofte.

**Besluit:** wie het doel afrondt binnen de week van de belofte (de dag in haar bevroren `tz` vóór `periode_einde`),
heeft haar gehouden. Na de week niet meer: dan staat de uitkomst al vast in de weekdoelen. Zonder die grens kon je een
gebroken week nog wegwerken door het doel af te ronden vóór de volgende rollover-run.

*Waarom de milde kant:* afronden laat al een doelstraf vervallen (besluit 21-08-2026). Een belofte strenger
behandelen dan de straf op het hele doel zou de enige plek zijn waar afronden je iets kost.

⚠️ **De prijs.** `rond_doel_af()` eist alleen dat er geen mijlpaal meer op `todo` staat. Mijlpalen kun je laten
vallen. Wie dat doet en het doel afrondt, ontloopt binnen de week zijn belofte, maar is dan ook zijn doel kwijt.
Dezelfde uitweg bestaat sinds 21-08 voor de doelstraf.

### Eén gehaald weekdoel laat de week tellen

Met twee weekdoelen in één week, het ene `approved` en het andere `missed`, is de belofte gehouden. Dat is de regel
van de reeks (A37, `herbereken_reeks()`) en van `verbruik_weekpas()`, die in zo'n week geen pas besteedt. Zonder die
regel was zo'n week voor de belofte gebroken en voor de reeks niet. Dat is de milde kant.

### `pending` telt als gehouden

Dat staat zo in het issue. ⚠️ De security-ronde vond dat `pending` náást een gemist weekdoel de belofte toch
`due` maakte, terwijl een goedkeuring een uur later de week voor de reeks liet tellen. Een `due` is niet terug te
draaien en plaatst een bericht in de groep. Daarom telt `pending` nu net als `approved`: de week kan nog tellen. De
rollover laat `pending` staan. Als `pending` de belofte zou tegenhouden, kon een trage
buddy haar eindeloos op `set` houden, en dan blokkeerde de unieke index van 0312 ook de volgende belofte.

## Wat bij Quinten ligt

⚠️⚠️ **`carried` is een gemiste week, en dat wist de poort niet.** 📏 `schuif_weekdoel_door()` (0185) zet alleen een
`missed`-rij op `carried`, en `herbereken_reeks()` telt `carried` als gemist (0216). Tussen de run die de week sluit
en de run die beslist, kan de eigenaar elke gemiste week doorschuiven. Dan is de belofte gehouden. Elke gebroken
belofte is zo te ontlopen, binnen het uur tussen twee runs.

De poort noemde `carried` een uitweg die "conservatief openblijft", maar ging ervan uit dat het een andere status was
dan gemist. Het strenger maken valt onder grens 1: het verandert wat de gebruiker als gevolg beloofd is. Daarom is
het gebouwd zoals het getekend is, en ligt de vraag op QS8-759. Strenger maken is één regel in
`beslis_weekbeloftes()` (`'missed'` wordt `in ('missed', 'carried')`) plus het omdraaien van één toets.

⚠️⚠️ **En `carried` is niet de enige: het venster na de week is breder** (security-ronde, gemeten). Tussen het
sluiten van de week en de beslissende run ziet de eigenaar zijn gemiste week en kan hij nog: de belofte intrekken
(besloten: *intrekbaar tot verschuldigd*, en dat geldt ook ná het einde van de week), er met terugwerkende kracht een
adempauze over leggen (`excused`), of achteraf een weekdoel in die week zetten dat een buddy goedkeurt. De laatste
drie landen als *gehouden* met `actor_id null`, niet als intrekking. Twee mogelijke reparaties, allebei grens 1:
intrekken alleen vóór `periode_einde`, en de beslissing nemen op de stand van het sluiten (in dezelfde run ná
`sluitVerstrekenWekenAf()`, of de uitslag per cyclus vastleggen). **Moet besloten zijn vóór x.3 (QS8-760) een client
beloftes laat aangaan.**

De andere uitwegen uit punt 2 van de poort blijven zoals ze getekend zijn: een adempauze met terugwerkende kracht
vóór de beslissende run, een weekdoel verwijderen, en een week zonder weekdoel.

## Wat ongemeten blijft, als aanname

- **Een verhuizing naar het westen stelt de beslissing uit.** De datumgrens ligt vast in de bevroren `tz`, maar de
  rollover sluit de week op de klok van het profiel. Van Kiritimati naar Honolulu schuift het sluiten één dag op. In
  die dag kan de eigenaar zijn weekdoel nog afronden. Dat is uitstel en geen ontsnapping: de week zelf heeft dezelfde
  dag speling, los van de belofte. Criterium 2 geldt dus voor de datumgrens en niet voor het moment waarop de week
  sluit. De suite legt beide vast.
- **Gehouden en ingetrokken verschillen in het spoor alleen in de actor**: `null` bij gehouden, de eigenaar bij
  intrekken. Afronden binnen de week schrijft de eigenaar als actor, met doelstatus `completed` in de payload. Een
  extra `edited`-rij met een reden zou het scherpen, maar het scherm toont `edited` als "bewerkt". Dat is niet gedaan.
- **Een rollover die halverwege een week afbreekt**, na `missed` en vóór `verbruik_weekpas()`, laat een week achter
  die volgens de beslissing gebroken is terwijl er een pas klaarlag. De volgende run besteedt die pas niet meer. Dat
  geldt ook zonder belofte, voor de reeks.
- **Wat een afgewezen `pending` met het weekdoel doet**, is niet gemeten. Wordt het daarna alsnog `missed`, dan blijft
  de belofte `cancelled`. Dat is de milde kant.
- **`profiles.tz = 'Factory'` laat de rollover een profiel overslaan** (security-ronde; bestond al). `bewaak_tijdzone()`
  laat het door, en `Intl` weigert het, dus `afsluitbareCyclus()` geeft `null`: geen beslissing, geen doelstraf, geen
  minpunt. Lokaal in Node gemeten, niet in de Edge-runtime. Apart issue (QS8-763), want het raakt alles wat de rollover doet.
- **De rollover draait minstens één keer per dag.** Draait hij een dag niet, dan komt het bericht een dag later.

## Ijking

Elke grendel is apart met de hand gebroken op de lokale stack. Steeds viel de toets om die de grendel noemt. Het
overzicht staat in het PR-verslag.

## ER-rij

`ER-rij:` zie het PR-verslag. De rijen over `carried`, de verhuizing naar het westen en het spoor staan in
`docs/ENGINEER-REVIEW.md`.
