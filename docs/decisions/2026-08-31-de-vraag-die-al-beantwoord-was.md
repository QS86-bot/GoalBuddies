# De vraag die al beantwoord was — en de breuk die niemand kon zien

*31-08-2026 · QS8-205*

## De klacht

Uit de review van 30-08: *"ik heb twee keer dezelfde doelen-vragenlijst moeten
invullen. Eén keer zou voldoende moeten zijn."*

Twee van de zes interviewvragen op `/doel/coach/[id]` staan letterlijk één scherm
eerder, op `/doel/nieuw`:

| `/doel/nieuw` | `/doel/coach/[id]` |
|---|---|
| "Wie word je als je dit haalt?" (`identity_statement`) | vraag 2 (`identity`) |
| "Hoeveel uur per week?" (`available_hours_per_week`) | vraag 4 (`hours_per_week`) |

En het is aantoonbaar dezelfde vraag: `spiegelNaarDoel()` schreef het
interviewantwoord terug naar precies die twee kolommen. **De app wist al dat het
één ding is, en vroeg het toch twee keer.**

## Waarom dit geen los schermprobleem is

De weg liep maar één kant op. Er was een functie die van interview naar `goals`
schreef, en niets dat de andere kant op las. Dat is geen vergeten regel maar een
ontbrekende helft van een naad — en zolang je hem als "vul dat veld even voor"
oplost, komt hij terug bij het derde veld.

Daarom is de reparatie **één tabel** en geen tweede lijst:

```ts
export const SPIEGELING = {
  identity: 'identity_statement',
  hours_per_week: 'available_hours_per_week',
} as const;
```

`spiegelpatch()` (heen) en `vulVoorUitDoel()` (terug) lezen allebei die tabel.
De voor de hand liggende vorm — een lijst hier, een `if` per veld daar, en een
test die de twee tegen elkaar legt — is precies de constructie die in dit project
al drie keer is gaan lekken. Er is nu niets om uit de pas te lopen.

Twee regels die daaruit volgen en die allebei aan beide kanten gelden:

- **Een eerder antwoord wint.** Wat de gebruiker in het interview typte is zijn
  antwoord op díé vraag; de kolom op `goals` is er een afgeleide van. Won het
  doel, dan zou een tweede bezoek een antwoord met een oudere waarde
  overschrijven.
- **`''` en `null` zijn allebei overgeslagen.** Twee functies die dat verschillend
  lezen is hoe een naad gaat lekken: de ene schrijft een lege string weg, de
  andere ziet hem als een antwoord en vult niet voor.

## De bug die pas ontstond door de reparatie

`goals.available_hours_per_week` is `numeric(4,1)` en `/doel/nieuw` accepteert
een breuk: **6,5 uur is een geldige waarde.**

Het interviewveld deed dit:

```ts
const schoon = tekst.replace(/[^0-9]/g, '');
```

Zolang dat veld leeg begon, was dat onzichtbaar — via het interview kwam er nooit
een breuk binnen. Maar zodra het wordt vóórgevuld, verandert zes-en-een-half uur
in **vijfenzestig** zodra de gebruiker het veld aanraakt.

⚠️ **Elk onderdeel klopte.** Het doelscherm accepteerde terecht een breuk, het
interviewveld streepte terecht rommel weg, het schema stond terecht een
niet-geheel getal toe. De fout zat tussen de twee schermen, en hij was
onbereikbaar tot dit issue ze aan elkaar knoopte. Dat is regel 18, vraag 6: een
feature die een aanname verplaatst, brengt een fout aan het licht die er al stond
en die niemand kón zien.

De reparatie is `urenUitTekst()`: cijfers plus één scheidingsteken, komma en punt
allebei, en **nooit `NaN`** — die zou als `hours_per_week` het schema in gaan, daar
door `z.number()` geweigerd worden, en de gebruiker een invoerfout geven op een
veld dat hij netjes invulde.

Er wordt niets afgerond. Een waarde naar 6 of 7 brengen om in een invoerveld te
passen is gegevens veranderen zonder dat iemand erom vroeg; **het veld past zich
aan, niet de waarde.**

## Wat de ijking opleverde

Zes grendels apart gebroken. Vijf werden meteen rood. De zesde niet, en dat was
de leerzame:

⚠️ **Het geval dat moest bewaken dat er geen dérde veld heen loopt zonder terug
te komen, bleef groen toen ik precies dat toevoegde.** Het voedde per keer één
gespiegeld veld, en de mutatie schreef `measurable` weg — dat stond in élk
voorbeeld op `null`, dus de regel liep nooit.

Opgelost met een geval dat een **volledig** ingevuld interview voedt en eist dat
de patch exact de gespiegelde kolommen bevat. Daarna is de mutatie wél rood.

Dat is de tweede keer op één dag dat de mutatiecheck een gat in mijn eigen test
vond — bij QS8-203 was het een grensgeval dat drie velden tegelijk over de grens
zette. **De vorm is elke keer dezelfde: een testgeval dat maar één pad voedt,
terwijl de belofte over alle paden gaat.** Erover nadenken vindt dat niet; de
mutatie wel.

## Wat hiermee niet af is

Acceptatiecriterium 1 van het issue luidt: *"Geen enkele vraag wordt twee keer
aan dezelfde gebruiker gesteld binnen één doel."* Letterlijk gelezen staat de
vraag er nog — voorgevuld, met de zin erbij dat hij al beantwoord is, en bij te
stellen.

Dat is de kortetermijnfix die het issue zelf voorschrijft. Het echte verdwijnen
gebeurt in het snelle-start-epic: sinds QS8-201 leidt de Doelcoach de
identiteitszin af in plaats van hem te vragen, en de uren verhuizen naar het
optionele verfijnen. Dan is het interview geen verplichte stap in de trechter
meer maar een verdiepingsscherm.
