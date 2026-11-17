# Organisaties en lidmaatschappen: de keuzes van de eerste migratie

**Datum:** 17-11-2026 · **Issue:** QS8-652 (epic QS8-650) · **Migratie:** `0299`
**Raakt:** domeinregel 7, onwrikbare regel 1, 5 en 10, `docs/decisions/002-domeinregel7-oppervlakken.md` rij 42
**Status:** gebouwd op `quintenstrijdonk/qs8-652-organisaties-en-lidmaatschappen`, niet gemerged en niet op productie.

De besluiten zelf staan in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`
(vooral 4, 6, 13, 15 en 19) en het datamodel op papier in
`docs/decisions/2026-11-03-spec-organisaties-en-teamdoelen.md`, tabel 1 en 2.
Dit document legt vast wat die twee open lieten en wat ik daarom zelf gekozen
heb, onder *Beslisbevoegdheid*: de conservatiefste optie die het werk af maakt.
Geen van de keuzes hieronder valt onder grens 1 of 2.

## Wat er staat

- `organizations`: naam (1–80 codepunten, dezelfde zeven CHECKs als
  `groups.name`), aanmaker, status `active`/`archived`, uitnodigcode,
  ingetrokken-vlag.
- `organization_members`: (organisatie, gebruiker), rol `admin`/`member`, status
  `active`/`inactive`, toetredingsdatum.
- Helpers `is_organisatielid()` (met grant) en `is_organisatiebeheerder()`
  (**zonder** grant voor `authenticated`).
- RPC's `maak_organisatie()`, `word_organisatielid()`, `verlaat_organisatie()`,
  `zet_organisatielid_uit()`, `organisatieleden()`,
  `organisatie_uitnodigcode()` en `vernieuw_organisatiecode()`.

## De keuzes

| # | Keuze | Waarom de conservatiefste | Herbevestigen vóór |
|---|---|---|---|
| 1 | Statuswaarden in het Engels (`active`, `admin`, …), zoals `groups` en `group_members` | Eén woordenschat voor twee soorten lidmaatschap; QS8-653 legt ze naast elkaar | — |
| 2 | Er staan wél vier policies per tabel, maar INSERT/UPDATE/DELETE zijn `false` en er is geen schrijfgrant | Het issue zei "geen policy"; onwrikbare regel 1 eist er vier. `false` voldoet aan beide | — |
| 3 | `organization_members` laat via de tabel **alleen je eigen actieve rij** zien | Een tabelbrede leesregel is een ongepagineerde ledenlijst via PostgREST (regel 10), en geeft meer dan rij 42 belooft | QS8-657 (schermen) |
| 4 | De ledenlijst geeft **naam en rol**, geen avatar en geen toetredingsdatum, en bladert op `user_id` | Rij 42 belooft "naam en rol"; wat erbij komt is een verruiming. Een cursor op `user_id` verschuift niet als iemand vertrekt (de les van 0152) | QS8-657 |
| 5 | Vertrokken en uitgezet zijn allebei `inactive`; terugkomen met de code geeft `removed` | Zelfde vorm als groepen (rij 39). Wie terug wil, heeft een vervolgissue nodig — net als bij groepen | Het eerste verzoek om terug te keren |
| 6 | Een inactief lidmaatschap is voor **niemand** leesbaar, ook niet voor de persoon zelf | Rij 42: "vertrek en uitzetting laten geen leesbaar onderscheid achter" | — |
| 7 | Een gearchiveerde organisatie is via de tabel onleesbaar en de code geeft `invalid` | Beschermd is het antwoord voor elk nieuw oppervlak. Er is nog geen archiveer-RPC | Het issue dat archiveren bouwt |
| 8 | Beheerder word je alleen als aanmaker; er is geen RPC om iemand beheerder te maken | Besluit 13 noemt het niet; een tweede beheerder is een eigen ontwerp | Vervolgissue |
| 9 | Een beheerder zet geen andere beheerder uit en ook niet zichzelf | Zonder deze grens kan één beheerder de ander buitensluiten | Samen met 8 |
| 10 | De laatste actieve beheerder kan niet vertrekken | Anders blijft er een organisatie zonder beheerder achter. Archiveren wordt de uitweg | Het issue dat archiveren bouwt |
| 11 | Elke weigering van een beheerders-RPC heeft één reden: `niet_toegestaan` | Criterium 4: geen orakel tussen "bestaat niet", "niet jouw organisatie" en "niet toegestaan" | — |
| 12 | Plafonds: 3 nieuwe organisaties per persoon per etmaal, 20 pogingen om lid te worden, 10 nieuwe codes per organisatie, 10 actieve organisaties per persoon | Niet gemeten; dezelfde orde als groepen (10 per dag, 20 codepogingen, 10 groepen). Zie hieronder | De eerste meting met echte gebruikers |
| 13 | "Uitnodigen" uit criterium 12 is `vernieuw_organisatiecode()` | Zonder die functie had `invite_revoked` geen schrijver, en een uitgelekte code geen uitweg. Er wordt geen uitnodiging verstuurd (geen e-mail, geen push) | — |
| 14 | `dagtellers_soort_check` krijgt `organisatie` erbij | De codeteller telt per organisatie; boeken als `groep` geeft een sleutel een naam die hij niet is. Verruimt een allowlist met één waarde en raakt geen bestaande rij | — |
| 15 | `created_by` is `on delete set null`; een lid gaat met `on delete cascade` mee | Een `restrict` blokkeert het wisrecht. Wat er met een organisatie zónder beheerder gebeurt, is QS8-659 | QS8-659 |

### Waarom elke poging telt, en niet elke rij

⚠️ Het patroon van 0203 (een statement-trigger die rijen telt) telt alleen
wat landt. Tegen het raden van een code doet dat niets: een foute poging levert
geen rij op. `word_organisatielid()` telt daarom de **handeling** in `dagtellers`
(0234), vóór de codetoets, en dat overleeft bovendien een `delete`. De stand
wordt eerst gelezen en pas daarna opgehoogd: een `raise` in `tel_dagteller()`
zou de telling zelf terugrollen.

### Waarom de helper geen grant heeft

Een policy draait als de aanroeper. `is_organisatiebeheerder()` zonder execute
voor `authenticated` betekent dat een SELECT-policy die hem ooit aanroept niet
stil verruimt maar omvalt met 42501. Dat is de eerste van drie grendels onder
besluit 6; de tweede en derde zijn de catalogustest in
`tests/rls/organisatierol-catalogus.test.ts` (geen policy en geen
ongeregistreerde functie die naar de rol of de helper verwijst) en het
gedragsdeel in `tests/rls/organisaties.test.ts` (beheerder en lid krijgen
dezelfde rijen).

## Gemeten (lokale stack, Postgres 16 + PostgREST 12.2.12, 17-11-2026)

- 302 migraties afgespeeld op een lege database; 0299 twee keer achter elkaar
  afgespeeld zonder fout.
- `tests/rls/organisaties.test.ts`: 11 tests groen. Zeven mutaties, elk apart
  teruggezet, en elke keer viel de bedoelde toets om:
  - `organizations_select` op `using (true)` → beide criterium-4-toetsen;
  - `grant select (invite_code, invite_revoked)` → de codetoets;
  - de statustoets uit `is_organisatielid()` → de vertrektoets;
  - het lidplafond van 20 naar 21, en de telling ná de codetoets in plaats van
    ervoor → in beide gevallen de toets "elke poging telt";
  - het aanmaakplafond en het codeplafond weg → elk hun eigen toets.
- `tests/rls/organisatierol-catalogus.test.ts`: 7 tests groen, waarvan vijf
  ijkingen die in een teruggedraaide transactie elk één grendel breken.

## Niet gemeten

- **Productie.** Er is geen migratie op het echte project gedraaid.
  `src/lib/database.types.ts` is een afschrift van productie en kent 0299 dus
  nog niet; de tests gebruiken daarom `as never` op de namen. Hergenereren hoort
  bij de uitrol.
- **De plafonds** (keuze 12) zijn niet gemeten tegen echt gebruik.

## Voor de engineer in november

Het lekrisico zit in twee eigenschappen: wie niets mag, krijgt hetzelfde
antwoord als bij een verzonnen id, en de beheerdersrol kan structureel niet in
een leespad belanden. Een nieuwe ingang naar ledendata is daardoor per definitie
een nieuwe RPC, en die valt in het register van de catalogustest.
