# Meetverslag: het gat in de bescherming bij een gemiste week (QS8-745, Fase 0.3)

> Herhaald en bevestigd op 20-11-2026 door de bouwsessie van QS8-745: dezelfde tabelaantallen (2/2/2/0/0/0/0/2) en dezelfde twee weken (60 en 44 dagen geleden), opnieuw alleen met `select`. Het eerste verslag stond op een andere branch; dit is de versie die op `main` komt.

Gemeten op **20-11-2026**, productie (`goalbuddies`, ref `wehgocadxehottiiyvsc`, migraties tot en met 0302), **alleen lezen**: uitsluitend `select`, via de Supabase-MCP. Er is niets geschreven en er zijn geen testgebruikers aangemaakt. Het verslag bevat alleen aantallen en geen persoonsgegevens.

## Conclusie

**Er is met productiedata geen uitspraak mogelijk, en dus ook geen aangetoond gat.** Productie bevat te weinig echt gebruik om de drie vragen te beantwoorden: twee profielen, nul voltooiingen, nul boekingen in het puntengrootboek en nul weekpas-gebeurtenissen. De twee gemiste weken die er staan zijn 44 en 60 dagen oud en liggen ver buiten elk redelijk reactievenster.

**Eindconclusie (acceptatiecriterium 3): niet vast te stellen.** Er is geen aangetoond gat en ook geen aangetoond ontbreken van een gat. Daarom: **Fase 6.1 (QS8-756) wordt niet vrijgegeven op grond van deze meting**, en wordt ook niet met een bewijs gesloten. De meting moet worden herhaald zodra er gebruikers zijn die een volle week hebben gespeeld. Dat besluit en de keuze tussen "sluiten als niet nodig" en "laten staan tot er data is" zijn aan Quinten.

## Besluit van Quinten (20-11-2026)

**Niet vast te stellen.** QS8-756 (Fase 6.1) blijft staan, niet vrijgegeven en niet gesloten. De meting wordt herhaald zodra enkele tientallen gebruikers een volle week hebben gespeeld. Het onverklaarde minpunt zonder grootboekrij is opgenomen als QS8-774.

## Wat er staat (stand 20-11-2026)

| Tabel | Aantal rijen |
|---|---|
| `profiles` | 2 |
| `goals` | 2 |
| `weekly_goals` | 2, beide met status `missed` |
| `completions` | 0 |
| `points_ledger` | 0 |
| `week_pass_events` | 0 |
| `breathers` | 0 |
| `user_streaks` | 2 (huidige reeks 0 bij beide doelen) |

Query, tabelaantallen: een `union all` van `count(*)` per tabel, plus `count(*)` per `status` voor `weekly_goals`.

## Vraag 1: hoeveel weken zijn gemist waarbij de gebruiker nog had kunnen reageren?

**Twee weken gemist, nul binnen een redelijk venster.**

| Cyclus begint | Cyclus eindigt | Dagen sinds het einde |
|---|---|---|
| 14-09-2026 | 21-09-2026 | 60 |
| 30-09-2026 | 07-10-2026 | 44 |

Query: per `weekly_goals`-rij `cycle_start_date`, `cycle_start_date + 7` en `current_date - (cycle_start_date + 7)`, met voor dezelfde `goal_id` het aantal rijen in `user_streaks`, `points_ledger` en `week_pass_events`.

Opvallend aan de tweede rij: hij is op 05-10 aangemaakt voor een cyclus die op 30-09 begon, dus hij had bij het aanmaken nog twee dagen. Dat past bij een testgebruiker die een doel opzette en niets deed; het is geen bewijs van een gebruiker die te laat was.

## Vraag 2: was er een weekpas beschikbaar die niet is gebruikt, en waarom niet?

**Niet te meten.** Er zijn nul `week_pass_events` in productie: er is nooit een pas verdiend of verbruikt. Hoeveel passen een gebruiker op dat moment had, komt uit `weekpas_standen()`, en die is een functie met een autorisatiegrens op de ingelogde gebruiker. Dat via `service_role` of een rolwissel op productie aanroepen is een schrijf- of grenswijziging die dit issue uitsluit. **Aanname:** de gebruikers van de twee gemiste weken hadden geen pas beschikbaar, want er was nooit een weekpas verdiend (`verdien_weekpassen` heeft niets achtergelaten). Die aanname is niet gemeten.

## Vraag 3: hoe vaak komt de rollover te laat, of valt een week om door een tijdzone- of week-startgrens?

**Niet te meten met deze data.** `cron.job` bestaat niet in dit project (de rollover is een Edge Function met een externe planning), dus er is geen uitvoeringsgeschiedenis om te toetsen. Er is bovendien geen enkel geval waar een tijdzonegrens meespeelt.

**Wel een onverklaard feit, hier opgeschreven en niet geduid:** beide weken staan op `missed`, en `points_miss` is `-1`, maar het puntengrootboek bevat **nul** rijen, dus er is nooit een minpunt geboekt. Dat hoeft geen fout te zijn: de gegevens zijn van september en oktober, en het kan zijn dat de boeking toen nog niet bestond of dat de rollover alleen de status zette. Maar het is wel het enige concrete aanknopingspunt dat de rollover in productie niet het volle werk doet. Dat is een vraag voor de rollover-uitrol en geen bewijs voor een gat in de weekpas.

## Wat niet gemeten kon worden (aannames)

1. Of er in de twee weken een pas had kunnen zijn (zie vraag 2).
2. Of de rollover in productie vandaag elk uur draait en met welke vertraging (geen planning in de database).
3. Elke vraag over meer dan twee gebruikers: de populatie is te klein.
4. Of de twee gemiste weken testdata zijn. Dat is waarschijnlijk (twee profielen, geen enkele voltooiing), maar niet vastgesteld.

## Wanneer opnieuw meten

Herhaal de vier queries hierboven zodra er minstens enkele tientallen gebruikers een volle week hebben gespeeld, en voeg dan toe: het aantal weken dat `missed` werd terwijl `user_streaks` en `week_pass_events` een beschikbare pas lieten zien, en per week het verschil tussen `cycle_start_date + 7` en het moment van de statusovergang. Dat laatste is nu **niet** te meten: `weekly_goals` heeft geen `updated_at`-kolom, dus het tijdstip van de overgang naar `missed` wordt nergens vastgelegd. Wil je de rollover-vertraging ooit meten, dan hoort daar een meetpunt voor (een eigen bouwissue en een besluit van Quinten).
