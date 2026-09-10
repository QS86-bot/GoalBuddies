# Een typefout hoort geen verwijderknop te vragen

**Datum:** 10-09-2026 · **Issue:** QS8-386 (epic QS8-378) · **Migratie:** geen

## De keuze

Migratie `0246` gaf `authenticated` het recht om `todo_items.body` bij te
werken. Het scherm van QS8-380 gebruikte dat recht niet — dat scherm levert
toevoegen, afvinken, verplaatsen en verwijderen, en hernoemen stond niet in zijn
acceptatiecriteria. De rij stond sindsdien in `GEEN_SCHRIJFPAD` van
`scripts/kolomrechten-controle.mjs`, met dit issue als bestemming.

QS8-386 bood twee wegen en noemde ze allebei goed: **A** bouwen, of **B** het
recht intrekken met één migratie.

**Gekozen: A.**

## Waarom

De doorslag geeft wat er gebeurt als je het níét bouwt. Een lijst waarin je een
typefout niet kunt herstellen, is een lijst waarin je een regel weggooit en
opnieuw typt — en dan is **verwijderen de reparatieknop**. Dat is precies de
handeling waar `bevestigingen().taakVerwijderen` een bevestiging voor vraagt,
omdat hij onomkeerbaar is. Een gebruiker leren die knop te gebruiken voor een
verschreven letter is de bevestiging leren wegklikken.

Daar komt bij dat er niets bij te bouwen valt aan de databasekant: de grant staat
er, `todo_items_update` laat de eigenaar toch al toe, en `pin_taak()` dekt de
kolommen die er wél toe doen (`user_id`, `created_at`, `id`, `visibility`,
`shared_group_id`). Optie B zou een migratie kosten om een recht weg te halen dat
binnen dezelfde epic een bestemming had.

## Wat de afweging tegen A was, en waarom hij niet won

Elk schrijfpad erbij is een pad dat onderhouden en bewaakt moet worden. Dat is
waar, en het is de reden dat dit een eigen issue was in plaats van een regel in
de PR van QS8-380 — het er stilletjes bij bouwen zou die PR verbreden, en dan is
de grendel die er nu op staat er niet.

## Drie dingen die hieraan vastzitten

1. **De patch is een objectliteraal** (`{ body: schoon }`) en geen opgebouwd
   object. `scripts/kolomrechten-controle.mjs` leest de kolomnamen uit de
   aanroep; een elders samengesteld object is voor die lezer onleesbaar, en dan
   zwijgt de controle over **álle** kolommen van dit paar. 📏 Dat is gemeten bij
   QS8-380: de eerste versie van `zetVolgorde()` bouwde de patch met
   voorwaardelijke spreads, en de controle meldde `body`, `done_at` én
   `order_index` alle drie als grant zonder gebruiker.

2. **Gemeten en opgeslagen zijn dezelfde string.** `taakTekst` doet `.trim()`
   vóór het tellen, dus `zetTekst()` schrijft de getrimde tekst uit het schema
   weg en niet de rauwe invoer. Anders keurt de client een taak van 500 tekens
   met spaties erachter goed en weigert `char_length(btrim(body))` hem met een
   `23514` waar de gebruiker niets aan kan doen. Dat is de naad, en er staat een
   test op die precies dát meet — niet dat de functie werkt.

3. **Het veld is het gedeelde `Field`.** QS8-250 hangt de microfoon daaraan, dus
   een taak wordt straks inspreekbaar zonder dat hier iets verandert.
   `tests/beloftes/lijstveld.test.ts` wordt rood zodra dit scherm zijn eigen
   `TextInput` bouwt.

## Waarom het scherm er twee componenten bij kreeg

`regel15:controle` stond op **precies het plafond** voor `app/` (65 functies boven
de vijftig regels), en met de hernoemknop erbij liep `TaakRegel` eroverheen. Dat
is de ratel die precies hiervoor bestaat, en het antwoord is splitsen en niet het
plafond verhogen.

Twee splitsingen, allebei ook inhoudelijk juist:

* **`Hernoemen`** — de bewerkstand is een andere stand van dezelfde regel, met een
  eigen veld, een eigen teller en twee eigen knoppen.
* **`Regelvoet`** — die houdt nu zelf bij of de verwijderbevestiging open staat.
  Verwijderen is de enige onomkeerbare knop van de vier, dus *"weet je het
  zeker"* hoort bij de knop die hem stelt en niet bij de regel eromheen.

Het aantal bleef daarna op 65 staan: er kwam geen lange functie bij, en er ging er
ook geen af. De ratel slaat twee kanten op, dus dat is de bedoelde uitkomst.

## De ijking

Drie mutaties, één per grendel, met de hand gedraaid. Ze staan met hun uitkomst
in de kop van `src/modules/todos/api.test.ts` (F, G en H).

⚠️ **Mutatie G maakte er drie rood waar er één voorspeld was**, en dat staat er
met de reden bij in plaats van gladgestreken: `taakTekst` draagt het trimmen én
beide grenzen, dus een kale `z.string()` haalt ze in één keer alle drie weg. Een
ijking die alleen het voorspelde getal opschrijft, is een aanname met een vinkje
ervoor.

## Wat dit niet is

Geen verruiming van wat de groep ziet: hernoemen raakt `body`, en welke rijen een
groepsgenoot van je leest hangt aan `visibility` en `shared_group_id` — die twee
staan in geen enkele kolomgrant en `pin_taak()` weigert ze bovendien. Rij 36 in
`docs/decisions/002-domeinregel7-oppervlakken.md` verandert hier niet van.

⚠️ **Wat er wél aan vastzit en geen nieuw besluit is:** een gedeelde taak die
hernoemd wordt, verandert mee voor de groep die hem al kon lezen. Dat is de
bedoelde werking van één rij met één tekst — er is geen kopie die achterblijft,
zoals bij een chatbericht (beslisdocument 002 §3). Wie ooit een gedeelde taak
wíl bevriezen na het delen, neemt daar een eigen besluit over.
