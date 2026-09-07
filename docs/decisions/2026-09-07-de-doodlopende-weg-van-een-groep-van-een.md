# De doodlopende weg van een groep van één — QS8-311

**Datum:** 07-09-2026
**Raakt:** besluit A7, migratie 0110, migratie 0175
**Geen migratie.** Dat is het besluit.

## De toestand

Voor een doel dat aan een groep hangt zijn er precies twee wegen naar een nieuwe
streefdatum, en voor wie alleen in die groep zit lopen ze allebei dood. 📏
Gemeten tegen de draaiende database:

```
zet_streefdatum(doel, +60 dagen)          -> needs_group_approval
vraag_deadline_verschuiving(doel, groep)  -> geen_beslisser
```

De eerste is besluit A7 (0110): deel je een doel met een groep, dan verschuif je
de datum niet alleen. De tweede is 0175: een verzoek dat niemand kan beslissen is
geen verzoek, want `beslis_deadline_verzoek()` wijst de aanvrager af met
`not_yourself`.

⚠️ **Beide kloppen op zichzelf.** De belofte — *je kunt je streefdatum
verzetten* — breekt op de naad ertussen, en die was onbewaakt. Onwrikbare regel
18, vraag 1.

⚠️ **En het is niet nieuw.** Vóór 0175 kon je het verzoek wél indienen; het bleef
daarna eeuwig open staan met een scherm dat zei dat je op je groep wachtte. De
doodlopende weg was er dus al — hij was als wachten vermomd.

## Het besluit: de grens blijft staan, de uitleg gaat erdoorheen

Van de drie richtingen uit het issue is het de derde geworden.

**Richting 1 — `zet_streefdatum()` toestaan zodra geen enkele gekoppelde groep
een ander actief lid heeft — is afgewezen.** Hij is eerlijk (er valt niemand iets
te vragen) en hij is te duur, om één reden: **hij is sneller dan ontkoppelen.**
0110 geeft je na het loskoppelen zeven dagen wachttijd, en die tak bestaat
uitsluitend om te voorkomen dat je je uit A7 kunt loswerken. Wie de datum wil
verzetten zonder akkoord, hoeft onder richting 1 alleen zijn groep leeg te maken
— en dat kan een beheerder van zijn eigen groep meteen. Dan is de wachttijd van
0110 een omweg die je alleen neemt als je hem niet doorziet.

**Richting 2 — de gebruiker naar het ontkoppelen sturen — is geen apart besluit
maar een van de uitwegen**, en die staat nu in de melding, mét zijn prijs.

**Richting 3 is het geworden: niets aan de grens, alles aan de uitleg.** Dat is
ook de conservatiefste optie die het werk áf maakt (CLAUDE.md,
Beslisbevoegdheid): hij raakt geen enkele autorisatiegrens aan.

## De prijs, met zoveel woorden

Wie alleen in zijn enige gekoppelde groep zit, kan zijn streefdatum vandaag niet
verzetten. Zijn uitwegen zijn:

| Uitweg | Prijs |
|---|---|
| iemand uitnodigen in de groep | je moet iemand hébben |
| het doel aan een groep mét buddy koppelen | idem |
| het doel loskoppelen | **zeven dagen** (0110), en de groepsgeschiedenis op dat doel |

Alle drie staan nu in de melding. Dat is het verschil met de oude tekst, die
alleen de eerste twee noemde — en de tweede is precies degene die je niet kunt
volgen als je nergens een buddy hebt.

⚠️ **Wat hier expliciet níet gebeurt: de datum stilzwijgend laten staan.** De
gebruiker leest wát er in de weg staat en welke drie dingen hij kan doen. Een
weigering zonder uitweg is de vorm die dit issue juist aanwijst.

## En de grotere vondst: acht kenmerken zonder uitleg

Bij het nalopen van criterium 2 bleek het niet één melding te zijn maar een hele
klasse. 📏 Gemeten op 07-09-2026 tegen de gedeployde functies, over de vier RPC's
die samen de streefdatum bewaken:

| Functie | kenmerken | zonder melding |
|---|---|---|
| `vraag_deadline_verschuiving` | 11 | `bad_date`, `rate_limited`, `not_signed_in` |
| `beslis_deadline_verzoek` | 7 | **`not_yourself`**, `verzoek_verlopen`, `not_signed_in` |
| `trek_deadline_verzoek_in` | 4 | `not_found`, `not_yours`, `not_signed_in` |
| `zet_streefdatum` | 6 | `datum_in_verleden`, `recent_ontkoppeld`, `not_signed_in` |

Ze lazen alle acht als *"het versturen lukte niet"* — een storingsmelding voor
een regel.

⚠️ **Twee gevallen waren erger dan de rest, want de goede zin stónd er en was
onbereikbaar.** De tabel kende `own_request` terwijl de functie `not_yourself`
geeft, en `same_date` bestaat nergens. Dus las wie zijn eigen verzoek probeerde
goed te keuren — precies de weg die dit issue beschrijft — *"Beslissen lukte
niet"*, met de zin die het uitlegde ernaast.

En `recent_ontkoppeld` is de zeven dagen van 0110: de prijs van uitweg 3 uit de
tabel hierboven las tot vandaag als een technische storing.

## De grendel, en waarom hij tegen de dátabase meet

`tests/rls/deadline-redenen.test.ts` leest `pg_proc.prosrc` van de vier functies
en legt elk kenmerk naast de meldingentabel. **Beide kanten op:** een kenmerk
zonder zin laat de gebruiker in het donker, en een zin zonder kenmerk is dode
code die suggereert dat er een geval afgedekt is — dat tweede maskeerde hier het
eerste.

⚠️ **Tegen de gedeployde functie en niet tegen de migratiebestanden**, want
`pg_get_functiondef()` is in dit project de waarheid. Een nieuwe migratie die een
kenmerk toevoegt maakt deze test rood zonder dat iemand eraan hoeft te denken, en
dát is het punt: *het kenmerk erbij* en *de zin erbij* zijn twee handelingen, en
de tweede is nu drie keer vergeten (QS8-293, QS8-309, en dit issue).

⚠️ **De tabellen zijn verhuisd naar `src/modules/goals/deadline-redenen.ts`.**
Niet uit netheid: `deadline.ts` en `api.ts` trekken via `lib/supabase` React
Native mee, en de grendel draait in Node. Zelfde reden waarom `bewijseis.test.ts`
rechtstreeks uit `schemas.ts` leest. **En bij een verhuizing hoort de vraag welke
belofte eraan hing** — dat is hier de hele bevinding, dus die staat nu in een
test in plaats van in de wetenschap van wie het toevallig weet.

⚠️ **Eén lijst per functie, en de melding wordt eruit afgeleid.** Stonden de
sleutels apart voor de test, dan zijn het twee lijsten die het oneens kunnen
worden — precies de fout die dit bestand repareert.

## Wat deze meldingen prijsgeven

Elke nieuwe zin vertelt de gebruiker iets dat hij eerder niet las, dus de vraag
hoort gesteld: **staat er nu iets in dat niet van hem is?**

* `geen_beslisser` noemt dat je het enige lid van *deze* groep bent — je eigen
  groep, waar je de ledenlijst toch al ziet.
* `not_yours` bij het intrekken onderscheidt *"dit verzoek bestaat niet"* van
  *"dit verzoek is niet van jou"*. Dat is in theorie een orakel: wie een
  verzoek-id heeft, kan er het bestaan van vaststellen. In de praktijk is dat id
  een `gen_random_uuid()` die je alleen kunt hebben als je hem gekregen hebt, en
  het antwoord zegt niets over de inhoud, de eigenaar of het doel.
* `verzoek_verlopen` en `recent_ontkoppeld` gaan over je eigen doel.

Geen van vieren raakt domeinregel 7: er staat geen gemiste week, geen reeks en
geen tegenslag van iemand anders in. **Er is bewust geen security-review op deze
branch gedraaid** — er verandert geen policy, geen functie en geen grant; de
autorisatiegrens waar dit issue over gaat blijft letterlijk zoals hij was, en dat
is het besluit.

## Ijking

Mutatie per grendel, met de hand gedraaid op 07-09-2026:

| | Mutatie | Uitslag |
|---|---|---|
| A | `not_yourself` uit de tabel | 1 rood: *elke reden heeft een uitleg* |
| B | `own_request` er weer bij | 1 rood: *geen zin zonder reden* |
| C | `rate_limited` uit de tabel | 1 rood: *elke reden heeft een uitleg* |
| D | de afleiding niets laten vinden | 6 rood, waaronder alle *vindt ze daadwerkelijk* |
| E | richting 1 in `zet_streefdatum()` bouwen | 1 rood: *beide wegen lopen dood* |

⚠️ **D leek eerst groen, en dat was een mislukte mutatie en geen uitslag.** De
`sed` had het bestand niet geraakt. Met de bewerking geverifieerd — grep op de
gewijzigde regel — werd hij rood. Dat is de reden dat een ijking pas telt als je
gezien hebt dat de mutatie er stáát: *"blijft een mutatie groen, dan is dat geen
uitslag maar een vraag."*

⚠️ **E is de mutatie die het besluit bewaakt**, en niet een implementatiedetail.
Bouwt iemand richting 1 alsnog, dan wordt `beslisbaar-verzoek.test.ts` rood — en
dat hóórt, want het is een besluit en geen gevolg. Wie hem terugdraait, leest
eerst dit document.
