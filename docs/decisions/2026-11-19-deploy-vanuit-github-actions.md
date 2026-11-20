# Deploy vanuit GitHub Actions (QS8-718, 19-11-2026)

Besluit van Quinten (19-11-2026): de webbundel moet ook zonder zijn eigen machine
gedeployd kunnen worden, handmatig te starten vanaf een telefoon. Drie keuzes in
de uitwerking zijn niet vanzelfsprekend.

## 1. De deploy-job draait op Windows

`pakIn()` in `scripts/deploy-web.mjs` pakt in met `powershell` en `Compress-Archive`
over een pad met backslashes. 📏 Gemeten op 19-11-2026 met nepwaarden: een droge run
op Linux liep schoon door build, secret-scan en DSN-controle en stopte op
*Inpakken mislukte*. Het script op Linux laten werken verandert het archief
waarmee de laatste echte deploy slaagde; de runner veranderen niet. Prijs: meer
Actions-minuten en een tragere `npm ci`. De naad is getoetst in
`tests/scripts/deploy-workflow.test.ts`.

## 2. De omgeving `productie` is de grendel op de secrets, niet de workflow

De stap "alleen vanaf main" beschermt niet tegen een gewijzigde workflow op een
andere branch: die draait met de secrets van de repository. Wat dat wel doet is een
omgeving met *Deployment branches* = `main`, en Required reviewers voor wie `echt`
mag starten. Dat zijn instellingen van Quinten en geen code; de workflow noemt
de omgeving en de handleiding zegt wat erin moet.

## 3. De droge run krijgt nooit een secret; een sha moet op de hoofdlijn staan

De droge run draait de hele Expo-build met alle dependencies; die hoeven het
Hostinger-token niet te zien. Hij bouwt met vaste nepwaarden en zegt dat in het
log. Een sha moet op de first-parent-keten van `main` liggen: "voorouder" is te
ruim, want een merge-commit maakt alle tussencommits van een PR tot voorouder,
ook een commit waarin `ci.yml` een eigen groene uitslag vervalste.

## Wat niet gemeten is

De echte Hostinger-verbinding, `Inpakken` op de Windows-runner en de eerste run op
GitHub. Wat blijft liggen staat als ER-rij in de afleverregel van QS8-718.
