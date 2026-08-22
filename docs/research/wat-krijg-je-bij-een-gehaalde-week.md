# Wat krijg je vandaag bij een gehaalde week?

> Onderzoek van 22-08-2026 voor QS8-110. **Geen besluit** — de vraag "wat zou de
> beloning moeten zijn" is een productkeuze en die staat hieronder open.
>
> ⚠️ De issuetekst van QS8-110 heb ik niet kunnen lezen: het Linear-token was
> verlopen, en de bron (`docs/GoalBuddies — spelregels en motivatie.docx`) staat
> niet in deze clone. Wat hier staat is de meting achter de títeľ, tegen de
> gedeployde database en de gedeployde Edge Functions. Klopt de vraag anders, dan
> is dit alsnog de feitenbasis.

## Het korte antwoord

Bij een gehaalde week krijg je vier dingen, en ze hangen **alle vier aan één
gebeurtenis**: een buddy die op goedkeuren drukt.

`award_points_on_approval()`, een trigger op `completion_approvals`:

1. de eigenaar krijgt `points_ceiling` of `points_floor` bijgeschreven;
2. het weekdoel gaat van `pending` naar `approved`;
3. `verdien_weekpassen()` — je bouwt aan een weekpas;
4. `herbereken_reeks()` — je reeks groeit.

De beoordelaar krijgt zelf `+1` (`review_given`), ook als hij om meer informatie
vraagt in plaats van goed te keuren. Dat klopt met domeinregel 10.

## ⚠️ Bevinding 1 — zonder buddy krijg je niets, maar je verliest wél

Dit is de zwaarste van de twee.

`herbereken_reeks()` telt uitsluitend `status = 'approved'` mee. Een weekdoel op
`pending` doet niets: het breekt de reeks niet, maar laat hem ook niet groeien.

Wie geen groep heeft, heeft niemand die kan goedkeuren. Zijn weekdoel blijft dus
voor altijd `pending`. Gevolg:

| gebeurtenis | met buddy | zonder buddy |
|---|---|---|
| week gehaald | `+1` of `+2`, reeks groeit, weekpas dichterbij | **niets** |
| week gemist | `−1`, reeks breekt (tenzij weekpas) | **`−1`, reeks breekt** |

De rollover loopt over **alle** profielen en kijkt niet naar groepslidmaatschap.
Het minpunt komt er dus wél.

**Een gebruiker zonder buddy kan alleen maar dalen.** Zijn score gaat omlaag en
zijn reeks staat stil, hoeveel weken hij ook haalt. Dat botst frontaal met
domeinregel 10 — *"de reeks dient de gebruiker, nooit andersom"* — en met de
nudge-regel uit `regels.ts`, die solo werken uitdrukkelijk toestaat: *"Wie in geen
enkele groep zit, hoort zijn nudge gewoon te krijgen — solo werken mag."*

De app moedigt solo werken dus aan en straft het vervolgens af.

⚠️ Dit staat als constatering in het commentaar van de meldingenjob (*"levert geen
punten op tot iemand het bevestigt"*), maar daar als neutraal feit. De asymmetrie
met het minpunt wordt er niet genoemd.

## ⚠️ Bevinding 2 — twee beloningen zijn wél toegestaan maar worden nooit gegeven

`points_ledger_reason_valid` staat zeven redenen toe. Nagelopen wie ze schrijft —
in `pg_proc` én in `supabase/functions/`, want die map valt buiten elke zoekactie:

| reden | wie schrijft hem |
|---|---|
| `completion_approved_floor` | `award_points_on_approval()` |
| `completion_approved_ceiling` | `award_points_on_approval()` |
| `review_given` | `award_points_on_approval()` |
| `cycle_missed` | de rollover (Edge Function) |
| `correction` | niemand — bedoeld voor handmatig rechtzetten (domeinregel 6) |
| **`milestone_done`** | **niemand** |
| **`goal_done`** | **niemand** |

Een mijlpaal halen levert dus nul punten op, en een héél doel afronden ook.

Dat is precies de valkuil uit `CLAUDE.md`: *"Een CHECK-constraint die een waarde
toestaat, is een belofte dat hij ooit voorkomt."* De sleuven zijn er, ze zijn
alleen nooit gevuld — en "de beloning invullen" uit de issuetitel is een
opvallend precieze omschrijving daarvan.

⚠️ Let op de valse vriend: `meld_mijlpaal()` gebruikt óók de string
`milestone_done`, maar als **type systeembericht** in de chat, niet als
puntenreden. Wie op de naam zoekt, denkt ten onrechte dat het gedekt is.

## Wat er wél werkt en niet aangeraakt hoeft

- De Ketting (`ketting_schakel`, `ketting_uit_weekafsluiting`) hangt aan de
  weekafsluiting van de groep en staat los van dit alles.
- Het feestelijke moment bij een goedkeuring (QS8-76) is af.
- De beloning uit een **commitment device** (QS8-83) is een ander mechanisme:
  die komt vrij bij het hálen van een doel en staat los van `points_ledger`.

## De keuzes die openstaan — voor Quinten

**1. Wat krijgt iemand zonder buddy voor een gehaalde week?** ✅ **Beantwoord op
22-08-2026: optie C.** Geen punten zonder goedkeuring, maar dan ook geen minpunt
zonder beoordelaar. Uitgevoerd in migraties 0064 en 0065; onderbouwing in
`docs/decisions/2026-08-22-geen-minpunt-zonder-beoordelaar.md`.

⚠️ Dat besluit haalt de straf weg, niet de stilstand: de reeks van een gebruiker
zonder buddy groeit nog steeds niet. Vraag 1b hieronder blijft dus open.

- *a.* Niets veranderen, maar dan hoort de app solo werken te ontmoedigen in
  plaats van toe te staan — en dan is de nudge-regel fout.
- *b.* Zelf afronden telt, maar minder: bijvoorbeeld de vloerpunten in plaats van
  het plafond. ⚠️ Botst met *"zelf afvinken is geen goedkeuring"*, dat expliciet
  in `api.ts` staat.
- *c.* Geen punten zonder goedkeuring, maar ook **geen minpunt zonder groep**.
  Symmetrisch, en het raakt alleen de rollover. Van de drie de kleinste
  ingreep — de rollover zou dan op groepslidmaatschap moeten kijken.
- *d.* Een wachttermijn: blijft een voltooiing X dagen `pending` zonder dat er
  iemand kán goedkeuren, dan telt hij alsnog.

**2. Moeten `milestone_done` en `goal_done` punten opleveren?** Zo ja: hoeveel,
en telt dat mee in het puntenplafond van het doel (domeinregel 10)? Zo nee: dan
horen ze uit de CHECK, want een toegestane waarde die nooit voorkomt is een
belofte die niemand nakomt.

**3. Blijft de beoordelaar `+1` krijgen bij `more_info`?** Nu wel. Verdedigbaar —
kijken kost tijd, ook als je nog geen oordeel geeft — maar het is nergens
opgeschreven als besluit.

## Hoe dit gemeten is

```sql
-- wie schrijft er punten
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc ilike '%points_ledger%';

-- welke redenen zijn toegestaan
select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.points_ledger'::regclass and contype = 'c';

-- en de twee functies zelf
select pg_get_functiondef('public.award_points_on_approval()'::regprocedure);
select pg_get_functiondef('public.herbereken_reeks(uuid,uuid)'::regprocedure);
```

Plus de gedeployde `rollover` via `get_edge_function` — `pg_proc` is niet de hele
codebase, en `cycle_missed` wordt daar geschreven en nergens anders.
