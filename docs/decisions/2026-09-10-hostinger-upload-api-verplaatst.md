# De Hostinger-deploy-API verhuisde, en de teardown viel op Windows om

**Datum:** 10-09-2026
**Aanleiding:** `npm run deploy` brak af met HTTP 404 op het opvragen van de
upload-URL, gevolgd door een libuv-assertie-crash op Windows.
**Raakt:** `scripts/deploy-web.mjs` (`upload()`, `zetLive()`, `fail()`, het
entrypoint).

## 1. De twee endpoints zijn verplaatst

De deploy leunt op twee Hostinger-API-routes, en beide zijn gewijzigd. De oude
paden gaven `404 — "route could not be found"`:

| Stap | Oud (404) | Nu |
|---|---|---|
| Upload-URL | `POST …/websites/{gebruiker}/{domein}/upload-url` | `POST /api/hosting/v1/files/upload-urls` |
| Live zetten | `POST …/websites/{gebruiker}/{domein}/static-deploy` | `POST /api/hosting/v1/accounts/{gebruiker}/websites/{domein}/deploy` |

De upload-URL draagt gebruiker en domein nu in de **body** (`{username, domain}`)
in plaats van in het pad. Het antwoord is onveranderd —
`{url, auth_key, rest_auth_key}`, waarbij `url` een TUS-endpoint is — dus de
resumable upload (POST aanmaken + PATCH schrijven) bleef gelijk. Het deploy-pad
verhuisde onder `accounts` en heet nu `deploy`; de body (`{archive_path}`) bleef
gelijk.

Empirisch bevestigd tegen de echte API met het projecttoken: het nieuwe
upload-endpoint gaf `HTTP 200` met de verwachte sleutels. Het deploy-endpoint is
end-to-end geverifieerd door een echte, idempotente her-deploy van dezelfde
bundel.

⚠️ **Waarom hardcoded en niet ontdekt.** De routes staan als letterlijke string
in het script. Dat is precies wat nu omviel toen Hostinger ze verplaatste. Er is
geen goedkope manier om ze te ontdekken zonder een extra dependency; de afweging
is bewust een luide 404 met de nieuwe route in het commentaar erbij, zodat de
volgende verhuizing in één blik te repareren is.

## 2. De teardown mag niet `process.exit()` met open sockets

Ná de 404 crashte het proces op Windows met
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c`.
Dat is dezelfde vierde Windows-kwestie die in
`2026-08-31-de-poort-draaide-niet-op-windows.md` als open genoteerd stond.

De oorzaak: `fail()` riep `process.exit(1)` aan, en `upload()`/`zetLive()` falen
ná een `fetch`. `fetch` (undici) houdt daarna keep-alive-sockets open; op Windows
zijn dat de open async-handles waarop `process.exit()` de assertie geeft. De
melding aan de lezer was dus correct, maar het proces sloot af met een crash in
plaats van een nette exitcode.

**Fix:** `fail()` wérpt nu een `DeployAfgebroken` in plaats van `process.exit()`
aan te roepen; `controleerPwa()` (die óók ná fetches draait) idem. Het entrypoint
vangt die worp, zet `process.exitCode = 1` en doet verder niets — de event loop
loopt leeg, de sockets sluiten zichzelf, en het proces eindigt schoon met de
juiste code.

⚠️ **De pré-netwerk stops blijven `process.exit()`.** De secret-scan, de
source-map-controle en de DSN-controle breken af vóórdat er één socket
opengegaan is. Daar valt niets te draineren, en een onmiddellijke harde stop is
daar juist gewenst: dat zijn de veiligheidsstappen die met opzet niets verder
laten gebeuren. Twee patronen naast elkaar, elk waar het hoort.

## Niet opgelost — open

De `--source-maps external`-build en de Sentry-CLI-stap zijn niet aangeraakt;
die slaan zichzelf al netjes over zonder `SENTRY_ORG`/`SENTRY_PROJECT`. Of de
oude 404-routes op andere Hostinger-plannen (agency) nog bestaan is niet
onderzocht — dit project draait op één account en één subdomein.
