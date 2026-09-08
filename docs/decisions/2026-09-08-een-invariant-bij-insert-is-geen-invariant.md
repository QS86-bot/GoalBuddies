# Een invariant bij INSERT is geen invariant

**08-09-2026.** QS8-357. Migratie `0200`.

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
* De trigger van 0198 toetst óók een **venster** rond vandaag. Bij een update is
  dat verkeerd: de rollover en `schuif_weekdoel_door()` raken rijen die ouder
  zijn dan dat venster, en een trigger die op elke update vuurt zou die weigeren.
  Dan is de reparatie duurder dan het gat.

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

## De ijking — twee grendels, twee mutaties

📏 Elke toets apart uitgeschakeld, de suite gedraaid, teruggezet. Vóór en na: 16
groen.

| Mutatie | Uitslag |
|---|---|
| de toets op `p_nieuwe_start` uit | 📏 1 rood |
| de toets op `p_oude_start` uit | 📏 1 rood |

⚠️⚠️ **Het ijkgeval moest lángs de bestaande grendel komen**, en dat is de val uit
QS8-352. `zet_week_startdag()` weigert al zodra vandaag niet in béide cycli valt;
een scheve datum ver weg wordt dus door díe toets afgevangen en bewijst niets
over de nieuwe. De ijkgevallen liggen daarom binnen het venster van vandaag en
zijn **alleen** scheef — één dag naast de cyclusstart, en niet vooruit maar
terug, want vooruit kan vandaag buiten de nieuwe cyclus duwen en dan meet de
oude toets mee.

📏 Dat het werkt is te zien aan de reproductie vóór de reparatie: allebei gaven
`{ok: true}` en niet `cyclus_bevat_vandaag_niet`.
