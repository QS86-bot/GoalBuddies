# Een melding hoort bij de richting die hij gevonden heeft

**24-09-2026 — QS8-616.**

## Hoe dit boven kwam

`main` stond rood op `audit:controle`, en niet door een commit. De poort was
groen op `523782a` en er is daarna niets aan `package.json` veranderd; `npm
audit` haalt zijn oordeel bij de advisory-database, en die is veranderd.
`image-size` wordt niet meer gemeld.

Dat is precies waar deze controle voor bestaat: hij meldt **verandering** ten
opzichte van wat er met een bouw nagekeken is, in plaats van een drempel te
eisen die hier per definitie rood zou staan.

## De bevinding zat in de melding

De controle detecteert **drie** soorten verandering — een pakket dat erbij komt,
een dat veranderde, en een dat wegvalt — en printte voor alle drie dezelfde
slotzin:

> Een verandering hier betekent dat de bouw-meting verlopen is (…) Draai
> `npm run build` en grep in `dist/` op een stringliteraal.

Voor de eerste twee klopt dat. Voor de derde niet: er is geen kwetsbaarheid meer
om een bundel-meting over te doen. Wie dat advies tóch opvolgt, bouwt tien
minuten en concludeert daarna dat de controle onzin gaf.

⚠️⚠️ **Een grendel die je naar de verkeerde handeling stuurt, is duurder dan
een die zwijgt.** Hij verliest zijn gezag, en dat is dezelfde reden waarom dit
project geen controles wil die altijd rood staan: allebei leer je ze overslaan.
De kop van dit script legde dat al uit voor de drempel; hij deed het niet voor
zijn eigen advies.

## Wat er nu staat

`slotwoord()` print per richting:

- **meetbaar** (nieuw of veranderd) → bouw en grep, ongewijzigd;
- **verdwenen** → de rij mag eruit, maar **meet het**: draai
  `npm audit --omit=dev --json` en kijk of de advisory-nummers uit die rij er
  echt niet meer in staan. Een pakket dat alleen van naam of van ouder wisselde,
  hoort een rij te houden. Zet de datum en die nummers in het commit-bericht.

Allebei tegelijk kan, en dan staan er twee instructies — want dan zijn er twee
handelingen.

## De meting waarop `image-size` weg is

📏 `npm audit --omit=dev --json` op 24-09-2026: de nummers **1138808** en
**1138809** komen er niet meer in voor. De vier resterende registerrijen —
`uuid`, `@xmldom/xmldom`, `js-yaml` en `decode-uri-component` — komen er alle
vier nog wel in voor.

⚠️ De kop van het script noemde `image-size` op vier plekken als voorbeeld. Die
zijn meegegaan: een kop die een rij uitlegt die er niet meer is, is precies de
vorm waar dit project vandaag al twee keer voor betaald heeft.

## De ijking

Drie mutaties, en per mutatie is gekeken **wélke** toets rood werd:

| mutatie | wat er rood werd |
| -- | -- |
| de opruim-tak naar de bouw-instructie laten wijzen | *stuurt bij een verdwenen pakket juist níet naar de bouw-meting* |
| de bouw-tak onvoorwaardelijk maken (de oude fout, letterlijk) | dezelfde toets |
| de bouw-tak nooit laten vuren | *stuurt bij een nieuw pakket naar de bouw-meting* én *geeft bij allebei de richtingen allebei de instructies* |

⚠️ De eerste twee raakten dezelfde toets. Dat is geen dekking van de andere
richting, en daarom is er een derde mutatie bij gekomen — **één mutatie per
grendel**, niet één mutatie voor de hele controle.

## Wat hier niet mee besloten is

De vier resterende kwetsbaarheden blijven staan. Ze hangen onder `expo` en de
kop van het script legt uit waarom een drempel daar geen controle maar een
uitknop wordt.
