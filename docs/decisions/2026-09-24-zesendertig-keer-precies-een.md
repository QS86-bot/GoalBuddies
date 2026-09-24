# Zesendertig keer "er is er precies één", en niets dat de zevenendertigste tegenhoudt

**Datum:** 24-09-2026
**Issue:** QS8-605
**Raakt:** `scripts/eenrij-controle.mjs`, `tests/scripts/eenrij-controle.test.ts`

## Waar dit vandaan komt

De reactieve voorraad was leeg: alles op Todo en Backlog droeg `wacht-op-Quinten`,
en de drie open **Hoog**-rijen in `docs/ENGINEER-REVIEW.md` zijn novemberagenda of
geblokkeerd. `CLAUDE.md` schrijft dan een controlepas voor. Dit is wat hij opleverde.

## De meting

📏 Op `origin/main` = `2d777c63`, over `src/` en `app/` zonder testbestanden:
**38** ketens die eindigen op `.single()` of `.maybeSingle()`. Alle achtendertig
dragen een garantie dat er hoogstens één rij terug kan komen:

| dekking | wat het is |
| -- | -- |
| `insert(…).select(…).single()` | de rij die hij zelf schreef |
| `.order().limit(1)` | "precies één" is dan de definitie |
| een filter op elke kolom van een sleutel | de database belooft het |
| een **partiële** unieke index, mét zijn predicaat in de filters | idem, maar alleen daar |

⚠️ **Ze waren correct omdat achtendertig schrijvers opgelet hebben.** Er was niets
dat rood werd als de negenendertigste die aanname liet vallen — een regel die
alleen op papier staat, met instanties die hem toevallig aanhouden. Dat is de
vorm die dit project als schuld telt.

⚠️ **En het faalgedrag is het slechtst denkbare.** PostgREST geeft bij twee rijen
op `.maybeSingle()` een fout. Die verschijnt dus niet bij het schrijven maar op het
moment dat er voor het eerst een tweede rij bestaat: in productie, bij de
gebruiker met de meeste data. Een test met één rij is groen.

## Waarom hier wél een controle komt en bij regel 16 niet

In dezelfde pas is onwrikbare regel 16 nagemeten — loading-, error- én
empty-state. 📏 **31** asynchrone laadbeurten in `app/`, waarvan **12** de
foutstaat weglaten. Alle twaalf dragen een uitgeschreven reden dát stil falen
daar het goede gedrag is, en alle twaalf zijn geguard tegen `data === undefined`
(`?? []`, `?.get()`, `=== undefined ||`). Een mechanische controle daarop zou op
dag één **twaalf registerrijen** nodig hebben.

⚠️⚠️ **Hier is dat register leeg, en dat is het hele verschil.** Bij QS8-591 en
QS8-594 gaf precies die vraag de doorslag: daar was het register de ruis, hier is
er geen ruis. Een controle die op dag één een inventaris nodig heeft, leer je
overslaan; een controle die op nul begint, meldt alleen wat erbij komt.

## Wat de controle leest, en waar hij streng is

### De partiële index is het scherpst

```sql
-- 0001: de actieve voltooiing is die zonder opvolger
create unique index completions_active_uniq
  on completions (weekly_goal_id) where superseded_by is null;
```

⚠️⚠️ **Een controle die alleen de kolommen leest en niet het predicaat, keurt de
enige aanroep goed die vandaag écht mis kan gaan.** `fetchVragen()` in
`src/modules/completions/approvals.ts` filtert `.eq('weekly_goal_id', …)` én
`.is('superseded_by', null)`. Laat je dat tweede filter weg, dan bestaat de index
nog steeds en dekt hij niets meer — en dan kunnen er zoveel rijen zijn als er
correcties geweest zijn. Het predicaat telt hier daarom mee, in twee vormen
(`is null` en `= 'waarde'`); **een predicaat dat de lezer niet snapt telt als géén
garantie**, niet als een volledige.

### Een view erft, maar alleen als het zeker is

📏 Twee aanroepen gaan naar een view: `mijn_profiel` en `goal_dashboard`. Allebei
staan op precies één basisrelatie zonder join, dus één rij per rij van de
basistabel. Zonder die erfenis waren het twee permanente registerrijen geweest —
precies de ruis die dit besluit wilde vermijden.

⚠️ Streng waar hij het niet zeker weet: alles met een `join`, een `group by`, een
`union`, of met meer dan één relatie in de buitenste `from` erft niets. Dan komt
de aanroep eruit als bevinding, en dat is de goede kant om op te falen.

### Wat hij niet kan lezen, meldt hij

⚠️ Een keten zonder leesbare `.from(…)` komt eruit als `onleesbaar` en maakt de
controle rood. Ongemeten is niet groen — de les van QS8-268 en QS8-270 — en die
geldt bínnen een controle net zo goed als ertussen.

### Geen regelnummers, en dat is een keuze

`zonderCommentaar()` in `scripts/zonder-commentaar.mjs` laat `//`-regels vallen en
plet een blokcommentaar tot één spatie, dus posities ná die knip komen niet
overeen met het bestand. Een tweede, positiebewarende knip schrijven is precies
wat QS8-412 en QS8-414 duur betaald hebben. Er komt daarom een **fragment** uit
dat je letterlijk kunt zoeken. Een anker dat klopt is meer waard dan een nummer
dat dat niet doet.

## IJking

Stand ervóór gemeten: de controle groen op 38 aanroepen, `tests/scripts/` groen
op 116 bestanden en 2529 toetsen. Eén mutatie per grendel.

| mutatie | controle | toets |
| -- | -- | -- |
| A — `.is('superseded_by', null)` weg uit `fetchVragen()` | **rood**, en hij noemt die regel | 27 groen |
| B — `.eq('id', …)` → `.eq('title', …)` | **rood** | 27 groen |
| C — `predicaatGedekt()` altijd `true`, **mét A erbij** | **groen** | **2 rood** |
| D — de `onleesbaar`-tak eruit | groen | **1 rood** |
| E — een registerrij die niets dekt | **rood** | **1 rood** |
| F — accolades terug in de splitser | **groen op 19** i.p.v. 38 | **2 rood** |

⚠️⚠️ **C is de mutatie die dit issue vraagt.** A alleen bewijst dat er íets rood
wordt; C bewijst wát het rood maakte. Met het predicaat genegeerd komt precies
dezelfde echte breuk er groen doorheen, en dan is het de toets die hem vangt.
Zonder C zou "A wordt rood" ook kloppen bij een controle die op naam van de index
kijkt en het `where` negeert.

⚠️⚠️ **F is de onaangenaamste, en hij is gevonden tijdens het schrijven en niet
erna.** De eerste splitser telde `{` en `}` mee, waardoor een heel functielichaam
één statement werd en er per statement maar één afsluiter gelezen werd. De
controle meldde toen **19** aanroepen en zei groen — *"de controle was groen omdat
hij niet keek"*, dezelfde vorm als QS8-595. De toets die daarop staat, is er dóór
die fout gekomen.

📏 **Twee brosheden zijn er bij het ijken uit gekomen en niet bij het schrijven:**
de `create table`-regex eiste een nieuwe regel vóór het sluithaakje (een tabel op
één regel werd niet gelezen), en de view-lezer zocht op de letterlijke tekst
`" select "` terwijl `goal_dashboard` er een nieuwe regel heeft staan. Allebei
faalden ze dicht — een ongelezen garantie maakt de aanroep tot bevinding — maar
"faalt dicht" is geen reden om iets verkeerd te lezen.

## Wat dit niet is

- **Geen bewijs dat er nooit twee rijen komen.** Het is een bewijs dat er een
  reden ópgeschreven staat waarom er één is. Een unieke index die later gedropt
  wordt, maakt deze controle rood — en dat is precies de bedoeling.
- **Geen vervanging van de RLS-suite.** Deze controle leest de bron en het schema;
  hij draait geen enkele query.
- **Geen uitspraak over `.rpc()`.** Een RPC die meer dan één rij teruggeeft en met
  `.single()` gelezen wordt, valt buiten deze lezer. 📏 Vandaag is er geen enkele;
  komt er een, dan meldt hij zich als `onleesbaar`.

## Aannames

- **De twee predicaatvormen zijn wat dit schema vandaag gebruikt.** Komt er een
  derde vorm, dan telt die index niet meer als garantie en wordt de controle rood
  — zichtbaar, en niet stil.
- **De view-erfenis gaat één laag diep.** Een view op een view erft niets; dat
  komt er vandaag niet voor.
