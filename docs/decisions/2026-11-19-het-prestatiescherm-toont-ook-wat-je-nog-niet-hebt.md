# Het Prestatiescherm toont ook wat je nog niet hebt

QS8-735, 19-11-2026. QS8-78 besloot op Vandaag alleen verdiende badges te tonen: een rij vakjes
met één gevulde is een lijst van wat je niet gehaald hebt. Dat besluit blijft staan voor Vandaag.

Quinten koos in QS8-735 (criterium 2) een Prestatiescherm "volledig in de geest van het Habit
Huddle-voorbeeld": alle badges, de niet behaalde als gedimde versie van hetzelfde pictogram, zonder
kruis of treurig teken, met "Nog te behalen" in tekst (niet alleen kleur).

Waarom dat met domeinregel 7 te verenigen is: het scherm is **alleen voor jezelf** (`badges_select`
is `user_id = auth.uid()`, `mijn_xp()` heeft geen gebruikersparameter) en een eigen tegenvaller is
privé zichtbaar. De grens is de import: `tests/beloftes/prestaties-blijven-voor-jezelf.test.ts`
laat geen groepsoppervlak het scherm, de badgetypes of XP bereiken, en toetst omgekeerd dat XP
nergens buiten zijn eigen plek in `app/` en `src/` staat.

Aanname (niet gemeten): vijf badges zien er kaal uit. Zeldzaamheid en XP per badge staan in
`src/modules/goals/badge-zeldzaamheid.ts` als kopie van `xp_bedrag_badge()` (0304); een test leest de
laatste migratie die de functie definieert. Een RPC die de bedragen teruggeeft is een alternatief
(dan valt de kopie weg) en is hier niet gekozen om geen extra databasefunctie te vragen.

Uitrolvolgorde: migratie 0304 hoort vóór deze frontend op productie; anders toont de XP-kaart een
melding met een knop "opnieuw" en blijven de badges gewoon staan.
