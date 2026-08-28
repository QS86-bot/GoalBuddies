# Een zin over twee regels was onzichtbaar voor `tekst:controle`

**Datum:** 28-08-2026
**Aanleiding:** de laatste van de blinde vlekken uit `docs/VOLGENDE-SESSIE.md` §0a
**Raakt:** `scripts/tekst-controle.mjs`, `tests/scripts/tekst-controle.test.ts`,
vier plekken in `app/` en `src/`, en vijf sleutels in beide catalogi

## 1. Wat er stond

`npm run tekst:controle` meldde nul. Er stonden vier plekken met hardgecodeerde
Nederlandse UI-tekst in `src/` en `app/`, verdeeld over zes regels:

| Waar | Wat |
|---|---|
| `src/shared/ui/Ketting.tsx:125` | *"Eén schakel per lid dat deze week zijn cyclus afsloot. Het gaat om opdagen, niet om hoeveel je haalde."* |
| `app/groep/chat/[id].tsx:260` | *"Je leest de bewaarde berichten van deze week. Zodra er weer verbinding is, vult de rest zich aan."* |
| `app/beoordelen.tsx:332` | *"Week afgerond"*, met de gehaalde stand erachter |
| `app/groep/[id].tsx:203` | *"{n} van {totaal} leden."* |

⚠️ **Het waren er vier en niet drie.** De aantekening in §0a noemde er drie —
dat was een telling met de hand, van vóór er een meter was die ze kón zien. De
twee erbij zijn de laatste twee uit de tabel: losse regels, geen afgebroken
zinnen. Ze zijn pas bovengekomen toen de reparatie er lag, en dat is dezelfde
volgorde als bij `keten:controle` een dag eerder: één reparatie legde er dertien
bloot waar de aantekening er één noemde.

## 2. Waarom hij ze niet zag

De kale-JSX-heuristiek onderaan `kandidaten()` stelt twee eisen, en allebei zijn
ze terecht:

```js
/^[A-ZÀ-Ý][^<>=()]*$/.test(kaal) && !kaal.endsWith(',')
```

* **een hoofdletter aan het begin** — anders is elke coderegel een treffer;
* **geen komma aan het eind** — anders is `Subheading,` uit een importlijst er een.

Een zin die over twee regels loopt, breekt op allebei tegelijk:

```jsx
<Caption>
  Eén schakel per lid dat deze week zijn cyclus afsloot. Het gaat om opdagen,
  niet om hoeveel je haalde.
</Caption>
```

De eerste helft eindigt op een komma. De tweede begint klein. Er is geen enkele
regel in dit fragment die aan beide eisen voldoet, en dus was de hele alinea
onzichtbaar.

⚠️ **Dat is precies dezelfde vorm als de blinde vlek die `binnenTekstProp()` op
24-08 oploste, één laag hoger.** Daar liep een prop over meerdere regels en eiste
de regex de sluitquote op dezelfde regel. Dezelfde onderbouwing stond er al bij:
*"De uitweg is de tóestand."* Die redenering is één laag te ondiep toegepast — hij
gold ook voor de kinderen van een tag, en niemand heeft dat toen doorgetrokken.

## 3. De reparatie

`binnenJsxTekst(regels, isTsx)` — een toestandspas naast `binnenTekstProp()`.
Staat een openingstag hélemaal alleen op zijn regel, dan is alles daarna
kindertekst tot het eerstvolgende tagteken. Binnen die toestand vervallen de
hoofdletter- en komma-eis, want de toestand heeft al bewezen wat de regel is.

Drie grendels houden hem bruikbaar, en alle drie zijn ze gemeten:

**a. Alleen een regel die zelf in evenwicht is, is tekst.** Zonder deze eis
meldde de pas achttien regels. Ze dragen geen tagteken en zagen er dus uit als
kindertekst, terwijl het de bínnenkant van één accolade is:

```jsx
<Knop>
  {stand === 'gekopieerd'
    ? t('delen.gekopieerd')
    : label}
</Knop>
```

`zonderWaarden()` kan hier niets: de accolade sluit pas drie regels verderop.
Vandaar `balans()`, dat accolades en haakjes telt.

**b. Een tagteken beëindigt de toestand, maar slaat de regel niet over.** Deze
tak stond eerst met een `return` erin, en dan is een genest element het einde van
álle kindertekst in plaats van het begin van de zijne:

```jsx
<View style={styles.vult}>      ← opent
  {uitCache ? (
    <Caption>                   ← sloot af, opende niet opnieuw
      Je leest de bewaarde berichten van deze week.
```

⚠️ **Precies dat verborg een van de twee zinnen waarvoor deze pas gebouwd is** —
de reparatie maakte in zijn eerste versie de helft van zijn eigen doel
onzichtbaar, en de meting liet dat zien voordat het commentaar het uitlegde.

**c. De openingstag moet vooraan staan.** `Array<Item>` eindigt óók op een `>` en
draagt óók een hoofdletter. Het `^`-anker is het enige dat een generic van een
openingstag scheidt.

## 4. Wat de ijking waard is

Zes ijkingen die hij moet vinden, zeven die hij met rust moet laten. **Alle zes
de grendels zijn met de hand gebroken en alle zes werden ze rood:**

| Wat kapot ging | Wat rood werd |
|---|---|
| de pas uitzetten | de vier vondsten |
| de balanswacht (a) | de ternary, de meerregelige `t()`, én het geneste element |
| de hertoetreding (b) | het geneste element |
| het `^`-anker (c) | de generic |
| de `.tsx`-grens | kindertekst in een `.ts` |

⚠️ **Eén ijking was in zijn eerste vorm waardeloos, en dat is de moeite waard om
op te schrijven.** De generic-ijking voerde zijn fragment via `gevondenInTs()`
aan. Die weg valt al af op de `.tsx`-grens, dus de test bleef groen toen het
anker weggehaald werd — hij bewaakte een grens die er niet toe deed en zei in
zijn naam iets anders. Dat is regel 18 vraag 3 op de ijking zélf: *kan deze test
groen blijven terwijl de belofte breekt?* Het antwoord kwam niet uit nadenken
maar uit de mutatie.

## 5. Waar de tekst nu staat

Vijf sleutels in `nl.ts` en `en.ts`. Vier zinnen, en de vijfde omdat *"Week
afgerond"* met en zonder de gehaalde stand twee zinnen zijn:

* `ketting.opdagen_uitleg`
* `chat.uit_cache`
* `beoordelen.week_afgerond` en `beoordelen.week_afgerond_met`
* `groepscherm.leden_van_totaal`

⚠️ **Het streepje tussen "Week afgerond" en de stand is taal en geen opmaak.**
In de code stond `` `Week afgerond${' — ' + gehaald}` ``, en dan kan een
vertaler er geen dubbele punt van maken. Twee sleutels is hier goedkoper dan één
sleutel met een samenstelling eromheen.

## 6. Wat dit over de controlescripts zegt

Dit is de vierde keer dat `tekst:controle` bijgesteld wordt nadat hij groen
stond, en de derde keer dat de aanleiding een **toestand over meerdere regels**
is. Bij een volgende blinde vlek is dat de eerste plek om te kijken: een
heuristiek per regel kan principieel niets zien dat over twee regels loopt, en
elk van die gevallen is met dezelfde vorm opgelost.

⚠️ **De aantekening telde er drie en het waren er vier.** Een telling met de hand
is de ondergrens en nooit het antwoord — bij `keten:controle` was de verhouding
één tegen dertien. Wie een blinde vlek opschrijft, schrijft er een gemeten aantal
bij of geen aantal.
