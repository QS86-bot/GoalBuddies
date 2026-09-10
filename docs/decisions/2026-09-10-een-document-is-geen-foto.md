# Een document is geen foto

**Datum:** 10-09-2026 · **Issue:** QS8-72 (PRD 7.4) · **Migraties:** 0240, 0241, 0242, 0243 · **Vervolg:** QS8-408 (0247)

Dit document is de tegenhanger van
`docs/decisions/2026-09-09-een-foto-in-de-chat.md`. Wat daar staat over het pad,
de vier policies, de twee tellers en het AVG-verwijderpad geldt hier onverkort en
wordt niet herhaald. **Hier staat alleen wat ánders is** — en dat is meer dan de
gelijkende vorm doet vermoeden.

## 1. Waarom dit geen kopie is, ook al ziet het er zo uit

§6 van het fotodossier legt uit waarom het bij een foto niet erg is dat de emmer
alleen de *gedeclareerde* MIME-header toetst en niet de bytes:

> het belandt in een `<Image>` — willekeurige bytes renderen niet en voeren niets
> uit.

**Een document belandt niet in een `<Image>`.** Het gaat via een ondertekende URL
naar de systeembrowser, en dáár is een `text/html` vanaf de storage-origin
uitvoerbare code — met leesrecht op alles wat die origin verder bewaart.

Het hele veiligheidsargument van QS8-71 valt daarmee weg, en er komt één ding
voor terug: **de allowlists van de emmers.** `allowed_mime_types` van `chatdocs`
staat op `array['application/pdf']`.

⚠️⚠️ **Meervoud, en dat is een correctie van de eerste versie van deze
paragraaf.** Daar stond *"de allowlist van de emmer, en niets anders"*. 📏 De
securityronde van 10-09-2026 mat het tegendeel, en ik heb het zelf nagemeten:

```sql
-- als authenticated, lid van <g>
update storage.objects set bucket_id = 'chatdocs', name = '<g>/<u>/plaatje.pdf'
 where bucket_id = 'chatfotos' and name = '<g>/<u>/plaatje.jpg';
→ 1 rij, bucket_id = chatdocs
```

Policies worden over emmers heen ge-OR'd: de `using` van de brónemmer dekt de
oude rij, de `with check` van `chatdocs_update` de nieuwe, en op databaseniveau
kijkt niets terug naar het type of de grootte. **Het effectieve typebereik van
`chatdocs` is dus de unie over élke emmer waar een lid vandaan mag verhuizen** —
vandaag `avatars`, `chatfotos`, `bewijsfotos` en `chatdocs` samen, dat is
{pdf, jpeg, png, webp}, en die zijn alle vier inert. **Er staat vandaag dus
niets open.**

Wat er wél openstond, was de aanname. De beloftetest toetste de denylist alleen
tegen de tekst van 0240; wie er over een half jaar een vijfde emmer naast zet met
`image/svg+xml` (heel gewoon, voor iconen) verruimt déze emmer zonder dit
document te lezen, en de test blijft groen. Sinds 10-09 leest die test **elke**
`insert into storage.buckets` in de hele migratiemap.

**En de route hierhéén is daarna dichtgegaan.** Terwijl deze branch openstond
landde QS8-396 op `main`, en §1b van dié migratie trekt `chatfotos_update` in —
op precies dezelfde meting, van de andere kant: een `upsert` omzeilt het
dagplafond omdat de teller aan INSERT hangt. Toen dat besluit er eenmaal lag, was
`chatdocs_update` laten staan de nieuwste emmer de losste maken. Dus is hij hier
ook weg: **er is geen `chatdocs_update`.** Zonder UPDATE-policy op de doelemmer
voldoet de nieuwe rij aan geen enkele `with check`, en de verhuizing hierheen is
onmogelijk. 📏 Nagemeten na het intrekken: dezelfde `update` geeft nul rijen.

Het recht had sowieso geen aanroeper — `upsert: false` overal, geen `.move()` en
geen `.copy()` in `src/` of `app/`. Geen recht zonder knop, zelfde regel als
0193.

Wat er **niet** mee gerepareerd is: `avatars` en `bewijsfotos` dragen hun
UPDATE-recht nog, dus daartússen kan het nog steeds, en de aanname over de
Storage-API (heeft die het recht nodig bij een gewone upload?) is nog niet tegen
het echte project gemeten. Dat is QS8-407, met een rij in
`docs/ENGINEER-REVIEW.md`.

De vraag bij elke uitbreiding is daarom niet "is dit formaat gangbaar" maar
**"routeert een browser dit ooit naar de HTML-parser, direct of via XSLT"**. Bij
twijfel is het antwoord nee. Acht typen staan met naam en reden in de denylist
van `tests/beloftes/een-document-voert-niets-uit.test.ts`:

| Type | Waarom nooit |
|---|---|
| `text/html` | is per definitie uitvoerbaar vanaf de storage-origin |
| `application/xhtml+xml` | zelfde parser, andere naam |
| `image/svg+xml` | draagt `<script>` en wordt buiten een `<img>` uitgevoerd |
| `application/xml`, `text/xml` | kan met een xml-stylesheet-instructie naar XSLT |
| `text/xsl` | is de XSLT zelf |
| `text/plain` | is historisch door browsers gesniffd |
| `application/octet-stream` | ontkoppelt type van extensie en laat daarmee álles binnen |

⚠️ **De denylist is het deel dat vooruit kijkt.** De gelijkheidstoets tussen
`CHATDOC_TYPES` en de migratie vindt een verschíl tussen app en emmer; hij vindt
niet dat iemand `image/svg+xml` aan *allebei* toevoegt — en dat is precies hoe
deze grendel zou wegvallen. De denylist zegt daarom niet "de lijst is deze", maar
"deze acht mogen er nooit in".

⚠️ En één plek maakt de allowlist tot een suggestie als je hem verkeerd bouwt:
`uploadChatdoc()` declareert `contentType: 'application/pdf'` **hard**, niet
`bestand.mime`. Wat de emmer bewaart is wat hij terugserveert, en de emmer toetst
de gedeclareerde header. Kwam die van de client, dan toetst de emmer de client
tegen de client.

## 2. Vier bewuste afwijkingen van `chatfoto.ts`

| | chatfoto | chatdoc | Waarom |
|---|---|---|---|
| typen | drie | **één** | §1 |
| omvang | 1 MB | **5 MB** | 1 MB is twee tot vier gescande pagina's op 150 dpi; de bestanden die mensen wíllen delen zitten op 1–4 MB |
| geldigheid van de URL | een uur | **een kwartier** | inhoud (`jaarrekening-2026.pdf` draagt een BSN, een chatfoto is een moment) en route (de URL verlaat de app naar geschiedenis en downloads) |
| tekenen | per pagina | **per tik** | §3 |

⚠️ **De aantallen volgen uit byte-pariteit en niet uit smaak.** `chatfotos` staat
op 20/groep × 1 MB; `chatdocs` op **4/groep × 5 MB** en **2/lid**. Wie dit later
verruimt, redeneert in bytes en niet in stuks.

## 3. Tekenen per tik, en waarom dat géén N+1 is

Dit is de afwijking die tegen de gewoonte van dit project in gaat, dus hij staat
uitgeschreven.

Een foto **móet** per pagina getekend worden: dertig foto's renderen tegelijk, en
per rij tekenen zou de N+1 zijn die schaalbaarheidsregel 12 verbiedt. Vandaar
`metGetekendeChatfotos()`.

Een document rendert niets tot iemand tikt. Per pagina tekenen zou dertig bearer
tokens uitgeven voor bestanden die niemand opent, elk een kwartier geldig. **Eén
verzoek per tik is dáármee mínder verkeer dan het fotopad, niet meer** — er is
geen lus, dus er is geen N+1. Er is met opzet géén `metGetekendeChatdocs()`.

⚠️⚠️ **Het gevolg is een tegengestelde belofte op hetzelfde veld.** Bij een
`photo`-bericht is `attachment_url` in de app een **ondertekende URL**; bij een
`doc`-bericht is het een **kaal pad**. Eén component dat allebei zou aannemen, is
één verwisseling verwijderd van een leeg vlak of van een pad in een `openURL()`.

De grendel daartegen is een prop die er niet is: `Document.tsx` krijgt geen
`url`, geen `pad`, geen `href` en geen `uri`. Het enige dat het kan doen is
`onOpenen()` roepen, en `useDocumentOpenen()` tekent eerst.
`tests/beloftes/een-document-voert-niets-uit.test.ts` toetst allebei.

## 4. De drieklank: soort, extensie, emmer

`attachment_url` draagt de emmer niet. Het pad is `<groep>/<afzender>/<naam>.<ext>`
en dat is voor `chatfotos` en `chatdocs` identiek. **`type` is het enige dat zegt
waar dit bestand staat**, en migratie 0242 is wat die twee gekoppeld houdt:

```sql
(type = 'photo' and attachment_url ~ '…\.(jpg|jpeg|png|webp)$')
or
(type = 'doc'   and attachment_url ~ '…\.pdf$')
```

⚠️ **Zonder die paring breekt er niets zichtbaars als ze uit elkaar lopen.** Je
tekent tegen de verkeerde emmer, krijgt `null`, en de bubbel zegt "dit document
is niet meer beschikbaar". Elk onderdeel groen, de belofte stuk — vraag 1 en
vraag 3 van regel 18 in één geval. `tests/rls/een-document-is-wat-het-zegt.test.ts`
bestaat hiervoor, en de app-kant ervan (`soortBijlage()` kent élke soort die de
CHECK een bijlage gunt, en omgekeerd) staat in de beloftesuite.

⚠️ Om dezelfde reden is `Chatbijlage` in `ChatRegel.tsx` een **unie** en geen twee
optionele props: twee props laten een vierde stand toe — foto én document in één
bubbel — die de tabel niet kan opleveren.

## 5. De naam is niet het pad

Het pad krijgt een **gegenereerde** naam met een harde `.pdf`; de naam die de
gebruiker koos gaat naar `chat_messages.attachment_name`. Twee kolommen waar één
string had gekund, en daar zijn drie redenen voor.

**a. Emoji mogen in de naam en niet in het pad.** De pad-CHECK laat alleen
`[A-Za-z0-9._-]` toe. CLAUDE.md zegt dat de gebruiker overal emoji mag typen;
`schoneBestandsnaam()` kapt daarom met `kapAf()` op **codepunten** en nooit met
`slice()` op UTF-16-eenheden.

**b. De extensie in het pad komt niet van de gebruiker.** Een `.PDF` of een
`.tar.gz` haalt de CHECK dus nooit, en het pad is per constructie in kleine
letters — waar 0225 voor de chatfoto nog een reparatie voor nodig had.

**c. ⚠️⚠️ Bidi-tekens.** Met een RLO (U+202E) erin rendert `verslag<RLO>fdp.exe`
in de bubbel als `verslagexe.pdf`, terwijl het pad `.pdf` zegt en de bytes iets
anders zijn. Dat is een leugen die de app met het vertrouwen van de groep
erachter vertelt. De CHECK `chat_messages_attachment_name_vorm` weigert die
tekens; `schoneBestandsnaam()` zorgt dat de gebruiker die weigering niet te zien
krijgt. **De twee tekenklassen — één in TypeScript, één in Postgres — staan onder
test naast elkaar**, want een naad tussen twee reguliere expressies in twee talen
verloopt zonder een woord.

⚠️ 📏 **De eerste versie van die klasse noemde alleen `\u200E\u200F` en liet drie
families door** — U+061C (ARABIC LETTER MARK), U+200B–U+200D (zero-width) en
U+2028/2029 (line/paragraph separator), gemeten in de securityronde van
10-09-2026. Geen van drieën is een override, dus het geval hierboven bleef dicht;
wat er fout aan was, is dat twee van de drie bidi-marks geweigerd werden en de
derde niet. **Een willekeurige grens is er een die de volgende lezer
verschuift.** De klasse dekt nu de hele Cf-familie die een label kan vervalsen of
breken.

En om diezelfde reden leest de UI de soort uit het **pad** (`soortUitPad()`) en
nooit uit de naam: anders stelt `factuur.pdf.exe` zich voor als PDF.

## 6. De botsing tussen twee correcte grendels

De eerste versie van 0242 eiste `type <> 'doc' or attachment_name is not null` —
een document draagt een naam. Dat botste met de AVG-opruiming van 0243:

```
delete from profiles where id = <a>
→ Aan een chatbericht zijn alleen de tekst en de bijlage te wijzigen
```

`stamp_chat_message()` maakt `type` **onveranderlijk**, dus 0243 kon de rij niet
op `text` terugzetten om van de naam-eis af te komen.

De keuze was: de onveranderlijkheid verruimen, of de CHECK aan de **bijlage**
hangen in plaats van aan de soort. **Het eerste mag niet** — `type` is precies
het veld dat bepaalt tegen welke emmer de client tekent (§4), en dat hoort het
minst veranderlijke veld van de rij te zijn.

Dus: een document draagt een naam **zolang het een bijlage heeft**. Gaat de
bijlage weg, dan gaat de naam mee — die is zelf een persoonsgegeven,
`jaarrekening-jansen.pdf` zegt genoeg zonder dat er een byte van het bestand over
is — en blijft er een `doc`-rij zonder bijlage over. Het scherm toont daar "dit
document is niet meer beschikbaar", en dat is waar.

⚠️ Twee correcte grendels die elkaar in de weg zitten, en de goedkoopste uitweg
is de verkeerde. Het staat hier omdat de volgende lezer anders dezelfde afweging
opnieuw maakt en misschien de andere kant op valt.

## 7. `wis_chatfotos_van_vertrekker` heet nu `wis_bijlagen_van_vertrekker`

De functie dekt sinds 0243 `('chatfotos', 'chatdocs')`. De oude naam zou liegen
over wat het lichaam doet — hetzelfde geval als `zonderAvatar` →
`zonderVerlopendeUrls`: **de naam noemt de eigenschap, niet het veld van toen.**
De trigger heet mee (`profielen_bijlagen_mee`).

## 8. Een dependency erbij: `expo-document-picker`

Een afweging en geen gate (Beslisbevoegdheid, 22-08-2026), dus hier de
verantwoording. Er is geen manier om op iOS en Android een bestandskiezer te
openen zonder native module, en `expo-image-picker` doet alleen media.
`expo-document-picker` is een first-party Expo-pakket in dezelfde SDK-lijn als de
vier die er al staan; het alternatief was documenten alleen op web toestaan, en
dat is een halve feature met een verborgen platformgrens.

⚠️ `kiesDocument()` staat in `shared/ui` en niet in `modules/buddies`, en dat is
een gemeten plaatsing: de kiezer sleept react-native mee, en een module-barrel
wordt geïmporteerd door tests die geen RN-omgeving hebben. 📏 Bij QS8-71 viel
`tests/rls/doorloop.test.ts` precies zo om op `ReferenceError: __DEV__ is not
defined`.

📏 Om diezelfde keten staat `naarVerzending()` in een **eigen** bestand
(`verzendbijlage.ts`) naast `useChatbijlage.ts`: met de functie ín de hook krijgt
elke suite die hem importeert `Flow is not supported` op
`node_modules/react-native/index.js`, en dan draait er geen enkel geval.
`vi.mock` op de twee kiezers helpt daar niet, want de keten loopt verder. De
belofte die die functie draagt — **een foto krijgt nooit een `naam`-veld, ook
geen leeg, want `typeof '' === 'string'` en dan gaat een jpeg naar `chatdocs`** —
is te belangrijk om onmeetbaar te zijn.

## 9. Wat hier bewust niet in zit

- **Een voorvertoning van de eerste pagina.** Vraagt een renderer of een
  serverzijdige transformatie; `// TODO(paid-tier)`-terrein.
- **Meer dan één type.** Zie §1. Een `.docx` of `.xlsx` is niet uitvoerbaar in een
  browser, maar het is een eigen besluit met een eigen afweging over omvang en
  over wat de emmer terugserveert — geen regel die je er stil bij schrijft.
- **Meer dan één bijlage per bericht.** `chat_messages` heeft één
  `attachment_url` en één `type`, en de CHECK paart die twee. Meerdere vraagt een
  eigen tabel.
- **Een document in een systeembericht.** Nooit: de CHECK sluit `type = 'system'`
  uit, en een systeembericht noemt de persoon en de gebeurtenis, nooit een titel
  of een bestand (dossier 002 §3).
- ~~**De opruimpas voor wezen in de emmer.**~~ ✅ **Gebouwd op 10-09 in QS8-408,
  migratie 0247** — zie §10. Wat hier stond ("zelfde grens als 0224 en 0230: SQL
  kan de blob niet weghalen") klopte, en de uitweg was de arbeidsdeling die 0235
  al had bedacht: de database wijst aan, de rollover wist.

## 10. Nagekomen: het document volgt alsnog dezelfde weg — QS8-408, migratie 0247

§5 hierboven sluit met een asymmetrie die geen besluit was: een verweesde foto
bleef staan en een verweesd document werd gewist. Dat verschil kwam volledig uit
de leespolicy — `chatfotos_select` hing sinds 0235 §1 aan het **bericht**,
`chatdocs_select` aan het **pad** — en zolang dat zo was, wás wissen het juiste
antwoord: een wees zou anders voor de hele groep leesbaar blijven.

0247 haalt de oorzaak weg, en dan mag de rest mee:

1. **`chatdocs_select` hangt aan het bericht**, in de vorm van 0235 §1. Inclusief
   het eigenaarsbeen, en dat is hier dwingender dan bij de foto: Postgres past de
   SELECT-policy óók toe op `delete … where`, dus zonder die tak kan de plaatser
   zijn eigen wees niet opruimen — en dan sterft de compenserende opruiming van
   `stuurBericht()` stil, want `remove()` geeft geen fout op nul rijen.
2. **Een opruimpas**: `chatdoc_bewaartermijn()` en `verlopen_chatdocs()`, in de
   vorm van 0235 §3. De pas wijst aan en wist niets; de rollover doet het
   `storage.remove()` dat als enige de blob meeneemt.
3. **`wis_bijlagen_van_vertrekker()` laat het object staan**, voor beide emmers.
   Het weglaten van die `delete` ís de reparatie, en dat leest averechts: de rij
   láten staan is wat het bestand écht doet verdwijnen.

**De termijn is 21 dagen — besluit van Quinten, 10-09-2026**, gelijk aan de
chatfoto.

⚠️⚠️ **Dit is bewust gevráágd en niet aangenomen, en dat is de uitzondering op de
gewoonte van dit project.** CLAUDE.md zegt: kies zelf en bouw door. Deze keuze
raakt allebei de grenzen uit *Beslisbevoegdheid* tegelijk — de app **toont** de
termijn (grens 1) en de rollover **wist er onherroepelijk bestanden mee** op een
tier zonder backups (grens 2). Een rollback zet de pas uit en zet geen documenten
terug.

De securityronde wees daarop, en die had gelijk: de eerste vorm van deze
paragraaf noemde het een aanname en bouwde door. Het verschil met een foto is
niet gek — een gescand formulier of trainingsschema wordt eerder ná drie weken
teruggezocht dan een kiekje — en juist daarom is het een vraag van één regel
waard. Het antwoord: één termijn voor alle bijlagen.

⚠️ **Twee constanten en twee databasefuncties, met een test die zegt dat ze
vandaag gelijk zijn.** Samenvoegen zou van twee productkeuzes één maken; los
laten staan zonder toets laat ze uit elkaar lopen zonder dat iemand het besluit.
`tests/rls/chatdoc-bewaartermijn.test.ts` legt alle vier naast elkaar, en dat
geval is uitdrukkelijk géén defect als het ooit rood wordt — het vraagt dan om
een reden.

⚠️ **Zusterfuncties in SQL, één lus in de rollover.** De twee passen delen hun
vorm en niet hun regel: emmer en termijn zijn per soort inhoud een eigen keuze,
en het lichaam is vier regels. Wat wél zou gaan rotten als het twee keer bestond,
is de uitvoerende helft — het aftoppen dat zichzelf meldt, het blokgewijs wissen,
het doortellen bij een fout, het tellen op de teruggave van `remove()`. Dat zijn
vier grendels die stuk voor stuk uit een bevinding komen, en die staan nu één
keer in `supabase/functions/rollover/index.ts`. De tegenproef die dit project
kent (0233/0234, *"twee tellers voor één regel is een halve familie"*) ging over
twee grendels die dezélfde regel handhaafden; dit zijn er twee met elk een eigen
getal.

📏 **Negen grendels apart met de hand gebroken en rood gezien**, en één ervan was
een bevinding over de test zelf: *"houdt zich aan het limiet"* bleef groen toen
de `limit` op 500 gezet werd, want er stonden op dat moment niet eens twee
kandidaten. De test zet ze er nu eerst neer. Vraag 3 van onwrikbare regel 18, op
een test van vandaag.
