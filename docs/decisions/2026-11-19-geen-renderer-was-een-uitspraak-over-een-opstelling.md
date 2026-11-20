# "Er is geen renderer" was een uitspraak over een opstelling en niet over de code

Datum: 19-11-2026 · Issue: QS8-738 (vervolg op QS8-714)

## Waarom dit een besluit is

QS8-714 gaf het project een renderopstelling voor hooks (`jsdom`, `react-dom/client`,
`act`). Op **24 bestanden** staat nog dat er geen renderer is
(`grep` op "geen renderer", "geen rendertestopstelling", "geen componenttest",
"geen .test.tsx"; 19-11-2026). Een deel daarvan gebruikt dat als **reden**: voor een
functie die uit een component is getrokken, of voor een bronbewaking in plaats van een
render. Een reden die niet meer klopt wordt gelezen als een reden om niet te twijfelen
(`CLAUDE.md`, over onderbouwde afwijkingen), dus dit besluit zegt wat er nu waar is,
wat dat voor elke plek betekent, en wat er niet gebeurt.

## De meting

Alles hieronder is op 18/19-11-2026 gemeten met wegwerpproeven buiten de repo-config
(een eigen vitest-config in de scratchpad; de proefbestanden zijn verwijderd, de
werkboom was daarna schoon). Wat **niet** gemeten is staat er expliciet bij.

| Wat | Uitslag | Wat er nodig was |
| --- | --- | --- |
| Een hook renderen | gemeten in QS8-714, 12 tests | `jsdom`, `react-dom/client`, `act` |
| `Button` renderen | rendert, tekst staat in de DOM | `react-native` naar `react-native-web` |
| 39 losse `.tsx`-componenten in `src/shared/ui/` importeren | 36 laden direct; `Screen`, `Taakbalk` en `CategorieMerk` laden niet zonder mocks | zie hieronder |
| De 56 modules waar `src/shared/ui/index.ts` naar verwijst | 55 laden met drie mocks; `useVertrekwacht` vraagt een vierde | `expo-router`, `react-native-safe-area-context`, `@expo/vector-icons/MaterialCommunityIcons`, `expo-router/react-navigation` |
| De 31 schermbestanden in `app/` importeren | **26 laden**, 5 niet | de vier mocks hierboven plus `react-native`; de vijf die falen (`(tabs)/index`, `(tabs)/profiel`, `_layout`, `groep/chat/[id]`, `onboarding/profiel`) vragen `__DEV__` en daarna iets uit expo's runtime (`./ImportMetaRegistry`, een `EventEmitter`); **niet verder uitgezocht** |
| Het uitnodigingsscherm **renderen**, als lid en als niet-lid | het lid ziet "Je zit al in deze groep" en geen "Deelnemen aan deze groep"; het niet-lid ziet "Deelnemen aan deze groep" | die mocks, plus de module-API (`@/modules/auth`, `@/modules/buddies`) |

⚠️ **Dat laatste is wat QS8-708 als "ongemeten" moest laten staan**: dat het scherm
doet wat de beslislogica zegt. Het is nu één keer met de hand gemeten; het staat
nog **niet** onder een test.

⚠️ **De mock van `react-native` doet het werk, en dat is gecontroleerd.**
`vi.mock('react-native', async () => await import('react-native-web'))` per
testbestand is genoeg, en er is **geen alias in de gedeelde vitest-config nodig**,
dus geen enkele bestaande test raakt. Zonder die ene regel faalt dezelfde proef op de
Flow-syntax van `react-native/index.js`.

⚠️ **Wat dit niet bewijst.** `react-native-web` onder jsdom is geen echt apparaat: de
proef zegt niets over native gedrag, layout, gestures of over of `Platform.OS` het
goede pad kiest. Een scherm dat laadt, is ook nog geen scherm dat een gebruiker kan
bedienen; alleen het uitnodigingsscherm is daadwerkelijk gerenderd en bevraagd.

## De inventaris: 24 bestanden

| Waar | Aantal | Wat er staat |
| --- | --- | --- |
| `tests/beloftes/` | 12 | koppen die uitleggen waarom het een bronbewaking is en geen render |
| `src/shared/ui/` | 5 | drie broncommentaren (`wachtwoordveld.ts`, `tabbladen.ts`, `spraakveld.ts`) en twee testkoppen |
| `src/modules/` | 3 | `buddies/useChatbijlage.ts`, `buddies/samen.ts`, `auth/aanmeldmodus.ts` |
| `app/` | 1 | `aanmelden.tsx` |
| `docs/ENGINEER-REVIEW.md` | 1 | twee rijen, van 2026-09-10 (`Document.tsx` en `ChatRegel.tsx`) en 2026-11-05 (`DeadlineVerzetten`) |
| `docs/decisions/` | 2 | 2026-08-23 en 2026-09-12, historisch |

De drie soorten plekken verdienen elk een ander antwoord.

## Besluiten

### 1. De reden vervalt, de extractie niet

Een beslissing uit een component trekken naar een pure functie blijft goed: ze is
dan zonder opstelling te toetsen, ze verhuist niet mee met de opmaak, en een
bronbewaking of render erbovenop is niet meer nodig voor wat de functie beslist. **De
24 plekken worden niet teruggedraaid.** Wat verandert is de zin *waarom*: "er is geen
renderer" is onwaar voor hooks (QS8-714) en voor losse componenten, en voor 26 van de
31 schermen onder de vier mocks hierboven.

### 2. Een bronbewaking is soms de goede vorm

Niet elke `tests/beloftes/`-bewaking is een render die er niet kon zijn. Er zijn twee
soorten, en alleen de tweede wordt beter van een render:

* **Een eigenschap van de hele codebase.** "Niemand bouwt zijn eigen invoerveld",
  "niemand zet `secureTextEntry` met de hand", "geen scherm gooit een uitkomst weg",
  "geen import uit een los react-navigation-pakket". Een render toetst één scherm; deze
  beloftes gaan over **alle** bestanden en over wat er **niet** staat. Een render kan
  ze niet vervangen en hoort ze niet te vervangen.
* **Het gedrag van één scherm of één hook.** "Het aanmeldscherm leidt zijn
  beginstand af uit de routeparameters", "het koppelscherm haalt de lijst opnieuw op na
  een geslaagde koppeling", "de bijlagekeuze valt nooit stil". Een bronbewaking zoekt
  daar een stuk tekst op een plek; een render toetst de belofte (regel 18, vraag 4).
  Dit is waar de render beter is.

### 3. Per bewaking

⚠️ **De indeling is gemaakt op grond van de bestandsnamen, de testnamen, de kop en
welke bestanden de test leest. Geen van de twaalf is volledig herlezen.** Een
herindeling hoort bij het moment dat het bestand wordt aangeraakt.

| Bewaking | Leest | Soort | Render haalbaar? | Besluit |
| --- | --- | --- | --- | --- |
| `aanmeldscherm` | `app/aanmelden.tsx` | gedrag van één scherm | scherm laadt onder de mocks (gemeten); niet gerenderd | **bij aanraken** een rendertoets, de bron-grep blijft zolang die er niet is |
| `koppelscherm-vraagt-koppelbare-doelen` | `app/groep/[id].tsx` | gedrag van één scherm | scherm laadt (gemeten); niet gerenderd | **bij aanraken** |
| `een-bijlagekeuze-valt-nooit-stil` | `app/groep/chat/[id].tsx`, `useChatbijlage.ts` | gedrag van een hook en een scherm | de hook ja (QS8-714); het scherm laadt **niet** (`ImportMetaRegistry`) | de hook **bij aanraken** als hooktoets; het scherm blijft een bronbewaking |
| `avatar` | migratie 0126 en `useAvatarKeuze.ts` | tweeledig: grenzen tegen de migratie, en een klikpad | de grenzen niet (dat is een vergelijking met SQL); de hook ja | de grenzen **blijven**; het klikpad **bij aanraken** als hooktoets |
| `spraakveld` | `src/shared/ui/` | de keten veld naar microfoon | `Field` en `Microfoon` laden (gemeten) | **bij aanraken**: render van `Field` met `Microfoon` |
| `tekstinvoer` | `Field.tsx` en `app/(tabs)/lijst.tsx` | hele codebase ("niemand bouwt zijn eigen veld") | n.v.t. | **blijft** |
| `wachtwoordveld` | `Field.tsx` en alle bronnen | hele codebase | n.v.t. | **blijft** |
| `uitkomst-niet-weggooien` | `src/` en `app/`, alle schermen | hele codebase | n.v.t. | **blijft** |
| `wie-een-doel-maakt-krijgt-de-vraag` | alle bestanden in `app/` | hele codebase (routes) | n.v.t. | **blijft** |
| `de-terugknop-van-de-router` | alle bronnen | hele codebase (imports) | n.v.t. | **blijft** |
| `de-vragenlijst-wordt-niet-twee-keer-gesteld` | functies, geen bron | logica | n.v.t. | **blijft**; alleen de kop is oud |
| `een-foto-is-getekend-of-niets` | functies, geen bron | logica | n.v.t. | **blijft**; alleen de kop is oud |

⚠️ **De 24 is een ondergrens.** De telling zoekt op vier vaste formuleringen.
`tests/beloftes/uitstelbeslisser-krijgt-het-te-zien.test.ts` zegt "dit is een
bronbewaking en geen render" zonder een van die zinnen en staat er dus niet in; er
zijn waarschijnlijk meer. Het is niet beoordeeld, en wie het aanraakt behandelt het
zoals de rijen hierboven.

### 4. Geen massale herschrijving, en geen controle

* **De 24 plekken worden niet in één keer aangepast.** Het zijn meer dan vijftien
  bestanden, elke tekst verdedigt een eigen keuze, en een deel ligt in bestanden die
  andere sessies aanraken (`app/`). Een bijvangst-herschrijving van commentaar is
  precies de handeling die dit project elders heeft afgeraden.
* **Wel bij aanraken**: wie een van deze bestanden om een andere reden wijzigt, past de
  zin aan: *"geen renderer"* wordt *"hooks en losse componenten zijn te renderen sinds
  QS8-714; dit is een bronbewaking omdat …"*. Die zin hoeft per plek maar één reden te
  dragen.
* **Geen script dat "geen renderer" verbiedt.** Een regel die elke keer rood wordt op
  een zin leert men uit te zetten, en de zin is niet de fout: de fout is een reden die
  niet meer waar is. Dat vangt een lezer, geen grendel.
* **ER-rijen** (`docs/ENGINEER-REVIEW.md`, 2026-09-10 en 2026-11-05): niet door deze
  sessie bijgewerkt, want bouwsessies raken dat document niet aan. De batchsessie
  vouwt in: *"sinds QS8-714 is een renderopstelling er; zie
  `docs/decisions/2026-11-19-geen-renderer-was-een-uitspraak-over-een-opstelling.md`.
  `Document.tsx` en `ChatRegel.tsx` laden onder de mocks (gemeten); echt getekend zijn
  ze nog niet."*
* **De twee historische beslisdocumenten** blijven zoals ze zijn.

### 5. Wat Quinten beslist

⚠️ **Voorstel voor één zin in `CLAUDE.md`, niet door deze sessie ingevoerd** (regels zijn
van Quinten):

> *Hooks en losse componenten zijn te renderen (`jsdom`, `react-native-web` via een
> `vi.mock` per testbestand); schermen idem onder de mocks in
> `docs/decisions/2026-11-19-geen-renderer-was-een-uitspraak-over-een-opstelling.md`.
> Een bronbewaking is de goede vorm voor een eigenschap van de hele codebase, een
> render voor het gedrag van één scherm of hook.*

Dat is een regel over hoe dit project toetst en hoort bij hem.

## Wat hier niet is gedaan

* **Geen schermtest toegevoegd.** Het uitnodigingsscherm rendert (met de hand gemeten),
  maar de gedeelde helper met de standaardmocks en de eerste echte schermtest zijn een
  eigen issue: de mocks (vier plus de module-API) moeten één plek krijgen, anders
  schrijft elke test ze opnieuw en gaan ze uit elkaar lopen.
* **De vijf schermen die niet laden** zijn niet verder onderzocht.
* **Native is niet gemeten**, en een render onder `react-native-web` zegt daar niets over.

## Terugdraaien

Er is niets te draaien: dit document verandert geen code, geen test en geen
configuratie. Het vervangt wat `QS8-714` als open vraag achterliet.
