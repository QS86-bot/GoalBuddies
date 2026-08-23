/**
 * De service worker die web-pushmeldingen ontvangt — QS8-114.
 *
 * ⚠️ Dit bestand valt buiten typecheck, lint en de bundler: het staat in
 *    `public/` en wordt ongewijzigd naar `dist/` gekopieerd. Gewoon JavaScript
 *    dus, geen TypeScript en geen imports.
 *
 * ⚠️ **Domeinregel 7.** Deze worker toont uitsluitend wat er in de payload zit
 *    en haalt nóóit iets op. Twee redenen, en de tweede is de belangrijkste:
 *    een `fetch` hiervandaan draait zonder sessie en zou toch niets nuttigs
 *    terugkrijgen, maar bovenal is een melding een kopie die de autorisatie
 *    overleeft waaronder hij gemaakt is. Wat de server besloot te sturen is wat
 *    er staat; hier wordt niets aangevuld.
 *
 * ⚠️ Geen emoji in de tekst (CLAUDE.md, 22-08). De payload komt uit
 *    `regels.ts` en die bevat er geen.
 */

/* global clients */

self.addEventListener('push', (event) => {
  event.waitUntil(toonMelding(event.data));
});

async function toonMelding(data) {
  const bericht = leesBericht(data);

  // ⚠️ Een push zonder bruikbare inhoud mag niet in een lege melding eindigen,
  //    maar hem negeren mag ook niet: sommige browsers trekken de
  //    push-toestemming in als een worker een bericht ontvangt zonder iets te
  //    tonen. Vandaar een neutrale tekst die niets prijsgeeft.
  await self.registration.showNotification(bericht.titel, {
    body: bericht.body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    // Meldingen over hetzelfde onderwerp vervangen elkaar in plaats van te
    // stapelen. Vier ongelezen nudges is drie te veel.
    tag: bericht.soort,
    data: { pad: bericht.pad },
  });
}

function leesBericht(data) {
  const leeg = {
    titel: 'GoalBuddies',
    body: 'Er staat iets voor je klaar.',
    pad: '/',
    soort: 'algemeen',
  };

  if (!data) return leeg;

  try {
    const inhoud = data.json();
    return {
      titel: typeof inhoud.titel === 'string' && inhoud.titel !== '' ? inhoud.titel : leeg.titel,
      body: typeof inhoud.body === 'string' && inhoud.body !== '' ? inhoud.body : leeg.body,
      pad: typeof inhoud.pad === 'string' && inhoud.pad.startsWith('/') ? inhoud.pad : leeg.pad,
      soort: typeof inhoud.soort === 'string' && inhoud.soort !== '' ? inhoud.soort : leeg.soort,
    };
  } catch {
    // ⚠️ Geen lege catch (coderegel 14): de payload was geen JSON, en dan is de
    //    neutrale melding het juiste antwoord. Niets tonen is het verkeerde.
    return leeg;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openPad(event.notification.data && event.notification.data.pad));
});

/**
 * ⚠️ Een bestaand venster hergebruiken en niet blind een nieuw tabblad openen.
 *    Anders staat er na drie meldingen drie keer dezelfde app open, elk met een
 *    eigen sessie en een eigen realtime-abonnement.
 */
async function openPad(pad) {
  // ⚠️ `startsWith('/')` alléén is niet genoeg, en dat is een echte route naar
  //    buiten: `//evil.com` begint met een schuine streep en is voor de browser
  //    een protocol-relatieve URL. `clients.openWindow('//evil.com')` opent dan
  //    gewoon `https://evil.com` — een melding van GoalBuddies die op een
  //    vreemde site uitkomt. `venster.navigate()` is per spec al tot dezelfde
  //    origin beperkt, maar `openWindow()` is dat niet.
  const veilig = typeof pad === 'string' && pad.startsWith('/') && !pad.startsWith('//');
  const doel = veilig ? pad : '/';
  const vensters = await clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const venster of vensters) {
    if ('focus' in venster) {
      if ('navigate' in venster) await venster.navigate(doel);
      return venster.focus();
    }
  }

  return clients.openWindow(doel);
}
