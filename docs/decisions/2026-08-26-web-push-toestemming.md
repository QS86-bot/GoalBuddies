# Web-push aan de client-kant: toestemming achter een gebaar

**Datum:** 26-08-2026
**Aanleiding:** de server-kant van web-push (Edge Function, VAPID-secrets, crypto)
stond en was gedeployd, maar er was geen client die een browser abonneerde.
**Issue:** QS8-114
**Bestanden:** `src/modules/notifications/webpush-bron.ts`, `app/_layout.tsx`,
`app/(tabs)/profiel.tsx`, `src/lib/env.ts`, `src/shared/pwa/index.ts`

## Wat er ontbrak

`webpush-crypto.ts` (versleuteling), `public/sw.js` (de ontvanger) en de Edge
Function `notificaties` waren af. De keten kón sturen, maar niets abonneerde een
browser: geen enkele plek riep `serviceWorker.register` of
`pushManager.subscribe` aan, en `EXPO_PUBLIC_VAPID_PUBLIC_KEY` werd nergens
gelezen — dus bakte Expo hem niet eens in de bundel. Push wérkte dus niet, ook
al stond alles eromheen.

## De beslissingen

### 1. Toestemming vraag je nooit bij het opstarten, alleen vanaf een knop

`webPushBron.haalToken()` abonneert alléén als `Notification.permission` al
`granted` is. Het vraagt zelf nooit toestemming. Het verzoek zit op het
profielscherm, achter de knop "Aan" (`zetWebPushAan`).

*Waarom:* een permissieprompt zonder gebruikersgebaar wordt door browsers
afgestraft — Chrome toont hem gedempt, Firefox blokkeert na herhaald wegklikken —
en een prompt bij een koude start komt zonder enige context. Zou de bron zelf
vragen, dan kreeg elke ingelogde gebruiker bij de eerste render een prompt die
hij wegklikt, en daarna is de weg naar meldingen dicht.

Gevolg dat klopt: wie eerder ja zei, wordt bij elke start opnieuw geabonneerd via
`Pushwacht` in `_layout` (endpoints verlopen; opnieuw abonneren is goedkoop). Wie
nog niets koos, merkt niets tot hij de knop indrukt.

### 2. De publieke sleutel is optioneel in de config

`vapidPublicKey` staat als `.optional()` in `clientEnv()`. Ontbreekt hij, dan
meldt de bron dat via `reportError` en geeft `null` — dezelfde gedegradeerde weg
als `geenPush`. Een ontbrekende sleutel mag de app niet laten omvallen bij het
opstarten; een app zonder meldingen is beter dan een witte pagina.

### 3. Op de iPhone eerst installeren, dan pas de knop

Safari op iOS levert web-push uitsluitend aan een PWA op het beginscherm. Zolang
de app in een gewoon tabblad draait, toont de meldingenkaart het installatie-
advies uit `installatie.ts` (QS8-117) in plaats van een knop die toch niets doet.
Dat is precies de plek waar dat advies volgens dat bestand thuishoort: "bij het
aanzetten van meldingen", niet als banner op elk scherm.

### 4. Alleen de publieke helft in de webbuild

`.env` bevat op de client uitsluitend `EXPO_PUBLIC_VAPID_PUBLIC_KEY`. De
privésleutel en `VAPID_SUBJECT` staan alleen als Supabase-secret op de Edge
Function. Er is geen secret-scan die dit afvangt (zie `docs/ENGINEER-REVIEW.md`);
het `EXPO_PUBLIC_`-voorvoegsel is de hele bescherming.

## Wat hierna nog moet

- **Uploaden naar Hostinger.** `npm run build` bakt de sleutel nu wél in (env.ts
  leest hem), maar de herhaalbare deploy (QS8-100) staat nog open; de upload is
  handwerk.
- **Native.** `expo-notifications` is er nog niet (Q-TODO B4). De datalaag en de
  `PushBron`-rand staan klaar; het is één extra `zetPushBron(...)` zodra de
  dependency mag.
- **Einde-tot-einde test op productie:** abonneren in een echte browser, een
  melding sturen via `notificaties`, en controleren dat `sw.js` hem toont.
