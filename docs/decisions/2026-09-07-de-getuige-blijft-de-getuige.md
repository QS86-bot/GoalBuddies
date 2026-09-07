# Een straf in werking verandert niet meer — en in de bedenktijd juist wel (QS8-312)

**Datum:** 07-09-2026
**Status:** besloten — er gaat geen nieuwe schrijfweg open, en het bestaande pad wordt erkend
**Aanleiding:** vervolgvraag uit criterium 3 van QS8-306, scherper geworden met 0183

## De vraag

0183 laat het oppervlak van de persoon-getuige de groepsband volgen: verlaat de
getuige de groep, dan valt zowel `getuigenissen()` als zijn leesrecht op de rij
weg. Zolang hij weg is ziet niemand die straf behalve de eigenaar.

Mag de eigenaar er dan een ander op zetten?

## Het antwoord is ja, en dat pad bestond al

📏 Gemeten als `authenticated` eigenaar via PostgREST, zonder één grant aan te
raken:

```
straf aanmaken met bob   → {"status":"set","beneficiary_user_id":<bob>}
intrekken                → GELUKT, 1 rij
nieuwe straf met carol   → {"status":"set","beneficiary_user_id":<carol>}
```

`trekIn()` en `maakCommitment()` (0057) staan allebei in
`src/modules/commitments/index.ts` en op het doelscherm. `commitments_update`
staat `set → cancelled` toe en `commitments_een_open_per_soort` telt alleen
`set`, `unlocked` en `due` — dus zodra de oude rij `cancelled` is, past er een
nieuwe naast.

⚠️ **Dat is het juiste antwoord en geen gat.** Het loopt via de
bevestigingsstap in de UI, waar de consequentie letterlijk uitgeschreven staat,
en het laat een `cancelled`-rij in `commitment_events` achter. Expliciet,
bevestigd en auditeerbaar — precies wat domeinregel 5 vraagt. Er hoefde dus
niets gebouwd te worden; er moest iets **opgeschreven** worden.

## ⚠️ Wat de eerste versie van dit document beweerde, en waarom dat erger was dan een fout

De eerste versie besloot "er gaat niets open" op grond van: *de getuige kán niet
vervangen worden, dus er valt niets te beslissen.* De security-ronde mat na dat
dat onwaar is, en het testbestand zette die onwaarheid als **de belofte** in zijn
kop:

> ~~Er is geen opstelling waarin een straf van eigenaar verandert, zichzelf als
> getuige krijgt, of stilzwijgend verdwijnt.~~

Negen groene tests onder een zin die niet houdt. Dat is regel 18 vraag 3 een laag
hoger dan gebruikelijk: de tests klopten stuk voor stuk, en de zin eronder niet.
De volgende lezer bouwt op die zin.

⚠️ **De les die blijft:** *"er is geen opstelling waarin X"* is een uitspraak over
álle routes, en die schrijf je pas op nadat je de routes geteld hebt — niet nadat
je één kolom hebt zien weigeren. Ik had de kolomgrant gemeten en daaruit een
uitspraak over de féature afgeleid.

## Wat er wél houdt, en wat de tests nu bewaken

> Een straf die in werking is (`status = 'due'`) verandert niet meer van getuige,
> niet van eigenaar, en verdwijnt niet.

📏 Alle vier de routes dichtgemeten voor `due`:

```
DUE: intrekken                → UPDATE 0        (commitments_update.using eist status='set')
DUE: tweede straf op het doel → duplicate key   commitments_een_open_per_soort
DUE: verwijder_doel           → {"ok": false, "reason": "commitment_in_werking"}
DUE: rond_doel_af             → raakt alleen 'set'
```

Voor `set` is het tegendeel waar, en met opzet: dat is de bedenktijd. Een straf
is een voornemen tot hij verschuldigd wordt.

## Wat de kolomgrant dan nog doet

`beneficiary_user_id` blijft voor geen enkele client schrijfbaar. Dat is geen
verbod op wisselen — §"Het antwoord" laat zien dat wisselen mag — maar een eis
aan de **vorm**: een wisseling loopt via intrekken en laat dus altijd een rij in
`commitment_events` achter. Rechtstreeks de kolom overschrijven zou dezelfde
uitkomst geven zonder spoor.

⚠️ **En dat is één slot, niet twee.** `bewaak_begunstigde()` verbiedt alleen
leeghalen en jezelf aanwijzen; **wisselen naar een ander groepslid laat hij
door**. 📏 Aangetoond: één `grant update (beneficiary_user_id)` erbij en het
rechtstreeks wisselen lukt. Ter vergelijking heeft `goal_id` wél een tweede slot
— de `with check` van `commitments_update` eist `g.owner_id = auth.uid()` — al is
dat smaller dan het lijkt: het blokkeert verhuizen naar **andermans** doel, niet
naar een ánder eigen doel.

Daarom staat er een registertest op de grant zelf.

⚠️ **Die test vraagt `has_column_privilege` en niet `information_schema` met
`grantee = 'authenticated'`.** Dat laatste stond er eerst en het had een gat: 📏
gemeten dat `grant update (goal_id) … to public` het recht wél geeft
(`has_column_privilege` = `t`) terwijl de grantee-filter niets ziet en de hele
suite groen blijft. Spiegelbeeld van onwrikbare regel 4 — daar leest `revoke …
from public, anon` als "van iedereen", hier leest `grant … to public` als
onschuldig. **Het effectieve recht is de waarheid, niet de boekhouding erover.**
Vandaag doet geen enkele migratie dit (0× `to public` tegen 175× `to
authenticated`), dus het was geen live gat — wel een blinde grendel.

⚠️ `scripts/kolomrechten-controle.mjs` heeft diezelfde filter en dus hetzelfde
gat, projectbreed. Dat is een eigen issue (QS8-334) en niet hier gerepareerd.

## Wat er níet klopte aan "er was geen enkele grendel"

De eerste versie schreef dat niets zou melden als iemand de grant verbreedde. 📏
Onwaar: `kolomrechten:controle` vangt het al via de dode-hout-richting van
QS8-258 (*een grant die niemand gebruikt*). Zwakker — hij wordt weer groen zodra
één scherm die kolom schrijft — en het is geen beveiligingsgrendel, maar de
bewering "er was niets" was fout.

## Twee gaten die hier gemeten zijn en bewust niet gedicht

Allebei buiten QS8-312, allebei met een dossierrij en een issue.

**1. `verwijder_doel()` wist een bevestigde `set`-straf én zijn auditspoor**
(QS8-331). 📏 Gemeten: `{"ok": true}`, straf weg, `commitment_events` van 1 naar
0. Beide foreign keys zijn `on delete cascade`. Binnen de bedenktijd kan een
eigenaar dus een straf laten zien en daarna elk spoor ervan verwijderen. Botst
met domeinregel 5 (auditeerbaar) en 6 (append-only).

**2. `verwijder_mijn_account()` van de getuige laat een `due`-straf stuurloos
achter** (QS8-333). 📏 Gemeten: `beneficiary_user_id` wordt `NULL` (de foreign
key is `on delete set null`), de straf blijft `due`, en
`commitments_update.using` maakt hem daarna permanent onaanraakbaar.

⚠️ **Dat tweede geval haalde een argument onder de eerste versie van dit besluit
weg.** Die schreef: *"de toestand schort op, hij vernietigt niet"* — dragend voor
"we doen niets". Voor déze variant van "de getuige vertrok" vernietigt hij wél.
Het besluit staat nog steeds, maar op de drie andere gronden en niet op deze.

## De ijking

| Mutatie | Wat er stukging | Wat er rood werd |
|---|---|---|
| 1 — `grant update (beneficiary_user_id)` to `authenticated` | het enige slot onder de vorm | de stille-wisseltest en de registertest |
| 2 — `grant update (goal_id)` | het eerste van twee sloten onder het doel | alleen de registertest |
| 3 — `grant delete` + ruime DELETE-policy | de straf kan verdwijnen | de verwijdertest |
| 4 — `grant update (beneficiary_user_id)` to **`PUBLIC`** | de blinde vlek van de grantee-filter | beide, sinds `has_column_privilege` |
| 5 — idem aan `authenticated`, na de herschrijving | idem | beide |
| 6 — `commitments_update.using` zonder `status = 'set'` | de hele `due`-belofte | alle zes de `due`-tests |

⚠️ Mutatie 4 is de reden dat de registertest herschreven is: met de oude
grantee-filter bleef hij groen terwijl het recht er wél was.
