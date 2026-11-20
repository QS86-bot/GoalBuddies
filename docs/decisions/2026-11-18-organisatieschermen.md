# Organisatieschermen

**Datum:** 18-11-2026 · **Issue:** QS8-657 (epic QS8-650) · **Migratie:** `0324` (gebouwd als `0305`, hernummerd op 20-11-2026; zie onderaan)
**Raakt:** besluit 6, 13 en 36 in `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`; rij 42 en 50 in `docs/decisions/002-domeinregel7-oppervlakken.md`
**Status:** gebouwd op `quintenstrijdonk/qs8-657-organisatieschermen-module`, bovenop QS8-656 (en daarmee 652 tot en met 655). Niet gemerged en niet op productie.

## Drie besluiten van Quinten (18-11-2026)

Gegeven als antwoord op een meerkeuzevraag in de bouwsessie. Alle drie de keren is het advies gekozen. Ze staan ook als reactie op QS8-657.

1. **Elk lid ziet de teamnamen.** Er komt een nieuwe RPC, `organisatieteams()`,
   die elk actief lid van de organisatie dezelfde lijst geeft: alleen id en
   naam. ⚠️ **Dit is een verruiming:** het bestaan en de naam van een team
   worden zichtbaar voor collega's die er niet in zitten. Vóór 0324 zagen
   alleen teamleden een teamnaam. De aanleiding: een organisatiebeheerder is
   geen lid van de teams die hij aanmaakt (besluit 36) en zag ze daardoor niet.
   Besluit 6 blijft gelden: de rol komt in de RPC niet voor.
2. **De waarschuwing bij accountverwijdering geldt voor elke beheerder.** De
   app kan niet tellen hoeveel beheerders er zijn, want de tabel geeft alleen
   je eigen rij. Daarom krijgt elke beheerder de waarschuwing, gebaseerd op
   zijn eigen rol.
3. **Alles in één issue:** aanmaken, bekijken, lid worden met een code, en de
   waarschuwing. Dit raakt meer dan 15 bestanden. Dat is een afweging volgens
   *Beslisbevoegdheid* en wordt hieronder verantwoord.

## Wat er staat

- **`organisatieteams()`** (0324): id en naam, gepagineerd op id. Een niet-lid
  en een verzonnen id krijgen nul rijen. Een gearchiveerd team, of een team van
  een gearchiveerde organisatie, staat er niet in.
- **De module `src/modules/organisaties`**:
  - `api.ts` en `schemas.ts`;
  - `database.ts`, een tijdelijke typebrug;
  - `index.ts`, de publieke rand.
- **De routes:**
  - `/organisatie/nieuw`;
  - `/organisatie/deelnemen`;
  - `/organisatie/[id]` met leden, teams, code en verlaten.
- **De ingang:** een kaart *Organisaties* op het profiel.
- **De waarschuwing** in *Account verwijderen*.

## De keuzes

| # | Keuze | Waarom |
|---|---|---|
| 1 | **Een typebrug in de module en geen correctie in `database.types.correcties.ts`** | De RPC's en tabellen staan nog niet in het afschrift van productie. De correctielaag is voor wat de generator *niet kan weten*, niet voor wat op een uitrol wacht. Er is één cast op één plek, en `tests/beloftes/organisatie-typebrug.test.ts` wordt rood zodra de hergeneratie `maak_organisatie` meebrengt; dan moet de brug weg. Overal staat letterlijk `db().rpc('naam', …)`, zodat `rpc:controle` en `keten:controle` de aanroepen zien |
| 2 | **Teamnamen als platte tekst, zonder link** | Wie geen teamlid is, kan `/groep/<id>` niet lezen, dus een link is voor de meeste lezers een dood eind. Een zin boven de lijst legt dat uit |
| 3 | **Niet gevonden en geen lid geven één lege staat** | Er komt geen orakel. Het scherm zoekt de organisatie in je eigen lijst |
| 4 | **De uitzetknop alleen voor een beheerder, alleen op leden met de rol `member`, en niet op je eigen rij** | De server weigert een andere beheerder toch (keuze 9 van 0316). Een knop die altijd faalt is erger dan geen knop |
| 5 | **De waarschuwingstekst is feitelijk en belooft geen weg die er niet is** | De eerste versie zei *"draag het beheer eerst over"*. Op deze tak bestaat geen manier om over te dragen; dat is QS8-695. De tekst zegt nu wat er gebeurt: *"dan kan na het verwijderen niemand daar nog nieuwe leden uitnodigen"*. Zodra QS8-695 landt, kan de tekst naar de knop verwijzen |
| 6 | **De ledenlijst bladert op een cursor (20 per pagina), via een gedeelde `useBladerlijst`** | Regel 10, en geen verschuiving als iemand tussendoor vertrekt (de les van 0152) |
| 7 | **Meer dan 15 bestanden** | Besluit 3 van Quinten. Lid worden met een code hoort erbij: zonder die route is een code die je kunt delen een dood eind |

## Gemeten (lokale stack, 18-11-2026)

- `0324` is twee keer achter elkaar afgespeeld zonder fout.
- `tests/rls/organisatieteams.test.ts`: 6 tests. Vijf mutaties, elk met de
  bedoelde toets rood:
  - de lidpoort weg;
  - een extra rij voor de beheerder;
  - `>=` als cursor;
  - het filter op een gearchiveerd team weg;
  - de statuscontrole van de organisatie in `is_organisatielid()` weg.
- `src/modules/organisaties/api.test.ts`, de naad: 45 leden in drie pagina's
  geven precies 3 rpc-aanroepen en 0 `from()`, met de cursor van de laatste
  rij. Twee mutaties raken de bedoelde toetsen: de cursor uit de eerste rij,
  en een ophaalactie per lid.
- De typebrugtest wordt rood als `maak_organisatie` in het typebestand staat.
- **De security-ronde op 0324** vond niets kritieks. De twee middel-punten
  zijn verwerkt: dit document bestond nog niet, en twee beloftes uit de kop
  hadden geen toets.

## Niet gemeten

- **De schermen zijn niet visueel bekeken**, niet op web en niet native. Ze
  zijn gecontroleerd met typecheck, lint, de unit-tests en de controles
  (`schermingang`, `exports`, `regel15`, `emoji`, `tekst`, `foutsleutel`,
  `rpc`, `eenrij`, `keten`).
- De rijvormen in de typebrug zijn overgenomen uit de migraties en niet tegen
  de draaiende PostgREST geprobeerd.
- Productie: niets gedraaid.

## Wat de security-ronde nog openliet

- **Een teamnaam is nu een kanaal naar de hele organisatie.** Een teamlid met
  de rol admin kan de naam wijzigen. Die naam leest nu elk lid van de
  organisatie, ook wie niet in het team zit. Het is tekst die een gebruiker
  zelf typt en geen afleiding, dus domeinregel 7 breekt niet, maar het bereik
  is groter geworden. Staat als ER-rij in de afleverregel.

## Het migratienummer

Gebouwd als `0305`. Op 20-11-2026 hernummerd naar **`0324`**, in de ketenlaan
van Quinten (652 → `0316` tot en met 699 → `0327`).

⚠️ **Bij het hernummeren overgezet naar de opbouw van `main`.** Het profiel is
sinds QS8-754 een rij ingangen, en accountverwijderen staat in
`src/schermen/instellingen/AccountPaneel.tsx`. De kaart *Organisaties* staat nu
als laatste in `Ingangen()` van `app/(tabs)/profiel.tsx`, in dezelfde vorm als de
andere ingangen. De waarschuwing voor een beheerder staat in de bevestigstap van
`AccountVerwijderen`, op dezelfde plek als op deze tak. De inhoud en de teksten
zijn ongewijzigd.

⚠️ **QS8-695 heeft geen scherm.** Dit issue is gebouwd op een tak zonder 695, dus
`benoem_organisatiebeheerder()` en `treed_terug_als_organisatiebeheerder()`
hebben nog geen aanroeper. Ze blijven in `WACHT_OP_EEN_BESLUIT` van
`scripts/dode-keten-controle.mjs` staan.
