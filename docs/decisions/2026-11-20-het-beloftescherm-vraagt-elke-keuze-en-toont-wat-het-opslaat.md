# Het beloftescherm vraagt elke keuze en toont wat het opslaat — QS8-761

**Datum:** 20-11-2026 · **Issue:** QS8-761 (x.4 van de poort QS8-744) · **Migratie:** geen · **Raakt:** domeinregel 1,
5, 7 en 11, correctheidsregel 7, regel 15, 16 en 18

Dit document vult `docs/decisions/2026-11-20-de-belofte-is-een-commitment-met-een-getuige.md` (sectie x.4 en §4) aan.
Daar staat het besluit; hier staat wat de bouw van het scherm erbij koos.

## Wat er gebouwd is

- `app/doel/belofte/[id].tsx` (dun) en `src/schermen/belofte/`: het scherm, het formulier, de aparte bevestigstap,
  een bestaande belofte met intrekken, en de knop `BelofteIngang` op het doelscherm.
- In `src/modules/commitments`: `gaWeekbelofteAan()`, `fetchBelofteStand()` (begrensd), `fetchBelofteBegunstigden()`,
  en de pure kern in `weekbelofte.ts` (`belofteperiode()`, `belofteweek()`, `belofteaanbod()`, de foutvertaling).
- De rij `commitments.INSERT.periode_start` is uit `GEEN_SCHRIJFPAD` gehaald: x.4 is het schrijfpad.

## Keuzes

### 1. Wat bevestigd is, is wat er opgeslagen wordt — ook de week

De bevestigstap legt de week vast op het moment dat ze opent (`naarBevestigen()`), en `gaWeekbelofteAan()` rekent bij
het tikken opnieuw. Verschillen ze (middernacht op de laatste dag van de week), dan gaat er **niets** de deur uit en
leest de gebruiker *"Je week is intussen voorbij"*. De spec-ronde stelde voor de bevroren week gewoon te versturen;
dat zou de trigger van 0314 weigeren met een minder duidelijke melding. Deze vorm weigert eerder en in de eigen taal.
Zelfde gedachte als QS8-507 voor de tekst: de bevestigstap toont de geschoonde tekst die `commitmentSchema` opslaat.

### 2. Niets voorgeselecteerd, strenger dan `Straf`

`Straf` kiest bij één kandidaat die ene (`enigeOfGekozen`, QS8-651) en begint op "een groep". Het beloftescherm begint
op niets, ook bij één kandidaat. De enige afleiding is de **soort** als er maar één soort bestaat (alleen groepen of
alleen mensen); dat kiest geen persoon. Een bronscan legt vast dat `src/schermen/belofte/` `enigeOfGekozen` niet kent.

### 3. De knop staat er ook zonder groep, zodra er een belofte is

Criterium 1 zegt: zonder groep en getuige geen knop. Maar wie zijn groep verlaat terwijl zijn belofte op `set` staat,
moet haar nog kunnen intrekken (§4 van de poort: *intrekbaar tot het verschuldigd wordt*). `belofteaanbod()` zet een
lopende belofte daarom vóór alles, ook vóór "geen getuige", en dezelfde functie stuurt de knop en het scherm.
[AANNAME] De knop kijkt naar "heeft een groep" en kent het onderscheid automatisch/niet-automatisch niet (de
groepenlijst van het doelscherm draagt die kolom niet); het scherm toont dan de lege staat zonder verzendknop.

### 4. Een eigen begunstigdenlijst, die werpt

`fetchMogelijkeBegunstigden()` (doelstraf) filtert `groups.automatisch` niet, en `weekbelofte_begunstigde_bekend()`
(0314) weigert precies die. `fetchBelofteBegunstigden()` gebruikt dezelfde voorwaarden als die functie, en werpt bij
een fout: een lege lijst betekent op dit scherm "je hebt geen getuige", en dat is een bewering (regel 16).
`tests/rls/weekbelofte-scherm.test.ts` legt lijst en policy op dezelfde invoer naast elkaar.

### 5. De foutvertaling leest de tekst van de `raise`

De vier weigeringen van `bevries_belofteperiode()` delen code 23514. Het scherm herkent ze aan een fragment
(`BELOFTE_WEIGERINGEN`), met het plafond vóór "lopende week" omdat het ene het andere bevat.
`tests/beloftes/weekbelofte-fout.test.ts` zoekt elk fragment in de migraties: een herformulering in SQL is een rode
test en geen stille terugval. Eén weigering die de gebruiker zelf kan oplossen gaat niet naar Sentry, de terugval wel.

### 6. De bevestigtekst

Drie dingen letterlijk (gevolg, periode, wie het ziet en wanneer), en vier dingen die de belofte níet doet of
meebrengt: intrekken kan tot ze in werking gaat, geen extra punten (A43), de week-startdag zit vast zolang ze loopt
(0313), en geen geld (`straf.geen_geld`). "Gebroken" staat er in gewone taal: een gemist weekdoel zonder weekpas, en
geen enkel afgerond; een week met adempauze of zonder weekdoelen telt niet als gemist (domeinregel 11). De poort
vroeg bestaande formuleringen te hergebruiken; dat is gedaan waar ze klopten (`straf.geen_geld`, de keuzeknoppen),
maar `commitment.penalty.*` noemt de streefdatum en is voor een belofte onwaar, dus de standen hebben eigen teksten
(`belofte.stand.*`). De woorden "straf" en `due` zijn in de nieuwe teksten vermeden; dat besluit blijft open
(domeinregel 5, laatste ⚠️).

### 7. Klein en begrensd

`fetchBelofteStand()` leest de vijf recentste beloftes en één bit voor een open doelstraf, in plaats van
`fetchCommitments()` zonder limiet (regel 10; gemeld bij x.3). Elk component in `src/` blijft onder de 50 regels; het
doelscherm kreeg één element en geen functie, dus `regel15` staat op hetzelfde plafond.

## Wat ongemeten is

- Het scherm zelf is niet gerenderd: er is geen React-testbibliotheek en geen screenshot gemaakt. Criteria 1 en 2
  staan onder test via de pure toestand (`keuze.ts`, `belofteaanbod()`) en bronscans.
- Native (iOS en Android) niet bekeken.
- Productie: 0312 t/m 0314 staan er nog niet op. Tot dan geeft elke belofte 42501 (zie `docs/DEPLOY.md` §2.5c).
- Of honderd kandidaten volstaan (`fetchBelofteBegunstigden()`).
- `getuigenissen()` (0169) toont een getuige een verschuldigde belofte met de zin *"hun streefdatum is verstreken"*.
  Dat is voor een belofte onwaar; buiten deze bouw (een getuigenscherm), gemeld als vervolg.
