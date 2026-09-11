# Een `copy` is geen `move` — QS8-416, migratie 0253

**11-09-2026.** Raakt `storage.objects`, de vier emmers, `tests/rls/emmerverhuizing.test.ts`
en de kop van 0235, 0239 en 0240.

## 1. Wat er aan de hand was

0239 trok elk UPDATE-pad op `storage.objects` in en schreef in zijn kop dat daarmee
óók het move/copy-eindpunt van de Storage-API dicht was. De eerste helft klopt; de
tweede niet.

📏 Gemeten tegen de lokale stack uit alle 255 migratiebestanden, vóór deze migratie:

```
select polcmd::text, count(*) from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'storage' and c.relname = 'objects' group by 1;
→ a|4   d|4   r|4        (géén 'w', géén '*')
```

`move` is een **UPDATE** en valt onder die drop. `copy` schrijft een **nieuwe rij**
— een INSERT — en raakt hem nooit. De enige poort die een `copy` passeert is de
INSERT-policy van de doelemmer, en drie van de vier toetsten alleen de map en de
eigenaar.

Diezelfde zin was overgenomen in 0235, in 0240 en in twee dossierrijen. **Een
onjuiste aantekening bij een grendel is gevaarlijker dan geen aantekening**: wie
0239 leest, concludeert dat deze route dicht is en kijkt niet verder.

## 2. Waarom het verweer in 0239 niet dekte

De drop werd onderbouwd met *"nul treffers op `.move(` of `.copy(` in `src/` en
`app/`"*. Dat is een goede reden om een recht **in te trekken** — geen recht zonder
reden — maar het is geen bewijs dat de **route** dicht is. Een client praat
rechtstreeks met de Storage-API; onze eigen call sites zeggen daar niets over.

📏 En de route bestaat in de SDK die in deze repo staat:

```
node_modules/@supabase/storage-js  → 2.112.3
dist/index.d.mts:1149  copy(fromPath, toPath, options?: DestinationOptions)
dist/index.d.mts:279   interface DestinationOptions { destinationBucket?: string }
```

Dat is dezelfde vorm als de les die in `CLAUDE.md` bij domeinregel 7 staat: *de
schermen hielden de regel aan terwijl de database hem lekte.* Hier hield onze code
zich aan een grens die de database niet trok.

## 3. Waarom de naam en niet de herkomst

**De grendel die je hier eigenlijk wil, bestaat op databaseniveau niet.** Een
INSERT-policy ziet één ding: de nieuwe rij. Of die rij ontstaan is uit een upload,
uit een `copy` van elders of uit een handmatige `insert`, staat er niet in — er is
geen `old` bij een INSERT en geen kolom die de herkomst draagt. Een policy kan dus
niet zeggen *"deze bytes komen uit een andere emmer"*.

Wat er wél te pinnen is, is de **naam**. Die is per emmer al betekenisdragend: de
map bepaalt de groep of het weekdoel, en `chatdocs_insert` pinde sinds 0240 al de
extensie. 0253 trekt de andere drie bij.

### ⚠️⚠️⚠️ En hier ging de eerste versie van dit document de fout in

Deze paragraaf stond er eerst met een tabel die zei dat 0253 *"de kruisrichtingen
sluit"* — een `.pdf`-naam in een fotoemmer dicht, een beeldnaam in `chatdocs`
dicht, en alleen de gelijkgetypeerde richting open. **Dat is onjuist, en de
securityronde op deze branch heeft het eruit gehaald.**

📏 **Bij een `copy` kiest de aanvaller de doelnaam.** Gemeten in
`node_modules/@supabase/storage-js/dist/index.mjs:982-991`:

```js
`${_this7.url}/object/copy`, { bucketId, sourceKey: fromPath,
  destinationKey: toPath, destinationBucket: options?.destinationBucket }
```

`sourceKey` en `destinationKey` zijn twee losse parameters. Wie een pdf van 4 MB
uit `chatdocs` in `chatfotos` wil hebben, noemt hem `onschuldig.jpg`.

📏 Zelf nagemeten als `authenticated` met echte claims, ná 0253:

```
chatfotos    <groep>/<uid>/onschuldig.jpg           → DOORGELATEN
bewijsfotos  <weekdoel>/<uid>/onschuldig.jpg        → DOORGELATEN
avatars      <uid>/onschuldig.jpg                   → DOORGELATEN
chatdocs     <groep>/<uid>/eigenlijk-een-foto.pdf   → DOORGELATEN
```

Alle vier. **Een naamregel sluit dus de naam en niet de richting.** Wat de pin
dichtzet is de richting waarin de kopieerder zijn bronextensie behóudt, en dat doet
niemand.

### Wat 0253 dan wél waard is

Precies wat 0240 voor `chatdocs` deed, met dezelfde reden: *de vorm van de
bestandsnaam hoort in de policy en niet alleen in de padbouwer.* Daar was de meting
een lid dat `<groep>/<zelf>/evil.html` in de emmer plaatste. Die klasse — een naam
die niet bij de emmer past, hoe de rij er ook in komt — is nu in alle vier de
emmers een databaseeigenschap.

Dat is een kleinere belofte dan "de copy-route is dicht", en het is de belofte die
waar is.

### En de open route is zwaarder dan ik hem opschreef

| Richting | Plafond | Types | Stand |
|---|---|---|---|
| `bewijsfotos` → `chatfotos` | 1 MB → 1 MB | gelijk | open, en ónschuldig |
| **`chatdocs` → fotoemmer** | **5 MB → 1 MB** | **pdf → beeld** | **open, en dit is de zwaarste** |

De eerste versie van dit document noemde alleen de bovenste rij en zette de
dossierrij daarmee op **Laag**. Die staat nu op **Middel**, met de onderste rij
erin. De begrenzing die het geen Kritiek maakt: de dagtellers vuren óók op een
`copy` (BEFORE INSERT per emmer), dus het is misbruik-op-schaal op de gratis tier
en geen rechtenverhoging.

⚠️ **Op databaseniveau is dit niet te sluiten.** De grendel zit aan de
servicelaag — het `copy`-eindpunt — en dat is een dashboardkeuze en geen migratie.

## 4. Waarom de correctie in 0235, 0239 en 0240 zelf staat

Een migratie achteraf aanraken is in dit project normaal gesproken de verkeerde
beweging. Hier is het toch gedaan, om drie redenen die alle drie te controleren
zijn:

1. **Het gaat uitsluitend om commentaar.** Geen enkele regel SQL is aangeraakt, dus
   de schemavingerafdruk verandert niet en `idempotent:controle` merkt er niets van.
2. **Geen van de drie is toegepast.** Ze zitten in het gat `0222`–`0253` dat op
   Quintens machine wacht (`docs/WERKVOORRAAD.md` §0).
3. **De onjuiste zin stáát daar, en daar wordt hij gelezen.** Alleen vooruit
   corrigeren — een regel in 0253 — laat drie bestanden achter die het tegendeel
   beweren, en de volgende lezer opent de oudste.

De correcties zijn gemarkeerd als *GECORRIGEERD OP 11-09-2026 (QS8-416)* en
*PRECISERING*, zodat de oorspronkelijke bewering leesbaar blijft naast wat er niet
aan klopte. Een stille herschrijving zou de geschiedenis wegpoetsen die hier het
leerzaamste deel is.

## 5. Wat de test nu toetst, en waarom hij dat niet deed

`tests/rls/emmerverhuizing.test.ts` heet *een object verhuist niet tussen emmers* en
toetste één van de twee routes. De scherpste assertie filtert
`polcmd in ('w', '*')`; een `copy` is `polcmd = 'a'` en raakt hem per constructie
nooit. **Regel 18 vraag 3 in zijn zuiverste vorm, op een grendel van dezelfde dag.**

De nieuwe test vraagt het aan de handeling: per emmer een pad dat verder volledig
geldig is — juiste diepte, juiste eerste segment, eigen uid — en alléén een vreemde
extensie draagt. Dat laatste is de kern van de ijking: voert het geval zijn pad
door een regel die de mapcontrole al afvangt, dan bewaakt de test die regel en niet
de extensie.

`VREEMDE_NAAM` is een register en geen gemak, om dezelfde reden als `PADEN`
ernaast: welke extensie "vreemd" is verschilt per emmer. Een vijfde emmer zonder rij
maakt de test **rood** in plaats van hem stil over te slaan.

⚠️ **De open richting uit §3 staat bewust in géén enkele assertie.** Een
`expect(…)` dat een weigering eist is vandaag rood en liegt dus over de stand; een
`expect(…)` dat de toestemming vastlegt wordt rood op de dag dat iemand hem alsnog
sluit — en dan straft de suite een verbetering af. Wat open is hoort in het dossier.

### ⚠️⚠️ En de eerste versie van die test kon niet zeggen waaróm er geweigerd werd

Ook dit kwam uit de securityronde en niet uit mijn eigen ijking. 📏 Gemeten: met
`chatfotos_insert` op `with check (false)` bleef de nieuwe test **groen** — alleen
de must-allow viel om.

De oorzaak is dat `verhuispoging()` élke fout slikt. Een weigering zegt dan niets
over de grond: een typefout in de opstelling, een kapotte fixture of een
blanket-weigering leest hetzelfde als "de naamregel greep in". De kop van dit
bestand legt precies dát uit bij `staatErEcht()` — en de nieuwe test gebruikte die
positieve controle niet. De koppeling zat in een ánder `it`, met ándere
bestandsnamen (`nieuw-chat.jpg` tegenover `vreemd.pdf`), dus de twee konden uit
elkaar lopen.

**Gerepareerd door het paar binnen dezelfde test te leggen, per emmer:** hetzelfde
pad met de goede extensie moet erín, met de vreemde eruit. 📏 Mutatie N daarna: 2
rood in plaats van 1, met `chatfotos` in beide meldingen.

## 6. De ijking, en twee fouten die zij zelf opleverde

Zeven mutaties, elk apart, elke keer eerst met een query op `pg_policy` bevestigd
dat de mutatie er écht in stond. Nulmeting **8 groen** — en dat getal stond er
eerst als 11, een schatting die de securityronde eruit haalde. In een document dat
metingen belooft is dat geen slordigheid maar precies de klasse die dit issue
behandelt.

| | Mutatie | Uitkomst |
|---|---|---|
| H | de `name ~`-regel uit `chatfotos_insert` | 1 rood, met `chatfotos` in de melding |
| I | idem `bewijsfotos_insert` | 1 rood, idem |
| J | idem `avatars_insert` | 1 rood, idem |
| K | idem `chatdocs_insert` | 1 rood, idem |
| L | `chatfotos` uit `VREEMDE_NAAM` | 1 rood op het register, met de naam erin |
| M | de extensielijst verruimen met `pdf` | 3 rood — precies de drie fotoemmers, `chatdocs` groen |
| N | `chatfotos_insert` op `with check (false)` | 2 rood — deze test én de must-allow (ná de reparatie uit §5; daarvóór 1) |

**M is de mutatie die de andere vijf niet dekken.** H t/m K halen de regel wég; M
laat hem staan en maakt hem te ruim. Een test die alleen op afwezigheid let, is
groen op een regex die alles doorlaat.

### ⚠️ Fout 1 — terugzetten met een migratie zette de verkeerde toestand terug

Na K herstelde ik door **0253 opnieuw af te spelen**. Maar 0253 raakt
`chatdocs_insert` niet aan — die regel stond er al sinds 0240. Mutatie K bleef dus
staan, en M meldde **vier** emmers waar er drie hoorden.

De meting was goed; de opstelling niet. Wie alleen had gekeken of er *iets* rood
werd, had dit niet gezien. Dat is precies waarom `CLAUDE.md` sinds QS8-412 vraagt
te kijken **wélke** test omvalt.

### ⚠️⚠️ Fout 2 — en de reparatie daarvan was de klasse van onwrikbare regel 20

Om `chatdocs_insert` terug te krijgen speelde ik **0240 opnieuw af**. Dat is
dezelfde vergissing een laag dieper: **0250 komt ná 0240 en raakt hetzelfde**, dus
die herhaling zette een látere wijziging terug.

📏 Gevolg: twee tests die met deze suite niets te maken hebben vielen om —
`chatdocbucket.test.ts > houdt een wees weg bij een groepsgenoot` en
`een-document-is-wat-het-zegt.test.ts > haalt bij een vertrekker de naam mee weg`,
beide `expected '1' to be '0'`. Na een verse opbouw: 59 groen.

**De enige veilige manier om na een mutatie terug te komen is
`scripts/lokale-stack.sh` opnieuw draaien.** *"Idempotent"* betekent idempotent
tegen de toestand waarvoor de migratie geschreven is, niet tegen die van vandaag —
en een migratie als herstelknop gebruiken is precies de klasse waar dat besluit
over gaat. Dat stond in `CLAUDE.md` bij regel 20 en ik heb er hier zelf tegenaan
gelopen, twee keer op één ronde.

## 7. Wat er niet is aangeraakt

- **De diepte van `avatars`.** Die policy toetst `(storage.foldername(name))[1] =
  auth.uid()` zonder `array_length(...) = 1`, dus `<uid>/a/b.jpg` mag. Dat is geen
  gat — het blijft de eigen map van de uploader — en het pinnen ervan is een eigen
  besluit met zijn eigen regressierisico op objecten die er al staan.
- **De bytes.** De extensie is een naam en geen inhoud. Dat de emmer ook op
  `allowed_mime_types` toetst is de andere helft, en die staat aan de servicekant.
- **Toepassen op productie.** Dit is DDL op `storage.objects` en die tabel is van
  `supabase_storage_admin`: een bouwsessie krijgt `42501`. 0253 sluit aan op de
  reeks die al op Quintens machine wacht.
