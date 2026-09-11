# Een grant is niet altijd het slot

**Datum:** 11-09-2026 · **Issue:** QS8-428 · **Migratie:** 0253

## 1. Wat er mis was

`functies_voor_authenticated()` (0115) gaf `p.proname` kaal terug, en
`tests/rls/functiegrants.test.ts` zocht daarmee naar
`grant execute on function <naam>\([^)]*\) to … authenticated`. **De argumentlijst was een
joker.**

Die grendel draagt onwrikbare regel 4 — *elke functie die `authenticated` mag uitvoeren
ligt naast de grant-regels; een recht zonder grant-regel is geërfd en niet besloten* — en
hij was precies blind voor de beweging waarbij die regel het hardst nodig is: een
**handtekeningwijziging**. Dan staat er een nieuwe functie met dezelfde naam, en
`alter default privileges` deelt die in Supabase uit aan `anon`, `authenticated` én
`service_role`.

⚠️ Dezelfde fout was in QS8-398 al gerepareerd in `scripts/functies-controle.mjs`. Twee
instrumenten met dezelfde blindheid, waarvan er één gerepareerd was.

## 2. Wat er nu staat

`functies_met_uitvoerrecht()` geeft **rol, naam en handtekening** — `anon` én
`authenticated` in één lijst. `kanonieke_handtekeningen(text[])` zet de handtekeningen uit
de grant-regels om naar de vorm die Postgres zelf rendert.

⚠️ **Die tweede functie is geen hulpje maar het hele punt.** 📏 De migraties schrijven
`timestamptz` (13×), Postgres rendert `timestamp with time zone`; `integer`/`int4` en
`boolean`/`bool` dragen hetzelfde risico. Een aliastabel in de test zou drift zijn —
`to_regprocedure()` kent ze allemaal, want het is dezelfde parser die de functies aanmaakte.
Hij geeft `null` voor een functie die niet bestaat, wat bij een grant uit een migratie die
later gedropt is precies het juiste antwoord is.

## 3. De anon-kant bestond niet, en vond meteen vier dingen

⚠️ **Het reviewdossier beweerde dat `functies_voor_anon()` al bestond.** 📏 Nagemeten bij
het bouwen: er was alleen de authenticated-variant. Dat is in het issue overgenomen en
hier rechtgezet — juist `anon` is de rol die telt, want een definer-functie die een
níet-ingelogde bezoeker mag aanroepen weegt zwaarder dan dezelfde functie voor een
ingelogde gebruiker.

📏 Zes functies mocht `anon` uitvoeren. Twee zijn besloten en blijven:
`invite_preview(text)` (QS8-236, de enige oningelogde ingang) en
`commitment_zichtbaar_voor_groep()`, die in `commitments_select` staat — en `anon` heeft
SELECT op `commitments`, de Supabase-standaard die 0073 bewust liet staan omdat RLS daar de
grendel is en niet de grant. Dat recht intrekken zou een gefilterde lege uitkomst in een
**fout** veranderen; dat is een eigen besluit en geen bijvangst.

De andere vier waren nooit besloten: `intrekvenster_minuten()`, `tegenvaller_woorden()`,
`tip_bevat_emoji(text)`, `tip_noemt_tegenvaller(text)`. Alle vier `immutable`, géén
`security definer`, en ze geven een constante terug. Geen policy, CHECK, view,
kolomdefault, indexexpressie of triggerdefinitie noemt ze, en `invite_preview()` ook niet.
Ingetrokken in 0253. **anon ging van zes naar twee.**

### Twee dingen die de revoke bijna waardeloos hadden gemaakt

⚠️⚠️ **`revoke … from anon` alleen was een schijnreparatie geweest.** 📏 De ACL van alle
vier begon met `=X/postgres` — een grant aan **PUBLIC**. Anon erft het recht daar óók
langs, dus een revoke die alleen `anon` noemt haalt niets weg en ziet er wél uit als een
fix. Zelfde klasse als QS8-337.

⚠️ **En dit is met opzet `from public, anon` en niet de voorgeschreven drie.** CLAUDE.md
schrijft `from public, anon, authenticated` voor omdat die vorm anders precies de rol
overhoudt waaronder iedere ingelogde gebruiker draait. Hier is `authenticated` juist wél
besloten — 0099 voor `intrekvenster_minuten()`, 0103 voor de drie tipfuncties — en die
grant blijft staan. Wie dit leest en de gebruikelijke vorm mist: dat is hier de bedoeling.

## 4. ⚠️⚠️ En toen bleek de grant niet het slot te zijn

Uit de security-review op deze branch, en **zelf gereproduceerd** voordat er iets aan
veranderd is.

📏 Tegen de lokale PostgREST (`db-pool = 10`), ná de revokes:

| stap | uitslag |
|---|---|
| `anon` → `/rpc/intrekvenster_minuten`, 8× | **401** (8/8) |
| één aanroep als `service_role` | **200**, antwoord `15` |
| `anon` → hetzelfde endpoint, 25× | **200 op 2 van de 25** |
| `has_function_privilege('anon', …, 'execute')` | **false** |

**De catalogus zegt nee en de API zegt ja.** De twee tweehonderdjes vallen op de
poolverbinding die de bevoorrechte aanroep geplant heeft. PostgREST hergebruikt prepared
statements per verbinding; een `immutable` functie **zonder argumenten** wordt in het plan
weggevouwen tot een constante, en dat hergebruikte plan doet de EXECUTE-toets nooit meer.

📏 **`stable` is dicht:** zelfde proef, ná vijftien primende aanroepen als `service_role`,
**401 op 25 van de 25**. Vandaar `alter function … stable` op de vier. Dat is een zwákkere
belofte dan `immutable` en dus semantisch altijd veilig, en geen van de vier zit in een
per-rij-pad.

⚠️ **Waarom dit de merge ophield en niet als vervolg wegging.** De branch levert een
grendel die certificeert dat de grant het slot is. Zou 0253 de vier revoken en ze
`immutable` laten, dan zou `functies_met_uitvoerrecht()` melden dat anon er twee mag —
terwijl de API er vier uitdeelt. Dat is regel 18 in zuivere vorm: elk onderdeel klopt en
het geheel lekt.

⚠️ **De rest van de klasse gaat hier níet mee.** 📏 `provolatile='i' and pronargs=0` telde
er **32** vóór deze migratie en **28** erna, waarvan **22** alleen aan `service_role`.
Wat daar langs kan komen zijn constanten — plafonds en drempels — en niets in `src/`,
`app/` of `supabase/functions/` roept ze als RPC aan, dus er is geen aanroeper die de pool
primet. Staat als QS8-433.

## 5. De ijking

📏 Drie mutaties, elk apart, elk hersteld:

| mutatie | uitslag |
|---|---|
| tweede overload van een gegunde naam, zonder grant | **rood op beide rollen** |
| dezelfde staat, maar met de **oude** naam-regex nagebouwd | **groen — niets geërfd** |
| `alter function … stable` op de vier, dan de primingproef | **401 op 25/25** |

**De tweede rij is de rechtvaardiging van het hele issue.** Dezelfde toestand, en de oude
vorm ziet er niets van.

## 6. Wat dit niet is

- **Geen controle op `grant … on all functions in schema public`.** Die vorm kan de regex
  niet parsen, dus hij voegt niets aan de toegestane lijst toe terwijl de databasekant
  groeit — de faalrichting is veilig (de review mat: 269 bevindingen).
- **Geen dekking voor drop-en-opnieuw op dezelfde handtekening.** Dan dekt een oude
  grant-regel de nieuwe functie af. 📏 Doorgerekend over alle migraties en alle huidige
  rechten: 0 instanties vandaag. Staat als rij op de reviewagenda.
- **Geen tabelgrants.** `alter default privileges` deelt daar dezelfde drie rollen uit; die
  voorwaarde stond al op de rij van 28-08.
