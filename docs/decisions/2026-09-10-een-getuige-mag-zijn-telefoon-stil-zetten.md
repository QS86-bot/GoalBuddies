# Een getuige mag zijn telefoon stil zetten

**10-09-2026 — QS8-92, migratie 0237.** Vier van de vijf meldingsoorten waren
niet uit te zetten. Dit document draagt de vier keuzes die niet vanzelf spreken.

## De meting

📏 Van de vijf soorten in `MELDINGSOORTEN` had er precies één een schakelaar:
`profiles.reminder_enabled` zet `nudge` uit. Voor `approval_request`,
`approval_received`, `cycle_summary` en `commitment_witness` bestond er geen.
Wie er één niet wilde, kon alleen zijn hele pushregistratie weggooien — en
verloor daarmee ook de soorten die hij wél wilde.

## 1. Eén keelpunt, en het staat vóór de rij in `notifications_sent`

De voor de hand liggende vorm is vijf `if`-jes, één per genummerd blok in de job.
Dat is regel 18 vraag 1: vijf plekken die het eens moeten blijven, en de zesde
soort komt er langs zonder dat iemand het merkt. De poort staat daarom in
`stuur()` — het ene punt waar alle vijf doorheen gaan.

⚠️ **En hij staat vóór de insert, wat geen stijlkwestie is maar dataverlies.**
`stuur()` schrijft eerst de rij in `notifications_sent`; die rij ís de
ontdubbeling. Zou de poort erná staan, dan wordt de melding onderdrukt én is de
ontdubbeling verbruikt — en dan komt hij nooit meer, ook niet als de gebruiker
de soort weer aanzet. Nu blijft de rij weg en probeert de volgende uurronde
opnieuw.

Dat er geen stapel oude meldingen ontstaat zodra iemand een soort weer aanzet,
is geen geluk maar een eigenschap van de queries erboven: `te_beoordelen_voor()`
en `getuigenissen_voor()` geven alleen wat nog openstaat, en
`verseGoedkeuringen()` heeft een venster plus `limit 20`.

⚠️ De beslissing zelf staat níét in de job. `supabase/functions/` valt buiten
`tsconfig.json` en buiten ESLint; daar is een regel niet te toetsen. Hij staat
als pure functie in `src/modules/notifications/regels.ts` en gaat via
`edge:sync` mee naar Deno — zelfde vorm als `nudgeBesluit()`.

## 2. Kolommen op `profiles`, en met opzet geen leesrecht

Een aparte tabel `notification_preferences` zou een tweede query per profiel per
uur kosten in de duurste lus die dit project heeft (onwrikbare regel 12). De
kolommen liften mee op de bestaande `select` in `haalProfielen()`.

⚠️ **De privacy valt hier de goede kant op, en dat is niet vanzelfsprekend.**
`profiles_select` staat groepsgenoten toe via `shares_group_with_user(id)`, en
**RLS kan geen kolommen beperken.** Wat je meldingsvoorkeuren uit het zicht van
je buddy's houdt is dus niet de policy maar de kolomgrant: `authenticated` mag
van `profiles` alleen `id`, `display_name` en `avatar_url` lezen (0089). Een
nieuwe kolom is daardoor **standaard onleesbaar voor iedereen** — en de
verleiding om er "voor de zekerheid" een `grant select` bij te zetten is precies
de fout. Je dagritme is niets van de groep.

De eigenaar leest ze via de view `mijn_profiel`, die als owner draait
(`security_invoker=false`) en zo langs de kolomgrants gaat, met
`where id = auth.uid()` als enige begrenzing.

⚠️ **De migratie doet alléén `grant`, nooit een `revoke update on profiles`.**
0139 heeft het tabelbrede UPDATE-recht ingetrokken en er kolomgrants voor in de
plaats gezet. Wie hier het patroon van 0139 naïef overneemt, wist die veertien
bestaande grants en laat élke profielopslag omvallen met 42501.

## 3. `nudge` krijgt géén `notify_nudge`

De schakelaar bestaat al als `reminder_enabled`, en er hangen `reminder_time` en
`reminder_tone` aan. Een tweede kolom voor hetzelfde feit is QS8-125: het is een
kwestie van tijd tot er één bijgewerkt wordt en de andere liegt.

De asymmetrie is lelijk. Wat hem draagt is `VOORKEUR_PER_SOORT`, een
`Record<Melding, keyof Meldingsvoorkeuren>` — een zesde soort zonder rij is een
**typefout** en niet een scherm dat er stil één mist — plus een test die het
bestaan van een kolom `notify_nudge` verbiedt.

## 4. `commitment_witness` mag uit

Dit is de enige keuze hier die aan een domeinregel raakt, dus hij staat
uitgeschreven.

**Waarom het mag:**

1. **Domeinregel 5 beschermt wie de consequentie drágt, en dat is de getuige
   niet.** De regel eist dat wat een consequentie oplegt expliciet bevestigd is,
   auditeerbaar, en nooit stilzwijgend geactiveerd. De getuige draagt niets: hij
   is aangewezen om te kijken. Een instelling op zijn eigen toestel legt hem
   niets op en neemt hem niets af.
2. **Domeinregel 11 gaat over het moment, niet over het kanaal.** De straf wordt
   verschuldigd op de verstreken streefdatum, of daar nu een push van komt of
   niet. `getuigenissen()` geeft de rij onverminderd; het auditspoor blijft heel.
   De getuige ziet de inzet gewoon bij Getuigenissen — dempen haalt de
   onderbreking weg, niet de informatie. Dat staat ook zo in de copy.
3. **Er is nooit een garantie geweest dat de getuige onderbroken wórdt.** Een
   getuige kan geen apparaat hebben, toestemming geweigerd hebben, of iOS-Safari
   zonder beginschermicoon gebruiken. Een schakelaar maakt een bestaand faalpad
   expliciet; hij maakt er geen nieuw.
4. **Het alternatief is meetbaar slechter.** Een melding die je niet uit kunt
   zetten, is precies waarom mensen meldingen op OS-niveau uitzetten — en dan
   zijn de vier soorten die ze wél wilden óók weg.

📏 **En de belofte-kant is gemeten, niet aangenomen.** Grep op `getuige` in
`src/shared/i18n/nl.ts` en `en.ts`: geen enkele tekst belooft de éigenaar dat
zijn getuige een melding krijgt. `straf.tot_dan` — *"Tot dat moment ziet niemand
dit, ook je getuige niet"* — gaat over zichtbaarheid en niet over een kanaal.
Was die belofte er wél geweest, dan was dit een besluit van Quinten geweest en
niet van mij (beslisbevoegdheid grens 1).

⚠️ **Wordt zwaarder als:** een straf ooit een hándeling van de getuige binnen een
termijn vraagt — bevestigen, uitbetalen, tegenspreken. Dan is de melding geen
mededeling meer maar de start van een klok, en dan is uitzetbaarheid iets anders.

## Wat er onderweg boven kwam en niet in het plan stond

⚠️ **`updateProfiel()` liet de vier velden stil vallen.** De patch werd
gevalideerd en doorgegeven, maar de kopieerlus verderop noemt elk veld
letterlijk — en de vier nieuwe stonden er niet in. Gevolg: `update` bleef leeg,
de "niets gewijzigd"-tak nam het over, en het scherm meldde succes terwijl er
niets veranderde. Geen foutmelding, geen rode test.

📏 Gevonden door `npm run kolomrechten:controle`, die vier UPDATE-grants "die
niets gebruikt" meldde. Die controle bestaat voor iets anders — een grant zonder
schrijfpad — en ving hier een kapotte keten. Dat is regel 18 vraag 5, en het is
het beste argument voor een controle die naar rechten kijkt in plaats van naar
gedrag.

⚠️ **En het lag aan de kórte vorm.** De eerste versie schreef
`updateProfiel(userId, { [kolom]: aan })` met een berekende sleutel. Dat werkte
en het was korter, maar dan staat er nergens in `src/` of `app/` nog een
leesbare kolomnaam, en kan geen mens (en geen controle) zien welke grant waarvoor
dient. `meldingsoortVelden()` schrijft ze nu uit, exhaustief over het type.

## Wat de securityronde erop vond

Drie bevindingen, alle drie zelf nagemeten vóór ze verwerkt zijn. Geen enkele
raakte de kern: twaalf aanvalspaden op de kolommen — via de tabel, via een
filter, via `order by`, via `returning`, via elke functie die `authenticated`
mag uitvoeren — kwamen alle twaalf uit op *permission denied*. De kolomgrant is
inderdaad de enige grendel, en hij houdt.

### 1. De grendel op het keelpunt telde bestanden en geen voorkomens

📏 `tests/beloftes/elke-soort-passeert-de-poort.test.ts` bleef **groen** met een
tweede, ongepoortte `insert` ná de poort in hetzelfde bestand.

⚠️⚠️ **En de ijking in zijn eigen kop loog.** Die beweerde dat hij op precies die
mutatie rood gemaakt was. Wat er gedraaid was, zette de insert *vóór* de poort —
en die wordt door de ordeningsassertie gevangen, een ánder slot dan het slot dat
de test belooft te bewaken. Dat is de val die CLAUDE.md bij regel 18 beschrijft,
en het is op deze branch het **derde** geval van dezelfde soort. De les die
blijft staat er inmiddels drie keer: een ijking die zijn geval door een pad
voert dat een eerdere grendel al afvangt, bewaakt niets van wat hij belooft.

Herschreven naar voorkomens over de hele boom, met de eis dat élke treffer ná de
poort ligt. Drie mutaties, elk apart rood gezien.

### 2. Mijn eigen migratie trok `security_barrier` in

📏 Ná de eerste versie was `mijn_profiel` de énige view in `public` zonder die
vlag — terwijl 0089 hem ermee aanmaakte en 0143 hem netjes overnam.

⚠️⚠️ **`create or replace view` zet de opties niet voort.** Ontbreekt de
`with (…)`-clausule, dan vallen ze weg. Dit was dus geen vergeten grendel maar
het **intrekken** van een bestaande, en dat is de stillere van de twee.

Geen lek van vandaag — de aanval vraagt een functie in de WHERE, en dat kan
alleen vanaf een directe SQL-sessie; PostgREST kent geen DDL en `authenticated`
mag nergens `create`. Maar `docs/DEPLOY.md` §2.7 beschrijft precies de toekomst
waarin dat verandert. `tests/rls/viewopties.test.ts` bewaakt nu de regel: elke
view die als eigenaar draait heeft de vlag.

⚠️ Dit is de derde variant van dezelfde vorm op deze branch: **`create or
replace` neemt meer mee dan je denkt** — de kolomlijst is bevroren, de opties
vallen weg, en de grants blijven juist wél staan. Drie verschillende antwoorden
op één ogenschijnlijk eenvoudige opdracht.

### 3. Een belofte over een commitment device die niet meer klopte

`straf.persoon_uitleg` zei *"de app stuurt hem nog geen bericht"*. 📏 Onwaar
sinds 0178, die `commitment_witness` toevoegde. De richting was veilig — de app
deed méér dan ze beloofde — maar dit is copy over een commitment device, en
domeinregel 5 gaat er letterlijk over dat een gebruiker weet wie wat te horen
krijgt. Beide catalogi zeggen nu wat er gebeurt, inclusief de uitzondering die
dit issue toevoegt.

## Wat hier niet in zit

**De stille uren** — het tweede criterium van QS8-92. Dat is een eigen
wijziging: een ander datamodel, een klokgrens die over middernacht loopt, en een
interactie met het herinneringsuur die een eigen besluit vraagt. Bundelen mag
alleen bij één ondeelbare wijziging, en dit zijn er twee. Het staat als eigen
issue met dit issue als blokkeerder.
