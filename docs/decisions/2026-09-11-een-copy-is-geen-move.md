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

Wat dat sluit en wat niet:

| Richting | Stand na 0253 |
|---|---|
| een `.pdf`-naam in `chatfotos`, `bewijsfotos` of `avatars` | dicht |
| een beeldnaam in `chatdocs` | dicht (al sinds 0240) |
| `bewijsfotos` → `chatfotos`, beide `{jpeg,png,webp}` | **open** |

⚠️ **Die laatste rij is met opzet niet weggeschreven.** Hij is geen
rechtenverhoging: wie de bron mag lezen heeft die bytes al en had ze kunnen
downloaden en heruploaden — dezelfde klasse als een schermafdruk. Wat er wél aan
verandert is dat het in één hop gaat en dat `keurChatfoto()` daarbij nooit gedraaid
heeft. De enige plek waar dat te sluiten is, is het `copy`-eindpunt aan de
servicelaag, en dat is een dashboardkeuze en geen migratie. Het staat als rij van
11-09 in `docs/ENGINEER-REVIEW.md`, met de voorwaarde waaronder hij zwaarder wordt.

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

## 6. De ijking, en twee fouten die zij zelf opleverde

Zes mutaties, elk apart, elke keer eerst met een query op `pg_policy` bevestigd dat
de mutatie er écht in stond. Nulmeting 8 groen.

| | Mutatie | Uitkomst |
|---|---|---|
| H | de `name ~`-regel uit `chatfotos_insert` | 1 rood, met `chatfotos` in de melding |
| I | idem `bewijsfotos_insert` | 1 rood, idem |
| J | idem `avatars_insert` | 1 rood, idem |
| K | idem `chatdocs_insert` | 1 rood, idem |
| L | `chatfotos` uit `VREEMDE_NAAM` | 1 rood op het register, met de naam erin |
| M | de extensielijst verruimen met `pdf` | 3 rood — precies de drie fotoemmers, `chatdocs` groen |

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
