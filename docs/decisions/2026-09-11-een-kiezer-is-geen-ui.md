# Een kiezer is geen UI

**Datum:** 11-09-2026 · **Issue:** QS8-423 · **Migratie:** geen · **Aanleiding:** de weekaudit van 10-09-2026

## 1. Wat er mis was

📏 Gemeten in de audit: drie bestanden in `src/shared/ui` importeerden de datalaag.

```
src/shared/ui/kiesFoto.ts:3          import { base64NaarBytes } from '../../modules/auth';
src/shared/ui/useChatbijlage.ts:5    import { keurChatdoc, keurChatfoto } from '../../modules/buddies';
src/shared/ui/useDocumentOpenen.ts:5 import { tekenChatdoc } from '../../modules/buddies';
```

Alle drie zijn **waarde**-imports en alle drie stonden in `shared/ui/index.ts`, dus
`import { Button } from '@/shared/ui'` trok sindsdien de barrel van `modules/buddies` mee.

`eslint.config.js` verbood sinds QS8-207 de **omgekeerde** richting — de datalaag mag
niets uit `shared/ui`, ook geen type — maar voor deze richting bestond geen regel, geen
controle en geen dossierrij. Eén kant had een essay en een lintfout; de andere kant was vrij.

## 2. De reden die in de koppen stond klopte, en was tóch niet het antwoord

De drie bestanden legden hun plaatsing uit, en eerlijk: `expo-image-picker` sleept
react-native mee, en een module-barrel wordt geïmporteerd door tests die in Node draaien.

📏 **Opnieuw nagemeten op 11-09-2026**, want een meting van weken oud is een aanname.
`kiesFoto` tijdelijk geëxporteerd uit `modules/buddies/index.ts`:

```
ReferenceError: __DEV__ is not defined
  tests/rls/doorloop.test.ts → 1 failed | 3 passed
```

De beperking staat dus nog. Maar hij is een **testomgevingsprobleem** en geen domeingrens,
en de prijs was dat een componentenbibliotheek het chatdomein ging kennen: `keurChatfoto`,
`keurChatdoc`, `tekenChatdoc`.

⚠️ **Naar `modules/buddies` verhuizen lost niets op.** Dan importeert de datalaag
`shared/ui` — precies wat QS8-207 verbiedt. De hooks hebben allebei nodig: een kiezer uit
`shared/ui` én de keuring uit `modules/buddies`. Twee lagen, en geen van beide mag de ander.

## 3. Waar de knoop zat

In de aanname dat een fotokiezer UI is.

Een kiezer rendert niets, draagt geen label en kent geen toon — de drie dingen die
`shared/ui` volgens zijn eigen lintmelding bezit. Hij opent een systeemvenster en geeft
bytes terug. `kiesFoto.ts` schreef dat zelf al op:

> een fotokiezer is geen module-communicatie maar een platformvermogen; hij hoort in de
> laag die het platform al kent.

Die zin klopte. Alleen bestond die laag nog niet, en toen is hij in `shared/ui` beland.

## 4. Wat er nu staat

| laag | wat erin hoort | mag importeren |
|---|---|---|
| `src/shared/kiezers` | platformvermogens: `kiesFoto`, `kiesDocument`, `naarVerzending` | `expo-*`, andere shared-modules |
| `src/modules/<naam>/react.ts` | de hooks die een vermogen aan een domein knopen | `shared/kiezers`, de eigen module |
| `src/shared/ui` | componenten, labels, toon | geen `modules/**` — **nieuwe lintregel** |
| `src/modules/<naam>/index.ts` | de datalaag | geen `shared/ui` — regel uit QS8-207 |

De drie hooks wonen nu bij hun domein: `useChatbijlage` en `useDocumentOpenen` in
`modules/buddies/react.ts`, `useBewijsfotokeuze` in `modules/completions/react.ts`.
`base64NaarBytes` — een base64-decoder die van geen enkel domein weet — is van
`modules/auth/avatar.ts` naar `shared/afbeelding` gegaan, naast `ontdoeVanMetadata()`:
de twee helften van dezelfde handeling.

⚠️ **Waarom een tweede toegangspunt en niet gewoon `index.ts`.** De grens is niet "React"
maar "expo of react-native". React zelf importeert prima in Node; `lib/supabase` trekt
react-native mee en is te overleven omdat de RLS-tests hem mocken (`vi.mock` in
`doorloop.test.ts`). Een `expo-*`-import dekt geen enkele mock. `index.ts` blijft daarom
vrij van het platform; `react.ts` is waar het wél mag.

## 4a. De grendel is geijkt, en de eerste vorm was stil dood

De regel uit de tabel hierboven is niet één lintregel maar twee, en dat is een uitkomst van
de ijking en geen ontwerp vooraf. Vier vormen waarin je hier een import kunt schrijven, elk
los aangeboden aan `src/shared/kiezers/kiesFoto.ts`:

| vorm | `no-restricted-imports` | `import/no-restricted-paths` |
|---|---|---|
| `import … from '../../modules/goals/schemas'` | rood | rood |
| `import … from '@/modules/goals/schemas'` | rood | rood |
| `await import('../../modules/goals/schemas')` | **groen** | rood |
| `await import('@/modules/goals/schemas')` | **groen** | rood |

📏 `no-restricted-imports` hangt aan `ImportDeclaration`; een dynamische import is een
`ImportExpression` en glipt er onderdoor. Dat is hier geen theoretisch gat:
`src/modules/ai/plan-toepassen.ts` gebruikt `await import('../goals')` op **twee** plekken
in productiecode om een cykel te breken, en er staan er veertien in de repo. Het is dus een
idioom dat dit project kent en dat binnen handbereik van de volgende schrijver ligt.
`import/no-restricted-paths` kijkt naar het opgelóste pad en dekt alle vier; de eerste
regel blijft staan als tweede net, omdat zijn melding QS8-423 op de importregel zelf noemt.
Er is een tweede zone voor `src/lib/supabase.ts` — de datalaag één deur verder, waar een
`shared`-bestand dezelfde knoop legt zonder ooit langs `modules/` te komen. Met opzet dat
bestand en niet de map: `lib/observability` en `lib/env` zijn dwarsdoorsnijdend.

⚠️ **Vier vormen is niet alle vormen.** Beide regels lezen de bronstring, dus
`const p = '…/modules/…'; await import(p)` ontsnapt — 📏 gemeten, groen bij allebei. En
testbestanden staan in `ignores`, wat vandaag niet leeg is: `src/shared/ui/tips.test.ts` en
`src/shared/ui/categoriemerk.test.ts` lenen allebei `CATEGORIEEN` uit `modules/goals`. De
grens is dus *"shared kent de datalaag niet búíten tests"*, en dat is een keuze — een test
die een moduleconstante leent om shared-gedrag te toetsen, dupliceren is erger. Allebei de
grenzen staan als eigen geval in de test hieronder, zodat ze opvallen als ze verschuiven.

⚠️⚠️ **De eerste poging was `no-restricted-syntax` met een `ImportExpression`-selector, en
die was stil dood.** Het tijdblok verderop in `eslint.config.js` zet diezelfde regelnaam,
staat láter, en dekt `src/**` — en flat config **vervangt** de opties van een regel in
plaats van ze samen te voegen. 📏 `eslint --print-config src/shared/kiezers/kiesFoto.ts`
gaf alleen de drie tijdselectors terug; de mutatie bleef groen. Dat is precies de klasse
die CLAUDE.md beschrijft bij *"een grendel die alleen in een comment staat"*: de regel
stond er, las goed, en deed niets.

Nagelopen of het elders in dat bestand ook gebeurt — drie regelnamen worden in meer dan één
blok gezet (`no-empty`, `max-lines-per-function`,
`@typescript-eslint/no-restricted-imports`), en 📏 `--print-config` op vier bestanden laat
zien dat geen van die paren elkaar in `files` overlapt. Geen tweede slachtoffer.

### De ijking staat in een test, en niet alleen hier

`tests/scripts/laaggrenzen.test.ts` voert beide grenzen langs `ESLint.lintText()` — elke
vorm die rood moet worden én elke vorm die met rust gelaten moet worden — plus een blok dat
via `calculateConfigForFile()` toetst dat de regel de opgeloste config overléeft. Dat laatste
blok is er precies om de stille dood hierboven: een gemiste vorm en een opgegeten regel zijn
twee verschillende fouten, en de gevallen vinden de tweede alleen bij toeval.

📏 Vier mutaties, elk apart, en elke keer is gekeken wélke tests omvielen:

| mutatie | `npm run lint` | rood in de suite |
|---|---|---|
| `import/no-restricted-paths` volledig weg | groen | 12 van 24 |
| alleen de `lib/supabase`-zone weg | groen | **precies de 2** lib-gevallen |
| regelnaam terug naar `no-restricted-syntax` (de stille dood) | **groen** | 12 van 24 |
| het QS8-207-patroon ontkracht | groen | **precies de 2** QS8-207-gevallen |

⚠️ De derde rij is de reden dat deze test bestaat: `eslint.config.js` laadt, `npm run lint`
geeft **exitcode 0**, en er is geen grendel meer. Niets anders in dit project ziet dat.

⚠️ De eerste poging tot die derde mutatie was een misser die het vermelden waard is: de
splice liet een syntactisch kapotte config achter, en toen vielen alle 24 om — mét
`LINT EXIT=2`. Dat is *"er werd iets rood"*, niet *"mijn grendel werd rood"*. Pas met een
geldige config die alleen de regelnáám hergebruikt, meet de mutatie wat ze belooft.

⚠️ **De QS8-207-regel de andere kant op heeft het gat wél nog**, en dat is met dezelfde
twee mutaties gemeten op `src/modules/buddies/api.ts`: statisch rood, `await
import('../../shared/ui')` groen. Dat is geen bevinding van deze verhuizing en het gaat
niet in deze branch mee — het staat als eigen issue, met deze meting erin.

## 4b. De andere richting erbij, en één blok in plaats van twee (QS8-425)

De regel van QS8-207 — de datalaag importeert niets uit `shared/ui` — had hetzelfde gat als
hierboven: 📏 statisch rood, `await import('../../shared/ui')` groen. Zelfde oorzaak, want
het is dezelfde `no-restricted-imports`.

**De voor de hand liggende fix was een tweede `import/no-restricted-paths` in het
modules-blok, en die is niet gekozen.** Dan staan er twee blokken die dezelfde regelnaam
zetten, en dat is precies de constructie die §4a beschrijft als stil dood — vandaag onschadelijk
omdat `src/modules/**` en `src/shared/**` elkaar niet overlappen, en onschadelijk *zolang*
niemand een van beide `files` verbreedt. Een grendel die afhangt van een eigenschap die
niemand bewaakt, is geen grendel.

Alle drie de zones staan daarom in **één** blok over `src/**`. Dat kan omdat
`no-restricted-paths` zichzelf al per richting scoopt via `target` — het blok óók nog eens
op `files` scopen voegde niets toe en kostte alleen dat risico.

| target | from | grens |
|---|---|---|
| `./src/shared` | `./src/modules` | QS8-423 |
| `./src/shared` | `./src/lib/supabase.ts` | QS8-423, de datalaag één deur verder |
| `./src/modules` | `./src/shared/ui` | QS8-207, sinds QS8-425 ook dynamisch |

De twee patroonregels blijven staan als tweede net op de statische vormen: hun melding valt
op de importregel zelf, en dat leest korter dan een opgelost pad.

### Wat de ijking deze ronde vond, en het was mijn eigen test

📏 Vijf mutaties, elk apart, en elke keer is gekeken wélke tests omvielen:

| mutatie | `npm run lint` | rood in de suite |
|---|---|---|
| de nieuwe zone (`modules ← shared/ui`) weg | **groen** | precies de 4 die eraan hangen |
| de zone `shared ← modules` weg | groen | 8 |
| een láter blok zet dezelfde regelnaam | rood, om een ándere reden | 7, incl. de zonecontrole |
| het QS8-207-patroon ontkracht | groen | **eerst 0 — zie hieronder**, nu precies 1 |
| het QS8-423-patroon ontkracht | groen | precies 1 |

⚠️⚠️ **Die vierde rij is de vondst.** Het `group`-patroon vervangen door een pad dat niet
bestaat liet aanvankelijk **alle 36 tests groen**. Twee dingen vielen samen: de regelnáám
blijft staan als je alleen het patroon leegmaakt, dus de controle die op de naam keek merkte
niets — én de gevallen zélf werden nog steeds rood, want sinds dit issue dekt de padregel
diezelfde grens. **Twee netten boven elkaar verbergen elkaars gaten.**

De controle kijkt daarom niet meer of de regelnaam er is, maar of de *zones* en de
*patronen* er zijn. Dat is dezelfde les als §4a, één laag dieper: daar was de regel weg en
leek hij aanwezig, hier is de regel aanwezig en is zijn inhoud weg.

⚠️ En opnieuw kostte het een misser om daar te komen: de mutatie voor de stille dood liet
de eerste keer een syntactisch kapotte config achter, `LINT EXIT=2`, alles rood. Dezelfde
val als in §4a, in dezelfde sessie, bij dezelfde soort ingreep. **Een mutatie die het
bestand sloopt, meet niets** — controleer dat de config nog laadt vóór je de uitslag leest.

## 5. Waarom de vier diepe imports van `metGetekendeAvatars` blijven

`buddies/weekafsluiting.ts`, `buddies/api.ts`, `buddies/chat.ts` en
`completions/approvals.ts` halen `metGetekendeAvatars` rechtstreeks uit
`modules/auth/avatar.ts` in plaats van uit de barrel. Dat blijft zo, en dit is de reden —
één keer, in plaats van vier gekopieerde blokken.

📏 **Ik heb geprobeerd het op te lossen en het is fout gegaan, en dat hoort hier te staan.**
Eerst gemeten of de auth-barrel expo meetrekt: **nee**. Dus de vier imports omgezet naar
`from '../auth'`. Daarna viel
`tests/beloftes/gekoppelde-doelen-kappen-niet-stil-af.test.ts` om met
`Flow is not supported … react-native/index.js`.

De meting was te smal: ik toetste op `expo-*` en niet op `react-native` zelf.

```
src/modules/auth/index.ts → src/modules/auth/api.ts → react-native
```

`api.ts` is de auth-datalaag en is niet goedkoop te verplaatsen. De barrel is dus
expo-vrij en niet react-native-vrij, en dat verschil is precies het verschil tussen
"de tests mocken het" en "de tests vallen om".

⚠️ **De les is niet "beter meten" maar wélke vraag je stelt.** `expo-*` was de vraag uit
de koppen van de drie verhuisde bestanden; de vraag die telt is *"trekt dit het platform
mee"*, en `react-native` is daar de bredere term voor. De test ving het binnen een minuut —
dat is wat een beloftetest hoort te doen.

## 6. Wat de verhuizing zelf heeft gevangen

⚠️⚠️ CLAUDE.md noemt een verhuizing de gevaarlijkste beweging die er is: *de tests
verhuizen mee en blijven groen, want ze toetsen wat er in het bestand staat en niet wat het
bestand belóófde.*

📏 Hier gebeurde het tegenovergestelde, en dat is het bewijs dat QS8-395 goed gebouwd is:
`tests/beloftes/geen-foto-verlaat-de-app-met-metadata.test.ts` werd **rood op drie
gevallen** zodra `kiesFoto.ts` verhuisde — de twee die het pad lezen, én *"kent elke
fotokiezer die er is"*, want de zeef vond het bestand op zijn nieuwe plek terwijl de
`INGANGEN`-lijst nog naar de oude wees. Zonder die tweede helft was de suite groen gebleven
op een lijst die niets meer aanwees.

Nagelopen per verplaatst bestand:

| bestand | belofte | staat nog onder test |
|---|---|---|
| `kiesFoto.ts` | knipt EXIF, valt dicht als dat mislukt | `geen-foto-verlaat-de-app-met-metadata.test.ts` (5) |
| `base64NaarBytes` | ongeldige invoer geeft `null`, geen halve buffer | `tests/beloftes/avatar.test.ts` (6) |
| `verzendbijlage.ts` | `naarVerzending()` | `een-document-voert-niets-uit.test.ts` |
| `useChatbijlage` / `useDocumentOpenen` / `useBewijsfotokeuze` | geen — ook vóór de verhuizing niet | zie hieronder |

⚠️ Die laatste rij is geen bevinding van deze verhuizing maar wel een bevinding: de drie
hooks hadden nul gedragstests, en hun eigen koppen zeggen dat testbaarheid de reden was om
ze los te trekken. Dat staat als eigen rij in `docs/ENGINEER-REVIEW.md` en is bewust niet
in dit issue meegenomen — tests schrijven voor code die je diezelfde commit verplaatst,
maakt niet duidelijk wát er getoetst wordt.

## 7. Meer dan vijftien bestanden

Dat is een afweging onder *Beslisbevoegdheid* en geen gate, maar hij hoort verantwoord.
📏 De verhuizing raakt **negenentwintig** bestanden — vijf hernoemd, vier nieuw, twintig gewijzigd — en is niet kleiner te maken: `shared/ui` schoonmaken
vraagt dat de drie hooks weg gaan, die hooks vragen dat de kiezers ergens staan waar de
datalaag bij mag, en dat is precies de nieuwe laag. Elk deel los landen zou betekenen dat
er tussendoor een stand is waarin allebei de lintregels rood staan.

## 8. Wat dit niet is

- **Geen nieuwe grendel op "een barrel trekt het platform niet mee".** Dat is het mechanisme
  onder dit hele issue en het verdient er een; het is een eigen issue omdat het een controle
  plus ijking is en geen verhuizing.
- **Geen oplossing voor `Resultaat<T>`** dat in drie bestanden uit `../goals` geleend wordt
  in plaats van uit `shared/api`. Aparte drift, aparte rij.
- ~~Geen reparatie van het dynamische gat in de QS8-207-regel~~ — **gedaan in QS8-425**,
  zie §4b. Het stond hier als vervolgissue omdat het de andere richting is; het is daarna
  als eigen branch gebouwd, niet alsnog aan deze geplakt.
