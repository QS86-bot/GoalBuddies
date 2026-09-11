# Een pad zonder wortel leest als proza

**Datum:** 11-09-2026 · **Issue:** QS8-432 (vervolg op QS8-423 en QS8-412) ·
**Migratie:** geen

## De keuze

`padverwijzing:controle` (QS8-412) meldt een backtick-geciteerd pad dat naar een
bestand wijst dat er niet is. QS8-423 verhuisde de kiezers uit `src/shared/ui`
naar `src/shared/kiezers` en repareerde vijf verwijzingen met de hand; drie
bleven staan, en de controle zei er niets over. Dit issue vroeg waaróm.

Drie besluiten:

1. **De wortelloze vorm telt mee**, beperkt tot de eerste segmenten die alleen
   onder `src/` bestaan: `shared/`, `modules/` en `lib/`.
2. **`docs/decisions/` blijft erbuiten**, maar niet meer stilzwijgend: de meting
   die dat draagt staat nu in het script.
3. **Eén extensielijst voor beide vormen** in plaats van twee.

En één bevinding die geen van die drie is, en die zwaarder weegt dan alle drie —
zie §4.

## 1. Waarom alleen drie eerste segmenten

De kop van QS8-412 zegt het al: *een pad zonder aanhalingstekens of zonder
extensie is niet betrouwbaar van proza te scheiden, en een controle die proza
meldt leer je uitzetten*. De wortel was de derde grendel in diezelfde vorm. Hem
laten vallen kost precies wat die zin voorspelt.

📏 Gemeten, en dat is waarom de regel smal is:

| vorm | treffers | lost op | kapot | vals |
| -- | --: | --: | --: | --: |
| elk eerste segment | 139 | — | — | vrijwel alle 139 |
| `shared\|modules\|lib` | 70 | 69 | 1 | 0 |

De 139 zijn niet toevallig fout maar **stelselmatig** fout, in vier soorten:
`public/manifest.json` en `.github/workflows/ci.yml` bestáán — hun wortel staat
alleen niet in `MAPPEN`; `_shared/sentry/index.ts` en `rollover/index.ts` zijn
relatief aan `supabase/functions/`; er zit een URL tussen; en er staat proza in
dat toevallig een streep en een punt draagt.

Die ene kapotte was `shared/ui/kiesFoto.ts` in `src/shared/afbeelding/index.ts` —
precies de verwijzing waar dit issue om begon. Hij staat nu mét reden in
`ZONDER_BESTAND`: de zin noemt de herkomst van een verhuizing en zet de nieuwe
plek er direct naast, en weghalen zou de meting eronder onleesbaar maken.

⚠️ **De prefix is een afleiding en geen gok.** `shared/`, `modules/` en `lib/`
bestaan in deze repo nergens anders dan onder `src/`. Komt er ooit een tweede
`modules/` bij — in `supabase/functions/` bijvoorbeeld — dan is deze regel vanaf
dat moment een gok, en dan hoort hij te verdwijnen of een tweede wortel te
krijgen. Dat is geen theorie: de vier soorten valse treffers hierboven zijn
allemaal van die vorm.

## 2. Waarom `docs/decisions/` erbuiten blijft, nu mét de meting

Het issue stelt voor om binnen beslisdocumenten op **tegenwoordige tijd** te
melden en bij verleden tijd te zwijgen, en zegt erbij: kan de heuristiek dat niet
dragen, schrijf dat dan op in plaats van de map stil uit te sluiten.

📏 Gemeten op 11-09-2026: **559** backtick-paden in `docs/decisions`, waarvan
**10** naar een bestand wijzen dat er niet is. Alle tien met de hand nagelopen:

- **vier** staan in het document dát over ontbrekende testbestanden gáát
  (QS8-412), waarvan drie een registerrij citeren — ze noemen die paden omdat ze
  er niet zijn;
- **twee** zijn een afgewezen optie en een hypothese (*"was er ooit een …"*);
- **één** is een gewiste Edge-Function-module die er vandaag juist níét hoort te
  zijn;
- **één** is `docs/BACKLOG-PLAN.md`, dat toen bestond;
- **één** is geen bestandsnaam maar een afkorting: `0166_...sql`. Dat is een
  eigen soort ruis — de controle kan een beletselteken niet van een naam
  onderscheiden;
- **één** is een echte bevinding, en die staat in §5.

Negen van de tien zijn dus terecht historisch.

⚠️ **En de voorgestelde tijdheuristiek had juist de tiende gemist.** Het issue
stelt voor te melden op *"staat in"* en *"woont in"*. 📏 Nagelopen zin voor zin:
de tiende luidt *"`tests/beloftes/lijstveld.test.ts` wordt rood zodra dit scherm
zijn eigen `TextInput` bouwt"* — geen van beide werkwoorden, dus geen treffer.
Wat die heuristiek wél zou pakken is nummer vijf hierboven: *"In de kop van
`0166_...sql`"* — een zin in de tegenwoordige tijd over een pad dat geen pad is
maar een afkorting. **De heuristiek mist de bevinding en vindt de ruis.**

Een regel die negen keer ruis meldt om een tiende te vinden die hij niet vindt,
is geen regel. De map blijft erbuiten en dit staat erbij, zoals het issue vraagt.

⚠️ **Wat de uitsluiting wél kost, staat nu in het script.** De reden in de kop
van QS8-412 was goed maar dekte de verleden tijd; een beslisdocument dat in de
tegenwoordige tijd zegt wáár iets staat, kan onwaar worden. Dat is deze week
gebeurd, en het blijft handwerk.

## 3. Eén extensielijst

De wortelloze vorm had er eerst een eigen, smallere — zonder `.json` en `.yml`.
📏 Gemeten: die twee leveren in de wortelloze vorm **nul** treffers op. De smalle
lijst kocht dus niets en kostte een tweede plek waar een lezer een verschil moet
verklaren dat er niet is. Twee lijsten die hetzelfde horen te zeggen, lopen uit
elkaar; dat is dezelfde klasse als een teller in grafemen bij een grens in
codepunten.

## 4. ⚠️⚠️ De bevinding die het eigenlijke antwoord is

Twee van de drie koppen uit het issue noemen `shared/ui` — en **`src/shared/ui`
bestaat gewoon**, met 83 bestanden erin. QS8-423 verhuisde de kiezers eruit, niet
de map.

Dat betekent dat die twee **geen padprobleem zijn**. Het zijn onware beweringen
over een bestaand pad:

> ⚠️ `kiesDocument()` staat in `shared/ui` en niet in `modules/buddies`, en dat
> is een gemeten plaatsing.

Elk teken in die zin klopt behalve het feit. Geen padcontrole kan hem vinden —
niet met de wortelloze vorm erbij, niet met `docs/decisions` erbinnen, niet met
een tijdheuristiek. De controle toetst *bestaat dit pad*, en het antwoord is ja.

⚠️ **Dat staat al in de kop van QS8-412** — *de controle vindt dat een pad er
niet ís; of de bewering eromheen klopt blijft handwerk* — maar het stond er als
voorbehoud. Hier is het gemeten: van de drie aanleidingen voor dit issue valt er
**één** binnen wat een controle kan zien, en **twee** erbuiten. De blinde vlek
die het issue vermoedde is echt en is gedicht, en hij verklaart een derde van de
aanleiding.

⚠️⚠️ **En de gevaarlijke helft is de tweede.** Een verwijzing naar een verdwenen
bestand is dood en leest als dood zodra je hem volgt. Een onderbouwde plaatsing
in een map die nog bestáát, leest als een reden om er niet aan te twijfelen —
precies wat CLAUDE.md bedoelt met *een afwijking die je onderbouwt is duurder dan
een die je vergeet*. De enige grendel die deze klasse raakt is de lintregel die
de plaatsing zélf afdwingt (QS8-423, `import/no-restricted-paths`), niet een
controle op de tekst eromheen.

## 5. Wat er langs de weg boven kwam

📏 `docs/decisions/2026-09-10-een-typefout-hoort-geen-verwijderknop-te-vragen.md`
noemt een grendel die er niet is:

> `tests/beloftes/lijstveld.test.ts` wordt rood zodra dit scherm zijn eigen
> `TextInput` bouwt.

Dat bestand bestaat niet, onder geen enkele naam: `TaakRegel` en `taakTekst`
komen in de hele testboom niet voor. De belofte — het scherm gebruikt het
gedeelde `Field`, zodat QS8-250 de microfoon eraan kan hangen — is onbewaakt.
Dit is woordelijk de vorm waar QS8-412 voor gebouwd is, en hij stond in de ene
map die de controle niet leest. **QS8-434**; hier niet meegenomen, want dat zou
de branch verbreden.

## 6. IJking

Per grendel apart, elk met de vraag *wordt de test die deze grendel noemt rood* —
en vooraf gemeten dat alle 30 groen waren.

| mutatie | verwacht | uitslag |
| -- | -- | -- |
| de `src/`-prefix weg uit `verwijzingenIn()` | de drie "vindt"-tests | **3 rood**, de "laat met rust"-blok groen |
| elk eerste segment i.p.v. de drie | de drie "laat met rust"-tests | **9 rood**, waaronder alle drie |
| het backtick-anker ook een schuine streep laten zijn | precies de dubbeltelling | **1 rood**, en die ene |

De derde is de scherpste: `src/shared/a.ts` bevát `shared/a.ts`, dus zonder dat
anker komt elk pad mét wortel er twee keer uit — één keer goed en één keer als
`src/src/…`. De controle meldt dan bestanden die nooit bestaan hebben. Eén test
noemt precies dat, en precies die viel om.

⚠️ Bij elke mutatie is met een `grep` vastgesteld dát hij in het bestand stond
vóór de uitslag geloofd werd, en daarna is het bestand teruggezet uit een kopie —
niet met de hand teruggetypt.
