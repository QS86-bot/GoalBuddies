# De rij en niet de kolom

**Datum:** 09-09-2026 · **Issues:** QS8-392 en QS8-393 · **Migratie:** 0236

## 1. Twee lekken, één oorzaak

De volledige beveiligingsdoorlichting van 09-09-2026 vond twee lekken op `goals`.
Twee reviewers vonden de tweede onafhankelijk van elkaar; alle drie de metingen
zijn daarna zelf nagedaan (onwrikbare regel 19).

**QS8-392 — de interviewantwoorden van de Doelcoach.** `spiegelNaarDoel()`
schrijft twee antwoorden naar `goals`. 📏 Gemeten, beschermde groep, doel
gekoppeld:

```
BRAM via goals:          Ik ben iemand die niet meer drinkt na mijn scheiding | uren=4.0
BRAM via goal_dashboard: Ik ben iemand die niet meer drinkt na mijn scheiding
EVE (buiten de groep):   rijen=0
```

Boven dat invoerveld staat `coach.alleen_voor_jou`: *"Je antwoorden zijn alleen
voor jou en de Doelcoach. Je groep ziet ze nooit."*

**QS8-393 — `max_points` rekent over verborgen rijen.** 📏 Gemeten:

```
WERKELIJKHEID: max_points=8 | weken totaal=4   (2× missed, 1× carried, 1× todo)
CAROL ziet:    max_points=8 | zichtbare weken=1 | som zichtbaar=2
               =>  VERBORGEN WEKEN = 3
```

Een adempauze geeft géén gat, dus het signaal wijst uitsluitend op tegenslag.

## 2. ⚠️⚠️ De oorzaak is dat de rij nooit is opgeschreven

`goals_select` stond **niet** in het register van `002-domeinregel7-oppervlakken.md`.
Dat register telde 64 oppervlakken en dit was er geen van; `identity_statement`
en `max_points` kwamen er allebei geen enkele keer in voor. De twee vragen die
domeinregel 7 verplicht stelt — *kan hieruit een gemiste week worden afgeleid* en
*kan iemand dat buiten de UI om uitlezen* — zijn hier dus nooit gesteld.

📏 Het precedent staat in de eigen code, in de typedefinitie van `Doel`, drie
regels bóven `identity_statement`:

> Geen `risk_status` meer. Die stond tot migratie 0050 als kolom op `goals`, en
> `goals_select` gaf elke groepsgenoot de héle rij.

**Die les is in augustus op één kolom toegepast en niet op de tabel.** Vandaar de
titel van dit document, en vandaar dat de nieuwe rij 34 over de **rij** gaat en
niet over twee kolommen.

⚠️ **De vraag die dit gevonden zou hebben, en die vanaf nu bij elk nieuw
oppervlak hoort:** staat er op een groepsleesbare rij een getal dat over
verborgen rijen rekent?

## 3. Waarom een kolomgrant, en waarom in die volgorde

RLS kan geen kolommen beperken. De rij móet zichtbaar blijven — dat ís de
koppelfeature — dus de eis is een kolomeis en geen rijeis.

⚠️⚠️ **Een `revoke select (kolom)` werkt hier niet.** 📏 Gemeten vóór de
migratie: `relacl` van `goals` is `authenticated=rx`, een **tabelbrede** SELECT.
Postgres weigert dan stilzwijgend een kolomgewijze intrekking. De enige vorm die
werkt is het tabelrecht intrekken en per kolom teruggeven. Wie dat omdraait,
schrijft een migratie die groen draait en niets doet.

Vijf kolommen komen niet terug. Drie zijn de bevinding; twee liften mee omdat ze
dezelfde klasse zijn en geen enkele lezer hebben: `beoordelaar_weggehaald_op`
(*"je beoordelaar is weggehaald"* — tegenslag over een ánder) en
`losgekoppeld_op`.

De eigenaar leest zijn drie kolommen uit `mijn_doelvelden`, een definer-view met
een eigen `where` — de vorm van `mijn_profiel`, die hier al jaren staat en die de
doorlichting van vandaag heeft nagemeten.

## 4. ⚠️⚠️ De valstrik, en waarom hij een eigen test heeft

De voor de hand liggende reparatie is `goal_dashboard` op
`security_invoker = false` zetten en de drie kolommen maskeren, zoals
`group_visible_streaks` doet met `best_streak`.

**Dat maakt het lek erger.** `weekly_total` in die view telt de weekdoelen van
het doel, en klopt per kijker (📏 eigenaar 2, groepsgenoot 1) juist omdát de
subquery als de aanroeper draait en de RLS op `weekly_goals` meetelt. Op definer
telt hij álle weekdoelen mee — de verborgen inbegrepen — en dan is er een tweede
exemplaar van precies dit lek, in een kolom waar niemand naar kijkt.

De view blijft dus invoker en verliest de kolommen; de eigenaar krijgt ze uit een
aparte view. Mutatie D in `tests/rls/doelkolommen.test.ts` zet hem op definer en
maakt dat geval rood.

⚠️ **Dat geval was eerst niet rood te krijgen, en dat lag aan de test.** In de
eerste versie stonden beide weekdoelen op `todo`: dan telt de groepsgenoot er
evenveel als de eigenaar en is de assertie triviaal waar. `status` is niet
client-schrijfbaar (0195), dus de verborgen week gaat via `adminDb()`. Vraag 3
van onwrikbare regel 18, en het antwoord kwam pas bij het draaien van de mutatie.

## 5. Wat de reparatie in de applaag opleverde

**Twee `.select('*')` op `goals` werden een permissiefout voor de eigenaar zelf.**
Met een kolomgrant eist `*` recht op élke kolom. ⚠️ TypeScript zag dat niet: de
gegenereerde typing spiegelt de kólommen van de tabel en niet de grants — precies
de bevinding die vanochtend in het reviewdossier belandde.

Beide zijn expliciete kolomlijsten geworden, en het retourtype is `DoelKern` in
plaats van `Doel`. Zelfde reparatie en zelfde reden als `Lijstgroep` in
`modules/buddies` (QS8-387, vandaag geland): laat het type de grant dragen, dan
valt het uiteenlopen van beide kanten op — TypeScript klaagt als je een kolom uit
de `select` haalt, Postgres als je er een bij zet waar geen grant op zit.

**En `koppelbare_doelen()` hing aan het rijtype van de view.** 📏 Mijn
afhankelijkheidscheck keek via `pg_rewrite` — dat vindt views die op views
leunen — en concludeerde dat er niets aan hing. Postgres wist het beter:

```
ERROR: cannot drop view goal_dashboard because other objects depend on it
DETAIL: function koppelbare_doelen(uuid) depends on type goal_dashboard
```

De functie gaat er nu eerst uit en komt onderaan ongewijzigd terug. ⚠️ Met
`cascade` was hij zonder een woord verdwenen; de database ving hier een gat in
mijn analyse, en alleen omdat de migratie in één transactie draait.

## 6. Het beloftesregister was te smal

`beloftes.test.ts` moet elke zin vinden die onzichtbaarheid belooft. 📏 De
doorlichting mat dat de **gangbaarste** Nederlandse formulering er niet in zat:
*"alleen jij"*, *"alleen voor jou"*, *"ziet ze nooit"*. Zes sleutels met een
privacybelofte stonden daardoor buiten het register, waaronder de zin die dit
issue aantoonbaar onwaar maakte.

De patronen zijn erbij gezet en de zes zijn geregistreerd met hun reden — elk
nagemeten tegen de policy eronder, behalve `melden.niet_zichtbaar`, en dat staat
er met zoveel woorden bij.

⚠️ **Twee patronen zijn bewust smaller dan de eerste versie**, en dat is geen
detail: `only you` matchte ook *"only your group members"*, en `alleen jij`
matchte *"Alleen jij kúnt je goedkeuring intrekken"* — een bevoegdheid en geen
zichtbaarheid. Een zeef die dat door elkaar haalt, meldt zinnen waar niemand iets
aan hoeft te doen, en dat is precies hoe je leert hem te negeren. Beide kanten
zijn met de hand geijkt: een nieuwe zin met *"alleen jij ziet"* wordt gevonden,
een met *"alleen jij kunt"* niet.

## 7. Wat hier niet in zit

* **De andere 26 tabellen met een geërfde `anon`-SELECT.** `goals` is er hier één
  van en is meegenomen; de rest staat als rij in `docs/ENGINEER-REVIEW.md`, met
  de meting dat één `create policy` zonder `TO`-clausule ze opent zonder dat één
  bewaking rood wordt.
* **De vier kolommen van de korte vragenlijst** (`focus_areas`, `minutes_per_day`,
  `when_i_do_it`, `what_breaks_it`). Die staan op `profiles`, en `profiles` heeft
  al een smalle kolomgrant — 📏 de doorlichting noemde die tabel voorbeeldig.
* **Een controle op geërfde SELECT-grants.** Die hoort er te komen en is geen
  onderdeel van deze reparatie; zie het reviewdossier.
