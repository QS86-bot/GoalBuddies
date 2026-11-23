# Het beloftescherm noemt de uitslag, en leest haar uit het spoor

**Datum:** 23-11-2026 · **Issue:** QS8-815 · **Besluit:** Quinten, 23-11-2026 16:57 UTC (meerkeuze via de hoofdorchestrator QS8-785: V1 = B, V2 = A, V3 = A, V4 = A)
**Raakt:** domeinregel 5 (commitment devices), 7 en 11; grens 1

## Wat er veranderd is

1. Op het beloftescherm staat één regel met de uitslag van de **nieuwste** besliste
   belofte: gehouden, in werking of ingetrokken, met de week erbij, in nl en en.
2. Is die belofte `due`, dan blijft de kaart met wat je beloofde staan en staat de regel
   erin, in plaats van de standregel. Een oudere `due` achter een nieuwere gehouden of
   ingetrokken week verdwijnt van het scherm (`vorigeVerschuldigd()` is versmald).
3. Na een gelukte intrekking staat bovenaan "Je belofte is ingetrokken." tot je het
   scherm verlaat.

Geen migratie.

## Keuzes die niet vanzelf spreken

**`cancelled` heeft drie wegen, en alleen het spoor onderscheidt ze.** Gemeten in de
migraties (0057, 0220, 0313), niet met `pg_get_functiondef()`:

| weg | spoorregel `cancelled` |
| --- | --- |
| rollover beslist de week als gehouden (`beslis_weekbeloftes()`) | `actor_id` NULL: de rollover draait zonder JWT |
| doel binnen de week afgerond (`rond_doel_af()` → `wikkel_commitments_af()`) | actor = **eigenaar**, `payload.doelstatus = 'completed'` |
| zelf ingetrokken (`commitments_update`) | actor = eigenaar, doel nog actief |

Het issue zei "ingetrokken = `cancelled` door de eigenaar". Letterlijk genomen las een
belofte die je hield door je doel af te ronden dus als ingetrokken. Quinten koos B:
gehouden is actor NULL óf `doelstatus 'completed'`. Kan het scherm het niet zeker
vaststellen (geen spoorregel, of een actor die niet de eigenaar is en geen afgerond
doel), dan zegt het niets. Een verkeerde uitslag over een commitment device is erger
dan geen.

**Het randgeval, bewust gelaten.** Iemand rondt zijn doel af ná de week, terwijl de
belofte nog op de beslissing van de rollover wacht (`wachtOpBeslissing()`), en trekt
haar dan zelf in. Het spoor draagt dan de eigenaar en `completed`, en het scherm zegt
"gehouden". Een tijdtoets in de bevroren zone kan het scheiden, maar `commitments.tz`
is voor de client niet leesbaar (0280), dus dat vraagt een migratie. Quinten koos
daar niet voor; het staat als ER-rij Laag in de afleverreactie van QS8-815.

**Het spoor alleen bij `cancelled`.** `due` zegt het zelf. `fetchIntrekspoor()` leest twee
kolommen van hoogstens één rij (regel 10), en werpt bij een fout (regel 16).
`commitment_events_select` geeft het spoor alleen aan de eigenaar, en het scherm toetst
de eigenaar al (`doel.owner_id`); de regel noemt de week en de uitkomst, geen getuige en
geen tekst.

**De naad met SQL staat onder test.** `tests/beloftes/belofteuitslag-spoor.test.ts` legt
de drie aannames (de naam `cancelled`, de sleutel `doelstatus`, en dat `rond_doel_af()`
het doel eerst op `completed` zet) naast de laatste definitie in de migraties.
`tests/beloftes/belofte-uitslag.test.ts` rendert het echte scherm met alleen het netwerk,
het doel en de sessie vervangen.

**"Geen actor = gehouden" leunt op een afwezigheid, en daar staat een register onder**
(security-review, Middel). Het klopt zolang de rollover de enige weg is die een
commitment zonder JWT op `cancelled` zet. 📏 Gemeten: van alle functies in de migraties
zetten er vandaag precies twee `commitments` op `cancelled`, `wikkel_commitments_af()` en
`beslis_weekbeloftes()`. Ze staan met hun actor in `NAAR_CANCELLED`; een derde weg is rood
tot iemand hem indeelt.

**De melding na intrekken leeft in het scherm, niet in de gegevens.** Ze is een
bevestiging van een handeling, geen stand: na het herladen zegt de uitslagregel
"ingetrokken" al. Ze is bewaard per doel, zodat ze nooit bij een ander doel staat. Elk ander herladen
(een nieuwe belofte aangegaan, "Bekijk de uitslag") wist haar: boven een nieuwe, lopende
belofte zou "ingetrokken" onwaar zijn (security-review, Laag).
