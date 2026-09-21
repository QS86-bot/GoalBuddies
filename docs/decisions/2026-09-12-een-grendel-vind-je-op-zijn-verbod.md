# Een bronbewaking vind je op zijn verbod, niet op zijn onderwerp

**Datum:** 12-09-2026 · **Issue:** QS8-434 · **Status:** gebouwd

## Wat het issue beweerde

`docs/decisions/2026-09-10-een-typefout-hoort-geen-verwijderknop-te-vragen.md`
(QS8-386) schreef:

> `tests/beloftes/lijstveld.test.ts` wordt rood zodra dit scherm zijn eigen
> `TextInput` bouwt.

QS8-434 stelde vast dat dat bestand niet bestaat, en concludeerde dat de belofte
onbewaakt was:

> 📏 `grep -rln "TaakRegel\|taakTekst" tests/` geeft **nul** bestanden. De
> grendel bestaat ook niet onder een andere naam.

## Wat er werkelijk aan de hand was

📏 Nagemeten op 12-09-2026. De helft van die bevinding klopt en de helft niet.

| | |
|---|---|
| `tests/beloftes/lijstveld.test.ts` bestaat niet | **juist** |
| de belofte is onbewaakt | **onjuist** |

De grendel bestaat, heet `tests/beloftes/tekstinvoer.test.ts`, en is **ouder dan
het document dat hem verkeerd noemt**: hij kwam op 09-09-2026 mee met QS8-380
(`5676217`), het document is van 10-09. Hij draagt beide helften van de belofte:

* *bouwt niemand zijn eigen invoerveld* — geen enkel bestand in `app/` of `src/`
  noemt `TextInput`, op `Field.tsx` en `wachtwoordveld.ts` na, met een register
  dat per naam een reden geeft;
* *MUST-ALLOW: De Lijst vraagt om tekst via het gedeelde veld* — zonder die helft
  haalt een app zónder invoervelden de eerste ook.

En `app/(tabs)/lijst.tsx` noemt hem op allebei zijn velden bij de **juiste** naam.
Alleen het beslisdocument niet.

## Waarom de grep niets vond

Er is gegrepd op `TaakRegel` en `taakTekst`: de namen van wat de grendel
bescherm**t**. Een bronbewaking noemt die nergens. Hij grept juist op wat hij
ver**biedt** — `TextInput` — en op de gedeelde weg die hij voorschrijft — `Field`.
Het onderwerp komt er per constructie niet in voor, want de test gaat niet over
taken maar over invoervelden in het algemeen.

> **Zoek je een bronbewaking op het onderwerp dat hij dekt, dan vind je hem niet.
> Zoek op het verbod.**

⚠️ En dat is geen detail van deze ene grep. Het volgt uit hoe dit project zijn
grendels schrijft, en dat is een expliciete regel: *toets de belofte, niet het
onderdeel* (regel 18, vraag 2). Een test die de belofte toetst, is precies de test
die de namen van het onderdeel niet gebruikt. **De vindbaarheid loopt dus
structureel andersom, en hoe beter de test, hoe slechter hij te vinden is op zijn
onderwerp.**

## Wat er gedaan is, en wat met opzet niet

**Wel:** de naam in beide beslisdocumenten gecorrigeerd, met erbij dat de grendel
ouder is dan de fout. De grendel zelf noemt nu de twee documenten die naar hem
verwijzen, zodat wie op *"lijstveld"* of op QS8-386 zoekt, hem alsnog vindt.

**Niet:** `padverwijzing:controle` uitbreiden naar `docs/decisions/`. 📏 Van de
tien kapotte paden in die map zijn er negen terecht historisch — afgewezen opties,
een gewiste module, een afkorting. De afweging staat in
`docs/decisions/2026-09-11-een-pad-zonder-wortel-leest-als-proza.md` §2 en is niet
door dit geval weerlegd: die controle zou hier *wél* aangeslagen zijn, maar met
negen valse meldingen erbij, en een controle die negen keer ruis meldt om één
vondst leer je negeren. Dat is dezelfde afweging die QS8-313 en QS8-304 al eens
gemaakt hebben.

**Niet:** een nieuwe test. De belofte is al bewaakt, en een tweede grendel op
hetzelfde geval is er één te veel — de les van QS8-302, waar bij het ijken bleek
dat van twee grendels er één niets deed.

## De ijking, opnieuw en niet overgenomen

De IJKING-kop van `tekstinvoer.test.ts` droeg al een tabel van 09-09-2026. Die is
hier **niet** overgeschreven maar opnieuw gedraaid, en met reden: dit issue
bestaat omdat een grendel die in proza beschreven stond er niet bleek te zijn. Een
ijking overnemen die je niet zelf gezien hebt, is precies dezelfde fout een niveau
hoger.

📏 12-09-2026, één mutatie per grendel, met de uitslag per naam:

| Mutatie | Welke test omviel |
|---|---|
| een kale `<TextInput value={tekst} …/>` in `app/(tabs)/lijst.tsx` | *bouwt niemand zijn eigen invoerveld* (1 rood van 5) |
| `Field` uit de import halen en beide `<Field` vervangen door `<Card` | *MUST-ALLOW: De Lijst vraagt om tekst via het gedeelde veld* (1 rood van 5) |

Vooraf en achteraf gemeten: 5 groen in beide gevallen. Bij elke mutatie viel
precies de grendel om die hem noemt, en niet een buurtest — de eis uit QS8-412.

## Wat dit voor de volgende bevinding betekent

⚠️ **Een bevinding die zegt dat iets "niet bestaat", noemt hoe er gezocht is.**
Dat stond hier keurig in het issue — `grep -rln "TaakRegel\|taakTekst" tests/` —
en dáárom was hij in vijf minuten te weerleggen. Zonder die regel was de uitkomst
een test die er al was, er twee keer geweest.

⚠️ En omgekeerd: **de eerste plek om te kijken is de bron die de belofte doet.**
`app/(tabs)/lijst.tsx` had het antwoord, twee keer, bij de juiste naam. Een
beslisdocument is een verslag van een besluit; de bron is wat er draait.
