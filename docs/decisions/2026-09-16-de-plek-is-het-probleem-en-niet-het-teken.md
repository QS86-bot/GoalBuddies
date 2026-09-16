# De plek is het probleem, en niet het teken

**Datum:** 16-09-2026
**Issue:** QS8-499
**Migratie:** 0277
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
`U+E0100`–`U+E01EF`. Tussen `a` en `b` kan geen van deze iets betekenen.

⚠️ **Waarom ASCII en niet "een schrift dat dit teken niet gebruikt".** Die tweede
is de correctere regel, en het issue noemt hem als optie. Hij vraagt
Unicode-scriptdata, en die heeft Postgres niet — er is geen `script(codepoint)`.
Hem in SQL nabouwen betekent een tabel met scriptbereiken onderhouden die per
Unicode-versie schuift, en dat is een afhankelijkheid met een eigen levensduur.

ASCII is daarentegen **bewijsbaar veilig**: geen enkel schrift dat ZWNJ, ZWJ,
CGJ, een richtingsmarkering, een variatieselector of een IVS nodig heeft,
schrijft met ASCII-letters. De regel kan dus geen enkele van de vier
must-allows breken — niet omdat het toevallig goed uitpakt, maar omdat de twee
verzamelingen elkaar niet raken.

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

⚠️⚠️ **Met een must-allow die eist dat die vier verzamelingen daadwerkelijk
verschillen.** "Ze zijn het eens" is goedkoop te halen door allebei niets te
doen, of allebei alles weg te halen — en dan is de contextregel er niet meer,
terwijl de sweep groen blijft. Het geval eist daarom dat `U+200C` in de
ASCII-context zit en niet in de Arabische, dat `U+200D` niet tussen emoji zit,
en dat de letter `J` in geen enkele context sneuvelt.
