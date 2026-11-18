# Verbeterplan GoalBuddies op basis van de Habit Huddle-ontleding

> Status 18-11-2026. Een **plan en geen besluit**: geen issues aangemaakt, niets geclaimd, geen code.
> Opdracht van Quinten (18-11-2026): op basis van het onderzoek verbeteringen voor GoalBuddies
> uitwerken, met de visuele opmaak van Habit Huddle "zoveel mogelijk overnemen".
> Bronnen: `docs/research/habit-huddle-app-ontleding.md` (s1–s20 = de schermafbeeldingen van Quinten),
> `docs/research/habit-huddle-teardown.md`, `docs/research/voorstel-bescherming-bij-een-gemiste-week.md`.
> Eigen stand: gelezen in de code (`app/(tabs)/*`, `src/shared/ui/*`, `src/shared/theme/tokens.ts`),
> **niet** gedraaid of gezien. Elke uitspraak over hoe GoalBuddies er nu uitziet is dus afgeleid uit
> bestanden, niet gemeten op een scherm.

## 1. Besluiten van vandaag (door Quinten, 18-11-2026)

| Vraag | Keuze |
|---|---|
| Nudges en de flexibele check-in (alleen met betaald account te zien) | **Bewust ongemeten laten.** Nudges worden niet overgenomen. |
| Voorstel "bescherming bij een gemiste week" | **Eerst het gat nameten** tegen de database (bouwsessie); pas bij een echt gat een issue. |
| Afronding | Een uitgebreid verbeterplan voor de app, met de visuele opmaak zoveel mogelijk overnemen (dit document). |

## 2. Wat "overnemen" hier betekent, en waar het ophoudt

De ToS van Habit Huddle verbiedt het gebruik van hun merk en trade dress zonder toestemming (§7), en
de opdracht voor deze onderzoekssessie was: functionaliteit en patronen mag je naboetsen, hun code,
teksten, beeldmerk en assets niet. Daarom, per laag:

| Laag | Overnemen? | Toelichting |
|---|---|---|
| Indeling, hiërarchie, ritme van het scherm, componentvorm | **Ja** | Een weekstrook, een rij tellers, een kaart met een grote afvinkcirkel, tabbladen op een profiel: dat zijn patronen. |
| Kleuren, thema's | **Nee, onze tokens blijven** | `CLAUDE.md`: het Q-Projects navy-stelsel, goud als accent, "verzin nooit een kleur bij". Hun palet (diepblauw met groen-turquoise) lijkt er toevallig op, maar overnemen is een besluit over de huisstijl, geen implementatiedetail. |
| Mascotte, illustraties, pictogrammen, copy | **Nee** | Merk en assets; onze helden en eigen teksten blijven. |
| Cosmetica die geld kosten (kaders, flair, confetti-sets) | **Nee** | Domeinregel 5 en grens 1; commercieel oppervlak. |
| Alles wat gemiste dagen of mensen publiek zichtbaar maakt | **Nee** | Domeinregel 7. |

**Wat Quinten daarmee krijgt:** een scherm dat voelt als Habit Huddle, in onze kleuren en onze woorden.
Wil hij dat hun kleuren echt over, dan is dat een eigen besluit onder *Beslisbevoegdheid*
(zie §9, besluit B).

## 3. Visuele patronen uit de schermafbeeldingen — GEMETEN (bron: s-nummers)

| # | Patroon | Gezien op | Wat het doet |
|---|---|---|---|
| V1 | **Vaste zijnavigatie** met niveau/XP bovenaan, profiel onderaan | s1–s20 | Eén vaste plek voor alle negen onderdelen op breed scherm |
| V2 | **Paginakop** met titel, een dunne voortgangsstreep eronder, en rechts altijd: reeks, abonnement, zoeken, meldingen | s1–s20 | Het hele scherm voelt als één systeem |
| V3 | **Weekstrook van zeven ronde dagen** met vandaag gemarkeerd | s1 | Orientatie in één blik |
| V4 | **Rij van drie tellers** (vangnet, tweede reeks, XP vandaag) | s1 | Samenvatting zonder grafiek |
| V5 | **Gewoontekaart**: reeks links, titel en groep midden, grote afvinkcirkel rechts | s1 | De primaire handeling is het grootste element |
| V6 | **Groepskaart**: kettingteller, ledenaantal, uitnodigknop, "meedoen"-rij eronder | s1 | Sociaal oppervlak compact |
| V7 | **Statistiekpagina**: totaalkaarten, periodetabs, kalender van aanwezige dagen, tijdstip-balken, sociale tellers | s5 | Eigen voortgang zonder oordeel |
| V8 | **Prestatiekaarten** met zeldzaamheid, XP en vergrendelde staat gedimd | s6–s10 | Voortgang als verzamelen |
| V9 | **Profiel met tabs** (check-ins, groepen, stats, trofeeën) | s4 | Eén bron van waarheid per persoon |
| V10 | **Instellingen in submenu's** met een lijst links en een paneel rechts | s13, s14, s16, s17, s19 | Weinig keuzes per scherm |
| V11 | **Afgeronde kaarten, veel lucht, grote cijfers, overal dezelfde radius** | alle | Rustig, niet druk |

AFGELEID: de rust komt minder uit de kleuren dan uit de **maat**: grote cijfers, ruime vlakken en één
primaire handeling per scherm. Dat is het deel dat zich goed laat overnemen in onze eigen tokens.

## 4. Wat GoalBuddies al heeft — AFGELEID uit de code

Vijf tabs: Vandaag, Doelen, Groep, Lijst, Profiel (`app/(tabs)/_layout.tsx`, `src/shared/ui/tabbladen.ts`).
In `src/shared/ui/` bestaan onder meer `Ritmestrook` (zeven vakjes per ritmedoel), `Kalender`,
`StreakCounter`, `Ketting`, `Weekpas`, `FloorCeiling`, `Viering`, `MilestoneProgress`, `Weekbalken`,
`Card`, `Avatar`, `Taakbalk`. Er zijn badges en seizoenen. Veel van het bovenstaande is dus **niet
nieuw bouwen maar herordenen en restylen**. Let op twee bestaande feiten:

- `app/(tabs)/index.tsx` telt 1505 regels en `profiel.tsx` 1541: regel 15 (functies < 50 regels) staat
  hier als ratel; een herontwerp moet het aantal lange functies laten dalen, niet laten stijgen.
- De `Ritmestrook` is **privé** (`day_checkins` is eigenaar-only, ook in een open groep; zie het commentaar
  in dat bestand). Een weekstrook zoals V3 mag dus nooit op een groepsscherm komen.

## 5. Het plan in fasen

Elke fase is bedoeld als **één of meer afgebakende issues** (eigen tak, eigen PR, zoals het project het
wil). Ik schrijf geen issues; wie dat doet, schrijft eerst per issue op wat "klaar" betekent. Ramingen
zijn aannames: S ≈ een dag, M ≈ enkele dagen, L ≈ een week of meer.

### Fase 0 — Besluiten en meting (geen code)
- 0.1 **Huisstijl-besluit** (§9, besluit B): onze tokens aanhouden of hun palet overnemen. *Advies: houden.*
- 0.2 **Referentie vastleggen:** screenshots van de huidige GoalBuddies-schermen naast de s-nummers
  hierboven, zodat "voor" en "na" meetbaar zijn. Nu is er alleen code gelezen. [S]
- 0.3 **Het gat in de weekpas nameten** (bouwsessie, productie alleen lezen): zie het voorstel §3. [S]

### Fase 1 — Visuele basis, zonder nieuwe functies (licht model, lichte review)
Doel: V11 en V2 in onze eigen tokens, over alle bestaande schermen.
- 1.1 **Ritme en maat** in `src/shared/theme`: een afspraak voor radius, afstanden en cijfergrootte,
  vastgelegd als tokens en niet per scherm. Toets: geen nieuwe kleuren (`CLAUDE.md`). [M]
- 1.2 **Eén paginakop-component** met titel, voortgangsstreep en vaste rechterkant (reeks, meldingen,
  zoeken). Vervangt per scherm herhaalde koppen. De streep toont **voortgang, nooit score** (regel 10). [M]
- 1.3 **Kaartvorm eenduidig** (`Card`): één primaire handeling per kaart, grote afvinkcirkel. [M]
- Toets: `npm run poort`; emoji-controle; geen tekst in pictogrammen (emoji-regel); a11y-labels
  (`src/shared/ui/a11y.ts`). Geen RLS-wijziging, dus geen `security-reviewer`.

### Fase 2 — Het Vandaag-scherm (V3, V4, V5)
- 2.1 **Weekstrook bovenaan Vandaag**, gebaseerd op de week van de gebruiker (`shared/time`, niet ad hoc:
  regel 1 en correctheidsregel 7). Verschil met Habit Huddle: zij tonen een rollende week, wij de
  **week met de eigen startdag**, want de week is onze eenheid. [M]
- 2.2 **Drie tellers** (vangnet = weekpas, reeks, punten van deze week). De punten alleen voor jezelf
  (regel 10); geen teller die kan dalen naast een voortgangsbalk (regel 10, "nooit in één balk"). [S]
- 2.3 **Vloer en plafond als twee zichtbare regels op de kaart** (regel 8 bestaat; dit is de vorm). [S]
- 2.4 Het scherm is nu 1505 regels: **splitsen is onderdeel van dit issue**, niet een bijvangst. [M]
- Review: licht, tenzij een tegel nieuwe data uit de database haalt; dan `security-reviewer`.

### Fase 3 — Onboarding (de zeven vragen, plan vóór de aanmeldmuur)
Uit §7–§9 van de ontleding. GoalBuddies heeft al `app/onboarding`; dit verbetert de volgorde.
- 3.1 **Vragenvolgorde** voor de doelopsplitsing: wat laat je gewoonlijk stuklopen, hoeveel tijd heb je echt
  (alleen eigen antwoorden, privé). [M]
- 3.2 **Voorbeeld van de herinnering vóór de pushvraag.** Geen uitgaande stroom naar de hele gebruikersgroep
  (grens 1 gaat daarover); dit is één melding aan één persoon die erom vraagt. [S]
- 3.3 **Plan bouwen vóór aanmelden:** alleen als **geen AI-call zonder account** nodig is of als er een
  limiet per apparaat is (onwrikbare regel 5 en 6: elke AI-call kost geld). *Advies: pas ná account, tot
  de kostenrem er is.* [M, hoog risico]
- 3.4 **Belofte ondertekenen**: alleen een belofte aan jezelf zonder gevolg. Hangt er een straf aan, dan is
  het een commitment device (regel 5) en gaat het naar Quinten. Een dagelijkse zin past niet bij onze
  week; de formulering is een eigen ontwerp. [S]
- Review: `critical-user` (tekst, toon, randgevallen).

### Fase 4 — Eigen voortgang (V7, V8, V9)
- 4.1 **Statistiekpagina** (alleen jezelf): periodetabs, kalender van weken (niet dagen), tijdstip van
  inchecken. **Geen lege tegel die als gemist leest**: neutraal, zoals Habit Huddle dat op s5 doet. [M]
- 4.2 **Prestaties op totaal aantal voltooide weken**, vergrendeld gedimd; nooit op een verbruikte weekpas,
  freeze of gemiste week (regel 7). Bestaande badges (migratie 0113) hergebruiken. [M]
- 4.3 **Profiel met tabs**: wat een ander ziet is beperkt tot wat groepsinstellingen toestaan (regel 4);
  `security-reviewer` direct, want dit is een groepszichtbaar oppervlak. [L]

### Fase 5 — Groep en instellingen (V6, V10)
- 5.1 **Groepskaart** met kettingteller (alleen oplopend), ledenaantal, uitnodigknop. [S]
- 5.2 **Dempen met behoud van directe steun** (uit s14): groepsgeluid uit, reacties en applaus op je
  eigen werk blijven. Past bij regel 7; zet geen systeembericht (nieuw type = migratie). [M]
- 5.3 **Pauze los van weggaan**: past op onze adempauze (`0` punten, regel 10). Wat de groep ervan ziet is
  een eigen besluit (regel 7). [M]
- 5.4 **Instellingen als lijst met paneel** (V10), bestaande schermen herordenen. [M]
- 5.5 **Meldingen:** één melding per groep per dag plus een "full house", alleen positief. [S]

### Fase 6 — Vergeving (alleen na de meting uit 0.3)
- 6.1 **Achteraf-venster naast de automatische weekpas** (optie B van het voorstel), alleen als het gat
  bestaat. `security-reviewer` direct (nieuwe `authenticated`-RPC, regel 4 en 19). [M, hoog risico]

## 6. Wat we bewust niet doen

| Idee | Reden |
|---|---|
| Globale feed, Discover, leaderboards, Hall of Fame, "sponsored" groepen | PRD en QS8-230; regel 7 |
| Publiek consistentiepercentage per groep (s20) | Een getal onder 100 maakt gemiste dagen afleidbaar (regel 7) |
| Nudges en waves | Niet gemeten; kan een gemiste dag verraden. Besloten: ongemeten laten |
| Style Studio, kaders, flair, betaalde confetti | Commercieel; regel 5; grens 1 |
| Prestaties voor Pro-leden of groepsgrootte | Commerciële prikkel op een groepsoppervlak |
| Betaalaanbod in de onboarding | Grens 1 |
| Hun kleuren, mascotte, pictogrammen en teksten | ToS §7; onderzoeksafspraak |
| Dagelijkse check-in als hartslag | Onze eenheid is de week (`habit-huddle-teardown.md` §4) |

## 7. Risico's per regel

- **Regel 7 (falen is nooit publiek):** alles in Fase 4 en 5 dat een ander ziet, vraagt de twee vragen
  uit `CLAUDE.md`: kan hieruit een gemiste week worden afgeleid, en kan iemand dat met één API-verzoek
  uitlezen? De regel is pas afgedwongen als de database hem afdwingt.
- **Regel 9 (Dagzet privé):** de weekstrook en de `Ritmestrook` blijven op eigen schermen.
- **Regel 15:** de twee grote tabbestanden zijn de plek waar een herontwerp de ratel kan laten stijgen.
- **Emoji-regel:** hun scherm gebruikt veel pictogrammen; wij tekenen geen emoji in app-tekst.
- **i18n:** elke nieuwe tekst via de catalogus in beide talen; een `Sleutel`-typefout is gewenst.
- **Schermingang:** een nieuwe route zonder ingang laat `schermingang:controle` rood worden.
- **Gegenereerde types:** `src/lib/database.types.ts` nooit met de hand.

## 8. Volgorde en afhankelijkheden

```
Fase 0 (besluit + referentie + meting)
   ├─ Fase 1 (visuele basis)  ──► Fase 2 (Vandaag) ──► Fase 4 (voortgang) ──► Fase 5 (groep)
   ├─ Fase 3 (onboarding)  (los van 1, behalve de kopcomponent)
   └─ Fase 6 (vergeving)   (alleen als de meting een gat toont)
```
Fase 1 eerst, want elke andere fase leunt op de maat en de kop. Fase 3 en 6 mogen parallel mits ze
niet dezelfde bestanden raken.

## 9. Besluiten voor Quinten

**A. Volgorde.** *Advies:* Fase 0, dan 1 en 2. Dat levert het snelst het gevoel op dat je zoekt, zonder
risico voor de domeinregels. Fase 3 en 4 daarna.

**B. Huisstijl.** *Advies: onze Q-Projects-tokens houden en alleen de indeling en maat overnemen.* Reden:
`CLAUDE.md` zegt het zo en de status tracker deelt dezelfde tokens; hun kleuren overnemen laat twee
apps uit elkaar lopen. Wil Quinten toch een eigen look, dan is dat een eigen besluit dat in
`docs/decisions/` hoort, met de Status Tracker erbij.

**C. Onboarding voor aanmelding (3.3).** *Advies: nee, tot er een kostenrem op AI-calls is.*

**D. Heldenstijl.** De zes helden en hun palet (`CLAUDE.md`, QS8-470) zijn onze eigen merkdrager. *Advies:*
die houden; ze maken ons onderscheidend van een kopie.

## 10. Wat gemeten is en wat niet

- **Gemeten:** de patronen V1–V11 uit de 20 schermafbeeldingen; de bestaande bestanden, tabs en
  componenten in de repo; de beperkingen uit `CLAUDE.md`.
- **Niet gemeten:** hoe GoalBuddies er nu uitziet op een scherm; hoeveel werk elke fase is (de ramingen
  zijn aannames); of de mensen die GoalBuddies gebruiken de Habit Huddle-indeling ook fijner vinden
  (geen gebruikersonderzoek); de check-in, nudges, een groep met meerdere leden en de Checkin Chain bij
  Habit Huddle.
- **Aanname die het meeste weegt:** dat de indeling het verschil maakt en niet de dagelijkse hartslag.
  Habit Huddle's retentie draait volgens `habit-huddle-teardown.md` op de dagelijkse check-in; een mooier
  scherm lost dat voor een wekelijks product niet op.
