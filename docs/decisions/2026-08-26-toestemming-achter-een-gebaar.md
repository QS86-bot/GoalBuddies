# Web-pushtoestemming vraag je alleen vanaf een knop

*26-08-2026 — QS8-114 / QS8-124*

De server-kant van web push stond en was uitgerold: `webpush-crypto.ts`,
`public/sw.js` en de Edge Function `notificaties`. De keten kón sturen, maar
niets abonneerde een browser — geen enkele plek riep `serviceWorker.register()`
of `pushManager.subscribe()` aan, en `EXPO_PUBLIC_VAPID_PUBLIC_KEY` werd nergens
gelezen. Expo bakt alleen een `EXPO_PUBLIC_`-variabele in de bundel die
letterlijk in de code voorkomt, dus zonder die leesregel bestond de sleutel voor
de client niet eens.

Dit document legt de vier keuzes vast die bij het aansluiten van die client-kant
gemaakt zijn. Ze zaten tot vandaag alleen in commentaar in
`src/modules/notifications/webpush-registratie.ts` en `app/(tabs)/profiel.tsx`.
Dat is de plek waar ze thuishoren voor wie de code leest, maar niet de plek waar
je ze terugvindt als je je afvraagt waaróm het zo is.

## 1. De prompt komt nooit uit het opstarten, alleen uit een klik

`Notification.requestPermission()` komt in de hele app precies één keer voor:
in `zetMeldingenAan()`, en die wordt alleen aangeroepen door de knop **Aan** op
het profielscherm.

`maakWebPushBron().haalToken()` — de bron die `app/_layout.tsx` inplugt en die
bij elke start meedraait — vraagt niet alleen géén toestemming, hij abonneert
ook niet. Hij doet `registration.pushManager.getSubscription()` en leest dus
alleen een abonnement dat er al ís; is dat er niet, dan geeft hij `null`.

*Waarom:* `Notification.requestPermission()` hoort uit een echt gebruikersgebaar
te komen. Vraag je het bij het opstarten, dan klikt de gebruiker het weg zonder
te weten waarvoor — en dan staat het recht op `denied`, alleen nog terug te
draaien in de browserinstellingen. Chrome dempt zo'n prompt bovendien en Firefox
blokkeert hem na herhaald wegklikken.

⚠️ **Eén ongevraagde prompt kost je het kanaal permanent.** Dat is geen
stijlkwestie maar een onomkeerbare toestand die je niet zelf kunt herstellen, en
daarom staat deze regel hier en niet alleen in een comment.

## 2. Ontbreekt de sleutel, dan valt er niets om

`clientEnv().vapidPublicKey` is optioneel. Zonder sleutel geeft
`meldingenstand()` de stand `geen-sleutel`, zegt het scherm dat met zoveel
woorden, en draait de rest van de app gewoon door.

*Waarom:* een app die bij het opstarten omvalt omdat er geen meldingen zijn, is
erger dan een app zonder meldingen. Dezelfde gedegradeerde route als `geenPush`
op native.

## 3. Alleen op web een knop

`Meldingen` geeft `null` terug zodra `Platform.OS !== 'web'`. Native wacht op
`expo-notifications` (Q-TODO B4).

*Waarom:* een knop tonen die op dat platform niets doet, is erger dan geen knop.
De gebruiker drukt hem in, er gebeurt niets, en daarna gelooft hij het scherm
niet meer.

## 4. Een mislukte registratie faalt stil, en het scherm vertaalt hem

`registreerWorker()` geeft `null` in plaats van te gooien.

*Waarom:* de meest voorkomende oorzaak is een `/sw.js` die door de SPA-rewrite
als HTML geserveerd wordt (zie `docs/DEPLOY.md`). Dat is een deployfout die de
gebruiker niet kan oplossen, dus hij hoort een begrijpelijke tekst te krijgen en
geen storingsmelding. De aanroeper doet die vertaling.

## Wat hier níét staat

De knop terug — meldingen uitzetten — is een eigen besluit met een eigen
document: `2026-08-26-meldingen-uitzetten.md`.

## Herkomst

De keuzes zijn op 26-08-2026 gemaakt bij het aansluiten van de client-kant. Dit
document is geschreven op dezelfde dag, nadat bleek dat ze nergens buiten de
code vastlagen. Een eerdere versie stond op de vangnetbranch
`wip/werkboom-26-08` en verwees naar `webpush-bron.ts` en `zetWebPushAan()` —
namen uit een implementatie die het niet gehaald heeft. De namen hierboven zijn
die van `webpush-registratie.ts`, zoals main hem heeft.
