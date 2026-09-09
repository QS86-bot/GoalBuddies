# Het gat is erger dan de botsing

**Datum:** 08-09-2026 · **Issue:** QS8-365

`npm run migratie:nieuw` en `npm run migraties:controle` beantwoordden dezelfde
vraag — welk nummer krijgt de volgende migratie? — en gaven een tegengesteld
antwoord. Allebei met een goede reden, en allebei doende wat hun eigen kop
belooft. Dit document legt vast welke van de twee gelijk heeft en waarom.

## 1. De meting

📏 Drie keer op één dag, bij QS8-363, QS8-305 en QS8-360:

```
main            0207
origin/…qs8-364 0208   (nog niet geland)
werkkopie       0207

npm run migratie:nieuw -- "…"
  ⚠ 1 branch(es) dragen een hoger nummer dan deze werkkopie (207):
      0208  origin/quintenstrijdonk/qs8-364-…
  ✓ supabase/migrations/0209_….sql
```

En met `0209` in de map is CI rood, vóór er ook maar iets aan de migratie zelf
mis is: `0001`…`0207` plus `0209` is een gat van één.

⚠️ De reden dat CI dat anders ziet dan je werkkopie, staat in de meting van het
issue: `actions/checkout@v4` haalt **één** branch op. Er zijn daar geen
`origin/…`-refs, dus ook geen verzachting van de soort *"branch X draagt 0208"*.
📏 Bevestigd in run `34252069006`: de enige melding daar was `Twee migraties met
hetzelfde nummer`, zonder één branchmelding.

## 2. Het besluit

**`migraties:controle` heeft gelijk. `migratie:nieuw` is aangepast: het nummer
sluit aan op de éigen map.**

De branches verdwijnen niet uit beeld — ze bepalen niet langer het nummer maar de
wáárschuwing.

Het onderscheid dat de doorslag geeft is **verwerkte tegenover onverwerkte
schade**:

| | een gat | een botsend nummer |
|---|---|---|
| wanneer merk je het | meteen, op elke push | pas als jullie allebei landen |
| wie lost het op | jij, nu, met een hernummering | wie als tweede merget (QS8-318) |
| wat is er stuk in de tussentijd | de map kan het schema niet opbouwen | niets |
| staat er een afspraak over | nee | ja, sinds QS8-318 |

⚠️ **En het maximum-over-alles vóórkwam de botsing niet eens.** Het keek naar de
branches die er nú zijn; de volgende branch ontstaat morgen. Het verplaatste de
botsing dus alleen, tegen de prijs van een gegarandeerd gat.

📏 Dat is op 08-09 ook zo gelopen: bij QS8-360 nam ik eerst `0209` omdat een
andere branch `0208` droeg, zag `migraties:controle` het gat, en ging terug naar
`0208` — precies de handeling die dit issue beschrijft als "het antwoord van het
gereedschap overrulen".

## 3. Wat er nu uitkomt

Drie signalen in plaats van één, want ze vragen om verschillende handelingen:

1. **Het nummer**: `hoogste in de eigen map + 1`. Aansluitend, dus CI kan er nooit
   rood van worden op een gat dat jij gemaakt hebt.
2. **De botsing**: draagt een nog niet gelande branch datzelfde nummer, dan staat
   die erbij, met de regel van QS8-318 erachteraan. Geen fout, een afspraak.
3. **De verouderde werkkopie**: loopt `origin/main` vóór, dan is het nummer
   daar al bezet en valt er niets te hernummeren — er valt te `pull`en.

⚠️ **Punt 3 is de énige toestand waarin het nieuwe nummer écht fout is**, en van
buiten ziet hij eruit als punt 2. Vandaar twee meldingen en niet één met een
lijstje: twee gevallen op één hoop leert een lezer ze allebei overslaan. Dat is
dezelfde les als bij de versheidsmelding van QS8-247 — één tekst voor "van net"
en "van eergisteren" leest als een disclaimer.

## 4. Waarom niet de andere kant

Optie 2 uit het issue was `migraties:controle` het verschil laten leren tussen een
gat onder `main` en een gat dat een openstaande branch nog vult. Dat kán niet waar
het moet werken: in CI is die informatie er niet, en een `git fetch` toevoegen
maakt de uitslag van de poort afhankelijk van bereikbaarheid — precies wat de kop
van dat script als reden noemt om er géén te doen.

Optie 3 was het gereedschap zijn eigen antwoord laten relativeren. Dat is wat er
feitelijk gebeurde, met een mens als vertaalslag ertussen, en het is de vorm waar
`migratie-nieuw.mjs` in zijn eigen kop tegen waarschuwt: *een gereedschap dat
bestaat om een botsing te voorkomen, mag zijn juistheid niet laten afhangen van
een handeling die het zelf niet doet.*

## 5. De ijking

⚠️ **De ijking hoort aan de CI-kant en niet alleen aan de scriptkant**, want daar
gaat het mis: lokaal ziet `migraties:controle` de branch die het gat vult en
zwijgt erover. `tests/scripts/migratie-fetch.test.ts` heeft daarom een tweede
kloon met `--single-branch` — één remote ref, zoals `actions/checkout@v4`.

📏 Vier mutaties, één per grendel:

| Mutatie | Wat er rood werd |
|---|---|
| terug naar het maximum over alle branches | de vier tests over het nummer |
| de botsingswaarschuwing eruit | "noemt de branch die datzelfde nummer draagt" |
| de pull-melding eruit | "zegt dat je moet pullen als origin/main voorloopt" |
| de gatentelling uit `migraties:controle` | "terwijl N+2 daar rood is op een gat" |

## 6. Wat er onderweg opviel

📏 `letterversies.mjs` ontbrak in `HULPSCRIPTS` van dat testbestand, en dat was
niet te zien: geen enkele test liet `migraties-controle.mjs` daar tot het eind
lopen. De hulpfunctie vangt de exitcode, en de bestaande tests kijken alleen of er
gefetcht is — de controle viel dus om op een ontbrekende import en telde als "rood
zoals verwacht". Zodra een test zijn **uitslag** leest, moet die lijst kloppen.

Dat is regel 18, vraag 3 op de opstelling in plaats van op de test: een fixture
die nooit tot het eind gedraaid heeft, is een aanname.
