# Voorstel — bescherming bij een gemiste week (naast de freezes van Habit Huddle)

> Status 16-11-2026. Een **voorstel**, geen besluit en geen issue. Voortgekomen uit
> `docs/research/habit-huddle-app-ontleding.md` §13 en §16. Geschreven in een onderzoekssessie
> zonder Linear, claim of code; een bouwsessie of Quinten maakt er desgewenst het issue van.
> Bron voor het eigen gedrag: `supabase/migrations/0039_weekpassen.sql`, `0042_…`, `0074_…`,
> `supabase/functions/rollover/index.ts`, `docs/decisions/007-besluitenronde-25-08.md`,
> `docs/decisions/2026-09-04-de-dagreeks.md`. Gelezen vandaag; de migratiestand is niet tegen
> productie gecontroleerd (`pg_get_functiondef()` is de waarheid, regel 19).

## 1. Correctie op wat ik eerder zei — GEMETEN

Eerder noemde ik de automatische bescherming bij Habit Huddle een idee om te overwegen en
vroeg ik Quinten om een keuze tussen "alleen achteraf-venster" en "automatisch". **Dat
beeld klopte niet.** Onze weekpas is al **automatisch**:

- `verbruik_weekpas()` wordt aangeroepen door de uurlijkse rollover (`rollover/index.ts`, rond
  regel 1088) nadat een week op `missed` is gezet, en weigert zichzelf als er al iets `approved` is.
- De functie is niet uitvoerbaar voor `authenticated` (`0101`): de gebruiker kan hem niet zelf
  aanroepen. Er is **geen** knop en geen bevestiging.
- Er komt bewust geen systeembericht bij een verbruikte pas (`0039`): dat zou een gemiste week in
  de groepschat zetten (regel 7). `week_pass_events` is alleen voor de eigenaar leesbaar.
- Verdienen: een pas na de eerste voltooide week, daarna een per zes (A32); `007` heeft dit
  gefaseerd verruimd. Een pas beschermt de reeks, niet het punt (regel 10).
- Er bestaan ook **dagpassen** voor de dagreeks (`2026-09-04-de-dagreeks.md`): een tweede voorraad.

Gevolg: de keuze die Quinten maakte ("alleen achteraf-venster, jij kiest") is daarmee geen
keuze tussen twee nieuwe dingen. Gelezen als *vervanging* zou het een bestaand, automatisch
gedrag **afschaffen** en dus de reeks van mensen minder beschermen dan nu. Dat heb ik niet
bedoeld, en het staat hier **niet** als voorstel.

## 2. Wat Habit Huddle doet dat wij niet doen — GEMETEN (ontleding §13)

1. Een **achteraf-venster**: na een gemiste dag, of als de freeze pas na de miss binnenkwam, toont
   de check-inpagina de volgende ochtend een knop om gisteren alsnog te dekken.
2. Een **drempel**: automatisch pas vanaf een reeks van zeven; daaronder alleen zelf.
3. **Verdienen per check-indag** (één per 30) en een plafond van 5.

## 3. Het gat dat overblijft — AFGELEID

Een gemiste week wordt bij ons **eenmalig, automatisch en op het rolloveruur** beoordeeld. Mogelijke gaten,
die ik niet gemeten heb en die een bouwsessie moet nameten:

- Een pas die net na de rollover verdiend wordt, redt de gemiste week niet meer (het slot
  `week_pass_events_uniek` laat een tweede beoordeling niet toe, en een verdiende pas wordt niet
  met terugwerkende kracht ingezet). Dit is het geval dat Habit Huddle's venster dekt.
- Een gebruiker kan **niet kiezen** wélke week een pas redt; de pas gaat naar de eerstvolgende miss.
  Niet gemeten of dat in de praktijk iemand dwarszit.

## 4. Opties

| Optie | Wat | Domeinregels | Mijn oordeel |
|---|---|---|---|
| A. Niets doen | Huidige weekpas blijft | Geen risico | Veilig; je laat het gat van §3 liggen |
| B. Achteraf-venster **naast** de automatiek | Automatiek blijft. Is er bij de rollover geen pas, dan kan de gebruiker binnen een korte termijn zelf een pas inzetten zodra er een is | Regel 10 (reeks, niet punt) blijft; regel 7: alleen zichtbaar voor de eigenaar, geen systeembericht; regel 1: de termijn rekent via `shared/time` met de weekstart van de gebruiker | **Aanbevolen**, mits §5 klopt |
| C. Handmatig i.p.v. automatisch | De pas wordt alleen op verzoek ingezet | Schaft een bestaande bescherming af; stilzwijgend minder reeks voor mensen die de knop niet vinden | Afgeraden |
| D. Automatisch ook vanaf een drempel nabootsen | Pas pas vanaf een reeks van N weken | Maakt de bescherming kleiner voor nieuwe gebruikers, juist wie afhaakt (`007` zegt dat weken 1–6 de riskante weken zijn) | Afgeraden |

## 5. Voorwaarden aan optie B — AANNAME tot gemeten

- Het venster is een **handeling van de gebruiker op zijn eigen reeks**, zonder gevolg voor punten.
  Het is dus geen commitment device in de zin van regel 5, zolang er geen straf aan hangt.
  Hangt er een commitment aan het doel, dan moet bevestigd worden wat er met de straf gebeurt;
  dat is grens 1 en een besluit voor Quinten.
- Een `authenticated`-RPC voor het inzetten betekent een nieuwe `grant`: regel 4 (`revoke … from public, anon, authenticated`)
  en `tests/rls/functiegrants.test.ts` zijn dan van toepassing, en `security-reviewer` direct (regel 19).
- De RPC mag alleen werken op de **eigen** gemiste week, niet op een andere, en nooit een
  `approved` week overschrijven (zoals `verbruik_weekpas()` al weigert).
- Een test op de naad: automatiek en venster mogen samen niet twee passen aan dezelfde week uitgeven
  (`week_pass_events_uniek` bewaakt dat al voor `spent`; toets dat het ook zo blijft bij beide paden).

## 6. Wat dit niet is

- Geen overname van hun prestatie "een freeze gebruikt". Dat maakt een gemiste week zichtbaar
  als beloning; bij ons nooit (regel 7).
- Geen tweede passenvoorraad. Er is er al een voor dagen; een derde soort is precies de naad
  waar `2026-09-04-de-dagreeks.md` voor waarschuwt.
- Niets hierover is bij Habit Huddle gemeten voor **seizoenen**, **nudges** of de check-in zelf.

## 7. Besluit voor Quinten

Optie B bouwen als eigen, afgebakend issue? Alleen als hij het gat van §3 in de praktijk
herkent, en nadat een bouwsessie het gemeten heeft tegen de database. Zonder die meting is het gat
een aanname.
