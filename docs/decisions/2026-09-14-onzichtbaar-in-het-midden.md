# Onzichtbaar in het midden: nul pixels tegenover witruimte

**Datum:** 14-09-2026
**Issue:** QS8-495 (gevonden in de security-review op QS8-450)
**Migratie:** 0271 — `zonder_onzichtbaar_middenin()` en een derde CHECK op `profiles`
**Raakt:** domeinregel 3 (peer-goedkeuring is een autorisatiegrens), QS8-448,
QS8-450, QS8-451

---

## 1. Het gemeten geval

📏 Ná 0269, als gewone ingelogde gebruiker, via de gewone weg:

```
update public.profiles set display_name = U&'Ja\200Bn' where id = <eigen id>;
UPDATE 1
```

Vier tekens deden dat — ZWSP, BOM, soft hyphen en ZWNJ — en alle vier haalden
béíde CHECKs. Twee leden in dezelfde groep konden dus een **pixel-identieke**
naam dragen, zonder bidi en zonder homoglyph.

Waarom dat zwaarder weegt dan het klinkt: domeinregel 3 maakt peer-goedkeuring
een autorisatiegrens, en de lezer leidt uit de **naam** af wie hij autoriseert —
in de ledenlijst, in `openstaande_beoordelingen()` en in de groepschat.

## 2. Drie opties, en waarom het er één werd

Het issue legde drie richtingen voor en vroeg om eerst te meten.

**Optie 2 — een uniciteitseis per groep — is afgevallen, en dat is de
makkelijkste van de drie om fout te doen.** Zij verbiedt dat twee leden dezelfde
zichtbare naam dragen, en daarmee verbiedt zij **twee echte mensen die allebei
Jan heten in één groep**. Dat is geen randgeval maar een gewone situatie, en een
regel die hem weigert is erger dan het gat dat hij dicht.

**Optie 3 — een tweede signaal naast de naam — is al grotendeels gebouwd, en
precies daarom niet genoeg.** 📏 Gemeten: `openstaande_beoordelingen()` geeft
`owner_avatar` al terug (0125) en `app/beoordelen.tsx` rendert
`<Avatar name={item.owner_name} url={item.owner_avatar} />`. Maar `Avatar` valt
bij een ontbrekende `url` terug op **initialen uit de naam**, dus twee "Jan"s
zonder foto tonen allebei een "J". Het tweede signaal is er dus alleen voor wie
een foto heeft geüpload, en dat is geen grendel.

**Optie 1, geschaald, is wat er gebouwd is.** De grens hoort in de database
(CLAUDE.md, en het issue zegt het zelf), en dit is de enige van de drie die daar
kán staan: geen enkele policy dwingt af dat een scherm een avatar tekent.

## 3. De scheidslijn is nul pixels, en de lijst is afgeleid

⚠️ **De voor de hand liggende reparatie is de verkeerde**, en het issue
waarschuwde daar terecht voor: de randenlijst van 0256 met een `g`-vlag
toepassen. Die lijst bevat de **spatie**, en dan wordt `Jan de Vries` gewoon
`JandeVries`. Ze bevat ook `U+200D`, de lijm in `👨‍👩‍👧‍👦`.

De bruikbare vraag is niet *"is dit onzichtbaar"* maar **"rendert dit als nul
pixels"**. Een spatie is onzichtbaar en tóch betekenisvol: hij scheidt.

⚠️⚠️ **De eerste versie beantwoordde die vraag met een eigen opsomming, en dat
was fout — met een factor.** 📏 Gemeten in de security-review op dit issue: die
lijst dekte **146** van de **4174** codepunten die Unicode zelf
`Default_Ignorable_Code_Point` noemt. De overige **4028** overleefden midden in
een naam. Negen van de tien geteste gevallen landden via PostgREST als een naam
van vier codepunten die als `Jan` rendert: `U+034F`, `U+FE00`, `U+2065`,
`U+FFF0`, `U+1D173`, `U+180E`, `U+180F`, `U+E0100` en `U+200E`.

**De lijst komt daarom uit de property en niet uit het hoofd:**

> `Default_Ignorable_Code_Point` ∪ {C0/C1-stuurtekens, interlinear annotation}
> **min acht benoemde uitzonderingen**

⚠️ **En hij faalt de goede kant op.** Een nieuwe Unicode-versie voegt codepunten
aan de property toe; die vallen dan **dicht**, en `src/shared/tekst/index.test.ts`
rekent de property elke run opnieuw uit en wordt rood zodat iemand ernaar kijkt.
Een eigen opsomming laat ze stil open — precies wat hier gebeurd was.

⚠️ **De property lost bovendien de scheidslijn gratis op.** 📏 `U+0020`,
`U+00A0` en `U+2800` (de lege braillecel, die breedte heeft) zijn géén
`Default_Ignorable`. Ze vallen er dus vanzelf buiten, in plaats van dat iemand
eraan moet denken. De handgeschreven versie had `U+2800` er wél in staan, met een
reden die de eigen scheidslijn tegensprak.

### De acht uitzonderingen

Elk breekt een echte naam als hij zou meedoen. Ze staan met hun reden in
`src/shared/tekst/index.test.ts`, want dát is het stuk dat een mens beslist.

| teken | waarom het blijft |
|---|---|
| `U+200D` (ZWJ) | de lijm in `👨‍👩‍👧‍👦` |
| `U+200C` (ZWNJ) | orthografisch verplicht in het Perzisch, Hindi en Bengaals |
| `U+034F` (CGJ) | scheidt grafeemclusters voor sortering, tussen letters |
| `U+061C`, `U+200E`, `U+200F` | richtingsmarkeringen, legitiem in een naam die schriften mengt |
| `U+180B`–`U+180F` | Mongoolse variatieselectors, MVS en FVS4 |
| `U+FE00`–`U+FE0F` | variatieselectors, waaronder VS16 voor emoji-presentatie |
| `U+E0020`–`U+E007F` | tags — de subdivisievlaggen 🏴 |
| `U+E0100`–`U+E01EF` | ideographic variation selectors, voor Japanse namen |

⚠️⚠️ **De tags stonden er in de eerste versie wél in, en dat brak de Schotse,
Welshe en Engelse vlag.** 🏴 is `U+1F3F4` plus zes tagtekens; 📏 gemeten werden
dat er één. Dat is woordelijk dezelfde schade als het uiteenvallen van
`👨‍👩‍👧‍👦` — aan een emoji die in de eerste redenering niet voorkwam, terwijl
die redenering drie alinea's aan het gezin besteedde. **Een uitzonderingslijst
beschermt wat je bedacht hebt; de gevallen die je niet bedacht hebt, breekt hij.**

## 4. Wat er níet gesloten is, en waarom dat een besluit is

⚠️⚠️ Drie dingen blijven staan, en ze renderen alle drie als nul pixels:

1. **`U+200C` en `U+200D`** — `Ja<ZWNJ>n` rendert nog steeds als `Jan`. Weghalen
   breekt het Perzisch en de gezinsemoji.
2. **`U+034F` (CGJ)** — zelfde verhaal, tussen letters.
3. **Een tag áán de rand van een naam.** 📏 Gemeten en belangrijk om goed toe te
   schrijven: `schone_naam()` strijkt `U+E0000`–`U+E007F` aan de randen weg via
   `ONZICHTBARE_BEREIKEN`, dus een naam die op 🏴 **eindigt** verliest zijn vlag.
   Dat is **ouder dan dit issue** — de versie van 0269 doet het net zo hard
   (7 codepunten in, 1 uit) — en het staat los van wat hier gebouwd is. Een vlag
   **midden** in een naam blijft sinds deze migratie wél heel.

Acceptatiecriterium 2 van QS8-495 zegt met zoveel woorden dat de must-allow
zwaarder weegt dan de weigering, en dat is bij alle drie de reden.

Wat ervoor nodig is, is een **contextregel** — "weg tussen twee ASCII-letters",
"tags alleen ná `U+1F3F4`" — en die past niet in de vorm die de naadtest
vergelijkt: die legt SQL en TypeScript **codepunt voor codepunt** naast elkaar,
los van hun buren. Een contextregel vraagt dus zowel een andere implementatie als
een ander soort toets. Dat is **QS8-499**.

Het staat als toets in `tests/rls/een-naam-rendert-niet-als-een-andere.test.ts`,
met de reden erbij — zodat het een besluit blijft en geen vergeetpost. Dat is
precies de vorm die QS8-495 zelf opleverde: een assertie die een gat
dichtspijkert alsof het besloten is, is duurder dan geen assertie.

## 5. De functie aanpassen was niet de reparatie

⚠️⚠️ **Dit is de belangrijkste les van dit issue en hij kwam pas boven toen de
belofte-toets draaide.** De eerste versie van 0271 herdefinieerde alleen
`schone_naam()`. In `psql` deed die daarna exact wat ze moest doen, en de naadtest
tussen SQL en TypeScript was groen op **225** codepunten.

En `Ja​n` landde nog steeds ongehinderd via PostgREST.

📏 De reden: er is **geen trigger** op `profiles` die de naam normaliseert —
`pg_trigger` geeft er vier en geen ervan raakt `display_name`. Wat een
schrijfactie tegenhoudt zijn de CHECKs, en die **weigeren**; ze normaliseren niet.
`schone_naam()` wordt door `profiles_display_name_zichtbaar` alleen gebruikt om te
vragen *"blijft er iets over"*, en dat is waar voor `Ja​n`.

Dat is onwrikbare regel 18 in zijn zuiverste vorm: **elk onderdeel klopte en het
geheel lekte.** De toets die het vond stuurt de naam door de eigen deur van de app
in plaats van de functie aan te roepen.

De reparatie is een derde CHECK, `profiles_display_name_geen_onzichtbaar_middenin`,
met dezelfde vorm als `..._geen_bidi`: **weigeren en niet normaliseren**. Dat
hindert niemand, want `profielSchema` doet `.transform(schoneNaam)` vóór het
versturen — wie deze grens raakt, stuurt buiten de app om.

## 6. Ijkingen, en de helft ervan loog in de eerste ronde

📏 Mutatie per grendel, 14-09-2026, ná de security-review:

| IJKING | Gebroken | Wat er omviel |
|---|---|---|
| A | de CHECK `profiles_display_name_geen_onzichtbaar_middenin` | 4 — élke must-deny in de belofte-toets |
| B | de tags terug in `MIDDENIN_BEREIKEN` (`[0xe0000, 0xe007f]`) | 3 — de afleidingstoets, de uitzonderingstoets en de vlag-must-allow |
| C | één codepunt uit de lijst (`U+200B`) | 1 — de afleidingstoets |
| D | de middenin-stap uit `schone_naam()` | 2 — de naadtoets, aan beide kanten |

⚠️ **C is de toets die er in de eerste ronde niet was, en juist die had de fout
gevonden.** `src/shared/tekst/index.test.ts` rekent
`Default_Ignorable_Code_Point` elke run opnieuw uit en legt hem naast de
ingecheckte lijst. Daarmee is "de lijst is compleet" geen bewering meer maar een
meting — en een nieuwe Unicode-versie wordt rood in plaats van stil.

### Wat er in de eerste ronde misging, en dat is het opschrijven waard

📏 De eerste ronde had vier ijkingen en ze bevestigden allemaal iets wat niet
waar was.

**Twee vielen niet om.** De must-allow-toetsen schreven via PostgREST en lazen
terug, dus ze bevroegen uitsluitend de **SQL**-kant; de mutatie zat in
**TypeScript**. De naadtoets vángt zo'n divergentie wel, maar dat is een andere
toets in een ander bestand, en haar melding zegt *"SQL en TS zijn het oneens"* en
niet *"het gezin viel uit elkaar"*. Gerepareerd door elke must-allow aan **béíde**
kanten te vragen.

⚠️⚠️ **En de twee die wél omvielen, bewezen te weinig.** Ze toetsten dat de vier
gemeten tekens dicht waren, en daaruit las ik "drie van de vier dicht, ZWNJ is de
rest". 📏 De security-review mat er **4028** die nog open stonden. Een ijking
bevestigt dat je grendel doet wat je dácht; hij zegt niets over de vraag of je
grendel de goede klasse afdekt. **Daarvoor is een toets nodig die de klasse zélf
uitrekent**, en die ontbrak.

⚠️ Dat is dezelfde vorm als waar dit project vaker aan betaald heeft: een
controle die zijn eigen gevallenlijst gebruikt als definitie van volledigheid.
Zie ook de ijking van `rls:dekking` in QS8-411.
