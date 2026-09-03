# Wie de uitzondering zelf kan oproepen, heeft geen regel maar een formaliteit

**Datum:** 01-09-2026
**Aanleiding:** QS8-186, de dossierrij van 17-08-2026 die voor de derde keer afging
**Raakt:** `supabase/migrations/0147_vastgelopen_is_niet_zelf_te_maken.sql`,
`tests/rls/vastgelopen.test.ts`, `scripts/kolomrechten-controle.mjs`

## 1. Dezelfde vorm, drie keer, en elke keer duurder

De rij van 17-08 beschreef een omweg: `enforce_evidence_policy` kijkt naar de
koppelstand op het moment van invoegen, en de eigenaar mag `goal_group_links`
zelf verwijderen. Drie verzoeken — koppeling weg, voltooiing erin, koppeling
terug. Hij is bewust **Laag** gebleven met de aantekening: *"dit is zelfbedrog en
geen autorisatiegrens"*, en met de voorwaarde die QS8-123 voorschrijft:

> **Wordt zwaarder als:** een beslissing op de koppelstand gaat leunen.

| Wanneer | Wat er op de koppelstand ging leunen | Gevolg |
|---|---|---|
| 22-08, migratie 0064 | het minpunt bij een gemiste week | scoregat — gedicht in 0066 |
| 28-08, migratie 0110 | `zet_streefdatum()` weigert bij een gekoppeld doel | de enige rem onder besluit A43 was weg — gedicht met `losgekoppeld_op` |
| 01-09, deze migratie | **de goedkeuring zelf** | een week goedgekeurd krijgen zonder buddy |

De voorwaarde heeft precies gedaan waarvoor ze bedoeld was. Wat ze niet deed, is
de rij van risico laten veranderen — dat gebeurde alle drie de keren pas nadat
het misging.

## 2. Wat er gemeten is

Twee routes, beide nagespeeld op een opgebouwd schema. Geen van beide is
beredeneerd.

**Route A — de toestand maken.** `vastgelopen_goedkeuringen()` (0109) noemt een
voltooiing `geen_koppeling` op grond van de koppelstand van *nu*.
`keur_vastgelopen_goedkeuringen_goed()` (0135) keurt zo'n voltooiing na de
termijn alsnog goed, mét punten. Ontkoppelen, afronden, wachten:

```
vastgelopen_reden            → geen_koppeling
keur_vastgelopen…goed(7)     → 1
weekstatus                   → approved
punten geboekt               → 2
goedkeuringen van een buddy  → 0
```

**Route B — de klok terugzetten, en die is erger.** `submitted_at` stond in de
INSERT-kolomgrant van `authenticated`, en de termijn wordt daaraan afgemeten.
Eén insert met `submitted_at = now() - 30 days` levert geen wachttijd van zeven
dagen op maar **nul**.

⚠️ **Route B staat los van route A.** Ook zonder de ontkoppeltruc bepaalde de
client hoe lang zijn eigen wachttijd was.

## 3. Waarom dit domeinregel 3 raakt

> *Peer-goedkeuring is een autorisatiegrens. Alleen een lid van dezelfde
> buddy-groep mag een voltooiing goedkeuren. Nooit jezelf.*

De auto-goedkeuring van 0135 is daar de uitzondering op, en ze is terecht: wie
geen buddy heeft, moet niet eeuwig op `pending` blijven hangen. Alle vier de
routes naar een vastloper zijn handelingen van een ánder, en iemand straffen
omdat zijn buddy vertrok, is straffen voor iets buiten zijn macht.

**Het gat was niet de uitzondering maar dat de eigenaar hem op afroep kon
oproepen.** Daarmee is "nooit jezelf" een formaliteit: je keurt niet zelf goed,
je zorgt dat niemand hoeft goed te keuren. Dat is een verschil in vorm en niet in
uitkomst.

⚠️ **Dat is de algemene les van dit document.** Bij elke uitzondering op een
regel hoort de vraag: *kan degene die de regel bindt, de toestand maken waarin de
uitzondering geldt?* Zo ja, dan is de regel weg — niet verzwakt.

## 4. Het venster hangt aan twee vaste stempels, niet aan `now()`

`zet_streefdatum()` gebruikt `losgekoppeld_op > now() - interval '7 days'`, en
daar klopt dat: de handeling die geweigerd wordt, vindt op dát moment plaats.

Hier zou diezelfde vorm een **vertraging** zijn en geen slot. De eigenaar wacht
zeven dagen en de rollover keurt alsnog goed. Daarom legt 0147 `submitted_at`
naast `losgekoppeld_op`:

```sql
and not (
  g.losgekoppeld_op is not null
  and c.submitted_at >= g.losgekoppeld_op
  and c.submitted_at <  g.losgekoppeld_op + interval '7 days'
  and not exists (select 1 from goal_group_links l where l.goal_id = g.id)
)
```

⚠️ **Die redenering is fout, en de security-review heeft hem met een meting
onderuit gehaald.** `losgekoppeld_op` staat *niet* vast: de trigger
`noteer_ontkoppeling()` zet hem bij élke ontkoppeling op `now()`. Twee verzoeken
— koppelen, ontkoppelen — schuiven hem vooruit en bevrijden een voltooiing die
deze tak net gebonden had. Het oordeel is dus niet voorgoed geveld maar één
DELETE later herzien. Wat hieronder stond als de kern van het ontwerp, was de
zwakste schakel erin. Dezelfde gedachte als
`pin_completion_cycle` (0006), het systeembericht (besluit 002 §3) en
`weekly_goals.ceiling_days` (0140): **de rij draagt de regel waaronder hij is
aangemaakt.**

⚠️ **En de eerlijke gebruiker loopt niet vast.** Wie zijn groep echt verlaat,
betaalt zeven dagen — dezelfde prijs die `zet_streefdatum()` al rekent. Een
voltooiing die in dat venster viel, blijft `pending` tot iemand hem goedkeurt;
koppel het doel terug en een buddy doet dat gewoon. Nagespeeld: na terugkoppelen
staat hij niet meer als vastgelopen. Er gaat dus niets verloren (domeinregel 6),
er wordt alleen niets weggegeven.

## 5. Een tabelrecht impliceert elke kolom, ook de kolom die je eruit haalt

De eerste versie van 0147 deed `revoke insert (submitted_at)`. Dat leek te
werken en deed niets: `completions` had `grant insert on public.completions`, en
een tabelrecht impliceert élke kolom.

```
na de kale revoke:
has_column_privilege('authenticated', …, 'submitted_at', 'INSERT') → true
```

**Dit is dezelfde familie als de `revoke ... from public, anon`-val uit
beveiligingsregel 4:** het ziet eruit als dichtgezet en is het niet. De vorm die
wél werkt is de tabelbrede grant intrekken en per kolom teruggeven — wat 0043 en
0044 voor `weekly_goals` al deden.

⚠️ **En de schrijfkant van `kolomrechten:controle` (QS8-258, gisteren gebouwd)
deed hier meteen zijn werk.** Zodra de grant versmald was, meldde hij `id` en
`attachment_url` als grant zonder schrijfpad. `id` is daarop uit de grant
gehaald; `attachment_url` bleek een halve keten en staat nu als **QS8-261** op de
lijst — een groep kan "Notitie én bijlage" instellen, en `enforce_evidence_policy()`
vraagt alleen om een notitie.

## 6. Wat hier bewust níet gerepareerd is

De oorspronkelijke bevinding van 17-08 — de **bewijseis** omzeilen met
ontkoppelen — staat er nog. Dat is een bewuste grens:

- Het is zelfbedrog. Wie zijn eigen notitie overslaat, ontneemt zijn buddy de
  kans om te reageren en levert zichzelf een lege week op.
- De reparatie zou een voltooiing kunnen wéigeren die de gebruiker te goeder
  trouw indient, en dat is een storingsmelding op een handeling die klopt.

⚠️ **Maar de rij mag geen Laag meer heten.** Drie keer is geen toeval, en de
voorwaarde die hem laag hield is drie keer ingetreden. In `ENGINEER-REVIEW.md`
staat hij nu als **Middel**, met de aantekening dat elke nieuwe beslissing die op
de koppelstand leunt, eerst deze rij leest.


## 7. Wat de review opleverde, en hoe het nu wél dicht is

**De eerste versie van dit document beschreef een reparatie die één van de zes
routes dicht deed.** De `security-reviewer` mat er vijf die openbleven en
weerlegde twee zinnen die hierboven stonden. Quinten heeft daarop besloten
(01-09) om het volledig te sluiten: **de auto-goedkeuring blijft, maar alleen als
de eigenaar de vastloper niet zélf veroorzaakte.**

| # | Route | Wie | Nu |
|---|---|---|---|
| 1 | ontkoppelen → afronden | eigenaar | dicht |
| 2 | afronden → dán ontkoppelen | eigenaar | dicht |
| 3 | koppelen + ontkoppelen (reset de stempel) | eigenaar | dicht |
| 4 | een lege eigen groep gekoppeld laten | eigenaar | dicht |
| 5 | `archiveer_groep()` op je eigen groep | eigenaar | dicht |
| 6 | je enige beoordelaar op `inactive` | eigenaar | dicht |
| 7 | `submitted_at` zelf meesturen | eigenaar | dicht (kolomgrant) |
| M1 | de buddy vertrekt uit zichzelf | ánder | **blijft werken** |
| M2 | het systeem legt de groep slapen | niemand | **blijft werken** |
| M3 | de eigenaar ontkoppelde lang geleden | eigenaar, maar oud | **blijft werken** |

### Niet de toestand maar de handeling

Dat is de hele les. De eerste versie vroeg *"is dit doel nu ontkoppeld?"* — een
stand die de eigenaar bestuurt, dus elke afgedichte route werd een nieuwe lijst
waar de volgende omheen liep. De tweede vraagt *"heeft de eigenaar zélf iets
gedaan waardoor niemand meer kan beoordelen?"* — een gebeurtenis, en die is niet
terug te draaien.

`goals.beoordelaar_weggehaald_op` wordt gestempeld door **triggers op de
tabellen** (`goal_group_links`, `groups`, `group_members`) en niet in de
functies, want ontkoppelen kan langs drie routes en slapen leggen langs twee. Dat
is de les van 0043–0046 en van 0110.

De conditie is één regel: `beoordelaar_weggehaald_op > submitted_at - 7 days`.
Handeling ná het indienen valt erin en blijft erin (elke volgende handeling
schuift de stempel alleen verder vooruit — de reset werkt nu tégen de eigenaar).
Handeling vlak vóór het indienen valt er ook in, en wachten helpt niet omdat
beide stempels ten opzichte van elkáár vastliggen. Een handeling van lang geleden
telt niet meer mee — dezelfde afkoeling van zeven dagen die `zet_streefdatum()`
sinds 0110 rekent.

⚠️ **`auth.uid()` is hier precies de goede toets, óók waar hij NULL is.**
`slaap_stille_groepen()` draait onder `service_role` zonder JWT, dus daar wordt
niets gestempeld — en dat is juist, want een groep die vanzelf inslaapt is geen
handeling van de eigenaar.

### Zichtbaar blijven is iets anders dan afgehandeld worden

⚠️ **Dit is de tweede correctie, en de testsuite heeft hem gevonden.** Een
tussenversie filterde de rij wég uit `vastgelopen_goedkeuringen()`, en toen viel
de halve suite van 0109 om. Terecht: die functie is twéé dingen — het rapport dat
élke route zichtbaar maakt (zodat route acht opvalt), én de werklijst van 0135.
Onzichtbaar maken is geen reparatie maar een tweede probleem.

De rij blijft dus staan, met een kolom `beurt_bij_eigenaar` erbij, en
`keur_vastgelopen_goedkeuringen_goed()` slaat hem over. Die functie is verder
woordelijk die van 0135 gebleven: er is één `continue` bijgekomen. Overtypen zou
een tweede lijst maken die uiteenloopt — de fout van 0032/0034.

### De derde correctie: een beurt is geen vastloper

⚠️ **De kolom heette eerst `door_eigenaar`, en die naam was te smal.** De
her-review van 02-09 vond twee routes waar de eigenaar níets deed en de
auto-goedkeuring tóch afging, allebei gemeten: een buddy die om toelichting
vroeg (`status = 'more_info'`), en een buddy die zijn goedkeuring introk.

De oorzaak is één regel: `vastgelopen_goedkeuringen()` noemt een voltooiing
vastgelopen zodra er geen actief lid meer is dat nog **niet** gestemd heeft.
`completion_approvals_one_vote` staat één stem per beoordelaar toe en
`trek_goedkeuring_in()` wist de rij niet — dus ná allebei die handelingen telt
die buddy als "heeft gestemd" terwijl hij in werkelijkheid iets terúg heeft
gevraagd. De rij viel door naar `geen_beoordelaar`, en na de termijn werd de week
`approved` met twee punten en nul geldige goedkeuringen.

**Dat is geen vastloper maar een beurt, en de beurt ligt bij de eigenaar**: de
weg vooruit is `dien_opnieuw_in()`, en die functie is van hem. Automatisch
goedkeuren beloont hier dus precies het stilzitten van degene die aan zet is.

Daarom is de kolom hernoemd naar `beurt_bij_eigenaar` en dekt hij nu twee dingen
die één ding zijn: *de eigenaar veroorzaakte het* én *de eigenaar is aan zet*.
`reden` kreeg een vierde waarde, `wacht_op_indiener`, want `geen_beoordelaar`
was in dit geval een onwaarheid — er zit wel degelijk een actieve beoordelaar in
een actieve groep.

### Wat deze migratie níet belooft

⚠️ **De conditie is een afkoeling en geen slot, en dat hoort er met zoveel
woorden te staan.** De belofte is: *geen handeling van de eigenaar levert bínnen
zeven dagen een goedgekeurde week met punten op zonder goedkeuring van een
buddy.* Wie ontkoppelt en daarna zeven dagen niets doet, valt terug op het gedrag
van 0135 — en elke volgende week van dat doel keurt weer automatisch goed.

Dat is het ontwerp: wie al een half jaar solo werkt, ís een solo-gebruiker, en
dezelfde afkoeling rekent `zet_streefdatum()` sinds 0110. Maar het is óók de
prijs van het verlaten van de peer-goedkeuring, en die prijs is zeven dagen.
**Of dat te goedkoop is, is een productbeslissing en geen bug**; hij staat als
open vraag in `docs/ENGINEER-REVIEW.md`. Een eerdere versie van deze tekst
beloofde "geen énkele handeling", en dat was te veel gezegd.

### Wat 0135's eigen tests hierover zeiden

Twee tests van 0135 legden vast dat **alle vier** de routes goedgekeurd worden,
met als onderbouwing dat het alle vier handelingen van een ánder zijn. Die
onderbouwing is weerlegd, dus die tests zijn gesplitst: de twee routes die daar
via `adminDb()` lopen (geen `auth.uid()`, dus niet de eigenaar) blijven
goedgekeurd; de twee die de eigenaar zelf doet, blijven wachten. **Dat is een
besluit dat in een test wordt vastgelegd en geen verzwakte grendel** — het staat
hier, en het staat in de kop van dat testblok.
