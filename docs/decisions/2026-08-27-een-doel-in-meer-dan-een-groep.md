# Eén doel in meer dan één groep — QS8-56 (PRD 5.5)

**27-08-2026.** Het acceptatiecriterium is één zin: *"Als gebruiker kan ik
hetzelfde doel aan meer dan één losse groep koppelen."* De verwachting was een
scherm bouwen. Wat er gebeurde, is dat de meting eerst iets anders liet zien.

---

## 0. Het kon al, en dat is het uitgangspunt

`goal_group_links` heeft sinds migratie 0001 de sleutel `(goal_id, group_id)`,
dus twee groepen per doel was nooit verboden. Sterker: **de app kon het al.**
`KoppelDoel` op het groepsscherm filtert je doelen tegen de koppelingen van
*díé* groep, dus wie in groep A een doel koppelde en daarna naar groep B liep,
had het doel in twee groepen. Zonder een enkele foutmelding.

Wat ontbrak was niet het recht maar het **overzicht**: nergens stond met wie je
een doel deelt, dus je kon het ook niet nalopen of terugdraaien zonder langs elk
groepsscherm apart te gaan. En daaronder lag iets dat wél stuk was — zie §2.

Er komt daarom **geen migratie** bij deze issue. Het datamodel klopte, de RLS
klopte (gemeten, §4), en EPIC 13 toetst de lastigste stand al: een doel dat
tegelijk in een open en een beschermde groep staat.

---

## 1. Een blok op het doelscherm, niet een tweede koppelscherm

`GedeeldMet` staat op `app/doel/[id].tsx` en toont twee lijsten: de groepen waar
dit doel in staat, en de groepen waar het nog bij kan.

**Per groep een knop, en geen "stop met delen".** Elke groep is een aparte
toestemming — dat is wat `goal_group_links_delete` ook doet, het kijkt naar één
rij. Eén knop die alles losmaakt zou een belofte versimpelen die de database
juist nauwkeurig maakt.

**De zin over wat je deelt staat per groep en niet boven de lijst.** Een doel mag
tegelijk in een open en een beschermde groep staan, en dan is één zin boven de
lijst voor de helft onwaar. Dat is exact de fout die de critical-user-ronde van
24-08 vond bij `koppel.uitleg`: een privacybelofte die gedaan werd op het moment
van toestemming en niet klopte in een open groep. `beloftes.test.ts` bewaakt dat
er een `_beschermd` én een `_open` variant is en dat ze verschillen; sinds deze
issue bewaakt `tests/beloftes/doel-in-meerdere-groepen.test.ts` ook dat het
scherm daadwerkelijk per groep kiest — want de reden in `TOEGESTAAN` was tot nu
toe een bewering in een commentaarregel.

---

## 2. `groepen[0]` — het onderdeel klopte, het geheel niet

Dit is de eigenlijke vondst van deze issue.

Een verzoek om je streefdatum te verschuiven gaat naar één groep (besluit A7):
die groep leest je uitleg en beslist erover. Het scherm koos die groep zo:

```ts
const groep = groepen[0];
```

En `fetchGroepenVanDoel()` had geen `order by`. Welke groep dat was, beloofde
Postgres dus niet eens.

Elk onderdeel was goed en getest. `vraag_deadline_verschuiving()` toetst
lidmaatschap **én** koppeling (migratie 0032, §255). `beslis_deadline_verzoek()`
toetst lidmaatschap van de groep waar het verzoek aan gericht is.
`deadline_requests_select` laat alleen de aangeschreven groep meelezen. Alle drie
gemeten, alle drie dicht. Wat niemand toetste, was of de gebruiker die groep ooit
had **aangewezen**.

En dat kon ook niet opvallen: zolang er geen scherm was dat een doel aan twee
groepen hing, was de toestand onbereikbaar. **De fout was al gebouwd en wachtte
op de feature die hem zichtbaar maakt.** Dat is de vorm uit onwrikbare regel 18,
en dit is de zuiverste variant ervan tot nu toe: er was geen test die groen bleef
terwijl de belofte brak — er was geen test die de belofte kón raken.

**Wat er nu staat.** `beslissendeGroep(groepen, keuze)` in
`src/modules/buddies/deling.ts`:

- nul groepen → geen beslisser (persoonlijk doel, `zet_streefdatum()`)
- precies één groep → die groep, zonder dat er iets gekozen hoeft te worden
- twee of meer → **alleen** de groep die de gebruiker aanwees

Bij twee of meer verschijnt er een keuzelijst **zonder voorkeuze** en staat de
verstuurknop uit tot er gekozen is. Dat is de conservatieve kant: een verzoek dat
niet weggaat is beter dan een verzoek dat naar de verkeerde mensen gaat.

**Twee dingen die daarbij horen en niet vanzelfsprekend zijn:**

1. **Bij één groep wordt de keuze niet opgeslagen maar afgeleid.** `useState`
   draait zijn beginwaarde één keer. Zou de beginwaarde `groepen[0]` zijn, dan
   bleef die staan zodra je het doel aan een tweede groep koppelt terwijl het
   formulier openstaat — met een keuzelijst ernaast die het tegendeel suggereert.
2. **Verdwijnt de gekozen groep, dan is er geen beslisser** — niet de volgende in
   de rij. Een verzoek dat naar een andere groep verhuist dan je aanwees, is
   erger dan een verzoek dat blijft staan.

**Waarom dit een functie is en geen paar regels in het component.** Een regel die
in een component staat, kun je alleen toetsen door het component te renderen of
door in de broncode naar een letterlijke regel te grijpen. Dat tweede is precies
de testvorm die bij QS8-85 stilletjes ophield iets te bewaken. Als functie is de
vraag uit regel 18 beantwoordbaar, en het antwoord is met de hand gecontroleerd:
met `?? groepen[0]` erachter worden twee tests rood en de rest groen.

---

## 3. `fetchGroepenVanDoel()` kreeg een volgorde, en dat hoort bij de limiet

Er stond `.limit(20)` zonder `.order()`. Dat kapt een wíllekeurige twintig af.
Zolang niemand een doel aan twee groepen kon hangen viel dat niet op. De
sortering staat nu op `linked_at` — een kolom op de rij zelf, dus één vraag en
geen sortering over een ingebedde tabel.

---

## 4. De vraag die deze feature wél opent: leert groep A iets over groep B?

Bij élk nieuw ding dat de groep te zien krijgt, twee vragen (CLAUDE.md,
domeinregel 7): kan hieruit iemands gemiste week worden afgeleid, en kan iemand
dat met één API-verzoek uitlezen buiten de UI om?

Het blok zelf toont je eigen doel en je eigen groepen aan jezelf, dus het is geen
nieuw groepszichtbaar oppervlak. Maar de *toestand* die het aanbiedt is nieuw, en
daar horen metingen bij. Alle vier gemeten tegen de draaiende database met
`pg_policy` en `pg_get_functiondef()`, en alle vier vastgelegd in
`tests/rls/deling.test.ts`:

| Oppervlak | Predicaat | Uitkomst |
|---|---|---|
| `goal_group_links_select` | `is_group_member(group_id)` | **Dicht.** Een lid van A leest de rij van B niet, ook al mag het het doel wel zien |
| `deadline_requests_select` | `requester_id = auth.uid() or is_group_member(group_id)` | **Dicht.** De niet-gekozen groep leest je uitleg niet |
| `beslis_deadline_verzoek()` | lidmaatschap van `r.group_id` | **Dicht.** Een buddy uit A beslist niet over een verzoek aan B |
| `goal_events_select` | `owner_id = auth.uid() or shares_group_with_goal(g.id)` | **Open, en dat is aanvaard — zie hieronder** |

⚠️ **`goal_events` is de enige die per doel kijkt en niet per groep, en dat is
bewust zo gelaten.** Een lid van groep A leest daardoor het `deadline_moved`-event
dat groep B heeft goedgekeurd, inclusief `approved_by_id`: de uuid van iemand die
hij niet kent. Daaruit leidt hij af dat dit doel ook ergens anders staat.

Afgewogen en aanvaard, om drie redenen:

1. **Er zit geen tegenslag in.** De CHECK op `goal_events` staat op precies vier
   soorten: `created`, `deadline_moved`, `archived`, `completed`. Geen daarvan is
   een gemiste week, een verbroken reeks of een achterstand. Domeinregel 7 gaat
   over tegenslag, en die staat hier niet in.
2. **De nieuwe datum was toch al zichtbaar.** `goals.target_date` is leesbaar voor
   elke groep waar het doel aan gekoppeld is — dat is wat koppelen bétekent. Het
   event vertelt hóé hij verschoof, niet dát hij verschoof.
3. **De uuid is opaak.** Groep A kan het profiel van die persoon niet lezen.

⚠️ **Wordt zwaarder als:** er een vijfde `event_type` bij komt. De CHECK is een
allowlist; wie hem verruimt met iets dat over tegenslag gaat, opent dit oppervlak
mee. Staat als rij in `docs/ENGINEER-REVIEW.md`.

---

## 5. Wat `koppelbareGroepen()` níét is

Een grens. De lijst is gebruiksgemak; wie hem omzeilt en zelf een
`goal_group_links`-rij schrijft, loopt tegen `goal_group_links_insert`: lid van de
groep **én** eigenaar van het doel. Dat staat als waarschuwing boven de functie,
want dit is precies het misverstand dat `api.ts` in zijn eigen kop al benoemt —
een filter in de client die eruitziet alsof de beveiliging daar zit.

De functie neemt daarom ook niet aan dat de aanroeper al gefilterd heeft: een
gearchiveerde groep gaat er zelf uit, ook al zou `groups_select` hem normaal niet
eens teruggeven.

---

## 6. `leesZichtbaarheid()` staat nu één keer

`groups.zichtbaarheid` is in de gegenereerde types een kale `string`, dus elke
lezer moet versmallen — en elke lezer die dat met de hand doet, kan het één keer
andersom opschrijven. Eén `=== 'beschermd' ? 'beschermd' : 'open'` is genoeg om
een lege kolom als "open" te laten lezen, en dan denkt de gebruiker dat hij
minder deelt dan hij deelt.

De versmalling staat sinds deze issue één keer in `schemas.ts` en wordt gebruikt
door `fetchUitnodiging()`, `fetchGroepenVanDoel()` en `koppelbareGroepen()`.
Onbekend is beschermd — besluit A41.

---

## 7. Wat er níét mee is veranderd, en waarom dat een keuze is

De sweep die §2 opleverde — grep op `[0]`, `.find(`, `single()` in alles wat een
gedeeld doel aanraakt — vond drie plekken. Eén was stuk (§2). De andere twee zijn
bewust blijven staan:

- **`HulpVragen`** (de knop "vraag je groep om hulp") heeft een keuzelijst mét een
  zichtbaar voorgeselecteerde groep. Dat is een andere constructie dan een
  onzichtbare keuze: de gebruiker ziet wélke groep het bericht krijgt op het
  moment dat hij op versturen drukt. Dit is wél een van de drie routes waarlangs
  tegenslag de groep bereikt (domeinregel 7), dus de vraag is legitiem — maar het
  antwoord "het staat er zichtbaar bij" is dat ook, en het verbreden van deze PR
  is het niet waard. ⚠️ **Wat er wél aan verbeterde is de determinisme-kant:**
  de voorselectie was `groepen[0]` uit een lijst zonder `order by`, dus welke
  groep er voorgeselecteerd stond, was niet voorspelbaar. Sinds §3 is dat de
  eerst gekoppelde groep.
- **`Straf`** kiest een begunstigde groep uit `fetchMijnGroepen()` — niet uit de
  groepen van het doel — met een keuzelijst én een aparte bevestigingsstap waarin
  de consequentie uitgeschreven staat (domeinregel 5). Daar is niets stils aan.

- **`bewijseisVoorDoel()`** in `modules/completions` was al meervoudig gebouwd:
  hij haalt álle gekoppelde groepen op en neemt de strengste bewijseis. Dat is
  hoe het hoorde, en het is het bewijs dat de aanname "precies één groep" niet
  overal zat — alleen in het scherm dat er als enige een keuze uit maakte.
