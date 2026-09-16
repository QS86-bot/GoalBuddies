# Een scope die je erft, erf je met zijn criterium

**16-09-2026 — QS8-506, migratie 0283.** Beslisdocument bij het uitrollen van de
nul-pixelregel over dertien groepszichtbare tekstkolommen.

---

## 1. Wat er gebouwd is

Migratie 0271 (QS8-495) weigert een teken dat als **nul pixels** rendert midden
in een tekst; 0282 (QS8-499) voegt daar een **contextregel** aan toe voor de acht
uitzonderingen die 0271 met reden overslaat. Allebei stonden op één kolom:
`profiles.display_name`.

0283 zet de nul-pixelregel op dertien kolommen en de contextregel op één daarvan
erbij:

| regel | waar | onderbouwing |
|---|---|---|
| nul-pixel (0271) | alle dertien | *een teken dat als nul pixels rendert is nooit inhoud* — dat geldt voor élke tekst |
| contextregel (0282) | alleen `groups.name` | *de lezer leidt hieruit af wíe of wát hij kiest* — domeinregel 3 |

De prijs van die tweede regel is dat hij tekens strijkt die een gebruiker uit Word
of een PDF plakt. Bij een naam van 80 tekens is dat te overzien; bij een
omschrijving van 2000 tekens is het een formulier dat vastloopt op tekst waar
niets aan te zien is. Vandaar dat hij op proza niet meegaat — met de residu-rij
in `docs/ENGINEER-REVIEW.md` als prijskaartje, niet als omissie.

## 2. De fout die dit issue bijna gemaakt had

Het issue zegt in zijn eigen beschrijving dat de bidi-uitrol
(QS8-450 → 494 → 498 → 501) de CHECK legde op *"elke groepszichtbare
tekstkolom"*, en noemt daarna dertien kolommen. Dat leest als: *de dertien zijn
de groepszichtbare tekstkolommen.*

📏 Nagemeten op de draaiende database met `pg_constraint` plus
`information_schema.column_privileges`: dat klopt niet.

```
milestones.title        SELECT-grant voor `authenticated`: ja
milestones.description  idem
milestones_select       owner_id = auth.uid() OR shares_group_with_goal(g.id)
bidi-CHECK: geen        nul-pixel-CHECK: geen
```

Een groepsgenoot leest andermans mijlpaaltitels via `GET /rest/v1/milestones`, en
die twee kolommen dragen geen van beide regels.

**De dertien zijn de oogst van een ánder criterium.** 0274 §4a schrijft het uit:
*tekst die iemand leest vlak vóór een handeling die iets toestaat.* Dat is smaller
dan "groepszichtbaar" en het overlapt er alleen mee. Bij een mijlpaal hoort geen
knop die iets toestaat, dus `milestones` viel erbuiten — zonder dat iemand hem
hoefde af te wijzen, en dus ook zonder dat hij in een afvallerslijst belandde.

## 3. De les, en waarom hij niet "beter opletten" is

`docs/decisions/2026-09-15-de-scope-van-een-grendel-is-zelf-een-bewering.md`
waarschuwt dat een scopetabel gelezen wordt als *"dit is nagegaan"* in plaats van
*"nagegaan langs dít criterium"*. Wat hier gebeurde is de volgende stap:

> **Een scope die je erft van een vorige regel, erf je met het criterium van die
> regel — ook als jouw eigen onderbouwing een andere reikwijdte heeft.**

De nul-pixelregel hangt niet aan een knop. Zijn eigen onderbouwing dekt élke
tekst. Maar de kolommenlijst kwam kant-en-klaar uit de bidi-uitrol, en een
kant-en-klare lijst nodigt niet uit tot de vraag *"langs welk criterium is deze
lijst ontstaan, en is dat het mijne?"*.

⚠️ **Het gevaarlijke is dat het werk er áf uitziet.** Dertien kolommen, dertien
CHECKs, een groene suite. Niets is er rood van geworden, en er was ook niets dat
rood kón worden: er is geen controle die *"is deze scope het juiste antwoord op
mijn criterium"* toetst, en dat is ook geen controle die te schrijven valt. Het is
handwerk, net als vraag 5 van onwrikbare regel 18.

**Wat er wél uit volgt, is te doen:** noem het criterium waar de scope uit komt,
en meet na wat er langs jouw eigen criterium bij hoort maar er niet in zit. 0283
doet dat in zijn kop; wat eruit kwam staat als **QS8-507**, met de meting erin.
Het gat gaat níét stilzwijgend mee in deze migratie — dan zou dit bestand twee
criteria door elkaar halen, precies de fout die het beschrijft.

## 4. De naad die dit issue erbij zet

De bestaande naadtest (`tests/rls/naamnormalisatie.test.ts`) legt één SQL-functie
naast één TypeScript-functie. QS8-506 maakt de naad **samengesteld**, en dat is een
andere vraag:

```
client:    zonderNulPixels(x) = zonderOnzichtbaarMiddenin(zonderBidi(x))
database:  x = zonder_bidi(x)  ÉN  x = zonder_onzichtbaar_middenin(x)
```

De client ketent twee bewerkingen; de database toetst twee **onafhankelijke**
uitspraken over de opgeslagen waarde. Twee functies die elk perfect spiegelen,
kunnen als samenstelling alsnog een waarde opleveren die de database weigert — en
dan ziet de gebruiker `opslaan mislukt` op tekst die de app zojuist zélf heeft
schoongemaakt. Dat is precies de storing die deze migratie belooft niet te maken,
en er stond geen enkele toets op.

`tests/rls/nulpixelkolommen.test.ts` vraagt dus niet *"bestaat er een CHECK"* —
dat is een eigenschap van het onderdeel en blijft groen terwijl de belofte breekt
— maar: *is er een invoer waarvoor de uitkomst van de client door de database
geweigerd wordt?* Een veeg over het hele codepuntbereik, want de hazard zit per
definitie in codepunten waar de ene stap de context van de andere verandert, en
welke dat zijn is precies wat je niet vooraf weet.

⚠️ **Met een tweede toets eronder die hem betekenis geeft.** Zou de database in
die context níéts weigeren, dan is *"de client levert niets geweigerds op"* waar
om de verkeerde reden, en blijft hij groen zodra iemand de CHECK sloopt. Dat is
regel 18 vraag 3, en hij is apart geijkt.

## 5. De ijking — vijf grendels, vijf mutaties

⚠️ **Mutatie per grendel, en kijken wélke toets omvalt** (de les van QS8-412).

| # | mutatie | rood geworden | alleen die? |
|---|---|---|---|
| 1 | `zonderNulPixels` laat de middenin-stap weg | *weigert geen enkele uitkomst* — 3860+ codepunten, bij naam genoemd | ja |
| 2 | de databasekant van de veeg toetst niets meer | *de database weigert in deze context wél degelijk iets* | ja |
| 3 | `groups_icon_geen_nul_pixels` gedropt | *elk van de dertien noemt beide regels* — meldt `groups.icon bidi -` | ja |
| 4 | `zonderNulPixels` strijkt de ZWJ óók weg | *laat 'gezinsemoji' heel op de client* | ja |
| 5 | `zonder_onzichtbaar_middenin()` strijkt de ZWJ weg | *de database neemt ze alle vijf aan* **én** grendel 1 | nee — en dat klopt |

⚠️ Dat vijfde geval is geen ruis maar bevestiging: strijkt de database méér dan de
client, dan is de uitkomst van de client per definitie onaanvaardbaar. Grendel 1
vangt divergentie in **beide** richtingen, en dat is meer dan hij belooft.

⚠️ **Mutatie 5 is afgeleid uit `pg_get_functiondef()` en niet overgetypt.** Bij
QS8-499 zijn twee ijkingen ongeldig gebleken doordat de functie met de hand
nagetypt werd en daarbij stilletjes elf bereiken verloor: allebei werden ze rood,
en allebei bewezen ze niets. Hier is de gedeployde definitie opgehaald, is er één
teken aan de tekenklasse toegevoegd (`\200B` → `\200B\200D`), en is het verschil
als diff nagekeken vóór het draaien.

## 5a. Wat de security-review vond, en waarom het dezelfde fout tweemaal was

Drie bevindingen, alle drie zelf nagemeten voordat ze verwerkt zijn, en alle drie
niet in de CHECKs maar in de **client-spiegel** — de helft waarvan de migratiekop
zegt dat hij *"in dezelfde wijziging meegaat of de CHECKs gaan niet"*.

### K1 — `completions.note` heeft twee schrijfroutes en één was gespiegeld

`rondAf()` gaat langs `afrondSchema`. `dienOpnieuwIn()` — opnieuw indienen nadat
een buddy om meer uitleg vroeg — gaat langs **geen enkel schema** en deed alleen
`.trim()`.

📏 Nagemeten: `dien_opnieuw_in()` doet zelf `nullif(btrim(coalesce(p_note,'')),'')`
en `btrim` haalt een `U+200B` niet weg, dus
`completions_note_geen_nul_pixels` weigert met `23514`. De exception-handler van
die RPC herkent die melding op geen van zijn twee patronen, dus de gebruiker
krijgt `opnieuw.mislukt` — en kan zijn week met diezelfde geplakte tekst nooit
meer opnieuw indienen. Aan die tekst is niets te zien en hij kan het zelf niet
oplossen.

⚠️ **Dit is onwrikbare regel 18 vraag 5 in zuivere vorm.** De CHECK klopte,
`afrondSchema` klopte, de RPC klopte — en de keten liep op één van de twee paden
dood. 435 unit-tests en de nieuwe naadtest waren groen; geen enkele raakte het.
De toets staat nu in `src/modules/completions/notitie-routes.test.ts` en legt de
twee routes naast elkáár in plaats van naast een verwachting die de toets zelf
verzint.

⚠️ **En dit is dezelfde vorm als `vraagLidmaatschapAan()` in deze wijziging, waar
hij wél gevonden werd.** Daar was de aanleiding dat de kolom géén schema had —
dat valt op. Hier had de kolom er wél een, en dat is precies waarom het níet
opviel: *"dit veld gaat langs een schema"* is waar over de kolom en onwaar over de
route. **Een schema hoort bij een formulier en niet bij een kolom.**

### M1 — `.trim()` stond vóór `.transform()`

📏 Nagemeten, drie keer met de hand:

```
doelSchema, titel `<ZWSP>␣␣␣<ZWSP>`      → aanvaard als `'␣␣␣'`
doelSchema, titel `<ZWSP>␣␣Hardlopen␣␣<ZWSP>` → aanvaard als `'␣␣Hardlopen␣␣'`
deadlineVerzoekSchema, `<ZWSP>␣␣␣` + 17 letters + `<ZWSP>`
                                          → aanvaard als 20 codepunten,
                                            terwijl `char_length(btrim(…))` er 17 telt
```

`zonderNulPixels()` raakt de randen met opzet niet aan — hij is de exacte spiegel
van de CHECK, en die zegt niets over randen. `String.prototype.trim()` ziet een
`U+200B` niet als witruimte, dus witruimte die eráchter schuilging kwam ná het
strijken weer tevoorschijn, en er trimde daarna niets meer. Gevolg: een
groepszichtbare doeltitel van drie spaties, en een deadline-formulier dat
goedkeurt wat de server daarna weigert.

`schoneVrijeTekst()` doet de volgorde nu op één plek. ⚠️ **Eén functie en geen
acht keer `.transform((v) => …)`**: dit is precies het soort volgorde dat op de
negende plek weer omdraait, en dan is er één veld dat het anders doet en niets dat
er rood van wordt.

### L1 — de naadtest dekte `groups.name` niet

Die kolom heeft een ándere spiegel (`schoneNaam()`) en draagt sinds 0283 **vier**
tekst-CHECKs in plaats van twee. De veeg keek naar twee, met
`zonderNulPixels()`. 📏 Het klópte vandaag — nul weigeringen over het hele bereik
— maar het was onbewaakt, en de ijking laat zien wat dat waard is: met de
verkeerde spiegel komen er **96** codepunten uit, het hele tag-blok
`U+E0020`–`U+E007F`.

⚠️ De les is smal en scherp: **een kolom met een eigen spiegel heeft een eigen
veeg nodig.** Een naadtest die "de client" als één ding behandelt, toetst de
kolom met de meeste grendels het minst.

### Wat deze drie samen zeggen

Alle drie zitten in de helft die geen CHECK is, en alle drie zijn onzichtbaar voor
een suite die per onderdeel toetst. Dat is niet toeval: de database-helft is één
uitspraak op één plek en dus makkelijk na te lopen, terwijl de client-helft zoveel
plekken heeft als er schrijfroutes zijn — en hoeveel dat er zijn, is precies wat
niemand bijhoudt.

## 6. Wat er bewust níét in zit

- **De contextregel op proza.** Zie §1; de prijs staat als rij in
  `docs/ENGINEER-REVIEW.md`, met de voorwaarde waaronder hij zwaarder wordt.
- **`milestones` en de bredere ring.** QS8-507, zie §2.
- **Een client-transform op `groups.icon`.** 📏 De app schrijft die kolom nergens
  — `from('groups')` komt drie keer voor in `src/` en geen ervan zet `icon`. De
  CHECK staat er wél, want de kolom draagt een INSERT- én UPDATE-grant voor
  `authenticated`. Komt er ooit een icoonveld, dan hoort de client er meteen bij.
- **`chat_messages.body`.** Een bericht is een onveranderlijke kopie
  (beslisdocument 002 §3) en de tabel zit in de realtime-publicatie. Een CHECK
  daarop verdient zijn eigen afweging en is geen bijvangst hier.
- **De grendel *"er blijft iets zichtbaars over"*.** `profiles` draagt
  `profiles_display_name_zichtbaar`; geen van de dertien heeft een equivalent, en
  daardoor neemt de database een titel van drie spaties langs PostgREST nog
  gewoon aan. Dat is een ándere regel dan de nul-pixelregel, en hem hier
  meenemen zou de criteriumverwarring uit §2 herhalen. Staat als rij in
  `docs/ENGINEER-REVIEW.md`.

## 7. Eén productwijziging die genoemd hoort te worden

De acht velden gingen van `.min(n)`/`.max(n)` naar
`.refine(telTekens(v) >= n)`/`.refine(telTekens(v) <= n)`. Dat is geen
opsmuk: Zod telt UTF-16-eenheden en `char_length` telt codepunten, en dit is de
eenheid die de database gebruikt.

📏 De gevolgen lopen twee kanten op, en allebei zijn ze gewenst:

- **De bovengrens is rúímer geworden**, en dat is een reparatie: 200 emoji werden
  door `.max(200)` geweigerd terwijl de database ze aannam.
- **De ondergrens is voor astrale tekens strénger geworden**: een titel van twee
  emoji telde als vier en telt nu als twee. De richting is veilig — de client is
  strenger dan de database, nooit andersom — en het is de klasse die
  `docs/decisions/2026-08-28-tekst-zonder-grens.md` beschrijft.
