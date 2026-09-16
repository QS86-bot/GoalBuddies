# De plek is het probleem, en niet het teken

**Datum:** 16-09-2026
**Issue:** QS8-499
**Migratie:** 0282
**Raakt:** domeinregel 3 (peer-goedkeuring is een autorisatiegrens), QS8-448 → QS8-450 → QS8-495

## De vraag

0271 (QS8-495) weigert alles wat Unicode `Default_Ignorable_Code_Point` noemt,
plus de C0/C1-stuurtekens en de interlinear annotation, **min acht benoemde
uitzonderingen**. Die acht renderen óók als nul pixels.

📏 Gemeten ná 0271, als gewone ingelogde gebruiker via PostgREST:

```
Ja<U+200C>n  ->  4 codepunten, rendert als `Jan`
Ja<U+200D>n  ->  4 codepunten, rendert als `Jan`
Ja<U+034F>n  ->  4 codepunten, rendert als `Jan`
Ja<U+180E>n  ->  4 codepunten, rendert als `Jan`
```

Twee leden in dezelfde groep kunnen dus nog steeds een pixel-identieke naam
dragen, en domeinregel 3 zegt dat peer-goedkeuring een autorisatiegrens is: de
lezer leidt uit de náám af wie hij autoriseert.

## ⚠️⚠️ Waarom dit een andere soort regel vraagt dan 0269 en 0271

Die twee konden een **lijst** zijn omdat hun vraag per codepunt te beantwoorden
was: *keert dit teken de volgorde om* (0269), *rendert dit teken overal als nul
pixels* (0271). Een codepunt is dan genoeg om te oordelen.

Voor deze acht is dat niet zo:

> `U+200C` tussen twee ASCII-letters is een collisievector.
> Dezelfde `U+200C` tussen twee Perzische letters is orthografisch **verplicht**.

**Het teken is niet het probleem — de plek is het.** Een lijst kan dat verschil
per constructie niet uitdrukken, en dat is de reden dat QS8-495 dit deel
uitdrukkelijk heeft doorgeschoven in plaats van het erbij te doen.

## Het besluit: twee regels, want de acht delen geen patroon

Het issue vroeg of alle acht meegaan of alleen ZWNJ/ZWJ/CGJ. Het antwoord is
**alle acht, maar niet met dezelfde regel** — ze staan op twee verschillende
plekken in een naam.

### Zeven: weg tussen twee ASCII-alfanumerieken

`U+034F`, `U+061C`, `U+180B`–`U+180F`, `U+200C`–`U+200F`, `U+FE00`–`U+FE0F` en
`U+E0100`–`U+E01EF`.

De voorwaarde is: **één buurman is ASCII-alfanumeriek en de andere is ASCII**
(`U+0001`–`U+007F`), waarbij een rand als ASCII telt — aan het begin of eind van
een naam staat er geen schrift naast.

### ⚠️⚠️ Dat "één" is de reparatie uit de security-review, en het gat was het gewone geval

De eerste versie eiste aan **beide** kanten `[A-Za-z0-9]`. Een spatie is ASCII
maar geen alfanumeriek, dus hij blokkeerde de regel.

📏 Gemeten: van de **267** codepunten die de regel tussen twee letters weghaalt,
haalde hij er naast een spatie **nul** weg.

```
Ja<U+200C>n         ->  geweigerd       ✓ de regel werkt
Jan<U+200C> Jansen  ->  landt ongehinderd naast `Jan Jansen`
O<U+200C>'Brien     ->  landt ongehinderd naast `O'Brien`
```

`Jan Jansen` is de vorm van vrijwel elke echte naam, dus de regel deed op het
gemiddelde geval niets — terwijl het issue juist over dát geval gaat. De
naadtoetsen bleven er alle veertien groen onder, en dat is regel 18 vraag 3 in
zijn zuiverste vorm: **`CONTEXTEN` kende geen omgeving waar de regel zou moeten
vuren en het niet deed.** De vier omgevingen waren gekozen als *"één waar hij
vuurt plus drie must-allows"*; er staan er nu zes.

⚠️ **Waarom ASCII en niet "een schrift dat dit teken niet gebruikt".** Die tweede
is de correctere regel, en het issue noemt hem als optie. Hij vraagt
Unicode-scriptdata, en die heeft Postgres niet — er is geen `script(codepoint)`.
Hem in SQL nabouwen betekent een tabel met scriptbereiken onderhouden die per
Unicode-versie schuift, en dat is een afhankelijkheid met een eigen levensduur.

### ⚠️⚠️ "De twee verzamelingen raken elkaar niet" was onwaar

Hier stond: *ASCII is bewijsbaar veilig — geen enkel schrift dat ZWNJ, ZWJ, CGJ,
een richtingsmarkering, een variatieselector of een IVS nodig heeft, schrijft met
ASCII-letters. De regel kan dus geen enkele van de vier must-allows breken, niet
omdat het toevallig goed uitpakt, maar omdat de twee verzamelingen elkaar niet
raken.*

📏 De security-review mat het tegendeel: `c<U+034F>h` wordt `ch`. Dat is de
gedocumenteerde Slowaakse en Hongaarse digraafscheiding — `c<CGJ>h` tegenover
`ch`, en net zo `c<CGJ>s`, `d<CGJ>z`, `z<CGJ>s`. Twee ASCII-letters, aan beide
kanten. De regel raakt dus wél een legitiem gebruik.

**Het besluit blijft; de onderbouwing niet.** De CGJ rendert daar óók als nul
pixels, dus `ch` en `c<CGJ>h` zijn visueel identiek — en die collisie weegt
zwaarder dan een sorteerhint die geen lezer ziet. Wat de regel níet raakt zijn de
vier must-allows, en dat is met een veeg nagemeten in plaats van afgeleid.

⚠️ Dit hoort opgeschreven omdat dit project er zelf voor waarschuwt: *een
afwijking die je onderbouwt is duurder dan een die je vergeet.* Wie over een jaar
de grens wil verbreden, leest "de verzamelingen raken elkaar niet" en controleert
het niet na. Het is dezelfde klasse als de drie 📏-beweringen die de
security-review op QS8-494 in mijn documenten vond — code goed, onderbouwing
fout.

⚠️ **De prijs, en die staat in `docs/ENGINEER-REVIEW.md`:** `Ján<ZWNJ>ös`
ontsnapt, want `ö` is geen ASCII. De regel vangt het gemeten geval en niet de
hele klasse. Dat is een besluit en geen omissie.

⚠️ `[A-Za-z0-9]` en niet `\w`: die laatste is in Postgres locale-afhankelijk en
zou in een andere collatie letters met accenten kunnen meenemen. Dan schuift de
grens mee met een instelling in plaats van met een besluit.

### De tags: alleen geldig ná een `U+1F3F4`

🏴󠁧󠁢󠁳󠁣󠁴󠁿 is `U+1F3F4` plus zes tagtekens. Tussen twee letters kan een tag niets
betekenen; ná de vlagbasis is hij de vlag.

Eén `regexp_replace` met twee alternatieven doet het zonder lookbehind: de
eerste tak vangt een héle vlagreeks en zet hem terug via `\1`, de tweede vangt
een losse tag en vervangt hem door niets. De motor scant van links naar rechts,
dus een tag die bij een vlag hoort is al opgegeten voordat de tweede tak hem
ziet.

📏 Geijkt vóór het schrijven: de Schotse vlag houdt zijn **7** codepunten, en
`Jan` plus één losse tag wordt **3**.

### ⚠️ En dáárdoor kon de randenlijst versmallen

Dit is de helft van het issue die ouder is dan QS8-495. 📏 `schone_naam()`
strijkt `U+E0000`–`U+E007F` aan de **randen** weg, dus een naam die op 🏴󠁧󠁢󠁳󠁣󠁴󠁿
eindigde verloor zijn vlag — zeven codepunten in, één uit. De versie van 0269
doet dat net zo hard.

Nu een losse tag overal verdwijnt, hoeft de randstap hem niet meer te vangen:
`ONZICHTBARE_BEREIKEN` gaat van `0xE007F` naar `0xE001F`. Wat overblijft haalt
`zonderOnzichtbaarMiddenin()` toch al overal weg.

**Een tag aan de rand was dus niet met een extra regel op te lossen maar met één
minder** — zodra de vraag "hoort deze tag bij een vlag" ergens beantwoord werd.

### Weigeren, niet normaliseren

Consistent met 0269 en 0271: de eerlijke client normaliseert al met
`schoneNaam()`, dus wie deze grens raakt stuurt buiten de app om.

Twee CHECKs en niet één, zodat de melding zegt wélke regel hem tegenhoudt — de
les uit de security-ronde op QS8-450, waar bleek dat `23514` alleen *"een CHECK
weigerde dit"* zegt.

## ⚠️⚠️ SQL gebruikt lookbehind en TypeScript met opzet niet

De SQL-kant doet de contextregel met
`(?<=[A-Za-z0-9])[…]+(?=[A-Za-z0-9])`. 📏 Nagemeten dat Postgres lookbehind
ondersteunt, en dat de `g`-vlag daarmee óók opeenvolgende gevallen pakt:
`a<Z>b<Z>c<Z>d` wordt `abcd`. Zonder lookaround eet de eerste treffer zijn
rechterbuur op en mist het volgende geval zijn linkerbuur.

**De TypeScript-kant mag dat niet doen.** Hermes — de engine onder React
Native — kent lookbehind niet, en een regexliteral met `(?<=…)` valt daar bij
het **laden** om. Dat is een witte app, niet een foutmelding. De TS-kant is
daarom een lus over codepunten.

⚠️ Twee vormen mogen alleen verschillen zolang de naad bewijst dat ze hetzelfde
oordelen. Dat is precies wat hieronder veranderde.

## De naadtest moest meeveranderen, en dat stond vooraf opgeschreven

De sweeps van QS8-448 en QS8-495 bieden elk codepunt in precies één omgeving
aan: `'a' || chr(cp) || 'b'`. Zolang elke regel per codepunt te beantwoorden
was, volstond dat.

Een contextregel is daar per definitie niet mee te meten: een sweep in één
context blijft groen terwijl de twee talen het over de Perzische kant oneens
zijn. Er is nu een sweep over het hele codepuntbereik in **vier** omgevingen:

| omgeving | wat hij bewaakt |
|---|---|
| tussen ASCII-letters | hier moet de regel **vuren** |
| tussen Arabische letters | het Perzisch |
| tussen emoji | de gezinsemoji |
| ná de vlagbasis | de subdivisievlag |

### ⚠️⚠️ En die vier omgevingen maakten de suite te traag om te blijven bestaan

📏 Eén veeg over het hele codepuntbereik langs `schone_naam()` kost op de lokale
stack **74 s**. De oude vorm riep zijn veeg aan *ín* de toetsen, dus elke toets
die er een nodig had betaalde hem opnieuw. Met vier omgevingen erbij liep het
bestand zijn timeout van 300 s in — niet door één trage vraag, maar doordat
dezelfde vraag acht keer gesteld werd.

De reparatie is twee dingen, en geen van beide verandert wat er gemeten wordt:

1. **Eén meting voor het hele bestand**, in een `beforeAll`. De toetsen lezen
   daarna een verzameling in plaats van hem op te halen.
2. **De vijf vragen tegelijk**, elk in een eigen psql-proces —
   `psqlParallel()` in `tests/rls/psql-stack.ts`. 📏 Vier omgevingen achter
   elkaar: ~5 min. Dezelfde vier tegelijk: **74 s**. Het is processorwerk in
   aparte backends en deze bak heeft vier kernen, dus ze staan elkaar niet in de
   weg.

📏 Het hele bestand draait daarmee in **108 s**, op veertien toetsen.

⚠️ **Dit is geen optimalisatie maar een voorwaarde.** Een grendel die je leert
overslaan bewaakt niets — dezelfde afweging die `CLAUDE.md` bij regel 18 maakt.
Een naadtest die vijf minuten kost, is er een die iemand met `--exclude` uit de
poort haalt op de dag dat hij haast heeft, en dan is de belofte weg zonder dat
er een besluit over genomen is.

⚠️ **De randvraag is met opzet níet in de contextvraag opgegaan**, hoewel ze
vandaag hetzelfde antwoorden: voor één teken kan `schone_naam()` alleen wissen of
laten staan. Maar `= ''` vraagt *"telt dit als onzichtbare rand"* en
`<> chr(cp)` vraagt *"raakt de functie dit aan"*. De dag dat een stap iets
**vervangt** in plaats van wist, lopen die twee uiteen. Ze samenvoegen omdat het
antwoord nu toevallig gelijk is, is precies waar vraag 2 van regel 18 voor staat.

## ⚠️⚠️ De security-review was blokkerend, en allebei de gaten stonden in de ijking niet

Vijf ijkingen, alle vijf geslaagd, alle vijf op de grendel die ze noemden — en
tóch twee blokkerende bevindingen. Dat is de les van dit issue en hij is
ongemakkelijker dan de vorige.

### B1 — de regel deed niets op de gewone naam

De voorwaarde was *"beide buren `[A-Za-z0-9]`"*. Een spatie is ASCII maar geen
alfanumeriek.

📏 Gemeten met een veeg over het hele codepuntbereik, per omgeving:

| omgeving | codepunten die `schone_naam()` aanraakt |
|---|---|
| `a<cp>b` | 4241 |
| `Jan<cp> Jansen` | 4241 − **267** |
| `O<cp>'Brien` | 4241 − **267** |

267 is exact de hele `TUSSEN_LETTERS_BEREIKEN`. **Naast een spatie deed de regel
precies niets** — en `Jan Jansen` is de vorm van vrijwel elke echte naam. Het
aanvalsscenario is letterlijk dat waarvoor dit issue bestaat: Mallory zet haar
naam op `Jan<U+200C> Jansen`, en in de goedkeurlijst staan twee keer
`Jan Jansen`.

Gerepareerd: **één** buur alfanumeriek, de andere ASCII, met een rand die als
ASCII telt. 📏 Nagemeten, alle drie de omgevingen geven nu 4241, en geen van de
vijf must-allows sneuvelt.

### B2 — achter één 🏴 paste ~75 tekens onzichtbare tekst

De regel was *"een tag mag blijven als er een `U+1F3F4` vóór staat"* en toetste
de **vorm** van de reeks niet. 📏 `U+E0020`–`U+E007E` is een 1-op-1 afbeelding
van ASCII `0x20`–`0x7E`; binnen de grens van 80 codepunten past er achter één
zichtbare vlag dus ~75 tekens willekeurige onzichtbare tekst, in een
groepszichtbare kolom die als platte tekst in systeemberichten wordt ingebakken.
En `🏴` plus één sluittag rendert als de kále 🏴 — dus het was óók een
collisievector.

⚠️ **Aan de rand was het bovendien een regressie.** De randenlijst streek die
staart vóór deze migratie wél weg. De versmalling was nodig (zonder haar verliest
de Schotse vlag zijn staart), maar ze ging erdoor zónder dat de nieuwe regel de
vorm toetste: er ging méér open dan er dicht ging.

Gerepararerd met de vorm uit UTS #51 — basis, 2 t/m 6 vlagletters, sluiter.
📏 🏴󠁧󠁢󠁳󠁣󠁴󠁿, 🏴󠁧󠁢󠁷󠁬󠁳󠁿 en 🏴󠁧󠁢󠁥󠁮󠁧󠁿 houden alle drie hun zeven codepunten.

### ⚠️⚠️ Waarom de ijking dit niet ving, en wat dat zegt

**`CONTEXTEN` kende geen omgeving waar de regel zou moeten vuren en het niet
deed.** De vier omgevingen waren gekozen als *"één waar hij vuurt plus drie
must-allows"* — een indeling die klopt en die precies één soort fout niet kan
zien: een regel die te smal is.

Een ijking toetst of een grendel bíjt als je hem breekt. Ze zegt niets over of de
grendel op de goede plek zit. **Alle vijf de ijkingen waren geldig en de belofte
was toch te smal**, en dat is een andere vraag dan de vijf die regel 18 stelt —
die gaan over of de toets de belofte bewaakt, niet over of de belófte klopt.

Wat wél had gewerkt is de vraag die de security-review stelt en die geen script
stelt: *lees de regel als aanvaller en zoek de invoer waar hij niet vuurt.* Er
staan nu zes omgevingen, en de twee nieuwe zijn precies die invoer.

## De ijking — en de twee ijkingen die ongeldig bleken

`CLAUDE.md` bij regel 18: *breek de grendel die de ijking nóemt, niet zomaar
iets*, **mutatie per grendel**, en *kijk wélke toets omvalt*. Elke mutatie is op
de lokale stack gezet, de twee bestanden zijn gedraaid, en daarna is alles
teruggezet.

| ijking | wat er gebroken is | wat er rood werd |
|---|---|---|
| **E2** | stap 4 uit `schone_naam()` | 6 — de middenveeg in beide richtingen, het getal 4241, het ASCII-geval, allebei de contextveegtoetsen, en de volgorde-naad |
| **F** | de lookaround uit `zonder_onzichtbaar_tussen_letters()`, zodat hij overal wist | 9 — waaronder de Perzische must-allow en de gezinsemoji, allebei end-to-end |
| **G** | de vlagtak uit `zonder_losse_tags()`, zodat elke tag wist | 3 — de contextveeg, de contextverschillen, en de subdivisievlag end-to-end |
| **H2** | de randenlijst terug van `U+E001F` naar `U+E007F` | eerst 2 — allebei de contextveegtoetsen, en géén enkele end-to-end-toets. Ná de verhuizing hieronder 3, inclusief de toets die criterium 2 draagt |
| **J** | allebei de nieuwe CHECKs gedropt | 2 — precies de twee end-to-end-weigeringen, en geen enkele naadtoets |

⚠️ **J is de belangrijkste van de vijf en het minst vanzelfsprekende.** Hij laat
zien dat de naadtoetsen en de belofte-toetsen **verschillende** dingen bewaken:
met de functies intact en de CHECKs weg blijft elke veeg groen, want de twee
talen zijn het nog steeds eens — ze worden alleen nergens meer afgedwongen. Dat
is de vorm van QS8-448 nog een keer, en de reden dat er twee bestanden zijn.

### ⚠️⚠️ H2 liet zien dat acceptatiecriterium 2 op de verkeerde plek getoetst stond

📏 De randenlijst verbreden liet `laat een subdivisievlag heel` in
`tests/rls/een-naam-rendert-niet-als-een-andere.test.ts` **groen** — de toets die
in de lijst van acceptatiecriteria het dichtst bij criterium 2 staat.

De reden is dat geen enkele CHECK **gelijkheid** met `schone_naam()` eist. Er is
er wel één die hem aanroept — `profiles_display_name_zichtbaar`, met
`schone_naam(display_name) <> ''` — maar die vraagt alleen *"blijft er iets
over"*, en dat blijft het bij een naam die zijn vlagstaart kwijtraakt. De
randstap zelf woont in de aanmeldtrigger en in de client, niet in een constraint.

Een rechtstreekse `PATCH /rest/v1/profiles` wordt dus niet genormaliseerd, en die
end-to-end-toets zegt in werkelijkheid *"geen CHECK weigert een naam die op een
vlag eindigt"*. Dat is waar, en het is niet wat criterium 2 vraagt.

De assertie voor criterium 2 staat nu in `tests/rls/naamnormalisatie.test.ts`,
waar `schone_naam()` rechtstreeks wordt aangeroepen. 📏 Dezelfde ijking daarna
herhaald: H2 maakt die toets wél rood. De end-to-end-toets is ter plekke
bijgeschreven met wat hij écht bewijst.

⚠️ **Dit is vraag 4 van regel 18:** *grijpt deze test naar de belofte, of naar een
plek?* Hij greep naar een plek waar de belofte toevallig niet langskomt. Zonder
de ijking was dat niet op te merken — de toets was groen, de code was goed, en de
grendel zat ergens anders dan waar hij beweerde te zitten.

### ⚠️⚠️ Twee ijkingen mutéerden meer dan ze noemden, en die zijn weggegooid

📏 De eerste versies van E en H typten `schone_naam()` opnieuw in plaats van hem
uit de gedeployde definitie af te leiden. Daarbij is de **randenlijst** een
oudere versie geworden: mijn versie miste `\034F`, `\115F-\1160`, `\1680`,
`\17B4-\17B5`, `\2000`-`\200F`, `\202F`, `\205F`, `\2800`, `\3164` en `\FFA0`.

Allebei werden ze keurig rood — en dat rood bewees niets. Zo maakte de ongeldige
E de **randveeg** rood; E2, die alleen stap 4 weghaalt, laat die veeg groen. Het
rood kwam dus van de randenlijst en niet van de grendel die de ijking noemde.

**Een ijking is zelf een meting, en een meting die zijn eigen instrument niet
kent, meet zichzelf.** De herhaalde vorm leidt de mutatie af van
`pg_get_functiondef()` en drukt het aantal gewijzigde regels af: E2 raakt er
vier, H2 raakt er één. Zelfde gedachte als
`docs/decisions/2026-09-10-een-rood-is-niet-vanzelf-jouw-rood.md`, en het is
precies waarom die notitie zegt dat je "ervoor" moet meten.

## ⚠️⚠️ De volgorde van stap 3 en 4 was met een onjuist argument verdedigd

In de kop van 0282 stond dat stap 3 vóór stap 4 moet *"omdat daarna elke
overgebleven tag er een is die bij een vlag hoort, en stap 4 hem dan niet meer
per ongeluk kan raken."*

📏 Nagemeten: de tekenklasse van stap 4 bevat géén enkel codepunt uit
`U+E0020`–`U+E007F`. Stap 4 kán een tag in **geen van beide** volgordes raken.
Het argument verdedigde iets wat sowieso niet kon gebeuren.

De volgorde is wél dragend, om de spiegelzijde: **stap 3 kan twee ASCII-letters
naast elkaar zetten die dat daarvoor niet waren**, en stap 4 vuurt alleen tussen
ASCII-buren. 📏 Gemeten:

```
a<U+E0067><U+200C>b   stap 3 dan 4  ->  ab          (2 codepunten)
                      stap 4 dan 3  ->  a<ZWNJ>b    (3 codepunten)
```

Omgekeerd ziet stap 4 links van de ZWNJ een tag in plaats van `a`, vuurt niet, en
ruimt stap 3 daarna de tag op — met de ZWNJ er nog tussen. Precies het geval dat
deze migratie moet sluiten.

⚠️ Het stond alleen in een comment, en dat is geen grendel. Er staat nu een
naadtoets op — hij biedt die invoer aan en eist `ab`, met de must-allow ernaast
dat dezelfde tag blíjft zodra er een vlagbasis voor staat. **Dit is vraag 1 van
regel 18 in zijn zuiverste vorm: twee correcte functies, en een derde feit dat
geen van beide draagt.**

⚠️ En het is dezelfde klasse als wat de security-review op QS8-494 drie keer
vond: niet een fout in de code, maar een fout in de onderbouwing eronder. **Een
afwijking die je onderbouwt is duurder dan een die je vergeet** — een
uitgeschreven argument leest de volgende persoon als een reden om er niet aan te
twijfelen.

## ⚠️ De toets die ik fout schreef, en wat hij liet zien

📏 De end-to-end-toets schreef ik eerst met `schrijfEnLees()` en de verwachting
dat `Ja<ZWNJ>n` als `Jan` zou landen. De CHECK weigerde hem met `23514`.

Dat wás het ontwerp, en 0269 schrijft het met zoveel woorden op: er zijn **drie**
gedragingen op één waarde, niet twee.

| route | wat er gebeurt |
|---|---|
| de aanmeldtrigger | `schone_naam()` **strijkt** — een aanmelding mag niet omvallen op een naam die de provider aanlevert |
| de client | `profielSchema` **strijkt stilletjes**, zonder melding |
| `PATCH /rest/v1/profiles` | de CHECK **weigert**, en dat is de énige grens |

De end-to-end-toets rijdt die derde route, dus daar hoort `magNietLandenAlsNaam()`
en geen schoongeveegde naam. De vier gesloten gevallen staan nu in het blok *"de
gemeten gevallen komen er niet meer door"* en niet meer bij *"wat er open
blijft"*.

⚠️ Het is het waard om op te schrijven omdat de fout **niet** in de code zat maar
in mijn beeld van de keten — en een toets die het verkeerde gedrag verwacht is
groen te krijgen door de code te veranderen. Dat is de duurdere reparatie van de
twee.

⚠️⚠️ **Met een must-allow die eist dat die vier verzamelingen daadwerkelijk
verschillen.** "Ze zijn het eens" is goedkoop te halen door allebei niets te
doen, of allebei alles weg te halen — en dan is de contextregel er niet meer,
terwijl de sweep groen blijft. Het geval eist daarom dat `U+200C` in de
ASCII-context zit en niet in de Arabische, dat `U+200D` niet tussen emoji zit,
en dat de letter `J` in geen enkele context sneuvelt.
