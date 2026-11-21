# Beslispakket QS8-649: wat Quinten nog moet beslissen vóór de organisatielaag landt en live gaat

Voorbereid 18-11-2026. Dit is een **voorstel**: elke vraag heeft een aanbevolen antwoord, maar het
besluit is aan Quinten. Na zijn antwoorden kan QS8-649 dicht.

⚠️ **De volgorde is ingehaald, en dat verandert wat de poort nog doet.** Het issue zegt "vóór de eerste organisatie-migratie",
maar de keten is al gebouwd: gemeten in Linear op 18-11-2026 staan QS8-652 (de eerste migratie), 653, 654, 655, 656, 657, 658,
659, 660, 661, 662, 665 en 695 op **In Review**, en QS8-651 en QS8-664 op Done. De poort bewaakt dus niet meer het bouwen
maar het **landen op `main` en het toepassen op productie** van die keten. De volgorde daarvan staat in de reactie van 18-11 op
QS8-652 (QS8-233 eerst, dan hernummeren, dan de batch, productie pas na QS8-634) en is hier niet herhaald.

## Waar het issue nu staat

Van de acht acceptatiepunten staan er zeven op ✅ (punt 1 is op 17-11 afgevinkt op verzoek van Quinten, met de
kanttekening dat het geen markttoets is). Wat een besluit vraagt zit dus niet meer in de acht punten, maar in drie
dingen die ernaast zijn blijven liggen: een oordeel over de markttoets, vier open punten uit QS8-651, en een aantal
dingen die bewust naar de bouw zijn verschoven.

## Gemeten en niet gemeten

📏 **Gelezen voor dit pakket:** het issue, alle zeven reacties, het beslisdocument (§ "Wat hier niet besloten is" en
"Herbevestigen vóór"), en in het spec-voorstel de beslissingen en openstaande vragen.

**Niet gelezen of niet nagemeten:** de ontleding van Habit Huddle en het weekbeschermingsvoorstel (staan op een
andere tak), de marktbronnen-teardown, de stand van QS8-651 op `main`, en of de rijen 41 t/m 49 in
`docs/decisions/002-domeinregel7-oppervlakken.md` nog kloppen. Ik herhaal geen cijfers uit die stukken als eigen meting.

---

## Vraag 1 — Herbevestig je besluit 2 (alles tegelijk) en 4 (organisatie boven groepen) nu de markttoets zo is afgelopen?

**Feiten.** Van de vier bronnen onder besluit 31 is één ontleed (`habithuddle.com`), één gelezen en zonder uitspraak
over besluit 2 en 4 (`goalsandprogress.com`), en twee ongemeten (`goalgeniee.com`, `habi.app`) waarvan je de voorwaarde
op 17-11 hebt laten vervallen. De markt is dus **niet getoetst**, in geen van beide richtingen. De kostenvraag van de
organisatielaag blijft een oordeel (het beslisdocument zegt dat zelf).

| Optie | Wat het betekent |
|---|---|
| **A (aanbevolen)** Herbevestigen, expliciet als oordeel en niet als meting | De organisatielaag wordt gebouwd. Het risico (de markt heeft aan founder-apps genoeg) blijft staan en staat zo ook in het issue. Bouwen op een oordeel is de normale toestand in de solo-fase. |
| B Eerst meten met een echte gebruiker of klant | Geen migratie tot er één zakelijke gebruiker over het concept gesproken heeft. Kost tijd, en de bron is er vandaag niet. |
| C Besluit 2 of 4 laten vallen | De twaalf bouwissues in QS8-650 worden herschreven (het issue zegt dat zelf). |

**Waarom A.** De keten staat er al; B of C betekent dat afgeleverd werk wacht of herschreven wordt. Het goedkoopste is het
besluit eerlijk te laten staan: schrijf in het beslisdocument *"herbevestigd als oordeel, niet getoetst"*, zodat niemand het
later voor een meting aanziet.

## Vraag 2 — Mag een teamgroep ooit "de enige" zijn voor een hulpvraag, een straf of een deelknop over een doel dat niet van het team is?

Uit de reactie van de bouwsessie van QS8-651 (05-11). Zodra een teamgroep bestaat, kiest `enigeOfGekozen()` bij **precies één**
kandidaat die ene zonder vraag. Een werknemer die alleen in het team van zijn werkgever zit, stuurt dan een hulpvraag over een
privédoel zonder keuzemoment naar de teamchat, en de begunstigde van zijn straf is zonder vraag dat team. Dat is domeinregel 7
bij zakelijk gebruik: de regel beschermt dan niet tegen schaamte maar tegen een beoordelingsgesprek.

| Optie | Wat het betekent |
|---|---|
| **A (aanbevolen)** Een teamgroep is nooit "de enige". Bij alleen een teamgroep verschijnt de lijst met die ene optie, en de knop blijft uit tot er gekozen is | Eén filter per aanroeper (vijf plekken) plus een rij in `tests/beloftes/geen-stille-eerste-groep.test.ts`. Conservatiefst; de gebruiker leest waar het heen gaat. |
| B Een teamgroep mag de enige zijn | Eén tik minder, en een werknemer kan een privétaak zonder bedenken naar zijn team sturen. |

📏 **QS8-698 (Backlog, ontwerpronde 18-11) dekt een deel hiervan al:** de keuzelijst in de straf-kaart toont op een aandeel alleen
de eigen teamgroep en teamgenoten, en op een gewoon doel geen teamgroep. Dat sluit de straf-kant van deze vraag. Wat het niet dekt
zijn de **hulpvraag, de vervangende getuige en de deelknop van De Lijst**: daar geldt de "één kandidaat, geen vraag"-regel nog
onverkort. Optie A hierboven gaat dus over die drie plekken.

Dit raakt ook **de deelknop van De Lijst** (`app/(tabs)/lijst.tsx`): bij één groep deelt hij met één tik, zonder groepsnaam. Valt
onder dezelfde keuze.

## Vraag 3 — Wanneer beoordelen we `beginfase()` (het uitnodigingsscherm na het aanmaken van een doel)?

`beginfase()` toont bij terugkomst de eerste gekoppelde groep zonder keuze. Dat verstuurt niets. Het wordt een probleem zodra een
doel tegelijk aan een teamgroep én een vriendengroep kan hangen, want dan kan het scherm de teamgroep noemen met de uitnodigingslink
van het team erbij.

**Aanbeveling:** als vaste voorwaarde bij de review van QS8-658 (het teamdoelscherm, staat op In Review): *"beoordeel of een doel aan
beide soorten groep kan hangen."* Dat is een aanname die van "één" naar "meer" gaat (regel 18, vraag 6). Of QS8-654 (de
koppelgrendel op groepskoppelingen) dit al uitsluit, heb ik niet nagelezen.

## Vraag 4 — Wie toetst het juridische deel, en moet dat vóór de bouw of vóór de verkoop?

Besluit 33: de juridische toets is een voorwaarde voor **verkoop** aan organisaties, niet voor bouwen. De vragenlijst voor de jurist
(twintig vragen) staat in `docs/research/vragen-voor-de-jurist-organisaties-en-teamdoelen.md`. De ondernemingsraadvraag (art. 27 WOR)
is niet geverifieerd.

**Aanbeveling:** het besluit laten staan, maar twee dingen vastleggen: **wie** de lijst voorlegt (jij) en een **datum** waarop dat
uiterlijk gebeurt, vóór de eerste echte organisatie. Het risico dat het datamodel herwerkt moet worden is dan een bekend risico met een
einddatum, geen open einde.

## Wat bewust naar de bouw is geschoven (alleen kennisnemen)

Deze hoeven nu niet beslist; ze staan al bij een bouwissue. Het pakket noemt ze zodat niemand ze kwijtraakt.

| Punt | Waar |
|---|---|
| De meting achter het voorlopige plafond van 25 (chat, groepsoverzicht, realtime) | QS8-665 (In Review; uitslag niet nagelezen) |
| De drie rechtstreekse paden (`heropen_groep`, `verlaat_groep`, `guard_group_member_update`) en of een organisatiebeheerder een gearchiveerd team mag heropenen | QS8-653 (security-reviewer direct) |
| Of `seizoensgrens()` geschikt is voor de bonuslimiet, en wie als "had een aandeel" telt bij vertrek vóór de afronding | QS8-662 |
| Hoe het commitment van een teamgroep er in het scherm uitziet | QS8-698 (bevestigingszin en keuzelijst), wacht op de uitrol en `npm run types:db` |
| De tekst van de bevestiging bij het openzetten van een groep: die moet het klassement noemen (besluit 45 A57) | QS8-666 |
| De Doelcoach-prompt en de voorbeelden (besluit 24) | na meting, elk een eigen besluit |

## Los hiervan, niet van deze poort

Het voorstel over bescherming bij een gemiste week (bestand `voorstel-bescherming-bij-een-gemiste-week.md` in `docs/research/`
op de tak `claude/habithuddle-app-ontleding`) raakt domeinregel 10 (weekpas) en 7. Het is aan Quinten en hoort bij een eigen issue; ik heb het
niet gelezen, dus ik doe er geen uitspraak over.

## Na jouw antwoorden

1. Het beslisdocument krijgt een regel per genomen besluit. Het nummer controleer je eerst op `main` en op de tak van de keten: de
   reactie op QS8-652 zegt dat "besluit 1 en 2" daar in dezelfde ronde bij gaan, dus er kan al een nummering lopen die ik niet heb gezien.
2. QS8-649 gaat op Done. Of de blokkeerrelatie van QS8-652 nog bestaat, heb ik niet nagelezen.
3. Bij vraag 2 optie A: een filter per aanroeper voor hulpvraag, getuige en De Lijst, en een rij in de naadtest. Als eigen klein issue,
   los van de keten, want QS8-698 dekt alleen de straf-kant.

## Wat dit pakket niet doet

Geen migratie, geen code, geen wijziging in `CLAUDE.md`, `docs/WERKVOORRAAD.md` of `docs/ENGINEER-REVIEW.md`.

---

## Besloten door Quinten — 19-11-2026 (antwoorden in de chat, vier keer de aanbeveling)

| Vraag | Besluit | Wat er nu volgt |
|---|---|---|
| 1. Besluit 2 en 4 | **Herbevestigd als oordeel, niet getoetst.** | Die zin hoort woordelijk in het beslisdocument van 03-11-2026 (§ "Herbevestigen vóór"). De markt is voor twee van de vier bronnen niet gemeten en dat blijft zo staan. |
| 2. Teamgroep als enige kandidaat | **Nee: de lijst verschijnt met één optie en de knop blijft uit tot er gekozen is.** | Een los klein issue: één filter per aanroeper (hulpvraag, vervangende getuige, deelknop van De Lijst) en een rij in `tests/beloftes/geen-stille-eerste-groep.test.ts`. QS8-698 dekt alleen de straf-kant. |
| 3. `beginfase()` | **Beoordelen bij de review van QS8-658.** | Vaste voorwaarde bij die review: kan een doel aan beide soorten groep hangen? |
| 4. Juridische toets | **Besluit laten staan, datum vastleggen.** | ⚠️ **De datum is nog niet genoemd.** Zonder datum is dit besluit hetzelfde als "laten staan zonder datum", dat Quinten juist niet koos. Wie legt hem vast: Quinten, uiterlijk vóór de eerste echte organisatie. |

⚠️ **Niet gedaan door dit besluit:** het beslisdocument van 03-11-2026 is niet bijgewerkt (de nummering van besluiten loopt op de tak van de keten en is niet nagekeken), geen issue aangemaakt voor vraag 2, en QS8-649 niet op Done gezet. Done zet de sessie die de merge afrondt.

## Aanvulling 19-11-2026 — twee antwoorden die de orchestrator doorgaf

⚠️ **Bron:** de orchestrator-sessie (`session_01DCbTvHDXPBensNUv1D6QLe`) meldt dat Quinten deze twee via een vraag in háár sessie heeft beantwoord.
Ik heb ze niet rechtstreeks van Quinten gelezen; wie twijfelt, vraagt het hem na.

1. **Besluit 2 geldt alleen voor teamgroepen, niet voor personen.** Een persoon die de gebruiker zelf aanwijst is een bewuste keuze.
   Dat beantwoordt de vraag die QS8-719 openliet (een collega als enige kandidaat voor een vervangende getuige of een straf-persoon):
   die blijft zoals hij is, en `isTeamgroep()` hoeft voor personen niets te doen. Het beslisdocument
   `docs/decisions/2026-11-05-de-eerste-groep-is-geen-keuze.md` noemt dat nog als open punt; dat is een regel die daar bij te werken valt.
   Het issue voor besluit 2 is **QS8-719** (aangemaakt door de orchestrator); er komt geen tweede.
2. **Besluit 4, de juridische toets, krijgt geen kalenderdatum maar een voorwaarde:**

   > ⚠️ **Herbevestigen vóór de eerste organisatie live gaat.** De juridische toets (arbeids- en privacyrecht: instemmingsrecht van een
   > ondernemingsraad, art. 27 WOR, en de AVG-rolverdeling; de vragenlijst staat in `docs/research/vragen-voor-de-jurist-organisaties-en-teamdoelen.md`)
   > moet zijn uitgevoerd en bevestigd vóór een echte organisatie GoalBuddies gebruikt. Zolang dat niet is gebeurd, is bouwen toegestaan en verkopen niet (besluit 33).

   Dat is de vorm van CLAUDE.md (*"herbevestigen vóór X"*): het noemt wat er moet gebeuren en vóór welke gebeurtenis, en het hangt niet aan een datum
   die verstrijkt zonder dat iemand het merkt. Het vervangt de open vraag *"noem een uiterlijke datum"* hierboven bij vraag 4.

