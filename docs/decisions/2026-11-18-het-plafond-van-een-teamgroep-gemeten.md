# Het plafond van een teamgroep, gemeten

**Datum:** 18-11-2026 · **Issue:** QS8-665 (epic QS8-650) · **Besluit:** 27 (voorlopig 25 leden, niet gemeten) in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md` ·
**Meetscript:** `docs/research/teamplafond-meting.sql`

## Uitkomst

**25 houdt.** Bij 25 leden blijft de databasetijd van elk groepsscherm onder ongeveer
120 ms. Bij 50 leden niet meer: `group_overview()` komt boven 300 ms, en groeit
sterker dan lineair. Het plafond van 25 hoeft dus niet omlaag. Omhoog kan pas nadat
`group_overview()` eerst pagineert en pas daarna rekent (QS8-699).

## Wat gemeten is

Op de lokale stack (Postgres 16, `npm run rls:stack`), op 0306. Per lid:
- 3 doelen aan de groep;
- 12 goedgekeurde weekdoelen over de afgelopen 12 weken;
- 6 mijlpalen (de helft gedaan);
- 20 chatberichten.

Daarnaast bestaan er **5000 profielen buiten de groep**. Gemeten als ingelogd lid,
met zijn JWT-claims, zoals PostgREST het doet. Vijf keer per RPC; hieronder staat de
mediaan in milliseconden.

| leden | `group_overview()` (20 per pagina) | `groepschat()` (50 per pagina) | `groep_teller()` | `ketting_stand()` | `openstaande_beoordelingen()` |
| --- | --- | --- | --- | --- | --- |
| 12 | 35 | 5 | 0,7 | 0,7 | 10 |
| 25 | 112 | 11 | 0,9 | 0,8 | 11 |
| 50 | 313 | 27 | 2,1 | 1,3 | 13 |

📏 Een tweede reeks zónder de 5000 profielen gaf voor 12, 18, 25 en 50 leden een
mediaan van 34, 57, 75 en 273 ms voor `group_overview()`. Bij `groepschat()` was dat
87, 219, 336 en 1489 ms. Zie hieronder waarom die chatcijfers niet gelden.

## Wat de cijfers zeggen

**1. `group_overview()` rekent alle leden door voordat hij pagineert.** De CTE `leden`
wordt gematerialiseerd. In het plan draaien de doelen, mijlpalen en reeksen per lid
25 keer (`loops=25`), ook al geeft de functie er 20 terug. Bovendien loopt per doel
een scan op `goal_group_links_group_idx` alle koppelingen van de groep langs
(`rows=38 loops=75` bij 25 leden). Daardoor groeit de tijd ongeveer kwadratisch met
het ledental. Bij 25 is dat te dragen, bij 50 niet. **Vervolg: QS8-699.**
⚠️ *Gecorrigeerd door de nameting hieronder: lineair, niet kwadratisch. De
`rows=38`-scan kwam uit ontbrekende statistieken.*

**2. De chat groeit lineair, mits de database groot genoeg is.** In een bijna lege
`profiles` kiest Postgres per bericht een sequential scan over alle profielen, met de
policy-helper `shares_group_with_user()` op elke rij. Dan wordt de chat kwadratisch:
1,5 s bij 50 leden. Met 5000 profielen ernaast kiest hij de index en is het 27 ms. In
productie is `profiles` groot, dus geldt de tweede reeks. ⚠️ Het plan hangt aan de
statistieken. Wie hier opnieuw meet, meet met `extra` in de buurt van het echte aantal
profielen, anders meet hij een artefact.

**3. De rest is vlak.** De teller, de Ketting en de wachtrij van goedkeuringen
hangen nauwelijks af van het ledental.

## Wat níet gemeten is

- **Realtime.** De lokale stack heeft geen Realtime-dienst. Met 25 leden in een groep
  krijgen 25 abonnees elk bericht. Of de gratis tier dat draagt (gelijktijdige
  verbindingen, berichten per seconde), is niet gemeten.
- **De netwerkkant.** PostgREST, TLS en de afstand tot eu-west-3 komen er in productie
  bij. De cijfers hierboven zijn databasetijd.
- **Productiehardware.** De lokale stack is geen gratis-tier-instance. Absolute cijfers
  zijn indicatief; de verhoudingen tussen 12, 25 en 50 zijn wat telt.
- **De schermlaag.** Hoeveel aanroepen het groepsscherm doet, is niet geteld. Dat zijn
  vier RPC's en geen per-lidaanroepen, volgens `src/modules/buddies/`.

## Nameting (QS8-699): de vorm van de curve was deels een meetfout

⚠️ **De tabel hierboven is gemeten zonder statistieken op de tabellen die het script
net gevuld had.** Alleen `profiles` kreeg een `analyze`. De planner hield
`group_members`, `goals` en `goal_group_links` daardoor voor bijna leeg, en koos per
lid een scan over alle koppelingen van de groep. Dat is dezelfde fout als bij de chat
in punt 2, één tabel verder. Het meetscript draait sinds QS8-699 `analyze` op elke
tabel die het vult.

📏 Opnieuw gemeten, mediaan in ms, met `extra=5000`, op de machine van de eerste
reeks (die is onrustig: herhalingen wijken tot 30% af):

| leden | oud lichaam (0303), zonder `analyze` | oud lichaam, mét `analyze` | 0307, mét `analyze` |
| --- | --- | --- | --- |
| 12 | 32 | 28–43 | 28–48 |
| 25 | 88 | 52–70 | 44–72 |
| 50 | 297 | 109–155 | 52–60 |
| 100 | — | 346 | 65 |

Wat er van punt 1 overeind blijft: het oude `group_overview()` rekende alle leden
door voordat hij pagineerde, en groeide daardoor **lineair** met het ledental. Het
was niet kwadratisch; dat kwam uit de ontbrekende statistieken. 0307 rekent alleen de
pagina door en blijft vlak. **De uitkomst "25 houdt" verandert niet**; de voorwaarde
eronder is met 0307 vervuld.

## Het besluit

Besluit 27 (voorlopig 25) wordt **bevestigd op grond van deze meting**, met één
voorwaarde: het plafond gaat niet boven 25 voordat QS8-699 `group_overview()`
lineair maakt. Dit is een conclusie uit een meting en geen nieuw productbesluit;
Quinten kan het getal alsnog anders kiezen.
