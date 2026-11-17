# Een teamgroep hoort bij een organisatie

**Datum:** 17-11-2026 · **Issue:** QS8-653 (epic QS8-650) · **Migratie:** `0300` (voorlopig nummer) ·
**Bouwt voort op:** QS8-652 (`0299`, organisaties en lidmaatschappen) ·
**Besluiten:** 9, 13, 18, 26, 27, 34 en 36 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| `groups.organization_id` | nullable, partiële index, geen kolomgrant, en een eigen pintrigger `groups_organisatie_vast` (ook tegen `service_role`) |
| een team is nooit vindbaar | CHECK `groups_team_niet_ontdekbaar` |
| een team aanmaken | `maak_teamgroep()`, alleen voor een organisatiebeheerder; hij wordt er geen lid van |
| lid van een team = lid van de organisatie | trigger `group_members_teamlid` op elke route, plus een nette weigering in `join_group_with_code()` en `beslis_lidmaatschapsverzoek()` |
| de organisatiebeheerder beheert elk team | `is_teambeheerder()`, als tak in `is_group_admin()` en in `guard_group_member_update()` |
| de vertrek-cascade | trigger `organization_members_vertrek_cascade` |
| het ledenplafond | `ledenplafond()`: 25 voor een teamgroep, 12 voor elke andere |

## Keuzes die hier gemaakt zijn

**1. Een eigen pintrigger en geen tak in `guard_group_update()`.** De tak van QS8-233
(`claude/beautiful-archimedes-lncmyl`, migratie 0300) herdefinieert
`guard_group_update()` ook, met een pin op `automatisch`. Twee herdefinities van één
functielichaam verliezen elkaars register zodra ze allebei landen, en git ziet dat
niet (QS8-358). Met een eigen trigger kan dat niet.

**2. `maak_teamgroep()` hoort bij dit issue.** De beschrijving zegt "de organisatie
kiest bij het aanmaken" zonder de weg te noemen. Zonder schrijver kan niemand
`organization_id` zetten, en is geen enkel criterium te toetsen. Besluit 13 geeft
de beheerder het recht om teams aan te maken. De naam, huddledag, tijdzone en
daglimiet volgen `create_group()` (0287), ook de vraag naar `pg_constraint` bij een
CHECK-fout.

**3. De organisatiebeheerder wordt geen lid van het team dat hij maakt** (besluit
36). Een team begint dus zonder leden. Leden komen binnen met de uitnodigingscode.

**4. Een buitenstaander met de teamcode krijgt `invalid`, hetzelfde als bij een
onbekende code.** Een eigen reden zou bevestigen dat de code bij een team hoort, en
dan is `join_group_with_code()` een orakel op codes van organisaties waar je niet in
zit. In `beslis_lidmaatschapsverzoek()` mag de reden wél eigen zijn
(`not_org_member`): de beslisser is beheerder en weet al welke groep het is.

**5. De vertrek-cascade is een trigger op `organization_members`**, niet een regel
in `verlaat_organisatie()` en `zet_organisatielid_uit()`. Zo vangt hij elke route
naar inactief, ook een latere, en blijven de lichamen van QS8-652 onaangeroerd. De
opruiming is die van `verwijder_lid()`: openstaande deadlineverzoeken ingetrokken,
de koppelingen van zijn doelen aan het team weg, en dan inactief. Zijn doelen zelf
blijven (besluit 14).

De cascade loopt onder een nieuwe sessiesleutel, `app.organisatie_vertrek`,
geregistreerd in `sleutelzetters()`. `guard_group_member_update()` laat onder die
sleutel alleen de overgang naar inactief door. Zonder die sleutel weigert de bewaker
terecht: de vertrekker is geen beheerder, en de organisatiebeheerder is geen lid.

**6. `guard_group_member_update()` krijgt dezelfde beheerderstak als
`is_group_admin()`.** Het issue noemde deze trigger als een van de drie paden die
apart beoordeeld moesten worden. Gemeten: zonder die tak weigert hij elke
lidmaatschapswijziging van een organisatiebeheerder met `geen_groepsbeheerder`,
bijvoorbeeld `verwijder_lid()`. Een beheerder die niet kan uitzetten, beheert niet.

`heropen_groep()` is **niet** aangepast. Een organisatiebeheerder heropent een
gearchiveerd team dus niet; dat faalt dicht. `verlaat_groep()` gaat over leden, en
een organisatiebeheerder is geen lid.

## ⚠️ Het punt om te toetsen: de organisatiebeheerder leest lidmaatschapsverzoeken

`is_group_admin()` staat in de leespolicy `group_join_requests_select`. Door de
uitbreiding leest een organisatiebeheerder de lidmaatschapsverzoeken van zijn teams,
en een gewoon organisatielid niet. Daarmee komt de organisatierol in één leespad.

Ik vind dat in overeenstemming met de besluiten:
- Besluit 34 en 36 maken hem groepsbeheerder, en verzoeken lezen en beslissen is
  beheer.
- Criterium 15 noemt "verzoeken beslissen" letterlijk.
- Besluit 6 gaat over **voortgang** ("ziet van de voortgang hetzelfde als elk lid"),
  en een verzoek is geen voortgang.
- Chat, overzicht, leden en teambalk blijven aan `mag_groep_lezen()` en dus aan het
  lidmaatschap. Dat is getoetst.

Maar het is een interpretatie. ⚠️ De catalogustoets van QS8-652
(`tests/rls/organisatierol-catalogus.test.ts`) ziet deze route niet. Grendel 1 zoekt
`is_organisatiebeheerder` letterlijk in de policytekst, en hier zit
`is_group_admin()` ertussen. De registratie van `is_teambeheerder()` zegt dat met
zoveel woorden. Wie besluit 6 strenger leest, haalt `is_group_admin()` uit
`group_join_requests_select` en geeft de organisatiebeheerder een eigen RPC voor de
verzoeken.

## Domeinregel 7: `groups.organization_id` als nieuwe kolom

Een groepslid leest de groepsrij, dus ook deze kolom.
- **Kan iemands gemiste week eruit worden afgeleid?** Nee. Hij zegt alleen bij welke
  organisatie de groep hoort.
- **Wat er wél uit volgt:** dat de groep een team is. Dat weet een lid toch al, want
  hij kwam binnen als lid van die organisatie.

## Wat getest is

`tests/rls/teamgroepen.test.ts`: 15 toetsen, via PostgREST met het JWT van elke
gebruiker. Ze dekken criterium 8, 9 en 15 (a), (b) en (c), plus aanmaken, de pin,
"nooit vindbaar" en het plafond. Zes mutaties per grendel met de hand, en elke keer
werd de bedoelde toets rood; de uitslag staat in de kop van de test. Een zevende
mutatie, de poort uit `maak_teamgroep()`, staat in `scripts/definers-controle.mjs`.

## Aannames, niet gemeten

- **Het plafond van 25** (besluit 27) is niet gemeten. Het meetissue is QS8-665.
- **Een race tussen lid worden van het team en vertrekken uit de organisatie.** De
  trigger leest de stand van het organisatielidmaatschap op het moment van de
  insert. Vertrekt iemand in dezelfde milliseconde, dan kan hij actief in het team
  blijven tot een volgende handeling. Er is geen lock op de organisatierij in
  `join_group_with_code()`.
- **`zet_groepszichtbaarheid()`** door een organisatiebeheerder plaatst
  `group_opened` of `group_protected` met hem als onderwerp
  (`p_subject_id => auth.uid()`, nagelezen in de functie). De leden zien dus de naam
  van iemand die geen lid is. Dat het slaagt, is getoetst; of die tekst in een team
  goed leest, is niet bekeken. Dat hoort bij QS8-656 (systeemberichten voor teams).
- **`src/lib/database.types.ts`** kent `organization_id` en de nieuwe RPC's nog
  niet. Hergenereren gebeurt bij de uitrol, net als bij QS8-652.

## Het pad terug

Zie de kop van de migratie. Zolang er geen teamgroepen bestaan, is alles terug te
draaien zonder gegevensverlies.
