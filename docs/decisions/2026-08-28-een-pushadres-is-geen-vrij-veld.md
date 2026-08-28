# Een pushadres is geen vrij veld

**Datum:** 28-08-2026
**Aanleiding:** de controle van 28-08.

## Wat er lag

Bij een webabonnement **ís** `push_tokens.token` de endpoint-URL van de
browserleverancier. `verstuurWebPush()` doet daar elk uur een `fetch()` op,
onder `service_role`, vanuit het Supabase-netwerk.

`registreer_push_token()` toetste voor `platform = 'web'` alleen dát er een
`p256dh` en een `auth` meekwamen. Niets keek naar het adres.

**Gemeten**, als gewone ingelogde gebruiker op de lokale stack:

```
registreer_push_token('http://169.254.169.254/latest/meta-data/', 'web', 'p', 'a')
  → {"ok": true}
opgeslagen als: web | http://169.254.169.254/latest/meta-data/
```

Dat is een SSRF-primitief: de meldingenjob wordt de aanvrager. En omdat 404 en
410 de rij opruimen terwijl elke andere uitkomst hem laat staan, is het
bovendien een orakel — de aanvaller leest via zijn eigen `push_tokens`-SELECT af
of het doel bestond.

⚠️ **Vandaag gebeurde er niets, en dat was het punt.** `stuur()` slaat webtokens
over zolang `vapidUitOmgeving()` `null` geeft. Dit bewapent zichzelf op de dag
dat `VAPID_PRIVATE_KEY` gezet wordt — en dat is blijkens `.env.example` en
QS8-124 het eerstvolgende wapenfeit.

## De vorm van de grendel

**Een allowlist en geen blocklist.** Een blocklist op RFC1918 en
169.254.169.254 laat elke DNS-naam door die naar diezelfde adressen wijst, en
elke cloud-metadatadienst die je niet kent. De verzameling echte pushdiensten is
klein en bekend; de verzameling gevaarlijke adressen is dat niet.

**Twee sloten, want ze zitten op verschillende momenten.** De database toetst bij
het registreren; `verstuurWebPush()` toetst vlak vóór de `fetch()`. Die tweede is
er voor rijen die vóór 0117 zijn opgeslagen en voor een toekomstig tweede
schrijfpad naar `push_tokens`. Een grendel op de plek van de handeling overleeft
allebei.

**`https` verplicht, en geen poort of userinfo.** Web Push kent geen
`http`-endpoints, en zonder die eis is `http://fcm.googleapis.com.aanvaller.test`
een geldige host.

## De naad

Twee sloten betekent twee lijsten, en dus een naad.
`tests/beloftes/pushdienst-allowlist.test.ts` legt de TypeScript-lijst naast de
SQL van 0117. Dat is dezelfde vorm als de CHECK-kopie in `chat-schemas.ts`.

⚠️ **En die test heeft zichzelf onderweg betrapt.** De eerste versie was groen
terwijl ik de `https`-eis met de hand weghaalde. Reden: elk `http`-adres in de
test viel al af op zijn hóst, dus de protocoltoets werd nergens geraakt. Er is
een geval bij gekomen dat álleen daardoor wordt tegengehouden — een échte
pushdienst-host over `http`. Regel 18 vraag 3, op mijn eigen test, en pas
zichtbaar door hem daadwerkelijk te breken in plaats van erover na te denken.

## Wat er bewust níét gebeurt

**Bestaande rijen worden niet opgeschoond.** Er staat er vandaag geen één met
`platform = 'web'` op productie, dus er is niets te wissen — en een `delete` in
een migratie die morgen wél rijen raakt, is precies het soort ding dat je niet
terugdraait. De tweede grendel in `verstuurWebPush()` vangt zo'n rij af zonder
hem te verwijderen.

**De lijst is niet uitputtend.** Vijf hosts en twee achtervoegsels dekken
Chrome/FCM, Firefox, Edge en Safari. Komt er een pushdienst bij, dan moet hij op
twee plekken erbij — en de naadtest wordt rood als je er één vergeet. Dat is de
bedoelde wrijving: een adres toevoegen aan wat je server namens je aanroept, is
geen detail.
