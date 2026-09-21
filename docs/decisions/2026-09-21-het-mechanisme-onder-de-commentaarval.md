# Het mechanisme onder de commentaarval — QS8-574

**21-09-2026.** QS8-568 repareerde vijf belofte-tests die groen bleven als je de
belofte uitcommentarieerde, en zette het mechanisme eronder als eigen issue weg.
Dit is dat issue: acht bestanden gemeten, acht gerepareerd, en een grendel die de
negende tegenhoudt.

De aanleiding staat in CLAUDE.md bij QS8-417: *een reparatie die de instanties
opruimt en het mechanisme laat staan, groeit terug — en hij doet dat onder een
rij die "opgelost" zegt.*

## De vorm

```ts
const inhoud = readFileSync(SCHERM, 'utf8');
expect(inhoud).toContain('magOvernemenUitDagzetten(');
```

De belofte is *"dit scherm roept die poort aan"*. Wat er getoetst wordt is *"die
tekenreeks staat in het bestand"* — en dat is óók waar als de aanroep
uitgecommentarieerd is. Bij een tijdelijke uitschakeling blijft de naam juist wél
staan, in de comment.

## 📏 Twaalf werd acht, en dat is scherper en niet minder

Het issue noemde **12** bestanden met de gevaarlijke vorm, geteld met een ruwe
zeef. De detector die dit issue opleverde traceert waar de waarde vandaan komt en
komt op **8**. De headline-meting reproduceert wél exact: **49** lezende
bestanden in `tests/beloftes/`, **28** die knippen en **21** die dat niet doen.

Van de twaalf vielen er vier af, en alle vier met een reden:

| bestand | waarom hij afvalt |
|---|---|
| `aanmeldscherm.test.ts` | knipt via `plat()` |
| `tabbalk-bovenaan.test.ts` | knipt via `bronZonderCommentaar()` |
| `datumopmaak.test.ts` | knipt via `ontdaanVanCommentaar()` |
| `onboarding-schrijft-niets-over.test.ts` | knipt via `ontdaanVanCommentaar()` |

⚠️⚠️ **Dat is geen opluchting maar een tweede bevinding.** Geen van die vier
knippen heet `zonderCommentaar`, en `knip:controle` matcht alleen namen die
daarmee beginnen — dus geen van vieren staat in zijn register, en niets bewaakt
of ze het goede doen. 📏 Twee zijn in dit issue nagemeten en falen dicht
(`plat()` 1 rood, `bronZonderCommentaar()` 2 rood); de twee
`ontdaanVanCommentaar()`-kopieën zijn **niet** gemeten en staan als *ongemeten*
opgeschreven, niet als *in orde*. Het gat staat als QS8-579.

En er kwamen er twee bíj die het issue niet had: `een-document-voert-niets-uit`
en `een-foto-is-getekend-of-niets`. Een ruwe vormzeef telt dus aan twee kanten
verkeerd, en dat is precies waarom criterium 1 om een mutatie per bestand vroeg
in plaats van om een lijst.

## 📏 De metingen — elf mutaties, acht bestanden, alle acht open

Elke rij is met de hand gedraaid: bron muteren, de testsuite van dát bestand
draaien, bron terugzetten. De "vóór"-kolom is gemeten en niet aangenomen — dat is
de eis uit CLAUDE.md, *een rood is pas jóuw rood als je "ervoor" ook gemeten
hebt*.

| bestand | mutatie | vóór | ná de mutatie | ná de reparatie |
|---|---|---|---|---|
| `avatar.test.ts` | emmer `avatars` op `public = true`, oude vorm in een `--`-comment | 25 groen | **25 groen** | 2 rood |
| `avatar.test.ts` | `uploadAvatar(` uitgecommentarieerd | 25 groen | **25 groen** | 1 rood |
| `de-tijdzone-volgt-het-apparaat.test.ts` | `const tz = apparaatTijdzone();` uitgecommentarieerd | 16 groen | **16 groen** | 1 rood |
| idem | `<Tijdzonewacht />` uit `app/_layout.tsx` | 16 groen | **16 groen** | 1 rood |
| `een-document-voert-niets-uit.test.ts` | emmer `chatdocs` op `public = true`, oude vorm in een comment | 61 groen | **61 groen** | 2 rood |
| idem | de `progressbar`-regel in `Document.tsx` | 61 groen | **61 groen** | 1 rood |
| `een-foto-is-getekend-of-niets.test.ts` | `stand === 'mislukt'` uitgecommentarieerd | 13 groen | **13 groen** | 1 rood |
| `weekpas-bereikt-je.test.ts` | `from('week_pass_events')` uitgecommentarieerd | 20 groen | **20 groen** | 1 rood |
| `de-rls-suite-meet-of-valt-om.test.ts` | de `PGPORT`-regel in `psql-stack.ts` | 15 groen | **15 groen** | 1 rood |
| `een-profielveld-is-te-wijzigen.test.ts` | `display_name: naam,` uitgecommentarieerd | 5 groen | **5 groen** | 1 rood |
| `elke-soort-passeert-de-poort.test.ts` | de `meldingPoortReden(`-aanroep | 4 groen | **4 groen** | 2 rood |

**Elf van de elf faalden open.** Het register van de nieuwe controle is daarom
leeg: er was geen enkele rij te verantwoorden.

### Twee die er het zwaarst uitspringen

⚠️⚠️ **Twee van de elf zijn onwrikbare regel 3.** `expect(MIGRATIE).toMatch(…)`
op migratie `0126` en `0240` bewaakt dat de storage-emmer **privé** is. Met
`public` op `true` gezet én een toelichting erboven die de oude vorm citeert,
bleven allebei de suites volledig groen. Een openbare bucket omzeilt RLS
volledig; de vier policies eronder zijn dan decoratie.

⚠️ **En één raakt domeinregel 2.** Met `{/* <Tijdzonewacht /> */}` in
`app/_layout.tsx` verandert `profiles.tz` na de onboarding nergens meer — en geen
enkele test zei er iets van.

## ⚠️⚠️ Twee mutaties maten iets anders, en dat is de les eronder

📏 De eerste mutatie op `avatar.test.ts` zette `--` vóór één regel van een
insert die over meerdere regels loopt. Er werd iets rood, en dat was verleidelijk
om als bewijs te lezen. Maar de toets viel om doordat er **tekst in het midden
van het patroon** kwam te staan, niet doordat er iets uitgeschakeld was. Dat is
CLAUDE.md woordelijk: *een mutatie die zijn geval langs een éérdere grendel
voert, toetst die eerdere grendel.*

📏 De tweede: op `een-document-voert-niets-uit.test.ts` werd de suite rood — maar
op de toets **"de bovengrens komt letterlijk uit migratie 0240"**, een buurman
die mijn placeholder `...` had verstoord. De gemerkte grendel ("de emmer is
privé") bleef groen terwijl de emmer openbaar werd. Dat is de andere regel uit
CLAUDE.md: *kijk wélke test omvalt, niet dát er een omvalt.* Pas met een
toelichting die de volledige oude vorm citeert — zodat de buurman heel blijft —
was de meting geïsoleerd, en toen was de uitslag 61 van de 61 groen.

**Zonder die tweede ronde had dit issue twee van de acht als "faalt dicht" in een
register gezet, met een gemeten reden die niets mat.**

## ⚠️ Een afwijking die je onderbouwt is duurder dan een die je vergeet

Twee van de acht bestanden hadden in hun eigen kop uitgeschreven staan waaróm ze
geen knip nodig hadden:

> Geen comment-knipper ervoor: die is zélf een grendel en was in QS8-412 in twee
> bestanden blind voor `//` in een URL. Een patroon dat niet in proza kán
> voorkomen is hier het kortere pad.

Dat argument was half waar en daardoor gevaarlijker dan een omissie. Het patroon
`display_name:\s*[A-Za-z_$]` houdt **proza** inderdaad buiten de deur — de
oorspronkelijke bevinding, `display_name: ''` in een comment, haalt hem niet. Wat
het argument niet zag is een **uitgecommentarieerde echte regel**:
`// display_name: naam,` haalt hem wél, en dat is precies het geval van QS8-568.

En de premisse was inmiddels ook vervallen: sinds QS8-446 is er één gedeelde
knip, dus knippen kost geen kopie meer. Beide koppen zijn herschreven met de
meting erin, en CLAUDE.md zegt waarom dat nodig was: *een omissie valt op; een
uitgeschreven argument leest de volgende persoon als een reden om er niet aan te
twijfelen.*

## De keuze: een eigen controle en geen tweede helft van `knip:controle`

Criterium 4 van het issue vroeg dit af te wegen en waarschuwde: *twee controles
met dezelfde naam en een andere reikwijdte is een val.*

Het is een eigen controle geworden — `npm run belofteknip:controle` — omdat het
een andere vraag is. `knip:controle` vraagt *"is deze bronlezer geclassificeerd —
knipt hij, of staat hij met een reden in het register?"* en kijkt sinds QS8-567
alleen in `scripts/`. Deze vraagt *"kan een comment deze belofte
tevredenstellen?"* en kijkt in `tests/beloftes/`. Ze in één script duwen zou één
naam met twee reikwijdtes en twee registers opleveren — de val zelf.

⚠️ **Hij staat automatisch in CI en dat is geen toeval.** Sinds QS8-417 deelt
`scripts/ci-controles.mjs` elke `*:controle` uit `package.json` in over de banen;
een nieuwe grendel hoeft nergens met de hand bijgeschreven te worden.
📏 Nagemeten: 71 controles, waarvan 47 in de repo-baan — `belofteknip:controle`
zit erbij.

### Wat hij níét belooft

Hij ziet dat een waarde **ergens langs gaat**, niet dat die knip deugt. Een
hulpfunctie die niets knipt maar wel een functie ís, valt buiten zijn bereik. Die
rand staat als tabel in de kop van het script, met de vormen die hij mist erbij —
en de reden dat hij daar staat is dat een telling anders voor volledigheid
aangezien wordt.

## De gedeelde SQL-knip

Twee van de acht bestanden lezen een **migratie**, en de gedeelde knip uit
QS8-446 is een JS-knip: die filtert regels die met `//` beginnen en laat een `--`
staan. Er was dus een SQL-knip nodig.

⚠️ **Er is er geen bijgeschreven maar een verhuisd.**
`scripts/sleutelvorm-controle.mjs` had er sinds QS8-491 een die precies het
goede doet — om enkele quotes én dollar-quotes heen, met geneste blokken, en met
de tekstliteralen intact. Hij was daar al niet meer van één controle:
`dml-controle.mjs` importeerde hem er met zoveel woorden uit, *"de knip van
`sleutelvorm-controle.mjs` en geen eigen"*. **Een gedeelde knip die in het
bestand van één consument woont, is een kopie die nog niet gemaakt is** — en dit
issue had er een derde en vierde consument bij.

Hij staat nu in `scripts/zonder-sql-commentaar.mjs` als `zonderCommentaarSql`,
met een rij in `MET_REDEN` van `knip:controle`. De naam begint met
`zonderCommentaar` en dat is met opzet: zo ziet `knip:controle` hem. Een naam als
`zonderSqlCommentaar` zou hem precies zo onzichtbaar maken als de vier knippen
uit QS8-579.

⚠️ **De metingen zijn overgenomen en niet achtergelaten**, want CLAUDE.md
waarschuwt dat juist bij een verhuizing de belofte kwijtraakt terwijl de tests
groen meeverhuizen. De ijking staat nu in
`tests/scripts/zonder-sql-commentaar.test.ts` met de `--`-in-een-literal en de
dollar-quote erin, allebei op één regel — want de ijking die hieraan voorafging
zette de `--` en de leesplek op verschillende régels, en dan is hij groen om een
reden die niets met de belofte te maken heeft.

📏 Nagemeten na de verhuizing: `sleutelvorm-controle.test.ts` en
`knip-controle.test.ts` samen 65 groen, `dml:controle` dezelfde uitslag als
ervoor (23 DML-statements in 12 migraties).

## De ijking van de grendel zelf

Vraag 3 uit CLAUDE.md regel 18 beantwoord je niet door erover na te denken maar
door de belofte met de hand te breken. Eén mutatie per grendel, en "ervoor" ook
gemeten:

| | uitslag |
|---|---|
| ervoor | groen, exitcode 0 |
| een dertiende bestand met de gevaarlijke vorm erbij | **rood**, exitcode 1, en alléén dat bestand genoemd |
| hetzelfde bestand met `.not.toContain()` | groen |
| hetzelfde bestand mét knip op de leesplek | groen |
| na het opruimen | groen, dezelfde tellingen als ervoor |

De tweede helft is hier de zwaarste. Een `.not.toContain()` op ruwe bron faalt
**dicht**: commentaar erbij kan hem alleen rood maken, nooit stil groen. Er staan
er tientallen in `tests/beloftes/`, en een controle die die meldt staat meteen vol
— en dan leer je hem uitzetten. Het issue waarschuwde hier met zoveel woorden
voor.

`tests/scripts/belofteknip-controle.test.ts` biedt hem elke vorm los aan: 35
toetsen, waarvan meer dan de helft vormen die hij met rust moet laten.

## Wat er níet in zit

- **Het register is leeg, en dat is een uitkomst.** Het mechanisme blijft staan
  omdat de negende er wél een kan verdienen — maar een rij vraagt een mutatie en
  geen argument, en dat is nu met een meting onderbouwd in plaats van met een
  vermoeden.
- **De vier knippen die `knip:controle` niet ziet** zijn niet gerepareerd. Dat is
  QS8-579: een andere belofte (*elke knip is geclassificeerd*) in een ander
  register, en twee van de vier zijn nog ongemeten.
- **Of elke bronlezer correct knipt** blijft handwerk. Deze controle meet dat
  niet en belooft het niet — zie de randtabel in zijn kop.
