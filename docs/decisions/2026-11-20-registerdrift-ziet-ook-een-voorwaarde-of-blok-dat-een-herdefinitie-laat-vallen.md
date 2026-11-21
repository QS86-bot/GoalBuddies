# registerdrift ziet ook een voorwaarde of blok dat een herdefinitie laat vallen (QS8-766)

Besluit van Quinten, 20-11-2026 (V1 = A, V2 = A, V3 = A).

## Aanleiding
Op 20-11-2026 herdefinieerden drie migraties uit oude takken een functie of CHECK
op basis van een oudere stand, en viel stil weg wat `main` intussen had
toegevoegd: `and c.periode_start is null` in `straffen_bij_uitstelverzoek()`
(0312), het `prestatie_gedeeld`-blok in `verwijder_mijn_account()` (0309), de
waarde `prestatie_gedeeld` in de CHECK `chat_messages_system_event_bekend` (0309),
en eerder de `(select …)`-wikkel in `commitments_select` (0254). Git zag geen
conflict (verschillende bestanden), `registerdrift:controle` keek alleen naar
rijen van een register. Vier keer met de hand gevangen.

## Besluit
`scripts/registerdrift-regels.mjs`, aangeroepen door `registerdrift:controle`:
per functie (naam en argumenten), CHECK (naam) en policy (naam en tabel) wordt de
vorige definitie (de hoogste migratie eronder) vergeleken met de nieuwe. Een regel
of tekstwaarde die verdwijnt wordt gemeld, tenzij de kop van de migratie hem noemt:
`-- laat bewust vallen: <de regel zoals hij er stond>`.

Twee afbakeningen, beide een blinde vlek om te kennen:

1. **Alleen vanaf 0328.** 📏 Gemeten op 0327: de vergelijking geeft **1389**
   meldingen over 0001-0327, ook bij 85% overlap nog 400. Een volledige herschrijving
   is hier de norm. De vorige definitie komt wel uit de hele map.
2. **Alleen bij ≥70% overlap.** Dat is het beeld van een kopie van een oude stand
   met een gat. Een bijna volledige herschrijving die een voorwaarde laat vallen
   ziet de controle niet.

Een definitie buiten functie, CHECK en policy (view, trigger) valt er ook buiten,
en een herschrijving met dezelfde betekenis in een andere vorm telt als verlies.

## Geijkt
`tests/scripts/registerdrift-regels.test.ts` zet de vier echte gevallen terug op
een kopie van de echte migratiemap (als `0999_…`) en eist rood. Per grendel met de
hand gebroken: de grens, de overlapdrempel, de markering, de vergelijking en het
strippen van commentaar maken elk een andere test rood. De overlapdrempel liet
eerst alleen de waardetest rood worden; de fixture had een andere signatuur dan het
origineel, dus er viel niets te vergelijken. Dat is hersteld.
