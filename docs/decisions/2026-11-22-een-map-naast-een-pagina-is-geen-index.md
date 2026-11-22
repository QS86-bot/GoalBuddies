# Een map naast een pagina is geen index — QS8-789

**Datum:** 22-11-2026 · **Issue:** QS8-789 · **Status:** gebouwd, nog niet uitgerold

## Wat er misging

Direct laden of verversen van `/groep` gaf op productie een 403 van Hostinger in
plaats van de app. 📏 Gemeten op 22-11-2026, uitgelogd, met `curl`:

| Adres | Productie |
|---|---|
| `/groep`, `/doel` | 301 → `/groep/`, `/doel/` |
| `/groep/`, `/doel/`, `/mensen/` | 403 |
| `/groep.html`, `/groep/ontdek`, `/groep/abc-123`, `/doelen` | 200 |

De oorzaak, gemeten aan een verse `expo export --platform web` (48 pagina's,
34 mappen): `groep.html` en een map `groep/` bestaan naast elkaar, en twaalf
andere mappen hebben geen eigen pagina en geen `index.html` (`doel/`, `mensen/`,
`onboarding/`, …). Alleen `instellingen/` en `(tabs)/` hebben een index.

De gegenereerde `.htaccess` liet elke bestaande **map** ongemoeid door
(`-f [OR] -d`). mod_dir stuurde dan door naar het adres mét schuine streep, en
daar gaf `Options -Indexes` een 403.

## Wat er besloten is

1. **De reparatie zit in de generator, niet in de export.** De export hernoemen
   (een route verplaatsen, een `index.tsx` per map toevoegen) zou een
   eigenschap van de bestandsboom van `app/` aan de server koppelen; de
   volgende map naast een tab brengt dan dezelfde fout terug. De regels in
   `htaccessInhoud()` lossen de hele klasse op.
2. **Drie regels, elk met een eigen reden** — de tabel staat in `docs/DEPLOY.md`.
   `DirectorySlash Off` is nodig omdat de 301 op Apache vóór de herschrijving
   komt (gemeten); de streepvorm `/groep/` moet werken omdat de oude 301
   permanent was en browsers dat adres nu zelf vragen.
3. **Een 301 is een bezwaar, niet alleen een 403.** Om dezelfde reden als
   hierboven: een permanente doorverwijzing naar een adres dat kapot kan zijn,
   is de fout in een andere vorm.
4. **De toets meet het antwoord, niet de tekst.** `deploy-htaccess.test.ts`
   toetste de tekst van het bestand en bleef groen terwijl productie 403 gaf.
   `scripts/htaccess-routering.mjs` is een klein model van Apache dat de
   gegenereerde regels uitvoert op een bestandsboom. Het werpt op een directief
   die het niet kent, zodat het nooit stil een ander bestand meet dan de server.
5. **Het model is geijkt tegen echte Apache, niet aangenomen.** 192 adressen uit
   de echte export (ook `/<pagina>/x` en vier met een query), vier varianten van de regels, elk antwoord vergeleken op
   status én geserveerd bestand (met een merkteken per pagina, want veel
   pagina's zijn byte-gelijk). De eerste versie week op 28 adressen af —
   `%{REQUEST_FILENAME}` laat een streep achter een niet-bestaand pad weg — en
   is daarop aangepast.
6. **De 500 op `/<pagina>/x` gaat mee in deze PR.** De code-critic vond dat
   `/doelen/x` in een kringloop van herschrijvingen liep; 📏 gemeten op productie
   (500) en op Apache. Hij was ouder dan QS8-789, maar zat in dezelfde regel die
   hier herschreven werd, en het commitbericht belooft "elk adres geeft een
   pagina". De reparatie is één voorwaarde: het adres moet het einde van
   `%{REQUEST_FILENAME}` zijn. Het model werpt sinds deze ronde ook op een
   onbekende vlag of operator, niet alleen op een onbekend directief.
7. **De deploy meet de echte `dist/` vóór de upload.** De test voedt een vaste
   boom; welke botsingen er zijn hangt af van de routes van de dag. Een bezwaar
   stopt de deploy, net als de geheimenscan.

## Wat een aanname blijft

- **Dat Hostinger zich gedraagt als Apache 2.4.** De respons komt van `hcdn`; wat
  erachter draait is niet gemeten. Ondersteunt de server `DirectorySlash` niet,
  dan geeft `/groep` nog een 301 maar `/groep/` daarna de app (het model en de
  test met die variant zeggen dat). Nameten na de uitrol staat in
  `docs/DEPLOY.md`.
- **Geen apart `*:controle`-script.** De belofte hangt aan de deploy (die bouwt)
  en aan een unit-toets (die in elke poort en elke CI-run draait). Een controle
  die een `dist/` vraagt zou in CI op ongemeten staan, net als
  `prerender:controle`.
