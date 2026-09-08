# De huddledag is een afspraak en geen schakelaar

**Datum:** 08-09-2026 · **Issue:** QS8-360 · **Migratie:** 0205

Een beheerder kon met één PATCH op `groups.huddle_day` de weekafsluiting van een
ander lid onbereikbaar maken, en de groep zag dat als een gemiste week. Dit
document legt vast waarom het antwoord niet "dichtzetten" is, wat er wél gebeurt
met de lopende week, en waar de grens ligt tussen de week die loopt en de weken
die geweest zijn.

## 1. Wat er gemeten is

📏 Lokale stack, groep met huddledag zondag, lopende periode `2026-09-06`, de
beheerder had afgesloten en het lid niet:

```
VOOR   group_overview(gid, '2026-09-06')   adm=true   lid=false
PATCH  /groups {"huddle_day": 3}           -> 204
NA     group_overview(gid, '2026-09-06')   adm=true   lid=false
NA     group_overview(gid, '2026-09-02')   adm=false  lid=false
lid sluit af op 2026-09-06  ->  22023, geen periodestart van deze groep
lid sluit af op 2026-09-02  ->  landt
```

**Drie dingen gaan hier mis, en het derde stond niet in het issue.**

1. Het lid dat op het punt stond af te sluiten, kan dat voor `2026-09-06` nooit
   meer: `bewaak_week_review_periode()` toetst tegen de níeuwe huddledag.

2. ⚠️ **Domeinregel 7.** `closed_this_period = false` betekent normaal "nog niet,
   de week loopt". Onder de oude start betekent het vanaf nu "en dat wordt het
   nooit meer" — een gemiste week van iemand anders, zichtbaar voor de groep,
   veroorzaakt door een derde. In een beschermde groep tot `groepsdatum - 6`
   voorbij is; in een **open** groep valt die datumgrens weg en is het permanent.

3. 📏 **De afsluiting van de beheerder is onder de nieuwe start weg.** Zijn
   `chain_links`-rij draagt de oude start, en `chain_links_one_per_period` staat
   op `(group_id, user_id, group_period_start)` — dus hij kan opnieuw afsluiten
   en er staan twee schakels voor materieel dezelfde week. Dat telt door in De
   Ketting.

⚠️ Punt 3 is de reden dat alléén de oude periodestart blijven accepteren niet
genoeg is: dan blijft de dubbele schakel bestaan.

## 2. Waarom dit geen `revoke` alleen is

Bij `groups.tz` (QS8-355, migraties 0201 en 0202) was dichtzetten het hele
antwoord. Het verschil staat in het issue en klopt:

| | `tz` | `huddle_day` |
|---|---|---|
| Zit in een RLS-uitdrukking | **ja** — `chain_links_select` leest `groepsdatum()` | nee |
| Heeft een scherm / ontworpen handeling | nee | **ja** (`app/groep/beheer/[id].tsx`) |
| Effect op een lid | stil verkeerd antwoord | luide `22023` |

De huddledag ís per ontwerp een groepsafspraak die een groep mag veranderen.
Wat ontbrak is de begrenzing van het moment. Dichtzetten zou een bestaande,
gewenste handeling weghalen — dat is acceptatiecriterium 4, en het is terecht een
must-allow.

**Het precedent stond er al.** `zet_week_startdag()` (QS8-357, migratie 0201)
doet voor de persoonlijke weekstart precies dit: de dag zetten **én** de
openstaande rijen mee verzetten, met de kolom eronder ingetrokken zodat de RPC de
enige weg is. 0205 is diezelfde vorm, één laag hoger.

## 3. Wat er nu gebeurt

`zet_huddledag(p_group_id, p_dag, p_oude_start, p_nieuwe_start)`:

* toetst dat de aanroeper een actieve beheerder is, en vergrendelt de groepsrij
  (`for update`) — twee beheerders die tegelijk een andere dag kiezen, verzetten
  anders allebei vanaf dezelfde oude start;
* toetst **beide** periodestarts: elk op zijn eigen huddledag (de oude op de dag
  die er nú staat, de nieuwe op de dag die gevraagd wordt) en beide vensters op
  `groepsdatum(p_group_id)`;
* zet de dag, en verhuist daarná `chain_links` en `week_reviews` van de oude naar
  de nieuwe start;
* schrijft een `group_events`-rij en één systeembericht.

⚠️ **De volgorde is dwingend.** `bewaak_week_review_periode()` toetst een
`week_reviews`-rij tegen de huddledag die op dát moment in `groups` staat.
Andersom weigert hij de verhuizing met `22023` — dezelfde fout die dit issue
beschrijft, dan van binnenuit.

⚠️ **De twee periodestarts komen van de client, en dat is geen luiheid.** De
database rekent de groepsklok niet uit (correctheidsregel 7): `groepsdatum()`
geeft *vandaag* in de tijdzone van de groep, niet de periodestart. Die komt uit
`shared/time`. Wat overblijft is toetsen, en dat gebeurt drievoudig — zonder die
toetsen is dit een manier om willekeurige rijen naar een datum naar keuze te
verhuizen.

## 4. De grens tussen de lopende week en de geschiedenis

⚠️⚠️ **Dit is het besluit dat het meeste uitlegt vraagt, want er ligt een
bestaande aantekening die het tegenovergestelde lijkt te zeggen.**
`src/modules/buddies/api.ts` schreef: *"De huddledag wijzigen breekt geen lopende
ketting: een `chain_links`-rij draagt de `group_period_start` waarmee hij gelegd
is, en niets herberekent die achteraf."*

📏 Nagemeten waar die zin vandaan komt: hij kwam mee in commit `48029f1`, een
commit over iets anders, als geruststelling bij `wijzigGroep()`. Er hangt geen
beslisdocument aan en geen meting.

En hij blijft staan voor wat hij beschrijft. **Afgelopen perioden worden niet
herberekend.** Wat 0205 verhuist is uitsluitend de periode die op dat moment
loopt — en dat is geen geschiedenis: hij is nog niet afgelopen, en zijn start
ís de afspraak die verzet wordt.

Diezelfde grens loopt door in `group_overview()`. De derde eis die 0205 aan de
venstertoets toevoegt — *binnen de lopende band moet de gevraagde datum een échte
periodestart zijn* — geldt alleen vanaf `groepsdatum - 6`. Daarbuiten niet, en
dat is geen voorzichtigheid maar een naad:

⚠️ `chain_links_select` en de `closed_this_period`-berekening dragen hetzelfde
venster op twee plekken, en `tests/rls/epic13.test.ts` toetst juist hun
gelíjkheid. In een **open** groep is een oudere periode leesbaar in de tabel, dus
moet het overzicht daar ook antwoord geven. 📏 Zonder die uitzondering ging die
naadtest om — het overzicht zweeg over een historische periode die de tabel wél
toonde. Inhoudelijk klopt het ook: buiten de band is `false` de geschiedenis
zoals hij is opgeschreven, en in een open groep mág die zichtbaar zijn (A41).

## 5. Wat de groep te horen krijgt

Eén systeembericht, `huddle_day_changed` — een nieuw type, dus een migratie, want
`chat_messages_system_event_bekend` is een allowlist die ook voor `service_role`
geldt. De kopie in `src/modules/buddies/chat-schemas.ts` gaat mee en staat onder
test.

⚠️ **Het bericht draagt geen aantallen, en dat is domeinregel 7 op een plek waar
je hem makkelijk mist** — de gebeurtenis zelf is immers geen tegenslag.
`zet_huddledag()` geeft terug hoeveel schakels en afsluitingen er mee zijn
verhuisd; uit "één van de twee" is af te leiden wie er nog niet had afgesloten.
Dat getal gaat alleen terug naar de beheerder die de handeling deed, en die wist
het al. `tests/rls/huddledag.test.ts` toetst dat het bericht geen cijfer bevat.

## 6. De grendels, en hoe ze geijkt zijn

📏 Vijf mutaties, één per grendel, elk apart gemeten en elk met een `grep` of
`pg_get_functiondef()` bevestigd vóór de uitslag geteld werd:

| Mutatie | Wat er rood werd |
|---|---|
| de rijverhuizing eruit (`where false`) | beide "neemt de lopende week mee"-tests |
| de derde conjunct uit `group_overview()` | dezelfde twee, op de `null`-assertie |
| een aantal in het systeembericht | "zonder aantallen" |
| de kolomgrant terug, de pin blijft | "weigert een kale PATCH" — de PATCH geeft dan 200 en verandert niets, precies de stille weigering van QS8-314 |
| grant terug én pin eruit | acht van de tien, want dan landt de PATCH echt |

⚠️ Die vierde meting is het argument voor twee sloten in plaats van één. De
`revoke` is wat een client hoort (`42501`); de pin in `guard_group_update()` is
het slot voor een rol die de grant langs een andere weg alsnog heeft — en die
zwijgt, dus hij is de tweede en niet de eerste.

## 7. Wat er onderweg is opgevallen en níét van dit issue is

📏 `onveranderlijkheid_bewaking()` (migratie 0086) zoekt zijn grendel met een
reguliere expressie over `pg_get_functiondef()`, en die bron bevat commentaar.
Voor `groups.created_by` staat de gevraagde vorm — `old.created_by is null or
new.created_by is not null` — sinds 0202 alleen nog in een commentáárregel die
uitlegt waarom de tak weg is. De teller leest dat als een aanwezige grendel.

Ontdekt doordat mijn eerste versie van `guard_group_update()` die toelichting
niet overnam en de bewaker meteen rood werd. De regel is hersteld — hij hoort er
inhoudelijk te staan — maar de teller is daarmee wel een controle die door proza
te bevredigen is. Dat staat als eigen issue en is hier bewust niet meegenomen.
