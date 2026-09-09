# De doelroute eindigt bij de vraag wie meedoet

**Datum:** 09-09-2026 · **Issue:** QS8-229 · **Epic:** QS8-200

## Wat er veranderd is

Er is één scherm bij, `/doel/samen`, en het is het einde van **elke** manier om
een doel te maken. Het vraagt wie dit met je meemaakt en geeft drie uitwegen: een
bestaande groep koppelen, een nieuwe groep maken, of overslaan.

## 1. Waarom beide aanmaakroutes hier eindigen

Niet uit netheid. Op 09-09-2026 — dezelfde dag — is `schermingang:controle`
gebouwd omdat `/doel/plan` twee weken af en onbereikbaar in de codebase lag:
beide knoppen wezen nog naar het oude formulier (QS8-383). Dezelfde vorm dreigde
hier meteen weer. Stuurt alleen `plan.tsx` naar `/doel/samen`, dan krijgt
iedereen die via `/doel/nieuw` binnenkomt de vraag nooit — en `/doel/nieuw` is
niet een uithoek maar de terugval bij AI-uitval én de knop "liever zelf invullen"
op het doelenscherm.

`naEenNieuwDoel()` in `src/modules/goals/doelroute.ts` draagt die bestemming, en
`plan.tsx` schreef vóór dit issue al op waaróm dat één plek hoort te zijn: *twee
kopieën van dezelfde URL zijn twee plekken waar de parameters uit de pas kunnen
lopen.*

⚠️ **De helper alleen is niet de grendel.** Een scherm dat hem negeert en zelf
een pad typt, is even stil kapot als daarvoor. Daarom leidt
`tests/beloftes/wie-een-doel-maakt-krijgt-de-vraag.test.ts` zijn lijst af uit
**wie een doel aanmaakt** — `maakDoel(` of `pasPlanToe(` — en niet uit twee
bestandsnamen. Komt er ooit een derde aanmaakroute bij, dan staat die vanzelf in
de lijst en is de test rood tot hij de vraag ook stelt.

## 2. Waarom er geen zoekfunctie komt

Het issue verbiedt hem, en de reden is niet privacy-in-het-algemeen maar iets
concreets: een doorzoekbare gebruikersindex is een oppervlak dat met **één
API-verzoek buiten de UI om** uit te lezen is, en dat is precies de tweede vraag
die domeinregel 7 bij elk nieuw oppervlak stelt. Dan kan iemand opzoeken wie er
op deze app zit.

`profiles` geeft na migratie 0089 alleen `id`, `display_name` en `avatar_url`
vrij, en er is vandaag geen enkele query die op `display_name` zoekt. Dat is een
stand van zaken en geen omissie.

De uitnodigingslink is de vervanging en lost hetzelfde op zonder dat oppervlak:
hij deelt niets tot de eigenaar hem verstuurt, hij is in te trekken
(`invite_revoked`, migratie 0019), en `invite_preview()` is bewust geen orakel
over welke codes bestaan. Wil je dat mensen elkaar kunnen **vinden**, dan hoort
dat bij het ontdekken van groepen met onbekenden (QS8-230), mét de maatregelen
die daar al beschreven staan. Twee halve zoekfuncties naast elkaar is precies de
scheefgroei die dit project al eerder gekost heeft.

## 3. Waarom `002-domeinregel7-oppervlakken.md` géén nieuwe rij krijgt

Dit is met opzet, en het staat hier opgeschreven omdat een volgende reviewer de
afwezigheid anders als een omissie leest.

Koppelen is geen nieuw groepszichtbaar oppervlak — het staat al in 002. Dit issue
voegt er een **tweede knop** naartoe, geen nieuwe zichtbaarheid. Wat de groep te
zien krijgt na koppelen is exact wat hij daarvoor al zag, bepaald door dezelfde
policies. RLS is ongewijzigd, er is geen migratie, en `goal_group_links_insert`
(lid van de groep én eigenaar van het doel) is en blijft de grens.

⚠️ Wat er wél bij komt is een tweede en derde **plek waar toestemming gegeven
wordt**, en daar zit het risico van besluit A41: niet dat iemand hem afschaft,
maar dat een nieuwe koppelknop de zin over wat je deelt niet meedraagt en de
belofte stiller wordt. `deling.ts` waarschuwt daar met zoveel woorden voor.
Daarom is `tests/beloftes/elke-koppelknop-zegt-wat-hij-deelt.test.ts` er: hij
leidt zijn lijst af uit **wie `koppelDoelAanGroep()` aanroept** en eist per
bestand een vertakking op `zichtbaarheid` tussen de open- en de beschermde zin.
Vier schermen vallen er vandaag onder.

Dat is de reparatie van een bestaand gat: `doel-in-meerdere-groepen.test.ts`
grijpt naar `app/doel/[id].tsx` — één bestandsnaam — en een derde koppelscherm
was voor die test onzichtbaar. Regel 18, vraag 4.

## 4. De vondst onderweg: `fetchMijnGroepen()` belooft een kolom die het niet levert

📏 `src/modules/buddies/api.ts:186` selecteert negen kolommen — `invite_code`
hoort er niet bij — en cast het resultaat met `as unknown as Groep[]` naar de
volledige rij. Het veld staat dus **wel in het type en niet in de gegevens**.

Dat is geen schoonheidsfoutje. Bouw je de deelbare link uit een groep uit die
lijst, dan is `groep.invite_code` `undefined`, zwijgt TypeScript, en doet
`normaliseerCode(undefined)` een `.trim()` op undefined: een wit scherm, op
precies de handeling die dit issue belooft te leveren.

Twee dingen daartegen:

- Dit scherm haalt de code op met `fetchGroep()` (die selecteert `*`), voor de
  éne groep die je zojuist gekoppeld hebt. Niet per rij in de kieslijst — dat zou
  een N+1 zijn op een scherm waar de meeste gebruikers precies één keer komen.
- `deelbareUitnodiging()` geeft `null` bij een ontbrekende, lege of ingetrokken
  code, en nooit een lege string — anders is "geen link" niet te onderscheiden
  van "link". Het scherm toont dan een zin in plaats van een knop. **Een link die
  gegarandeerd niet werkt is erger dan geen link: die stuurt de gebruiker naar
  iemand tóé.**

De oorzaak blijft staan en is een eigen issue waard: de cast maakt van een
kolomkeuze een aanname waar niets rood van wordt.

## 5. Waarom een half plan níét naar deze stap gaat

Landde er maar een deel van het plan, dan gaat de gebruiker naar het doel zelf.
Hij moet dan eerst kunnen zien *wát* er ontbreekt; om een buddy vragen bovenop
een half plan is het verkeerde op het verkeerde moment. Die keuze bestond al in
`plan.tsx` en staat nu als parameter in `naEenNieuwDoel()` in plaats van als
ternary in een scherm. Die gebruiker verliest de kans niet: `GedeeldMet` op
`/doel/<id>` biedt dezelfde koppeling.

## 6. Overslaan staat buiten de `AsyncView`

Klein detail, dragende reden. "Overslaan moet er écht zijn" is een belofte uit
het issue, en de stand waarin die knop het makkelijkst verdwijnt is juist de
foutstand: je groepen laden niet, de `AsyncView` toont zijn foutblok, en de
gebruiker zit vast op een scherm dat hij niet eens nodig had. Hij staat daarom
naast de `AsyncView` en niet erin — net als de uitgang op `/doel/[id]`.

## Wat hier bewust niet in zit

- Uitnodigen per e-mail of push vanuit de app. Dat is een eerste uitgaande stroom
  naar echte mensen, en dat is grens 1 van de beslisbevoegdheid.
- Contacten van het apparaat lezen.
- Een systeembericht in de groepschat bij het koppelen vanaf dit scherm. Dat zou
  een nieuw type op de allowlist zijn en dus een migratie, en het staat niet in
  de acceptatiecriteria.
