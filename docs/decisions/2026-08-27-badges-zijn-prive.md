# Badges zijn privé — QS8-78 (PRD 8.4), migratie 0109

**27-08-2026.** QS8-78 is één zin uit de PRD:

> *Als gebruiker verdien ik badges voor mijlpalen als "4 weken op rij" of "eerste
> doel afgerond".*

Er staan geen acceptatiecriteria onder. **Alles in dit document is dus een keuze
die ik gemaakt heb en niet een eis die iemand gesteld heeft.** Ze staan hier
opgeschreven zodat Quinten ze kan omgooien in plaats van ze te moeten
reconstrueren uit de code.

---

## 1. De zwaarste keuze: badges zijn privé

`badges_select` is `user_id = auth.uid()`, zonder groepstak.

CLAUDE.md, besluit A41: *"Voor élk níeuw oppervlak is beschermd het antwoord tot
iemand het tegendeel besluit. Bouw niets 'vast open'; dat is precies hoe een
standaard verschuift zonder dat iemand het besloten heeft."*

Maar er is een scherper argument dan de standaard, en het is de reden dat ik hier
niet twijfelde. **Een badgemuur naast een ledenlijst is de zuiverste vorm van het
probleem dat domeinregel 7 beschrijft: de badge die er níét staat, is het
signaal.** Wie na twaalf weken geen `streak_12` heeft, heeft zichtbaar een week
gemist. Dat is geen afgeleide en geen gok — het is een rekensom die het scherm
zelf voor je maakt.

Dezelfde vorm als `points_ledger` (A42), `week_pass_events` (0039) en `goal_risk`
(0050, waar A17 om precies deze reden is teruggedraaid).

⚠️ **Dit oppervlak varieert niet op `groups.zichtbaarheid`.** In een open groep
valt er niets extra's te openen, want er gaat sowieso niets naar buiten. Wie dat
ooit wil veranderen, verandert niet een instelling maar dit besluit.

---

## 2. Een badge verdwijnt nooit

De reeksbadges hangen aan `best_streak` en niet aan `current_streak`.

Zou een badge verdwijnen als je reeks breekt, dan **ís dat verdwijnen zelf de
melding dat je een week gemist hebt** — een tegenslagsignaal in je eigen app, op
het moment dat je het het minst kunt gebruiken. Domeinregel 7 gaat over wat de
groep ziet; dit is dezelfde gedachte één stap naar binnen.

Structureel afgedwongen en niet met een regel code: `badges` heeft géén UPDATE-
en géén DELETE-policy, en ook `service_role` krijgt die niet. Er is geen pad
waarlangs het per ongeluk kan.

⚠️ **En hier zat een test die minder bewaakte dan zijn naam beloofde.** De test
*"houdt de badge als de reeks daarna breekt"* is groen omdat verwijderen
onmogelijk is — niet omdat de functie `best_streak` gebruikt. Bij het met de hand
breken bleek: `best_streak` vervangen door `current_streak` laat die test gewoon
groen. Er staat nu een tweede test naast (*"geeft de badge ook aan wie vier ooit
haalde en nu op nul staat"*) die de keuze wél vastpint, en het commentaar bij de
eerste zegt sindsdien wat hij écht bewaakt. Onwrikbare regel 18 vraag 3, in het
klein.

---

## 3. Vijf badges, en waarom precies deze

| Badge | Voorwaarde | Herkomst |
|---|---|---|
| `first_goal` | een doel op `completed` | staat in de PRD-zin |
| `streak_4` | `best_streak >= 4` | staat in de PRD-zin |
| `streak_12` | `best_streak >= 12` | een kwartaal; zelfde vorm |
| `first_milestone` | een mijlpaal op `done` | de kleinste eerste winst |
| `first_review` | een niet-ingetrokken bevestiging gegeven | zie hieronder |

De eerste twee komen letterlijk uit de PRD. De andere drie zijn van dezelfde
soort: **een drempel die je passeert en daarna gepasseerd blijft.**

⚠️ **`first_review` beloont het gedrag waar dit hele product op leunt** — iemand
anders zijn week bevestigen. Zonder beoordelaars bestaat peer-goedkeuring niet.
Het is bovendien de enige badge die niet over je eigen prestatie gaat, en dat is
opzet. Een ingetrokken bevestiging telt niet mee: intrekken maakt ongedaan zonder
te wissen (domeinregel 6), en een badge voor iets dat je hebt teruggenomen is
geen badge.

**Wat er bewust níét bij zit, met de reden:**

- **Een badge voor punten.** Punten zijn privé én ze kunnen dalen (A42). Een
  badge op een dalend getal is een badge die je kunt verliezen — zie punt 2.
- **Een badge voor "de meeste van je groep".** Een ranglijst is ook een lijst van
  wie onderaan staat.
- **Een badge voor terugkomen na een gemiste week.** Die klinkt aardig en is het
  niet: hij maakt van een gemiste week een vóórwaarde, en dan staat de tegenslag
  alsnog in de app, alleen met een lint eromheen.

---

## 4. Eén functie die alles opnieuw uitrekent

`verdien_badges(p_user_id)` evalueert **elke** voorwaarde opnieuw en voegt toe wat
nieuw waar is, met `on conflict do nothing`. Volledig en idempotent.

Er zijn vier momenten waarop een badge kan ontstaan — een reeks die herberekend
wordt, een mijlpaal die af gaat, een doel dat af gaat, een bevestiging die
geplaatst wordt — en alle vier roepen dezelfde functie aan.

**Een vergeten aanroep vertraagt een badge dan hooguit tot de volgende
gebeurtenis; hij raakt er nooit een kwijt.** Zou elke trigger zijn eigen badge
inserten, dan is een gemist pad een badge die nooit meer komt, en dat merk je pas
als een gebruiker het meldt.

⚠️ **`authenticated` mag `verdien_badges()` aanroepen, en dat ziet er raarder uit
dan het is.** De functie schrijft alleen badges die op grond van de data al
verdiend zíjn. Wie hem voor een ander aanroept, kent die ander hooguit iets toe
dat hij toch al hoorde te hebben — en leest er niets van terug, want
`badges_select` is eigenaar-only. Er staat een test op die dat vastlegt.

---

## 5. Wat het bouwen zelf opleverde

**Een `case` over `tg_table_name` met `new.<kolom>` erin werkt niet.** De eerste
versie van `badge_na_gebeurtenis()` deed
`case tg_table_name when 'user_streaks' then new.user_id ... end`. Plpgsql bereidt
bij een `case` **alle** takken voor, dus op een trigger over `goals` faalde
`new.user_id` met *record "new" has no field "user_id"* — en dan ging de hele
UPDATE onderuit, niet alleen de badge.

Dat is precies het faalbeeld dat je niet wilt: een versiering die een echte
handeling laat omvallen. **De bestaande RLS-suite ving het meteen** — 27 tests
over vier bestanden werden rood. Met `if/elsif` wordt alleen de genomen tak
geëvalueerd.

⚠️ Er zit bovendien een `exception when others` omheen: verdient iemand net geen
badge, of gaat er iets mis, dan telt de onderliggende gebeurtenis nog steeds.
Dezelfde afweging als bij `meld_goedkeuring()`.

**En de splitsing die QS8-120/121 al een keer heeft gekost.** `badges.ts` bevatte
eerst zowel de lijst als het ophalen, en dan trekt een unit-test de
Supabase-client en dus React Native mee — `vitest` valt om op *Flow is not
supported*. Het zuivere deel staat nu in `badges.ts` en het ophalen in
`badges-api.ts`.

---

## 6. Waar de gebruiker ze ziet

Eén blok onderaan *Vandaag*, naast de andere privé-standen (reeks, punten,
weekpassen). Niet op een groepsscherm, en het component krijgt geen `viewer`-prop
— dezelfde afspraak als bij `Weekpas` en `DoelStandKaart`.

⚠️ **Alleen verdiende badges, geen grijze vakjes voor wat je nog niet hebt.** Een
lijst met vijf slots waarvan er één gevuld is, is een lijst van wat je níét
gehaald hebt, met een vrolijk randje eromheen. Dat is het beeld dat dit product
bij de groep verbiedt, en er is geen reden om het bij jezelf wél te doen.

⚠️ Onder de lijst staat één zin: *"Wat je verdiend hebt, blijft staan. Ook als een
reeks een keer breekt."* Die staat er omdat punt 2 anders onzichtbaar is —
precies op het moment dat iemand zou denken dat hij zijn badge kwijt is.
