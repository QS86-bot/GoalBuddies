# De band droeg de aanwijzing — QS8-306

**Datum:** 07-09-2026
**Migratie:** `0183_het_oppervlak_van_de_getuige_volgt_de_groepsband.sql`
*(begonnen als 0181, onderweg twee keer hernummerd — zie de laatste sectie)*
**Komt uit:** de security-review op QS8-298
**Raakt:** domeinregel 7 (falen is nooit publiek), domeinregel 11 (een straf treedt
alleen in werking bij een verstreken deadline), onwrikbare regel 2

## Wat er stond

QS8-292 gaf de aangewezen persoon-getuige een oppervlak: leesrecht op de straf
zodra die verschuldigd wordt (policy `commitments_select`, 0168) en een functie
die er een scherm van maakt (`getuigenissen()`, 0169). QS8-298 gaf de
*meldingen*kant daarna een lidmaatschapstoets: pas als eigenaar en getuige nog
steeds één groep delen, gaat er een pushmelding uit.

Die toets zat op één van de drie plekken. 📏 Gemeten op de draaiende database,
met Bob als getuige die daarna de groep verlaat:

```
A1 bob ziet in getuigenissen()  = 1
A2 bob leest de rij             = 1
---- bob gaat op inactive ----
B0 lidmaatschap van bob         = inactive
B3 melding voor bob             = 0     <- QS8-298 doet zijn werk
B1 bob ziet in getuigenissen()  = 1     <- het scherm niet
B2 bob leest de rij             = 1     <- de policy ook niet
```

Wie de groep verliet of eruit gezet werd, bleef de verstreken deadline van zijn
oud-groepsgenoot lezen zodra hij de app opende.

## De vraag was een ontwerpvraag en geen bug

QS8-306 stelde hem als een keuze tussen twee kanten:

1. **"Een afspraak is een afspraak"** — de eigenaar heeft deze persoon
   aangewezen en dat overleeft een vertrek.
2. **"De band droeg de aanwijzing"** — verdwijnt de band, dan verdwijnt het
   oppervlak.

Het is 2 geworden, om drie redenen die alle drie al opgeschreven stonden:

* **CLAUDE.md, domeinregel 7:** *voor élk nieuw oppervlak is beschermd het
  antwoord tot iemand het tegendeel besluit*, en *bij twijfel is het antwoord
  nee*. Dit is een oppervlak waarop iemand de tegenslag van een ánder leest.
* **De aanwijzing kón alleen dankzij de band.** `commitments_insert` eist
  `shares_group_with_user(beneficiary_user_id)`. Een oppervlak dat langer leeft
  dan zijn eigen voorwaarde, is een oppervlak dat niemand besloten heeft.
* **QS8-298 trok deze grens al voor de duw.** Het beslisdocument van dat issue
  zegt met zoveel woorden: *niet duwen is minder dan niet tonen, dus de kant die
  hier gekozen is, is de veilige.* Dit maakt de twee gelijk in plaats van de
  strengste kant alleen te laten staan.

## Het gevolg dat QS8-306 vreesde, is nagemeten en lichter dan gedacht

Criterium 3 van het issue waarschuwde dat een straf waarvan de getuige vertrekt
"daarna helemaal geen getuige meer heeft" — de lege kring waar
`bewaak_begunstigde()` (0168) juist voor bestaat. 📏 Gemeten:

```
D0 aanwijzing staat er nog      = <het id van bob>
---- bob komt terug ----
D1 na terugkeer: melding        = 1
D2 na terugkeer: getuigenissen  = 1
```

**Het oppervlak wordt opgeschort, de aanwijzing niet vernietigd.** Deze grens
neemt niets weg; hij knijpt af zolang de band weg is. Dat is precies wat hem
goedkoop maakt, en het is een ándere zaak dan een straf zonder getuige.

⚠️ Wat wél waar blijft: zolang de getuige weg is, ziet niemand die straf behalve
de eigenaar. De twee wegen eruit zijn allebei gemeten en allebei geweigerd —
`beneficiary_user_id = null` geeft *"De begunstigde van een commitment is niet
weg te halen zolang hij bestaat"*, en zichzelf aanwijzen geeft *"Je kunt niet je
eigen getuige zijn"*. Een straf een níeuwe getuige geven is dus een eigen vraag
met een eigen weging (het is een schrijfrecht op een commitment, en dat raakt
domeinregel 5). Die staat als **QS8-312**.

## Twee sloten, en het tweede is het slot dat ertoe doet

De reparatie zit op twee plekken, en dat is geen dubbelop:

| Waar | Wat het is |
|---|---|
| `getuigenissen()` (0169) | het scherm — het blok *Jij bent getuige* op *Vandaag* |
| de derde tak van `commitments_select` (0168) | de rij eronder — PostgREST kent `commitments` |

**Een reparatie in alleen de functie maakt het blok leeg en laat het leesrecht
staan.** Dat is precies de vorm waar CLAUDE.md voor waarschuwt bij domeinregel 7:
de schermen hielden de regel aan terwijl de database hem lekte. De regel is pas
afgedwongen als de dátabase hem afdwingt, dus beide takken zijn geijkt met een
eigen mutatie — zie de kop van `tests/rls/getuige-band.test.ts`.

## Waarom er een `security definer`-helper bij hoort

De policy kan de band niet zelf uitrekenen. 📏 De eerste versie deed dat wel, met
een join op `goals`, en brak daarmee de must-allow: **een getuige die gewoon lid
was, zag zijn eigen rij niet meer** (`bob leest de rij = 0`).

De reden is dat een subquery in een RLS-policy zélf onder RLS draait. De getuige
mag het doel van de eigenaar niet lezen — dat is de andere helft van 0168, en die
klopt — dus `select owner_id from goals where id = …` gaf hem nul rijen.

Vandaar `deelt_groep_met_eigenaar(uuid)`: `security definer`, en hij bedenkt
niets zelf maar stelt `shares_group_with_user()` de vraag die die al beantwoordt.
Zo blijft er **één plek waar staat wat een groepsgenoot is** — dezelfde die
`commitments_insert` bij het aanmaken gebruikt. Een doel dat niet bestaat geeft
`null` en daarmee `false`; dat is de goede kant om op te falen.

⚠️ Hij staat daarom **niet** in het register van `tests/rls/hulpfunctiemodel.test.ts`:
die afleiding zoekt definer-functies die `group_members` nóemen, en deze noemt
hem niet omdat hij het oordeel doorgeeft in plaats van het te vellen.

De security-review las dat als een gat — *deze functie glipt langs het register
dat juist deze fout moet vangen* — en dat is de goede vraag om te stellen. 📏 Hij
is nagemeten met de twee mutaties die de review zelf noemde, en beide worden
gevangen, alleen door verschillende suites:

| Mutatie | Wat er rood wordt |
|---|---|
| de join inlijnen in de helper, met `= 'active'` | `hulpfunctiemodel.test.ts`, *"noemt elke gedeployde hulpfunctie in het register"* — hij noemt dan wél `group_members`, staat niet in het register, en er moet een besluit komen |
| naar de verkeerde buurman delegeren (`shares_group_with_goal(g)`) | `getuige-band.test.ts`, drie tests waaronder de must-allow — het doel hangt in die opstelling aan geen enkele groep, dus een getuige die gewoon lid is verliest zijn oppervlak |

**Dat is de arbeidsverdeling en niet een gat:** het register bewaakt wat een
functie *bedenkt*, de gedragstest bewaakt aan wie hij het *vraagt*. Een functie
die niets bedenkt hoort in het eerste niet thuis. De afleiding verbreden naar
"alles wat een hulpfunctie aanroept" zou er functies in trekken die geen model
hébben, en dan draagt het register rijen zonder besluit — precies wat het bestand
in zijn eigen kop afwijst.

⚠️ **Wat er wél uit de review is overgenomen: een `comment on function`.** Er
staan nu drie definer-functies met de handtekening `(g uuid) -> boolean` die alle
drie iets over groepen zeggen en alle drie iets anders bedoelen. Ze zijn tegen
elkaar in te wisselen zonder dat er bij het compileren iets omvalt, en het
verschil is met de naam alleen niet te zien. De mutatie hierboven laat zien dat
zo'n verwisseling wordt gevangen — maar pas nadat iemand hem gemaakt heeft, en
een naam die je waarschuwt is goedkoper dan een test die je terugstuurt.

⚠️ **`getuigenissen_voor()` kan de helper niet gebruiken**, want die krijgt de
persoon als argument en de helper leest `auth.uid()`. De invariant staat dus twee
keer gespeld in het schema, en dát is een naad: twee spellingen lopen uiteen
zodra iemand er één aanraakt, en beide kanten hebben hun eigen groene suite. De
laatste test in `getuige-band.test.ts` voert ze allebei dezelfde wereld en toetst
dat ze het over hetzelfde lidmaatschap eens zijn.

## Wat dit niet is

* **Geen verruiming.** Er gaat geen kolom weg en geen rij; alleen leesrecht wordt
  smaller.
* **Geen nieuwe opvatting over "groepsgenoot".** De conjunct is letterlijk die
  van `getuigenissen_voor()` (0178), inclusief `<> 'inactive'` in plaats van
  `= 'active'`: een lid met een adempauze is nog steeds een groepsgenoot. Drie
  opvattingen over wie een groepsgenoot is, zijn er twee te veel.
* **Geen toets op `goal_group_links`.** Dat is de fout die 0178 in zijn eerste
  versie maakte: de invariant is dat eigenaar en getuige één groep delen, niet
  dat het doel aan een groep hangt. Een doel hoeft aan geen enkele groep te
  hangen.

## Wat de security-review er verder bij zette

Drie dingen, alle drie overgenomen:

* **Het rollback-pad noemde de conjunct verkeerd** — het sprak van "de
  `exists`-conjunct" terwijl er een functieaanroep staat, en het ruimde de nieuwe
  functie niet op. Wie dat pad volgde, zocht naar iets dat er niet staat en liet
  een `security definer`-functie achter die `authenticated` mag uitvoeren zonder
  dat iets hem nog aanroept. Nu drie genummerde stappen.
* **De `drop`/`create` van de policy stond niet in een transactie.**
  `docs/DEPLOY.md` §2.2b past migraties toe zonder `-1`. Faalt de `create policy`
  nadat de `drop` geslaagd is, dan staat `commitments` met RLS aan en zónder
  SELECT-policy — niemand leest dan nog iets, ook de eigenaar niet. Dat faalt naar
  de veilige kant, maar het is een storing op de tabel die het hele
  commitment-scherm draagt. 0168 en 0169 doen het allebei al goed; nu deze ook.
* **Het orakel, en waarom het blijft staan.** De helper is `authenticated`-
  uitvoerbaar en dat kán niet anders: een policy-expressie draait onder het recht
  van de aanroeper. 📏 Gemeten dat hij geen bestaans-orakel op doelen geeft
  (een onbekend id levert `false`, niet `null`, en `goals.id` is
  `gen_random_uuid()`), en dat hij in elke cel hetzelfde antwoordt als
  `shares_group_with_user(owner_id)`.

  Wat er nieuw is en blijft: een vertrokken getuige verliest het profiel van de
  eigenaar (📏 `bob leest profiel alice = 0`) maar hij hield het `goal_id` dat hij
  eerder uit de commitment-rij las. Daarmee kan hij blijven pollen of hij weer een
  groep met die persoon deelt — ná de knip die dat juist afsloot. Het is één bit,
  het is dezelfde bit die `shares_group_with_user()` hem geeft als hij dat uuid
  had opgeschreven, en de weg ernaartoe is een uuid dat je niet kunt raden. Dus
  het blijft staan, maar het staat hier opgeschreven in plaats van dat het niemand
  opgevallen is.

⚠️ De review controleerde ook de spiegelzaak die dit document niet noemde en die
wél klopt: **gaat de eigenaar weg in plaats van de getuige, dan sluit het
oppervlak ook** — `shares_group_with_user()` is symmetrisch. De eigenaar zelf
blijft zijn eigen commitment gewoon zien, via de eerste tak van de policy.

## Twee hernummeringen, en een sed-val die dit project al kende

Deze migratie heeft drie nummers gehad, en dat is het opschrijven waard omdat de
tweede keer een fout opleverde die precies in `CLAUDE.md` staat.

* **0181 → 0182.** QS8-176 landde als 0181 terwijl deze in aanbouw was.
* **0182 → 0183.** PR [#260](https://github.com/QS86-bot/GoalBuddies/pull/260)
  (QS8-296) landde een eigen `0182` tússen mijn hernummering en mijn merge. Git
  zag geen conflict — twee verschillende bestandsnamen — dus stonden er even
  twee migraties 0182 op `main`. Wie als tweede merget hernummert, en dat was
  ik.

⚠️ **Bij de eerste hernummering bleef deze kopregel op 0181 staan, en de reden
is de val van QS8-241.** Ik heb hem met `sed -i 's/\b0181\b/0182/g'` willen
meeverhuizen, en `_` is in GNU sed een woordteken: in `0181_het_oppervlak` staat
er géén woordgrens achter de `1`. De kale verwijzingen in de lopende tekst
verhuisden dus wel en de bestandsnaam in de kop niet — precies het geval dat
`migraties:controle` stap 5 voor de migratiekop bewaakt, maar dan in een
document waar geen controle op staat.

**De les is niet "gebruik een betere regexp".** Het is: `migratie:hernummer`
drukt de kale verwijzingen af die hij níet aanraakt, en die lijst is er om
nagelopen te worden. De 43 regels van de tweede ronde zijn stuk voor stuk
bekeken; negen hoorden bij deze migratie.
