# Een aangenomen verzoek maakt je ook echt lid

**Datum:** 07-09-2026 · **Issue:** QS8-328 · **Migratie:** 0188 ·
**Volgt op:** QS8-314 (0187), en op 0102

## Wat er stond

`beslis_lidmaatschapsverzoek()` deed bij aannemen:

```sql
insert into group_members (group_id, user_id, role, status)
values (…, 'member', 'active')
on conflict do nothing;
```

Lag er al een rij voor die gebruiker, dan deed de insert niets. De
`group_events`-rij en het antwoord `{"ok": true, "status": "accepted"}` volgden
daarna **onvoorwaardelijk**.

## De meting

⚠️ **Het issue vroeg met zoveel woorden om dit eerst te méten en niet uit de bron
te concluderen**, en dat is hier gedaan: een lokale stack, echte JWT's, een echte
fixture. Anna zet Cor uit de groep, Cor vraagt lidmaatschap aan, Anna neemt aan.

| Wat | Vóór 0188 |
| -- | -- |
| `beslis_lidmaatschapsverzoek` | `{"ok": true, "status": "accepted"}` |
| `group_members.status` van Cor | `inactive` — **onveranderd** |
| `group_events` | een rij `join_request_decided` |

De test die dat vastlegt viel om op precies één regel: *expected 'inactive' to be
'active'*. Dat is de meting, en niet de redenering die eraan voorafging.

## Waarom dit geen randgeval is maar de normale weg terug

De eerste lezing was dat dit een race is — iemand kwam intussen via een
uitnodigingscode binnen, en dan is de gewenste toestand toch al bereikt. Dat
staat ook zo in het oude commentaar. 📏 Bij het meten bleek er een tweede,
gewóne route te zijn, en die is de belangrijke:

- `vraag_lidmaatschap_aan()` weigert een aanvraag van een bestaand lid, maar
  toetst `m.status <> 'inactive'`. **Een uitgezet lid mág dus aanvragen.**
- `join_group_with_code()` weigert datzelfde lid met `removed` (0029).

Dat betekent dat de aanvraag **de enige weg terug is** voor iemand die uit een
groep gezet is. En die weg liep dood in een `on conflict do nothing`, terwijl de
beheerder te horen kreeg dat het gelukt was.

⚠️ **Twee functies die elk op zich klopten, en samen een dood pad vormden.** Dat
is regel 18 vraag 1 in zijn zuiverste vorm: de fout zat niet in een onderdeel
maar op de naad, en beide kanten hadden tests.

## Het besluit

De bestaande rij wordt gelezen in plaats van weggeslikt:

| Wat er ligt | Wat er gebeurt |
| -- | -- |
| geen rij | invoegen, zoals hiervoor |
| `active` | niets — de gewenste toestand is al bereikt (de echte race) |
| `inactive` | heractiveren: dit is de terugkeer waar het verzoek om vroeg |
| `paused` | idem; de tak bestaat, de toestand vandaag nog niet (QS8-325) |

**In alle drie de aangenomen gevallen geldt daarna: zegt de functie `ok`, dan is
de aanvrager ook echt actief lid.** Dat is de belofte waar de test op staat, en
niet de tak.

### Waarom heractiveren en niet weigeren

Denkrichting 1 en 3 uit het issue kwamen uit op een eigen `reason` voor een
uitgezet lid — de beheerder hoort te weten dat hij iemand terughaalt. Dat is niet
gekozen, om één reden die pas bij het meten zichtbaar werd: **weigeren maakt de
terugweg definitief dood.** `join_group_with_code()` is al dicht voor een
uitgezet lid; zou het verzoek ook geweigerd worden, dan komt iemand die er een
keer uit gezet is nóóit meer binnen, en is de uitzondering `m.status <>
'inactive'` in `vraag_lidmaatschap_aan()` zinloze code.

Het signaal dat de beheerder iemand terughaalt gaat wél mee, maar in het
**antwoord aan de aanroeper** (`teruggekeerd: true`), niet in de geschiedenis —
zie hieronder.

### Waarom `role` mee terug moet naar `member`

⚠️ **Dit is een beveiligingskwestie en geen netheid.** `verwijder_lid()` zet
alléén `status` op `inactive` en laat `role` staan. De rij van een uitgezette
beheerder draagt dus nog `role = 'admin'`. Alleen de status omzetten zou die
rechten stilzwijgend teruggeven aan precies de persoon die er uit gezet was.

De invoegtak schrijft al `'member'`; de terugkeertak doet nu hetzelfde. De test
zet Cor daarom eerst op `admin` vóór hij verwijderd wordt — zonder die stap
toetst hij een rij die toch al `member` was, en dan bewaakt hij niets.

### Waarom de auditrij ongewijzigd blijft

De verleiding was om `teruggekeerd` in `group_events.new_value` te zetten, zodat
de groep ziet dat hier iemand terugkomt. Niet gedaan.

⚠️ `group_events` is **groepszichtbaar en append-only**. Dat veld zou een nieuw
oppervlak zijn waarop élk lid kan lezen dat iemand ooit uit de groep is gezet —
en CLAUDE.md is daar eenduidig over: *voor élk nieuw oppervlak is beschermd het
antwoord tot iemand het tegendeel besluit*, en bij twijfel is het antwoord nee.
Het signaal zit daarom in het antwoord van de RPC, dat alleen de beheerder leest
die de knop indrukt.

## De ijking

Vier mutaties, elk apart toegepast op de échte database en daarna teruggezet,
elk met een controle dat de mutatie ook werkelijk in het bestand stond:

| # | Wat gebroken | Wat rood werd |
| --: | -- | -- |
| 1 | de heractiveringstak (`elsif` altijd onwaar) | *de audit en het lidmaatschap lopen niet uit elkaar* |
| 2 | `role = 'member'` uit de heractivering | *geeft een teruggekeerd lid geen beheerdersrechten terug* |
| 3 | de invoegtak leeg | *schrijft voor een gewone aanvrager wél een auditrij* |
| 4 | `vraag_lidmaatschap_aan()` weigert een uitgezet lid | *laat een uitgezet lid wél aanvragen* |

⚠️ **Mutatie 4 breekt een ándere functie, en dat is met opzet.** De hele
bereikbaarheid van dit geval hangt aan die ene voorwaarde in
`vraag_lidmaatschap_aan()`. Zou iemand die later dichtzetten, dan is het geval
hierboven onbereikbaar en bewaakt dit hele testbestand niets meer — groen zonder
iets te beweren. De test die dat vastlegt staat er daarom als eerste.

⚠️ **Wat níet geijkt is en dat hoort er eerlijk bij: het `for update` op de
lidmaatschapsrij.** Dat slot beschermt tegen twee beheerders die tegelijk
beslissen, en dat is met een enkeldradige suite niet na te bootsen. Het staat er
op dezelfde grond als het bestaande slot op `group_join_requests` — dat ook nooit
onder een race getoetst is — en de kop van de migratie zegt dat erbij.

## Wat hierna nog open staat

- **De beheerder ziet in de UI nog niets van `teruggekeerd`.** Het veld is er;
  wat het scherm ermee doet is een eigen keuze, en die is bewust niet in deze
  migratie meegenomen.
- `paused` blijft een halve toestand die niemand schrijft (QS8-325). De tak
  hierboven behandelt hem alvast als `inactive`, wat de enige zinnige lezing is
  zolang niemand hem zet.
