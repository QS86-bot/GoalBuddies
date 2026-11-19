# Een prestatie delen: een deelbaar-lijst, een kalenderdag en geen intrekken

QS8-736, migratie 0309. Besluiten van Quinten (QS8-722 en de vierde en vijfde ronde op QS8-736) staan in
`docs/decisions/2026-11-19-de-nieuwe-huisstijl-vervangt-a55-en-rustig-gereedschap.md`; dit document legt de keuzes
vast die de bouwsessie zelf maakte, en de aannames.

## Keuzes van de bouwsessie (conservatief, geen besluit van Quinten nodig)

1. **De deelbaar-lijst is een databasefunctie** (`prestatie_deelbaar()`), niet `badges_bekend`. Een nieuwe badge is
   daardoor niet vanzelf deelbaar: hij moet eerst langs de twee vragen van domeinregel 7. `GEDEELDE_PRESTATIES` in
   `src/modules/buddies/systeemberichten.ts` is de TypeScript-kopie; `tests/rls/prestatie-delen.test.ts` legt beide
   naast elkaar en de unit-test legt de kopie naast `BADGES`, met een lijst "bewust niet deelbaar".
2. **De limiet is een kalenderdag in de tijdzone van de gebruiker** (`eigenaarsdatum()`), geen 24-uursvenster zoals
   `tel_dagteller()`. Dat volgt de tekst van het issue. De telling is begrensd tot twee dagen terug (indexbereik) en staat
   onder een advisory lock per gebruiker.
3. **De payload is de sleutel en verder niets, in de database**: een CHECK (`chat_messages_prestatie_payload_is_een_sleutel`)
   die ook voor `service_role` geldt.
4. **Geen intrekken.** Het bericht heeft `sender_id` null en `chat_messages_delete` eist de afzender, dus een misklik
   blijft staan tot het account weg is. De conservatieve keuze; de bevestigingstekst zegt dat alle leden van de gekozen
   groep het zien. Wil Quinten intrekken, dan is dat een eigen besluit (een tweede wispad op een systeembericht).
5. **Teamgroepen:** `is_teamgroep()` is een stub (`false`, er is geen organisatiekolom) en de poort
   `teamgroep_mag_prestatie_delen()` is `false`. De test wordt rood zodra `groups` een organisatiekolom krijgt zonder dat
   de stub is aangepast, zodat het delen daar niet stilzwijgend aan komt te staan. ⚠️ Er staan in de repo branches die teams
   voorbereiden; die moeten `is_teamgroep()` bewust invullen.
6. **Types:** `deel_prestatie()` staat nog niet in `database.types.ts` (de migratie wacht op de backup). De aanroep loopt
   door één smalle structurele rand in `prestatie-delen.ts`, net als `demping.ts`. Na de uitrol: `npm run types:db` en de
   gewone getypeerde `rpc()`-aanroep.

## Aannames, niet gemeten

* Niet gemeten op productie: de migratie is niet toegepast.
* Niet gemeten: hoe vaak gebruikers delen, en of vijf per dag een spamvector openlaat voor een groep van tientallen leden.
* Een verwijdering buiten `verwijder_mijn_account()` om (dashboard, `service_role`) laat het bericht staan met een lege
  onderwerp-kolom; zelfde gat als bij 0247.
