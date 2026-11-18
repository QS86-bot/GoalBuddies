# Het groepsoverzicht rekent alleen de pagina door

**Datum:** 18-11-2026 · **Issue:** QS8-699 (vervolg op QS8-665) · **Migratie:** 0307
(voorlopig nummer; de batchsessie hernummert bij het landen)

## Wat er verandert

`group_overview()` kiest eerst welke leden op de pagina staan, en rekent pas daarna
doelen, mijlpalen, reeksen en afsluitingen uit. Dat rekenwerk gebeurt dus alleen voor
die leden. Tot 0307 gebeurde het voor élk lid van de groep, en de `limit` kwam pas
daarna.

Drie CTE's:
- `alle`: alle leden die meetellen (`status <> 'inactive'`, met een profiel). Dit is
  de bron van `total_members`.
- `pagina`: uit `alle`, met dezelfde cursor, volgorde en `limit` als de functie
  altijd al had.
- `leden`: het oude rekenwerk, beperkt tot `pagina`.

Wat níet verandert: de kolommen, de volgorde (`joined_at`, `user_id`), de cursor,
`total_members`, wie er meetelt, en alle RLS. De functie blijft `stable` en geen
definer. Ze leest onder de rechten van de aanroeper, net als ervoor. Domeinregel 7:
er komt geen rij en geen kolom bij. Het lichaam is dat van 0303, met de CTE's ervoor.

De doelen-lateral zoekt de koppeling nu per doel op sleutel
(`exists … l.goal_id = gg.id and l.group_id = m.group_id`) in plaats van met een
join op `l.group_id`. Het resultaat is hetzelfde.

## Wat gemeten is

📏 Met `docs/research/teamplafond-meting.sql`, `extra=5000`, mediaan in ms. De
machine is onrustig: herhalingen wijken tot 30% af, dus hieronder staan bereiken uit
drie reeksen.

| leden | oud lichaam (0303) | 0307 |
| --- | --- | --- |
| 12 | 28–43 | 28–48 |
| 25 | 52–70 | 44–72 |
| 50 | 109–155 | 52–60 |
| 100 | 346 | 65 |

Acceptatie "50 ≤ ongeveer 2× 25": gehaald, en meer dan dat. Vanaf 20 leden is 0307
vlak.

⚠️⚠️ **De meting van QS8-665 had geen statistieken op de tabellen die het script net
gevuld had.** De planner hield `group_members`, `goals` en `goal_group_links` voor
bijna leeg en koos per doel een scan over alle koppelingen van de groep. Dat was
oorzaak 2 in het issue (`rows=38 loops=75`), en dat maakte de curve kwadratisch. Het
meetscript draait nu `analyze` op elke tabel die het vult. Zonder die regels kost
0307 bij 25 en 50 leden nog 80 en 268 ms; dan meet je het plan dat productie niet
kiest. De correctie staat ook in
`docs/decisions/2026-11-18-het-plafond-van-een-teamgroep-gemeten.md`.

## Wat getest is, en wat niet

- De bestaande tests van het groepsoverzicht (12 bestanden, 299 tests) blijven groen
  op 0307. Daaronder vallen paginering, cursor, `total_members`, uitgezette leden,
  aandelen, huddledag, De Ketting en reeksen.
- `tests/rls/overzicht-paginering.test.ts` kreeg één aanscherping:
  `total_members` moet gelijk zijn aan het aantal leden dat je over alle pagina's heen
  ziet. Zonder die regel bleef de test groen als het getal uit de pagina kwam: beide
  pagina's zeiden dan "2".
- Mutaties op 0307, elk met de hand toegepast en daarna teruggezet:
  - de teller uit `leden` in plaats van `alle`: rood, op die nieuwe toets;
  - de cursor uit `pagina` weggelaten: rood, 3 van de 4;
  - de volgorde in `pagina` omgekeerd: rood, 3 van de 4;
  - de beperking tot `pagina` uit `leden` gehaald: **groen**.

⚠️ **Die laatste is geen gat in de suite maar een eigenschap van de belofte.** "Rekent
alleen de pagina door" is een snelheidseigenschap: het antwoord is gelijk. Geen
gedragstest kan hem raken. Het instrument is het meetscript, en dat is hier niet aan
de poort gekoppeld: een tijdsgrens in CI op gedeelde hardware wordt een test die je
leert overslaan. **Dit is een aanname**: een latere herschrijving die de pagina-eis
laat vallen, valt pas op bij een nieuwe meting.
