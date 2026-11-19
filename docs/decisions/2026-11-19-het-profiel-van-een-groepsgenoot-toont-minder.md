# Het profiel van een groepsgenoot toont minder dan de groep al ziet

| | |
|---|---|
| **Status** | Gebouwd 19-11-2026, QS8-750 (migratie 0308 wacht op Quintens backup) |
| **Oppervlak** | Rij 58 in `docs/decisions/002-domeinregel7-oppervlakken.md` |

## Besluit

Een profiel van een ander (`app/mensen/[id].tsx`) heeft twee tabs: voltooiingen en groepen. Op je eigen profiel komen statistieken en prestaties erbij, als ingang naar hun eigen schermen. Voor een ander bestaan die twee tabs niet: `profielTabs(false)` bevat ze niet, en de database geeft er niets over terug.

Data komt uit drie functies (0308), alle `security invoker` met een vaste kolomlijst en een expliciete toets dat kijker en persoon samen in een actieve groep zitten.

## Waarom invoker en niet definer

Alles wat de functies teruggeven is voor een groepsgenoot al leesbaar via `profiles_select`, `goals_select`, `milestones_select` en `groups`. Een invoker-functie kan daardoor nooit meer geven dan RLS, en het expliciete predicaat is de tweede sleutel op dezelfde deur. Gemeten (mutatie met de hand): zonder het predicaat blijft het antwoord voor een groepsgenoot gelijk, want RLS houdt de deur dicht; alleen de eigen projectie verandert. Een definer zou een rij in `scripts/definers-controle.mjs` vragen en RLS omzeilen zonder dat dit iets oplevert.

## Wat het profiel toont, en wat niet

Toont: naam en foto, actieve en afgeronde doelen die aan een gedeelde groep hangen (titel, categorie, afgerond, mijlpalen klaar en totaal), gedeelde groepen met naam.

Toont niet, ook niet in een open groep: punten, XP, niveau, badges, reeks, `best_streak`, weekstatus, enige datum, streefdatum, opgegeven (`archived`) doelen, groepen die niet gedeeld zijn. Reden: een lijst met een gat is een gemiste week; een opgegeven doel zou alleen als afwezigheid zichtbaar zijn.

## Aannames (niet door Quinten besloten)

1. Geen variatie op `groups.zichtbaarheid`: een open groep krijgt hier niets extra's. Beschermd is het antwoord voor een nieuw oppervlak.
2. Blokkades veranderen niets aan wat je ziet; een blokkade werkt stil, en nul rijen voor de geblokkeerde zou haar verraden. Engineer-review mag dit herbevestigen.
3. Niet meer dan 50 doelen per profiel zichtbaar (één pagina).
4. Voor jezelf is de projectie dezelfde, niet rijker, maar over alle groepen samen: elke groep ziet alleen zijn eigen deel. De titel zegt dat ("Wat je groepen van je zien"); critical-user vond de eerdere titel misleidend.
6. Niet gedaan, bewust: "meer laden" bij meer dan 50 doelen; de eigen tabs openen via een tweede tik.
5. Aandeeldoelen (QS8-649) bestaan nog niet; zodra ze er zijn hoort `profiel_doelen_van_lid()` ze uit te sluiten (rij 44).

## Types

De functies staan nog niet in `src/lib/database.types.ts` (afschrift van productie, migratie niet toegepast). De module roept ze aan via één smalle structurele rand met parsers, zoals `modules/xp/api.ts`; hergenereren met `npm run types:db` na toepassing laat die rand overbodig worden.
