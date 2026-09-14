# Onzichtbaar in het midden: nul pixels tegenover witruimte

**Datum:** 14-09-2026
**Issue:** QS8-495 (gevonden in de security-review op QS8-450)
**Migratie:** 0270 — `zonder_onzichtbaar_middenin()` en een derde CHECK op `profiles`
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

## 3. De scheidslijn is nul pixels, niet onzichtbaarheid

⚠️ **De voor de hand liggende reparatie is de verkeerde**, en het issue
waarschuwde daar terecht voor: de randenlijst van 0256 met een `g`-vlag
toepassen. Die lijst bevat de **spatie**, en dan wordt `Jan de Vries` gewoon
`JandeVries`. Ze bevat ook `U+200D`, de lijm in `👨‍👩‍👧‍👦`.

De bruikbare vraag is niet *"is dit onzichtbaar"* maar **"rendert dit als nul
pixels, en heeft een schrift het nodig"**. Een spatie is onzichtbaar en tóch
betekenisvol: hij scheidt. Wat daar niet onder valt, scheidt niet en bindt niet —
het is er gewoon niet, en dan is `Ja<X>n` niet van `Jan` te onderscheiden.

Dat leverde een **derde lijst** op, `MIDDENIN_BEREIKEN`, en dat is dezelfde vorm
als waarom `BIDI_BEREIKEN` een tweede was:

| lijst | vraag | waar toegepast |
|---|---|---|
| `ONZICHTBARE_BEREIKEN` | rendert dit als niets **aan de rand**? | alleen de randen |
| `BIDI_BEREIKEN` | keert dit de tekens eromheen óm? | overal |
| `MIDDENIN_BEREIKEN` | rendert dit als **nul pixels**, en heeft geen schrift het nodig? | overal |

Wat er met reden blijft staan, elk met een eigen reden en niet als restpost: de
spaties, de emoji-lijm `U+200D`, de orthografisch verplichte `U+200C`, de
combining grapheme joiner, de richtingsmarkeringen, en de schriftgebonden tekens
voor Khmer en Mongools.

## 4. Wat er níet gesloten is, en waarom dat een besluit is

⚠️⚠️ **`Ja<ZWNJ>n` komt er nog steeds door.** Van de vier gemeten gevallen
sluit 0270 er **drie**; ZWNJ en ZWJ blijven, omdat ze weghalen het Perzisch en de
gezinsemoji breekt. Acceptatiecriterium 2 van QS8-495 zegt met zoveel woorden dat
de must-allow hier zwaarder weegt dan de weigering.

Wat er voor nodig zou zijn is een **contextregel** — "weg tussen twee
ASCII-letters" — en die past niet in de vorm die de naadtest vergelijkt: die legt
SQL en TypeScript **codepunt voor codepunt** naast elkaar, los van hun buren. Een
contextregel vraagt dus zowel een andere implementatie als een ander soort toets,
en dat is een eigen issue.

Het staat als toets in `tests/rls/een-naam-rendert-niet-als-een-andere.test.ts`,
met de reden erbij — zodat het een besluit blijft en geen vergeetpost. Dat is
precies de vorm die QS8-495 zelf opleverde: een assertie die een gat dichtspijkert
alsof het besloten is, is duurder dan geen assertie.

## 5. De functie aanpassen was niet de reparatie

⚠️⚠️ **Dit is de belangrijkste les van dit issue en hij kwam pas boven toen de
belofte-toets draaide.** De eerste versie van 0270 herdefinieerde alleen
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

## 6. Vier ijkingen, en twee ervan logen eerst

📏 Mutatie per grendel, 14-09-2026:

| IJKING | Gebroken | Wat er omviel |
|---|---|---|
| A | de CHECK `profiles_display_name_geen_onzichtbaar_middenin` | 3 — élke must-deny in de belofte-toets |
| B | `[0x200b, 0x200b]` → `[0x200b, 0x200d]` (de reparatie die het erger maakt) | 3 — de gezinsemoji, het Perzisch, en de open-rest-toets |
| C | de middenin-stap uit `schone_naam()` | 2 — de naadtoets, aan beide kanten |
| D | de spatie mee in `MIDDENIN_BEREIKEN` | 1 — `Jan de Vries` |

⚠️⚠️ **B en D vielen bij de eerste ijking níet om, en dat was een fout in de
toetsen.** Ze schreven via PostgREST en lazen terug, dus ze bevroegen uitsluitend
de **SQL**-kant; de mutatie zat in **TypeScript**. De naadtoets vángt zo'n
divergentie wel — 📏 met de spatie erbij vielen daar vier toetsen om — maar dat
is een andere toets in een ander bestand, en haar melding zegt *"SQL en TS zijn
het oneens"* en niet *"het gezin viel uit elkaar"*.

Gerepareerd door elke must-allow aan **béíde** kanten te vragen: een
`schoneNaam()`-assertie naast de schrijfactie. Daarna bijten alle vier.

⚠️ **Dit is waarom een ijking per grendel moet en waarom je kijkt wélke toets
omvalt.** Was ik gestopt bij "er werd iets rood", dan stonden er twee
calibratienotities in dit bestand die niet waar zijn — en die lezen daarna als
bewijs.
