# Wie de uitzondering zelf kan oproepen, heeft geen regel maar een formaliteit

**Datum:** 01-09-2026
**Aanleiding:** QS8-186, de dossierrij van 17-08-2026 die voor de derde keer afging
**Raakt:** `supabase/migrations/0146_vastgelopen_is_niet_zelf_te_maken.sql`,
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
zeven dagen en de rollover keurt alsnog goed. Daarom legt 0146 `submitted_at`
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

De eerste versie van 0146 deed `revoke insert (submitted_at)`. Dat leek te
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


## 7. Wat er ná de review van dit document overblijft — 01-09-2026

**Dit document beschreef een reparatie die één van de zes routes dicht doet.** De
`security-reviewer` heeft er vijf gemeten die openblijven, en twee zinnen
weerlegd die hierboven stonden. Beide correcties staan er nu bij.

| # | Route | Wie kan dit | Gemeten uitkomst |
|---|---|---|---|
| A | ontkoppelen → afronden → wachten | eigenaar | **dicht** door 0146 |
| B | `submitted_at` terugdateren | eigenaar | **dicht** door de kolomgrant |
| 1 | afronden → dán ontkoppelen | eigenaar | open, en zónder wachttijd |
| 2 | koppelen + ontkoppelen schuift `losgekoppeld_op` | eigenaar | open |
| 3 | één link naar een zelfgemaakte lege groep laten staan | eigenaar | open |
| 4 | `archiveer_groep()` op je eigen groep | eigenaar (is admin) | open |
| 5 | je enige beoordelaar op `inactive` zetten | eigenaar (is admin) | open |

⚠️ **Route 1 is de belangrijkste, want het is de natuurlijkere volgorde.** Je
ontkoppelt pas als blijkt dat je buddy niet reageert. En omdat `submitted_at` dan
al ouder is dan de termijn, is er niet eens een wachttijd.

### Waarom een venster hier nooit gaat werken

Zolang het oordeel op de toestand van *nu* leunt, is elke afgedichte route een
nieuwe lijst waar de volgende omheen loopt. Dat is dezelfde fout in het klein die
§3 in het groot beschrijft.

**De vorm die wel houdt is een stempel op de voltooiingsrij bij het indienen** —
dezelfde beweging als `completion_approval_rules`, dat de goedkeuringsdrempel al
bevriest. Wat er daarna met de groep gebeurt, doet er dan niet meer toe.

### Maar dat lost route 4 en 5 niet op, en daar zit een productvraag onder

Bij route 4 en 5 ís er een beoordelaar op het moment van indienen; de eigenaar
haalt hem daarna weg. Een stempel bij indienen zegt dan "beoordeelbaar", de
huidige toestand zegt "niemand meer", en de auto-goedkeuring vuurt alsnog.

Het onderscheid dat overblijft is **wie de beoordelaar heeft weggehaald**. Dat
staat in `group_events` (`actor_id`), dus het is meetbaar — maar het maakt de
regel een stuk zwaarder, en het raakt een vraag die niet technisch is:

> **Wat belooft de app iemand wiens énige buddy vertrekt?**

QS8-178 beantwoordde dat op 31-08 met: *die week wordt alsnog goedgekeurd, niet
als gemist geboekt* — met als onderbouwing dat alle routes handelingen van een
ánder zijn. **Die onderbouwing is nu weerlegd**: in de standaardopstelling, waar
de eigenaar zijn eigen groep heeft aangemaakt, zijn drie van de vier routes
handelingen van hemzelf.

Dat besluit hoort daarom opnieuw gewogen te worden, en dat is grens 1 uit
CLAUDE.md: het bepaalt wat er tegen een gebruiker beloofd wordt over zijn score.
Het ligt bij Quinten en niet bij deze sessie.
