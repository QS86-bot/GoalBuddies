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
