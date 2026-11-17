# Een organisatiebeheerder benoemen en terugtreden

**Datum:** 17-11-2026 · **Issue:** QS8-695 (epic QS8-650) · **Migratie:** `0300` (voorlopig nummer, zie onderaan)
**Raakt:** besluit 6, 13 en 34 in `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`; keuze 8 tot en met 10 in `docs/decisions/2026-11-17-organisaties-en-lidmaatschappen.md`
**Status:** gebouwd op `quintenstrijdonk/qs8-695-een-organisatiebeheerder-benoemen`, bovenop QS8-652; niet gemerged en niet op productie.

## Waarom

Na QS8-652 heeft een organisatie precies één beheerder: de aanmaker. Die kan
niet vertrekken, en er is geen manier om het beheer te delen of over te
dragen. Quinten besliste op 17-11-2026 dat dit een eigen issue werd (zijn
reactie op QS8-652, besluit 3).

## Wat er staat

- `benoem_organisatiebeheerder(p_organization_id, p_user_id)`: een beheerder
  maakt een actief lid met de rol `member` beheerder.
- `treed_terug_als_organisatiebeheerder(p_organization_id)`: een beheerder
  wordt zelf weer lid, zolang er een andere actieve beheerder is.
- `organization_role_events`: wie benoemde wie en wie trad terug. Append-only
  en voor geen enkele client leesbaar.

Overdragen gaat in twee stappen: eerst benoemen, dan terugtreden.

## De keuzes

| # | Keuze | Waarom de conservatiefste |
|---|---|---|
| 1 | **Een spoor van rolwijzigingen, zonder leesoppervlak** | De spec-planner legde dit voor als besluit. Het is geen grens 1 of 2, dus ik heb het zelf genomen: zonder spoor is later niet terug te halen wie wie benoemde, en dat is de onomkeerbare kant. Alle vier de policies zijn `false` en er is geen grant, dus besluit 6 en 002 rij 42 veranderen niet. Bij groepen haalde 0199 het promoveren weg met de zin *"wie promoveren alsnog wil, bouwt er een RPC voor met een `group_events`-rij"*: dit is die rij |
| 2 | **Geen andere beheerder degraderen of uitzetten** | Keuze 9 van 0299 blijft: één beheerder sluit de ander niet buiten. `treed_terug_…` neemt daarom geen `p_user_id` |
| 3 | **Een benoemde beheerder is gelijk aan de aanmaker** | `created_by` krijgt geen extra rechten; anders ontstaat er een derde rol, en besluit 19 kent er twee |
| 4 | **Elke weigering is `niet_toegestaan`**, behalve `laatste_beheerder` en `rate_limited` | Criterium 4 van QS8-652: een buitenstaander krijgt met de echte id hetzelfde als met een verzonnen id. `laatste_beheerder` ziet alleen een beheerder, en die ziet de andere beheerders toch al in de ledenlijst |
| 5 | **Al beheerder opnieuw benoemen geeft `niet_toegestaan`**, geen idempotente `ok` | Zelfde vorm als `zet_organisatielid_uit()`: de update vindt geen rij |
| 6 | **Een dagteller van 20 rolwijzigingen per organisatie per etmaal**, gedeeld door beide RPC's | Benoemen en terugtreden in een lus vulde anders het spoor onbeperkt (`plafonddekking` vond de tabel als groeibaar). Niet gemeten tegen echt gebruik |
| 7 | **Geen systeembericht en geen melding** | Een nieuw systeembericht vraagt een migratie op de allowlist en een besluit; een organisatie heeft bovendien geen chat |
| 8 | `verlaat_organisatie()` en `zet_organisatielid_uit()` worden **niet** opnieuw gedefinieerd | QS8-653 hangt een trigger aan die schrijfacties; een tweede `create or replace` kan bij het samenvoegen stil een lichaam overschrijven (QS8-358) |

## De invariant

**Elke schrijver die het aantal actieve beheerders kan verlagen, lockt eerst de
organisatierij en telt daarna.** Vandaag zijn dat `verlaat_organisatie()` en
`treed_terug_als_organisatiebeheerder()`. Beide functies zijn `volatile`: in
READ COMMITTED krijgt dan elk statement na de lock een verse snapshot, zodat
de telling ziet wat de vorige houder commitde.

⚠️⚠️ **Er is vandaag al een derde schrijver die zich er niet aan houdt:
accountverwijdering.** `verwijder_mijn_account()` cascadeert naar
`organization_members` zonder lock en zonder `laatste_beheerder`. 📏 Gemeten in
de security-ronde en door mij nagemeten: A treedt terug, B verwijdert zijn
account, eindstand **0** beheerders. Dat gat bestond al vóór deze migratie (de
enige beheerder die zijn account verwijdert) en hoort bij QS8-659. Ik dicht het
hier niet met een trigger: die zou accountverwijdering blokkeren, en het
wisrecht tegenhouden is een besluit en geen bijvangst. **Advies van de
security-ronde, dat ik overneem: zet organisaties niet op productie voordat
QS8-659 geland is.**

⚠️ Een nieuwe schrijver die deze regel vergeet, laat de bestaande racetoetsen
groen: die toetsen alleen de paren die er vandaag zijn.

## Gevolg voor QS8-653 (gemeten tegen die tak, niet op deze)

- `is_teambeheerder()` leest `is_organisatiebeheerder()` live. Een benoemde
  beheerder is dus meteen beheerder van elk team, en wie terugtreedt verliest
  dat meteen (besluit 34).
- De vertrek-trigger hangt aan `update of status`, dus een rolwijziging laat
  hem met rust.
- De lockvolgorde is overal eerst de organisatie en dan de groepen.

Na het samenvoegen van beide takken hoort er een toets op de naad bij: een
benoemde beheerder beheert een team, en een teruggetreden beheerder niet meer.

## Gemeten (lokale stack, 17-11-2026)

- 303 migraties afgespeeld; `0300` twee keer achter elkaar zonder fout.
- `tests/rls/organisatiebeheer.test.ts`: 10 tests groen, waarvan drie met twee
  echte psql-sessies tegelijk. Zes mutaties, elk apart teruggezet:
  - `for update` weg in `treed_terug_…` → de toets "twee keer terugtreden" (twee
    keer ok, nul beheerders);
  - de lock vóór de autorisatie in `benoem_…` → de toets "een buitenstaander
    wacht niet op de lock" (lock-timeout);
  - `role = 'member'` weg in `benoem_…` → de toets op het opnieuw benoemen;
  - de toets `laatste_beheerder` weg → vijf toetsen, waaronder beide racetoetsen;
  - `for update` weg in `verlaat_organisatie()` → de toets "terugtreden terwijl
    de ander vertrekt";
  - het spoor weg → de spoortoets.

- **De hercontrole ná de lock in `benoem_…`** is door de security-ronde wél
  gemeten met twee sessies: A treedt terug en houdt de lock, en A's eigen
  benoeming in de andere sessie krijgt daarna `niet_toegestaan`. Er staat geen
  toets in de suite voor, want die zou een sleep in de functie vragen.
- **Het spoor overleeft accountverwijdering** sinds de security-ronde (L1):
  `subject_id` is `on delete set null`, net als `actor_id`.

## Niet gemeten

- **`stable` in plaats van `volatile` is niet als ijking te gebruiken**: een
  `stable` plpgsql-functie mag geen `update` doen en valt dan om met een fout,
  in plaats van stil de race door te laten. De keuze voor `volatile` staat in de
  kop van de migratie, maar heeft geen eigen toets.
- **Een inactief lid benoemen** heeft geen eigen toets; de `status = 'active'`
  in de update draagt het.
- De plafonds (20 per etmaal) en productie: niets op productie gedraaid.

## Het migratienummer

`0300` is voorlopig. Productie draagt `0299`–`0302` van QS8-233, QS8-652 wordt
volgens het besluit van Quinten `0303`, en QS8-653 claimt ook `0300`. De
volgorde van landen bepaalt de nummers; wie als tweede merget, hernummert
(QS8-318).
