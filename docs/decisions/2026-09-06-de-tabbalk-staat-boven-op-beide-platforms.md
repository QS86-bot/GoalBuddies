# De tabbalk staat boven, op web én op native

**06-09-2026 — QS8-246.**

De tabbalk stond onderaan en moest naar boven. Twee dingen aan dat verzoek waren
geen uitvoering maar een keuze, en dit document legt allebei vast.

## 1. Welke route — gemeten, niet aangenomen

Het issue noemde twee wegen en zei er met zoveel woorden bij dat welke het is
gemeten moest worden, omdat de omgeving waarin het geschreven werd geen
`node_modules` had.

Gemeten in
`node_modules/expo-router/build/react-navigation/bottom-tabs/types.d.ts`:

```
tabBarPosition?: 'bottom' | 'left' | 'right' | 'top';
```

De optie zit in de navigator die met expo-router 57 meekomt. Daarmee vervalt
route 2 — geen `@react-navigation/material-top-tabs`, geen dependency erbij, en
geen veeggedrag tussen tabbladen dat niemand gevraagd heeft.

## 2. Boven op beide platforms, en wat dat kost

Het issue biedt een splitsing aan — boven op web, onder op native — met een
argument dat klopt: op een telefoon van zes inch is de bovenrand met één hand
niet te bereiken, en dit is een app die je staand even openslaat.

**Toch is het boven op allebei**, om één reden: de acceptatiecriteria van QS8-246
noemen beide platforms met zoveel woorden (*"De vier tabbladen staan bovenaan, op
web en op native"*). Een splitsing zou zijn eigen toets niet halen. Het issue laat
die keuze expliciet aan de bouwer en vraagt alleen dat de afweging opgeschreven
wordt; dit is dat.

⚠️ **Wat er tegenover staat, staat hier zodat het niet opnieuw uitgezocht hoeft
te worden.** Duimafstand is geen detail bij dagelijks gebruik met één hand. Blijkt
dat in de testronde te knellen, dan is de reparatie één regel in
`app/(tabs)/_layout.tsx` — `tabBarPosition: Platform.OS === 'web' ? 'top' :
'bottom'` — en niet een terugbouw.

## 3. De naad die eraan vast zat

De balk neemt de veilige zone **zelf**. Gemeten in
`expo-router/build/react-navigation/bottom-tabs/views/BottomTabBar.js`:

```js
paddingTop: tabBarPosition === 'top' ? insets.top : 0,
```

`Screen` deed dat óók (`paddingTop: insets.top + space.shell`). Samen is dat twee
keer een inkeping aan ruimte — en dat is precies het geval dat op een simulator
zónder notch niets laat zien.

De reparatie is een context (`BovenrandAlVerrekend`) om de tabs heen, en geen prop
per scherm. Een prop op vier schermen is vier kansen om hem bij het vijfde te
vergeten; een context erft elk nieuw tabblad zonder dat iemand eraan denkt.
Schermen buiten de tabs staan op een stack zónder balk erboven en blijven zelf
verantwoordelijk — de standaardwaarde `false` zegt dat.

## ⚠️ Wat hier niet bewezen is

**Het visuele deel van de acceptatie is in deze omgeving niet na te meten, en dat
is geprobeerd.** De webbundel is gebouwd (`expo export --platform web`) en
geserveerd, en met een echte browser opgevraagd in licht én donker. De app start,
maar de authenticatiepoort stuurt elke route door naar `/aanmelden`: de tabbalk
zit áchter een sessie, en er is hier geen Supabase-sessie te maken.

Wat er dus wél vastligt is de rekensom (`veiligeBovenrand()`, met beide kanten
onder test) en de aansluiting (staat `tabBarPosition: 'top'` er, staat de context
eromheen, telt `Screen` de rand niet meer rechtstreeks). Wat er **niet** vastligt
is hoe het eruitziet op een toestel met een notch, en in beide thema's. Dat is een
controle voor een echte machine.
