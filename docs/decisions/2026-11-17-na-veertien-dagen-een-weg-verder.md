# Na veertien dagen in de buddywachtrij: een weg verder en geen stilte

**Datum:** 17-11-2026 · **Issue:** QS8-643 · **Migratie:** `0306` · **Status:** gebouwd en lokaal getoetst, niet uitgerold

## Waar dit vandaan komt

QS8-233 bouwde de wachtrij voor buddy's met een gelijkend doel (`0299`–`0302`).
Eén criterium bleef open: *"een tijdslimiet waarna de app iets anders voorstelt"*.
Na veertien dagen verdween de rij uit `buddyzoek_stand()`, en het scherm viel terug
op "je zoekt niet".

Bij het bouwen bleken er nog twee gaten in dezelfde keten te zitten. Beide zijn
gelezen in de code en daarna in een lokale stack bevestigd:

1. **Een rij die verloopt zonder dat de matcher draait, blijft `wachtend`.** Alleen
   `verloop_buddyzoekopdrachten()` zet hem om, en die draait alleen in de Edge
   Function `koppelen`. 📏 Die staat niet op productie (QS8-641,
   `list_edge_functions`). `zoek_buddies_aan()` gaf daardoor `already_queued`:
   "opnieuw zoeken" meldde succes en deed niets. Zo'n rij telde ook mee voor het
   plafond van drie tegelijk.
2. **De buddyzoekkaart was onzichtbaar voor wie nog geen groep heeft.** Hij stond in
   `Inhoud`, en die rendert alleen als de `AsyncView` van `app/doel/samen.tsx` niet
   leeg is. Leeg betekent daar: geen groepen en geen koppeling. Dat is precies de
   gebruiker die onbekenden zoekt.

## Besluiten

1. **`buddyzoek_stand()` geeft ook `verlopen`.** Een `wachtend`-rij met een
   verstreken `expires_at` heet daar ook `verlopen`. Voor alles behalve `wachtend`
   is `nog_nodig` 0: een telling die niets betekent, blijft een telling van
   andermans wachtopdrachten. De handtekening verandert niet. Daardoor hoeft
   `database.types.ts` niet hergenereerd te worden, en geeft de wrapper
   `buddyzoek_stand(uuid, date)` uit 0301 de nieuwe stand vanzelf door.
2. **`zoek_buddies_aan()` zet de eigen verstreken rijen van de aanroeper op
   `verlopen`**, onder het slot en vóór elke telling. Het is dezelfde overgang en
   dezelfde `decided_at` als `verloop_buddyzoekopdrachten()`: één betekenis, twee
   plekken die hem mogen zetten. Dit gebeurt ook bij een aanroep zonder
   bevestiging; dat is onschadelijk, want het is alleen de waarheid opschrijven.
3. **Opnieuw zoeken vraagt dezelfde bevestiging als de eerste keer.** QS8-643 noemt
   het een keuze. Koppelen zet de beoordeelbaarheidsgrendel om, en twee weken later
   is de lopende week een andere (domeinregel 5). Dit is de conservatieve kant; een
   lagere drempel is een eigen besluit onder grens 1.
4. **Het alternatief komt uit `ontdek_groepen()` en niet uit een nieuwe RPC.** Het
   gaat om hoogstens drie groepen in de categorie van het doel, zonder groepen waar
   je al in zit. Elke groep staat op dezelfde `OntdekGroepKaart` als op het
   ontdekscherm, die naar `src/shared/ui` is verhuisd. Daaronder staat een knop
   naar alle groepen. Zijn er geen, dan staat dat er in een zin.
   *Waarom geen nieuwe RPC:* die zou in `database.types.ts` moeten staan, en dat
   bestand wordt uit productie gegenereerd. Zolang 0306 niet uitgerold is, zou dat
   handwerk in een gegenereerd bestand zijn (QS8-569).
5. **Een automatisch gevormde groep wordt nooit voorgesteld.** Dat is geen filter in
   de client maar `groups_automatisch_niet_ontdekbaar` (0300), en
   `ontdek_groepen()` geeft alleen `ontdekbaar`. Getoetst in
   `tests/rls/buddywachtrij-verlopen.test.ts`; zonder de CHECK wordt die toets rood.
6. **De kaart staat buiten de `AsyncView`**, net als de overslaan-knop.

## Wat de reviews veranderden (17-11-2026)

`security-reviewer` en `code-critic` zijn gedraaid; elke bevinding is zelf
nagemeten vóór hij verwerkt is.

- **De stand pakte de nieuwste rij ná het statusfilter** (security-review). Zocht je
  tevergeefs, zocht je opnieuw en stopte je zelf, dan kwam de oude `verlopen`-rij
  boven: "we hebben tot … gezocht" over iets waar je net zelf mee stopte. Nu eerst
  de nieuwste rij over alle statussen, dan filteren; met een toets. Bijeffect,
  bewust aanvaard: gekoppeld → opnieuw wachtend → stoppen geeft nu "je zoekt niet"
  waar 0301 "gekoppeld" gaf. Dat pad is in de UI niet te bereiken.
- **De datum stond er als `2026-11-15T12:34:56.789+00:00`** (code-review, 📏
  gemeten). `toonDatum()` accepteert alleen `YYYY-MM-DD`; `verloopt` is een
  `timestamptz`. Nu `verloopdatumTekst()` via `toonKlokDatum()`, in de zone van de
  lezer. Dat repareert ook de wachtende stand, die dezelfde fout had sinds QS8-233.
- **De eerste versie verstuurde met één tik een aanvraag die niet in te trekken
  is** (code-review). Er is geen RPC die een aanvraag terugneemt, en het
  ontdekscherm doet het bewust in twee stappen. De kaart van dat scherm is daarom
  gedeeld in plaats van gekopieerd.
- **Teksten die meer beweerden dan waar is.** "Er waren niet genoeg mensen" stelt
  een oorzaak vast die pas klopt als `koppelen` draait; nu "nog geen buddy's voor je
  gevonden". "De groep beslist" werd "de beheerder beslist". "In deze categorie"
  verviel, want een doel zonder categorie zoekt overal.
- **Het ophalen hing aan een `Set`** en startte opnieuw zodra je eigen groepen
  binnenkwamen. Nu hangt het alleen aan het doel; het kiezen gebeurt bij het tonen.

Niet overgenomen: een timer die het scherm opnieuw rendert op het moment van
verlopen. `isVerlopen()` kijkt bij elke weergave naar de klok; dat staat nu eerlijk
in het commentaar, en de rest is een ER-rij.

## Domeinregel 7

`verlopen` is een tegenvaller van de gebruiker zelf. Hij is alleen voor de eigenaar
leesbaar (`g.owner_id = auth.uid()` in de definer-functie, getoetst: een ander krijgt
nul rijen). Er komt geen bericht, geen melding en geen groepsoppervlak bij, dus
`docs/decisions/002-domeinregel7-oppervlakken.md` krijgt geen nieuwe rij. Een
pushmelding "we vonden niemand" is uitdrukkelijk buiten dit issue gehouden.

## Wat niet gemeten is

- Productie: 0306 is niet toegepast. De migratie wacht op de batch, en op de volgorde
  QS8-233 → QS8-641 → QS8-643 (en die wacht op QS8-634).
- Het scherm is niet in een browser doorlopen. De belofte over de kaart is een
  brontoets (`tests/beloftes/buddyzoek-ook-zonder-groep.test.ts`), geen renderproef.
- Of `ontdek_groepen()` op productie ooit een groep in dezelfde categorie heeft. 📏
  Op 19-10 stonden er 0 groepen. Vandaag ziet vrijwel iedereen dus de zin "er is nu
  geen groep", en dat is precies waarom die zin er moet staan.

## Pad terug

Migratie: de twee functies woordelijk terug uit 0301 en 0302 (kop van 0306). Rijen
die `zoek_buddies_aan()` op `verlopen` zette, blijven `verlopen`; terugzetten naar
`wachtend` zou een verstreken zoekopdracht weer laten koppelen. Scherm: `<Buddyzoek>`
terug in `Inhoud`.
