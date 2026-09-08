# Een verwijzing die niet loslaat

**Datum:** 08-09-2026 · **Issue:** QS8-371 · **Migratie:** 0212

Wie ooit een goedkeuring introk, kon zijn account nooit meer verwijderen. Dit
document legt vast waarom het `set null` werd en niet cascade, en waarom er naast
de reparatie een schema-toets staat.

## 1. Wat er gemeten is

📏 End-to-end tegen het schema van `main`. Alice keurt de week van Bob goed, trekt
dat weer in, en verwijdert daarna haar eigen account:

```
intrekken:   {"ok": true, "reverted": true}
verwijderen: ERROR: update or delete on table "profiles" violates foreign key
             constraint "approval_withdrawals_approver_id_fkey"
             CONTEXT: SQL statement "delete from auth.users where id = mij"
```

`supabase/migrations/0030_goedkeuring_intrekken.sql` declareert `approver_id uuid
not null references profiles (id)` zonder `on delete`-clausule. Dat is NO ACTION.

De twee andere foreign keys van die tabel cascaderen wél, maar ze wijzen naar de
voltooiing van **Bob** — die rijen blijven staan. Alleen de verwijzing naar Alice
als *intrekker* blokkeert.

⚠️ **Dit is een AVG-verplichting (art. 17)** en het is de enige route naar
accountverwijdering in de app. `verwijderMijnAccount()` vangt de fout en toont
`auth.verwijder.mislukt`; er is geen tweede poging die wél werkt en geen uitleg.

## 2. Waarom `set null`

Het issue noemde drie richtingen.

| Richting | Waarom niet / wel |
|---|---|
| `on delete cascade` | Haalt met de intrekker ook het bewijs weg **dát** er ingetrokken is. Botst met domeinregel 6 (append-only: corrigeren via een correctie-record, niet door geschiedenis te wissen), en het raakt Bob, die niets verkeerd deed. |
| opruimen in `verwijder_mijn_account()` | Houdt het schema zoals het is en verplaatst de kennis naar een functie. De volgende tabel met dezelfde omissie loopt er opnieuw tegenaan — en dat is precies wat hier gebeurd is. |
| **`on delete set null` op een nullable kolom** | Gekozen. |

📏 Het is niet de uitzondering maar de regel in dit schema: van de 37 foreign keys
naar `profiles` stonden er 21 op cascade en 15 op set null, die vijftien allemaal
op een kolom die `null` toestaat. `approval_withdrawals.approver_id` was de enige
op NO ACTION.

⚠️ **De directe buur doet het al zo.** `completion_approvals.approver_id` staat op
set null terwijl `subject_id` cascadeert. De goedkeuring zelf overleeft het
vertrek van de goedkeurder dus al zonder naam; de intrekking ervan deed dat niet,
en dat verschil was geen besluit maar een omissie.

### 2a. Wat de rij nog waard is zonder naam

📏 `approval_id`, `completion_id` en `created_at` blijven staan, en dat is alles
waar de zes lezers op steunen: `bevestigingsstand`, `openstaande_beoordelingen`,
`trek_goedkeuring_in`, `vastgelopen_goedkeuringen`, `verdien_badges` en
`verwachte_weekdoelstatus` vragen allemaal `where x.approval_id = …` of
`x.completion_id = …`. Geen enkele functie leest `approver_id` van deze tabel.

⚠️ **De policy blijft kloppen, en de nul valt aan de goede kant.**
`approval_withdrawals_select` luidt `approver_id = auth.uid() or <eigenaar van het
doel>`. Met `approver_id is null` is de eerste tak `null` en dus niet waar: de rij
blijft zichtbaar voor Bob, de persoon die hij aangaat, en niemand kan hem
opeisen. Een `null` op de toesta-kant sluit; op de weiger-kant zou hij openen.
Hier is het de eerste.

### 2b. Waarom dit geen grens-1-vraag is

Het raakt wat er van een intrekking overblijft, en dat is wat er tegen Bob
beloofd is — dus is de vraag terecht gesteld. Het antwoord is nee: de intrekking
zelf blijft staan, met datum, en Bob blijft de lezer. Wat verdwijnt is de naam
van iemand die niet meer bestaat. Er wordt geen consequentie opgelegd en niets in
rekening gebracht.

## 3. De reparatie was de helft

⚠️⚠️ **Deze bug is niet gevonden door een test maar door een security-ronde op een
ándere branch**, en dat is het eigenlijke probleem. `tests/rls/opruiming.test.ts`
bestaat sinds QS8-359 en heet *"een account is te verwijderen, hoe oud zijn rijen
ook zijn"*. Die veeg zet een gebruiker neer met rijen in alles wat bij een
accountverwijdering meegaat — en was groen.

📏 Hij was groen omdat de vertrekker daar altijd het **onderwerp** van een
goedkeuring is en nooit degene die er een introk. Precies die ene rol hield zijn
profiel vast. Dat is regel 18 vraag 5 in zijn zuiverste vorm: de keten was
onderbroken terwijl elk schakeltje af was.

Er staan daarom twee dingen bij:

1. **De veeg dekt de rol.** De vertrekker trekt nu ook een goedkeuring in vóór hij
   weggaat. 📏 Zonder die vier statements is de test groen mét de kapotte foreign
   key erin; met de reparatie teruggedraaid worden beide veegtests rood.
2. **Een toets op het schema, niet op de rijen.** Elke foreign key naar `profiles`
   of `auth.users` moet bij een verwijdering iets kunnen. Voeg morgen een tabel
   toe met `references profiles (id)` zonder `on delete`, en de veeg blijft
   opnieuw groen — deze toets niet.

⚠️ **`set null` op een `not null`-kolom telt niet als opgelost**, en dat is geen
muggenzifterij: Postgres schrijft dan een `null` die de kolom weigert, en de
verwijdering strandt net zo hard als bij NO ACTION, alleen met een andere
foutcode. 📏 Nagemeten door de constraint precies die vorm te geven: beide
veegtests én de schema-toets worden rood.

⚠️ **Die tweede tak zou anders ongemeten zijn gebleven**, want de vorm komt in dit
schema nergens voor. Daarom maakt een MUST-FIND-geval hem zelf aan in een
transactie die terugrolt. Een controle die je niet kunt voeden, kun je niet
ijken.

## 4. IJking

| Mutatie | Rood |
|---|---|
| de foreign key terug op NO ACTION | 3 — beide veegtests + de schema-toets, die hem bij naam noemt |
| `on delete set null` op een `not null`-kolom | 3 — dezelfde drie |
| de vier statements van de intrekking uit de veeg | 0 op de veeg (dat ís de blinde vlek), 1 op de schema-toets |

De derde rij is de reden dat de schema-toets er staat: de veeg alleen kan een
gemiste rol niet vinden.

## 5. Wat er niet in zit

`push_tokens` en de andere cascade-verwijzingen zijn onaangeroerd. De enige
NO ACTION in het schema was deze; na 0212 zijn het er 21 op cascade en 16 op set
null, en de schema-toets houdt dat zo.
