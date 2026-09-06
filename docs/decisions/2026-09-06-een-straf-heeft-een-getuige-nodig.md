# Een straf heeft een getuige nodig, en die hoeft geen hele groep te zijn

**Datum:** 06-09-2026 · **Issue:** QS8-228 · **Migratie:** 0168

---

## 1. Wat er verandert

Een straf mag nu **één persoon** als begunstigde hebben in plaats van een hele
groep. Dat is een kleinere kring, geen lege kring: domeinregel 11 verandert niet,
de getuige krijgt leesrecht op het moment dat de straf verschuldigd wordt en geen
seconde eerder.

| | Vóór 0168 | Sinds 0168 |
|---|---|---|
| Begunstigde | verplicht een groep | een groep óf één persoon, nooit allebei |
| Wie je mag kiezen | een groep waar je lid van bent | idem, of iemand met wie je een groep deelt |
| Wanneer hij het ziet | vanaf `unlocked` (groepslijst) | een persoon pas vanaf `due` |
| Zonder begunstigde | onmogelijk (CHECK) | onmogelijk (trigger) |

## 2. Wat er níét verandert, en waarom dat het punt is

De oorspronkelijke klacht was: *"de gebruiker kan geen straf invullen wanneer hij
geen vrienden heeft of in een buddygroep zit."* De verleiding is dan om de eis
maar te laten vallen.

**Dat zou de feature slopen.** Domeinregel 11 zegt dat de begunstigde leesrecht
krijgt op het moment dat de straf verschuldigd wordt. Zonder getuige ziet niemand
hem ooit — en dan is een straf een voornemen in plaats van een commitment device.
De werking komt uit het gezien worden. Quinten heeft dan ook niet "geen
begunstigde" besloten maar "één persoon in plaats van een groep".

## 3. ⚠️ De aanname die ik zelf genomen heb: er is geen buddy-relatie

Het issue schrijft: *"De begunstigde moet iemand zijn met wie je een band hebt:
een groepsgenoot uit een van je groepen, of iemand die je expliciet als buddy hebt
toegevoegd."*

**Die tweede bestaat niet.** Gemeten tegen het schema: er is geen tabel voor een
1-op-1 buddy-relatie, in geen enkele vorm. De enige band die vandaag bestaat is
groepslidmaatschap.

Daarom is de band hier `shares_group_with_user()`: iemand met wie je een groep
deelt, waarbij béíde kanten actief lid moeten zijn (0102, dus een uitgezet lid
telt niet mee). Dat is de conservatiefste lezing — hij kan nooit een vreemde
tot getuige maken — en hij maakt het werk af.

⚠️ **Wat daarmee niet gehaald wordt:** het acceptatiecriterium *"een gebruiker
zonder groep maar met één buddy kan een straf vastleggen"*. Zonder groep is er
ook geen groepsgenoot; de band lóópt vandaag via de groep. Wie dat criterium
letterlijk wil, vraagt eerst om een buddy-relatie, en dat is een eigen feature met
een eigen datamodel — niet iets dat in deze migratie hoort mee te liften.

**Wat de gebruiker in plaats daarvan krijgt** is uitleg met een uitweg: het
scherm zegt waaróm er niets te kiezen valt en zet een knop naar de groepen. Geen
dood veld — dat is het criterium dat wél gehaald is.

## 4. Waarom de begunstigde-eis een trigger is en geen CHECK

Dit is het duurste stuk van dit issue en het stond niet in de opdracht.

`beneficiary_group_id` heeft `on delete set null` en daarnaast stond de CHECK die
een begunstigde eist. Die twee botsen zodra de begunstigde verdwijnt: de
`set null` is een **UPDATE**, en een UPDATE hertoetst de CHECK. Voor groepen was
dat dood hout — 0092 archiveert groepen en verwijdert ze niet meer.

**Voor een persoon is het dat niet.** `verwijder_mijn_account()` doet
`delete from auth.users`, dat cascadeert naar `profiles`, en daar hangen dertig
foreign keys aan. Was de eis een CHECK gebleven, dan **blokkeerde een openstaande
straf de accountverwijdering van de getuige** — een route die niets met straffen
te maken heeft en die moet blijven werken.

Dus:

* een **CHECK** voor wat in élke toestand waar blijft: nooit een groep én een
  persoon;
* een **trigger** voor wat alleen bij het schrijven geldt: een straf krijgt een
  begunstigde mee.

⚠️ **De trigger vuurt ook voor `service_role`** — een trigger is geen policy, en
daar staat een test op die via `adminDb()` gaat. Wat hij wél kan en een CHECK
niet, is onderscheid maken tussen "iemand haalt de getuige weg" en "de getuige
bestaat niet meer". Die eerste is verboden (domeinregel 5: een commitment device
gaat nooit stilzwijgend uit), de tweede is precies wat de foreign key doet.

⚠️⚠️ **Hier stond eerst "de trigger is niet zwakker dan de CHECK", en dat was
onwaar.** De eerste versie keerde in de UPDATE-tak vroeg terug, zodat de
begunstigde-eis daar nooit geëvalueerd werd. Gemeten in de security-ronde:
`insert` een beloning zonder getuige, dan `update … set type = 'penalty'`, en er
stond een straf die niemand ooit ziet — precies de toestand die deze migratie
bestaat om te verbieden.

Die zin stond op drie plekken: in de migratiekop, hier, en in het commitbericht.
**Een opgeschreven grendel die niet bestaat is duurder dan geen grendel**, want
de volgende lezer bouwt erop. De test die hem zou vangen bleef groen omdat hij
alleen de INSERT-kant voerde — regel 18 vraag 3, en het antwoord was niet "erover
nadenken" maar het met de hand breken.

## 5. ⚠️⚠️ En daarachter lag nog een naad: het spoor overleefde zijn eigen actor niet

Toen de CHECK een trigger was, viel de accountverwijdering **alsnog** om:

```
insert or update on table "commitment_events" violates foreign key constraint
"commitment_events_actor_id_fkey"
Key (actor_id)=(724d…) is not present in table "profiles".
```

De `set null` op `beneficiary_user_id` is een UPDATE op `commitments`, en die
vuurt `commitments_audit`. Dat schrijft een spoorregel met
`actor_id = auth.uid()` — en dat is precies het profiel dat op dat moment al weg
is. `commitment_events.actor_id` heeft zelf `on delete set null`, maar dat helpt
niet: de rij wordt **aangemaakt** terwijl het profiel er al niet meer is.

⚠️ **Dit stond er al vóór dit issue.** Het gold voor elke `on delete set null`
die `commitments` raakt — alleen wees er geen kolom naar een profiel, dus niemand
kon erop stuiten. Het is geen regressie maar een gat dat pas bereikbaar werd.

**Niet opgelost door het spoor over te slaan.** Domeinregel 5 zegt dat een
commitment device auditeerbaar is, en "de getuige is verdwenen" is een materiële
wijziging aan de afspraak. De regel hoort er te staan; wat er niet hoort te staan
is een actor die niet bestaat. Die wordt `null` — precies wat `on delete set
null` een moment later zelf gedaan zou hebben.

## 6. De bandtoets staat in de policy en niet in een RPC

Het issue vroeg om de toets "in de RPC". **Er ís geen RPC:** `zetStraf()` doet een
gewone insert en `commitments_insert` is wat hem begrenst. Een RPC erbij bouwen
zou de grens verplaatsen naar een tweede pad terwijl het eerste openblijft — de
vorm die dit project vaker gekost heeft dan hij ooit heeft opgeleverd.

De keuzelijst in het scherm toont alleen groepsgenoten. Dat is gebruiksgemak; de
test die ertoe doet gaat er met een rechtstreeks verzoek omheen.

## 7. Wat de tests bewaken, en hoe dat geijkt is

Negen grendels, elk apart kapot gemaakt en gecontroleerd of de test die hém noemt
rood werd.

| # | Grendel | Mutatie | Test die rood werd |
|---|---|---|---|
| 1 | de bandtoets in `commitments_insert` | de conjunct eruit | iemand met wie je geen groep deelt mag niet |
| 2 | de statusgrens van de persoonstak | verruimd naar elke stand | ziet hem niet zolang hij nog niet verschuldigd is |
| 3 | de persoonstak bestaat | de tak eruit | ziet hem zodra hij verschuldigd is |
| 4 | de persoonstak toetst de kijker | `= auth.uid()` → `is not null` | is voor iemand anders onzichtbaar |
| 5 | de begunstigde-eis | de `if` uit de trigger | een straf zonder begunstigde kan niet |
| 6 | de getuige is niet weg te poetsen | de `if` uit de trigger | laat de eigenaar de getuige niet wegpoetsen |
| 7 | de uitzondering voor een verdwenen profiel | `exists` → `true` | laat de getuige zijn account verwijderen |
| 8 | nooit een groep én een persoon | de CHECK gedropt | tegelijk kan niet, ook niet als service_role |
| 9 | de actor-null in het spoor | terug naar `auth.uid()` | laat de getuige zijn account verwijderen |
| 10 | de eis geldt óók op UPDATE | de vroege `return new` terug | een beloning omzetten naar een straf laat geen straf zonder getuige achter |
| 11 | jezelf aanwijzen kan niet | de toets uit de trigger | jezelf aanwijzen kan niet, ook niet als service_role |
| 12 | een persoon alleen bij een straf | de CHECK gedropt | een beloning met een persoon als begunstigde kan niet |

⚠️ **Grendels 7 en 9 delen hun test, en dat is geen luiheid maar wat de belofte
is:** "een openstaande straf blokkeert de accountverwijdering van de getuige
niet." Twee verschillende dingen kunnen die belofte breken, en dat zijn twee
mutaties — niet één.

⚠️ **Twee must-allows staan er met opzet naast een must-not:** een beloning zónder
begunstigde moet wél kunnen (anders toetst grendel 5 `type` niet), en de eigenaar
moet zijn eigen straf in élke stand blijven zien (anders schuift de eigenaarstak
mee met de nieuwe persoonstak).

⚠️ **Eén ijking wees eerst niets aan doordat de testnaam een accent draagt** —
het filter `-t "een groep en een persoon tegelijk"` matcht `én` niet, en de
uitslag was "12 overgeslagen, groen". Dat is de vorm waar CLAUDE.md bij regel 18
voor waarschuwt: een ijking die zijn geval niet eens bereikt, meldt groen en
bewaakt niets. Overgedaan met een stuk van de naam zónder accent.


---

## 8. Wat de security-ronde vond, en wat ermee gedaan is

Drie onafhankelijke reviews, alle drie blokkerend, alle drie op grotendeels
dezelfde punten. Elke bevinding hieronder is door mij zelf nagemeten tegen de
draaiende database vóór ik hem verwerkte.

### Gerepareerd in deze branch

| Wat | Gemeten | Wat er nu staat |
|---|---|---|
| De trigger toetste de begunstigde-eis niet op UPDATE | `reward` → `penalty` gaf een straf zonder getuige | de eis staat buiten de `tg_op`-vertakking, met de FK-uitzondering ervóór |
| Je kon **jezelf** als getuige aanwijzen | `shares_group_with_user(auth.uid())` is `t` zodra je in één groep zit | verboden in de trigger — zie 8a |
| `commitments_update` had geen bandtoets | wat het gat dichthield was een kolomgrant uit 0057, zonder test | de bandtoets staat nu in de policy, met een test op de kolomgrant |
| Een `reward` mocht een persoon als begunstigde dragen | insert geslaagd | CHECK `commitments_persoon_alleen_bij_straf` |
| Rij 20 van `002-domeinregel7-oppervlakken.md` kende de persoonstak niet | alleen gelezen | bijgewerkt, met de meting erin |

⚠️ **Zelfnominatie was de scherpste.** `shares_group_with_user()` joint
`group_members` op zichzelf, en je eigen rij voldoet aan béíde kanten. Eén
gewoon API-verzoek gaf een straf die aan alle grendels voldeed en die letterlijk
niemand ooit ziet — de lege kring waar §2 van dit document over gaat. Het woord
"zelf" kwam in de migratie, dit document en de testsuite geen enkele keer voor:
dit was geen afgewogen keuze maar een gat.

### 8a. Eén ijking bleef groen, en dat kostte een tweede kopie van de regel

De eerste reparatie tegen zelfnominatie stond op twee plekken: in
`commitments_insert` én in de trigger. De ijking van de policy-helft **bleef
groen** — de conjunct eruit halen maakte geen enkele test rood, want elk geval
liep alsnog tegen de trigger aan.

Dat is precies de valkuil die CLAUDE.md bij regel 18 noemt: *een ijking die zijn
geval door een pad voert dat een éérdere grendel al afvangt, bewaakt niets van
wat hij belooft.* Twee kopieën van dezelfde regel die geen van beide los te
toetsen zijn, is bovendien de vorm die stil uit de pas gaat lopen.

De policy-helft is er daarom weer uit. Wat blijft is de trigger, en dat is de
sterkste van de twee: die bindt ook `service_role`. De **bandtoets** blijft wél
in de policy, en dat is geen inconsequentie — die gaat over wie een *gebruiker*
mag kiezen, en `service_role` is het systeem en geen gebruiker.

⚠️ **Dit is dezelfde les als de blokkerende bevinding zelf, één laag hoger.**
Daar stond een grendel opgeschreven die niet bestond; hier stond er een die wel
bestond maar niet te toetsen was. Allebei geven ze een groen scherm zonder
bewijs.

### Weggezet als eigen issue

| Wat | Waarom niet hier |
|---|---|
| De persoon-getuige heeft geen scherm en geen melding (QS8-292) | een leesoppervlak plus een notificatietype; eigen datamodelvraag, en de groepschat is nadrukkelijk níét de route |
| Geen plafond op het aantal straffen per doel (QS8-293) | raakt ook `goals.target_date` en de vraag of een getuige mag weigeren — dat laatste is een productbeslissing |

⚠️ **De eerste is de eerlijkste kritiek op dit issue.** De rechtvaardiging van de
hele feature is "de werking komt uit het gezien worden", en voor de persoonstak
is dat vandaag niet geleverd. De copy belooft daarom géén melding meer: ze zegt
dat de getuige het na de streefdatum mág lezen, en dat je het hem zelf even moet
laten weten. Dat is waar, en het was het niet.

### Onderweg gevonden en hersteld: een besluit dat uit `002` gevallen was

⚠️⚠️ Commit `da744f2` (QS8-290, een parallelle sessie) werkte oppervlak 25 bij
vanaf een basis van vóór QS8-227 en nam daarmee de **derde benoemde uitzondering
op domeinregel 7** mee — de rij over een adempauze die je achteraf aankondigt,
de §4a-kop, rij 21 en de A41-aantekening. Zonder één woord erover in het
commitbericht, en `docs:controle` en `review:controle` waren allebei groen.

Nagemeten: `git show origin/main:… | grep -c QS8-227` gaf **0**. Hersteld in deze
branch, met de badges-toevoeging van die commit intact.

**Dat is erger dan een besluit dat er nooit in stond:** `breathers_select` deelt
het recht nog steeds uit, dus het document was strenger geworden dan de
werkelijkheid — en dan repareert de volgende sessie iets wat een besluit is, of
verruimt verder op een precedent dat ze niet kan zien.
