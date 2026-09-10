# Een grendel die alleen in een comment staat — 10-09-2026

**Issue:** QS8-412
**Raakt:** `scripts/padverwijzing-controle.mjs` (nieuw), `tests/scripts/padverwijzing-controle.test.ts` (nieuw), `tests/beloftes/een-foto-is-getekend-of-niets.test.ts` (nieuw), plus elf verwijzingen in bestaande bestanden en de knip in `tests/beloftes/een-document-voert-niets-uit.test.ts`

---

## 1. Wat er gemeten is

📏 Op 10-09-2026, tegen `main` op `25e09c5`: **1772 backtick-geciteerde verwijzingen
naar een repo-pad in 1103 bestanden, waarvan zeventien unieke paden niet bestonden.**
Negen daarvan waren een verwijzing naar een **testbestand**, en die stonden in de
bron zelf. De map `tests/ui/` bestond niet en werd door drie bestanden genoemd.

Na het uitsluiten van `docs/decisions/` (zie §3) blijven er dertien over: elf
verouderde aanwijzers, één grendel die niet bestond, en twee die met opzet naar
een verdwenen bestand wijzen.

## 2. Waarom dit erger is dan een dode link

Een ontbrekende test valt op. Een test waarvan in de bron staat dát hij er is,
valt niet op — en dat is precies andersom dan je zou hopen.

`src/shared/ui/Foto.tsx` was het zuiverste geval. De kop van dat bestand legt de
belofte uit (`url` is een ondertekende URL of `null`, nooit een kaal opslagpad),
schrijft erbij dat een verhuizing de gevaarlijkste beweging is die er is, en
besluit met: *"de belofte staat daarom hier, bij de code, en `tests/ui/foto.test.tsx`
toetst hem op deze plek."*

Dat bestand bestond niet. De belofte was onbewaakt, en de zin erover was de reden
dat niemand dat zag. **Wie een grendel noemt, neemt de vraag weg of er een is.**

De drie bestaande sporten dekken deze klasse niet: `exports:controle`,
`keten:controle` en `schermingang:controle` zoeken alle drie code **zonder
aanroeper**. Dit is een aanroeper die naar niets wijst — de andere kant van
dezelfde naad.

## 3. De vorm van de controle, en waar hij níet kijkt

**Wat telt als een bewering:** een backtick-geciteerd pad dat begint met een
repo-map (`src/`, `app/`, `scripts/`, `docs/`, `supabase/`, `tests/`) en een
bestandsextensie draagt. Een pad zonder aanhalingstekens of zonder extensie is
niet betrouwbaar van proza te scheiden, en een controle die proza meldt leer je
uitzetten. De grens is smal met opzet.

Een URL glipt er niet doorheen, en dat is geen toeval maar de vorm van de
uitdrukking: de backtick moet vlak vóór de repo-map staan, dus
`` `https://github.com/QS86-bot/GoalBuddies/blob/main/src/a.ts` `` matcht niet.
Zou hij dat wel doen, dan meldt de controle elke link naar de eigen repo.

**`docs/decisions/` valt erbuiten, en dat is een besluit.** Een beslisdocument is
een gedateerd verslag van wat er tóen was. Dat
`supabase/functions/_shared/sentry/index.ts` op 26-08-2026 gedeployd stond zonder
ooit in een branch te staan, is waar — en het bestand hoort er vandaag juist
níet te zijn. Zo'n zin repareren zou het verslag onwaar maken.

`docs/DEPLOY.md`, `docs/ENGINEER-REVIEW.md` en `docs/WERKVOORRAAD.md` vallen er
wél onder: die beschrijven het heden, en DEPLOY.md stuurt bovendien een mens
langs commando's die moeten bestaan. Die grens is met dezelfde mutatie in beide
richtingen geijkt — hetzelfde kapotte pad, groen in het ene document en rood in
het andere.

**Eén bestand valt erbuiten omdat het de controle voedt:**
`tests/scripts/padverwijzing-controle.test.ts` noemt met opzet paden die niet
bestaan; dat is zijn werk. De vrijstelling is dat ene bestand en níet
"testbestanden tellen niet mee" — 📏 één van de dertien bevindingen stond juist
in een test.

## 4. Het register, en waarom de sleutel een paar is

Twee verwijzingen zijn met opzet kapot en staan in `ZONDER_BESTAND`, met een
reden per rij:

| Pad | In | Waarom |
| -- | -- | -- |
| `tests/beloftes/uitsluitlijst-is-alleen-van-jezelf.test.ts` | `tests/rls/koppelbare-doelen.test.ts` | De zin luidt "verhuisd uit …" en gaat over een test die met QS8-345 zijn onderwerp verloor. Een verhuizing die zijn herkomst noemt, is precies wat regel 18 vraagt. |
| `scripts/js-bron.mjs` | `docs/ENGINEER-REVIEW.md` | Een voorstel en geen bewering. De agenda mag een bestand noemen dat er nog niet is; dat is waar een agenda voor dient. |

**De sleutel is het paar (pad, in) en niet het pad.** Een vrijbrief op de
bestandsnaam alleen zou stilzwijgend afdekken dat een ánder bestand dezelfde dode
verwijzing overneemt, en zo verspreidt een fout zich onder een uitzondering die
voor iets anders bedoeld was.

**De ratel slaat twee kanten op**, zoals bij `levend:controle` en
`regel15:controle`: een registerrij die niets meer dekt is óók rood. Anders
blijft er een vrijbrief liggen voor een pad dat morgen om een heel andere reden
weer opduikt.

## 5. Wat de ijking opleverde, en dat is het deel om te onthouden

CLAUDE.md eist een mutatie **per grendel** en niet één voor de hele controle,
"anders is de ijking zelf de aanname". Dat is hier geen theorie gebleken.

De mutatie voor *"`Foto.tsx` bouwt zelf geen URL"* was een
`https://opslag/storage/v1/object/…` in het component. De suite werd rood — maar
op de verkéérde toets: op *"heeft de drie standen"*, omdat de mutatie ook de
`url === null`-tak raakte. De grendel die de ijking noemde bleef groen, en wel
hierom: de knip die commentaar uit de bron haalt, `\/\/[^\n]*`, at de rest van de
regel op vanaf de `//` in `https://`.

Diezelfde knip stond sinds QS8-72 in `tests/beloftes/een-document-voert-niets-uit.test.ts`.
📏 Nagemeten: met `const x = 'https://opslag/x'; Linking.openURL(x);` in
`Document.tsx` bleef die suite **groen op eenenzestig tests**, terwijl het
component precies deed wat hij belooft nooit te doen.

Beide knippen tellen nu `//` alleen als er geen dubbele punt vóór staat. Twee
lessen:

1. **Een mutatie die rood wordt, is niet hetzelfde als een mutatie die de bedoelde
   grendel rood maakt.** Kijk wélke test omvalt, niet dát er een omvalt.
2. **De knip die een controle scherp houdt, is zelf een grendel** en hoort
   dezelfde behandeling te krijgen. Deze stond in twee bestanden en was in
   allebei blind voor dezelfde vorm — de kopieerfout die CLAUDE.md bij de
   security-reviewer beschrijft, hier in testcode.

## 6. Negentien bestanden, en waarom dat er hier geen achttien te veel zijn

CLAUDE.md rekent meer dan vijftien bestanden aanraken tot de afwegingen die je
zelf neemt maar wél verantwoordt. Dit zijn er negentien, en de verdeling is de
verantwoording: **elf zijn een aanwijzer van één regel** die naar de juiste naam
gaat wijzen, en die elf zijn precies de bevindingen waar dit issue over gaat.
De overige acht zijn de controle, zijn ijking, de ontbrekende grendel, de
gerepareerde knip in de zustertest, `package.json`, en de drie documenten.

Ze opknippen zou de controle van zijn opruiming scheiden, en dan landt er een
controle die op dag één rood staat — of een opruiming zonder iets dat hem
vasthoudt. Dat is één ondeelbare wijziging in de zin die CLAUDE.md bedoelt.

## 7. Wat dit niet is

Geen opschoning van comments in het algemeen. Geen controle op verwijzingen
zonder backticks of zonder extensie. En geen uitspraak over of een genoemde
grendel het júíste toetst — alleen dat hij bestaat. Dat eerste blijft handwerk,
en het is de reden dat vraag 5 van regel 18 een vraag blijft.
