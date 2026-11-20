# XP is een eigen grootboek met een trigger als haak

QS8-734, migratie 0304, 19-11-2026. Bouwt op het besluit van Quinten in QS8-722
en QS8-734 (aparte teller, bedragen, drempels, terugwerkend). Dit document
beschrijft alleen wat de bouwsessie zelf koos.

## Wat er staat

Tabel `xp_grootboek`: append-only, alleen leesbaar voor de eigenaar, `bedrag > 0`.
Het totaal is een som (`mijn_xp()`), het niveau een afleiding (`xp_niveau()`);
de drempels (20, 50, 100, 180, 300, 480, 750, 1150, 1700, 2500) en de bedragen
(plafond 20, vloer 10, badges 10/10/10/25/50) staan op één plek, in de migratie.
De app kent geen constante: `src/modules/xp` valideert alleen wat `mijn_xp()`
teruggeeft. Onder 20 XP is het niveau 0.

## Keuzes van de bouwsessie (geen besluit van Quinten nodig)

1. **De haak is een trigger op `points_ledger` en op `badges`, geen tweede
   schrijfpad.** Een goedgekeurde week boekt zijn punten via elk pad in
   `points_ledger`; een AFTER INSERT-trigger op de redenen `completion_approved_
   ceiling` en `_floor` (met `ref_type = 'weekly_goal'`) draait in dezelfde
   transactie, over dezelfde rij. Het puntenmodel (0266/0267) is niet aangeraakt.
   Een vergeten aanroep is onmogelijk; dat is de vangrail van `verdien_badges()`.
2. **Een week levert hoogstens 20 XP.** Vloer, daarna plafond (tweede ronde):
   10 + 10. Plafond, daarna vloer: niets erbij. Nooit een negatieve of
   corrigerende rij, want XP daalt niet.
3. **De trigger gooit nooit een fout.** Hij draait in de transactie van de
   goedkeuring; een `raise` zou iemands week terugdraaien. Een badge zonder
   bedrag geeft daarom geen rij, en `tests/rls/xp.test.ts` legt `BADGES` naast
   `xp_bedrag_badge()` zodat dat rood wordt in de suite.
4. **Geen rij voor een gemiste week of adempauze**, in plaats van een rij met
   bedrag 0: de CHECK is `bedrag > 0`, en "geen rij" geeft niets om af te leiden.
5. **Geen FK naar `weekly_goals`**: een weekdoel mag verdwijnen
   (`verwijder_weekdoel`) en de verdiende XP blijft. Zelfde keuze als
   `points_ledger.ref_id`. De rij gaat wel mee met het account (cascade, getest).
6. **`service_role` leest en schrijft niet.** Insert, update en delete zijn
   ingetrokken; TRUNCATE en TRIGGER blijven (de test `ddl_rechten_van_service_role`
   eist ze op elke tabel, zoals bij `badges`).

## Aannames (niet gemeten of niet besloten)

- **Een intrekking binnen het kwartier laat de XP staan.** Wordt een goedkeuring
  ingetrokken en de week daarna nooit opnieuw goedgekeurd, dan blijft de XP van
  de eerste boeking staan, want XP daalt nooit. Klein bedrag, klein venster.
  De terugwerkende boeking telt zo'n week wel niet (netto punten voor dat
  weekdoel moet > 0 zijn).
- **De terugwerkende boeking kijkt naar `points_ledger`**, niet naar de status van
  `weekly_goals`: de ledger is dezelfde bron als de levende trigger. Een week met
  zowel plafond- als vloerrij telt als plafond.
- **Niveau 0 bestaat** (onder 20 XP). Het besluit noemt tien genummerde niveaus
  en geen nulde; een scherm dat dat anders wil toont niveau 0 als "nog geen".
- **De bedragen voor badges boven "zeldzaam"** (tot 200 voor legendarisch) zijn
  nog niet nodig: er bestaan vijf badges. Komt er een zesde, dan vraagt dat een
  migratie die `xp_bedrag_badge()` en `badges_bekend` samen aanpast.
- **Niet gemeten:** de som over een gebruiker bij 100k gebruikers. Het aantal
  rijen per gebruiker is begrensd (weken × doelen + vijf badges) en
  `xp_grootboek_user_idx` dekt de som; een meting onder belasting is er niet.
- `src/lib/database.types.ts` kent tabel en functie pas na uitrol en
  `npm run types:db`; tot dan loopt `src/modules/xp/api.ts` door één smalle
  structurele rand, zoals `src/modules/uiterlijk`.

## Wat dit niet is

Geen scherm (QS8-735), geen XP voor reviewpunten of mijlpalen (niet besloten),
geen verruiming van een groepsoppervlak, en niets in `points_ledger`: de punten
blijven zoals ze zijn. Het oppervlak staat als rij 55 in
`docs/decisions/002-domeinregel7-oppervlakken.md`.
