# Seizoenen per groep, met één recap — QS8-79 (PRD 8.5), migratie 0112

**27-08-2026.** Vier acceptatiecriteria, en drie ervan zijn ontwerpbeslissingen
vermomd als details.

---

## 0. De kolom lag er al

`groups.season_cadence` staat sinds migratie `0001` in het schema, met een CHECK
op `('monthly','quarterly')`, `default 'quarterly'` en sinds `0019` een
kolomgrant. Er heeft nooit iets naar gekeken. `dode-keten-controle` kende hem als
bewust dode waarde:

> *"Seizoenen zijn niet gebouwd (QS8-79, Fase 2); de kolom wordt door niets
> gelezen of geschreven. Wordt een defect zodra het seizoenoverzicht er is."*

Dit is de tweede keer deze week dat die lijst precies gedaan heeft wat QS8-123
ervan vroeg — de eerste was `approval_rule` bij QS8-65.

---

## 1. Een kalenderkwartaal, en waarom dat géén correctheidsregel 7 breekt

CLAUDE.md: geen enkele tijd- of weekberekening buiten `shared/time`. Die regel
gaat over de **twee klokken** — de persoonlijke week-startdag en de huddledag van
de groep. Beide zijn instellingen van een mens, en beide bepalen wanneer een week
begint.

Een seizoensgrens is geen van beide. Een kwartaal valt voor iedereen op dezelfde
dag, ongeacht wiens week op dinsdag begint. Er is niets te kiezen en niets uit te
lijnen — alleen `date_trunc()` in de tijdzone van de groep.

⚠️ **Wat hier wél had gekund en met opzet niet gebeurt:** de recap over "de
laatste dertien weekcycli" laten lopen. Dát zou weekrekenwerk zijn, en dan hoorde
het in `shared/time`. Het kalenderkwartaal is mede gekozen omdat het dat probleem
niet heeft.

⚠️ **En waarom een kwartaal en geen maand.** Habit Huddle draait maandelijks,
expliciet tegen *"week 3 is where groups go quiet."* Met weekcycli is een maand
vier datapunten en een kwartaal dertien. De keuze staat er wél — een groep die
sneller wil, mag sneller.

---

## 2. Om 08:00 in de tijdzone van de groep, en waarom dat de job uurlijks houdt

Acceptatiecriterium 3 zegt het scherp: *niet op het moment dat de kalender
omslaat*. Dat moment is middernacht, en een recap die dan binnenkomt is een
melding die niemand leest en iedereen wakker maakt.

`maak_seizoensrecaps()` doet daarom zelf twee toetsen: is het de eerste dag van
het nieuwe seizoen, en is het 08:00 in `groups.tz`. Daarom moet de job **elk uur**
langskomen — een dagelijkse job valt voor de helft van de tijdzones op het
verkeerde uur. Hij hangt aan de bestaande uurlijkse rollover, die dat ritme al
heeft.

⚠️ **`maak_seizoensrecaps(p_op timestamptz default now())` heeft die parameter om
testbaar te zijn, en dat is geen luxe.** Met een harde `now()` is de hele
timingtak alleen te toetsen door tot 1 januari te wachten. Dat is een belofte die
geen test kan raken, en dat is precies wat onwrikbare regel 18 vraag 3 verbiedt.
De rollover roept hem zonder argument aan, dus in productie is het `now()`.

---

## 3. Eén bericht, en de primaire sleutel ís die belofte

Acceptatiecriterium 2 noemt de fout die Habit Huddle heeft moeten terugdraaien:
losse recap-berichten lezen als spam en niet als een moment. Daarom draagt
`season_recap` al zijn cijfers in één `payload`.

De garantie zit niet in de code maar in het schema: `season_recaps` heeft
`primary key (group_id, season_start)`. Een tweede poging **botst** in plaats van
een tweede bericht te maken. Dat is dezelfde vorm als `milestone_tips` (QS8-137):
een belofte in een primaire sleutel hoef je niet te onthouden.

---

## 4. Alleen wat er wél gedaan is — en wat dat uitsluit

Acceptatiecriterium 4, en het is domeinregel 7. De drie cijfers zijn alle drie
**groepstotalen zonder namen**, en alle drie monotoon:

| Cijfer | Bron |
|---|---|
| afgeronde weken | `weekly_goals.status = 'approved'` in het venster, via `goal_group_links` |
| gehaalde mijlpalen | `milestones.status = 'done'` op `completed_at` in het venster |
| schakels | `chain_links` in het venster |

Dezelfde vorm als `ketting_stand()` en als de mijlpaalaankondiging uit `0070`:
een teller die alleen omhoog gaat, verraadt niemand.

⚠️ **Geen namen, geen ranglijst, geen "wie het meest".** Een ranglijst is per
definitie ook een lijst van wie onderaan staat. Wie ooit een `user_id` aan
`seizoensrecap_cijfers()` toevoegt, maakt er precies dat van.

⚠️ **En géén recap als alle drie de cijfers nul zijn.** *"Samen hebben jullie 0
weken afgerond"* is een tegenslagbericht met een vrolijke kop erop. In een stille
groep zwijgt de recap; `slaap_stille_groepen()` doet daar al wat er te doen valt.
Er komt dan ook géén rij in `season_recaps` — anders zou een groep die later weer
actief wordt, alsnog geen recap krijgen omdat de sleutel bezet is.

⚠️ **Op `completed_at` en niet op `target_date`.** Het gaat om wat er in dit
seizoen gedáán is, niet om wat erin gepland stond. Dat tweede zou een mijlpaal
die je niet gehaald hebt als een cijfer in de groepschat zetten.

---

## 5. Het zesde veld op een systeembericht, en de afweging die erbij hoort

`systeemberichten.test.ts` heeft een test die de vélden van een systeembericht
exact opsomt, met de bedoeling dat een toevoeging iemand dwingt na te denken. Die
werd rood, en dat is het ontwerp.

`getallen` is dat zesde veld. De afweging: het draagt drie **groepstotalen**,
dezelfde vorm als `aantal` maar met meer dan één getal, alle drie monotoon. Er zit
geen persoon in, geen titel en geen tijdstip dat aan één lid hangt.

Wat er bewust níét in mag: een `user_id`, een naam, of een cijfer dat kán dalen.
Dat laatste is een gemiste week met een omweg.

⚠️ **Er staat een grendel op een half ingevulde zin.** Ontbreekt één van de drie
sleutels in `payload`, dan valt het bericht terug op zijn opgeslagen `body` in
plaats van letterlijk `{weken}` in de groepschat te zetten. Migratie `0075` heeft
dat bij de ketting-mijlpaal één keer moeten repareren.

---

## 6. Wat er níét gebouwd is, met de reden

**De "reset" uit de user story.** PRD 8.5 zegt *"een recap en een reset"*, maar
geen van de vier acceptatiecriteria noemt een reset — en het is onduidelijk wát er
zou resetten. De punten niet (die zijn een grootboek, domeinregel 6). De reeks
niet (die is van de gebruiker, niet van de groep). De Ketting niet (die is
cumulatief, en dat is de hele reden dat hij veilig is). Wie dit alsnog wil, moet
eerst zeggen wat er weg zou moeten — en dan is het een besluit en geen omissie.

**Een seizoensoverzicht als scherm.** `season_recaps` is de bron en is leesbaar
voor leden, dus het scherm is een kleine toevoeging. De criteria vragen een
bericht, en dat is er.

⚠️ **Wat een deploy vraagt:** de rollover roept `maak_seizoensrecaps()` aan, en
die regel staat in `supabase/functions/rollover/index.ts`. Zonder een nieuwe
deploy van die functie draait de recap dus niet. Staat als regel in
`docs/ENGINEER-REVIEW.md` en in de Linear-comment.
