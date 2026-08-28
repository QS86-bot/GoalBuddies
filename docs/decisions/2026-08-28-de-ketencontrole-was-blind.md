# `keten:controle` meldde maandenlang nul omdat hij niets kón vinden

**Datum:** 28-08-2026
**Raakt:** `scripts/dode-keten-controle.mjs`, `tests/scripts/dode-keten.test.ts`
**Geen migratie.**

## De aanleiding

Bevinding 5 van de controleronde van 28-08: vijf onbereikbare features.
`wijzigDoel()`, `wijzigMijlpaal()` en `fetchCommitmentSpoor()` hebben nul
aanroepers, `group_members.status` heeft geen enkel schrijfpad, en
`ai_kosten_per_week()` draait nergens.

De vraag die daaronder ligt is een andere: **er staat een controle op precies deze
klasse, en die stond groen.** `npm run keten:controle` bestaat sinds de rij van
21-08 ("drie backend-issues op rij bleken geen enkele aanroeper te hebben") en
meldde "139 functies hebben allemaal een aanroeper".

## Waarom hij niets kon vinden

`zonderDefinities()` haalt de definitiekoppen uit de SQL weg zodat een functie
niet zijn eigen aanroeper wordt. Wat het níét weghaalde:

```sql
revoke all on function public.f() from public, anon, authenticated;
grant execute on function public.f() to service_role;
```

Allebei bevatten `f(`, dus het aanroeppatroon sloeg erop aan. **Bijna élke functie
in dit project draagt die twee regels** — dat is de vorm die onwrikbare regel 4
sinds 0115 voorschrijft. Iedere functie was dus per definitie "levend".

⚠️ Dat is exact de vorm van QS8-115: `tekst:controle` meldde maandenlang nul
terwijl er zeven onvertaalde zinnen in één scherm stonden. **Een controle die
nooit rood is geweest, is een aanname.** Deze had wél een ijkingstest — met
achttien gevallen — maar geen enkel geval voor de vorm die overal staat.

## Wat er nu gebeurt

`zonderDefinities()` haalt ook `grant … on function`, `revoke … on function`,
`comment on function` en `alter function` weg. Met open ogen meldde het script
meteen **twaalf** functies.

Elf daarvan zijn bewakingen en ops-functies. Die hebben per ontwerp geen pad door
de app — `initplan_bewaking()` bestaat om in `/audit` nul rijen te geven, en er
hoort nooit een knop naartoe. Zonder uitzondering was deze controle vanaf de
eerste seconde rood en dus meteen onbruikbaar.

⚠️ **Maar de uitzondering mag geen parkeerplaats worden, en dat is de kern van het
ontwerp.** `BEWAAKT_BUITEN_DE_APP` is een lijst met redenen (zelfde vorm als
`BEWUST_ONGESCHREVEN`), en het script **verifieert** dat er in `tests/` of
`scripts/` daadwerkelijk een aanroep staat. Zo niet, dan wordt de functie alsnog
gemeld — met een andere reden. Er is ook een omgekeerde melding: een naam op de
lijst die inmiddels een echt pad heeft, hoort eraf.

⚠️ **Dat werkte meteen, en het corrigeerde mijn eigen reden.**
`functie_vingerafdrukken()` stond er met "de test is de aanroeper" en er was geen
test — zijn aanroeper is `scripts/functies-controle.mjs`. Daarop is de categorie
verbreed van "tests" naar "tests of scripts", en de reden per functie
rechtgezet.

⚠️ **Het bewijs bij een lijstnaam is ruimer dan `.rpc('naam')`, en dat is geen
slordigheid.** Aan de productiekant gaat het om *loopt hier een pad heen*, en dan
is de vorm van de aanroep het bewijs. Hier gaat het om *kijkt er iets buiten de
app naar*, en dat doen de twee ops-scripts allebei anders: een kale `fetch()` op
`/rest/v1/rpc/…`, een `select` via psql, en een eigen `rpc()`-hulpje. Een strenge
vorm meldde ze als ongetest terwijl ze in `/audit` draaien — vals alarm, en dat is
wat je leert negeren.

De uitslagregel telt de twee soorten nu apart: *"127 met een pad door de app, 12
bewakingen en ops-functies met een aanroeper in tests/ of scripts/"*. Eén getal
zou de tweede groep onzichtbaar maken, en dat is precies hoe deze blinde vlek is
ontstaan.

## De ijking

Met de hand rood gemaakt vóórdat de reparatie er was — de test met de grant- en
revoke-regels stond eerst en was rood. Verder vier nieuwe gevallen op de
uitzondering:

| Geval | Verwacht |
|---|---|
| bewaking mét aanroeper in `tests/` | stil |
| bewaking op de lijst, nergens aangeroepen | `beloofdMaarOngetest` |
| naam op de lijst die een echt pad heeft gekregen | `bewaaktVerouderd` |
| functie níét op de lijst, alleen uit een test aangeroepen | `functies` — de EPIC 9-regel blijft staan |

Die laatste is de belangrijkste: een aanroep uit een test maakt een functie nog
steeds niet levend. De uitzondering geldt alleen voor namen die er met een reden
op staan.

## Wat de reparatie níét oplost, en wat er dus open blijft

⚠️ **Dit script kijkt naar SQL-functies. De drie functies uit de bevinding zijn
TypeScript.** `wijzigDoel()`, `wijzigMijlpaal()` en `fetchCommitmentSpoor()` staan
in de datalaag, en er is geen enkele controle die een datalaagfunctie zonder
scherm vindt. Dat is een tweede, eigen stuk werk.

Nagemeten hoe erg elk van de vijf is:

| Wat | Stand |
|---|---|
| `maakMijlpaal`, `verwijderMijlpaal`, `herordenMijlpalen`, `zetMijlpaalStatus` | wél een scherm |
| `wijzigMijlpaal` | **geen** — een typefout in een mijlpaaltitel is permanent |
| `wijzigDoel` | **geen** — een doel is na aanmaken niet meer te wijzigen |
| `fetchCommitmentSpoor` | **geen** — het auditspoor dat domeinregel 5 eist is nergens te zien |
| `group_members.status` | geen schrijfpad in de app; alleen een beheerder kan het via de policy, en 0109 R3 laat zien dat dat een goedkeuring laat vastlopen |
| `ai_kosten_per_week` | staat nu met reden op `BEWAAKT_BUITEN_DE_APP`-achtige voet: het is één rekening bij Anthropic en bewust niet voor `authenticated` |

**De eerste drie zijn schermwerk en geen opruimwerk**, en dat is de reden dat ze
hier niet in zitten. Een doelbewerkscherm raakt bovendien een domeinregel: de
streefdatum verschuiven loopt via A7 en vraagt akkoord van een buddy — `doelSchema`
laat `target_date` daarom met opzet weg. Dat is een feature met een spec, geen
regel code die je er in een opruimronde bij doet.
