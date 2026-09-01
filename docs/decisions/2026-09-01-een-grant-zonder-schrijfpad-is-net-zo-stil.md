# Een grant zonder schrijfpad is net zo stil als een schrijfpad zonder grant

**Datum:** 01-09-2026
**Aanleiding:** QS8-258, gevonden als oorzaak onder QS8-253 / PR #133
**Raakt:** `scripts/kolomrechten-controle.mjs`,
`tests/scripts/kolomrechten-controle.test.ts`, `src/modules/goals/weekly.ts`

## 1. Waarom dit besluit er is

`kolomrechten:controle` bestond sinds de 0089-storing en bewaakte één zin:

> elke kolom die `src/` of `app/` **terugvraagt**, moet in de SELECT-grant staan.

Migratie 0140 viel om op het exacte spiegelbeeld. `goals.ritme` kwam erbij zonder
INSERT-kolomgrant, `doelSchema` geeft dat veld een `.default()`, dus de client
stuurt hem áltijd mee — en niet een ritme-doel brak maar **élk doel aanmaken**,
met `42501`. De controle bleef groen, en dat was terecht: hij bewaakte de andere
helft. Onwrikbare regel 18 in zuivere vorm.

## 2. Het besluit: beide richtingen, want de tweede is bijna gratis

De schrijfkant kent twee bevindingen en ze delen hun hele apparaat:

| Richting | Wat het is | Waar het al een keer misging |
|---|---|---|
| Kolom geschreven, geen grant | de storing van 0140 | `goals.ritme`, `weekly_goals.floor_days`, `ceiling_days` |
| Kolom met grant, geen schrijfpad | dood hout | `profiles.locale` (QS8-113) — kolom, CHECK, grant, policy en leeskant af, en geen enkel pad dat hem kon vullen |

De tweede richting is de variant zonder kapot onderdeel, en dus de variant die
geen enkele test vindt (regel 18 vraag 5). Wie de ene richting bouwt, heeft de
andere er bijna bij — en dan is hem weglaten een keuze en geen omissie.

⚠️ En hij vond bij zijn éérste echte ronde meteen zo'n geval: `maakWeekdoel()`
somde zijn velden op en liet `floor_days` en `ceiling_days` eruit. Schema, kolom,
CHECK, grant en trigger waren alle vijf af; een ritme-weekdoel kón niet bestaan.
Dat is in dezelfde commit gerepareerd.

## 3. De grens die de controle bruikbaar houdt: alleen versmalde grants

Een tabelbrede `grant insert on X` maakt élke nieuwe kolom vanzelf schrijfbaar.
Daar valt niets te bewaken, en zou de controle er tóch melden, dan gaat hij over
`id`, `created_at` en elke triggerkolom van elke tabel.

**Dus: alleen op een kolomgrant.** Daar ís elke kolom een besluit geweest, en dan
is "hij staat er niet in" een vraag met een antwoord. Dit is dezelfde afweging als
bij de lengtedrempel in de secret-scan (QS8-242): een controle die te veel meldt,
leer je uit te zetten, en dan is hij net zo blind als geen controle.

## 4. Waarom de schrijfkolommen uit de code komen en niet uit een lijst

Grants staan in de database — die blijft de bron, net als aan de leeskant. Wat de
app *schrijft* staat nergens anders dan in de code, en er zijn drie vormen:

1. een objectliteraal in de aanroep;
2. `{ ...gevalideerd.data }` — de velden van het Zod-schema dat hem valideerde;
3. een lokaal opgebouwd `update`-object (`const update: TablesUpdate<'goals'> = {}`
   plus `update.title = …`).

Die drie dekken 25 van de 27 schrijfacties. **De afweging was: een lijst met de
hand bijhouden, of de code lezen.** De lijst is afgewezen om de reden van QS8-125
en van de 0032/0034-fout: een tweede, met de hand onderhouden kopie van een feit
loopt uiteen, en de test vergelijkt hem dan met zichzelf.

## 5. Wat niet te lezen is, is ongemeten — en dat staat opgeschreven

Twee schrijfacties zijn statisch niet te lezen: een spread van een rij uit een
`map()`, en een `update(patch)` waar `patch` uit een functie komt. Die tellen in
**beide** richtingen niet mee — ze kunnen een ontbrekend recht verbergen én ze
zetten de dode-houtmelding voor die tabel uit.

Dat mag, en het staat met een reden in `NIET_TE_LEZEN`. Anders groeit het stil
door tot de controle nog maar over de helft van de codebase iets zegt — precies
wat `tekst:controle` overkwam.

⚠️ **Beide uitzonderingslijsten tellen in twee richtingen.** Een regel die geen
bevinding meer is, is óók rood. Een verlopen uitzondering zegt "dit is
beoordeeld" over een toestand die niet meer bestaat, en dekt daarna de volgende
bevinding op diezelfde plek af. Zelfde regel als `NOG_NIET_AANGESLOTEN` in
`catalogus-controle.mjs`.

## 6. De ijking

Twaalf mutaties, één per grendel, met de gemeten uitslag in de kop van
`tests/scripts/kolomrechten-controle.test.ts`. Eén ervan stond er niet toen de
lijst geschreven werd: de ijkingstest voor een sleutel tussen aanhalingstekens
was meteen rood, want de aanhalingsmodus sloeg aan vóór de sleutelherkenning en
`'goal_id':` werd in zijn geheel als string ingeslikt. Een controle die stilletjes
mínder ziet — en niemand had hem ooit gevoed.

Daarnaast is het hoofdgeval tegen de échte database gemeten: met
`revoke insert (ritme) on public.goals from authenticated` — de toestand van
commit `693149e` — wordt de controle rood met naam en reden, en na het teruggeven
van de grant weer groen.
