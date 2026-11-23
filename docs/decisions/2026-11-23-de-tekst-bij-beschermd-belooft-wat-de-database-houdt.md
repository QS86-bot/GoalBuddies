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

## De gekozen tekst (variant B)

De groep ziet de titel en voortgang van wat je koppelt, en je lopende en goedgekeurde
weken. Een gemiste of doorgeschoven week ziet niemand, tenzij je hem zelf deelt. Heeft de
groep een klassement, dan ziet iedereen de punten die je in deze groep verdiende, maar
nooit een gemiste week of je persoonlijke totaal.

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
