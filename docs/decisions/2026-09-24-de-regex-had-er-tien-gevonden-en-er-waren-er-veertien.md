# De regex had er tien gevonden, en er waren er veertien

**Datum:** 24-09-2026
**Issue:** QS8-599 (bijvangst van QS8-597)
**Status:** gebouwd
**Raakt:** tien scripts in `scripts/`, `tests/scripts/hoofdwacht.test.ts` (nieuw)

## 1. De belofte

Een module uit `scripts/` importeren hoort **niets** te doen. Het werk zit achter
een main-guard, en die draait alleen als het bestand rechtstreeks aangeroepen
wordt.

📏 **Empirisch vastgesteld en niet afgeleid.** Met `process.argv.length = 1` —
precies de toestand bij een import zonder bestand — werpt
`pathToFileURL(undefined)` een `TypeError [ERR_INVALID_ARG_TYPE]`:

| script                  | met de wacht | bij import |
| ----------------------- | ------------ | ---------- |
| `poort.mjs`             | nee          | **werpt**  |
| `stand.mjs`             | nee          | **werpt**  |
| `tekst-controle.mjs`    | ja           | niets      |
| `zonder-commentaar.mjs` | geen guard   | niets      |

## 2. Waarom dit geen regex is geworden

Het issue telde **tien** scripts met een guard zonder de wacht, en die telling
klopte. 📏 Maar er waren er **veertien** stuk:

> `auditkop`, `catalogus-controle`, `ci-controle-draai`, `ci-controles`,
> `dode-exports-controle`, `migratie-hernummer`, `migratie-nieuw`,
> `migraties-controle`, `poort`, `poortstand`, `stand`, `uitrolproza-controle`,
> `vapid-genereer`, `wachtwoord-controle`

⚠️⚠️ **Vier daarvan droegen de wacht keurig en wierpen tóch**, omdat ze
`poort.mjs` importeren — die hem miste. Een controle die regel voor regel naar
de huisvorm zoekt, kent de **importgraaf** niet en had die vier nooit gemeld.

Dat is regel 18 vraag 2 in zijn zuiverste vorm: _"toetst deze test de belofte,
of een eigenschap van het onderdeel?"_ De huisvorm is het onderdeel; _"importeren
doet niets"_ is de belofte. De grendel is daarom een **toets die importeert**, in
een eigen proces met `argv[1]` weg, en eist dat er niets geworpen en niets
geprint wordt.

📏 Na het repareren van de tien bladeren werpt geen van de veertien nog iets —
de vier transitieve zijn meegegaan zonder dat er iets aan is veranderd. Dat is
het bewijs dat de oorzaak in de bladeren zat en niet in de vier.

## 3. De veiligheidsgrens, en waarom hij er is

De toets importeert **alleen scripts met een main-guard**. Dat is geen gemak
maar een grens, en hij is gemeten: 📏 **tien** scripts in `scripts/` hebben
géén guard en dóen iets op moduleniveau.

| script                                                                                               | wat het bij import doet                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `sync-edge-shared.mjs`                                                                               | kopieert **19** bestanden naar `supabase/functions/_shared/` |
| `maak-iconen.mjs`                                                                                    | schrijft **zes** PNG's naar `public/`                        |
| `migratieregister-uitlijnen.mjs`                                                                     | print en slaat zichzelf over                                 |
| `migraties-controle.mjs`                                                                             | draait zijn hele controle                                    |
| `auth-urls`, `db-dump`, `db-types`, `functies-controle`, `migratieregister-controle`, `sentry-proef` | eindigen het proces op een ontbrekende sleutel               |

⚠️ **Dat is bij het meten daadwerkelijk gebeurd.** De eerste probe importeerde
alles, en `sync-edge-shared` en `maak-iconen` hebben hun werk gedáán. De repo
bleef schoon omdat beide idempotent zijn en hun uitvoer al bijstond — dat is
geluk en geen eigenschap, en het is precies de reden dat de grens er nu staat.

⚠️ **De restrisico die blijft**, opgeschreven in plaats van weggepoetst: zet
iemand een guard-regel in zo'n script zónder het werk eronder te verplaatsen,
dan importeert de toets hem alsnog en draait dat werk één keer. Hij wordt er wél
rood van — de uitvoer is dan niet leeg — maar de schrijfactie is dan al gebeurd.

**Die tien scripts zijn een eigen bevinding en geen onderdeel van dit issue.**
Ze staan met hun meting als eigen rij in `docs/ENGINEER-REVIEW.md`.

## 4. De ijking

Stand ervóór gemeten: **3 groen, 0 rood**.

| #   | Mutatie                                                                 | Wat er rood werd                                                                                                                   |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | de wacht weg bij `poort.mjs`                                            | — **de mutatie landde niet**                                                                                                       |
| 1b  | idem, met het juiste anker                                              | _geen enkel script werpt of print_, en de melding noemt `auditkop.mjs` en `ci-controle-draai.mjs`: de transitieve breuk, zichtbaar |
| 2   | de wacht weg bij `vapid-genereer.mjs` — een blad dat niemand importeert | idem                                                                                                                               |
| 3   | de zeef zoekt een tekst die in geen script staat                        | _vindt genoeg scripts dat een lege uitkomst iets betekent_                                                                         |
| 4   | de veiligheidsgrens eruit: élk script wordt geïmporteerd                | _geen enkel script werpt of print_ én _laat scripts zonder main-guard met rust_                                                    |

⚠️ **Rij 1 is dezelfde slip als bij QS8-598, en hij kost elke keer een minuut.**
Mijn `sed` matchte niet op de werkelijke regel, de suite bleef groen, en dat zag
er even uit als _"de wacht doet er niet toe"_. Met het juiste anker viel hij
meteen om. **Een mutatie die niets rood maakt is eerst een verdenking tegen de
mutatie** — en de goedkoopste controle daarop is het anker met de hand terugzien
(`grep -c`) vóór je de suite draait.

📏 Rij 4 is met opzet gedraaid en daarna nagekeken: de repo bleef schoon, en de
toets werd al rood op het eerste script dat zijn proces afsloot, vóórdat de
kopiërende scripts aan de beurt waren.

## 5. Wat dit niet is

- **Geen register.** Er is geen uitzondering: na de reparatie is de lijst leeg,
  en een uitzonderingslijst die niets dekt is een lijst die volloopt — dezelfde
  redenering die al in de kop van `tabelcellen-controle.mjs` staat.
- **Geen controlescript.** De grendel is een toets in `npm test`, en die draait
  in CI. Een tweede mechanisme voor dezelfde belofte is duplicatie.
- **Geen oordeel over de tien zonder guard.** Die klasse is gemeten en
  doorgegeven; dit issue raakt ze niet aan.

## 6. Stand

- `npm run poort`: niets rood; 25 controles ongemeten.
- `tests/scripts/hoofdwacht.test.ts`: 3 groen.
- 📏 Na de reparatie: **nul** scripts met een main-guard werpen of printen bij
  import, tegen veertien ervoor.
