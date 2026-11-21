# Tijdelijk typebestand en een gefilterde keuzelijst voor het strafscherm

**Datum:** 20-11-2026
**Issue:** QS8-698 (strafscherm voor een teamaandeel)
**Besluit:** Quinten, 20-11-2026, via de orchestrator: optie 3, een tijdelijk typebestand tot `types:db` na de uitrol.

## Context

`src/lib/database.types.ts` is een afschrift van productie, en `npm run types:db` overschrijft het in zijn geheel (QS8-569). Het scherm voor een teamaandeel heeft `team_goal_shares`, `team_goals` en `groups.organization_id` nodig. Die staan nog niet in productie: productie is op migratie 0302, en de teamketen (0303 t/m 0327) is niet uitgerold. Hergenereren nu geeft de oude types terug, zonder de teamtabellen. Het issue zegt dat het scherm wacht op de uitrol.

## Wat er gebouwd is

- `src/modules/commitments/teamtypes.tijdelijk.ts`: een typebrug naast `database.types.ts`, met dezelfde vorm als de organisatiebrug (QS8-657). Hij raakt het afschrift niet aan.
- `src/modules/commitments/strafgroepen.ts`: de ene beslissing, puur en zonder imports, zodat de regel in een gewone Node-toets te bewijzen is.
- `src/modules/commitments/strafkeuzes.ts`: het ophalen. Het haalt het team van een aandeel op en de groepen van de gebruiker, en roept de pure regel aan.
- `app/doel/[id].tsx`: de straf-kaart gebruikt de nieuwe lijst. De prop `groepen` is vervallen; de hulpfunctie `gekozenBegunstigde` gebruikt het nieuwe type `StrafGroep`.

## De regel voor de keuzelijst

De database is de grendel (`bewaak_teamstraf()`, 0325). De lijst biedt alleen aan wat die toelaat:

- **Een aandeel** (het doel heeft een `team_goal_shares`-rij): alleen het eigen team als groep, en alleen actieve teamgenoten als persoon. Als de gebruiker niet meer in het team zit, is de lijst leeg.
- **Een gewoon doel**: geen teamgroep als groep. Als persoon alleen wie een niet-organisatiegroep met de gebruiker deelt (regel M2 van de trigger). Een collega met wie je alleen het team deelt, is geen getuige van je privédoel.

## Hoe het weg gaat

Zodra `npm run types:db` na de uitrol de teamtabellen kent:

1. Haal `src/modules/commitments/teamtypes.tijdelijk.ts` weg.
2. Zet `teamDb()` in `strafkeuzes.ts` om naar `supabase()`.
3. `tests/beloftes/teamtypes-typebrug.test.ts` wordt dan rood. Dat is het signaal om de brug af te breken. Het is geen fout.

## Wat hier niet mee besloten is

- De bevestigingstekst voor een teamaandeel. Die volgt uit Quintens besluit op het visuele voorstel en wordt in een eigen, gedateerd besluit vastgelegd, omdat hij een belofte aan een mens is (grens 1).
- De stuurloze-getuigeherstel gebruikt nog `fetchMogelijkeBegunstigden`. Die lijst is niet gefilterd op een teamaandeel. Dat is een apart oppervlak en staat als vervolg open.
- **Vóór de uitrol valt de lijst terug op de oude, privé-vorm, niet op leeg.** Op productie bestaan de teamtabellen en `groups.organization_id` nog niet; een query daarop geeft een fout. `teamVanAandeel()` valt dan terug op "geen aandeel", en de groepsquery op `groups` zonder `organization_id`, waarbij elke groep privé is. Vóór de teamketen is dat de juiste lezing: er bestaat dan geen organisatie en geen aandeel. Elke terugval meldt zich in de foutrapportage. Een echt aandeel dat zo een privélijst krijgt, weigert de database bij het opslaan (0325). Een lege lijst zou op productie alle strafgetuigen van elk doel wegnemen; dat is de reden voor de terugval.
