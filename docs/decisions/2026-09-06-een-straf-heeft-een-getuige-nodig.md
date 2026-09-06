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

⚠️ **De trigger is niet zwakker dan de CHECK.** Hij vuurt ook voor
`service_role` — een trigger is geen policy, en daar staat een test op die via
`adminDb()` gaat. Wat hij wél kan en een CHECK niet, is onderscheid maken tussen
"iemand haalt de getuige weg" en "de getuige bestaat niet meer". Die eerste is
verboden (domeinregel 5: een commitment device gaat nooit stilzwijgend uit), de
tweede is precies wat de foreign key doet.

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
