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

**`trekBelofteIn()` en geen tweede schrijfactie.** `trekIn()` kreeg een optionele
sleutel voor de melding bij nul rijen; `trekBelofteIn()` geeft die van de belofte
mee. Eén `update`, twee teksten. Het beloftescherm roept alleen `trekBelofteIn()`
aan, en alleen vanuit de tweede bevestiging; `tests/beloftes/belofte-intrekken.test.ts`
meet dat aan de netwerkgrens (de Supabase-client is daar de enige mock).
