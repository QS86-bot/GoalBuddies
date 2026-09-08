# Een invariant bij INSERT is geen invariant

**08-09-2026.** QS8-357. Migratie `0201`.

## Wat er stuk was

Migratie `0198` vestigt de invariant *een cyclus begint op de week-startdag van
de eigenaar*, en zegt dat met zoveel woorden. Hij doet dat met een
`before insert`-trigger op `weekly_goals`.

📏 `zet_week_startdag()` schrijft met een `update` en komt daar dus langs:

```
zet_week_startdag(p_dag => 4, p_oude_start => <maandag>, p_nieuwe_start => <dinsdag>)
  -> {"ok": true, "verzet": 1}
  -> weekly_goals.cycle_start_date op een dinsdag, profiles.week_start_day = 4
```

⚠️ **De bestaande grendel zag er niets van, en dat is het punt.** Die eist dat
vandaag in béide cycli valt — een datumbereik, geen uitspraak over de dag waaróp
een cyclus begint. **Twee grendels, twee vragen**, en de tweede stond er niet.

## Wat dit niet is

⚠️ **Geen puntenlek**, en dat is gemeten en niet aangenomen. De venstertoets
houdt de geschreven datum dicht bij vandaag, en de rollover selecteert met een
bereikvergelijking (`.lt('cycle_start_date', …)`) en niet op gelijkheid — dus het
minpunt komt gewoon. Er valt niets mee te verdienen.

📏 En de client raakt het niet: `src/modules/auth/profile.ts` geeft altijd een
echte `userCycle().startDate` mee.

## Waarom het er dan toe doet

**Een lezer van 0198 neemt aan dat elke rij in `weekly_goals` een echte
cyclusstart draagt.** Die migratie zegt dat, en het is niet waar. De volgende
grendel of query die dáárop leunt, leunt op iets wat de database niet afdwingt.

Dat is de vorm uit regel 18 — elk onderdeel klopt en het geheel niet — en het is
goedkoper om nu te repareren dan om er later een tweede grendel op te bouwen die
de eerste als gegeven neemt.

⚠️ **De algemene vorm is het opschrijven waard**, want dit is de derde keer deze
week dat hij langskomt: *een invariant die met een `before insert`-trigger
gevestigd wordt, geldt bij INSERT en niet voor de tabel.* Elke `update` die
dezelfde kolom aanraakt is een tweede deur, en die deur staat standaard open.

## Waarom een toets in de RPC en geen trigger op de UPDATE

Een `before update`-trigger zou de invariant voor de héle tabel afdwingen, en dat
klinkt sterker. Twee metingen wijzen de andere kant op:

* 📏 `cycle_start_date` staat **niet** in de UPDATE-kolomgrant van
  `authenticated` — die draagt `ceiling_text`, `floor_text`, `milestone_id` en
  `title`. Een client komt er rechtstreeks niet bij; `zet_week_startdag()` is de
  enige schrijver.
* ⚠️⚠️ **`schuif_weekdoel_door()` zou breken — en niet om de reden die hier
  eerst stond.** De eerste versie schreef dat *"de rollover en
  `schuif_weekdoel_door()` rijen raken die ouder zijn dan dat venster"*. 📏 De
  rollover niet: die draait als `service_role`, `auth.uid()` is dan NULL, en
  `weekdoel_cyclus_klopt()` doet daar zijn vroege `return new`. Nagemeten met een
  `before update`-trigger in een teruggedraaide transactie — de rolloverpositie
  komt er gewoon doorheen.

  Wat wél breekt is `schuif_weekdoel_door()`, en scherper dan het venster: het is
  de **dagtoets**. 📏 Gemeten: een eigenaar die zijn week-startdag ooit verzet
  heeft, houdt historierijen op de óude dag, en dan geeft de RPC
  `23514 'Een cyclus begint op je eigen week-startdag'` op zijn eigen
  `update weekly_goals set status = 'carried'`. Dat is geen randgeval maar de
  gewone toestand na één druk op die knop.

⚠️ Een toets in de RPC is dus geen zwakkere keuze maar de **smalle**: hij zit op
de enige plek waar het gat is, en hij houdt de vorm van 0198 aan
(`extract(dow from …)::smallint`) zodat er geen tweede opvatting van "welke dag
is dit" in SQL ontstaat — correctheidsregel 7.

⚠️ **Wat dat níet dekt, en dat hoort erbij:** `service_role` en een toekomstige
tweede schrijver komen er nog steeds langs. Dat staat als rij in
`docs/ENGINEER-REVIEW.md` met zijn eigen "wordt zwaarder als".

## De tweede toets, die er niet vanzelfsprekend bij hoorde

Acceptatiecriterium 2 vroeg ook om `p_oude_start` tegen de **oude**
`week_start_day`. Dat is een andere vraag dan de eerste: zonder die toets is de
uitkomst recht maar de **selectie** niet — `where w.cycle_start_date =
p_oude_start` pakt dan een weekdoel dat helemaal niet in de lopende cyclus
hoorde, en verhuist het naar de nieuwe.

⚠️ Hij moet vóór de `update profiles` staan. Erna is `week_start_day` al de
níeuwe dag, en dan toetst de regel zichzelf.

## Wat de security-review hierop vond

Vier dingen, alle vier zelf nagemeten. Twee ervan waren fouten van mij.

**1. Het ijkgeval liep twee dagen per week door de verkeerde grendel.** De helper
`scheefMaarBinnenVandaag()` schoof altijd één dag terug, met een tak die dat had
moeten opvangen — maar die tak vergeleek `userCycle(...).startDate` met **zichzelf**
en was dus altijd onwaar. Dode code, en precies de tak die nodig was.

📏 Met `X = start - 1` valt vandaag op `X + 7` zodra vandaag de laatste dag van
de cyclus is, en dan weigert de RPC met `cyclus_bevat_vandaag_niet` in plaats van
met de dagtoets. De twee tests waren daarmee rood op elke **woensdag**
respectievelijk **zondag**.

⚠️⚠️ **Het gevaar is niet de rode CI maar wat er daarna gebeurt.** Wie hem
"oplost" door de assertie te verzwakken naar `expect(uit.ok).toBe(false)`,
bewaakt daarna alleen dát er geweigerd wordt en niet dóór welke grendel — exact
de val die de kop van dat blok zelf beschrijft. Een test die twee dagen per week
rood is, wordt uiteindelijk zwakker gemaakt en niet gerepareerd.

De helper kiest de richting nu op basis van waar vandaag in de cyclus zit, en hij
**asserteert zijn eigen ijkgeval**: valt het buiten `[scheef, scheef+7)`, dan
wordt hij rood met de dagpositie erbij. 📏 Nagemeten over veertien
opeenvolgende dagen × zeven startdagen: alle 98 combinaties leveren een geval op
dat scheef is én vandaag bevat. Met de oude helper erin faalt precies
`dag 6, offset 7` — de laatste dag van de cyclus.

**2. De 📏-meting die de trigger-op-UPDATE afwees, klopte niet.** Zie hierboven.
De conclusie blijft staan met een andere onderbouwing, en dat verschil telt: die
zin stond met een meetteken in twee documenten, en dit project gaat ervan uit dat
een meting waar is.

**3. Twee gelijktijdige aanroepen kwamen allebei door de nieuwe toets heen.** De
tweede toets leest `profiles.week_start_day` en schrijft hem daarna, zonder
vergrendeling. 📏 Zelf gemeten met tien rondes van twee parallelle verzoeken:
**zeven keer** gaven ze allebei `ok: true`, en dan lopen `week_start_day` en
`dow(cycle_start_date)` uit elkaar — de toestand die deze migratie zegt te
sluiten. Met `for update` op de profielrij: 📏 **nul** van de tien.

⚠️ De race bestond al vóór 0201. Hij hoort hier omdat dít de migratie is die
beweert dat het gat dicht is, en **een bewering die maar voor één verzoek
tegelijk geldt, is geen grendel.**

**4. Het restrisico was smaller opgeschreven dan het is.** Zie de sectie
hieronder.

## Wat er ná deze reparatie nog steeds niet klopt

📏 Na één volledig legitieme wissel maandag → donderdag (`{ok: true, verzet: 1}`)
staan **drie van de vier** rijen van die gebruiker nog op de oude dag:

```
 title | status   | cycle_start_date | dow | week_start_day
 w1    | missed   | 2026-08-24       |   1 |              4
 w2    | approved | 2026-08-31       |   1 |              4
 w3    | todo     | 2026-09-03       |   4 |              4
 w4    | pending  | 2026-09-07       |   1 |              4
```

Alleen `todo` uit de lopende cyclus verhuist mee, en dat is met opzet: `approved`
verhuizen zou geschiedenis herschrijven (domeinregel 6).

⚠️⚠️ **De invariant is dus niet alleen niet tabelbreed afgedwongen — hij is
structureel onwaar zodra iemand zijn week-startdag ooit verzet.** Dat is een
wezenlijk andere uitspraak dan "op `service_role` na is hij waar", en het is de
uitspraak die in `docs/ENGINEER-REVIEW.md` hoort te staan. De aanname die
daadwerkelijk stukgaat is de alledaagse: een join op `cycle_start_date`, een
groepering per cyclus, of een tweede grendel die deze als gegeven neemt.

## De ijking — drie grendels, drie mutaties

📏 Elke toets apart uitgeschakeld, de suite gedraaid, teruggezet. Vóór en na: 17
groen.

| Mutatie | Uitslag |
|---|---|
| de toets op `p_nieuwe_start` uit | 📏 1 rood |
| de toets op `p_oude_start` uit | 📏 1 rood |
| `for update` op de profielrij weg | 📏 1 rood, drie runs achter elkaar |

⚠️⚠️ **Het ijkgeval moest lángs de bestaande grendel komen**, en dat is de val uit
QS8-352. `zet_week_startdag()` weigert al zodra vandaag niet in béide cycli valt;
een scheve datum ver weg wordt dus door díe toets afgevangen en bewijst niets
over de nieuwe. De ijkgevallen liggen daarom binnen het venster van vandaag en
zijn **alleen** scheef — één dag naast de cyclusstart, en niet vooruit maar
terug, want vooruit kan vandaag buiten de nieuwe cyclus duwen en dan meet de
oude toets mee.

📏 Dat het werkt is te zien aan de reproductie vóór de reparatie: allebei gaven
`{ok: true}` en niet `cyclus_bevat_vandaag_niet`.
