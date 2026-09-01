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

Beide stempels staan vast, dus het oordeel over déze voltooiing is voorgoed
geveld op het moment dat ze werd ingediend. Dezelfde gedachte als
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
