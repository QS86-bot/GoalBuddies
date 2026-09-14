# De kant die meet en de kant die muteert

**14-09-2026 — QS8-497.** Agendarij van 01-09-2026.

## De naad

`scripts/rls-dekking.mjs` zet elke policy om beurten wagenwijd open via `psql()`
naar `(host, poort, db)`, en meet het effect met de RLS-suite — die praat met
**PostgREST** op `RLS_LOKAAL_URL`, en dát is wat PostgREST bij het starten in
zijn `db-uri` kreeg.

**Niets koppelde die twee.** Wijzen ze naar verschillende databases, dan zet je
de ene open en meet je de andere.

- Verkeerde **poort** → álles heet "onbewaakt". Vervelend, maar het valt op.
- Een tweede `goalbuddies_rls` op een andere poort → **stil**. De mutatie landt
  waar niemand kijkt, de suite blijft groen, en **elk gat komt eruit als
  bewaakt**.

⚠️ Dat tweede is de gevaarlijke richting, en het is regel 18 in zijn zuiverste
vorm: beide helften kloppen los, en niemand toetst dat ze op hetzelfde wijzen.

## Waarom geen vergelijking van twee instellingen

Het lag voor de hand om de `db-uri` van PostgREST naast `BESTEMMING` te leggen.
Dat kan niet en het zou ook niet deugen: die `db-uri` is van deze kant niet uit
te lezen, en twee strings naast elkaar leggen bewaakt de **omweg** en niet de
belofte — twee verschillende schrijfwijzen van dezelfde verbinding zijn dan een
vals alarm, en een proxy ertussen een valse groene.

## Wat er wél staat: een merkteken

Eén ding toetsen, en het is precies het ding dat telt: **ziet de kant die meet,
wat de kant die muteert doet?**

1. `psql` maakt een tabel met een unieke naam en stuurt `notify pgrst, 'reload
   schema'`.
2. Het script vraagt PostgREST naar die tabel.
3. **200** → dezelfde database. **404** → niet dezelfde, en dus geen meting.
4. Het merkteken gaat er in een `finally` weer uit, ook als de vraag omvalt.

📏 Het mechanisme is eerst los gemeten: een tabel die via `psql` gepland wordt is
na de herlaadmelding een **200**, een tabel die niet bestaat een **404**.

⚠️ De `notify` hoort erbij en is geen detail: PostgREST houdt zijn schemacache
vast, en zonder die regel is een verse tabel een 404 om een reden die niets met
de database te maken heeft.

⚠️ Hij staat **vóór de eerste mutatie**. Vanaf daar zet dit script policies open;
gebeurt dat in de verkeerde database, dan is alles wat erna komt verzonnen.

## De ijking — tegen een échte mismatch

Niet nagespeeld maar echt opgezet: een tweede database, een tweede PostgREST
ernaast op poort 3011, en `psql` onveranderd op `goalbuddies_rls`.

| Stand | Uitslag |
|---|---|
| PostgREST op dezelfde database | `{ ok: true }` — geen valse weigering |
| PostgREST op een **andere** database | weigert, en noemt het merkteken, de URL en de 404 |

📏 En de opruiming nagemeten: nul achtergebleven `pgrst_koppeling_*`-tabellen.

De melding zegt met zoveel woorden dat dit *het stille geval* is en dat elk gat
er zonder deze toets als bewaakt uit zou zijn gekomen — want een lezer die
"weigert te rapporteren" ziet, moet niet in de policies gaan zoeken.

## Wat het oordeel los toetst

`beoordeelKoppeling()` is geëxporteerd en krijgt élke vorm los aangeboden:
de goede stand (200), het stille geval (404), een onbereikbare PostgREST
(`status === null`) en een onverwachte status (500).

⚠️ **De drie foutgevallen dragen met opzet verschillende teksten.** Een storing
is iets anders dan twee databases, en één melding voor allebei stuurt de lezer
naar de verkeerde oorzaak. De test legt dat vast met een negatieve assertie: de
onbereikbaar-melding mag *niet* "niet dezelfde" bevatten.

⚠️ En de helft die even zwaar telt: bij 200 heeft hij **niets** te melden. Een
controle die ook in de goede stand iets zegt, leer je negeren.

## Wat dit niet is

`magHierDraaien()` en `kloptDeBestemming()` blijven zoals ze zijn. Die bewaken de
**psql-kant** tegen constanten en vangen een verkeerd ingestelde psql af. Dit
komt ernaast: zij zeggen *ik sta waar ik hoor te staan*, en deze zegt *en de
ander staat daar ook*.
