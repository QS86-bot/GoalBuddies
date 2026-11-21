# Een kaal nummer in het te verhuizen bestand is ook geen bewijs (QS8-765)

Besluit van Quinten, 20-11-2026 (V1 = A, V2 = ja).

## Wat er gebeurde
`npm run migratie:hernummer` behandelde het bestand dat verhuist met
`gedeeld: false`: elk kaal oud nummer erin werd herschreven, onder de aanname
dat het over zijn eigen nummering ging. 📏 Bij 0299 → 0315 (PR #689) werd
`0299–0302` in de kop `0315–0302`; die getallen wezen naar productiemigraties
van een ander issue.

## Besluit
Ook in het te verhuizen bestand worden alleen herschreven: de eigen kopregel
(`herschrijfKop`) en de volle naam (`NNNN_slug`). Een kaal nummer wordt
gemeld, met regel, en niet aangeraakt. Een kaal getal is niet te onderscheiden
van een verwijzing naar een ander bestand.

## Prijs
Een regel als `Draai 0299 terug` in de body wordt handwerk. Dat is de veilige
kant: een vergeten regel valt op bij het lezen, een stil herschreven verwijzing
naar een ander niet. Zelfde afweging als QS8-277 en QS8-580.

## Toetsing
`tests/scripts/migratie-hernummer-botsing.test.ts` draait het echte script en
bevat het incident (`0009–0012` in een bestand dat 0009 → 0010 gaat). Met de
hand geijkt: `gedeeld: true` terug naar `false` maakt precies twee tests rood.
