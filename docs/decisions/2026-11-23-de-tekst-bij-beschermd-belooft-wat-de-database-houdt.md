# De tekst bij Beschermd belooft wat de database houdt (QS8-798)

Besluit Quinten, 23-11-2026, variant B uit drie voorgelegde varianten. Grens 1: wat een
gebruiker over zijn zichtbaarheid te lezen krijgt, is een belofte.

## Wat niet klopte

De teksten bij Beschermd zeiden "niet je weken en niet je punten". Twee dingen in de app
zeggen iets anders:

* Lopende (`todo`) en goedgekeurde weekdoelen zijn voor leden leesbaar (rij 3 in
  `002-domeinregel7-oppervlakken.md`). Gemiste, doorgeschoven, geannuleerde en
  vrijgestelde weken niet.
* Sinds A57 (0333, 0336) kan ook een beschermde groep een klassement hebben, standaard
  aan bij een nieuwe groep zonder organisatie (besluit 42/43). Het toont alleen de punten
  die in die groep verdiend zijn, zonder gemiste weken en zonder datum.

Een gemiste week lekte niet; domeinregel 7 houdt. De tekst beloofde alleen meer dan hij
waarmaakte.

## De gekozen tekst (variant B, met de reeks erbij: B')

De groep ziet de titel en voortgang van wat je koppelt, je lopende en goedgekeurde weken
en je huidige reeks. Een gemiste of doorgeschoven week ziet niemand, tenzij je hem zelf
deelt. Een reeks die op nul staat, ziet de groep wel. Heeft de groep een klassement, dan
ziet iedereen de punten die je in deze groep verdiende, maar nooit een gemiste week of je
persoonlijke totaal.

Variant B zelf noemde de reeks niet. Code-critic vond dat: de groep ziet `current_streak`
ook in een beschermde groep (A15, rij 2 in 002), en een opsomming leest als compleet.
Quinten koos op 23-11 B' zoals voorgesteld, inclusief de zin over de reeks op nul.

## Tweede besluit, zelfde dag

Het nieuw-groep-scherm en het uitnodigingsscherm zeggen met zoveel woorden dat een nieuwe
groep met een klassement begint en dat een beheerder het kan uitzetten
(`groepnieuw.klassement_standaard`, `uitnodiging.klassement_standaard`). 0336 zet het
klassement aan voor elke nieuwe groep zonder organisatie. ⚠️ `invite_preview()` geeft
`klassement_aan` niet terug, dus het uitnodigingsscherm zegt de standaard en niet de stand
van díe groep. Dat precies maken vraagt een migratie en is een vervolgissue.

Afgewezen: A (alleen de harde belofte, zegt niets over wat zichtbaar is) en C (dezelfde
inhoud als B in twee regels; vraagt een regeleinde in de uitleg).

## Mee aangepast

* `zichtbaarheid.open_uitleg` en `bevestiging.groep_openzetten.uitleg`: "elkaars
  puntentotaal in deze groep" is nu "de punten uit deze groep". Het klassement toont geen
  totaal (A42, A54).
* `koppel.uitleg_beschermd`, `deling.uitleg_beschermd`: dezelfde lijn als B.
* `koppel.uitleg_open`, `deling.uitleg_open`: "je punten" is "je persoonlijke
  puntentotaal", want de groeppunten staan in het klassement.

Niet aangeraakt, want waar: `uitnodiging.uitleg_missen_beschermd` (een gemiste week
boekt zonder `group_id`, dus het klassement daalt er niet van), `onboarding.stap4.b`,
`bevestiging.groep_beschermen.uitleg` (zegt al dat het klassement blijft staan).

## Grendel

`src/shared/i18n/beloftes.test.ts`, blok "wat Beschermd belooft": geen sleutel over
groepszichtbaarheid zegt nog "niet je weken" of "niet je punten", elke beschermde tekst
noemt het klassement, de lopende en goedgekeurde weken en het persoonlijke totaal, in nl
én en. Per grendel met de hand gebroken in `deling.uitleg_beschermd` (nl), en telkens viel de
bedoelde test om: de oude zin terug gaf het verbod op "niet je weken" én de eis
"persoonlijk totaal"; de klassementzin weg gaf de klassementeis; "lopende en goedgekeurde
weken" weg gaf die eis; "persoonlijke puntentotaal" weg gaf de totaaleis. De lijst van
beschermde sleutels is afgeleid (`uitleg_beschermd`), niet vast.

## Wat dit niet is

Geen migratie en geen verruiming van een oppervlak. De database is niet veranderd.
