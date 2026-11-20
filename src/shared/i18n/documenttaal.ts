/**
 * Het `lang`-attribuut van het document volgt de taal van de app — QS8-741.
 *
 * ⚠️ **Waarom dit er is.** `app/+html.tsx` zet `<html lang="nl">` vast voor elke
 *    geëxporteerde pagina. Een Engelstalige gebruiker kreeg daardoor Engelse tekst
 *    onder een Nederlands taalattribuut, en een schermlezer kiest zijn stem op dat
 *    attribuut: Engels met een Nederlandse stem. 📏 Gemeten op een lokale export
 *    (19-11-2026): bij een client `en-US` was `document.documentElement.lang` `nl`.
 *
 * ⚠️ **Alleen als er een document is.** Op de server (tijdens `expo export`) en op
 *    native bestaat `globalThis.document` niet; daar doet dit niets. `+html.tsx`
 *    blijft op `nl` staan als standaard, want de prerender is sinds QS8-740
 *    neutraal en tekent geen taalafhankelijke tekst.
 *
 * ⚠️ **Het attribuut staat buiten de React-boom** (de `<html>` is geen onderdeel
 *    van wat de client hydrateert), dus het wijzigen ervan kan geen #418 geven.
 *
 * ⚠️ **Een pure functie zonder React.** De taal is procesbreed en geen state
 *    (zie `index.ts`); wie het attribuut wil bijwerken, doet dat op hetzelfde
 *    moment als de taal verandert, in `zetTaal()` en `zetTaalUitApparaat()`.
 */
export function zetDocumentTaal(taal: string): void {
  const document = (globalThis as { document?: { documentElement?: { lang: string } } }).document;
  const wortel = document?.documentElement;

  if (wortel === undefined) return;
  if (wortel.lang !== taal) wortel.lang = taal;
}
