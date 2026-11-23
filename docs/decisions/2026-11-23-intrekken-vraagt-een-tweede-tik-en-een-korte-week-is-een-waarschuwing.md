# Intrekken vraagt een tweede tik, en een korte week is een waarschuwing

**Datum:** 23-11-2026 · **Issue:** QS8-799 · **Besluit:** Quinten, 23-11-2026 (meerkeuze: alle drie aanpassen)
**Raakt:** domeinregel 5 (commitment devices), 7 (falen is nooit publiek) en 11; correctheidsregel 7

## Wat er veranderd is

1. **Intrekken van een weekbelofte gaat in twee stappen.** De eerste tik op
   *Intrekken* opent alleen een vraag met de gevolgen: de belofte vervalt en gaat
   niet meer in werking, en de getuige krijgt er niets van te zien. Pas *"Ja, trek
   mijn belofte in"* schrijft.
2. **Een korte week wordt in de bevestigstap genoemd.** Is er van de lopende week
   minder dan 24 uur over, dan zegt de stap dat, en dat een hele week beloven kan
   zodra de nieuwe week begonnen is.
3. **De melding bij een belofte die net `due` werd zegt "Deze belofte"** (en: "This
   promise"). De doelstraf houdt "Dit commitment".

Geen migratie: alle drie zijn clientwijzigingen.

## Keuzes die niet vanzelf spreken

**De getuige ziet niets: nagemeten, niet aangenomen.** De zin in de vraag belooft
iets aan de gebruiker, dus hij moet waar zijn. 0293 heeft het in een tabel: op
`set` kan de getuige de belofte niet lezen (`commitment_zichtbaar_voor_persoon()` en
`commitment_zichtbaar_voor_groep()` kennen `set` geen van beide), en `commitments_update`
staat intrekken alleen toe vanuit `set`. Er is dus geen bericht en geen melding bij
intrekken, en die kán er niet komen zonder domeinregel 11 te breken.

**Een korte week is een waarschuwing en geen weigering.** De regel "alleen in de
lopende week" (0314) blijft staan, en een belofte met een paar uur over gaat
gewoon aan. Weigeren zou het aanbod strenger maken dan de database, en de
gebruiker de keuze afnemen. Het issue vroeg om noemen, niet om weigeren.

**"Minder dan één dag" is gemeten tegen het einde van de cyclus, niet "de laatste
kalenderdag".** `userCycleEndsWithin()` in `shared/time` vergelijkt met `endsAt`,
het UTC-moment waarop de volgende cyclus begint in de zone en op de week-startdag
van de gebruiker. Op een zomertijdwissel verschillen die twee lezingen een uur;
`tests/beloftes/korte-week.test.ts` legt dat geval vast. Strikt kleiner: met precies
24 uur over is de week niet kort.

**Het moment is dat van "Verder".** `naarBevestigen()` legt `korteWeek` vast op
hetzelfde moment als de periode. Wie de stap urenlang open laat staan, ziet de
waarschuwing van toen; tikt hij na de weekgrens, dan weigert `gaWeekbelofteAan()`
al (de week is dan een andere). Dat is dezelfde keuze als voor de periode zelf.

**`trekBelofteIn()` en geen tweede schrijfactie.** `trekIn()` en
`trekBelofteIn()` delen één `update` (`zetIngetrokken()`), en verschillen alleen in
wat ze teruggeven. `trekBelofteIn()` zegt bij een mislukking ook of de belofte al
beslist is. Het beloftescherm roept alleen `trekBelofteIn()` aan, en alleen vanuit
de tweede bevestiging; `tests/beloftes/belofte-intrekken.test.ts` meet dat aan de
netwerkgrens (de Supabase-client is daar de enige mock).

**De melding zegt "intussen beslist" en niet "in werking getreden"** (security-review).
Nul rijen betekent "niet meer op `set`", en bij een belofte is `cancelled` door de
rollover (0313, gehouden) een gewoon pad.

## Besluiten van Quinten, 23-11-2026 (via de orchestrator, meerkeuze)

1. De afdrukken zijn goedgekeurd.
2. Na de melding "intussen beslist" verdwijnt de intrekknop en komt er een knop
   **Terug**. Bij een storing blijft de intrekknop staan, want dan heeft opnieuw
   proberen wel zin.
   - ⚠️ [AANNAME] *Terug* herlaadt het beloftescherm, zodat de echte stand er staat
     (in werking, of vervallen). Het besluit noemt de knop maar niet waarheen hij
     gaat. Herladen is de conservatiefste lezing: er wordt niets geschreven, en de
     melding vraagt de gebruiker al om te kijken hoe het beslist is.

### Tweede ronde, 23-11-2026 05:35 UTC (meerkeuze, via de orchestrator)

Dit vervangt de aanname hierboven:

- De knop heet **"Bekijk de uitslag"** (en: "See the outcome") en herlaadt het
  beloftescherm met de echte stand. Er staat geen knop "Terug" meer.
- De melding is **"Deze belofte kan niet meer worden ingetrokken: ze is intussen
  beslist."** (en: "This promise can no longer be withdrawn: it has been decided in
  the meantime."). Het stuk "Vernieuw het scherm om te zien hoe" is eruit: de knop
  doet dat nu.

### Herbevestigd, 23-11-2026 middag (meerkeuze, via de hoofdorchestrator, slotronde week 48)

De critical-user van de slotronde vroeg of intrekken nog mag ná het einde van de week en vóór de beslissende
run, ook als de eigenaar dan al weet dat hij gemist heeft. De intrekbevestiging zegt dat met zoveel woorden
(*"ook niet als je die week niet haalt"*). **Quinten koos A: zo laten.** Het besluit van QS8-759 blijft staan:
een belofte is intrekbaar tot ze verschuldigd is, ook ná `periode_einde`
(`docs/decisions/2026-11-20-een-weekbelofte-beslist-aan-het-einde-van-haar-week.md`). Wie dit wil aanscherpen,
neemt een nieuw besluit onder grens 1; dit is geen open vraag meer.

Uit dezelfde ronde kregen twee bevindingen over dit scherm en de doelstraf een eigen issue, op keuze A van
Quinten: **QS8-814** (de doelstraf intrekken vraagt dezelfde tweede tik), **QS8-815** (na "Bekijk de uitslag" en
na een intrekking staat er een regel met de uitkomst). Ze veranderen niets aan wat hier besloten is.
