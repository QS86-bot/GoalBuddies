# Een gat aan de bovenkant is geen gat

**Datum:** 31-08-2026
**Aanleiding:** QS8-238, gevonden als oorzaak onder QS8-237
**Raakt:** `scripts/migratiebranches.mjs` (nieuw), `scripts/migraties-controle.mjs`,
`scripts/migratie-nieuw.mjs`, `tests/scripts/migratiebranches.test.ts`

## 1. De blinde vlek

`migraties:controle` telde de nummers **tussen** het laagste en het hoogste
bestand:

```js
for (let n = eerste; n <= laatste; n += 1) {
  if (!nummers.includes(n)) gaten.push(...);
}
```

Ontbreekt er iets **boven** `laatste`, dan is er per definitie niets te zien. De
reeks is netjes aaneengesloten tot waar hij ophoudt.

Dat was op 31-08-2026 om 09:00 de werkelijke toestand van `main`, en het is met
de hand nagespeeld:

```
hoogste bestand: 0125
OUDE controle (stap 1-3): "De nummering is aaneengesloten."  ← GROEN
NIEUWE controle: origin/main draagt 6 migratie(s) die hier ontbreken:
                 0126, 0127, 0128, 0129, 0130, 0131
```

Ondertussen draaide productie `0001` t/m `0130`, en één van die vijf was 0128 —
de migratie die het lek dichtzette waarbij een uitnodigingslink de `auth.uid()`
van acht leden meestuurde. **De RLS-suite bouwde op `main` dus een ander schema
op dan productie draait, en de controle die daarvoor bestaat zei dat alles
klopte.**

⚠️ Het is uiteindelijk bij toeval gevonden: migratie 0131 sprong over het gat
heen, en toen zat het er ineens wél *tussen* en vond stap 2 het alsnog.

## 2. Waarom juist de bovenkant

Een gat in het midden ontstaat uit een oude fout die iemand ooit gemaakt heeft.
Een gat aan de bovenkant ontstaat uit de **nieuwste** migraties — die net op
productie gedraaid zijn en waarvan de bestanden nog op een branch staan.

⚠️ **In dit project is dat de normale gang van zaken en niet een uitzondering.**
`docs/DEPLOY.md` schrijft toepassen en dán landen voor, en zo is 0131 vandaag ook
gegaan. Elke migratie is er dus een tijdje in precies die gevaarlijke toestand.
De controle was blind op exact het moment dat hij het meest nodig was.

## 3. Wat er nu gemeten wordt, en wat niet

Stap 4 vraagt niet aan productie wat daar draait — dat vereist een
service-role-key, en die hoort niet in een controle die op elke machine draait
(beveiligingsregel 4). Dat blijft de tweede helft van QS8-122.

Wat hij wél kan: kijken wat de **remote branches** dragen. Draagt een branch een
nummer dat deze map mist, dan kan deze map het schema niet opbouwen zoals het
elders al staat.

⚠️ **Dat is in dit project bijna dezelfde vraag**, juist door de volgorde uit
paragraaf 2: een migratie die op een branch staat, draait meestal al.

⚠️ **Gemeten vóór de keuze om hem rood te maken:** vandaag draagt geen enkele van
de zes remote branches een nummer dat `main` mist. Nul valse meldingen, dus rood
is haalbaar — dit is geen waarschuwing die je leert wegkijken.

## 4. Waarom de scan verhuisde

`migratie-nieuw.mjs` deed deze scan al en waarschuwde vanochtend nog uit zichzelf
dat er een hoger nummer bestond. Maar hij hield per branch alleen het **hoogste**
nummer bij, en dat is genoeg om een vrij nummer te kiezen en te weinig om een gat
te zien: een branch met `0126` t/m `0130` geeft als hoogste `0130`, en dan weet je
nog steeds niet dat 0126 t/m 0129 óók ontbreken.

De scan staat nu in `scripts/migratiebranches.mjs` en geeft de volledige
verzameling. `migratie-nieuw.mjs` leidt zijn hoogste daaruit af.

⚠️ Twee bijna gelijke git-scans naast elkaar laten staan is precies hoe ze uit
elkaar gaan lopen — en dan bewaakt de ene iets anders dan de andere zonder dat
iemand het merkt.

## 5. De ijking

Het issue schreef de ijking zelf voor: **haal het hoogste migratiebestand weg en
kijk of de controle rood wordt.** Dat deed hij niet, en dat wás de bevinding. Nu
wel:

```
0131 weggehaald →
  origin/main draagt 1 migratie(s) die hier ontbreken: 0131
  exitcode 1
```

Per grendel gebroken op het oordeel zelf, niet één mutatie voor het geheel:

| Mutatie | Werd rood |
|---|---|
| deelmigratie (`0052a`) krijgt een eigen nummer | 1 test |
| lege werkkopie meldt alles als ontbrekend | 1 test |
| branch zonder migratiemap telt als "alles ontbreekt" | 3 tests |
| onleesbare bestandsnamen tellen tóch mee | 3 tests |

⚠️ Die derde is de belangrijkste voor de bruikbaarheid: zonder die regel is élke
docs-branch rood, en dan staat de controle binnen een week uit.

## 6. Wat bewust níet gebeurd is

De drie bestaande stappen zijn **niet** naar pure functies verbouwd. Ze werken,
ze zijn in gebruik, en ze aanraken om ze testbaar te maken is een risico zonder
aanleiding. Stap 4 heeft zijn oordeel wél in een geëxporteerde functie, zoals
QS8-115 voorschrijft.

⚠️ Blijft staan: stap 1 t/m 3 hebben geen enkele test. Dat is geen nieuwe schuld
maar wel onopgeloste schuld, en het is dezelfde vorm als deze bevinding — een
controle die niemand ooit gevoed heeft.
