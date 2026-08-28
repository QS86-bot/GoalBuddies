# Drie datalaagfuncties zonder scherm, en de test die dat voortaan ziet

**Datum:** 28-08-2026
**Raakt:** `app/doel/bewerk/[id].tsx` (nieuw), `app/doel/[id].tsx`,
`src/modules/goals/weekly.ts`, `src/modules/goals/mijlpalen.ts`,
`src/modules/commitments/stand.ts`, de berichtencatalogus,
`tests/beloftes/bereikbaar.test.ts` (nieuw)
**Geen migratie.**

## Wat er ontbrak

De tweede helft van bevinding 5. `wijzigDoel()`, `wijzigMijlpaal()` en
`fetchCommitmentSpoor()` stonden er sinds QS8-106 met **nul aanroepers**:

- een doel was na aanmaken niet meer te wijzigen, ook geen typefout in de titel;
- van een mijlpaal kon je alles behalve de tekst — aanmaken, verwijderen,
  herordenen en op gehaald zetten hadden wél een knop;
- het auditspoor dat **domeinregel 5** met zoveel woorden eist, kon niemand
  opvragen.

⚠️ **Dit is de variant van onwrikbare regel 18 zonder kapot onderdeel.** Elk
schakeltje was af: de functie geschreven, het schema kloppend, de policy op zijn
plek. Er viel niets rood te maken, want er was niets stuk — de keten was alleen
nergens verbonden. Vraag 5 van regel 18 vraagt daar met zoveel woorden naar: *kan
een gebruiker hier daadwerkelijk bij, en langs welke knop?*

Vierde keer in dit project: QS8-112 (`maakWeekdoel()` zonder aanroeper terwijl
twee issues op Done stonden), QS8-113 (`profiles.locale` met kolom, CHECK, grant,
leeskant én catalogus, en geen schrijfpad), QS8-106 (vier datalaagfuncties zonder
scherm), en nu deze drie.

## Wat er gebouwd is

**1. `app/doel/bewerk/[id].tsx` — een doel bewerken.** Eigen scherm en geen blok
in `app/doel/[id].tsx`; dat bestand is ruim vijftienhonderd regels, hetzelfde
argument als bij het weekdoelscherm. Laadt via `AsyncView` met loading-, error- en
lege staat (coderegel 16), en het formulier zit in een kindcomponent met een
`key`, zodat de `useState`-beginwaarden niet het vórige doel vasthouden — dezelfde
val als op het onboardingscherm eerder vandaag.

⚠️ **De streefdatum staat er niet in, en dat is een domeinregel.**
`doelPatchSchema` is `doelSchema.omit({ target_date: true })`: een datum
verschuiven loopt via het verzoek aan een buddy (A7), want anders is elke afspraak
eenzijdig op te rekken. **Het scherm zegt dat met zoveel woorden** in plaats van
het veld stilzwijgend weg te laten — een ontbrekend veld leest als een bug, een
uitgelegd veld als een keuze. De knop die het wél kan (`DeadlineVerzetten`) staat
op het doelscherm zelf.

**2. Een bewerkknop per mijlpaal**, met een inline formulier voor titel,
omschrijving en streefdatum.

⚠️ **Hier mág de streefdatum wél, en dat is geen inconsistentie.** A7 gaat over de
streefdatum van het dóél: die staat in een afspraak met een buddy. Een mijlpaal is
een eigen tussenstap zonder afspraak eromheen; hem verzetten raakt niemand anders.

⚠️ **Onderweg gerepareerd: `Mijlpaal` droeg geen `description`.**
`wijzigMijlpaal()` stuurt titel, omschrijving én streefdatum in één UPDATE, zoals
`mijlpaalSchema` voorschrijft. Zonder dat veld had het formulier geen andere keus
dan `description: null` mee te sturen, en dan **wiste elke titelcorrectie
stilzwijgend de omschrijving**. Het type draagt hem nu, zodat TypeScript de juiste
waarde afdwingt in plaats van hem te laten raden — een grendel en geen netheid.

**3. Het commitment-spoor**, dichtgeklapt onder de beloning- en strafkaart. Een
commitment is een afspraak en geen logboek; wie er elke keer een lijst
gebeurtenissen naast krijgt, leest de afspraak niet meer. De knop staat er wél
altijd, want een spoor dat je moet zoeken is geen spoor.

⚠️ Alleen de eigenaar leest dit, en dat komt van RLS en niet van het scherm:
`commitment_events_select` eist dat het commitment aan een doel van `auth.uid()`
hangt. Dat is ook de goede kant op voor domeinregel 7 — het spoor van een straf
vertelt wanneer iemand hem verschuldigd werd.

De zeven gebeurtenissen krijgen een label via `spoorLabels()`, in dezelfde vorm
als `statusTeksten()`: een functie en geen constante, want een module-constante
legt de taal vast vóórdat het profiel geladen is (QS8-115).

## De test, en waarom hij een lijst is

`tests/beloftes/bereikbaar.test.ts` toetst per functie dát er een scherm is dat
hem aanroept, met de reden erbij — een lijst met redenen en geen lijst met namen,
zelfde vorm als `BEWUST_ONGESCHREVEN`.

⚠️ **Waarom een lijst en geen algemene detector.** Een export die nergens buiten
zijn module wordt gebruikt is generiek te vinden, maar niet met een grep: schema's
en constanten worden vaak rechtstreeks geïmporteerd in plaats van via de barrel,
en een ruwe telling gaf tientallen valse meldingen. Dat vraagt een echte parser en
is eigen werk; het staat als rij in `docs/ENGINEER-REVIEW.md`. Wat je zónder
parser wél kunt vastleggen is de belofte per functie.

## De ijking, en wat die in de test zelf vond

Alle drie de aanroepen met de hand weggehaald: **alle drie rood**, elk met de
reden in de melding.

⚠️ **De eerste ijking betrapte de test zelf, en dat is de vondst van dit
document.** Twee van de drie bleven groen terwijl de aanroep eruit was. Oorzaak:
`roeptAan()` filterde regels die met `//`, `*` of `/*` beginnen — dat dekt JSDoc,
maar niet de JSX-vorm die dit project overal gebruikt:

```jsx
{/*
  ⚠️ **De knop bij `wijzigMijlpaal()`, die tot 28-08 ontbrak.**
*/}
```

Zo'n regel begint met een waarschuwingsteken en niet met een sterretje, dus hij
bleef staan — en dan telde **de toelichting op de knop als de knop**. Precies de
fout die deze test moet vangen, in de test zelf. Blokcommentaar gaat er nu als
blok af, en er staat een ijkingsgeval op met exact die vorm.

Verder vier ijkingen op de zeef: een echte aanroep telt, een `import` zonder
aanroep niet, `wijzigDoelStatus` telt niet mee voor `wijzigDoel`, en commentaar
telt niet.

## Wat hier níét in zit

Er is geen scherm doorlopen door een mens; de bouwomgeving heeft geen `.env` en
kan de app niet draaien. Wat bewezen is, is dat de keten verbonden is en dat de
test dat ziet. **Loop de drie schermen één keer door** — dat staat bij de
openstaande metingen in `docs/VOLGENDE-SESSIE.md`.
