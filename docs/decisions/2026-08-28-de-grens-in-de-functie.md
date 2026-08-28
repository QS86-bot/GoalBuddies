# `te_beoordelen_voor()` is een autorisatiegrens, en die had geen inhoudelijke test

**Datum:** 28-08-2026
**Raakt:** `tests/rls/beoordelingsgrens.test.ts` (nieuw)
**Geen migratie.** De functie is niet veranderd — er is gemeten dat hij klopt, en
er is een net onder gehangen.

## De aanleiding

Bevinding 2 van de controleronde van 28-08: de meldingenjob roept
`te_beoordelen_voor()` aan als `service_role`, dus RLS kijkt daar niet mee en de
functie **ís** de grens. De enige test die erop stond — *"is niet aanroepbaar door
een gewone gebruiker"* — bewaakt de grant en niet de inhoud. De groepsjoin met de
hand losknippen liet de héle RLS-suite groen: 558 van 558.

Dat is regel 18, vraag 3, met het antwoord ja.

## Waarom de functie de grens is en niet RLS

Dat is een bewuste keuze en staat zo in `supabase/functions/notificaties/index.ts`:
`openstaande_beoordelingen()` is géén `SECURITY DEFINER` en leunt op de RLS van de
aanroeper. Onder de service-rol zou die élke openstaande voltooiing in het hele
project teruggeven, en een melding daarop is iedereen een bericht sturen over de
week van een wildvreemde.

Wat er dan overblijft is dit: elke rij die deze functie teruggeeft, zegt *deze
persoon heeft zijn week nog niet rond*. Dat is domeinregel 7 in zijn kortste vorm.

## Wat er nu onder hangt

Tien tests in `tests/rls/beoordelingsgrens.test.ts`, allemaal via `adminDb()` —
dus als `service_role`, precies de rol waaronder de job hem aanroept. De
grant-toets blijft staan waar hij stond, in `notificaties.test.ts`.

De zeven clausules van de functie zijn stuk voor stuk met de hand losgeknipt op de
lokale stack, en dit is wat er dan rood wordt:

| Clausule | Wat hij belooft | Rood |
|---|---|---|
| `join group_members` | alleen uit een groep waar je zelf in zit | **6** |
| `m.status = 'active'` | een lid dat niet actief is, hoort niets | 1 |
| `g.owner_id <> p_user_id` | nooit je eigen week op je lijstje | 1 |
| `gr.status = 'active'` | een gearchiveerde groep zwijgt | 1 |
| `w.status = 'pending'` | alleen weken die nog open staan | 2 |
| `c.superseded_by is null` | een vervangen voltooiing telt niet mee | 1 |
| `not exists (approvals)` | niet wat jíj al beoordeeld hebt | 6 |

Vóór dit bestand was elk van die zeven nul.

## Drie dingen die het schrijven van deze tests opleverde

**1. De `not exists`-clausule geldt per beoordelaar, en dat is alleen zichtbaar
bij een drempel boven één.** De eerste versie toetste hem op een groep met de
standaardregel `approval_rule = 'any'`. Daar zet de eerste goedkeuring de wéék op
`approved`, en dan valt de rij bij iedereen weg — om een ándere clausule. De test
was rood terwijl de functie klopte. Had ik hem "gerepareerd" door de assertie om
te draaien, dan stond er een test die het tegenovergestelde bewaakte van wat de
quorumregel nodig heeft. Er staan nu twee tests: één op een groep met
`approval_rule = 'quorum'` en `approval_quorum = 2`, en één die vastlegt dat de
standaardregel de week wél voor iedereen sluit.

⚠️ De regel wordt bij het indienen bevroren in `completion_approval_rules` (0111),
dus in de fixture moet hij staan vóór de voltooiing.

**2. De vertrektest dekte `m.status = 'active'` niet, en dat was niet te zien.**
`verlaat_groep()` (0102) **verwijdert** de rij in plaats van hem op `inactive` te
zetten, dus de clausule kwam er niet aan te pas: hem met de hand weghalen liet
alle acht tests groen, de vertrektest incluis. Twee correcte tests naast elkaar,
en de clausule ertussenin van niemand.

⚠️ **En de toestand is wél bereikbaar, dus dit is geen hypothetische toets.**
Nagemeten: `authenticated` heeft een kolomgrant op `group_members.status`, de
policy `group_members_update` laat `is_group_admin(group_id)` door, en
`guard_group_member_update()` (0029) pint voor een beheerder alleen `group_id` en
`user_id` vast — `status` niet. **Een beheerder kan een lid dus vandaag op
`paused` zetten.** De test zet de status daarom rechtstreeks, en dat is dezelfde
weg als die een beheerder in de app zou nemen.

**3. `c.superseded_by is null` was als enige van de zeven ongedekt** nadat de
andere zes stonden. `dien_opnieuw_in()` zet `superseded_by` op de oude rij en maakt
een nieuwe; zonder de clausule staan ze er allebei, en dan krijgt de beoordelaar
twee meldingen over dezelfde week en kan hij de versie bevestigen die de eigenaar
juist introk.

## Wat er bewust níét is gebeurd

De functie is niet aangepast. Alle zeven clausules doen wat ze beloven — dat is nu
gemeten en niet aangenomen.

Er is wél één ding dat opviel en dat een rij in het reviewdossier krijgt in plaats
van een reparatie: **de functie toetst het lidmaatschap van de beoordelaar en
nergens dat van de eigenaar.** Bij vertrek maakt dat niets uit — `verlaat_groep()`
ontkoppelt de doelen van de vertrekker uit déze groep, en dat is nagelezen in de
migratie. Maar een beheerder die een lid op `paused` zet, ontkoppelt niets: de
koppeling blijft staan en de pauzerende eigenaar zijn openstaande week blijft op
het lijstje van de anderen. Of dat fout is, hangt ervan af wat "gepauzeerd"
straks moet betekenen — vandaag is er geen knop die het doet en dus ook geen
belofte om te breken. Dat is een ontwerpvraag en geen defect.
