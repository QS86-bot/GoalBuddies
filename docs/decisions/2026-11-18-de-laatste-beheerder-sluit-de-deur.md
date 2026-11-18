# De laatste beheerder sluit de deur

**Datum:** 18-11-2026 · **Issue:** QS8-659 (epic QS8-650) · **Migratie:** `0303` (voorlopig nummer, zie onderaan)
**Raakt:** besluit 14 en 28 in `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`; het wisrecht (`docs/decisions/2026-09-08-wat-een-straf-overleeft.md`); keuze 15 in `docs/decisions/2026-11-17-organisaties-en-lidmaatschappen.md`
**Status:** gebouwd op `quintenstrijdonk/qs8-659-accountverwijdering-en-verlaten-met`, bovenop QS8-655 (en daarmee 652 tot en met 654). Niet gemerged en niet op productie.

## Twee besluiten van Quinten (18-11-2026)

Gegeven als antwoord op een meerkeuzevraag in de bouwsessie. Beide keren is het advies gekozen. Ze staan ook als reactie op QS8-659.

1. **Teambonus na vertrek.** Bij de afronding van een teamdoel telt alleen
   iemand mee die op dat moment actief lid van de organisatie is én een
   gekoppeld aandeel heeft. Dit wordt gebouwd in QS8-662; daar staat het
   besluit ook als reactie.
2. **De laatste beheerder verdwijnt.** Dan trekt de database de uitnodigcode
   in. Niemand krijgt automatisch een rol, en het wisrecht blijft onverkort.

## Wat er staat

- `trek_organisatiecode_in_zonder_beheerder()`: een statementtrigger op
  `organization_members`, met een trigger voor `delete` en een voor `update`.
  Verdwijnt de laatste actieve beheerder van een organisatie, dan wordt
  `invite_revoked = true` gezet. Dat geldt voor elke route: de cascade vanuit
  `profiles`, vertrek, en een latere route die een rol verlaagt (QS8-695).
- `verwijder_mijn_account()`: woordelijk de gedeployde versie uit 0247, met
  één voorwaarde erbij. De lus over solo-groepen archiveert geen teamgroep
  meer (`g.organization_id is null`).
- Een backfill voor organisaties die nu al zonder beheerder staan. Die is
  idempotent en raakt vandaag niets, want 0299–0302 staan niet op productie.

## Gemeten vóór het bouwen

- **Vertrek uit de organisatie** was al goed geregeld door de trigger uit 0300:
  inactief in elke teamgroep, de koppelingen weg. De rij in `team_goal_shares`
  blijft staan; "losmaken" betekent in dit model dat de koppeling vervalt
  (besluit 14).
- **Accountverwijdering** ruimde al op via de bestaande cascades:
  `organization_members`, `group_members`, de doelen met hun koppelingen en
  aandelen. De teller `team_progress_events` heeft geen persoonskolom, en de
  verwijzing naar een mijlpaal gaat naar `null`. De balk daalt dus niet.
- **Het gat:** de laatste beheerder die zijn account verwijdert, laat een
  organisatie achter waarvan de code blijft werken (security-ronde op
  QS8-695, eindstand 0 beheerders).
- **A1:** de lus over solo-groepen archiveerde ook een teamgroep waarvan een
  organisatiebeheerder het enige actieve lid was. Een gearchiveerd team kan
  niemand heropenen (QS8-653, L1).

## De keuzes

| # | Keuze | Waarom de conservatiefste |
|---|---|---|
| 1 | **Een trigger op `organization_members`, en geen regel in `verwijder_mijn_account()`** | Een regel in één RPC vergeet de volgende route. Deze trigger vangt ook `verlaat_organisatie()` en een latere degradatie |
| 2 | **Op statementniveau, met lock op volgorde van id** | Een rijtrigger vergrendelt in de volgorde van de cascade. ⚠️ De deadlock die dat kan geven, is **niet** gereproduceerd (zie hieronder). De statementvorm dwingt de volgorde af in plaats van hem te veronderstellen |
| 3 | **De trigger gooit nooit** | Een fout erin draait de accountverwijdering terug, en dat is het wisrecht dat besluit 2 onverkort wil |
| 4 | **Teamgroepen worden bij accountverwijdering niet meer gearchiveerd** (A1) | Een team is van de organisatie. Een buitenstaander kan er niet in, en heropenen kan niemand |
| 5 | **De rij in `team_goal_shares` blijft na vertrek staan** | Weghalen gooit geschiedenis weg (grens 2). Het gevolg is dat het oud-aandeel niet aan een andere groep te koppelen is. Zie de open vraag onderaan |
| 6 | **Ook een gearchiveerde organisatie krijgt de intrekking** | Er is geen reden om een code open te laten op een organisatie die niemand meer beheert |
| 7 | `organizations` gaat **niet** in `KERNTABELLEN` van `definers:controle` | Buiten dit issue; de catalogustest dekt de functies die de lidtabel raken |

## De security-ronde: blokkerend, en in dezelfde ronde gesloten

- **K1 (kritiek), deadlock tegen vertrek.** De cascade van een
  accountverwijdering lockt eerst een teamgroep (`groups.created_by` set null)
  en pas daarna, in de trigger, de organisatierij. `verlaat_organisatie()` en
  `zet_organisatielid_uit()` doen het andersom: eerst de organisatie, dan via
  de vertrek-trigger van 0300 de teamgroep. 📏 Met drie sessies gemeten, eerst
  door de reviewer en daarna door mij als toets: 40P01, en de
  accountverwijdering viel om. Dat is precies het wisrecht dat besluit 2
  onverkort wil.
  **Gesloten:** `verwijder_mijn_account()` vergrendelt nu als eerste stap de
  organisaties waarvan hij actief beheerder of aanmaker is, op volgorde van id.
  De volgorde is daarmee overal organisatie → groep. De toets in
  `tests/rls/teamvertrek.test.ts` was rood vóór de fix en is erna groen.
  Geijkt: zonder die eerste lock valt precies deze toets weer om.
  **Restrisico:** een verwijdering buiten deze RPC om (de Auth-admin-API, het
  dashboard) houdt de omgekeerde volgorde. Zie de ER-rij in de afleverregel.
- **M1, "hij gooit nooit" klopte niet.** Een UPDATE toetst álle CHECKs van de
  rij opnieuw, ook die op de naam. Met een strengere naam-CHECK `not valid`
  kon de laatste beheerder zijn account niet verwijderen. Dezelfde val zit al in
  de set-null op `created_by` uit 0299. De kop zegt het nu. Er komt bewust
  géén `exception when others`, want dan bleef de code stil open.
- **M2:** `for no key update` in plaats van `for update`, zodat de lock niet
  botst met de FK-locks van gewone schrijvers. Niet apart gemeten.

## Gemeten (lokale stack, 18-11-2026)

- 306 migraties afgespeeld; `0303` twee keer achter elkaar zonder fout. Het
  verschil met de gedeployde `verwijder_mijn_account()` is precies één
  voorwaarde (met `diff` tegen `pg_get_functiondef()` gemeten).
- `tests/rls/teamvertrek.test.ts`: 10 tests groen. Eén toets draait met twee
  echte psql-sessies tegelijk, de K1-toets met drie.
- **IJking, negen mutaties, elk apart teruggezet** (de negende is de eerste
  lock in `verwijder_mijn_account()` weghalen, waarna de K1-toets omvalt):
  - de delete-trigger weg → de toets op de laatste beheerder en de racetoets;
  - de update-trigger weg → alleen de update-route;
  - de `not exists`-voorwaarde weg → de must-allow (twee beheerders);
  - geen `for update` → de racetoets;
  - de A1-voorwaarde weg → de A1-toets;
  - een `user_id`-kolom op de teller → de catalogustoets op de teller;
  - de FK van de teller naar mijlpalen op `cascade` → de toets op
    accountverwijdering (de balk daalt);
  - ⚠️ **een rijtrigger in plaats van de statementtrigger: groen.** De
    deadlock is in de race met twee gedeelde organisaties niet opgetreden.
    Geen toets onderscheidt de twee vormen vandaag.

## Niet gemeten

- De deadlock bij een rijtrigger (zie hierboven).
- Productie: niets gedraaid. `src/lib/database.types.ts` kent 0299–0303 nog
  niet.

## Open vraag, voor later

- **Een oud-aandeel blijft voorgoed aan zijn teamdoel vastzitten.** Na vertrek
  blijft de rij in `team_goal_shares` staan, dus het doel kan nooit aan een
  andere groep gekoppeld worden. En getelde mijlpalen zijn niet te
  verwijderen (0302). Of dat zo moet blijven, is een productvraag. Het is geen
  bouwfout.

## Het migratienummer

`0303` is voorlopig. Productie draagt `0299`–`0302` van QS8-233, en de stapel
652–655 heeft op zijn eigen takken `0299`–`0302`. De volgorde van landen
bepaalt de nummers; wie als tweede merget, hernummert (QS8-318).
