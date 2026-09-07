# De uitslag die er niet was

**07-09-2026.** QS8-318. Geen migratie — een regel in `.github/workflows/ci.yml`
en een controle eronder.

## De vraag

Twee PR's kunnen hetzelfde migratienummer dragen. Op 07-09 gebeurde dat: #260
landde `0182_het_dagquotum_telt_cent_en_niet_jobs.sql`, #261 landde acht seconden
later `0182_het_oppervlak_van_de_getuige_volgt_de_groepsband.sql`. Git zag geen
conflict — twee verschillende bestandsnamen in dezelfde map — en beide PR's waren
groen.

Het issue stelde dat geen enkele grendel dit ving. **Dat bleek onjuist zodra het
gemeten werd**, en die meting is de hele beslissing.

## 📏 Wat er werkelijk gebeurde

`ci.yml` draait op `push: branches: ['**']`, en dat dekt `main`. De post-merge
controle bestaat dus al en draait al. De runs op `main` in dat venster:

```
09:07:34  #259  run 1247  CANCELLED
09:07:46  #260  run 1248  CANCELLED   <- de eerste 0182 landt hier
09:07:54  #261  run 1249  FAILURE     <- de tweede; main wordt rood
```

`migraties:controle` maakte `main` rood **binnen drie minuten**. De grendel deed
precies wat hij hoort te doen.

Wat er ontbrak is de run over de commit ertússen. Die is afgebroken door

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

📏 Van de 24 `main`-runs van die dag zijn er **vijf** zo afgebroken. Op een
featurebranch is dat gedrag juist: een nieuwe push maakt de vorige commit
achterhaald, en de uitslag van een verouderde commit zegt niets. Op `main` niet.
Daar is elke commit een toestand die uitgerold wordt, en **een afgebroken run
laat die toestand zonder uitslag achter — niet groen, niet rood, er niet.**

Juist bij snel achter elkaar mergen verdwijnen die uitslagen, en dat is precies
het venster waarin twee migraties hetzelfde nummer kunnen dragen. De kans dat de
uitslag ontbreekt en de kans dat er iets te melden valt, pieken samen.

## De vier richtingen, gewogen

| Richting | Oordeel |
|---|---|
| **1. `Require branches to be up to date before merging`** | Sluit het venster volledig, maar is een repository-instelling (Quintens hand) en kost een extra CI-ronde per PR. Bij het tempo van vandaag — zeven merges in twee uur — is dat niet gratis. **Blijft beschikbaar, niet nu.** |
| **2. Een controle die ná de merge op `main` draait** | ✅ **Bestaat al en werkt al** (run 1249). Wat ontbrak was niet de controle maar zijn uitslag. |
| **3. Hernummeren als laatste handeling vóór de merge** | Werkt alleen als iemand het draait, en dat is precies de "je moet eraan denken" die dit project stelselmatig vervangt door een meter. Afgewezen als grendel; blijft nuttig als gewoonte. |
| **4. Accepteren als werkwijze — wie als tweede merget, hernummert** | ✅ **Gekozen**, want dat is feitelijk wat er gebeurt en het werkt, *mits* de melding betrouwbaar aankomt. Het issue eiste er terecht twee dingen bij: het moet in `CLAUDE.md` staan, en er moet een controle zijn die het ná de merge meldt. |

**Het besluit is dus 4 + 2, met één reparatie die in geen van de vier stond:**
`cancel-in-progress` mag op `main` niet gelden.

```yaml
cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

De besparing op featurebranches blijft; `main` krijgt altijd een uitslag.

## Regel 18, expliciet

1. **Waar knopen twee correcte onderdelen aan elkaar?** `migratie:nieuw` deelt
   een vrij nummer uit — correct op dát moment. `migraties:controle` toetst de
   map — correct op díé branch. De naad is de **merge**: het moment waarop twee
   mappen er één worden, en dat moment is van geen van beide. De post-merge run
   is de enige die er staat, en die kon worden afgebroken.
2. **Toetst de test de belofte of het onderdeel?** De belofte is *"een toestand
   van `main` krijgt altijd een uitslag"*. Daarom toetst de controle de
   `concurrency`-regel en niet of `migraties:controle` werkt — dat laatste is het
   onderdeel en heeft zijn eigen ijking.
3. **Kan de test groen blijven terwijl de belofte breekt?** Nagemeten met drie
   mutaties, elk met een `grep` als bewijs dát de mutatie in het bestand stond —
   zie hieronder. Dat laatste is geen overdaad: op 07-09 bleef een mutatie elders
   groen omdat de bewerking het bestand nooit geraakt had.
4. **Grijpt de test naar een plek in plaats van naar de belofte?** Deels
   onvermijdelijk: de belofte *ís* een regel in een YAML-bestand. Daarom leest de
   controle alle workflows in `.github/workflows/` en niet alleen `ci.yml`, en
   daarom is er een kanarie die faalt zodra `ci.yml` niet meer als
   `main`-workflow herkend wordt.
5. **Is de keten onderbroken terwijl elk schakeltje af is?** Ja, en dat wás het
   geval: uitdelen ✓, toetsen ✓, melden ✓, uitslag ✗.
6. **Tilt dit een aanname van "één" naar "meer dan één"?** Ja — van één sessie
   naar twee. Het venster bestond altijd; het werd pas zichtbaar toen er parallel
   gewerkt werd.

## De ijking

Drie mutaties, elk met `grep`-bewijs vooraf:

| Mutatie | Uitslag |
|---|---|
| `cancel-in-progress` terug op `true` | controle exit 1; 1 test rood (de echte workflows) |
| een expressie die `main` niet noemt | controle exit 1 |
| `breektMainAf('true')` naar `false` | 1 test rood (de unittest die hem noemt) |

Daarna hersteld: controle groen, 16 van de 16 tests groen.

⚠️ **De derde mutatie is die op de grendel zélf en niet op het bewaakte
bestand.** Zonder die zou de controle nog steeds groen zijn met een kapotte
`breektMainAf`, en dan bewaakt hij niets.

⚠️ **De must-allows zijn hier de helft van het werk.** `notificaties.yml` en
`rollover.yml` dragen `cancel-in-progress: false` en zijn geplande jobs die
`main` niet raken; een controle die élke `cancel-in-progress` afkeurt, meldt die
twee mee en leert je hem te negeren. Zes van de zestien tests zijn must-allows.

## Wat dit niet oplost

Het venster tussen de laatste groene CI en de merge is er nog. Twee PR's kunnen
nog steeds hetzelfde nummer dragen; wat verandert is dat `main` het **altijd**
meldt in plaats van meestal. Wie als tweede merget, hernummert — en dat staat nu
in `CLAUDE.md` in plaats van in de gewoonte van wie het toevallig ziet.

Wil je het venster écht dicht, dan is richting 1 de enige die dat doet, en die
vraagt Quintens hand: **Settings → Branches → `main` → Require branches to be up
to date before merging**. De prijs is een extra CI-ronde per PR.
