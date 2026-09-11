# Een lintregel waar de code omheen boog — 11-09-2026

**Issue:** QS8-424
**Raakt:** `supabase/functions/rollover/index.ts`, `supabase/functions/notificaties/index.ts`,
`scripts/regel15-controle.mjs`, `tests/beloftes/recap-mislukking-verlaat-de-job.test.ts`

---

## 1. Wat dit is, en waarom het een eigen issue was

QS8-422 bracht `supabase/functions/` onder coderegel 15 en zette de lengte met
zoveel woorden buiten scope: *"`draaiRollover` van 710 naar iets leesbaars
brengen is een refactor met eigen risico op de job die elk uur draait."* Dat
oordeel klopte, en dit is dat eigen issue.

📏 Uitkomst, gemeten met `skipBlankLines` en `skipComments`:

| Functie | Voor | Na |
| -- | -- | -- |
| `draaiRollover` | **282** | **38** |
| `draaiNotificaties` | **203** | **30** |
| ratelplafond `supabase/functions/` | 6 | **4** |

Wat er nog boven de vijftig zit: `stuur()` in de notificatiejob (61, bestond al)
en drie functies in `doelcoach/`. Alle vier vielen buiten dit issue.

## 2. De bewijsvorm, want tests zijn er niet

Er is geen Deno-runtime in de poort. De enige bruikbare methode is dezelfde die
de security-review op QS8-422 gebruikte, en hij is hier **na elke afzonderlijke
verplaatsing** gedraaid:

- beide versies door de TypeScript-parser (`parseErrors` nul aan beide kanten);
- de **multiset van álle string- en template-literals** vergeleken.

Die tweede is de scherpe. Een verplaatsing verandert de boom per definitie, maar
hij mag geen letter berichttekst aanraken — en juist daar zit het gedrag dat een
mens te zien krijgt.

📏 Over de hele reeks bleef die multiset op **nul** verdwenen of gewijzigde
literals staan. Erbij kwamen er **tien voorkomens van vijf distincte waarden**,
stuk voor stuk nagelopen: `'chatfotos'` en `'chatdocs'` in de
typeannotatie van `wisBlokgewijs`, en `'gedaan'`, `'overgeslagen'`,
`'zonderToken'` als stuurwaarden in het returntype van `meldEenProfiel`. Geen
enkele daarvan is berichttekst.

⚠️ **Numerieke literals zijn er uit gelaten na de eerste ronde.** Elke nieuwe
teller voegt een `0` toe, en die ruis verbergt het signaal waar het om gaat.

⚠️ **Het instrument staat niet in de repo.** Het is twintig regels — parser,
twee `forEachChild`-lussen, een multiset-vergelijking — en een script dat geen
regel bewáákt hoort niet in `scripts/` te wonen met een register en een test
eromheen. Wie deze refactor overdoet, schrijft hem opnieuw; de vorm staat
hierboven.

## 3. Wat de `continue`s deden, en dat was niet één ding

De gevaarlijkste stap. `continue` betekent iets anders per lus, en na een
verplaatsing kan hij stilletjes meer of minder overslaan.

| Waar | Wat hij oversloeg | Wat hij nu is |
| -- | -- | -- |
| in de weekdoellus (`vrijstelFout`, `gemistFout`) | dít weekdoel | `return GEEN_TELLING` |
| op de profiellus (`openFout`) | dit profiel **én** het inschuiven **én** het herberekenen | `null` uit `sluitVerstrekenWekenAf()` |
| op de profiellus (tijdzone, geen apparaten) | dit profiel | `null` / een stuurwaarde |

⚠️ **Waarom `openFout` een `null` werd en geen lege telling:** een telling van
nul ziet er voor de aanroeper hetzelfde uit als "er viel niets af te sluiten", en
dan zouden het inschuiven en het herberekenen alsnog draaien. Dat is precies het
soort verschil dat een refactor wegpoetst zonder dat iets rood wordt.

## 4. De eigenlijke winst is geen kortere functie

De security-review op QS8-422 wees één plek aan als fragiel geworden: de
adempauzetak in de rollover. Die stond daar als een ternair met twee losse
guards, en het feit dát `vrijstelFout` niet-null impliceerde dat `pauze` waar
was, stond alleen in een comment — twintig regels boven de plek waar het minpunt
geboekt wordt.

Die vorm bestond **alleen omdat het blok toen ín twee lussen zat**: `max-depth`
liet er geen `if` in een `if` toe. In een eigen functie is die nestingruimte er
weer, dus de gewone vorm kon terug:

```ts
if (pauze) {
  const { error: vrijstelFout } = await db …;
  if (vrijstelFout) { … return GEEN_TELLING; }
  return { gemist: 0, vrijgesteld: 1, gered: 0 };
}
```

De invariant is daarmee **verdwenen** in plaats van beter opgeschreven.

> **Een lintregel die code laat buigen, verplaatst het probleem naar de lezer.**
> Dat de functie korter werd is bijvangst; dat ze niet meer om de regel heen
> hoeft te buigen is het punt.

## 5. Een belofte-test die naar de verkeerde helft greep

`tests/beloftes/recap-mislukking-verlaat-de-job.test.ts` werd rood. Terecht
gekeken: de belofte stond overeind — het runrapport draagt `recapsOvergeslagen`
nog gewoon — maar de toets zocht met een regex de **interne variabelenaam** op en
legde díé naast het antwoord. Toen die variabele naar `maakSeizoensrecaps()`
verhuisde, wees hij naar niets.

Regel 18 vraag 4 in zuivere vorm: *grijpt deze test naar een plek in plaats van
naar de belofte?* De belofte is de **uitvoersleutel** — dat is wat een mens in
het runlog naleest — en niet hoe de variabele erboven heet.

⚠️ **En de ijkingslijst in de kop van dat bestand zei het al.** Mutatie C luidt
letterlijk *"`recapsOvergeslagen` uit het antwoord van de rollover → 1 rood"*. De
code was van zijn eigen ijking afgedreven. 📏 Opnieuw geijkt met exact die
mutatie: één rood, op die toets.

## 6. Wat er níet gebeurd is

**Niets naar `src/`.** Acceptatiecriterium 5 vroeg dat, en 📏 gemeten valt er
niets substantieels onder: de enige pure uitdrukkingen zijn eenregelige `.map()`,
`.filter()` en `new Set()` binnen functies die verder db-gebonden zijn. Het
échte rekenwerk — de cyclusberekening en de paginering — woont al in
`src/shared/time` en `src/shared/bladeren`.

**`doelcoach/` niet aangeraakt**, en `stuur()` in de notificatiejob ook niet. Het
issue noemt twee functies; die twee zijn gedaan. De vier die overblijven staan in
het ratelplafond en horen verder omlaag in een eigen ronde.

**Geen gedragswijziging**, ook niet waar die verdedigbaar was. De vier
weggelegde bevindingen uit de security-review op QS8-422 — de dode `break`, het
ongetelde `'mislukt'`, de kosten van `previousCycle()` — staan nog als rij in
`docs/ENGINEER-REVIEW.md` en zijn hier bewust blijven liggen.

## 7. Wat de security-review erbij vond

Regel 19 vroeg hem, want dit raakt de puntenboeking. Hij heeft de zeven vragen
uit de opdracht stuk voor stuk mechanisch nagegaan — een multiset-diff van álle
codelregels met elke verdwenen regel toegewezen aan zijn nieuwe vorm, en alle
negen `continue`s van de oude rollover apart — en vond **geen enkel
gedragsverschil**. Wat hij wél vond, en allebei terecht:

**1. Mijn reparatie van de belofte-test was op één as zwakker dan wat hij
verving, en dat is de ernstigste bevinding van deze ronde.**
`toMatch(/recapsOvergeslagen\s*:/)` toetst dat de **sleutel** in het runrapport
staat, niet dat de **waarde** uit de recapstap komt. 📏 Nagespeeld en niet
beredeneerd: `recapsOvergeslagen: 0` en `recapsOvergeslagen:
seizoensrecaps.recaps` bleven allebei groen — precies de twee gevallen die het
foutbericht van die assertie belooft te vangen. De oude vorm ving ze wél.

> **Een grendel die groen blijft terwijl de belofte breekt, is erger dan geen
> grendel — want je vertrouwt hem.**

De assertie eist nu allebei, en mutatie **C′** (de waarde op een vaste `0`) staat
in de ijkingslijst van dat bestand. 📏 Beide mutaties opnieuw gedraaid: elk één
rood, op die toets.

⚠️ De les die hierbij hoort is smaller dan "beter opletten". Bij het repareren
van een test die naar de verkeerde plek greep, is de verleiding om de greep te
verslappen tot hij niet meer kán breken. **Vraag bij elke vervanging welke
mutaties de oude vorm ving die de nieuwe doorlaat** — en draai ze.

**2. Het beslisdocument zat niet in de commit.** De commit-boodschap verwees
ernaar, het bestand stond untracked in de werkboom, en `padverwijzing:controle`
vangt dat niet: die leest geen commit-boodschappen en het pad stond in geen
enkel gecommit bestand. Rechtgezet.

**Drie kleinere, alle drie verwerkt:** een sluitende `}` op kolom 0 en een
`return` op vier spaties in de rollover, een lege regel na een handtekening in
notificaties, en het returntype van `verwerkAlleProfielen` dat `code` liet
vallen. Dat laatste is meer dan cosmetiek: mét `code?: string` erin kon de cast
in beide jobs weg, en die stond er alleen omdat `profielFout` een `let` in een
closure was. Een refactor die een cast overbodig maakt en hem laat staan, laat
een verklaring achter die niet meer klopt.

⚠️ **Eén bevinding heb ik nagemeten en niet overgenomen.** De review noemde mijn
AST-vergelijking een *set*-diff die een verdubbelde of half-verdwenen literal
niet zou zien. Dat klopt niet: het instrument telde voorkomens per waarde en
rapporteerde ze als `0→3`. Wat wél terecht is, is de precisie van mijn eigen
formulering: het zijn **tien nieuwe voorkomens van vijf distincte waarden**, en
"vijf nieuwe literals" hierboven las alsof het er vijf waren. Zo staat het nu in
§2.

De `deno fmt`-bevinding is niet hier gerepareerd maar staat als rij in
`docs/ENGINEER-REVIEW.md`: een formatter aanzetten op ~6.700 regels is een eigen
wijziging met een eigen diff, en niet iets om in de slipstream van een refactor
te doen.

## 8. Wat hierna nog met de hand moet

⚠️ De gedragsgelijkheid is bewezen op de **bron**, niet op de gedéployde functie.
Dat is dezelfde grens als bij QS8-422, en hij weegt hier zwaarder omdat er meer
verplaatst is. De rij van 11-09 in `docs/ENGINEER-REVIEW.md` schrijft de meting
voor die erbij hoort: ná de deploy één rollover- en één notificatieronde draaien
en het JSON-runrapport naast dat van de ronde ervóór leggen. `profielen` moet
exact gelijk zijn; `gemist` en `vrijgesteld` bij eenzelfde populatie ook.
