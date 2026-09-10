# Wat een straf overleeft — vier besluiten van Quinten, 08-09-2026

QS8-321, QS8-322, QS8-333 en QS8-335 stelden dezelfde vraag vanuit vier hoeken:
**wat overleeft een straf?** Ze zijn alle vier grens 1 uit de beslisbevoegdheid —
een straf is wat de gebruiker als consequentie beloofd is — en ze zijn op één
beslispagina in één ronde beantwoord.

Dit document draagt de vier besluiten en hun prijs. Elk besluit krijgt hieronder
een eigen sectie; de secties komen binnen met de branch die ze bouwt, in de
volgorde waarin ze op elkaar leunen.

| Issue | Besluit | Volgt mijn voorstel |
|---|---|---|
| QS8-322 | Te laat afronden laat de straf staan | ja |
| QS8-321 | De getuige krijgt bericht, intrekken blijft vrij | ja |
| QS8-333 | Een RPC die een nieuwe getuige aanwijst **én** mag afwikkelen | nee — ik stelde alleen het eerste voor |
| QS8-335 | Het wisrecht wint helemaal | nee — ik stelde een auditstomp voor |

⚠️ **Twee besluiten wijken af van wat ik aanraadde, en dat staat hier met zoveel
woorden.** Niet als voorbehoud, maar omdat de volgende lezer moet kunnen zien
welke afweging er gemaakt is en waartegen. Het bezwaar staat bij de sectie; het
besluit staat erboven.

---

## 0. Wat er níet uit deze ronde volgt

De hypothese in `docs/BACKLOG-PLAN.md` §5a was dat één zin alle vier zou
beantwoorden: *een straf is vrijwillig tot hij verschuldigd is, en daarna niet
meer.* Bij het uitwerken bleek dat voor de helft te kloppen.

Voor QS8-322 en QS8-321 werkt hij: die gaan over de periode vóór `due`, en daar
is "vrijwillig" precies het antwoord. Voor QS8-333 en QS8-335 is de zin *al* waar
en is dat juist het probleem — de verschuldigde straf is dan onaanraakbaar, of hij
verdwijnt alsnog langs een accountverwijdering. Vier besluiten dus, en geen één.

---

## 1. QS8-322 — te laat afronden laat de straf staan

**Besluit:** de straf volgt dezelfde tijdigheidstoets als de beloning. Rond je af
binnen de streefdatum plus de respijtdag, dan vervalt je straf zoals hiervoor.
Rond je later af, dan blijft hij staan en wordt hij verschuldigd.

### Waar het vandaan kwam

📏 Gelezen uit `pg_get_functiondef('wikkel_commitments_af')`:

```
v_op_tijd := v_vandaag <= v_doel.target_date + 1;

if v_op_tijd then    reward   set → unlocked
else                 reward   set → cancelled
(buiten de if/else)  penalty  set → cancelled
```

De beloning hing aan `v_op_tijd`, de straf niet. Eén dag te laat afronden kostte
je dus je beloning en bespaarde je je straf. Dat is de prikkel precies verkeerd
om: wie op de streefdatum ziet dat hij het niet redt, was beter af door een dag
later af te ronden dan door het te laten staan.

### De prijs, en die is echt

Dit maakt de app **strenger** dan hij was. Iemand die zijn doel drie dagen te laat
afrondt, krijgt nu een straf die hij eerder niet kreeg. Van de vier besluiten in
deze ronde is dit de enige waarbij een gebruiker er ná de wijziging op achteruit
gaat.

Dat is verdedigbaar omdat hij die straf zelf heeft ingesteld en bevestigd, maar
het is geen gratis reparatie, en daarom staat het hier.

⚠️ **Domeinregel 5 maakt er één ding bij verplicht.** Een commitment device treedt
nooit stilzwijgend in werking. Te laat afronden ís nu zo'n moment, dus het moet
gezegd worden vóórdat de gebruiker op de knop drukt. `wikkel_commitments_af()`
geeft daarom `blijft_staan` terug, en `bevestiging.doel_afronden.uitleg` noemt
beide gevallen. Zonder die twee zou het besluit kloppen en het product niet.

### Waarom het drie wijzigingen werden

Migratie 0238 raakt drie objecten, en dat is geen bundeling maar één ondeelbare
wijziging:

1. **`wikkel_commitments_af()`** — de penalty-annulering gaat de `if v_op_tijd`-tak
   in.
2. **`maak_straffen_verschuldigd()`** — de regel `and g.status <> 'completed'`
   gaat eruit. Zonder dit repareert stap 1 niets: `rond_doel_af()` zet het doel op
   `completed` en dáárna pas wikkelt het de commitments af, dus de straf zou op
   `set` blijven staan en de job zou hem nooit oppakken. Het issue waarschuwde
   ervoor; de meting bevestigde het.
3. **`commitments_insert`** — een straf hoort bij een doel met `status = 'active'`.

Stap 3 is er alleen omdat stap 2 hem nodig maakt. 📏 Gemeten als gewone ingelogde
eigenaar: een straf hángen aan een doel dat al `completed` is, lukte gewoon — de
policy toetste de eigenaar en de streefdatum, maar niet of het doel nog liep. Dat
was onschadelijk zolang zo'n straf toch nergens heen kon; met stap 2 erbij wordt
hij verschuldigd op een doel dat al af is. Die deur gaat in dezelfde migratie
dicht, want dezelfde migratie opent hem.

### Wat er bewust níet gebeurd is

**§1 zet de straf niet zelf op `due`.** Dat had gekund en het was korter geweest,
maar `maak_straffen_verschuldigd()` draagt twee grendels die dan nagebouwd hadden
moeten worden: het wachtvenster van 24 uur (0171/0172) en het open
deadline-verzoek (0174/QS8-307). Een tweede kopie van die logica is precies hoe
elke definer-functie in dit project een kopie van de vorige werd.

**De respijtdag verandert niet.** `target_date + 1` staat er sinds 0173 en blijft.

### Hoe het bewaakt wordt

`tests/rls/straf-blijft-bij-te-laat.test.ts` toetst de **keten** en niet de tak:
doel met verstreken deadline → afronden → de job → `due`. Een test die bij "de
straf staat nog op `set`" was gestopt, had de reparatie voor de helft gemeten.

Met de hand rood gemaakt, één mutatie per grendel:

| Mutatie | Wat er rood wordt |
|---|---|
| de penalty-update terug buiten de if/else | §1 (beide), §2 en §3 blijven groen |
| `and g.status <> 'completed'` terug in de job | alleen de kétentest — de straf blíjft netjes staan, de job pakt hem alleen nooit op |
| `and g.status = 'active'` uit de insert-policy | alleen §3 |

De tweede is de interessantste: daar klopt elk onderdeel los, en alleen de keten
is stuk. Dat is de vorm die dit project zeven keer duur heeft betaald.

### Wat de security-ronde erbij vond, en waarom het hier landde

De reparatie hierboven deed de voordeur op slot en er bleek een achterdeur naast
te zitten die niemand gebouwd had. 📏 Zelf nagemeten, als gewone ingelogde
eigenaar, in één transactie:

```
s1. rond_doel_af (5 dagen te laat)   straf=set   doel=completed    ← §1 werkt
s2. zet_doelstatus(doel, false)      {"ok": true}   doel=active
s3. rond_doel_af opnieuw             straf=cancelled
```

`zet_doelstatus()` schreef onvoorwaardelijk `case when p_gearchiveerd then
'archived' else 'active' end` en keek nooit naar de stand die er stond. Een
afgerond doel ging dus weer open, en met een streefdatum vooruit is de tweede
afronding "op tijd" — waarna §1 de straf alsnog annuleert via de op-tijd-tak.

**Twee dingen maken dit erger dan een omweg.** De tweede stap in de volledige
client-route is een deadline-verschuiving die een gróepslid goedkeurt, en dat lid
kan een straf op `set` helemaal niet zien: `commitment_zichtbaar_voor_groep()` is
`unlocked, due, resolved`. Je buddy drukt op "akkoord" en heft zonder het te
weten je straf op. En de route loopt niet langs de intrek-knop maar langs "keurig
op tijd afgerond", dus elke mitigatie die aan intrekken hangt — zoals het
getuigebericht dat bij QS8-321 op tafel ligt — zit dan op de ene deur terwijl de
andere openstaat.

**Daarom §4, en daarom hier.** Het is dezelfde klasse als QS8-322 zelf — *afronden
laat je straf vervallen terwijl de afspraak niet gehaald is* — en het besluit van
08-09-2026 zegt dat een bevinding van dezelfde klasse landt op de branch waar hij
gevonden is. Een issue ervan maken zou betekenen dat 0238 merget met een gat waar
precies zijn eigen belofte doorheen loopt.

De weigering geldt in **beide** richtingen en dat is ruimer dan het lek: alleen
het terughalen weigeren laat de route open via archiveren en weer terughalen.
Zonder een kolom die de vorige stand onthoudt is "een afgerond doel is af" de
enige toets die beide dekt — en dat is wat de app al beloofde, want
`bevestiging.doel_afronden.uitleg` zegt met zoveel woorden *"Terugzetten kan
niet"*. De RPC sprak die belofte tegen.

⚠️ **Twee bevindingen uit dezelfde ronde zijn níet gerepareerd maar weggezet**,
allebei met hun terugkeervoorwaarde in `docs/ENGINEER-REVIEW.md`: `v_op_tijd`
rekent met een tijdzone die de gestrafte zelf mag zetten (één extra dag), en §3
weigert sinds deze migratie ook een straf op een gearchiveerd doel — strenger dan
de kop beweert.

⚠️ **En één is een eigen issue geworden**, want hij is van een andere klasse:
`beslis_deadline_verzoek()` draagt de `straf_staat_open`-redenering van
`zet_streefdatum()` niet. Met §4 erbij is de keten gebroken, dus het is geen
ontsnapping meer — maar het blijft een verschuiving die langs een grendel gaat
die er voor bedoeld is.

### Relatie met QS8-321

Dat zijn twee routes naar dezelfde uitkomst — je straf kwijtraken zonder hem te
dragen — en ze krijgen hetzelfde antwoord: het mag, maar niet stilletjes. Bij
QS8-322 is de rem de tijdigheidstoets; bij QS8-321 is het een bericht aan de
getuige. Zie sectie 2.


---

## 3. QS8-333 — een stuurloze straf krijgt de eigenaar weer in handen

**Besluit:** een `security definer`-RPC geeft de eigenaar een verschuldigde straf
terug zodra de getuige verdwenen is. Hij mag een nieuwe getuige aanwijzen **én**
hem afwikkelen.

⚠️ **Dit wijkt af van wat ik voorstelde, en dat hoort hier te staan.** Mijn
voorstel was alleen het eerste: zonder getuige is *"ik heb hem afgewikkeld"* een
verklaring van de gestrafte over zichzelf, en dat is geen commitment device meer.
Quinten koos voor allebei. De rem die daarvoor in de plaats komt is de expliciete
bevestiging (`p_bevestigd`), zoals `archiveer_groep()` die ook vraagt —
domeinregel 5 zegt dat een commitment device nooit stilzwijgend uitgaat, en dit
ís het uitgaan ervan.

### Waar het vandaan kwam

📏 Straf op `due`, de getuige verwijdert zijn account:

```
vooraf:   status=due   getuige=<carol>
verwijder_mijn_account (getuige): {"ok": true}
na:       status=due   getuige=NULL
rijen die de eigenaar daarna mag bijwerken: 0
```

Dat laatste getal is de kern. Niet "lastig", maar **nul**: de rij is in werking en
buiten `service_role` raakt niemand hem nog aan.

### Waarom een RPC en niet de policy die het issue voorstelt

Het issue stelt voor `commitments_update.using` te verruimen met `status = 'due'
and beneficiary_user_id is null`. Dat is gebouwd en gemeten, en het doet precies
het verkeerde:

| Wat de eigenaar dan kan | Uitkomst |
|---|---|
| een nieuwe getuige aanwijzen | GEWEIGERD — `permission denied` |
| zijn eigen due-straf annuleren | **GELUKT** — `status=cancelled` |
| hem afwikkelen naar `resolved` | GEWEIGERD — policy violation |

📏 De kolomgrant is `grant update (body, image_url, status)`;
`beneficiary_user_id` staat er niet in, dus geen policy laat een client ooit een
getuige aanwijzen — "RLS kan geen kolommen beperken", in de omgekeerde richting.
En `with_check` laat alleen `set`/`cancelled` door. 📏 Sterker nog: géén enkele
functie in `public` schreef ooit `resolved`; die stand stond in de CHECK en in
`commitment_zichtbaar_voor_*()` en had geen pad ernaartoe.

De voorgestelde verruiming levert dus één nieuwe bevoegdheid op — de eigenaar mag
zijn eigen verschuldigde straf annuleren — en dat is het bezwaar waarop richting 2
sneuvelde, met de slechtst denkbare hand aan de knop.

**Een kolomgrant erbij is evenmin het antwoord:** die geldt voor élke update van
elke ingelogde gebruiker, en dan staat open wat vandaag dicht zit voor álle
commitments, met alleen nog een policy ervoor. Eén slot waar er nu twee zijn. De
RPC houdt de grant dicht en opent één deur.

**Richting 4 (de groep neemt het over) viel af op een meting.**
📏 `goal_group_links` heeft `primary key (goal_id, group_id)`: een doel kan aan
meerdere groepen hangen en `goals` heeft geen groepskolom. Er is geen "de groep" —
er is een lijst, en welke ervan erft is een nieuw besluit. Regel 18 vraag 6.

### De prijs

Dit is geen regel SQL. Het is een functie met zes weigeringen, een `revoke`/`grant`
in de vorm van onwrikbare regel 4, een eigen auditrij naast die van de trigger, en
een suite van negen tests. Dat is wat "de RPC in plaats van de policy" kost, en het
is de reden dat het geen kleine migratie is.

### Wat het aan een bestaande belofte doet

⚠️⚠️ **Dit vernauwt QS8-312, en de bewaking daarvan merkte het niet.** De kop van
`tests/rls/getuige-blijft.test.ts` beloofde: *een straf die in werking is,
verandert niet meer van getuige, niet van eigenaar, en verdwijnt niet.* Die zin
klopt nu alleen nog zolang de getuige bestaat.

**Alle tests in dat bestand bleven groen**, want ze voeren de directe
tabelroute — en die is nog steeds dicht. De belofte verschoof dus terwijl de
bewaking stil bleef: precies de vorm waar regel 18 voor bestaat. De kop is daarom
bijgesteld, en de nieuwe grens staat als must-deny in
`tests/rls/stuurloze-straf.test.ts` §3: de RPC weigert met
`heeft_nog_een_begunstigde` zolang er een getuige is.

### Hoe het bewaakt wordt

`tests/rls/stuurloze-straf.test.ts` loopt de keten af — straf op `due`, de getuige
verwijdert zijn **eigen** account via `verwijder_mijn_account()`, en pas dan de
RPC. Niet de kolom met de adminclient op `null` zetten: 📏 `bewaak_begunstigde()`
weigert dat, dus dat zou een toestand meten die geen gebruiker kan maken.

Vier grendels, vier losse mutaties, elk precies één rode test:

| Mutatie | Wat er rood wordt |
|---|---|
| `c.status <> 'due'` eruit | 'weigert een straf die nog niet verschuldigd is' |
| de toets op de begunstigde eruit | 'weigert zolang de getuige er nog is' |
| `p_bevestigd is not true` eruit | 'wikkelt niet af zonder bevestiging' |
| `shares_group_with_user()` eruit | 'weigert een getuige buiten je groepen, en jezelf' |

### AC3 — de relatie met QS8-331

QS8-331/0189 is het andere geval waarin een verwijdering een straf onbereikbaar
maakt: daar wist `verwijder_doel()` een bevestigde straf én zijn spoor. Deze
issue is de spiegel — niet *het spoor verdwijnt*, maar *de rij blijft en niemand
kan er nog bij*. Het derde geval van dezelfde klasse is QS8-335, hieronder.


---

## 4. QS8-335 — het wisrecht wint helemaal

**Besluit:** wie zijn account verwijdert, neemt zijn commitments mee **en** de
systeemberichten die daarover in zijn groepen staan.

⚠️ **Dit wijkt af van wat ik voorstelde.** Mijn voorstel was een auditstomp: de
commitmentrij mag mee, maar één geanonimiseerde regel blijft staan zodat het
achtergebleven groepsbericht gestaafd wordt. Quinten koos de andere kant op —
het bericht gaat óók weg. Het bezwaar hieronder staat er niet als voorbehoud maar
zodat de volgende lezer ziet waartegen afgewogen is.

### Waar het vandaan kwam

📏 Straf op `due` met de groep als begunstigde, eigenaar verwijdert zijn account:

```
vooraf:  commitment 1   auditregels 3   systeemberichten 2
verwijder_mijn_account (eigenaar): {"ok": true}
na:      commitment 0   auditregels 0   systeemberichten 2

blijft staan:
  "De inzet die Alice zelf heeft ingesteld, is verschuldigd geworden."
```

Vier cascades wisten het commitment en zijn spoor; de foreign keys van
`chat_messages` naar `profiles` staan op `set null`, dus het bericht bleef — met
de naam als **platte tekst** erin, want `meld_commitment()` bakt
`weergavenaam()` in de zin op het moment dat hij hem plaatst.

**Dat was geen wisrecht maar een halve wissing, en de verkeerde helft
overleefde.** De groep hield de bewering; de administratie die haar kon staven
ging. Daarom was *niets doen* hier niet de neutrale keuze maar de enige
aantoonbaar incoherente — en dat is wat AC1 eigenlijk vroeg.

### Wat het kost

Het besluit schrijft een regel om die al vastlag. Domeinregel 7 zegt dat een
systeembericht een onveranderlijke kopie is die de autorisatie overleeft waaronder
hij gemaakt is. Die zin blijft staan, met sinds vandaag één benoemde uitzondering
in `CLAUDE.md`. Dat is de prijs, en hij is opgeschreven op de plek waar de regel
zelf staat — een regel die stilzwijgend een uitzondering krijgt, is geen regel meer.

**De reikwijdte is met opzet smal, en dat is de conservatiefste lezing van het
besluit:** alleen `commitment_due` en `commitment_unlocked` met de vertrekker als
onderwerp. Zijn gewone berichten blijven staan met een lege afzender.
`goal_completed` blijft ook staan — dat gaat over een doel en niet over een
consequentie, en dit issue ging over straffen.

**Wissen en niet anonimiseren.** Anonimiseren laat de zin staan met "iemand" erin,
en dan hangt er een mededeling over een straf die niemand meer kan navragen —
precies de halve wissing die dit issue is.

⚠️ **De ene plek waar dit op een verbod leunt.** `chat_messages` staat in de
realtime-publicatie en Supabase past RLS niet toe op DELETE. 📏 Nagemeten vóór het
schrijven: `relreplident = 'd'`, dus bij een verwijdering gaat alleen de sleutel
over de lijn. Stond die op `FULL`, dan zou dit blok de body van elk gewist bericht
naar iedere abonnee sturen. Het verbod op `REPLICA IDENTITY FULL` stond er al;
dit is het eerste blok dat er daadwerkelijk op leunt.

### Wat er ná dit besluit alsnog aan de belofte ontbreekt

⚠️⚠️ **"Het wisrecht wint helemaal" klopt nog niet voor iedereen, en dat is met
deze migratie niet opgelost.** De security-ronde wees erop en het is daarna
end-to-end gereproduceerd: wie ooit een goedkeuring introk, kan zijn account
**helemaal niet** verwijderen.

```
verwijder_mijn_account (Alice)
ERROR:  update or delete on table "profiles" violates foreign key constraint
        "approval_withdrawals_approver_id_fkey" on table "approval_withdrawals"
```

📏 `approval_withdrawals.approver_id -> profiles` staat op `delete=a` (NO ACTION),
terwijl de twee andere foreign keys van die tabel op `cascade` staan — maar die
wijzen naar de voltooiing van de ánder, dus ze ruimen niets op. Dat is een andere
klasse dan dit besluit (het gaat niet over wat een straf overleeft maar over een
verwijdering die vastloopt) en staat als **QS8-371** met prioriteit Urgent.

Het hoort hier omdat het de kop van deze sectie relativeert: het besluit is
genomen en gebouwd, en voor een deel van de gebruikers is de deur ernaartoe
dicht. Wie deze sectie leest en denkt dat accountverwijdering nu af is, leest te
snel.

Twee kleinere gaten in dezelfde belofte staan als dossierrij in
`docs/ENGINEER-REVIEW.md`: de weergavenaam blijft in de body van élk ánder
systeembericht staan (en `groepschat()` geeft die body gewoon terug), en er is
geen poort op een lopend commitment bij accountverwijdering.

### Hoe het bewaakt wordt — en de fout die de ijking vond

`tests/rls/wisrecht-wint.test.ts` toetst de belofte: na de verwijdering is er over
die straf nergens meer iets te vinden, en niets ánders gaat mee.

⚠️⚠️ **De eerste versie van die test bewaakte niets, en alleen de mutatie liet dat
zien.** Hij zocht het systeembericht ná de verwijdering op via
`subject_id = <eigenaar>` — maar de foreign key zet juist díe kolom op `null`. De
query vond dus nul rijen omdat de sleutel weg was, niet omdat het bericht weg was.
📏 Gemeten: met het hele delete-blok gesloopt bleef de suite groen.

Dat is regel 18 vraag 3 én vraag 4 in één geval: de test greep naar een plek in
plaats van naar de belofte, en die plek werd door de gemeten handeling zelf
gewist. De reparatie is het bericht-id vóóraf vastleggen en er achteraf op zoeken.
**Dit is het beste argument voor de mutatieplicht dat deze ronde opleverde**: door
erover na te denken zag ik het niet, door de grendel te slopen wel.

Twee mutaties voor twee grendels, want er zijn twee kanten:

| Mutatie | Wat er rood wordt |
|---|---|
| het delete-blok eruit | §1 — er gaat te wéinig weg |
| de filter `system_event in (…)` eruit | §2 — er gaat te véél weg |

### AC3 en de samenhang

De test gaat over wat er ná `verwijder_mijn_account()` van het spoor over is en
niet over de vorm van één cascade. Verlegt iemand later een foreign key, dan
verhuist de belofte mee.

Dit is het derde en laatste geval van dezelfde klasse: QS8-331/0189 (een doel
verwijderen wiste een bevestigde straf), QS8-333/0212 (de getuige verdwijnt en
de rij wordt onbedienbaar), en dit. Alle drie hadden dezelfde vorm — *een
verwijdering elders laat hier iets achter dat niet klopt* — en alle drie zijn ze
nu een besluit in plaats van een gat.
