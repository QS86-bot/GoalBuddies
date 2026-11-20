# Een teamstraf blijft in het team

**Datum:** 18-11-2026 · **Issue:** QS8-660 (epic QS8-650), het scherm in QS8-698 ·
**Migratie:** `0325` (gebouwd als `0305`, hernummerd op 20-11-2026) ·
**Bouwt voort op:** QS8-656 (`0323`) ·
**Besluiten:** 12 en 29 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`, en de
ontwerpronde met Quinten van 18-11-2026 (grens 1)

## De ontwerpronde

Het issue vroeg eerst een korte ontwerpronde, omdat het raakt wat een mens beloofd
wordt. Quinten koos op 18-11-2026 (vastgelegd als reactie op QS8-660):

1. **Bij verschuldigd zien collega's de naam en de straftekst**, zoals bij elke
   begunstigde groep.
2. **De bevestiging krijgt een eigen zin voor teams.**
3. **Een teamgroep is alleen begunstigde of getuige van een aandeel**, en een
   afspraak op een aandeel heeft alleen het eigen team of een teamgenoot als getuige.
4. **Een teamgenoot mag persoonlijk getuige zijn.**

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| de grens | trigger `commitments_teamstraf` (`bewaak_teamstraf()`), op insert en op een wijziging van doel of begunstigde, ook voor `service_role` |
| de melding | weigering met `hint = 'teamstraf'`; `zetStraf()` herkent die via `TEAMSTRAF_HINT` en toont `commitment.fout.teamstraf` |
| zichtbaarheid | ongewijzigd: `commitment_zichtbaar_voor_groep()` blijft `unlocked`, `due`, `resolved` |

## Keuzes die hier gemaakt zijn

**1. Een eigen trigger naast `bewaak_begunstigde()`.** Twee herdefinities van één
functielichaam verliezen stil elkaars register (QS8-358).

**2. Een niet-eigenaar krijgt de melding van de policy, woordelijk.** Zo leert een
vreemde niet dat een doel een aandeel is. Zwijgen kan niet: dat opent de grendel voor
een definer-context (securityreview QS8-654, M1).

**3. Herkend aan de `hint` en niet aan de zin.** Een andere formulering in de database
breekt de uitleg in de app dan niet stil. De RLS-test legt de constante uit de app naast
wat de database teruggeeft.

**4. Het scherm wacht op de types.** `src/lib/database.types.ts` komt uit productie en
kent `team_goal_shares` en `groups.organization_id` pas na de uitrol. Handmatig
bijwerken mag niet, en een cast in de app-code staat nergens in dit project. De eigen
bevestigingszin en het filteren van de keuzelijst zijn daarom QS8-698. Tot die er is
weigert de database een verkeerde keuze, en legt de app uit waarom. Dat faalt dicht:
er komt nooit een straf bij de verkeerde getuige terecht.

## Domeinregel 7

Rij 48 in `docs/decisions/002-domeinregel7-oppervlakken.md`. Dit is de bewuste
uitzondering: een straf die de gebruiker zelf vooraf instelde en bevestigde, gelezen
door collega's zodra hij verschuldigd is. Wat níet lekt:
- het aandeel zelf (0321);
- de straftekst in de chat;
- de inhoud via `straffen_bij_uitstelverzoek()` (alleen `goal_id`).

## Wat de securityreview vond, en wat Quinten besloot

- **M1, hersteld (besluit van Quinten):** de grens gold alleen bij het schrijven. Een
  getuige die het team verliet maar nog een vriendengroep met de eigenaar deelde, las
  de straf toch. Voor een aandeel eisen nu alle vier de leesroutes dat lezer én
  eigenaar actief in het team zitten, via `straf_teamband_klopt()`:
  `commitments_select`, `getuigenissen()`, `getuigenissen_voor()` en
  `teruggedraaide_straffen_voor()`. Dat geldt ook andersom: vertrekt de eigenaar, dan
  leest het team zijn straf op het aandeel niet meer.
- **M2, hersteld (besluit van Quinten):** de persoonlijke getuige van een privédoel
  moet een groep zonder organisatie met de eigenaar delen.
- **M3 (besluit van Quinten):** de eigen bevestigingszin wacht op QS8-698. Tot dan
  noemt de algemene zin het team bij naam.
- **L1, hersteld:** de eigenaar kon aftasten of een vreemde groeps-uuid een teamgroep
  is. Wie geen lid is van de gekozen groep, krijgt nu de melding van de policy.
- **L2, hersteld:** `herstel_stuurloze_straf()` met een getuige buiten het team gaf een
  ruwe fout. `herstel()` herkent nu de hint.
- **L3, open:** een nieuw teamlid leest verschuldigde straffen van vóór zijn
  lidmaatschap, net als in elke groep. Wordt zwaarder als: teamgroepen vaak van
  samenstelling wisselen.
- **Vóór de uitrol:** de migratie toetst geen bestaande rijen. In productie bestaan
  nog geen aandelen of teamgroepen, dus er kan geen rij zijn die 0325 zou weigeren.
  Controleer dat bij het landen met een `select` op `commitments` join
  `team_goal_shares`, en op een teamgroep als begunstigde van een gewoon doel.

## Wat getest is

`tests/rls/teamstraf.test.ts`: 11 tests via PostgREST.
- **Geweigerd:** een vriendengroep of vriend op een aandeel, het team op een gewoon
  doel, en dezelfde fout via `service_role`.
- **Geen orakel:** een vreemde krijgt hetzelfde antwoord als bij een gewoon doel.
- **Toegestaan, ter controle:** het team en een teamgenoot op een aandeel, en een
  vriendengroep op een gewoon doel.
- **Leesbaarheid:** de straf is pas leesbaar bij verschuldigd, met tekst. Het aandeel
  blijft dicht, en de chat noemt de tekst niet.
- M1 op drie leesroutes (direct, `getuigenissen()`, `getuigenissen_voor()`), M2 en L1.
- Negen mutaties met de hand.

## Bij het hernummeren: de naad met de weekbelofte (20-11-2026)

Na de basis van deze tak kwam op `main` de weekbelofte (0312–0314, QS8-758 tot en
met QS8-760): een `penalty` met `periode_start` en een begunstigde groep. Ook die
rij gaat langs `bewaak_teamstraf()`. Een belofte op een aandeel heeft dus alleen
de eigen teamgroep als begunstigde, en een teamgroep is nooit begunstigde van
een belofte op een privédoel.

⚠️ **Besluit van Quinten, 20-11-2026 (~12:20 UTC, vraag V8; grens 1), op een
bevinding (Hoog) van de security-ronde op de naad.** Besluit 29 nam het
schaamtemoment aan voor één straf op een streefdatum. Een weekbelofte kan elke
week verschuldigd worden, en dan zou het team (waar een leidinggevende in kan
zitten) wekelijks zien dat iemand zijn week niet haalde, met de straftekst erbij.
**Daarom: een weekbelofte op een aandeel heeft alleen een teamgenoot als
persoonlijke getuige, nooit de teamgroep.** Gebouwd als tak 1b in
`bewaak_teamstraf()`, ook voor `service_role`. 📏 Gemeten op een lokale database
(t/m 0325):
- de weekbelofte met de teamgroep wordt geweigerd (`teamstraf`);
- de gewone straf met de teamgroep mag;
- de weekbelofte met een teamgenoot mag;
- zonder tak 1b wordt de eerste ingevoegd.

De toets staat in `tests/rls/teamstraf.test.ts`.

⚠️ **Wat de app hier niet doet:** de keuzelijst van `fetchBelofteBegunstigden()`
biedt de teamgroep bij een aandeel nog aan, en de weigering toont de algemene
zin `commitment.fout.teamstraf`. Dat is een schermkeuze, en die hoort bij
QS8-698 (de eigen bevestigingszin voor teams en de gefilterde keuzelijst).

⚠️ **Besluit V11 van Quinten (zelfde moment), op een bevinding (Middel):**
`meld_commitment()` plaatste `commitment_due` in de begunstigde teamgroep, ook als
de eigenaar het team al verlaten had. Nu niet meer: het lichaam is woordelijk dat
van 0213, plus de regel `and straf_teamband_klopt(new.goal_id, v_owner_id)`.
📏 Gemeten:
- met de eigenaar nog in het team: één bericht;
- na zijn vertrek: nul;
- zonder die regel: na zijn vertrek één.

Toets in `tests/rls/teamstraf.test.ts`.

In de app herkent `gaWeekbelofteAan()` in `src/modules/commitments/api.ts` de
weigering nu ook aan `TEAMSTRAF_HINT`, net als `zetStraf()` en `herstel()`. Zonder
dat ging hij als storing naar Sentry, met de algemene zin. `commitments_select`,
`getuigenissen()`, `getuigenissen_voor()` en `teruggedraaide_straffen_voor()`
veranderden op `main` niet na de basis, op één `alter policy` na: 0254 §7
wikkelde de twee standenlijsten in `commitments_select` in een `select`. Die
wikkel is bij het hernummeren in 0325 hersteld. 📏 De andere drie functies
hebben hun laatste definitie in 0183, 0178 en 0293.

## Het pad terug

Zie de kop van de migratie: alleen een weigering, geen gegevens.
