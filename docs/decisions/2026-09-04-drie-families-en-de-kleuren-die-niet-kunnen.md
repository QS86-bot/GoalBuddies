# Drie families, en de kleuren die niet kunnen

**Datum:** 04-09-2026
**Besluit:** A58 — vervangt de indeling uit A55 (`2026-08-31-ritme-klassement-en-kleur.md` §3)
**Status:** de indeling is besloten; **de kleurtoewijzing staat open** — zie §5
**Aanleiding:** antwoord van Quinten op vraag K2 van de besluitenronde

---

## 1. De vraag die eronder lag

> *Hoe komen we aan vier families/categorieën en waar staat dat voor?*

Eerlijk antwoord: **die vier families zijn nooit ontworpen.** Ze zijn het gevolg
van twee losse dingen die toevallig op elkaar landden.

1. **Vijftien knoppen naast elkaar is geen keuze maar een muur** (QS8-224). De
   keuzelijst moest groepen krijgen van twee tot zeven opties, want dat is de
   maat waarop een mens nog kiest. Dát is waarom er überhaupt groepen zijn.
2. **A55 vond drie kleuren die op navy naast elkaar kunnen staan**, niet meer. De
   groepering werd daarom gelijkgetrokken met de kleurfamilies — anders groepeert
   de keuzelijst anders dan de kleur, en dan betekent kleur niets.

De vierde groep — werk, studie, overig — is wat er overbleef nadat de eerste drie
een kleur hadden. In `schemas.ts` staat het met zoveel woorden: *"De vierde groep
heeft geen kleur, en dat is een open punt van A55."* Hij is een restcategorie die
zich voordoet als een familie.

**De vraag stellen was dus het antwoord.** Drie families van vier is een indeling;
drie families plus een restje is een uitkomst.

---

## 2. De nieuwe indeling

| Familie | Gebieden |
|---|---|
| **Gezondheid** | Sport · Voeding · Zelfzorg · Meditatie |
| **Softskills** | Creativiteit · Productiviteit · Sociaal · Overig |
| **Ambitie** | Werk · Studie · Bouwen · Vaardigheden |

Twaalf gebieden in drie families van vier. Elke familie heeft een kleur, en er is
geen restgroep meer.

### Wat dat betekent voor de lijst van vijftien

| Vandaag | Wordt |
|---|---|
| `fitness`, `nutrition`, `self_care` | Gezondheid, ongewijzigd |
| `mindfulness` "Rust en aandacht" | Gezondheid, **hernoemd** naar "Meditatie" |
| `creativity`, `productivity` | Softskills, ongewijzigd |
| `connection` "Contact met anderen" | Softskills, **hernoemd** naar "Sociaal" |
| `other` "Overig" | Softskills — **niet langer een restgroep maar een lid** |
| `business` "Werk", `study` "Studie", `skills` "Vaardigheden" | Ambitie, ongewijzigd |
| — | Ambitie, **nieuw**: `building` "Bouwen" |
| `helping` "Iets voor een ander" | ⛔ **vervalt** |
| `learning` "Leren" | ⛔ **vervalt** |
| `organization` "Orde en overzicht" | ⛔ **vervalt** |
| `resilience` "Veerkracht" | ⛔ **vervalt** |

⚠️ **Vier gebieden verdwijnen, en dat is een gegevenswijziging en geen
hernoeming.** Die vier woorden staan in drie CHECK-constraints en in drie
tabellen: `goals.category`, `profiles.focus_areas` (de vragenlijst van A56) en
`groups.categorie` (de zoeklijst van 0144). Een rij die zo'n waarde draagt, valt
om zodra de CHECK krimpt.

**Vandaag kost dat niets, want er zijn geen echte gebruikers.** Dat is precies de
aanname die volgens WERKVOORRAAD §0 vervalt op de dag dat de eerste gebruiker zich
aanmeldt. **Dit is dus werk dat vóór die dag af moet zijn**, en daarna alleen nog
met een omzetting per rij.

Voorgestelde omzetting als er ooit toch rijen zijn — conservatief, niets
verdwijnt zonder plek:

| Vervalt | Gaat naar |
|---|---|
| `helping` | `connection` (Sociaal) |
| `learning` | `study` (Studie) |
| `organization` | `productivity` (Productiviteit) |
| `resilience` | `self_care` (Zelfzorg) |

---

## 3. De kleuren: wat er gevraagd is

> *Gezondheid (kleur groen), Softskills (kleur oranje), Ambitie (kleur geel)*

Die drie kunnen niet, en dat is geen smaakoordeel. Ik heb het gemeten met
`kleurafstand.ts` en `contrast.ts` uit het project zelf — dezelfde functies die
`kleurafstand.test.ts` bij elke testrun draait.

### 3a. De drie gevraagde kleuren zíjn de statuskleuren

In dit stelsel is de betekenis al vergeven:

| Kleur | Betekent nu |
|---|---|
| groen `#3fbf8f` | voltooid |
| oranje `#f0803c` | wacht op actie |
| goud `#e8b648` | het merk |
| rood `#f05a54` | deadline-risico |

Gemeten afstand van elk van de drie gevraagde kleuren tot de dichtstbijzijnde
statuskleur: **0,0**. Niet "dichtbij" — het zijn dezelfde kleuren.

Een categoriemarkering in statusgroen betekent dat een doel over voeding er
hetzelfde uitziet als een afgeronde week. Dat is de fout die A55 bij de roze
ving: die lag op 8,9 van rood en werd daarom vervangen. Deze liggen op 0.

### 3b. Ook zónder dat probleem is groen · oranje · geel de zwaarste combinatie

Stel dat de statuskleuren niet bestonden. Dan nog is dit drietal ongelukkig, en
om een reden die je met het blote oog niet ziet: **groen, oranje en geel zijn
precies de kleuren die bij rood-groenblindheid samenvallen.** Ongeveer acht
procent van de mannen ziet ze niet als drie kleuren.

Gemeten, met de verzadigste groen-, magenta- en geelkandidaten die er op navy
zijn: onderlinge afstand **3,7** waar de drempel 10 is. Alleen de groen-geel-paar
al valt onder de drempel; de oranje maakt het erger.

⚠️ **Dat is niet op te lossen door andere tinten groen en geel te kiezen.** Het
zit in de simulatie zelf: deuteranopie legt de groen-geel-oranje band op elkaar.

### 3c. Je eigen keuzes van het bord vallen op hetzelfde om

> *munt en cyaan (kies dan munt), kobalt en indigo (kies dan indigo), violet en
> orchidee (kies dan orchidee)*

Die drie paren zag je met het blote oog, en ze klopten alle drie. Maar de drie
die overblijven werken niet samen als familiekleuren:

| Drietal | onderling | drempel |
|---|---|---|
| munt `#5fe3d0` · indigo `#8a7bff` · orchidee `#e06bff` | **1,5** | 10 |

Indigo en orchidee vallen bij simulatie vrijwel samen — hetzelfde probleem dat je
bij violet en orchidee zelf zag, één laag dieper. **Dat is precies waarom deze
meting bestaat**: het oog ziet het paar, de simulatie ziet er drie.

⚠️ **Dit is geen afwijzing van die kleuren.** Als losse accenten — in een
grafiek, een illustratie, een lege staat — zijn ze prima; ze liggen alle drie ver
genoeg van elke statuskleur. Wat ze niet kunnen, is samen de drie families
dragen.

---

## 4. Wat er wél kan

Er zijn precies drie kleuren die op **beide** thema's de drempel halen tegen
elkaar én tegen alle statuskleuren, en ze staan al in de app:

| | donker | licht | Haalt |
|---|---|---|---|
| blauw | `#4f97e8` | `#2a6ec0` | onderling 12,1 / 11,9 · status 12,1 / 11,9 |
| magenta | `#dd4fa0` | `#b53080` | idem |
| olijf | `#8f9c36` | `#4a5410` | idem |

Deze drie zijn gemeten, getest en gebouwd. Ze houden de ruimste marge van alles
wat ik heb kunnen vinden, en er is er geen vierde bij te krijgen zonder die marge
te laten zakken (§5 van
`2026-09-03-...` — de violet die dat wél zou halen, is toen gemeten).

⚠️ **Olijf is het dichtst bij "groen" dat dit stelsel toelaat.** Het is een
geelgroen; het leest als groen en niet als statusgroen.

---

## 5. Wat hier open blijft — de toewijzing

De indeling uit §2 is besloten. Wélke van de drie kleuren bij welke familie hoort,
is een keuze over hoe de app voelt, en die hoort bij jou. Twee voorstellen:

**Voorstel A — dichtst bij je woorden.**

| Familie | Kleur | Waarom |
|---|---|---|
| Gezondheid | olijf `#8f9c36` | de enige groen die kan |
| Softskills | magenta `#dd4fa0` | mensen en maken; "Sociaal" zit hier |
| Ambitie | blauw `#4f97e8` | — |

**Voorstel B — minste verandering aan wat er nu staat.**

| Familie | Kleur | Waarom |
|---|---|---|
| Gezondheid | blauw `#4f97e8` | draagt vandaag "lichaam en rust", en die vier gebieden gaan één op één over |
| Softskills | magenta `#dd4fa0` | draagt vandaag "mensen en maken" |
| Ambitie | olijf `#8f9c36` | draagt vandaag "werk en groei" |

⚠️ **Voorstel B verandert geen enkele kleurwaarde en geen enkel bestaand doel van
kleur.** Voorstel A ruilt twee families van kleur en is daarmee zichtbaar anders
voor wie de app al gebruikt — vandaag niemand.

**Zolang er niets gekozen is, ga ik uit van B**, om de reden die hierboven staat:
het is de enige variant die niets omzet wat al klopt. Kies je A, dan is dat één
regel in `tokens.ts` en één in `categoriemerk.ts`.

---

## 6. Wat er moet veranderen als dit gebouwd wordt

| Waar | Wat |
|---|---|
| migratie | `goals_category_valid`, `profiles_focus_areas_geldig`, `groups_categorie_geldig`: vier waarden eruit, `building` erbij |
| `src/shared/categorieen/index.ts` | dezelfde lijst, in de volgorde van de nieuwe families |
| `src/modules/goals/schemas.ts` | `CATEGORIE_GROEPEN` van vier groepen naar drie |
| `src/shared/ui/categoriemerk.ts` | familie per gebied; `building` krijgt een pictogram; de drie zonder familie bestaan niet meer |
| `src/shared/theme/tokens.ts` | de namen `lichaam`/`mensen`/`werk` worden `gezondheid`/`softskills`/`ambitie` |
| `src/shared/i18n/nl.ts` + `en.ts` | labels voor `building`, hernoemingen van `mindfulness` en `connection`, groepsnamen |
| `src/shared/ui/tips.ts` | `TIPSET_PER_CATEGORIE` volgt de lijst — staat onder test |
| `supabase/functions/doelcoach/index.ts` | de Doelcoach noemt de categorieën in zijn prompt |
| `docs/decisions/2026-08-31-...` §3 | A55's indeling verwijst naar dit document |

⚠️ **De naad die hier het gevaarlijkst is:** `categoriemerk.ts` in `shared/ui` is
een **kopie** van `CATEGORIEEN`, met opzet en zonder import, en
`categoriemerk.test.ts` legt de twee naast elkaar. Datzelfde geldt voor de drie
CHECK-constraints en `tests/rls/policies.test.ts`, `vragenlijst.test.ts` en
`ontdekken.test.ts` — die vergelijken in **beide** richtingen. Een gebied
verwijderen is dus vier plekken, en de tests vinden de vijfde.

---

## 7. Wat dit besluit niet raakt

- **De regel zelf blijft: kleur codeert de familie, pictogram codeert het
  gebied.** Twaalf gebieden vragen twaalf pictogrammen, geen twaalf kleuren.
- **De drempel van 10 blijft staan.** Dit besluit vraagt er geen verlaging voor;
  drie kleuren is precies wat het stelsel comfortabel draagt.
- **De statuskleuren blijven wat ze zijn.** Groen is voltooid, oranje is wacht op
  actie, rood is deadline-risico, goud is het merk. Dat is wat §3a onmogelijk
  maakt, en het is de reden dat het stelsel werkt.
