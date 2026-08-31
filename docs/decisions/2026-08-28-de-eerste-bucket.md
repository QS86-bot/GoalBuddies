# De eerste bucket van dit project — avatars, privé, met het pad als grens

*28-08-2026 — QS8-27. Migraties `0126` t/m `0130`.*

## Wat er vooraf stond, en waarom het geen bug was

`profiles.avatar_url` bestaat sinds migratie `0001`. `Avatar` leest hem en valt
netjes terug op initialen als hij leeg is. Hij is altijd leeg geweest: er was
geen bucket, geen `storage.objects`-policy en geen enkele `.storage`-aanroep in
`src/` of `app/`. 📏 Nagemeten op 28-08-2026: **nul**.

⚠️ **Er was dus niets kapot, en dat is precies waarom geen enkele test dit kon
zien.** Dit is de vorm uit `CLAUDE.md` regel 18, vraag 5 — de keten waarvan elk
schakeltje af is en die nergens aan elkaar zit. `profiles.locale` had dezelfde
vorm tot QS8-115: kolom, CHECK, kolomgrant, leeskant en catalogus, alles af, en
geen schrijfpad. De vraag die hem vindt is niet "werkt dit" maar **"kan een
gebruiker hier daadwerkelijk bij, en langs welke knop?"**

## 1. Privé, en dat was al besloten

`public = true` is de voor de hand liggende keuze en `scripts/storage-controle.mjs`
wordt er sinds 25-08 rood op, met de reden erbij: een openbare bucket omzeilt RLS
volledig, en dat is één woord in een insert. Die controle is gebouwd vóórdat er
een bucket was, juist voor vandaag — "tenzij iemand eraan denkt" was vervangen
door een rode build, en die build heeft zijn werk gedaan.

⚠️ **Dat kost wat, en het hoort hier te staan.** Een privébucket betekent dat elke
weergave een **ondertekende URL** nodig heeft die verloopt. Dat is geen detail
van de opslag maar een eigenschap die door de hele app trekt, en hij levert drie
gevolgen op die elk apart bewaakt worden.

### 1a. `avatar_url` draagt sindsdien een pad en geen URL

De kolomnaam liegt daarmee een beetje. Hernoemen raakt vijf mapping-functies,
twee RPC-returntypes en het gegenereerde typebestand; dat is duurder dan deze
alinea. Wat er niét mag gebeuren is dat een pad ongetekend in een `<Image>`
belandt — een pad geeft geen foutmelding maar een leeg vlak, en `Avatar` valt
alleen terug op initialen bij `null`, niet bij een URL die niet laadt.

**Daarom tekent de datalaag, niet het scherm.** Alle vijf de ophaalpaden — de
chat, de weekafsluiting en haar reacties, de groepsleden, de
beoordelingswachtrij en je eigen profiel — roepen `metGetekendeAvatars()` aan
vóór de rijen een scherm bereiken.

⚠️ **En dat is een naad en geen onderdeel.** Elk pad op zich is te toetsen en
klopt; wat je niet ziet is het zésde pad dat er over een maand bij komt. Vandaar
`npm run avatar:controle`: mapt een bestand een avatar-kolom uit een rij, dan
tekent datzelfde bestand hem ook. Niet "de app tekent ergens" — dat is een
eigenschap van het gehéél die groen blijft terwijl één pad breekt.

⚠️ Die controle loog bij zijn eerste run. Het sleutelpatroon eiste stilzwijgend
één teken vóór `avatar`, dus `author_avatar` kwam erdoor en `avatar_url` niet:
twee van de vijf paden vielen buiten beeld en het script meldde groen. Geijkt in
`tests/scripts/avatar-controle.test.ts`, met beide vormen erin — een controle die
je niet kunt voeden, kun je niet ijken.

### 1b. Tekenen gaat in één ronde per lijst

`createSignedUrls`, meervoud. Per avatar tekenen is een verzoek per rij — de N+1
die schaalbaarheidsregel 12 met naam noemt, en het groepsoverzicht is precies de
plek die daar als voorbeeld staat.

### 1c. De chatcache bewaart geen avatar

De cache leeft tot het einde van de groepsperiode; een ondertekende URL leeft een
uur. Bewaren we hem, dan toont het scherm na een uur geen avatar maar een
*kapotte* avatar. Elk onderdeel klopt hier op zichzelf — het tekenen is goed, de
cache is goed — en het is de combinatie die lekt. `beperkVoorCache()` zet
`sender_avatar` daarom op `null`, en drie tests in `chat-schemas.test.ts` houden
dat vast.

## 2. Het pad is de grens, en niet `owner`

Een object heet `<user_id>/<willekeurig>.<ext>`. Alle vier de policies hangen aan
`(storage.foldername(name))[1]`.

⚠️ **Waarom niet aan `owner`.** Die kolom wordt gezet door de storage-API en is
bij een `service_role`-upload de dienst zelf. Het pad is de enige eigenschap die
de cliënt niet kan vervalsen zonder de policy te breken: schrijven naar
`<iemand anders>/…` valt af op de `WITH CHECK`. Dezelfde redenering als bij
`completion_approvals.subject_id` — de grens hangt aan iets dat de schrijver niet
zelf kiest. `tests/rls/avatarbucket.test.ts` zet `owner` expliciet op de schrijver
zelf, precies wat de API zou doen, en de insert valt er tóch af.

**Lezen is ruimer dan schrijven, en precies zo ruim als de app:** je eigen avatar
altijd, die van een ander alleen als je een groep met hem deelt
(`shares_group_with_user()`, die al bestond — een tweede versie ernaast zou twee
antwoorden op één vraag zijn).

⚠️ **Geen domeinregel 7 hier.** De vraag uit `CLAUDE.md` — "kan hieruit iemands
gemiste week worden afgeleid" — is met nee te beantwoorden. Dát is de reden dat
lezen op groepslidmaatschap mag staan en niet strenger hoeft; niet dat het
onbelangrijk leek.

## 2a. Wat er in `avatar_url` mag staan — `0127`, en waarom `0126` niet genoeg was

📏 Direct na `0126` gemeten in `information_schema.column_privileges`:
`authenticated` heeft UPDATE op **veertien** kolommen van `profiles`, en
`avatar_url` is er één van. Wat er in die kolom staat, is dus niet
noodzakelijkerwijs door de app geschreven — één PostgREST-verzoek zet er iets
anders in. Twee dingen volgen daaruit, en ze zijn verschillend van aard.

**Een willekeurige URL.** `https://volgmij.example/pixel.gif` in je eigen
profiel, en elk groepslid laadt dat adres uit zijn eigen `<Image>`: de
goedkoopste manier om de IP-adressen van een groep te verzamelen.

⚠️ **En hier zat een gat in mijn eigen code.** `metGetekendeAvatars` begon met
`if (getekend.size === 0) return rijen;` — zuinigheid. Levert het tekenen niets
op, en dát is precies het geval bij een lijst met één vreemde URL en verder geen
foto's, dan ging de lijst **ongewijzigd** terug en bereikte die URL het scherm.
Gevonden door de functie met de hand te voeren in plaats van erover na te denken.
De uitkomst is nu per definitie een ondertekende URL of `null`.

**Het pad van een groepsgenoot.** Dit is subtieler en werd door de ondertekening
*niet* gedekt: `avatars_select` laat je zijn avatar lézen, dus de URL wordt netjes
getekend en zijn foto staat naast jouw naam. Geen lek — je zag die foto al — maar
wel iemand anders' gezicht onder jouw berichten.

⚠️ **De reparatie hoort in de database en niet in de datalaag.** Dat de
ondertekening het eerste geval al ving, is een eigenschap van één laag; één
ophaalpad dat de kolom rechtstreeks doorgeeft en de bescherming is weg. `0127`
zet er een CHECK op: `avatar_url is null or avatar_url like id::text || '/%'` —
dezelfde grens als de vier policies, nu ook op de kolom. Een CHECK en geen policy,
want RLS bepaalt wélke rij je mag schrijven en niet wat er in een kolom mag staan.

De vier gevallen staan in `tests/rls/avatarbucket.test.ts` en zijn met de hand
rood gemaakt door de constraint te droppen.

## 3. De dependency: `expo-image-picker`

Een dependency toevoegen is sinds 22-08 een afweging en geen gate, mits hij hier
verantwoord wordt.

**Waarom deze:** hij zit in de Expo-bundel (versie uit `bundledNativeModules`,
`~57.0.10`), werkt op web én native met dezelfde aanroep, en levert
`allowsEditing` met een vierkante uitsnede — wat de meeste foto's vanzelf onder
de 2 MB houdt. Zelf bouwen betekent op web een `<input type="file">` en op native
een native module; dat is precies wat deze package ís.

⚠️ **`base64: true` en geen `fetch(uri)`.** De kiezer geeft op native een
`file://`-uri en op web een `data:`-uri, en `fetch()` op de eerste is in React
Native niet betrouwbaar. De decoder staat met de hand in `avatar.ts`: `atob`
bestaat op moderne Hermes wél maar niet op elke versie die een testtoestel
draait, en een terugval die je nooit kunt zien is geen terugval. Twintig regels
is goedkoper dan een tweede dependency die alleen dit doet — en hij staat onder
test op alle drie de restlengtes van base64, want een decoder die de padding
verkeerd afhandelt, doet het op precies één van die drie fout.

## 4. Drie grenzen, en maar één ervan is beveiliging

`allowsEditing` + `quality` is gemak. `keurBestand()` is gemak: het vangt te
groot en het verkeerde type vóór er iets de deur uit gaat, zodat de gebruiker een
zin leest in plaats van een serverfout. **De bucket is de grendel** — 2 MB en
drie beeldtypes, servergevalideerd, onwrikbare regel 3.

⚠️ De lijst in de app is een kopie van `allowed_mime_types` in `0126`, en dat is
bewust. Een test legt ze naast elkaar. Twee lijsten die uiteenlopen geven een
upload die het formulier doorlaat en de server weigert — precies de vorm van
migratie 0032/0034, waar de test de app-lijst met **zichzelf** vergeleek.

## 5. De volgorde bij het vervangen

Eerst uploaden, dan het profiel bijwerken, **dan pas de oude weghalen**. In die
volgorde is de slechtste afloop een wees in de bucket; andersom is het een
profiel dat naar een bestand wijst dat weg is, en dat is een gebroken avatar voor
iedereen in je groepen. Een wees kost opslag, een kapot pad kost vertrouwen.

## 6. Wat er níet in zit

- **Geen bijlagen bij voltooiingen of chatberichten.** `completions.attachment_url`
  en `chat_messages.attachment_url` blijven leeg; QS8-71 en QS8-72 vragen een
  betaalde tier en een nieuw groepszichtbaar oppervlak, en dat is overleg met
  Quinten. Deze bucket accepteert alleen afbeeldingen en heet `avatars`.
- **Geen verkleining op de server.** De gratis tier heeft 1 GB; 2 MB per gebruiker
  is bij duizend gebruikers 2 GB in het slechtste geval, en dat is een grens die
  we tegenkomen ruim voordat hij pijn doet. `// TODO(paid-tier)` is hier niet
  nodig — de grens verlagen kan zonder migratie van data.
- **Geen moderatie.** Een avatar is zichtbaar voor je groepsgenoten, en een groep
  is drie tot acht mensen die elkaar kennen. Meldknop en moderatie horen bij een
  publiek profiel, en dat bestaat hier niet.


## 7. De reviewronde, en wat er nog vier migraties bij kwam

Onwrikbare regel 19 vraagt de `security-reviewer` bij alles wat uploads, auth of
RLS raakt. Hij is gedraaid en gaf **blokkerend**. Vier bevindingen zijn hier
nagemeten en gerepareerd; alle vier zijn met de hand rood gemaakt vóór en groen
ná de reparatie.

⚠️ **De vier sloten op de bucket zelf hielden.** In andermans map schrijven,
andermans foto lezen, verwijderen, hernoemen naar je eigen map, `owner` op jezelf
zetten — zes aanvallen, alle zes vastgelopen. De keuze voor het padsegment boven
`owner` is de juiste. **De problemen zaten allemaal in de laag eromheen**, en dat
is precies waar regel 18 zegt dat ze zitten.

### 7a. Er was een zesde ophaalpad, en de controle kon het niet zien — `0128`

`fetchUitnodiging` geeft het resultaat van `invite_preview` door met een spread;
`app/uitnodiging/[code].tsx` rendert daaruit `<Avatar url={lid.avatar_url} />`.

Twee gaten tegelijk, allebei gemeten:

1. **`avatar:controle` deed `TEKENT.test(inhoud)` — één regex over het hele
   bestand.** `buddies/api.ts` telde als "tekent" omdat `fetchGroepsoverzicht` op
   regel 376 tekent, terwijl `fetchUitnodiging` op regel 786 het niet deed. **Eén
   tekenende functie immuniseerde negenhonderd regels.** De controle kijkt nu per
   blok plus zijn aanroepers — niet per bestand (dat pleit te veel vrij) en niet
   per blok alleen (dat maakt alle vier de goede ophaalpaden rood, want de vorm
   hier is een kleine `naarX(rij)` die mapt naast een `fetchX()` die tekent).
2. **En de eigenlijke bevinding is geen kapotte avatar maar een identiteitslek.**
   `invite_preview` is `SECURITY DEFINER` en gaf `avatar_url` aan elke *ingelogde*
   aanroeper. Tot `0126` was die kolom altijd leeg, dus dat kanaal was inert;
   sindsdien is het eerste padsegment de `auth.uid()` van dat lid. Een
   uitnodigingscode verloopt nooit en is bedoeld om doorgestuurd te worden — dus
   iedereen met een account die de link krijgt, heeft met één RPC-aanroep de
   interne id's van acht mensen.

⚠️ **Ondertekenen lost punt 2 níet op**, en dat bepaalt waar de reparatie hoort:
een signed URL draagt het pad in zich. `0128` laat de functie `null` teruggeven.
De uitnodigingspagina toont voortaan initialen.

⚠️ **Dit is dezelfde verruiming die `0019` heeft dichtgezet, langs een andere
weg.** Die inperking gold voor de niet-ingelogde tak; de ingelogde tak is nooit
heroverwogen, en `0126` vulde de kolom die eronder hing. **Niemand heeft dit
besloten; het was bijvangst** — en dat is precies de vorm waarvoor CLAUDE.md zegt
dat beschermd het antwoord is tot iemand het tegendeel besluit.

### 7b. De CHECK toetste alleen het begin — `0129`

`0127` zegt in zijn eigen kop twee gevallen te sluiten. Het eerste was dicht. Het
tweede — "het pad van een groepsgenoot", uitdrukkelijk het geval dat de
ondertekening níét dekt — niet: `like '<mij>/%'` laat `<mij>/../<ander>/a.png`
door, en ook een regeleinde met een externe URL erachter. Nu een vormtoets.

⚠️ Of dat werkelijk exploiteerbaar was, hangt ervan af of de Storage-API `..`
normaliseert — niet te meten zonder die dienst. **Dat is de reden om het te
sluiten en niet om het af te wachten.**

### 7c. Twee gaten in de bucket zelf — `0130`

- **Eén object met een niet-uuid mapnaam legde het lezen van de hele bucket
  plat.** De kale cast gooit op elke rij die niet past, en een fout in een
  policy-expressie sloopt de héle query. `authenticated` kan zo'n object niet
  maken; de Storage-browser van het dashboard zet er bij "nieuwe map" één neer.
- **Geen enkele grens op het aantal uploads.** 500 objecten in één statement,
  zonder weerstand. 1 GB gratis tier ÷ 2 MB = 512 uploads en niemand kan er meer
  bij. Dat `uploadAvatar` de vorige opruimt helpt niet — wie dit doet gebruikt de
  app niet. Nu een trigger op tien per map.

### 7d. Een geslaagde update die niets deed

`.update(...).eq('id', userId)` zonder `.select()`: PostgREST geeft bij nul
geraakte rijen géén fout, dus een weigering meldde `{ ok: true }` terwijl het
bestand in de bucket stond en niets ernaar wees. Nu `.select('id').single()` —
hetzelfde patroon dat `updateProfiel()` twintig regels verderop om precies deze
reden al gebruikte.
