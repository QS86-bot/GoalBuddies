# Drie tellers op Vandaag: vangnet, reeks en punten van deze week — QS8-747

**Besluit (Claude, binnen de beslisbevoegdheid; afweging, geen gate):** boven de
weekdoelen staat een rij van drie getallen, zonder grafiek en zonder balk, alleen op
het eigen scherm. Geen migratie, geen nieuwe RPC, geen nieuwe policy.

## Wat elke teller toont

| Teller | Bron | Samenvatting |
|---|---|---|
| Vangnet | `fetchDoelStanden()` (`weekpas_standen()`) | **som** van `weekpas.voorraad` over de doelen |
| Reeks | `fetchDoelStanden()` (`user_streaks`) | de **hoogste** `huidigeReeks` |
| Punten deze week | `points_ledger` via `fetchPuntenDezeWeek()` | som van `delta` binnen `[startsAt, endsAt)` van `huidigeCyclus()` |

De eerste twee zijn bestaande waarden uit de datalaag; er is geen tweede
berekening naast. De derde is een bestaande query-vorm (zoals `fetchBuddyBijdrage`)
op een tabel waar alleen de eigenaar bij kan, met het venster van `shared/time`.

## Aannames (zichtbaar gemaakt, omkeerbaar)

1. **Vangnet is een som, reeks een maximum.** Een pas beschermt de reeks van één
   doel; reeksen optellen is zinloos (drie doelen van vier weken zijn geen reeks
   van twaalf). Het label zegt dat een weekpas de reeks beschermt en niet de punten.
2. **Zonder doelen verschijnt de rij niet**, zodat een nieuwe gebruiker niet met
   "– – 0" begint (zelfde redenering als `StandBlok`).
3. **`cycle_missed` telt niet mee in "deze week".** De rollover boekt het minpunt
   zodra de nieuwe week begint, dus het valt in het venster van de week erná. Meetellen
   opent elke week met een minpunt voor een week die voorbij is. De boeking blijft in
   het grootboek en in de stand per doel. Een `correction` telt wél mee, ook negatief;
   de teller kan dus nog dalen (domeinregel 10: score en voortgang staan nooit samen,
   en deze teller staat nergens naast een balk).
   Gevolg dat bewust is aanvaard: een adempauze met terugwerkende kracht boekt een
   `correction` die meetelt terwijl het minpunt waar hij tegenover staat dat niet doet.
4. **Een week heeft hooguit een handvol boekingen** per persoon; de query is
   begrensd op 500 rijen (nieuwste eerst) en meldt zichzelf bij `reportError` als hij
   die grens raakt.
5. **Falen is niet wat de rij zegt.** Geen antwoord is een streepje, een mislukte
   punten-ophaalronde laat vangnet en reeks staan en toont één neutrale foutregel,
   en nul punten leest als "0".

## Domeinregels

- **7:** geen gemiste week afleidbaar voor een ander: het blok leest geen
  groepsgegevens en staat op geen groepsscherm; er is geen rood of "gemist".
  Geen nieuw groepsoppervlak, dus geen nieuwe rij in `002-domeinregel7-oppervlakken.md`.
- **10:** `points_ledger` is eigenaar-only; XP komt niet in deze rij.
- **1:** de week komt van `huidigeCyclus()`; getest met week-start maandag en zondag.

## Grendels

`tests/beloftes/de-tellers-blijven-prive.test.ts` (alleen op Vandaag, geen groepsdata,
geen balk, geen gemist-woord, weekpas-niet-punt in de tekst),
`src/modules/goals/punten-week.test.ts` (venster per week-start),
`src/schermen/vandaag/tellers-vorm.test.ts` en `tests/rls/punten-deze-week.test.ts`
(een ander krijgt nul rijen; draait in de databasebaan van CI, niet in de cloudsessie).
