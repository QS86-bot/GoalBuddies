# Een instap gaat voor, de vragenlijst komt later — QS8-805

Datum: 23-11-2026. Bouwt voort op QS8-793 (PR #812), zie
`docs/decisions/2026-11-23-na-klaar-stuurt-de-routewacht-naar-de-vragenlijst.md`.

## Wat er gemeten is

Op de web-export, tegen een lokale database (Postgres 16 met 343 migraties, PostgREST 12.2.12) en een
nagebootste auth (zelfgetekende tokens; de bevestigingslink als `#access_token` in een nieuwe tab). Gemeten op
`main` eb34800d en op de tak van #812 dc16d4d6, één run per pad. Het instrument reproduceerde eerst de fout van
QS8-793 op `main` (`profiel → /`).

| Pad | Na Klaar op main | Na Klaar met #812 | Vragenlijst gezien |
| --- | --- | --- | --- |
| Gewone aanmelding | `/` | `/onboarding/vragenlijst` | main nee, #812 ja |
| Uitnodiging, met e-mailbevestiging | `/` → `/groep/…` | `/onboarding/vragenlijst` → 0,1 s later `/groep/…` | nee |
| Uitnodiging, zonder bevestiging | `/` | `/onboarding/vragenlijst` → `/doelen` | main nee, #812 ja; de groep nooit |
| Werkcode, met en zonder bevestiging | `/` → `/organisatie/deelnemen?code=…` | `/onboarding/vragenlijst` → `/organisatie/deelnemen?code=…` | nee |

- **Later terugvinden kon niet.** Het enige pad naar `/onboarding/vragenlijst` was het afronden van het profiel,
  terwijl de vragenlijst zelf zegt: *"je kunt het later invullen"*.
- **De bijvangst.** Zonder e-mailbevestiging treedt het uitnodigingsscherm al toe zodra de sessie verschijnt
  (`useAutomatischToetreden`), vóór de onboarding. De code is dan gewist en het scherm navigeert niet, dus na Klaar
  stuurde niets naar de groep. In de database was de gebruiker lid.

## Besluit van Quinten (23-11-2026, variant B, via de orchestrator)

1. Na Klaar gaat wie via een uitnodiging of werkcode instapt eerst naar de groep (of naar Lid worden).
2. Daarna staat op Vandaag een kaart "Zodat de app je kent" die de vragenlijst opent, tot de gebruiker hem invult
   of op Niet nu tikt.
3. De kaart is voor **iedereen** die de vragenlijst oversloeg, niet alleen voor uitgenodigden.
4. De bijvangst gaat mee: wie zonder bevestiging al vóór de onboarding lid werd, landt na Klaar op zijn groep.
5. Geen migratie. Niet nu per gebruiker op het apparaat; de sleutel bevat de user-id.

## Aannames, beslist door de orchestrator en om te gooien door Quinten

- **A1. "Oversloeg" is: geen van de vijf antwoorden op het profiel** (`focus_areas`, `minutes_per_day`,
  `when_i_do_it`, `what_breaks_it`, `feeling`/`feeling_own`). Wie er één invulde, ziet geen kaart; de vragenlijst
  opent bij hem op de samenvatting van wat ontbreekt. Ook bestaande accounts zonder antwoorden krijgen de kaart.
- **A2. Het eindpunt van de vragenlijst blijft `/doelen?belofte=na-vragenlijst`**, ook als hij vanuit de kaart
  geopend is.
- **A3. Een eigen omschrijving van het gevoel (vraag 5b) telt als antwoord op vraag 5**, zoals de vragenlijst het al
  telde (`beginStap`). Leeg of alleen spaties is overslaan.

## Wat de bouw koos

1. **Eén beslissing voor twee lezers: `leesInstap()` in `src/schermen/onboarding/instap.ts`.** Het profielscherm
   leest haar bij Klaar (wel of geen vragenlijst), de instapwacht daarna (waarheen). Zeggen die twee iets anders,
   dan raceten de vragenlijst en de groep weer. Volgorde: een al toegetreden groep, dan een uitnodiging, dan een
   werkcode, zoals de twee wachten het al deden.
2. **Eerst lezen, dan zetten.** `afrondenMetInstap()` leest de opslag vóórdat het profiel afgerond in de provider
   staat; `zetAfgerondProfiel(profiel, { vragenlijst })` zet de vlag van QS8-793 alleen zonder instap. Zo is er bij
   een instap geen render waarin de routewacht naar de vragenlijst stuurt.
3. **`Uitnodigingswacht` en `Werkcodewacht` zijn één hook geworden, `useInstapwacht()`.** `app/_layout.tsx` laadt niet
   onder jsdom; zo is de naad te renderen. Wat meeverhuisde en terug getoetst wordt: besluit A49 (een verlopen code
   en een open groep gaan nooit vanzelf), één poging per start, en "zwijgen is bij een mislukking het ergste
   antwoord". Het component `Uitnodigingswacht` blijft in de layout staan, omdat
   `tests/beloftes/prerender-is-neutraal.test.ts` die naam leest.
4. **De bijvangst: `onthoudGroep` in `ToetredenUitvoer`.** Een geslaagde toetreding zonder afgeronde onboarding
   bewaart de groep op het apparaat (`bewaarToegetredenGroep`, sleutel en waarde met de user-id, 24 uur geldig zoals
   de uitnodiging). De instapwacht stuurt erheen en vergeet hem.
5. **De kaart leest één helper, `heeftVragenlijstAntwoord()`**, gebouwd op `beantwoordeVragen()`. Die helper vervangt
   ook de eigen telling in `useVragenlijst`, zodat de kaart en de vragenlijst nooit verschillend tellen.
6. **Niet nu staat in `useVragenlijstkaartWeg(userId)`**, naast `useHulpvraagVerborgen`. Zolang de opslag niet
   gelezen is, toont de kaart niets: hij mag laat komen, maar niet verschijnen en weer verdwijnen.

## Bekend, en geaccepteerd

- **Bij een instap staat na Klaar ongeveer 0,1 s `/` in beeld** voordat de groep of het lid-worden-scherm komt. De
  routewacht stuurt een afgerond profiel op `onboarding/profiel` naar `/`, en de instapwacht navigeert daarna. Dat is
  de stand op `main` van vóór QS8-793. De routewacht laten wachten is afgewezen: als de instapwacht dan niet
  navigeert, blijft iemand op het profielscherm hangen. Akkoord van de orchestrator, 23-11.
- **Twee navigatoren bij een instap.** Faalt de opslaglezing bij Klaar (de lezers geven dan `null`) terwijl die in de
  wacht slaagt, dan raceten vragenlijst en groep alsnog. Dat vraagt een opslagfout op het ene moment en niet op het
  volgende.
- **Niet nu reist niet mee naar een ander apparaat.** Op een nieuw toestel komt de kaart één keer terug. Over
  toestellen heen is een kolom, en dus eerst een vraag aan Quinten.
- **Meer dan 15 bestanden.** De spec-planner stelde voor de kaart als apart issue te bouwen. Dat is niet gevolgd:
  Quintens besluit zet de kaart uitdrukkelijk in dit issue, en de twee helften delen één belofte ("je kunt het later
  invullen" geldt pas als de instap de vragenlijst overslaat én er een weg terug is).

## Toetsing

- `src/schermen/onboarding/instap-naad.test.ts`: de echte `ProfielProvider`, `useRoutebestemming()`,
  `useInstapwacht()`, `afrondenMetInstap()`, de opslag en `toetredenMetSlot()` onder jsdom. Per pad (gewoon,
  uitnodiging beschermd, open, verlopen, werkcode, al lid, groep van een ander account, groep ouder dan 24 uur) de
  routewachtbestemmingen, de navigaties van de wacht en de vlag.
- `tests/render/vragenlijstkaart.test.ts`: het echte component met de echte opslag. 0 antwoorden geeft een kaart,
  1 antwoord (elk van de zes velden apart) niet; Niet nu blijft na een nieuwe start; Niet nu van account A geldt
  niet voor account B.
- Met de hand geijkt, per grendel, en telkens viel de bedoelde test om:
  - `afrondenMetInstap` zet altijd de vlag → vijf instapgevallen;
  - `onthoudGroep` nooit aangeroepen → de twee toetredingstests en "al lid";
  - `instapNa` slaat de groep over → "al lid";
  - de poging-ref weg → "één keer toetreden". Eerst bleef dat groen: de test deed een herlaad van het profiel, en
    dat zet `loading` niet terug, dus er kwam geen nieuwe effectronde. De test geeft de wacht nu een `naar` die elke
    render nieuw is;
  - A49 omzeild → open en verlopen;
  - de groep niet vergeten → "al lid";
  - de user-id-toets in de bewaarde waarde weg → `pending.test.ts`;
  - `feeling_own` telt niet → "1 antwoord (eigen gevoel)";
  - Niet nu genegeerd → "weg na Niet nu";
  - de sleutel zonder user-id, bij lezen én schrijven → "Niet nu van A geldt niet voor B";
  - de kaart ook mét antwoord → de zes 1-antwoordgevallen;
  - `focus` telt niet → "1 antwoord (focus)".

## Niet gemeten

- Native (iOS/Android) en productie. Of productie e-mailbevestiging aan heeft, bepaalt hoe vaak de bijvangst
  voorkomt; dat is hier niet te zien.
