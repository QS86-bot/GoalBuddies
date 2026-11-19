# De adempauze is van jou alleen

**Datum:** 19-11-2026 · **Migratie:** 0307 · **Issue:** QS8-753 (deel A: de database; deel B, het bericht zelf, is in dezelfde branch gebouwd; de copy `adempauze.groep_ziet` is bewust niet vervangen, zie B3)
**Besluit van:** Quinten, 19-11-2026 · **Raakt:** domeinregel 7, domeinregel 10, A50, QS8-227
**Status:** gebouwd, migratie wacht op Quintens "backup gedaan" (`docs/PROMPT-SESSIE.md` §12d).

---

## 1. Het besluit

`breathers_select` wordt **eigenaar-only**: `user_id = (select auth.uid())`. De groepstak
(`shares_group_with_goal(g.id)`) vervalt, in beide groepssoorten en voor elke pauze,
ook de bestaande.

## 2. Wat er vervalt

| Wat | Waar het stond | Wat er nu staat |
|---|---|---|
| A50 (25-08-2026): de groep leest de hele aankondiging, begin en eind incluis | `002` rij 21, `001` §4.2-matrix | eigenaar-only |
| QS8-227 (06-09-2026): ook een pauze die je achteraf aankondigt is voor de groep zichtbaar, "de enige rem die overblijft" | `002` §4a, de derde benoemde verruiming | teruggedraaid; **er zijn weer twee** (A15 en A7) |
| `breathers.groepszichtbaar = true` in de census van `groepskolommen:controle` | `scripts/groepskolommen-controle.mjs` | `false` |
| De test "is voor een groepsgenoot zichtbaar" (twee varianten) | `tests/rls/epic8.test.ts`, `tests/rls/leesgrenzen.test.ts` | omgedraaid, niet verwijderd: eerst ziet de eigenaar de rij, dan ziet de groepsgenoot nul |

Het rollback-pad staat in de kop van de migratie en zet de policy van 0122 letterlijk terug.
⚠️ Dat pad verruimt weer, ook voor bestaande rijen, en is een besluit van Quinten en geen reflex.

## 3. Waarom

Dit is dezelfde beweging als A17 (teruggedraaid in 0050). De aanleiding is de bevinding uit de
security-review van 06-09-2026: sinds 0166 mag een adempauze over voorbije weken liggen, dus
`announced_at` ná `ends_cycle` verraadt dat die week misging, en dat is met één GET op
`/rest/v1/breathers` als gewoon lid van een **beschermde** groep te lezen. Een rij die dat kan
verraden is geen aankondiging maar een lek met een goede reden. Domeinregel 7 zegt dat de regel pas
is afgedwongen als de database hem afdwingt; hier deed de database het tegenovergestelde, en liet
het besluit van A50 dat toe.

## 4. Wat de groep wél hoort

Een **gewoon chatbericht** dat het lid zelf plaatst, in een groep naar keuze. Wat het niet is:

- **Geen nieuw type systeembericht en dus geen migratie daarvoor.**
  `chat_messages_system_event_bekend` blijft ongewijzigd. Een systeembericht "X heeft een adempauze"
  op eigen gezag van de app zou van de afwezigheid ervan een signaal maken (zie rij 22 in `002`).
- Geen koppeling met `breathers`: het bericht bestaat los van de rij, en de rij is er geen bron van.
- Geen voorgeselecteerd bericht en geen prompt per pauze: het is een eigen handeling van het lid.

Het oppervlak staat als rij 57 in `002`. Het bericht is deel B (`app/doel/[id].tsx`,
`src/modules/goals/adempauze-bericht.ts`) en is in dezelfde branch gebouwd.

## 5. Punten

Een adempauze kost geen punten en levert er geen op (domeinregel 10: adempauze `0`). Dat verandert
niet: de rollover zet het weekdoel op `excused` en boekt geen minpunt. Dit besluit raakt alleen wie
de rij leest.

## 6. Wat dit níét oplost, en wat het kost

### B1. `ketting_stand()` blijft het aantal pauzerende leden tonen

`ketting_stand()` (0107, laatst 0204, SECURITY DEFINER) laat leden met een lopende pauze uit
`in_aanmerking` vallen en geeft `in_aanmerking` en `voltallig` terug aan elk groepslid. Een lid dat
`in_aanmerking` van het ledental aftrekt, weet **hoeveel** leden in pauze zijn, en bij een kleine
groep of een bekend ledental ook wie. **Bewust ongewijzigd:** de functie is geen onderdeel van dit
besluit, een wijziging raakt De Ketting (domeinregel 1, groepsperiode) en daarmee het
streakmodel, en dat is een eigen besluit. Het is een benoemd restant en geen verzuim.

⚠️ Het restant is kleiner dan wat A50 gaf: een getal zonder datum en zonder cyclus, en geen rij
die op id te lezen is. Maar het bestaat, en een bericht dat zegt dat de groep niets over een pauze
te weten kan komen is onwaar zolang deze functie het getal geeft. Dat had in de copy van deel B gemoeten en staat er niet in (zie B3).

### B2. De rem op een pauze met terugwerkende kracht valt weg

`2026-09-06-de-adempauze-wordt-vrij.md` §3 noemde de aankondiging aan de groep als de énige rem die
overbleef nadat de lengtegrens, `niet_vooraf` en de drie andere remmen waren opgegeven. Met dit
besluit is er **geen enkele rem meer** op een pauze die je achteraf zet: een lid kan een gemiste
week met terugwerkende kracht op `excused` zetten, het minpunt laten terugboeken en de reeks laten
doorlopen, zonder dat iemand het ziet. **Bewust opgegeven**, op besluit van Quinten.

⚠️ **Herbevestigen vóór merge naar productie.** Het besluit van 30-08 koos voor volledige vrijheid
mét deze rem; dit besluit haalt de rem weg zonder dat de vrijheid is teruggedraaid. Dat is een
tweede keer dat de score zonder een tegenhanger kan worden bijgesteld (zie ook de les van A17:
schrijf "herbevestigen vóór X" op zodra een besluit aan een toekomstige feature hangt). Is Quinten
op het moment van mergen nog dezelfde mening, dan staat hier niets te doen; zo niet, dan is de
eerste keuze een rem die niet op de groep leunt (een afkoeling of een maximum op terugwerkende
weken).

### B3. `adempauze.groep_ziet` is na de migratie onwaar

De copy `adempauze.groep_ziet` (`src/shared/i18n`) belooft de gebruiker wat de groep ziet en is op
besluit van Quinten (19-11-2026, antwoord op de vraag in QS8-753) **ongewijzigd gelaten**; ze is na
deze migratie onwaar en staat in het formulier direct boven de nieuwe vraag 'laat je groep weten'.
Deel B (QS8-753) heeft haar dus **niet** vervangen. Advies uit de reviews: vervang haar vóór de
migratie op productie staat, door een zin die klopt en het Ketting-restant (B1) eerlijk noemt.

### B4. In een open groep is de weekstatus `excused` leesbaar

`weekly_goals_select` heeft een tak `deelt_open_groep_met_doel(goal_id)` zonder statusfilter
(0077, ongewijzigd in 0122). Een lid van een **open** groep ziet dus per week dat een weekdoel
vrijgesteld is, en bij een pauze achteraf een week van gemist naar vrijgesteld omslaan. Dat is de
bedoelde werking van een open groep (A41: de groep ziet ook tegenslag) en dit besluit verandert
het niet. Het betekent wel dat 'de adempauze is van jou alleen' voor een open groep alleen voor de
tabel `breathers` geldt. In een beschermde groep blijft `excused` dicht (0047). Wie dit ook voor
open groepen dicht wil, sluit `excused` uit in die tak: een eigen besluit.

### B1 is scherper dan hierboven staat

Het aantal bolletjes in `src/shared/ui/Ketting.tsx` is `in_aanmerking`; zakt dat, dan pauzeert er
iemand. In een duo is dat de ander. Combineer je het met de leesbare `chain_links` (wie heeft een
schakel), dan is bij naam te raden wie pauzeert, want `ketting_stand().schakels` telt alleen
schakels van leden die meedoen. Dit staat bewust ongewijzigd (een wijziging raakt De Ketting en is
een productkeuze), maar het is meer dan 'een getal zonder persoon'. Voorstel: pauzerende leden
tellen mee in `in_aanmerking`; dan kan De Ketting in een pauzeweek niet voltallig worden.

## 7. Wat dit bestand toetst

`tests/rls/adempauze-eigenaar-only.test.ts` toetst de tabel `breathers` als geheel en niet de policytekst alleen (afgeleide oppervlakken als `weekly_goals.excused` in een open groep en `ketting_stand()` vallen er bewust buiten, zie B1 en B4):

1. de tabel, met een eigen JWT per gebruiker: de eigenaar ziet zijn rijen (tegentest), een
   groepsgenoot ziet er nul in een beschermde én een open groep, vooruit en 8 weken terug, ook
   geen `count`; anon wordt geweigerd;
2. `pg_policies`: precies één policy, `SELECT`, zonder `shares_group_with_goal`;
3. geen view en geen materialized view op `breathers` (met een tegentest op `goals`, zodat een
   regex die niets vindt niet gratis groen is);
4. een **register** van de functies die `breathers` lezen, met een reden per rij en de eis dat ze
   SECURITY DEFINER zijn: `plan_adempauze`, `annuleer_adempauze`, `ketting_stand`. Een vierde is
   rood tot iemand de reden opschrijft;
5. `realtime_bewaking()`: niet in de publicatie en `replica identity default`.

De rollover en de notificaties lezen als `service_role` en vallen buiten de policy.
