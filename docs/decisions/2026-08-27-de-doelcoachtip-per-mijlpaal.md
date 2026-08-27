# De Doelcoach-tip per mijlpaal — QS8-137, besluit A48 variant 2

**27-08-2026.** De tweede helft van A48. Quinten koos op 25-08 het gefaseerde
advies: variant 3 nu, variant 2 erbovenop zodra er mijlpalen zijn. Variant 3
staat — een vaste set van vijf regels per doelcategorie in `src/shared/ui/tips.ts`.
Dit is variant 2.

Zes keuzes hierin zijn niet vanzelfsprekend.

---

## 1. Een eigen tabel voor één regel tekst

Een kolom `tip` op `milestones` was één regel geweest. Dat kan niet:
`milestones_select` loopt via `shares_group_with_goal()`, en **RLS beslist over
rijen en niet over kolommen**. Die kolom was met elke mijlpaalrij meegegaan naar
elke groepsgenoot van een gekoppeld doel.

Dat is exact de fout die migratie 0050 heeft moeten repareren met `goal_risk`, en
het is in dit project zeven keer eerder misgegaan. Voor élk nieuw oppervlak is
beschermd het antwoord tot iemand het tegendeel besluit, en niemand heeft hier
iets anders besloten.

De tweede reden weegt bijna even zwaar: **de primaire sleutel op `milestone_id`
ís de belofte "één keer per mijlpaal, voor altijd".** Zo'n belofte in een RPC
zetten betekent dat je hem moet blijven onthouden; in een primaire sleutel is hij
structureel.

---

## 2. De invoer van een tip-job is precies één sleutel

⚠️ **Dit is het belangrijkste slot van deze hele feature.**

De kop van `doelcoach/index.ts` schrijft het al op: *"Zou deze functie tekst uit
het verzoek gebruiken, dan is het quotum een formaliteit: dan stuur je gewoon je
eigen prompt en betaalt Quinten de rekening."*

Voor mijlpalen en weekstappen stelt de client de invoer samen, en dat is daar een
bewuste afweging — de doeltitel is zíjn tekst en het gaat over zijn eigen doel.
Voor een tip is dat niet nodig: hij levert een `milestone_id` en verder niets, en
de Edge Function haalt de titel, de omschrijving en de streefdatum zélf op onder
`service_role`.

`vraag_ai_job()` weigert sinds 0103 elke andere invoer voor dit soort job — niet
"onbekende sleutels negeren" maar `ongeldige_invoer` teruggeven. Dat staat onder
test met een injectiepoging als testgeval.

**Dit is er in de eerste versie níet ingegaan.** Die stuurde doeltitel en
mijlpaaltekst mee vanaf de client. De planning van dit issue wees het aan; het is
recht gezet vóór de eerste commit.

---

## 3. De zeef staat in de database, en dan nog een keer in TypeScript

Het acceptatiecriterium: *"Er staat een zeef op de gegenereerde tekst die een
tegenvaller weigert."* De vaste regels hadden zo'n zeef al — maar dat is een
**test**, en een test kan een gegenereerde zin niet vooraf lezen.

**In de database, want dat is waar de schrijver zit.** De tip komt binnen via
`service_role` vanuit een Edge Function, en die omzeilt RLS volledig. Een zeef in
de app-laag zou precies de schrijver overslaan waar hij voor bedoeld is. Dat is
in dit project de meest herhaalde zin: de regel is pas afgedwongen als de
dátabase hem afdwingt.

**En dan nog een keer in `tipVoorWeek()`, om één specifiek geval.** Een CHECK
hervalideert bestaande rijen niet. Scherpt iemand `tegenvaller_woorden()` later
aan, dan blijft een tip staan die legaal was onder de oude regel en het niet meer
is onder de nieuwe. Die tak vangt precies dat.

⚠️ **De prijs is een naad, en die staat onder test.** Eén gedeeld ijkcorpus
(`ZEEF_IJKING`) gaat door béide implementaties, en ze moeten het over élke zin
eens zijn — plus een tweede test die de woordenlijsten zelf op gelijkheid legt.
Die twee vangen verschillende dingen: een woord dat aan één kant verdwijnt hoeft
geen enkele zin uit het corpus te raken. Beide zijn met de hand rood gemaakt,
elk aan één kant.

Dat is dezelfde constructie als `SYSTEEM_GEBEURTENISSEN` naast zijn CHECK
(0032/0034), waar de test de app-lijst met **zichzelf** vergeleek en de twee
lijsten tóch uit elkaar liepen.

---

## 4. Deelstrings en geen woordgrenzen

"achter" matcht ook "achtergrond" en "achteraf". Dat is een vals positief en het
staat met opzet in het ijkcorpus.

De verleiding is woordgrenzen: `\m…\M` in Postgres, `\b` in JavaScript. Die twee
doen **niet** hetzelfde met niet-ASCII, en dan is de naad tussen de twee zeven
precies zo breed als het probleem dat hij moest dichten. Twee implementaties die
aantoonbaar gelijk zijn, is hier meer waard dan twee die net iets slimmer zijn.

De kosten van een vals positief zijn bovendien laag: een geweigerde tip valt
terug op de vaste set, en dat is een volwaardig antwoord.

⚠️ **Wordt zwaarder als:** het aantal geweigerde tips oploopt. Meetbaar aan
`ai_jobs.error`. Loopt dat op, dan is de prompt het probleem en niet de zeef.

---

## 5. Automatisch genereren, uit het bestaande quotum

De tip moet er "gewoon zijn" bij een gehaalde week; dat kan alleen als de app de
job zelf start. Dat kost geld zonder dat iemand op een knop drukt.

**Aanvaard, en begrensd door wat er al stond:** het gebeurt **één keer per
mijlpaal** en niet per week, en het put uit hetzelfde dagquotum van tien dat het
opsplitsen van een doel en de weekstappen ook gebruiken. Er komt dus **geen
plafond bij** — dat zou een uitgave zijn die Quinten niet heeft goedgekeurd.

Is het quotum op, dan geeft `vraag_ai_job()` `quota_reached`, doet de app niets,
en ziet de gebruiker de vaste regel. Met opzet geen foutmelding: hij heeft niets
gevraagd.

⚠️ **De planning stelde twee gescheiden potten voor** (tien voor de coach, drie
voor tips). Dat is aantoonbaar beter voor de gebruiker — een tip eet dan nooit
een mijlpaalgeneratie op — maar het brengt het plafond van tien naar dertien
calls per dag. Dat is grens 1 uit de beslisbevoegdheid: het kost Quinten geld.
**Niet gedaan; dit is de vraag om te beantwoorden als de tips merkbaar in de weg
gaan zitten.**

⚠️ En er zit een bovengrens op de pogingen: na drie mislukte jobs voor dezelfde
mijlpaal geeft de poort `opgegeven`. Zonder die grens kost een mijlpaaltitel waar
het model steeds een geweigerde tip voor bedenkt élke week opnieuw geld, en de
gebruiker ziet daar niets van — hij krijgt gewoon de vaste regel.

---

## 6. De tip draagt zijn taal, en verdwijnt bij een taalwissel

`weektip()` volgt de ingestelde taal vanzelf: hij komt uit de catalogus. Een
gegenereerde zin doet dat niet. Zonder de kolom `locale` zou iemand die op Engels
overschakelt een Nederlandse zin onder zijn weekdoelkaart houden.

Gevolg: wie van taal wisselt, verliest de gegenereerde tip voor die mijlpaal
permanent en krijgt de vaste set. Dat is de goede kant om te falen — de vaste set
is er in beide talen.

---

## Wat er bewust niet in zit

- **Hergenereren op verzoek.** Eén tip per mijlpaal, voor altijd.
- **Een goedkoper model voor tips.** Een tip is één zin en een mijlpaalplan is
  dat niet; een goedkoper model zou de kosten fors drukken. Niet gedaan, want het
  levert een tweede prijstabel naast `PRIJS_PER_MTOK_CENT` op, en dat is precies
  de kopie die in dit project al twee keer uit elkaar is gelopen.
  ⚠️ **Wordt zwaarder als:** het aantal `milestone_tip`-jobs de mijlpaal-jobs
  voorbijgaat, of zodra er een tweede AI-feature met korte uitvoer bijkomt.
- **De tip tijdens hetzelfde bezoek omwisselen.** Is er nog geen tip, dan toont
  de kaart de vaste regel en start de generatie op de achtergrond; de
  gegenereerde tip verschijnt bij het volgende bezoek. Halverwege vervangen zou
  precies de flikkering opleveren waar A48 keuze 1 tegen besliste.
- **Puntentaal in de zeef weigeren** ("punt", "score", "reeks"). De planning
  stelde het voor met een goed argument (A48: geen extra punten). Niet gedaan:
  "punt" is een te gewoon Nederlands woord — "op dit punt in het traject" — en
  elke valse treffer kost een betaalde call. De prompt verbiedt het wel.
