# De getuige blijft de getuige — geen schrijfweg naar `beneficiary_user_id` (QS8-312)

**Datum:** 07-09-2026
**Status:** besloten — er wordt niets opengezet
**Aanleiding:** vervolgvraag uit criterium 3 van QS8-306, scherper geworden met 0183

## De vraag

0183 laat het oppervlak van de persoon-getuige de groepsband volgen: verlaat de
getuige de groep, dan valt zowel `getuigenissen()` als zijn leesrecht op de rij
weg. Zolang hij weg is ziet niemand die straf behalve de eigenaar — de lege kring
waar `bewaak_begunstigde()` (0168) voor bestaat.

Mag de eigenaar er dan een ander op zetten?

## Wat er eerst gecorrigeerd moet worden aan de meting

QS8-312 en de dossierrij van 07-09 zeggen allebei dat een vervanger aanwijzen
niet kan **omdat de trigger het weigert** — `beneficiary_user_id = null` en
zichzelf aanwijzen, allebei nagemeten. Die twee weigeringen bestaan, maar een
gewone client bereikt ze nooit.

📏 Gemeten als `authenticated` eigenaar met echte claims, via PostgREST:

```
set + getuige lid          → permission denied for table commitments
set + getuige vertrokken   → permission denied for table commitments
due + getuige vertrokken   → permission denied for table commitments
```

De grendel is de **kolomgrant** van 0057 — `grant update (body, image_url,
status) on public.commitments to authenticated` — en die staat vóór de trigger.
De metingen in het issue zijn met `service_role` gedaan, en die gaat langs
kolomgrants heen. Beide beschrijvingen klopten dus over de uitkomst en niet over
het mechanisme, en dat verschil is precies wat dit besluit draagt.

⚠️ **Want het tweede slot dekt de belofte niet.** `bewaak_begunstigde()` verbiedt
alleen leeghalen en jezelf aanwijzen. **Wisselen naar een ánder groepslid laat
hij door** — `commitments_update` heeft daar zelfs een `with check` voor staan
(`beneficiary_user_id is null or shares_group_with_user(...)`), een clausule die
vandaag een kolom bewaakt die niemand kan schrijven.

📏 Aangetoond met mutatie 1 hieronder: één `grant update (beneficiary_user_id)`
erbij en het wisselen lukt gewoon.

📏 Ter vergelijking, mutatie 2: `goal_id` in de grant zetten laat het verhuizen
níét toe — daar vangt de `with check` van `commitments_update` het af
(`g.owner_id = auth.uid()`). `goal_id` heeft dus twee sloten en
`beneficiary_user_id` één. Die asymmetrie is de kern van dit document.

## Het besluit: er gaat niets open

Van de drie richtingen uit het issue wordt richting 1 gekozen: **niets
veranderen aan het schrijfpad, en opschrijven waarom.**

**1. Het is grens 1 en niet aan een sessie.** Wie de getuige van een straf is,
hoort bij wat de gebruiker als consequentie beloofd is. Domeinregel 5 zegt dat
alles wat een consequentie oplegt expliciet bevestigd en auditeerbaar moet zijn
en nooit stilzwijgend geactiveerd; het issue stelt zelf vast dat *wie de nieuwe
getuige mag worden en wie dat bevestigt* een weging op zichzelf is. Dat is de
beslisbevoegdheid van Quinten.

**2. De toestand schort op, hij vernietigt niet.** 📏 De aanwijzing blijft in
`beneficiary_user_id` staan terwijl de getuige weg is, en zowel de melding als
`getuigenissen()` komen terug zodra hij terugkomt. Er gaat niets verloren; er is
alleen tijdelijk niemand die meekijkt.

**3. Richting 3 is aantoonbaar schadelijk en valt af.** Een straf die vervalt als
de getuige lang genoeg weg is, maakt *vertrekken* tot een manier om andermans
straf te laten verdampen. Dat is een prikkel die niemand bedoeld heeft, en het
issue markeert hem zelf als de gevaarlijkste van de drie.

**4. Er is vandaag geen schade.** De database is leeg en er staat geen straf met
echte inzet. De prijs van wachten is nul; de prijs van een verkeerd schrijfrecht
op een commitment device is dat niet.

## Wat er wél gebouwd is

Geen migratie. `tests/rls/getuige-blijft.test.ts` legt de belofte vast:

> Er is geen opstelling waarin een straf van eigenaar verandert, zichzelf als
> getuige krijgt, of stilzwijgend verdwijnt.

⚠️ **De belangrijkste test is de registertest onderaan dat bestand**, en die is
er precies om wat hierboven staat: de belofte rust op één kolomgrant, en er was
geen enkele test die iets zei als iemand die grant verbreedde. Hij vergelijkt de
UPDATE-grant op `commitments` met `body, image_url, status` — rechtstreeks aan
`information_schema` gevraagd, want grants staan niet in de code — en zijn
commentaar vertelt de lezer wat hij op het punt staat te besluiten.

Dat is dezelfde vorm als `sleutelzetters()` (0153) en `functiegrants.test.ts`
(0115): een impliciet slot expliciet en telbaar maken zonder het gedrag te
veranderen.

## De ijking

Drie mutaties, elk apart, elk met een meting van de grant vóórdat de uitslag
geloofd werd.

| Mutatie | Wat er stukging | Wat er rood werd |
|---|---|---|
| 1 — `grant update (beneficiary_user_id)` | het enige slot onder de getuige | de twee wisseltests **en** de registertest |
| 2 — `grant update (goal_id)` | het eerste van twee sloten onder het doel | alleen de registertest — de policy vangt het verhuizen af |
| 3 — `grant delete` + een ruime DELETE-policy | de straf kan verdwijnen | de verwijdertest |

⚠️ Mutatie 2 is de leerzaamste: hij laat zien dat de registertest méér bewaakt
dan de gedragstests. `goal_id` heeft een tweede slot en `beneficiary_user_id`
niet, en zonder die test zou je dat verschil pas ontdekken op de dag dat het ertoe
doet.

## Wat er open blijft staan

De dossierrij in `docs/ENGINEER-REVIEW.md` van 07-09 blijft staan en is
bijgewerkt: zijn *Wordt zwaarder als* noemde het openen van een schrijfweg al,
en daar is nu bij gezet dat het mechanisme de kolomgrant is en niet de trigger.

Komt die schrijfweg er ooit, dan hoort er bij (criterium 2 van QS8-312): dezelfde
groepsband-eis als `commitments_insert`, geen leeghalen, en een regel in
`commitment_events` — `noteer_commitment()` kent sinds 0177 al `reverted`.
